import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import Product from '../../src/models/Product.js';
import Category from '../../src/models/Category.js';
import Order from '../../src/models/Order.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import AuditLog from '../../src/models/AuditLog.js';
import { resolveTenant } from '../middleware/tenant.js';
import { requireSession, requireTenantMembership, requirePermission } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/auditService.js';
import { reaisToCents } from '../domain/money.js';
import { createTenantUpload } from '../services/storageService.js';
import User from '../../src/models/User.js';
import Subscription from '../models/Subscription.js';
import Invoice from '../models/Invoice.js';
import TenantMembership from '../models/TenantMembership.js';
import AdminAccount from '../models/AdminAccount.js';
import { createInvitation } from '../services/invitationService.js';
import { assertInvitationDeliveryAvailable, deliverAdminInvitation } from '../services/notificationService.js';
import { isProduction } from '../config/env.js';

const router = Router({ mergeParams: true });
router.use(resolveTenant, requireSession, requireTenantMembership);

router.get('/dashboard', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const tenantId = req.tenant?._id;
  const [products, orders, pendingOrders, settings] = await Promise.all([
    Product.countDocuments({ tenantId }),
    Order.countDocuments({ tenantId }),
    Order.countDocuments({ tenantId, status: { $in: ['Pendente', 'Preparando'] } }),
    StoreSettings.findOne({ tenantId }).select('nome_loja is_open').lean(),
  ]);
  res.json({ success: true, metrics: { products, orders, pendingOrders }, settings });
}));

router.get('/catalog', requirePermission('catalog:read'), asyncRoute(async (req, res) => {
  const [categories, products] = await Promise.all([
    Category.find({ tenantId: req.tenant?._id }).sort({ ordem: 1 }).lean(),
    Product.find({ tenantId: req.tenant?._id }).sort({ categoriaId: 1, ordem_categoria: 1 }).lean(),
  ]);
  res.json({ success: true, categories, products });
}));

const productSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  descricao: z.string().trim().max(2_000).default(''),
  preco: z.number().nonnegative(),
  categoriaId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  imagem: z.string().url().or(z.literal('')).default(''),
  ativo: z.boolean().default(true),
  estoque: z.number().int().nonnegative().default(0),
  controlar_estoque: z.boolean().default(false),
  destaque: z.boolean().default(false),
});

router.post('/products', requireCsrf, requirePermission('catalog:write'), validateBody(productSchema), asyncRoute(async (req, res) => {
  const product = await Product.create({ ...req.body, tenantId: req.tenant?._id, preco_centavos: reaisToCents(req.body.preco) });
  await audit(req, { action: 'PRODUCT_CREATED', targetType: 'Product', targetId: product._id.toString(), after: product.toObject() });
  res.status(201).json({ success: true, product });
}));

router.put('/products/:id', requireCsrf, requirePermission('catalog:write'), validateBody(productSchema.partial()), asyncRoute(async (req, res) => {
  const before = await Product.findOne({ _id: req.params.id, tenantId: req.tenant?._id }).lean();
  if (!before) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  const update = { ...req.body };
  if (typeof update.preco === 'number') Object.assign(update, { preco_centavos: reaisToCents(update.preco) });
  const product = await Product.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenant?._id }, { $set: update }, { returnDocument: 'after', runValidators: true }).lean();
  await audit(req, { action: 'PRODUCT_UPDATED', targetType: 'Product', targetId: req.params.id, before, after: product });
  res.json({ success: true, product });
}));

router.get('/audit', requirePermission('audit:read'), asyncRoute(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const logs = await AuditLog.find({ tenantId: req.tenant?._id }).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ success: true, logs });
}));

router.get('/orders', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter: Record<string, unknown> = { tenantId: req.tenant!._id };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ success: true, items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

const orderTransitions: Record<string, string[]> = {
  Pendente: ['Preparando', 'Cancelado'], Preparando: ['Saiu para Entrega', 'Cancelado'],
  'Saiu para Entrega': ['Entregue'], Entregue: [], Cancelado: [],
};
const orderStatusSchema = z.object({ status: z.string().min(2).max(40), reason: z.string().trim().min(3).max(500).optional() });
router.patch('/orders/:id/status', requireCsrf, requirePermission('orders:write'), validateBody(orderStatusSchema), asyncRoute(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenant!._id });
  if (!order) throw new HttpError(404, 'Pedido nao encontrado.', 'NOT_FOUND');
  if (!(orderTransitions[order.status] || []).includes(req.body.status)) throw new HttpError(409, 'Transicao de status invalida.', 'INVALID_STATUS_TRANSITION');
  const before = order.toObject();
  order.status = req.body.status;
  order.historico_status.push({ status: req.body.status, data: new Date() });
  await order.save();
  await audit(req, { action: 'ORDER_STATUS_CHANGED', targetType: 'Order', targetId: order._id.toString(), reason: req.body.reason, before, after: order.toObject() });
  res.json({ success: true, order });
}));

