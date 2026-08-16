import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import Tenant from '../models/Tenant.js';
import Plan from '../models/Plan.js';
import Subscription from '../models/Subscription.js';
import Invoice from '../models/Invoice.js';
import TenantMembership from '../models/TenantMembership.js';
import Order from '../../src/models/Order.js';
import { requireSession, requireMaster } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { assertAvailableSlug } from '../domain/slug.js';
import { audit } from '../services/auditService.js';
import { manualBilling } from '../services/billingService.js';
import { createInvitation } from '../services/invitationService.js';
import { adminInvitationAcceptUrl, assertInvitationDeliveryAvailable, deliverAdminInvitation } from '../services/notificationService.js';
import { getEnv, isProduction } from '../config/env.js';
import SlugHistory from '../models/SlugHistory.js';
import masterEnhancedRouter from './masterEnhanced.js';
import AdminAccount from '../models/AdminAccount.js';
import AdminInvitation from '../models/AdminInvitation.js';
import AdminPasswordReset from '../models/AdminPasswordReset.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import Product from '../../src/models/Product.js';
import Category from '../../src/models/Category.js';
import User from '../../src/models/User.js';
import HomeBlock from '../../src/models/HomeBlock.js';
import Coupon from '../../src/models/Coupon.js';
import AuditLog from '../../src/models/AuditLog.js';
import AuthSession from '../models/AuthSession.js';
import CustomerAuthFlow from '../models/CustomerAuthFlow.js';
import IdempotencyRecord from '../models/IdempotencyRecord.js';
import OrderSequence from '../models/OrderSequence.js';
import PasswordResetChallenge from '../models/PasswordResetChallenge.js';
import ShippingQuote from '../models/ShippingQuote.js';

const router = Router();
router.use(requireSession, requireMaster);
router.use(masterEnhancedRouter);

router.get('/dashboard', asyncRoute(async (_req, res) => {
  const [byStatus, subscriptions, gmv] = await Promise.all([
    Tenant.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { status: { $ne: 'Cancelado' } } }, { $group: { _id: null, cents: { $sum: { $ifNull: ['$total_centavos', { $round: [{ $multiply: ['$total', 100] }, 0] }] } }, orders: { $sum: 1 } } }]),
  ]);
  const paidInvoices = await Invoice.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, cents: { $sum: '$amountCents' } } }]);
  res.json({ success: true, tenants: Object.fromEntries(byStatus.map((item) => [item._id, item.count])), subscriptions: Object.fromEntries(subscriptions.map((item) => [item._id, item.count])), platformRevenueCents: paidInvoices[0]?.cents || 0, gmvCents: gmv[0]?.cents || 0, orders: gmv[0]?.orders || 0 });
}));

