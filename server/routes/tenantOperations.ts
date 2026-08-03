import { Router } from 'express';
import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import Product from '../../src/models/Product.js';
import Category from '../../src/models/Category.js';
import Order from '../../src/models/Order.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import HomeBlock from '../../src/models/HomeBlock.js';
import Coupon from '../../src/models/Coupon.js';
import User from '../../src/models/User.js';
import AuditLog from '../../src/models/AuditLog.js';
import AdminAccount from '../models/AdminAccount.js';
import TenantMembership from '../models/TenantMembership.js';
import { requirePermission } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/auditService.js';
import { reaisToCents } from '../domain/money.js';

const router = Router({ mergeParams: true });
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const optionalCategoryId = z.preprocess((value) => value === '' ? null : value, objectId.nullable().optional());
const money = z.coerce.number().finite().nonnegative();

const additionalItemSchema = z.object({
  _id: z.unknown().optional(),
  nome: z.string().trim().min(1).max(160),
  preco: money.default(0),
  preco_centavos: z.coerce.number().int().nonnegative().optional(),
  ativo: z.boolean().default(true),
});

const additionalGroupSchema = z.object({
  _id: z.unknown().optional(),
  nome: z.string().trim().min(1).max(160),
  obrigatorio: z.boolean().default(false),
  minimo: z.coerce.number().int().nonnegative().default(0),
  maximo: z.coerce.number().int().positive().default(1),
  itens: z.array(additionalItemSchema).max(100).default([]),
}).refine((group) => group.maximo >= group.minimo, { message: 'O maximo do grupo deve ser maior ou igual ao minimo.' });

const productSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  descricao: z.string().trim().max(2_000).default(''),
  preco: money,
  preco_antigo: money.default(0),
  imagem: z.string().url().or(z.literal('')).default(''),
  personalizavel: z.boolean().default(false),
  quantidade_total_opcoes: z.coerce.number().int().nonnegative().default(0),
  opcoes_disponiveis: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  controlar_estoque: z.boolean().default(false),
  estoque: z.coerce.number().int().nonnegative().default(0),
  esgotado: z.boolean().default(false),
  categoriaId: optionalCategoryId,
  ativo: z.boolean().default(true),
  ordem: z.coerce.number().int().default(999),
  ordem_categoria: z.coerce.number().int().default(999),
  destaque: z.boolean().default(false),
  selo_destaque: z.string().trim().max(80).default(''),
  promocao: z.boolean().default(false),
  pode_resgatar: z.boolean().default(false),
  pontos_resgate: z.coerce.number().int().nonnegative().default(0),
  grupos_adicionais: z.array(additionalGroupSchema).max(30).default([]),
});

function productMoneyFields(product: z.infer<typeof productSchema>) {
  return {
    ...product,
    preco_centavos: reaisToCents(product.preco),
    preco_antigo_centavos: reaisToCents(product.preco_antigo || 0),
    grupos_adicionais: product.grupos_adicionais.map((group) => ({
      ...group,
      itens: group.itens.map((item) => ({ ...item, preco_centavos: reaisToCents(item.preco || 0) })),
    })),
  };
}

router.get('/me', asyncRoute(async (req, res) => {
  const [account, membership] = await Promise.all([
    AdminAccount.findById(req.auth!.accountId).select('name email active lastLoginAt').lean(),
    TenantMembership.findOne({ tenantId: req.tenant!._id, accountId: req.auth!.accountId, active: true }).select('role acceptedAt').lean(),
  ]);
  if (!account || !membership) throw new HttpError(401, 'Sessao da loja invalida.', 'INVALID_SESSION');
  res.json({
    success: true,
    account: { id: account._id, name: account.name, email: account.email, lastLoginAt: account.lastLoginAt },
    tenant: { id: req.tenant!._id, slug: req.tenant!.slug, name: req.tenant!.displayName },
    membership: { role: membership.role, acceptedAt: membership.acceptedAt },
    permissions: req.auth!.permissions,
  });
}));

