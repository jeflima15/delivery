import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import Order from '../../src/models/Order.js';
import User from '../../src/models/User.js';
import Subscription from '../models/Subscription.js';
import Invoice from '../models/Invoice.js';
import TenantMembership from '../models/TenantMembership.js';
import AdminAccount from '../models/AdminAccount.js';
import { resolveTenant } from '../middleware/tenant.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import { optionalSession, requireSession, requireTenantMembership, requirePermission } from '../middleware/auth.js';
import { rolePermissions, type TenantRole } from '../domain/permissions.js';
import { requireCsrf } from '../middleware/csrf.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/auditService.js';
import { createTenantUpload } from '../services/storageService.js';
import { createInvitation } from '../services/invitationService.js';
import { assertInvitationDeliveryAvailable, deliverAdminInvitation, adminInvitationAcceptUrl } from '../services/notificationService.js';
import { isProduction, getEnv } from '../config/env.js';
import { computeIsStoreOpen } from '../../src/lib/storeStatus.js';
import tenantOperationsRouter from './tenantOperations.js';

const router = Router({ mergeParams: true });
router.use(resolveTenant);

router.get('/me', optionalSession, asyncRoute(async (req, res) => {
  if (!req.auth || req.auth.accountType !== 'admin' || !req.tenant) {
    return res.json({ success: false });
  }
  const [account, membership, settings] = await Promise.all([
    AdminAccount.findById(req.auth.accountId).select('name email active lastLoginAt').lean(),
    TenantMembership.findOne({ tenantId: req.tenant._id, accountId: req.auth.accountId, active: true }).select('role acceptedAt').lean(),
    StoreSettings.findOne({ tenantId: req.tenant._id }).select('is_open abertura_automatica horarios_funcionamento').lean(),
  ]);
  if (!account?.active || !membership) {
    return res.json({ success: false });
  }

  const rawOnboarding = (req.tenant as any).onboarding;
  let onboarding = { completed: false, step: 'welcome' };
  if (rawOnboarding && typeof rawOnboarding.completed === 'boolean') {
    onboarding = { completed: rawOnboarding.completed, step: rawOnboarding.step || 'welcome' };
  } else {
    const productsCount = await Order.countDocuments({ tenantId: req.tenant._id });
    if ((req.tenant as any).status !== 'onboarding' || productsCount > 0) {
      onboarding = { completed: true, step: 'complete' };
    }
  }

  const role = membership.role as TenantRole;
  res.json({
    success: true,
    account: { id: account._id, name: account.name, email: account.email, lastLoginAt: account.lastLoginAt, impersonatedBy: req.auth?.impersonatedBy },
    tenant: {
      id: req.tenant._id,
      slug: req.tenant.slug,
      name: req.tenant.displayName,
      status: (req.tenant as any).status,
      isOpen: computeIsStoreOpen(settings),
      manualIsOpen: Boolean(settings?.is_open),
      isAutomatic: Boolean(settings?.abertura_automatica),
      onboarding,
    },
    membership: { role: membership.role, acceptedAt: membership.acceptedAt },
    permissions: rolePermissions[role],
  });
}));

router.use(requireSession, requireTenantMembership);
router.use(tenantOperationsRouter);

router.get('/customers/:id/export', requirePermission('customers:read'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Cliente nao encontrado.', 'NOT_FOUND');
  const customer = await User.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).select('-senha').lean();
  if (!customer) throw new HttpError(404, 'Cliente nao encontrado.', 'NOT_FOUND');
  const orders = await Order.find({ tenantId: req.tenant!._id, usuarioId: customer._id }).select('-trackingTokenHash').sort({ createdAt: 1 }).lean();
  await audit(req, { action: 'CUSTOMER_DATA_EXPORTED', targetType: 'User', targetId: req.params.id });
  res.setHeader('Content-Disposition', `attachment; filename="customer-${req.params.id}.json"`);
  res.json({ exportedAt: new Date().toISOString(), tenantId: req.tenant!._id, customer, orders });
}));

const anonymizeSchema = z.object({ reason: z.string().trim().min(10).max(500) });
router.post('/customers/:id/anonymize', requireCsrf, requirePermission('customers:write'), validateBody(anonymizeSchema), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Cliente nao encontrado.', 'NOT_FOUND');
  const session = await mongoose.startSession();
  const tenantId = req.tenant!._id;
  const anonymizedReference = `ANON-${req.params.id.slice(-8).toUpperCase()}`;
  let before: Record<string, unknown> | null = null;
  try {
    await session.withTransaction(async () => {
      before = await User.findOne({ _id: req.params.id, tenantId }).select('-senha').session(session).lean();
      if (!before) throw new HttpError(404, 'Cliente nao encontrado.', 'NOT_FOUND');
      await User.updateOne({ _id: req.params.id, tenantId }, { $set: { nome: 'Cliente anonimizado', telefone: anonymizedReference, email: '', nascimento: '', genero: '', enderecos: [], pontos: 0, senha: await bcrypt.hash(crypto.randomUUID(), 12) }, $unset: { normalizedPhone: 1 }, $inc: { tokenVersion: 1 } }, { session });
      await Order.updateMany({ tenantId, usuarioId: new mongoose.Types.ObjectId(req.params.id) }, { $set: { usuarioId: null, 'cliente.nome': 'Cliente anonimizado', 'cliente.telefone': anonymizedReference, 'cliente.endereco': 'Dado anonimizado', observacoes: '' } }, { session });
    });
  } finally {
    await session.endSession();
  }
  await audit(req, { action: 'CUSTOMER_DATA_ANONYMIZED', targetType: 'User', targetId: req.params.id, reason: req.body.reason, before, after: { anonymized: true, reference: anonymizedReference } });
  res.json({ success: true, reference: anonymizedReference });
}));