router.get('/tenants', asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) filter.$or = [{ displayName: { $regex: String(req.query.search), $options: 'i' } }, { slug: { $regex: String(req.query.search), $options: 'i' } }];
  const [items, total] = await Promise.all([
    Tenant.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Tenant.countDocuments(filter),
  ]);
  res.json({ success: true, items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

const tenantSchema = z.object({
  displayName: z.string().min(2).max(120).default('Nova Loja'),
  legalName: z.string().min(2).max(200).optional(),
  slug: z.string().min(3).max(63).optional(),
  owner: z.object({
    name: z.string().min(2).default('Administrador'),
    email: z.string().email(),
    phone: z.string().max(30).default(''),
  }),
  timezone: z.string().default('America/Sao_Paulo'),
  status: z.enum(['onboarding', 'trial', 'active']).default('onboarding'),
});

router.post('/tenants', requireCsrf, validateBody(tenantSchema), asyncRoute(async (req, res) => {
  assertInvitationDeliveryAvailable();
  const displayName = req.body.displayName || 'Nova Loja';
  const legalName = req.body.legalName || displayName;
  const slug = req.body.slug ? assertAvailableSlug(req.body.slug) : `loja-${crypto.randomBytes(4).toString('hex')}`;
  if (await Tenant.exists({ slug })) throw new HttpError(409, 'Slug ja utilizado.', 'SLUG_CONFLICT');
  const tenant = await Tenant.create({
    ...req.body,
    displayName,
    legalName,
    slug,
    owner: {
      ...req.body.owner,
      name: req.body.owner?.name || req.body.owner.email.split('@')[0],
      email: req.body.owner.email.toLowerCase(),
    },
  });
  const { invitation, token } = await createInvitation({ tenantId: tenant._id as mongoose.Types.ObjectId, email: tenant.owner.email, role: 'tenant_owner', invitedBy: req.auth!.accountId });
  await deliverAdminInvitation({ email: tenant.owner.email, tenantName: tenant.displayName, token });
  await audit(req, { action: 'TENANT_CREATED', targetType: 'Tenant', targetId: tenant._id.toString(), after: tenant.toObject() });
  const manualDelivery = getEnv().ADMIN_INVITE_DELIVERY_MODE === 'manual';
  res.status(201).json({
    success: true,
    tenant,
    invitation: {
      id: invitation._id,
      expiresAt: invitation.expiresAt,
      ...(manualDelivery ? { acceptUrl: adminInvitationAcceptUrl(token) } : {}),
      ...(!isProduction() ? { token } : {}),
    },
  });
}));

const statusSchema = z.object({ status: z.enum(['active', 'suspended', 'cancelled', 'archived']), reason: z.string().min(5).max(500) });
router.patch('/tenants/:id/status', requireCsrf, validateBody(statusSchema), asyncRoute(async (req, res) => {
  const before = await Tenant.findById(req.params.id).lean();
  if (!before) throw new HttpError(404, 'Loja nao encontrada.', 'NOT_FOUND');
  const dateField = req.body.status === 'suspended' ? 'suspendedAt' : req.body.status === 'cancelled' ? 'cancelledAt' : req.body.status === 'archived' ? 'archivedAt' : 'activatedAt';
  const tenant = await Tenant.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status, [dateField]: new Date() } }, { returnDocument: 'after', runValidators: true }).lean();
  await audit(req, { action: `TENANT_${req.body.status.toUpperCase()}`, targetType: 'Tenant', targetId: req.params.id, reason: req.body.reason, before, after: tenant });
  res.json({ success: true, tenant });
}));

const slugSchema = z.object({ slug: z.string().min(3).max(63), reason: z.string().min(5).max(500) });
router.patch('/tenants/:id/slug', requireCsrf, validateBody(slugSchema), asyncRoute(async (req, res) => {
  const slug = assertAvailableSlug(req.body.slug);
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw new HttpError(404, 'Loja nao encontrada.', 'NOT_FOUND');
  if (tenant.slug === slug) return res.json({ success: true, tenant });
  if (await Tenant.exists({ slug })) throw new HttpError(409, 'Slug ja utilizado.', 'SLUG_CONFLICT');
  const before = tenant.toObject();
  await SlugHistory.updateOne({ slug: tenant.slug }, { $setOnInsert: { tenantId: tenant._id, slug: tenant.slug } }, { upsert: true });
  tenant.slug = slug;
  await tenant.save();
  await audit(req, { action: 'TENANT_SLUG_CHANGED', targetType: 'Tenant', targetId: tenant._id.toString(), reason: req.body.reason, before, after: tenant.toObject() });
  res.json({ success: true, tenant });
}));