router.get('/dashboard', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const tenantId = req.tenant!._id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  const [products, categories, orders, settings, blocks] = await Promise.all([
    Product.countDocuments({ tenantId }),
    Category.countDocuments({ tenantId }),
    Order.find({ tenantId, createdAt: { $gte: weekStart } }).sort({ createdAt: -1 }).lean(),
    StoreSettings.findOne({ tenantId }).lean(),
    HomeBlock.countDocuments({ tenantId, ativo: { $ne: false } }),
  ]);
  type DashboardOrder = { total?: number; total_centavos?: number; createdAt: Date | string };
  const dashboardOrders = orders as unknown as DashboardOrder[];
  const totalOf = (order: DashboardOrder) => Number(order.total ?? (Number(order.total_centavos || 0) / 100));
  const todayOrders = dashboardOrders.filter((order) => new Date(order.createdAt) >= today);
  const revenueToday = todayOrders.reduce((sum, order) => sum + totalOf(order), 0);
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const total = dashboardOrders.filter((order) => new Date(order.createdAt).toDateString() === date.toDateString()).reduce((sum, order) => sum + totalOf(order), 0);
    return { date: date.toISOString().slice(0, 10), label: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3), total };
  });
  res.json({
    success: true,
    metrics: {
      products,
      categories,
      orders: await Order.countDocuments({ tenantId }),
      pendingOrders: await Order.countDocuments({ tenantId, status: { $in: ['Pendente', 'Preparando', 'Saiu para Entrega'] } }),
      ordersToday: todayOrders.length,
      revenueToday,
      averageOrderToday: todayOrders.length ? revenueToday / todayOrders.length : 0,
      revenueWeek: weekly.reduce((sum, day) => sum + day.total, 0),
    },
    weekly,
    recentOrders: orders.slice(0, 5),
    settings,
    activeHomeBlocks: blocks,
  });
}));

router.get('/orders', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter: Record<string, unknown> = { tenantId: req.tenant!._id };
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.search) {
    const search = String(req.query.search).trim();
    filter.$or = [
      { 'cliente.nome': { $regex: search, $options: 'i' } },
      { 'cliente.telefone': { $regex: search } },
      ...(Number.isFinite(Number(search)) ? [{ orderNumber: Number(search) }] : []),
    ];
  }
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ success: true, items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

const orderTransitions: Record<string, string[]> = {
  Pendente: ['Preparando', 'Saiu para Entrega', 'Entregue', 'Cancelado'],
  Preparando: ['Saiu para Entrega', 'Entregue', 'Cancelado'],
  'Saiu para Entrega': ['Entregue', 'Cancelado'],
  Entregue: [],
  Cancelado: [],
};
const orderStatusSchema = z.object({ status: z.enum(['Pendente', 'Preparando', 'Saiu para Entrega', 'Entregue', 'Cancelado']), reason: z.string().trim().min(3).max(500).optional() });
router.patch('/orders/:id/status', requireCsrf, requirePermission('orders:write'), validateBody(orderStatusSchema), asyncRoute(async (req, res) => {
  const session = await mongoose.startSession();
  let before: Record<string, any> | null = null;
  let updated: Record<string, any> | null = null;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).session(session);
      if (!order) throw new HttpError(404, 'Pedido nao encontrado.', 'NOT_FOUND');
      if (order.status !== req.body.status && !(orderTransitions[order.status] || []).includes(req.body.status)) throw new HttpError(409, 'Transicao de status invalida.', 'INVALID_STATUS_TRANSITION');
      if (order.status === req.body.status) { updated = order.toObject(); return; }
      before = order.toObject();
      order.status = req.body.status;
      order.historico_status.push({ status: req.body.status, data: new Date() });
      if (order.usuarioId && req.body.status === 'Cancelado' && order.pontos_utilizados > 0 && !order.loyaltyRedeemReverted) {
        await User.updateOne({ _id: order.usuarioId, tenantId: req.tenant!._id }, { $inc: { pontos: order.pontos_utilizados } }, { session });
        order.loyaltyRedeemReverted = true;
      }
      if (order.usuarioId && req.body.status === 'Entregue' && !order.loyaltyCreditApplied) {
        const settings = await StoreSettings.findOne({ tenantId: req.tenant!._id }).select('fidelidade_ativa pontos_por_real').session(session).lean();
        const earned = settings?.fidelidade_ativa ? Math.max(0, Math.floor((Number(order.total_centavos || Math.round(order.total * 100)) / 100) * Number(settings.pontos_por_real || 0))) : 0;
        if (earned > 0) await User.updateOne({ _id: order.usuarioId, tenantId: req.tenant!._id }, { $inc: { pontos: earned } }, { session });
        order.pontos_creditados = earned;
        order.loyaltyCreditApplied = true;
      }
      await order.save({ session });
      updated = order.toObject();
    });
  } finally {
    await session.endSession();
  }
  if (before) await audit(req, { action: 'ORDER_STATUS_CHANGED', targetType: 'Order', targetId: req.params.id, reason: req.body.reason, before, after: updated });
  res.json({ success: true, order: updated });
}));

