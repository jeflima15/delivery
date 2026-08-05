import { Router } from 'express';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { z } from 'zod';
import Tenant from '../models/Tenant.js';
import Plan from '../models/Plan.js';
import Subscription from '../models/Subscription.js';
import Invoice from '../models/Invoice.js';
import AdminAccount from '../models/AdminAccount.js';
import AdminPasswordReset from '../models/AdminPasswordReset.js';
import TenantMembership from '../models/TenantMembership.js';
import AdminInvitation from '../models/AdminInvitation.js';
import MasterSettings from '../models/MasterSettings.js';
import Order from '../../src/models/Order.js';
import User from '../../src/models/User.js';
import Product from '../../src/models/Product.js';
import AuditLog from '../../src/models/AuditLog.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { requireCsrf } from '../middleware/csrf.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/auditService.js';
import { createInvitation } from '../services/invitationService.js';
import { assertInvitationDeliveryAvailable, deliverAdminInvitation } from '../services/notificationService.js';
import { isProduction } from '../config/env.js';

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const DAY = 86_400_000;

function pageQuery(query: Record<string, unknown>) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

function dateRange(query: Record<string, unknown>) {
  const now = new Date();
  const to = query.to ? new Date(String(query.to)) : now;
  const from = query.from ? new Date(String(query.from)) : new Date(to.getTime() - 29 * DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new HttpError(400, 'Periodo invalido.', 'INVALID_PERIOD');
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

const orderCents = { $ifNull: ['$total_centavos', { $round: [{ $multiply: ['$total', 100] }, 0] }] };
const validOrders = { status: { $ne: 'Cancelado' } };
const pagination = (page: number, limit: number, total: number) => ({ page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) });

function formatActivity(value: unknown) {
  const item = value as Record<string, unknown>;
  const tenantValue = item.tenantId;
  return {
    ...item,
    action: String(item.acao || 'ACTIVITY'),
    targetType: String(item.targetType || item.tabela || 'Platform'),
    targetId: item.documentoId ? String(item.documentoId) : undefined,
    actor: { email: String(item.adminId || item.actorRole || 'Sistema') },
    tenant: tenantValue && typeof tenantValue === 'object' ? tenantValue : undefined,
  };
}

router.get('/session', asyncRoute(async (req, res) => {
  const account = await AdminAccount.findById(req.auth?.accountId).select('name email platformRole lastLoginAt').lean();
  res.json({ success: true, account });
}));

router.get('/dashboard', asyncRoute(async (req, res) => {
  const { from, to } = dateRange(req.query as Record<string, unknown>);
  const [tenantStatuses, newTenants, orders, orderSeries, invoiceTotals, invoiceSeries, subscriptions, plans, topStores, attention, activities] = await Promise.all([
    Tenant.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Tenant.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    Order.aggregate([{ $match: { ...validOrders, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: null, orders: { $sum: 1 }, gmvCents: { $sum: orderCents } } }]),
    Order.aggregate([{ $match: { ...validOrders, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d' } }, orders: { $sum: 1 }, gmvCents: { $sum: orderCents } } }, { $sort: { _id: 1 } }]),
    Invoice.aggregate([{ $match: { $or: [{ createdAt: { $gte: from, $lte: to } }, { paidAt: { $gte: from, $lte: to } }, { dueAt: { $gte: from, $lte: to } }] } }, { $group: { _id: '$status', cents: { $sum: '$amountCents' }, count: { $sum: 1 } } }]),
    Invoice.aggregate([{ $match: { createdAt: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d' } }, paidCents: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amountCents', 0] } }, pendingCents: { $sum: { $cond: [{ $in: ['$status', ['pending', 'overdue', 'failed']] }, '$amountCents', 0] } } } }, { $sort: { _id: 1 } }]),
    Subscription.find({ status: { $in: ['trial', 'active', 'past_due'] } }).populate('planId', 'name priceCents interval').lean(),
    Plan.find().select('name code').lean(),
    Order.aggregate([{ $match: { ...validOrders, createdAt: { $gte: from, $lte: to }, tenantId: { $ne: null } } }, { $group: { _id: '$tenantId', orders: { $sum: 1 }, gmvCents: { $sum: orderCents } } }, { $sort: { gmvCents: -1 } }, { $limit: 8 }, { $lookup: { from: 'tenants', localField: '_id', foreignField: '_id', as: 'tenant' } }, { $unwind: '$tenant' }, { $project: { tenantId: '$_id', displayName: '$tenant.displayName', slug: '$tenant.slug', orders: 1, gmvCents: 1 } }]),
    Promise.all([
      Invoice.find({ status: { $in: ['pending', 'overdue', 'failed'] }, dueAt: { $lt: new Date() } }).populate('tenantId', 'displayName slug').sort({ dueAt: 1 }).limit(6).lean(),
      Subscription.find({ status: 'trial', trialEndsAt: { $gte: new Date(), $lte: new Date(Date.now() + 7 * DAY) } }).populate('tenantId', 'displayName slug').sort({ trialEndsAt: 1 }).limit(6).lean(),
      Tenant.find({ 'onboarding.completed': false, createdAt: { $lt: new Date(Date.now() - 3 * DAY) } }).select('displayName slug status createdAt').sort({ createdAt: 1 }).limit(6).lean(),
    ]),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).lean(),
  ]);
  const statusMap = Object.fromEntries(tenantStatuses.map((item) => [item._id, item.count]));
  const invoiceMap = Object.fromEntries(invoiceTotals.map((item) => [item._id, item]));
  let mrrCents = 0;
  const planCounts = new Map<string, { name: string; count: number }>();
  for (const subscription of subscriptions) {
    const plan = subscription.planId as unknown as { _id?: mongoose.Types.ObjectId; name?: string; priceCents?: number; interval?: string } | null;
    if (!plan) continue;
    if (subscription.status === 'active') mrrCents += plan.interval === 'yearly' ? Math.round(Number(plan.priceCents || 0) / 12) : Number(plan.priceCents || 0);
    const key = String(plan._id || 'none');
    const current = planCounts.get(key) || { name: plan.name || 'Sem plano', count: 0 };
    current.count += 1;
    planCounts.set(key, current);
  }
  const paidCents = Number(invoiceMap.paid?.cents || 0);
  const pendingCents = Number(invoiceMap.pending?.cents || 0);
  const overdueCents = Number(invoiceMap.overdue?.cents || 0) + Number(invoiceMap.failed?.cents || 0);
  const orderSummary = orders[0] || { orders: 0, gmvCents: 0 };
  res.json({
    success: true,
    period: { from, to },
    kpis: {
      totalTenants: Object.values(statusMap).reduce((sum: number, count) => sum + Number(count), 0), activeTenants: statusMap.active || 0,
      trialTenants: statusMap.trial || 0, onboardingTenants: statusMap.onboarding || 0, pastDueTenants: statusMap.past_due || 0,
      suspendedTenants: statusMap.suspended || 0, newTenants, orders: orderSummary.orders || 0, gmvCents: orderSummary.gmvCents || 0,
      averageOrderCents: orderSummary.orders ? Math.round(orderSummary.gmvCents / orderSummary.orders) : 0,
      paidRevenueCents: paidCents, pendingRevenueCents: pendingCents, overdueRevenueCents: overdueCents,
      mrrCents, arrCents: mrrCents * 12, averagePayingTenantCents: subscriptions.filter((item) => item.status === 'active').length ? Math.round(mrrCents / subscriptions.filter((item) => item.status === 'active').length) : 0,
      trialsEndingSoon: attention[1].length,
    },
    orderSeries: orderSeries.map((item) => ({ date: item._id, orders: item.orders, gmvCents: item.gmvCents })),
    revenueSeries: invoiceSeries.map((item) => ({ date: item._id, paidCents: item.paidCents, pendingCents: item.pendingCents })),
    tenantStatusDistribution: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
    planDistribution: [...planCounts.values()], plans,
    topStores, attention: { overdueInvoices: attention[0], endingTrials: attention[1], stalledOnboarding: attention[2] }, recentActivity: activities.map(formatActivity),
  });
}));

router.get('/tenants', asyncRoute(async (req, res) => {
  const { page, limit, skip } = pageQuery(req.query as Record<string, unknown>);
  const { from, to } = dateRange(req.query as Record<string, unknown>);
  const match: Record<string, unknown> = {};
  if (req.query.status) match.status = req.query.status;
  if (req.query.planId && mongoose.isValidObjectId(String(req.query.planId))) match.planId = new mongoose.Types.ObjectId(String(req.query.planId));
  if (req.query.search) {
    const search = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    match.$or = ['displayName', 'legalName', 'slug', 'owner.name', 'owner.email'].map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
  }
  const sortMap: Record<string, Record<string, 1 | -1>> = {
    name: { displayName: 1 }, oldest: { createdAt: 1 }, activity: { lastActivityAt: -1 }, recent: { createdAt: -1 },
    gmv: { 'metrics.gmvCents': -1 }, orders: { 'metrics.orders': -1 }, revenue: { 'saasRevenue.cents': -1 }, due: { 'latestInvoice.dueAt': 1 },
  };
  if (req.query.createdFrom || req.query.createdTo) {
    const createdAt: Record<string, Date> = {};
    if (req.query.createdFrom) createdAt.$gte = new Date(String(req.query.createdFrom));
    if (req.query.createdTo) {
      const end = new Date(String(req.query.createdTo));
      end.setHours(23, 59, 59, 999);
      createdAt.$lte = end;
    }
    if (Object.values(createdAt).some((value) => Number.isNaN(value.getTime()))) throw new HttpError(400, 'Periodo de cadastro invalido.', 'INVALID_PERIOD');
    match.createdAt = createdAt;
  }
  const pipeline: mongoose.PipelineStage[] = [
    { $match: match },
    { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'plan' } },
    { $lookup: { from: 'subscriptions', localField: '_id', foreignField: 'tenantId', as: 'subscription' } },
    { $lookup: { from: 'invoices', let: { tenant: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$tenantId', '$$tenant'] } } }, { $sort: { dueAt: -1 } }, { $limit: 1 }], as: 'latestInvoice' } },
    { $lookup: { from: 'orders', let: { tenant: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$tenantId', '$$tenant'] }, { $ne: ['$status', 'Cancelado'] }, { $gte: ['$createdAt', from] }, { $lte: ['$createdAt', to] }] } } }, { $group: { _id: null, orders: { $sum: 1 }, gmvCents: { $sum: orderCents } } }], as: 'metrics' } },
    { $lookup: { from: 'invoices', let: { tenant: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$tenantId', '$$tenant'] }, { $eq: ['$status', 'paid'] }, { $gte: ['$paidAt', from] }, { $lte: ['$paidAt', to] }] } } }, { $group: { _id: null, cents: { $sum: '$amountCents' } } }], as: 'saasRevenue' } },
    { $set: { plan: { $first: '$plan' }, subscription: { $first: '$subscription' }, latestInvoice: { $first: '$latestInvoice' }, metrics: { $ifNull: [{ $first: '$metrics' }, { orders: 0, gmvCents: 0 }] }, saasRevenue: { $ifNull: [{ $first: '$saasRevenue' }, { cents: 0 }] } } },
  ];
  if (req.query.subscriptionStatus) pipeline.push({ $match: { 'subscription.status': req.query.subscriptionStatus } });
  if (req.query.invoiceStatus) pipeline.push({ $match: { 'latestInvoice.status': req.query.invoiceStatus } });
  if (req.query.hasOrders === 'true') pipeline.push({ $match: { 'metrics.orders': { $gt: 0 } } });
  if (req.query.hasOrders === 'false') pipeline.push({ $match: { 'metrics.orders': 0 } });
  const result = await Tenant.aggregate([...pipeline, { $facet: { items: [{ $sort: sortMap[String(req.query.sort)] || sortMap.recent }, { $skip: skip }, { $limit: limit }], meta: [{ $count: 'total' }] } }]);
  const total = result[0]?.meta[0]?.total || 0;
  res.json({ success: true, items: result[0]?.items || [], pagination: pagination(page, limit, total), summaries: Object.fromEntries((await Tenant.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])).map((item) => [item._id, item.count])) });
}));

router.get('/tenants/:id', asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Loja nao encontrada.', 'NOT_FOUND');
  const { from, to } = dateRange(req.query as Record<string, unknown>);
  const tenant = await Tenant.findById(req.params.id).populate('planId').lean();
  if (!tenant) throw new HttpError(404, 'Loja nao encontrada.', 'NOT_FOUND');
  const [subscription, invoices, memberships, invitations, orderMetrics, orderSeries, customers, products, activities] = await Promise.all([
    Subscription.findOne({ tenantId: tenant._id }).populate('planId').lean(), Invoice.find({ tenantId: tenant._id }).sort({ dueAt: -1 }).limit(50).lean(),
    TenantMembership.find({ tenantId: tenant._id }).populate('accountId', 'name email active lastLoginAt').lean(),
    AdminInvitation.find({ tenantId: tenant._id }).select('-tokenHash').sort({ createdAt: -1 }).limit(50).lean(),
    Order.aggregate([{ $match: { tenantId: tenant._id, ...validOrders, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: null, orders: { $sum: 1 }, gmvCents: { $sum: orderCents } } }]),
    Order.aggregate([{ $match: { tenantId: tenant._id, ...validOrders, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d' } }, orders: { $sum: 1 }, gmvCents: { $sum: orderCents } } }, { $sort: { _id: 1 } }]),
    User.countDocuments({ tenantId: tenant._id }), Product.countDocuments({ tenantId: tenant._id }), AuditLog.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);
  const metrics = orderMetrics[0] || { orders: 0, gmvCents: 0 };
  res.json({ success: true, tenant, subscription, invoices, memberships, invitations, metrics: { ...metrics, averageOrderCents: metrics.orders ? Math.round(metrics.gmvCents / metrics.orders) : 0, customers, products }, orderSeries: orderSeries.map((item) => ({ date: item._id, orders: item.orders, gmvCents: item.gmvCents })), activities: activities.map(formatActivity) });
}));

const tenantUpdateSchema = z.object({ legalName: z.string().min(2).max(200), displayName: z.string().min(2).max(120), owner: z.object({ name: z.string().min(2), email: z.string().email(), phone: z.string().max(30).default('') }), timezone: z.string().min(3).max(80) });
router.patch('/tenants/:id', requireCsrf, validateBody(tenantUpdateSchema), asyncRoute(async (req, res) => {
  const before = await Tenant.findById(req.params.id).lean();
  if (!before) throw new HttpError(404, 'Loja nao encontrada.', 'NOT_FOUND');
  const tenant = await Tenant.findByIdAndUpdate(req.params.id, { $set: { ...req.body, 'owner.email': req.body.owner.email.toLowerCase() } }, { returnDocument: 'after', runValidators: true }).lean();
  await audit(req, { action: 'TENANT_UPDATED', targetType: 'Tenant', targetId: req.params.id, before, after: tenant });
  res.json({ success: true, tenant });
}));

router.post('/tenants/:id/reset-password-link', requireCsrf, asyncRoute(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean();
  if (!tenant) throw new HttpError(404, 'Loja nao encontrada.', 'NOT_FOUND');

  const account = await AdminAccount.findOne({ email: tenant.owner.email }).lean();
  if (!account) throw new HttpError(404, 'Conta administrativa nao encontrada.', 'NOT_FOUND');

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await AdminPasswordReset.create({
    accountId: account._id,
    tokenHash,
    expiresAt,
  });

  await audit(req, { action: 'TENANT_PASSWORD_RESET_LINK_GENERATED', targetType: 'Tenant', targetId: req.params.id });

  const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
  const resetLink = `${origin}/admin/reset-password/${token}`;

  res.json({ success: true, resetLink });
}));

router.get('/plans', asyncRoute(async (req, res) => {
  const { page, limit, skip } = pageQuery(req.query as Record<string, unknown>);
  const match: Record<string, unknown> = {};
  if (req.query.active === 'true' || req.query.active === 'false') match.active = req.query.active === 'true';
  if (req.query.search) match.$or = [{ name: { $regex: String(req.query.search), $options: 'i' } }, { code: { $regex: String(req.query.search), $options: 'i' } }];
  const [items, total] = await Promise.all([Plan.aggregate([{ $match: match }, { $lookup: { from: 'subscriptions', localField: '_id', foreignField: 'planId', as: 'subscriptions' } }, { $set: { activeSubscriptions: { $size: { $filter: { input: '$subscriptions', as: 'sub', cond: { $eq: ['$$sub.status', 'active'] } } } } } }, { $unset: 'subscriptions' }, { $sort: { priceCents: 1 } }, { $skip: skip }, { $limit: limit }]), Plan.countDocuments(match)]);
  res.json({ success: true, items, plans: items, pagination: pagination(page, limit, total) });
}));

router.get('/plans/:id', asyncRoute(async (req, res) => {
  const plan = await Plan.findById(req.params.id).lean();
  if (!plan) throw new HttpError(404, 'Plano nao encontrado.', 'NOT_FOUND');
  const subscriptions = await Subscription.countDocuments({ planId: plan._id, status: { $in: ['trial', 'active', 'past_due'] } });
  res.json({ success: true, plan: { ...plan, subscriptions } });
}));

const planUpdateSchema = z.object({ name: z.string().min(2), priceCents: z.number().int().nonnegative(), interval: z.enum(['monthly', 'yearly']), trialDays: z.number().int().nonnegative(), limits: z.record(z.string(), z.number()).default({}), features: z.record(z.string(), z.boolean()).default({}) });
router.patch('/plans/:id', requireCsrf, validateBody(planUpdateSchema), asyncRoute(async (req, res) => {
  const before = await Plan.findById(req.params.id).lean();
  if (!before) throw new HttpError(404, 'Plano nao encontrado.', 'NOT_FOUND');
  const plan = await Plan.findByIdAndUpdate(req.params.id, { $set: req.body }, { returnDocument: 'after', runValidators: true }).lean();
  await audit(req, { action: 'PLAN_UPDATED', targetType: 'Plan', targetId: req.params.id, before, after: plan });
  res.json({ success: true, plan });
}));

router.post('/plans/:id/duplicate', requireCsrf, asyncRoute(async (req, res) => {
  const source = await Plan.findById(req.params.id).lean();
  if (!source) throw new HttpError(404, 'Plano nao encontrado.', 'NOT_FOUND');
  const suffix = Date.now().toString(36).slice(-5);
  const plan = await Plan.create({ name: `${source.name} - copia`, code: `${source.code}-copia-${suffix}`, active: false, priceCents: source.priceCents, interval: source.interval, trialDays: source.trialDays, limits: source.limits, features: source.features });
  await audit(req, { action: 'PLAN_DUPLICATED', targetType: 'Plan', targetId: plan._id.toString(), after: plan.toObject() });
  res.status(201).json({ success: true, plan });
}));

router.patch('/plans/:id/status', requireCsrf, validateBody(z.object({ active: z.boolean() })), asyncRoute(async (req, res) => {
  const plan = await Plan.findByIdAndUpdate(req.params.id, { $set: { active: req.body.active } }, { returnDocument: 'after' }).lean();
  if (!plan) throw new HttpError(404, 'Plano nao encontrado.', 'NOT_FOUND');
  await audit(req, { action: req.body.active ? 'PLAN_ACTIVATED' : 'PLAN_DEACTIVATED', targetType: 'Plan', targetId: req.params.id, after: plan });
  res.json({ success: true, plan });
}));

router.get('/subscriptions', asyncRoute(async (req, res) => {
  const { page, limit, skip } = pageQuery(req.query as Record<string, unknown>);
  const match: Record<string, unknown> = {};
  if (req.query.status) match.status = req.query.status;
  if (req.query.planId && mongoose.isValidObjectId(String(req.query.planId))) match.planId = new mongoose.Types.ObjectId(String(req.query.planId));
  const pipeline: mongoose.PipelineStage[] = [{ $match: match }, { $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 'tenant' } }, { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'plan' } }, { $set: { tenant: { $first: '$tenant' }, plan: { $first: '$plan' } } }];
  if (req.query.search) pipeline.push({ $match: { $or: [{ 'tenant.displayName': { $regex: String(req.query.search), $options: 'i' } }, { 'tenant.owner.email': { $regex: String(req.query.search), $options: 'i' } }] } });
  const result = await Subscription.aggregate([...pipeline, { $facet: { items: [{ $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit }], meta: [{ $count: 'total' }] } }]);
  const total = result[0]?.meta[0]?.total || 0;
  res.json({ success: true, items: result[0]?.items || [], pagination: pagination(page, limit, total) });
}));

const subscriptionUpdateSchema = z.object({ planId: objectId.optional(), status: z.enum(['trial', 'active', 'past_due', 'suspended', 'cancelled']).optional(), reason: z.string().min(5).max(500) });
router.patch('/subscriptions/:id', requireCsrf, validateBody(subscriptionUpdateSchema), asyncRoute(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription) throw new HttpError(404, 'Assinatura nao encontrada.', 'NOT_FOUND');
  const before = subscription.toObject();
  if (req.body.planId) {
    const plan = await Plan.findById(req.body.planId);
    if (!plan?.active) throw new HttpError(409, 'Plano indisponivel.', 'PLAN_UNAVAILABLE');
    subscription.planId = plan._id;
    await Tenant.updateOne({ _id: subscription.tenantId }, { $set: { planId: plan._id } });
  }
  if (req.body.status) {
    subscription.status = req.body.status;
    if (req.body.status === 'cancelled') subscription.cancelledAt = new Date();
    await Tenant.updateOne({ _id: subscription.tenantId }, { $set: { status: req.body.status === 'suspended' ? 'suspended' : req.body.status === 'cancelled' ? 'cancelled' : req.body.status } });
  }
  await subscription.save();
  await audit(req, { action: 'SUBSCRIPTION_UPDATED', targetType: 'Subscription', targetId: req.params.id, reason: req.body.reason, before, after: subscription.toObject() });
  res.json({ success: true, subscription });
}));

router.get('/invoices', asyncRoute(async (req, res) => {
  const { page, limit, skip } = pageQuery(req.query as Record<string, unknown>);
  const match: Record<string, unknown> = {};
  if (req.query.status) match.status = req.query.status;
  if (req.query.from || req.query.to) { const range = dateRange(req.query as Record<string, unknown>); match.createdAt = { $gte: range.from, $lte: range.to }; }
  const pipeline: mongoose.PipelineStage[] = [{ $match: match }, { $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 'tenant' } }, { $lookup: { from: 'subscriptions', localField: 'subscriptionId', foreignField: '_id', as: 'subscription' } }, { $set: { tenant: { $first: '$tenant' }, subscription: { $first: '$subscription' } } }, { $lookup: { from: 'plans', localField: 'subscription.planId', foreignField: '_id', as: 'plan' } }, { $set: { plan: { $first: '$plan' } } }];
  if (req.query.search) pipeline.push({ $match: { $or: [{ 'tenant.displayName': { $regex: String(req.query.search), $options: 'i' } }, { 'tenant.owner.email': { $regex: String(req.query.search), $options: 'i' } }, { receiptReference: { $regex: String(req.query.search), $options: 'i' } }] } });
  const result = await Invoice.aggregate([...pipeline, { $facet: { items: [{ $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit }], meta: [{ $count: 'total' }], summary: [{ $group: { _id: '$status', cents: { $sum: '$amountCents' }, count: { $sum: 1 } } }] } }]);
  const total = result[0]?.meta[0]?.total || 0;
  res.json({ success: true, items: result[0]?.items || [], pagination: pagination(page, limit, total), summaries: Object.fromEntries((result[0]?.summary || []).map((item: { _id: string; cents: number; count: number }) => [item._id, { cents: item.cents, count: item.count }])) });
}));

router.get('/invoices/:id', asyncRoute(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate('tenantId', 'displayName slug owner').populate('subscriptionId').lean();
  if (!invoice) throw new HttpError(404, 'Fatura nao encontrada.', 'NOT_FOUND');
  res.json({ success: true, invoice });
}));

router.get('/accesses', asyncRoute(async (req, res) => {
  const { page, limit, skip } = pageQuery(req.query as Record<string, unknown>);
  const match: Record<string, unknown> = {};
  if (req.query.role) match.role = req.query.role;
  if (req.query.active === 'true' || req.query.active === 'false') match.active = req.query.active === 'true';
  const pipeline: mongoose.PipelineStage[] = [
    { $match: match },
    { $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 'tenantId' } },
    { $lookup: { from: 'adminaccounts', localField: 'accountId', foreignField: '_id', as: 'accountId' } },
    { $set: { tenantId: { $first: '$tenantId' }, accountId: { $first: '$accountId' } } },
  ];
  if (req.query.search) {
    const search = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pipeline.push({ $match: { $or: [{ 'accountId.name': { $regex: search, $options: 'i' } }, { 'accountId.email': { $regex: search, $options: 'i' } }, { 'tenantId.displayName': { $regex: search, $options: 'i' } }] } });
  }
  const result = await TenantMembership.aggregate([...pipeline, { $facet: { items: [{ $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit }, { $project: { 'accountId.passwordHash': 0, 'accountId.mfa': 0 } }], meta: [{ $count: 'total' }] } }]);
  const total = result[0]?.meta[0]?.total || 0;
  const counts = await TenantMembership.aggregate([{ $match: { active: true } }, { $group: { _id: '$role', count: { $sum: 1 } } }]);
  res.json({ success: true, items: result[0]?.items || [], pagination: pagination(page, limit, total), summaries: Object.fromEntries(counts.map((item) => [item._id, item.count])) });
}));

router.get('/invitations', asyncRoute(async (req, res) => {
  const { page, limit, skip } = pageQuery(req.query as Record<string, unknown>);
  const filter: Record<string, unknown> = {};
  if (req.query.status === 'pending') {
    filter.acceptedAt = null;
    filter.revokedAt = null;
  }
  const [items, total] = await Promise.all([AdminInvitation.find(filter).select('-tokenHash').populate('tenantId', 'displayName slug').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), AdminInvitation.countDocuments(filter)]);
  res.json({ success: true, items, pagination: pagination(page, limit, total) });
}));

router.post('/invitations/:id/resend', requireCsrf, asyncRoute(async (req, res) => {
  assertInvitationDeliveryAvailable();
  const current = await AdminInvitation.findById(req.params.id).populate('tenantId', 'displayName').lean();
  if (!current || current.acceptedAt || current.revokedAt) throw new HttpError(409, 'Convite nao pode ser reenviado.', 'INVALID_INVITATION_STATE');
  const { invitation, token } = await createInvitation({ tenantId: current.tenantId._id as mongoose.Types.ObjectId, email: current.email, role: current.role, invitedBy: req.auth!.accountId });
  await deliverAdminInvitation({ email: current.email, tenantName: current.tenantId.displayName, token });
  res.json({ success: true, invitation: { id: invitation._id, expiresAt: invitation.expiresAt, ...(!isProduction() ? { token } : {}) } });
}));

router.post('/invitations/:id/revoke', requireCsrf, asyncRoute(async (req, res) => {
  const invitation = await AdminInvitation.findOneAndUpdate({ _id: req.params.id, acceptedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } }, { returnDocument: 'after' }).lean();
  if (!invitation) throw new HttpError(409, 'Convite nao pode ser revogado.', 'INVALID_INVITATION_STATE');
  await audit(req, { action: 'INVITATION_REVOKED', targetType: 'AdminInvitation', targetId: req.params.id, after: invitation });
  res.json({ success: true, invitation });
}));