router.get('/team', requirePermission('team:read'), asyncRoute(async (req, res) => {
  const items = await TenantMembership.find({ tenantId: req.tenant!._id }).populate('accountId', 'name email active lastLoginAt').sort({ createdAt: 1 }).lean();
  res.json({ success: true, items });
}));

router.delete('/team/:id', requireCsrf, requirePermission('team:write'), asyncRoute(async (req, res) => {
  const membership = await TenantMembership.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!membership) throw new HttpError(404, 'Membro da equipe nao encontrado.', 'NOT_FOUND');

  const targetAccountId = membership.accountId?.toString();
  const currentAccountId = req.auth!.accountId?.toString();
  if (targetAccountId === currentAccountId) {
    throw new HttpError(400, 'Voce nao pode remover seu proprio acesso.', 'CANNOT_REMOVE_SELF');
  }

  if (membership.role === 'tenant_owner') {
    throw new HttpError(400, 'O dono da loja nao pode ser removido.', 'CANNOT_REMOVE_OWNER');
  }

  await TenantMembership.deleteOne({ _id: membership._id });
  await audit(req, { action: 'TEAM_MEMBER_REMOVED', targetType: 'TenantMembership', targetId: membership._id.toString(), before: membership });

  res.json({ success: true });
}));

const inviteSchema = z.object({ email: z.string().email(), role: z.enum(['tenant_admin', 'tenant_manager', 'tenant_operator']) });
router.post('/team/invitations', requireCsrf, requirePermission('team:write'), validateBody(inviteSchema), asyncRoute(async (req, res) => {
  assertInvitationDeliveryAvailable();
  const email = req.body.email.toLowerCase();
  const existingAccount = await AdminAccount.findOne({ email }).select('_id').lean();
  if (existingAccount && await TenantMembership.exists({ tenantId: req.tenant!._id, accountId: existingAccount._id, active: true })) throw new HttpError(409, 'Este administrador ja pertence a loja.', 'MEMBERSHIP_EXISTS');
  const { invitation, token } = await createInvitation({ tenantId: req.tenant!._id, email, role: req.body.role, invitedBy: req.auth!.accountId });
  await deliverAdminInvitation({ email, tenantName: req.tenant!.slug, token });
  await audit(req, { action: 'TEAM_INVITATION_CREATED', targetType: 'AdminInvitation', targetId: invitation._id.toString(), after: { email, role: req.body.role } });
  
  const env = getEnv();
  const manualDelivery = env.ADMIN_INVITE_DELIVERY_MODE === 'manual' || (env.ADMIN_INVITE_DELIVERY_MODE === 'webhook' && !env.ADMIN_INVITE_WEBHOOK_URL);
  
  res.status(201).json({ 
    success: true, 
    invitation: { 
      id: invitation._id, 
      expiresAt: invitation.expiresAt, 
      ...(manualDelivery ? { acceptUrl: adminInvitationAcceptUrl(token) } : {}),
      ...(!isProduction() ? { token } : {}) 
    } 
  });
}));

router.get('/billing', requirePermission('billing:read'), asyncRoute(async (req, res) => {
  const [subscription, invoices] = await Promise.all([
    Subscription.findOne({ tenantId: req.tenant!._id }).populate('planId').lean(),
    Invoice.find({ tenantId: req.tenant!._id }).sort({ dueAt: -1 }).limit(50).lean(),
  ]);
  res.json({ success: true, subscription, invoices });
}));

const uploadSchema = z.object({ target: z.enum(['product', 'store']), mimeType: z.literal('image/webp'), size: z.number().int().positive().max(5 * 1024 * 1024) });
router.post('/uploads/sign', requireCsrf, validateBody(uploadSchema), (req, _res, next) => {
  const requiredPermission = req.body.target === 'store' ? 'settings:write' : 'catalog:write';
  if (!req.auth?.permissions.includes(requiredPermission)) return next(new HttpError(403, 'Permissao insuficiente.', 'FORBIDDEN'));
  next();
}, asyncRoute(async (req, res) => {
  const upload = await createTenantUpload(req.tenant!._id, req.body.target, req.body.size);
  await audit(req, { action: 'UPLOAD_SIGNED', targetType: 'StorageObject', targetId: upload.path });
  res.status(201).json({ success: true, upload });
}));

export default router;