router.get('/products', requirePermission('catalog:read'), asyncRoute(async (req, res) => {
  const items = await Product.find({ tenantId: req.tenant!._id })
    .populate('categoriaId', 'nome ordem')
    .sort({ categoriaId: 1, ordem_categoria: 1, createdAt: 1 })
    .lean();
  res.json({ success: true, items, pagination: { page: 1, limit: items.length, total: items.length, pages: 1 } });
}));

router.post('/products', requireCsrf, requirePermission('catalog:write'), validateBody(productSchema), asyncRoute(async (req, res) => {
  if (req.body.categoriaId && !await Category.exists({ _id: req.body.categoriaId, tenantId: req.tenant!._id })) throw new HttpError(400, 'Categoria invalida.', 'INVALID_CATEGORY');
  const product = await Product.create({ ...productMoneyFields(req.body), tenantId: req.tenant!._id });
  await audit(req, { action: 'PRODUCT_CREATED', targetType: 'Product', targetId: product._id.toString(), after: product.toObject() });
  res.status(201).json({ success: true, product });
}));

router.put('/products/:id', requireCsrf, requirePermission('catalog:write'), validateBody(productSchema.partial()), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  if (req.body.categoriaId && !await Category.exists({ _id: req.body.categoriaId, tenantId: req.tenant!._id })) throw new HttpError(400, 'Categoria invalida.', 'INVALID_CATEGORY');
  const before = await Product.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!before) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  const parsed = productSchema.partial().parse(req.body);
  const update: Record<string, unknown> = { ...parsed };
  if (typeof parsed.preco === 'number') update.preco_centavos = reaisToCents(parsed.preco);
  if (typeof parsed.preco_antigo === 'number') update.preco_antigo_centavos = reaisToCents(parsed.preco_antigo);
  if (parsed.grupos_adicionais) update.grupos_adicionais = parsed.grupos_adicionais.map((group) => ({ ...group, itens: group.itens.map((item) => ({ ...item, preco_centavos: reaisToCents(item.preco || 0) })) }));
  const product = await Product.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenant!._id }, { $set: update }, { returnDocument: 'after', runValidators: true }).lean();
  await audit(req, { action: 'PRODUCT_UPDATED', targetType: 'Product', targetId: req.params.id, before, after: product });
  res.json({ success: true, product });
}));

const deleteProductSchema = z.object({ email: z.string().email(), senha: z.string().min(1).max(128) });
router.delete('/products/:id', requireCsrf, requirePermission('catalog:write'), validateBody(deleteProductSchema), asyncRoute(async (req, res) => {
  const account = await AdminAccount.findById(req.auth!.accountId).select('+passwordHash email active').lean();
  if (!account?.active || account.email.toLowerCase() !== req.body.email.toLowerCase() || !await bcrypt.compare(req.body.senha, account.passwordHash)) throw new HttpError(403, 'Credenciais administrativas invalidas.', 'IDENTITY_MISMATCH');
  const product = await Product.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!product) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  await audit(req, { action: 'PRODUCT_DELETED', targetType: 'Product', targetId: req.params.id, before: product });
  res.json({ success: true });
}));