router.patch('/memberships/:id/status', requireCsrf, validateBody(z.object({ active: z.boolean(), reason: z.string().min(5).max(500) })), asyncRoute(async (req, res) => {
  const membership = await TenantMembership.findByIdAndUpdate(req.params.id, { $set: { active: req.body.active, revokedAt: req.body.active ? null : new Date() } }, { returnDocument: 'after' }).lean();
  if (!membership) throw new HttpError(404, 'Acesso nao encontrado.', 'NOT_FOUND');
  await audit(req, { action: req.body.active ? 'MEMBERSHIP_REACTIVATED' : 'MEMBERSHIP_DEACTIVATED', targetType: 'TenantMembership', targetId: req.params.id, reason: req.body.reason, after: membership });
  res.json({ success: true, membership });
}));

router.get('/activity', asyncRoute(async (req, res) => {
  const { page, limit, skip } = pageQuery(req.query as Record<string, unknown>);
  const match: Record<string, unknown> = {};
  if (req.query.tenantId && mongoose.isValidObjectId(String(req.query.tenantId))) match.tenantId = new mongoose.Types.ObjectId(String(req.query.tenantId));
  if (req.query.action) match.acao = { $regex: String(req.query.action), $options: 'i' };
  const clauses: Record<string, unknown>[] = [];
  if (req.query.targetType) clauses.push({ $or: [{ targetType: req.query.targetType }, { tabela: req.query.targetType }] });
  if (req.query.from || req.query.to) { const range = dateRange(req.query as Record<string, unknown>); match.createdAt = { $gte: range.from, $lte: range.to }; }
  if (req.query.search) clauses.push({ $or: [{ acao: { $regex: String(req.query.search), $options: 'i' } }, { detalhes: { $regex: String(req.query.search), $options: 'i' } }, { reason: { $regex: String(req.query.search), $options: 'i' } }, { documentoId: { $regex: String(req.query.search), $options: 'i' } }] });
  if (clauses.length) match.$and = clauses;
  const [items, total] = await Promise.all([AuditLog.find(match).populate('tenantId', 'displayName slug').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), AuditLog.countDocuments(match)]);
  res.json({ success: true, items: items.map(formatActivity), pagination: pagination(page, limit, total) });
}));

