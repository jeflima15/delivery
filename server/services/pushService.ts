import crypto from 'node:crypto';
import type mongoose from 'mongoose';
import { z } from 'zod';
import PushDevice from '../models/PushDevice.js';
import PushJob from '../models/PushJob.js';
import TenantMembership from '../models/TenantMembership.js';
import AdminAccount from '../models/AdminAccount.js';
import Tenant from '../models/Tenant.js';
import Order from '../../src/models/Order.js';
import { rolePermissions, type TenantRole } from '../domain/permissions.js';

// Only vendor-owned push endpoints are allowed: subscriptions are untrusted input.
export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
      && (url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com'
        || url.hostname === 'web.push.apple.com' || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname));
  } catch { return false; }
}
const encodedKey = (length: number) => z.string().regex(/^[A-Za-z0-9_-]+$/).max(200).refine((value) => Buffer.from(value, 'base64url').length === length);
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(4096).refine(isPushEndpoint),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: encodedKey(65).refine((value) => {
    try { crypto.ECDH.convertKey(Buffer.from(value, 'base64url'), 'prime256v1'); return true; } catch { return false; }
  }), auth: encodedKey(16) }).strict(),
}).strict();
export const endpointHash = (endpoint: string) => crypto.createHash('sha256').update(endpoint).digest('hex');

export function pushConfig() {
  const { PUSH_VAPID_PUBLIC_KEY: publicKey, PUSH_VAPID_PRIVATE_KEY: privateKey, PUSH_VAPID_SUBJECT: subject } = process.env;
  if (!publicKey || !privateKey || !subject || !/^(mailto:|https:\/\/)/.test(subject)) return null;
  try {
    const key = crypto.createECDH('prime256v1');
    key.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    if (key.getPublicKey().toString('base64url') !== publicKey) return null;
    return { publicKey, privateKey, subject };
  } catch { return null; }
}

export async function sendPush(device: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: Record<string, unknown>, topic: string) {
  const config = pushConfig();
  if (!config || !isPushEndpoint(device.endpoint)) throw new Error('PUSH_NOT_CONFIGURED');
  const { default: webpush } = await import('web-push');
  return webpush.sendNotification({ endpoint: device.endpoint, keys: device.keys }, JSON.stringify(payload), {
    vapidDetails: config, TTL: 86400, urgency: 'high', topic, timeout: 3000,
  });
}

export async function enqueueOrderPush(tenantId: mongoose.Types.ObjectId, orderId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  if (!pushConfig()) return;
  const devices = await PushDevice.find({ tenantId, enabled: true }).select('_id accountId').session(session).lean();
  if (devices.length) await PushJob.insertMany(devices.map((device) => ({ tenantId, orderId, deviceId: device._id, accountId: device.accountId, expiresAt: new Date(Date.now() + 86400000) })), { session });
}

export async function processPushJobs(filter: { tenantId?: unknown; orderId?: unknown } = {}, limit = 10) {
  if (!pushConfig()) return { processed: 0 };
  let processed = 0;
  const deadline = Date.now() + 9000;
  while (processed < limit && Date.now() < deadline) {
    const job = await PushJob.findOneAndUpdate({ ...filter, state: 'pending', nextAttemptAt: { $lte: new Date() }, leaseUntil: { $lte: new Date() } },
      { $set: { leaseUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } }, { sort: { nextAttemptAt: 1 }, returnDocument: 'after' }).lean();
    if (!job) break;
    processed++;
    try {
      const device = await PushDevice.findOne({ _id: job.deviceId, tenantId: job.tenantId, accountId: job.accountId, enabled: true }).select('+endpoint +keys').lean();
      const membership = device && await TenantMembership.findOne({ tenantId: job.tenantId, accountId: device.accountId, active: true }).lean();
      const account = membership && await AdminAccount.findOne({ _id: device!.accountId, active: true }).select('_id').lean();
      const tenant = await Tenant.findOne({ _id: job.tenantId, status: { $nin: ['suspended', 'cancelled', 'archived'] } }).select('slug').lean();
      const order = await Order.findOne({ _id: job.orderId, tenantId: job.tenantId }).select('status preorder').lean();
      if (!device || !account || !membership || !rolePermissions[membership.role as TenantRole]?.includes('orders:read') || !tenant || !order || order.status !== 'Pendente' || new Date(job.expiresAt).getTime() <= Date.now()) {
        await PushJob.updateOne({ _id: job._id }, { $set: { state: 'skipped' } }); continue;
      }
      await sendPush(device as any, { title: 'Pode Vir', body: order.preorder ? 'Nova encomenda. Abra o painel para conferir.' : 'Novo pedido. Abra o painel para conferir.',
        url: `/${encodeURIComponent(tenant.slug)}/admin/pedidos?order=${job.orderId}`, tag: `order-${job.orderId}` }, String(job.orderId));
      await PushJob.updateOne({ _id: job._id }, { $set: { state: 'accepted', lastError: '' } });
      await PushDevice.updateOne({ _id: device._id }, { $set: { lastAcceptedAt: new Date(), lastError: '' } });
    } catch (error) {
      const code = Number((error as { statusCode?: number }).statusCode || 0);
      const expired = code === 404 || code === 410;
      const retryable = !code || code === 429 || code >= 500;
      const message = expired ? 'Inscrição expirada. Ative novamente neste aparelho.' : 'Não foi possível enviar um aviso. Confira a configuração e teste novamente.';
      await PushDevice.updateOne({ _id: job.deviceId }, { $set: { lastError: message, ...(expired ? { enabled: false } : {}) } });
      await PushJob.updateOne({ _id: job._id }, { $set: { state: retryable && job.attempts < 5 ? 'pending' : 'failed', lastError: message,
        leaseUntil: new Date(0), nextAttemptAt: new Date(Date.now() + (job.attempts === 1 ? 1000 : Math.min(3600000, 60000 * 2 ** job.attempts))) } });
      if (retryable && job.attempts === 1 && Date.now() + 4500 < deadline) await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }
  return { processed };
}