async function toggleProduct(req: Request, field: 'ativo' | 'esgotado') {
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenant!._id });
  if (!product) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  product.set(field, !product.get(field));
  await product.save();
  await audit(req, { action: field === 'ativo' ? 'PRODUCT_ACTIVE_TOGGLED' : 'PRODUCT_SOLD_OUT_TOGGLED', targetType: 'Product', targetId: product._id.toString(), after: { [field]: product.get(field) } });
  return product;
}

router.patch('/products/:id/toggle-active', requireCsrf, requirePermission('catalog:write'), asyncRoute(async (req, res) => res.json({ success: true, product: await toggleProduct(req, 'ativo') })));
router.patch('/products/:id/toggle-sold-out', requireCsrf, requirePermission('catalog:write'), asyncRoute(async (req, res) => res.json({ success: true, product: await toggleProduct(req, 'esgotado') })));

router.get('/categories', requirePermission('catalog:read'), asyncRoute(async (req, res) => {
  const items = await Category.find({ tenantId: req.tenant!._id }).sort({ ordem: 1, createdAt: 1 }).lean();
  res.json({ success: true, items, pagination: { page: 1, limit: items.length, total: items.length, pages: 1 } });
}));

const categorySchema = z.object({ nome: z.string().trim().min(2).max(120), descricao: z.string().trim().max(500).default(''), ordem: z.coerce.number().int().optional() });
router.post('/categories', requireCsrf, requirePermission('catalog:write'), validateBody(categorySchema), asyncRoute(async (req, res) => {
  const category = await Category.create({ ...req.body, tenantId: req.tenant!._id });
  await audit(req, { action: 'CATEGORY_CREATED', targetType: 'Category', targetId: category._id.toString(), after: category.toObject() });
  res.status(201).json({ success: true, category });
}));
router.put('/categories/:id', requireCsrf, requirePermission('catalog:write'), validateBody(categorySchema.partial()), asyncRoute(async (req, res) => {
  const before = await Category.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!before) throw new HttpError(404, 'Categoria nao encontrada.', 'NOT_FOUND');
  const category = await Category.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenant!._id }, { $set: req.body }, { returnDocument: 'after', runValidators: true }).lean();
  await audit(req, { action: 'CATEGORY_UPDATED', targetType: 'Category', targetId: req.params.id, before, after: category });
  res.json({ success: true, category });
}));
router.delete('/categories/:id', requireCsrf, requirePermission('catalog:write'), asyncRoute(async (req, res) => {
  if (await Product.exists({ tenantId: req.tenant!._id, categoriaId: req.params.id })) throw new HttpError(409, 'Existem produtos vinculados a esta categoria.', 'CATEGORY_NOT_EMPTY');
  const category = await Category.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!category) throw new HttpError(404, 'Categoria nao encontrada.', 'NOT_FOUND');
  await audit(req, { action: 'CATEGORY_DELETED', targetType: 'Category', targetId: req.params.id, before: category });
  res.json({ success: true });
}));

router.get('/catalog/structure', requirePermission('catalog:read'), asyncRoute(async (req, res) => {
  const [categories, products] = await Promise.all([
    Category.find({ tenantId: req.tenant!._id }).sort({ ordem: 1, createdAt: 1 }).lean(),
    Product.find({ tenantId: req.tenant!._id }).sort({ ordem_categoria: 1, createdAt: 1 }).lean(),
  ]);
  const groups = categories.map((category) => ({ ...category, produtos: products.filter((product) => String(product.categoriaId || '') === String(category._id)) }));
  res.json({ success: true, categories: groups, uncategorized: products.filter((product) => !product.categoriaId) });
}));