router.get('/reports/:reportKey', asyncRoute(async (req, res) => {
  const { from, to } = dateRange(req.query as Record<string, unknown>);
  const key = req.params.reportKey;
  if (key === 'store-growth') return res.json({ success: true, items: await Tenant.aggregate([{ $match: { createdAt: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m' } }, value: { $sum: 1 } } }, { $sort: { _id: 1 } }]) });
  if (key === 'revenue') return res.json({ success: true, items: await Invoice.aggregate([{ $match: { createdAt: { $gte: from, $lte: to } } }, { $group: { _id: { month: { $dateToString: { date: '$createdAt', format: '%Y-%m' } }, status: '$status' }, cents: { $sum: '$amountCents' }, count: { $sum: 1 } } }, { $sort: { '_id.month': 1 } }]) });
  if (key === 'store-ranking') return res.json({ success: true, items: await Order.aggregate([{ $match: { ...validOrders, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: '$tenantId', orders: { $sum: 1 }, gmvCents: { $sum: orderCents } } }, { $lookup: { from: 'tenants', localField: '_id', foreignField: '_id', as: 'tenant' } }, { $unwind: '$tenant' }, { $set: { displayName: '$tenant.displayName', averageOrderCents: { $cond: [{ $gt: ['$orders', 0] }, { $round: [{ $divide: ['$gmvCents', '$orders'] }, 0] }, 0] } } }, { $sort: { gmvCents: -1 } }, { $limit: 100 }]) });
  if (key === 'tenant-status') return res.json({ success: true, items: await Tenant.aggregate([{ $group: { _id: '$status', value: { $sum: 1 } } }, { $sort: { value: -1 } }]) });
  if (key === 'tenant-plan') return res.json({ success: true, items: await Tenant.aggregate([
    { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'plan' } },
    { $set: { plan: { $first: '$plan' } } },
    { $group: { _id: { plan: { $ifNull: ['$plan.name', 'Sem plano'] }, status: '$status' }, value: { $sum: 1 } } },
    { $sort: { '_id.plan': 1, '_id.status': 1 } },
  ]) });
  if (key === 'mrr-by-plan') return res.json({ success: true, items: await Subscription.aggregate([
    { $match: { status: 'active' } },
    { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'plan' } },
    { $unwind: '$plan' },
    { $group: { _id: '$plan.name', cents: { $sum: { $cond: [{ $eq: ['$plan.interval', 'yearly'] }, { $round: [{ $divide: ['$plan.priceCents', 12] }, 0] }, '$plan.priceCents'] } }, count: { $sum: 1 } } },
    { $sort: { cents: -1 } },
  ]) });
  if (key === 'trials-ending') return res.json({ success: true, items: await Subscription.aggregate([
    { $match: { status: 'trial', trialEndsAt: { $gte: from, $lte: to } } },
    { $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 'tenant' } },
    { $set: { tenant: { $first: '$tenant' } } },
    { $project: { _id: 1, displayName: '$tenant.displayName', status: 1, trialEndsAt: 1, value: { $dateDiff: { startDate: new Date(), endDate: '$trialEndsAt', unit: 'day' } } } },
    { $sort: { trialEndsAt: 1 } },
    { $limit: 500 },
  ]) });
  if (key === 'inactive-stores') return res.json({ success: true, items: await Tenant.aggregate([
    { $match: { status: { $nin: ['cancelled', 'archived'] }, $or: [{ lastActivityAt: null }, { lastActivityAt: { $lt: from } }] } },
    { $project: { _id: 1, displayName: 1, status: 1, lastActivityAt: 1, value: { $cond: [{ $ifNull: ['$lastActivityAt', false] }, { $dateDiff: { startDate: '$lastActivityAt', endDate: new Date(), unit: 'day' } }, null] } } },
    { $sort: { lastActivityAt: 1 } },
    { $limit: 500 },
  ]) });
  throw new HttpError(404, 'Relatorio nao encontrado.', 'REPORT_NOT_FOUND');
}));

router.get('/search', asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ success: true, groups: { tenants: [], accounts: [], invoices: [], plans: [] } });
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [tenants, accounts, invoices, plans] = await Promise.all([
    Tenant.find({ $or: [{ displayName: regex }, { slug: regex }, { 'owner.email': regex }] }).select('displayName slug status').limit(6).lean(),
    AdminAccount.find({ $or: [{ name: regex }, { email: regex }] }).select('name email active').limit(6).lean(),
    Invoice.find({ receiptReference: regex }).populate('tenantId', 'displayName slug').select('tenantId status amountCents receiptReference').limit(6).lean(),
    Plan.find({ $or: [{ name: regex }, { code: regex }] }).select('name code active priceCents').limit(6).lean(),
  ]);
  res.json({ success: true, groups: { tenants, accounts, invoices, plans } });
}));

const settingsSchema = z.object({ platformName: z.string().min(2).max(80), timezone: z.string().min(3).max(80), currency: z.literal('BRL'), defaultPeriod: z.enum(['today', '7d', '30d', 'current_month', 'previous_month', 'current_year']), defaultPageSize: z.number().int().min(10).max(100), featureLabels: z.record(z.string(), z.string()).default({}), limitLabels: z.record(z.string(), z.string()).default({}) });
router.get('/settings', asyncRoute(async (_req, res) => res.json({ success: true, settings: await MasterSettings.findOneAndUpdate({ key: 'global' }, { $setOnInsert: { key: 'global' } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }).lean(), billing: { provider: 'manual' }, build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local' })));
router.put('/settings', requireCsrf, validateBody(settingsSchema), asyncRoute(async (req, res) => {
  const settings = await MasterSettings.findOneAndUpdate({ key: 'global' }, { $set: req.body }, { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }).lean();
  await audit(req, { action: 'MASTER_SETTINGS_UPDATED', targetType: 'MasterSettings', targetId: String(settings?._id), after: settings });
  res.json({ success: true, settings });
}));

export default router;
