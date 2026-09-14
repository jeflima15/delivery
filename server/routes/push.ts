import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { validateBody } from '../middleware/validate.js';
import { securityRateLimit } from '../middleware/rateLimit.js';
import PushDevice from '../models/PushDevice.js';
import PushJob from '../models/PushJob.js';
import { endpointHash, pushConfig, pushSubscriptionSchema, sendPush } from '../services/pushService.js';

const router = Router({ mergeParams: true });
router.use(requirePermission('orders:read'));
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.get('/', asyncRoute(async (req, res) => {
  const devices = await PushDevice.find({ tenantId: req.tenant!._id, accountId: req.auth!.accountId }).select('name enabled endpointHash lastAcceptedAt lastError createdAt').sort({ createdAt: -1 }).lean();
  const pending = await PushJob.countDocuments({ tenantId: req.tenant!._id, accountId: req.auth!.accountId, state: 'pending' });
  res.json({ success: true, publicKey: pushConfig()?.publicKey || null, devices, pending });
}));
router.use(requireCsrf, securityRateLimit({ namespace: 'push-config', limit: 30, windowMs: 60000 }));
router.post('/', validateBody(z.object({ subscription: pushSubscriptionSchema, name: z.string().trim().min(1).max(60) }).strict()), asyncRoute(async (req, res) => {
  if (!pushConfig()) throw new HttpError(503, 'Os avisos ainda precisam ser configurados pela plataforma.', 'PUSH_NOT_CONFIGURED');
  if (req.auth!.impersonatedBy) throw new HttpError(403, 'Entre com sua própria conta para ativar avisos.', 'FORBIDDEN');
  const { subscription, name } = req.body;
  const hash = endpointHash(subscription.endpoint);
  const existing = await PushDevice.findOne({ tenantId: req.tenant!._id, endpointHash: hash }).lean();
  if (existing && String(existing.accountId) !== String(req.auth!.accountId)) throw new HttpError(409, 'Este navegador está vinculado a outra conta. Desative os avisos nessa conta antes de trocar.', 'PUSH_DEVICE_CONFLICT');
  if (!existing && await PushDevice.countDocuments({ tenantId: req.tenant!._id, accountId: req.auth!.accountId }) >= 10) throw new HttpError(409, 'Remova um aparelho antigo antes de adicionar outro (limite: 10).', 'PUSH_DEVICE_LIMIT');
  const device = await PushDevice.findOneAndUpdate({ tenantId: req.tenant!._id, endpointHash: hash, accountId: req.auth!.accountId },
    { $set: { endpoint: subscription.endpoint, keys: subscription.keys, name, enabled: true, lastError: '' } }, { upsert: true, returnDocument: 'after' });
  res.json({ success: true, id: device._id });
}));
router.delete('/:id', asyncRoute(async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(String(req.params.id))) throw new HttpError(404, 'Aparelho não encontrado.', 'NOT_FOUND');
  await PushDevice.deleteOne({ _id: req.params.id, tenantId: req.tenant!._id, accountId: req.auth!.accountId });
  res.json({ success: true });
}));
router.post('/:id/test', asyncRoute(async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(String(req.params.id))) throw new HttpError(404, 'Aparelho não encontrado.', 'NOT_FOUND');
  const device = await PushDevice.findOne({ _id: req.params.id, tenantId: req.tenant!._id, accountId: req.auth!.accountId, enabled: true }).select('+endpoint +keys').lean();
  if (!device) throw new HttpError(404, 'Ative os avisos neste aparelho primeiro.', 'NOT_FOUND');
  try {
    const id = crypto.randomBytes(12).toString('hex');
    await sendPush(device as any, { title: 'Pode Vir', body: 'Aviso de teste. Se você está lendo esta notificação, os avisos chegaram neste aparelho.', tag: `test-${id}`, url: `/${encodeURIComponent(req.tenant!.slug)}/admin` }, id);
    await PushDevice.updateOne({ _id: device._id }, { $set: { lastAcceptedAt: new Date(), lastError: '' } });
    res.json({ success: true });
  } catch (error) {
    const expired = [404, 410].includes(Number((error as { statusCode?: number }).statusCode));
    await PushDevice.updateOne({ _id: device._id }, { $set: { lastError: 'O teste falhou. Ative novamente ou procure o suporte.', ...(expired ? { enabled: false } : {}) } });
    throw new HttpError(502, 'O teste não pôde ser enviado. Tente ativar os avisos novamente.', 'PUSH_FAILED');
  }
}));
export default router;