const structureSchema = z.object({
  categories: z.array(z.object({ id: objectId, ordem: z.coerce.number().int().nonnegative() })).max(500),
  productOrders: z.array(z.object({ id: objectId, ordem_categoria: z.coerce.number().int().nonnegative(), destaque: z.boolean(), categoriaId: objectId.nullable() })).max(10_000),
});
router.put('/catalog/structure', requireCsrf, requirePermission('catalog:write'), validateBody(structureSchema), asyncRoute(async (req, res) => {
  const tenantId = req.tenant!._id;
  const payload = req.body as z.infer<typeof structureSchema>;
  const categoryIds = payload.categories.map((item) => item.id);
  const productIds = payload.productOrders.map((item) => item.id);
  const [categoryCount, productCount] = await Promise.all([
    Category.countDocuments({ tenantId, _id: { $in: categoryIds } }),
    Product.countDocuments({ tenantId, _id: { $in: productIds } }),
  ]);
  if (categoryCount !== categoryIds.length || productCount !== productIds.length) throw new HttpError(400, 'A estrutura possui itens de outra loja ou inexistentes.', 'INVALID_CATALOG_STRUCTURE');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (payload.categories.length) {
        await Category.bulkWrite(payload.categories.map((item) => ({
          updateOne: { filter: { _id: item.id, tenantId }, update: { $set: { ordem: item.ordem } } },
        })), { session });
      }
      if (payload.productOrders.length) {
        await Product.bulkWrite(payload.productOrders.map((item) => ({
          updateOne: { filter: { _id: item.id, tenantId }, update: { $set: { ordem_categoria: item.ordem_categoria, destaque: item.destaque, categoriaId: item.categoriaId } } },
        })), { session });
      }
    });
  } finally {
    await session.endSession();
  }
  await audit(req, { action: 'CATALOG_STRUCTURE_UPDATED', targetType: 'Catalog', targetId: tenantId.toString(), after: { categories: payload.categories.length, products: payload.productOrders.length } });
  res.json({ success: true });
}));

const daySchema = z.object({ aberto: z.boolean(), inicio: z.string().regex(/^\d{2}:\d{2}$/), fim: z.string().regex(/^\d{2}:\d{2}$/) });
const themeSchema = z.object({ primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i), primaryTextColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), primaryHoverColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), primarySoftColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), primaryBorderColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional() });
const settingsSchema = z.object({
  is_open: z.boolean().optional(), nome_loja: z.string().trim().min(2).max(120).optional(), tagline: z.string().max(160).optional(),
  logo_url: z.string().url().or(z.literal('')).optional(), capa_url: z.string().url().or(z.literal('')).optional(), logoShape: z.enum(['circle', 'squircle']).optional(), theme: themeSchema.optional(),
  secondaryBanners: z.array(z.object({ id: z.string().min(1).max(80), imageUrl: z.string().url().or(z.literal('')), active: z.boolean(), link: z.string().max(500) })).max(10).optional(),
  logisticsOptions: z.object({ allowPickup: z.boolean(), allowDelivery: z.boolean() }).optional(), tempo_entrega: z.string().max(80).optional(), whatsapp: z.string().max(30).optional(),
  sobre_texto: z.string().max(5_000).optional(), instagram_url: z.string().max(500).optional(), cep_loja: z.string().max(12).optional(), rua_loja: z.string().max(200).optional(), numero_loja: z.string().max(30).optional(), bairro_loja: z.string().max(120).optional(), cidade_loja: z.string().max(120).optional(), estado_loja: z.string().max(2).optional(),
  faixas_entrega: z.array(z.object({ km_ate: money, valor: money })).max(100).optional(), abertura_automatica: z.boolean().optional(), mensagem_fechado: z.string().max(500).optional(),
  horarios_funcionamento: z.object({ domingo: daySchema, segunda: daySchema, terca: daySchema, quarta: daySchema, quinta: daySchema, sexta: daySchema, sabado: daySchema }).optional(),
  pedido_minimo: money.optional(), frete_gratis_acima_de: money.optional(), pagamento_pix: z.boolean().optional(), pagamento_cartao: z.boolean().optional(), pagamento_dinheiro: z.boolean().optional(), chave_pix: z.string().max(300).optional(), instrucoes_pix: z.string().max(1_000).optional(),
  banner_ativo: z.boolean().optional(), banner_texto: z.string().max(500).optional(), cupom_global_ativo: z.boolean().optional(), fidelidade_ativa: z.boolean().optional(), pontos_por_real: money.optional(), valor_ponto_reais: money.optional(),
});
router.get('/settings', requirePermission('settings:read'), asyncRoute(async (req, res) => res.json({ success: true, settings: await StoreSettings.findOne({ tenantId: req.tenant!._id }).lean() })));
router.put('/settings', requireCsrf, requirePermission('settings:write'), validateBody(settingsSchema), asyncRoute(async (req, res) => {
  const before = await StoreSettings.findOne({ tenantId: req.tenant!._id }).lean();
  const settings = await StoreSettings.findOneAndUpdate({ tenantId: req.tenant!._id }, { $set: req.body }, { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }).lean();
  await audit(req, { action: 'SETTINGS_UPDATED', targetType: 'StoreSettings', targetId: settings!._id.toString(), before, after: settings });
  res.json({ success: true, settings });
}));