const deleteTenantSchema = z.object({ confirmSlug: z.string().trim(), reason: z.string().trim().min(3).max(500).optional() });
router.delete('/tenants/:id', requireCsrf, validateBody(deleteTenantSchema), asyncRoute(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw new HttpError(404, 'Loja nao encontrada.', 'NOT_FOUND');

  if (req.body.confirmSlug.toLowerCase().trim() !== tenant.slug.toLowerCase().trim()) {
    throw new HttpError(400, 'O slug de confirmacao informado nao confere com a loja.', 'SLUG_MISMATCH');
  }

  const tenantId = tenant._id;
  const memberships = await TenantMembership.find({ tenantId }).lean();
  const accountIds = memberships.map((m) => m.accountId).filter(Boolean);

  await TenantMembership.deleteMany({ tenantId });

  for (const accId of accountIds) {
    const acc = await AdminAccount.findById(accId).lean();
    if (acc && acc.platformRole !== 'platform_super_admin') {
      const otherMemberships = await TenantMembership.countDocuments({ accountId: accId });
      if (otherMemberships === 0) {
        await AdminAccount.deleteOne({ _id: accId });
        await AdminInvitation.deleteMany({ email: acc.email });
        await AdminPasswordReset.deleteMany({ accountId: accId });
      }
    }
  }

  await AdminInvitation.deleteMany({ tenantId });
  await AdminPasswordReset.deleteMany({ tenantId });

  const superAdmins = await AdminAccount.find({ platformRole: 'platform_super_admin' }).select('_id').lean();
  const superAdminAccountIds = superAdmins.map((a) => a._id);
  await AuthSession.updateMany({ accountId: { $in: superAdminAccountIds } }, { $set: { tenantId: null } });

  await Promise.all([
    User.deleteMany({ tenantId }),
    StoreSettings.deleteMany({ tenantId }),
    Product.deleteMany({ tenantId }),
    Category.deleteMany({ tenantId }),
    Order.deleteMany({ tenantId }),
    Subscription.deleteMany({ tenantId }),
    Invoice.deleteMany({ tenantId }),
    HomeBlock.deleteMany({ tenantId }),
    Coupon.deleteMany({ tenantId }),
    AuditLog.deleteMany({ tenantId }),
    SlugHistory.deleteMany({ tenantId }),
    SlugHistory.deleteMany({ slug: tenant.slug }),
    AuthSession.deleteMany({ tenantId, accountId: { $nin: superAdminAccountIds }, _id: { $ne: req.auth?.sessionId } }),
    CustomerAuthFlow.deleteMany({ tenantId }),
    IdempotencyRecord.deleteMany({ tenantId }),
    OrderSequence.deleteMany({ tenantId }),
    PasswordResetChallenge.deleteMany({ tenantId }),
    ShippingQuote.deleteMany({ tenantId }),
  ]);

  await Tenant.deleteOne({ _id: tenantId });

  await audit(req, {
    action: 'TENANT_PERMANENTLY_DELETED',
    targetType: 'Tenant',
    targetId: tenantId.toString(),
    reason: req.body.reason || 'Exclusao permanente de loja de teste pelo Admin Master',
    before: tenant.toObject(),
  });

  res.json({ success: true, message: `Loja ${tenant.displayName} e seus usuarios foram excluidos permanentemente.` });
}));