router.get('/customers', requirePermission('customers:read'), asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter: Record<string, unknown> = { tenantId: req.tenant!._id };
  if (req.query.search) filter.$or = [{ nome: { $regex: String(req.query.search), $options: 'i' } }, { normalizedPhone: { $regex: String(req.query.search) } }];
  const [items, total] = await Promise.all([
    User.find(filter).select('-senha').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/customers/:id/export', requirePermission('customers:read'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Cliente nao encontrado.', 'NOT_FOUND');
  const customer = await User.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).select('-senha').lean();
  if (!customer) throw new HttpError(404, 'Cliente nao encontrado.', 'NOT_FOUND');
  const orders = await Order.find({ tenantId: req.tenant!._id, usuarioId: customer._id })
    .select('-trackingTokenHash')
    .sort({ createdAt: 1 })
    .lean();
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
      await User.updateOne(
        { _id: req.params.id, tenantId },
        {
          $set: {
            nome: 'Cliente anonimizado', telefone: anonymizedReference, email: '', nascimento: '', genero: '',
            enderecos: [], pontos: 0, senha: await bcrypt.hash(crypto.randomUUID(), 12),
          },
          $unset: { normalizedPhone: 1 },
          $inc: { tokenVersion: 1 },
        },
        { session },
      );
      await Order.updateMany(
        { tenantId, usuarioId: new mongoose.Types.ObjectId(req.params.id) },
        { $set: { usuarioId: null, 'cliente.nome': 'Cliente anonimizado', 'cliente.telefone': anonymizedReference, 'cliente.endereco': 'Dado anonimizado', observacoes: '' } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  await audit(req, {
    action: 'CUSTOMER_DATA_ANONYMIZED', targetType: 'User', targetId: req.params.id,
    reason: req.body.reason, before, after: { anonymized: true, reference: anonymizedReference },
  });
  res.json({ success: true, reference: anonymizedReference });
}));

router.get('/settings', requirePermission('settings:read'), asyncRoute(async (req, res) => {
  res.json({ success: true, settings: await StoreSettings.findOne({ tenantId: req.tenant!._id }).select('-chave_pix').lean() });
}));

const settingsSchema = z.object({
  nome_loja: z.string().trim().min(2).max(120).optional(), is_open: z.boolean().optional(), tempo_entrega: z.string().max(80).optional(),
  whatsapp: z.string().max(30).optional(), pedido_minimo: z.number().nonnegative().optional(), fidelidade_ativa: z.boolean().optional(),
  pagamento_pix: z.boolean().optional(), pagamento_cartao: z.boolean().optional(), pagamento_dinheiro: z.boolean().optional(),
  theme: z.object({ primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i) }).optional(),
}).strict();
router.put('/settings', requireCsrf, requirePermission('settings:write'), validateBody(settingsSchema), asyncRoute(async (req, res) => {
  const before = await StoreSettings.findOne({ tenantId: req.tenant!._id }).lean();
  const settings = await StoreSettings.findOneAndUpdate({ tenantId: req.tenant!._id }, { $set: req.body }, { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }).lean();
  await audit(req, { action: 'SETTINGS_UPDATED', targetType: 'StoreSettings', targetId: settings!._id.toString(), before, after: settings });
  res.json({ success: true, settings });
}));

router.get('/team', requirePermission('team:read'), asyncRoute(async (req, res) => {
  const items = await TenantMembership.find({ tenantId: req.tenant!._id }).populate('accountId', 'name email active lastLoginAt').sort({ createdAt: 1 }).lean();
  res.json({ success: true, items });
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
  res.status(201).json({ success: true, invitation: { id: invitation._id, expiresAt: invitation.expiresAt, ...(!isProduction() ? { token } : {}) } });
}));

router.get('/billing', requirePermission('billing:read'), asyncRoute(async (req, res) => {
  const [subscription, invoices] = await Promise.all([
    Subscription.findOne({ tenantId: req.tenant!._id }).populate('planId').lean(),
    Invoice.find({ tenantId: req.tenant!._id }).sort({ dueAt: -1 }).limit(50).lean(),
  ]);
  res.json({ success: true, subscription, invoices });
}));

const uploadSchema = z.object({ target: z.enum(['product', 'store']), mimeType: z.literal('image/webp'), size: z.number().int().positive().max(5 * 1024 * 1024) });
router.post('/uploads/sign', requireCsrf, requirePermission('catalog:write'), validateBody(uploadSchema), asyncRoute(async (req, res) => {
  const upload = await createTenantUpload(req.tenant!._id, req.body.target, req.body.size);
  await audit(req, { action: 'UPLOAD_SIGNED', targetType: 'StorageObject', targetId: upload.path });
  res.status(201).json({ success: true, upload });
}));

export default router;