const homeBlockSchema = z.object({
  titulo: z.string().max(200).default(''), subtitulo: z.string().max(300).default(''), descricao: z.string().max(5_000).default(''), imagem_desktop: z.string().url().or(z.literal('')).default(''), imagem_mobile: z.string().url().or(z.literal('')).default(''), link_destino: z.string().max(1_000).default(''), texto_botao: z.string().max(120).default(''),
  tipo_bloco: z.enum(['banner_principal', 'card_promocional', 'card_institucional', 'fidelidade', 'texto']).default('card_promocional'), posicao_exibicao: z.enum(['below_hero', 'before_products', 'middle_home', 'after_products']).default('below_hero'), acao_clique: z.enum(['nenhuma', 'link', 'modal']).default('nenhuma'),
  modal_titulo: z.string().max(200).default(''), modal_texto_completo: z.string().max(10_000).default(''), modal_imagem: z.string().url().or(z.literal('')).default(''), modal_cta_texto: z.string().max(120).default(''), modal_cta_link: z.string().max(1_000).default(''), ativo: z.boolean().default(true), ordem: z.coerce.number().int().default(999), abrir_nova_aba: z.boolean().default(false), cor_fundo: z.string().regex(/^#[0-9a-f]{6}$/i).default('#ffffff'), cor_texto: z.string().regex(/^#[0-9a-f]{6}$/i).default('#000000'),
});
router.get('/home-blocks', requirePermission('settings:read'), asyncRoute(async (req, res) => {
  const items = await HomeBlock.find({ tenantId: req.tenant!._id }).sort({ posicao_exibicao: 1, ordem: 1 }).lean();
  res.json({ success: true, items, pagination: { page: 1, limit: items.length, total: items.length, pages: 1 } });
}));
router.post('/home-blocks', requireCsrf, requirePermission('settings:write'), validateBody(homeBlockSchema), asyncRoute(async (req, res) => {
  const block = await HomeBlock.create({ ...req.body, tenantId: req.tenant!._id });
  await audit(req, { action: 'HOME_BLOCK_CREATED', targetType: 'HomeBlock', targetId: block._id.toString(), after: block.toObject() });
  res.status(201).json({ success: true, block });
}));
const blockBatchSchema = z.object({ updates: z.array(z.object({ id: objectId, ordem: z.coerce.number().int(), ativo: z.boolean() })).max(500) });
router.put('/home-blocks/reorder', requireCsrf, requirePermission('settings:write'), validateBody(blockBatchSchema), asyncRoute(async (req, res) => {
  const payload = req.body as z.infer<typeof blockBatchSchema>;
  const ids = payload.updates.map((item) => item.id);
  if (await HomeBlock.countDocuments({ tenantId: req.tenant!._id, _id: { $in: ids } }) !== ids.length) throw new HttpError(400, 'Lista de blocos invalida.', 'INVALID_HOME_BLOCKS');
  await Promise.all(payload.updates.map((item) => HomeBlock.updateOne({ _id: item.id, tenantId: req.tenant!._id }, { $set: { ordem: item.ordem, ativo: item.ativo } })));
  await audit(req, { action: 'HOME_BLOCKS_REORDERED', targetType: 'HomeBlock', targetId: req.tenant!._id.toString(), after: { count: ids.length } });
  res.json({ success: true });
}));
router.put('/home-blocks/:id', requireCsrf, requirePermission('settings:write'), validateBody(homeBlockSchema.partial()), asyncRoute(async (req, res) => {
  const block = await HomeBlock.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenant!._id }, { $set: req.body }, { returnDocument: 'after', runValidators: true }).lean();
  if (!block) throw new HttpError(404, 'Bloco nao encontrado.', 'NOT_FOUND');
  await audit(req, { action: 'HOME_BLOCK_UPDATED', targetType: 'HomeBlock', targetId: req.params.id, after: block });
  res.json({ success: true, block });
}));
router.delete('/home-blocks/:id', requireCsrf, requirePermission('settings:write'), asyncRoute(async (req, res) => {
  const block = await HomeBlock.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!block) throw new HttpError(404, 'Bloco nao encontrado.', 'NOT_FOUND');
  await audit(req, { action: 'HOME_BLOCK_DELETED', targetType: 'HomeBlock', targetId: req.params.id, before: block });
  res.json({ success: true });
}));
router.get('/customers', requirePermission('customers:read'), asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter: Record<string, unknown> = { tenantId: req.tenant!._id };
  if (req.query.search) filter.$or = [{ nome: { $regex: String(req.query.search), $options: 'i' } }, { telefone: { $regex: String(req.query.search) } }, { email: { $regex: String(req.query.search), $options: 'i' } }];
  const [items, total] = await Promise.all([
    User.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit }, { $limit: limit },
      { $lookup: { from: 'orders', let: { userId: '$_id', tenant: '$tenantId' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$usuarioId', '$$userId'] }, { $eq: ['$tenantId', '$$tenant'] }] } } }], as: 'orders' } },
      { $addFields: { total_pedidos: { $size: '$orders' }, total_gasto: { $sum: '$orders.total' } } },
      { $project: { senha: 0, orders: 0, tokenVersion: 0 } },
    ]),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
router.get('/customers/:id', requirePermission('customers:read'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Cliente nao encontrado.', 'NOT_FOUND');
  const [customer, orders] = await Promise.all([
    User.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).select('-senha -tokenVersion').lean(),
    Order.find({ tenantId: req.tenant!._id, usuarioId: req.params.id })
      .select('-trackingTokenHash')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);
  if (!customer) throw new HttpError(404, 'Cliente nao encontrado.', 'NOT_FOUND');
  res.json({ success: true, customer, orders });
}));
const pointsSchema = z.object({ pontos: z.coerce.number().int().nonnegative(), reason: z.string().trim().min(3).max(300) });
router.patch('/customers/:id/points', requireCsrf, requirePermission('customers:write'), validateBody(pointsSchema), asyncRoute(async (req, res) => {
  const before = await User.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).select('pontos').lean();
  if (!before) throw new HttpError(404, 'Cliente nao encontrado.', 'NOT_FOUND');
  const customer = await User.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenant!._id }, { $set: { pontos: req.body.pontos } }, { returnDocument: 'after' }).select('-senha').lean();
  await audit(req, { action: 'CUSTOMER_POINTS_UPDATED', targetType: 'User', targetId: req.params.id, reason: req.body.reason, before, after: { pontos: customer!.pontos } });
  res.json({ success: true, customer });
}));