router.post('/maintenance/purge-orphans', requireCsrf, asyncRoute(async (req, res) => {
  const activeTenants = await Tenant.find().select('_id slug').lean();
  const validTenantIds = activeTenants.map((t) => t._id);
  const validSlugs = new Set(activeTenants.map((t) => t.slug.toLowerCase()));
  const orphanFilter = { tenantId: { $nin: validTenantIds, $exists: true } };

  const superAdmins = await AdminAccount.find({ platformRole: 'platform_super_admin' }).select('_id').lean();
  const superAdminAccountIds = superAdmins.map((a) => a._id);
  await AuthSession.updateMany({ accountId: { $in: superAdminAccountIds } }, { $set: { tenantId: null } });

  const [
    users,
    storeSettings,
    products,
    categories,
    orders,
    subscriptions,
    invoices,
    homeBlocks,
    coupons,
    auditLogs,
    slugHistoriesByTenant,
    authSessions,
    customerAuthFlows,
    idempotencyRecords,
    orderSequences,
    passwordResetChallenges,
    shippingQuotes,
    memberships,
    invitations,
    resets,
  ] = await Promise.all([
    User.deleteMany(orphanFilter),
    StoreSettings.deleteMany(orphanFilter),
    Product.deleteMany(orphanFilter),
    Category.deleteMany(orphanFilter),
    Order.deleteMany(orphanFilter),
    Subscription.deleteMany(orphanFilter),
    Invoice.deleteMany(orphanFilter),
    HomeBlock.deleteMany(orphanFilter),
    Coupon.deleteMany(orphanFilter),
    AuditLog.deleteMany(orphanFilter),
    SlugHistory.deleteMany(orphanFilter),
    AuthSession.deleteMany({ ...orphanFilter, accountId: { $nin: superAdminAccountIds }, _id: { $ne: req.auth?.sessionId } }),
    CustomerAuthFlow.deleteMany(orphanFilter),
    IdempotencyRecord.deleteMany(orphanFilter),
    OrderSequence.deleteMany(orphanFilter),
    PasswordResetChallenge.deleteMany(orphanFilter),
    ShippingQuote.deleteMany(orphanFilter),
    TenantMembership.deleteMany(orphanFilter),
    AdminInvitation.deleteMany(orphanFilter),
    AdminPasswordReset.deleteMany(orphanFilter),
  ]);

  const slugHistoriesBySlug = await SlugHistory.deleteMany({ slug: { $nin: Array.from(validSlugs) } });

  const allAccounts = await AdminAccount.find({ platformRole: { $ne: 'platform_super_admin' } }).select('_id email').lean();
  let deletedAccountsCount = 0;
  for (const acc of allAccounts) {
    const hasMembership = await TenantMembership.exists({ accountId: acc._id });
    if (!hasMembership) {
      await AdminAccount.deleteOne({ _id: acc._id });
      await AdminInvitation.deleteMany({ email: acc.email });
      await AdminPasswordReset.deleteMany({ accountId: acc._id });
      deletedAccountsCount++;
    }
  }

  const totalPurged = (users.deletedCount || 0) +
    (storeSettings.deletedCount || 0) +
    (products.deletedCount || 0) +
    (categories.deletedCount || 0) +
    (orders.deletedCount || 0) +
    (subscriptions.deletedCount || 0) +
    (invoices.deletedCount || 0) +
    (homeBlocks.deletedCount || 0) +
    (coupons.deletedCount || 0) +
    (auditLogs.deletedCount || 0) +
    (slugHistoriesByTenant.deletedCount || 0) +
    (slugHistoriesBySlug.deletedCount || 0) +
    (authSessions.deletedCount || 0) +
    (customerAuthFlows.deletedCount || 0) +
    (idempotencyRecords.deletedCount || 0) +
    (orderSequences.deletedCount || 0) +
    (passwordResetChallenges.deletedCount || 0) +
    (shippingQuotes.deletedCount || 0) +
    (memberships.deletedCount || 0) +
    (invitations.deletedCount || 0) +
    (resets.deletedCount || 0) +
    deletedAccountsCount;

  await audit(req, {
    action: 'SYSTEM_PURGE_ORPHANS',
    targetType: 'System',
    targetId: 'platform',
    reason: 'Faxina automatica de registros orfaos e lojas de teste excluidas',
  });

  res.json({
    success: true,
    message: `Faxina concluida. ${totalPurged} registro(s) orfao(s) foram excluidos do banco.`,
    totalPurged,
  });
}));

const planSchema = z.object({ name: z.string().min(2), code: z.string().regex(/^[a-z0-9_-]+$/), priceCents: z.number().int().nonnegative(), interval: z.enum(['monthly', 'yearly']), trialDays: z.number().int().nonnegative().default(0), limits: z.record(z.string(), z.number()).default({}), features: z.record(z.string(), z.boolean()).default({}) });
router.get('/plans', asyncRoute(async (_req, res) => res.json({ success: true, plans: await Plan.find().sort({ priceCents: 1 }).lean() })));
router.post('/plans', requireCsrf, validateBody(planSchema), asyncRoute(async (req, res) => {
  const plan = await Plan.create(req.body);
  await audit(req, { action: 'PLAN_CREATED', targetType: 'Plan', targetId: plan._id.toString(), after: plan.toObject() });
  res.status(201).json({ success: true, plan });
}));

const subscriptionSchema = z.object({ tenantId: z.string().regex(/^[a-f\d]{24}$/i), planId: z.string().regex(/^[a-f\d]{24}$/i), status: z.enum(['trial', 'active']).default('trial') });
router.post('/subscriptions', requireCsrf, validateBody(subscriptionSchema), asyncRoute(async (req, res) => {
  const [tenant, plan] = await Promise.all([Tenant.findById(req.body.tenantId), Plan.findOne({ _id: req.body.planId, active: true })]);
  if (!tenant || !plan) throw new HttpError(404, 'Loja ou plano nao encontrado.', 'NOT_FOUND');
  const now = new Date();
  const periodEnd = new Date(now);
  if (plan.interval === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1); else periodEnd.setMonth(periodEnd.getMonth() + 1);
  const subscription = await Subscription.findOneAndUpdate(
    { tenantId: tenant._id },
    { $set: { planId: plan._id, status: req.body.status, provider: 'manual', currentPeriodStart: now, currentPeriodEnd: periodEnd, trialEndsAt: req.body.status === 'trial' ? new Date(now.getTime() + Number(plan.trialDays || 0) * 86_400_000) : null } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  );
  tenant.planId = plan._id;
  tenant.subscriptionId = subscription._id;
  tenant.status = req.body.status;
  await tenant.save();
  await audit(req, { action: 'SUBSCRIPTION_ASSIGNED', targetType: 'Subscription', targetId: subscription._id.toString(), after: subscription.toObject() });
  res.status(201).json({ success: true, subscription });
}));

const invoiceSchema = z.object({ tenantId: z.string().regex(/^[a-f\d]{24}$/i), subscriptionId: z.string().regex(/^[a-f\d]{24}$/i), amountCents: z.number().int().nonnegative(), dueAt: z.coerce.date() });
router.post('/invoices', requireCsrf, validateBody(invoiceSchema), asyncRoute(async (req, res) => {
  const invoice = await manualBilling.createInvoice(req.body);
  await audit(req, { action: 'INVOICE_CREATED', targetType: 'Invoice', targetId: invoice._id.toString(), after: invoice.toObject() });
  res.status(201).json({ success: true, invoice });
}));

const paymentSchema = z.object({ reason: z.string().min(5).max(500), receiptReference: z.string().max(200).optional(), paidAt: z.coerce.date().optional() });
router.post('/invoices/:id/mark-paid', requireCsrf, validateBody(paymentSchema), asyncRoute(async (req, res) => {
  if (req.body.paidAt && req.body.paidAt.getTime() > Date.now() + 60_000) throw new HttpError(400, 'A data de pagamento nao pode estar no futuro.', 'INVALID_PAYMENT_DATE');
  const invoice = await manualBilling.markPaid(req.params.id, req.auth!.accountId, req.body.reason, req.body.receiptReference, req.body.paidAt);
  await audit(req, { action: 'INVOICE_MARKED_PAID', targetType: 'Invoice', targetId: req.params.id, reason: req.body.reason, after: invoice.toObject() });
  res.json({ success: true, invoice });
}));

router.post('/invoices/:id/cancel', requireCsrf, validateBody(paymentSchema.pick({ reason: true })), asyncRoute(async (req, res) => {
  const invoice = await manualBilling.cancelInvoice(req.params.id, req.auth!.accountId, req.body.reason);
  await audit(req, { action: 'INVOICE_CANCELLED', targetType: 'Invoice', targetId: req.params.id, reason: req.body.reason, after: invoice.toObject() });
  res.json({ success: true, invoice });
}));

router.post('/invoices/:id/refund', requireCsrf, validateBody(paymentSchema.pick({ reason: true })), asyncRoute(async (req, res) => {
  const invoice = await manualBilling.refundInvoice(req.params.id, req.auth!.accountId, req.body.reason);
  await audit(req, { action: 'INVOICE_REFUNDED', targetType: 'Invoice', targetId: req.params.id, reason: req.body.reason, after: invoice.toObject() });
  res.json({ success: true, invoice });
}));

router.get('/tenants/:id', asyncRoute(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean();
  if (!tenant) throw new HttpError(404, 'Loja nao encontrada.', 'NOT_FOUND');
  const [memberships, subscriptions, invoices] = await Promise.all([
    TenantMembership.find({ tenantId: tenant._id }).populate('accountId', 'name email active lastLoginAt').lean(),
    Subscription.find({ tenantId: tenant._id }).populate('planId').lean(),
    Invoice.find({ tenantId: tenant._id }).sort({ dueAt: -1 }).limit(50).lean(),
  ]);
  res.json({ success: true, tenant, memberships, subscriptions, invoices });
}));

export default router;