router.get('/coupons', requirePermission('coupons:write'), asyncRoute(async (req, res) => {
  const items = await Coupon.find({ tenantId: req.tenant!._id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, items, pagination: { page: 1, limit: items.length, total: items.length, pages: 1 } });
}));
const couponSchema = z.object({ codigo: z.string().trim().min(2).max(40), tipo: z.enum(['fixo', 'porcentagem']), valor: money, minimo_pedido: money.default(0), validade: z.preprocess((value) => value === '' || value == null ? undefined : value, z.coerce.date().optional()), usos_restantes: z.coerce.number().int().min(-1).default(-1), ativo: z.boolean().default(true) });
router.post('/coupons', requireCsrf, requirePermission('coupons:write'), validateBody(couponSchema), asyncRoute(async (req, res) => {
  const normalizedCode = req.body.codigo.toUpperCase().replace(/\s+/g, '');
  if (await Coupon.exists({ tenantId: req.tenant!._id, normalizedCode })) throw new HttpError(409, 'Este codigo de cupom ja existe.', 'COUPON_EXISTS');
  const coupon = await Coupon.create({ ...req.body, codigo: normalizedCode, normalizedCode, tenantId: req.tenant!._id, valor_centavos: req.body.tipo === 'fixo' ? reaisToCents(req.body.valor) : undefined });
  await audit(req, { action: 'COUPON_CREATED', targetType: 'Coupon', targetId: coupon._id.toString(), after: coupon.toObject() });
  res.status(201).json({ success: true, coupon });
}));
router.delete('/coupons/:id', requireCsrf, requirePermission('coupons:write'), asyncRoute(async (req, res) => {
  const coupon = await Coupon.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!coupon) throw new HttpError(404, 'Cupom nao encontrado.', 'NOT_FOUND');
  await audit(req, { action: 'COUPON_DELETED', targetType: 'Coupon', targetId: req.params.id, before: coupon });
  res.json({ success: true });
}));

router.get('/audit', requirePermission('audit:read'), asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter: Record<string, unknown> = { tenantId: req.tenant!._id };
  if (req.query.search) filter.$or = [
    { acao: { $regex: String(req.query.search), $options: 'i' } },
    { detalhes: { $regex: String(req.query.search), $options: 'i' } },
    { targetType: { $regex: String(req.query.search), $options: 'i' } },
    { reason: { $regex: String(req.query.search), $options: 'i' } },
  ];
  if (req.query.action) filter.acao = String(req.query.action);
  if (req.query.targetType) filter.targetType = String(req.query.targetType);
  if (req.query.from || req.query.to) {
    const createdAt: Record<string, Date> = {};
    if (req.query.from) createdAt.$gte = new Date(String(req.query.from));
    if (req.query.to) createdAt.$lte = new Date(String(req.query.to));
    filter.createdAt = createdAt;
  }
  const [items, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), AuditLog.countDocuments(filter)]);
  res.json({ success: true, items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/reports/summary', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const tenantId = req.tenant!._id;
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  const orders = await Order.find({ tenantId, createdAt: { $gte: from, $lte: to } }).sort({ createdAt: 1 }).lean();
  const validOrders = orders.filter((order) => order.status !== 'Cancelado');
  const totalOf = (order: Record<string, any>) => Number(order.total ?? (Number(order.total_centavos || 0) / 100));
  const revenue = validOrders.reduce((sum, order) => sum + totalOf(order), 0);
  const byStatus = orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});
  const byDay = validOrders.reduce<Record<string, { orders: number; revenue: number }>>((acc, order) => {
    const key = new Date(order.createdAt).toISOString().slice(0, 10);
    acc[key] ||= { orders: 0, revenue: 0 };
    acc[key].orders += 1;
    acc[key].revenue += totalOf(order);
    return acc;
  }, {});
  res.json({
    success: true,
    period: { from, to },
    metrics: { orders: orders.length, validOrders: validOrders.length, cancelled: orders.length - validOrders.length, revenue, averageOrder: validOrders.length ? revenue / validOrders.length : 0 },
    byStatus,
    byDay: Object.entries(byDay).map(([date, values]) => ({ date, ...values })),
  });
}));

export default router;
