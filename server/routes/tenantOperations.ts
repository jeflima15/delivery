import { Router } from 'express';
import crypto from 'node:crypto';
import type { Request } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Product from '../../src/models/Product.js';
import Category from '../../src/models/Category.js';
import Order from '../../src/models/Order.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import HomeBlock from '../../src/models/HomeBlock.js';
import Coupon from '../../src/models/Coupon.js';
import ComplementGroup from '../../src/models/ComplementGroup.js';
import User from '../../src/models/User.js';
import AuditLog from '../../src/models/AuditLog.js';
import Tenant from '../models/Tenant.js';
import CustomerPasswordRecovery from '../models/CustomerPasswordRecovery.js';
import { requirePermission } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/auditService.js';
import { reaisToCents } from '../domain/money.js';
import { paymentMethodLabel } from '../../src/lib/paymentMethods.js';
import { deleteStoredFile } from '../services/storageService.js';
import { getEnv } from '../config/env.js';
import { computeIsStoreOpen } from '../../src/lib/storeStatus.js';


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

const complementGroupBaseSchema = z.object({
  nome: z.string().trim().min(1).max(160),
  obrigatorio: z.boolean().default(false),
  minimo: z.coerce.number().int().nonnegative().default(0),
  maximo: z.coerce.number().int().positive().default(1),
  ativo: z.boolean().default(true),
  ordem: z.coerce.number().int().default(999),
  itens: z.array(additionalItemSchema).max(100).default([]),
  produtos_vinculados: z.array(objectId).default([]),
  categorias_vinculadas: z.array(objectId).default([]),
});

const complementGroupSchema = complementGroupBaseSchema.refine((group) => group.maximo >= group.minimo, { message: 'O maximo do grupo deve ser maior ou igual ao minimo.' });

const comboOptionSchema = z.object({
  _id: z.unknown().optional(),
  produtoId: z.preprocess((value) => String(value), objectId),
  acrescimo_centavos: z.coerce.number().int().nonnegative().default(0),
  ordem: z.coerce.number().int().nonnegative().default(0),
});

const comboStageSchema = z.object({
  _id: z.unknown().optional(),
  nome: z.string().trim().min(2).max(160),
  ordem: z.coerce.number().int().nonnegative().default(0),
  valor_etapa_centavos: z.coerce.number().int().nonnegative(),
  cobrar_complementos: z.boolean().default(true),
  opcoes: z.array(comboOptionSchema).min(1, 'Adicione ao menos um produto nesta etapa.').max(100),
}).superRefine((stage, context) => {
  const productIds = stage.opcoes.map((option) => option.produtoId);
  if (new Set(productIds).size !== productIds.length) context.addIssue({ code: 'custom', path: ['opcoes'], message: 'Um produto nao pode aparecer duas vezes na mesma etapa.' });
});

const productBaseSchema = z.object({
  tipo: z.enum(['produto', 'combo']).default('produto'),
  nome: z.string().trim().min(2).max(160),
  descricao: z.string().trim().max(2_000).default(''),
  preco: money.default(0),
  preco_antigo: money.default(0),
  imagem: z.string().url().or(z.literal('')).default(''),
  personalizavel: z.boolean().default(false),
  quantidade_total_opcoes: z.coerce.number().int().nonnegative().default(0),
  opcoes_disponiveis: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  controlar_estoque: z.boolean().default(false),
  estoque: z.coerce.number().int().nonnegative().default(0),
  estoque_minimo: z.coerce.number().int().nonnegative().default(0),
  esgotado: z.boolean().default(false),
  permite_talheres: z.boolean().default(false),
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
  combo_etapas: z.array(comboStageSchema).max(20).default([]),
});

const productSchema = productBaseSchema.superRefine((product, context) => {
  if (product.tipo === 'combo' && product.combo_etapas.length === 0) {
    context.addIssue({ code: 'custom', path: ['combo_etapas'], message: 'Adicione ao menos uma etapa ao combo.' });
  }
  const stageIds = product.combo_etapas.map((stage) => stage._id && String(stage._id)).filter(Boolean);
  if (new Set(stageIds).size !== stageIds.length) context.addIssue({ code: 'custom', path: ['combo_etapas'], message: 'O combo possui etapas duplicadas.' });
});

function comboStartingPriceCents(stages: z.infer<typeof comboStageSchema>[]) {
  return stages.reduce((total, stage) => {
    const smallestExtra = Math.min(...stage.opcoes.map((option) => option.acrescimo_centavos));
    return total + stage.valor_etapa_centavos + smallestExtra;
  }, 0);
}

function productMoneyFields(product: z.infer<typeof productSchema>) {
  if (product.tipo === 'combo') {
    const startingPriceCents = comboStartingPriceCents(product.combo_etapas);
    return {
      ...product,
      preco: startingPriceCents / 100,
      preco_centavos: startingPriceCents,
      preco_antigo: 0,
      preco_antigo_centavos: 0,
      controlar_estoque: false,
      estoque: 0,
      estoque_minimo: 0,
      esgotado: product.esgotado,
      personalizavel: false,
      grupos_adicionais: [],
      pode_resgatar: false,
      pontos_resgate: 0,
    };
  }
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

async function validateComboReferences(tenantId: mongoose.Types.ObjectId, product: z.infer<typeof productSchema>, currentId?: string) {
  if (product.tipo !== 'combo') return;
  const ids = [...new Set(product.combo_etapas.flatMap((stage) => stage.opcoes.map((option) => option.produtoId)))];
  if (currentId && ids.includes(currentId)) throw new HttpError(400, 'Um combo nao pode conter a si proprio.', 'COMBO_CYCLE');
  const referenced = await Product.find({ tenantId, _id: { $in: ids } }).select('_id tipo ativo esgotado controlar_estoque estoque').lean();
  if (referenced.length !== ids.length) throw new HttpError(400, 'O combo possui produtos inexistentes ou de outra loja.', 'INVALID_COMBO_PRODUCTS');
  if (referenced.some((item) => item.tipo === 'combo')) throw new HttpError(400, 'Nao e permitido adicionar um combo dentro de outro combo.', 'NESTED_COMBO');
  if (product.ativo) {
    const byId = new Map(referenced.map((item) => [String(item._id), item]));
    const unavailableStage = product.combo_etapas.find((stage) => !stage.opcoes.some((option) => {
      const item: any = byId.get(option.produtoId);
      return item && item.ativo !== false && item.esgotado !== true && (!item.controlar_estoque || Number(item.estoque || 0) > 0);
    }));
    if (unavailableStage) throw new HttpError(400, `A etapa "${unavailableStage.nome}" nao possui nenhuma opcao disponivel.`, 'COMBO_STAGE_UNAVAILABLE');
  }
}

const TERMINAL_ORDER_STATUSES = ['Entregue', 'Cancelado'];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function timezoneOffsetMs(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - date.getTime();
}

function localDateBoundary(value: string, timezone: string, end = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new HttpError(400, 'Periodo invalido.', 'INVALID_PERIOD');
  const base = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + (end ? 1 : 0));
  let result = new Date(base);
  result = new Date(base - timezoneOffsetMs(result, timezone));
  result = new Date(base - timezoneOffsetMs(result, timezone));
  return end ? new Date(result.getTime() - 1) : result;
}

async function tenantPeriod(req: Request, defaultDays = 30) {
  const timezone = String(req.tenant?.timezone || 'America/Sao_Paulo');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const toText = req.query.to ? String(req.query.to) : today;
  const defaultFrom = new Date(localDateBoundary(toText, timezone).getTime() - (defaultDays - 1) * 86400000);
  const fromText = req.query.from ? String(req.query.from) : new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(defaultFrom);
  const from = localDateBoundary(fromText, timezone);
  const to = localDateBoundary(toText, timezone, true);
  if (from > to) throw new HttpError(400, 'A data inicial deve ser anterior a data final.', 'INVALID_PERIOD');
  return { from, to, fromText, toText, timezone };
}

function orderHistoryFilter(req: Request, period: { from: Date; to: Date }) {
  const filter: Record<string, unknown> = { tenantId: req.tenant!._id, createdAt: { $gte: period.from, $lte: period.to } };
  filter.status = req.query.status && req.query.status !== 'Todos' ? String(req.query.status) : { $in: TERMINAL_ORDER_STATUSES };
  const search = String(req.query.search || '').trim();
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { 'cliente.nome': { $regex: safe, $options: 'i' } },
      { 'cliente.telefone': { $regex: safe } },
      ...(Number.isFinite(Number(search)) ? [{ dailyOrderNumber: Number(search) }, { orderNumber: Number(search) }] : []),
    ];
  }
  return filter;
}

const centsExpression = (field: string, legacyField: string) => ({ $ifNull: [`$${field}`, { $round: [{ $multiply: [{ $ifNull: [`$${legacyField}`, 0] }, 100] }, 0] }] });

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[";,\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvResponse(res: any, filename: string, rows: unknown[][]) {
  const body = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

function previousEquivalentPeriod(period: { from: Date; to: Date; timezone: string }) {
  const duration = period.to.getTime() - period.from.getTime() + 1;
  const to = new Date(period.from.getTime() - 1);
  const from = new Date(to.getTime() - duration + 1);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: period.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return { from, to, fromText: formatter.format(from), toText: formatter.format(to), timezone: period.timezone };
}

function comparisonValue(current: number, previous: number, lowerIsBetter = false) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return { percent: null, state: 'unavailable', favorable: null };
  if (previous === 0) return current === 0
    ? { percent: 0, state: 'stable', favorable: null }
    : { percent: null, state: 'new', favorable: lowerIsBetter ? false : true };
  const percent = (current - previous) / Math.abs(previous) * 100;
  return { percent, state: Math.abs(percent) < 0.05 ? 'stable' : 'available', favorable: percent === 0 ? null : lowerIsBetter ? percent < 0 : percent > 0 };
}

async function salesMetrics(tenantId: mongoose.Types.ObjectId, from: Date, to: Date) {
  const rows = await Order.aggregate([
    { $match: { tenantId, createdAt: { $gte: from, $lte: to } } },
    { $addFields: {
      totalCalc: centsExpression('total_centavos', 'total'),
      shippingCalc: centsExpression('frete_centavos', 'frete'),
      discountCalc: { $add: [
        { $round: [{ $multiply: [{ $ifNull: ['$desconto_cupom', 0] }, 100] }, 0] },
        { $round: [{ $multiply: [{ $ifNull: ['$valor_desconto_pontos', 0] }, 100] }, 0] },
      ] },
      itemCount: { $sum: { $map: { input: { $ifNull: ['$itens', []] }, as: 'item', in: { $ifNull: ['$$item.quantidade', 0] } } } },
    } },
    { $group: {
      _id: null,
      orders: { $sum: 1 },
      validOrders: { $sum: { $cond: [{ $ne: ['$status', 'Cancelado'] }, 1, 0] } },
      cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelado'] }, 1, 0] } },
      revenueCents: { $sum: { $cond: [{ $ne: ['$status', 'Cancelado'] }, '$totalCalc', 0] } },
      discountCents: { $sum: { $cond: [{ $ne: ['$status', 'Cancelado'] }, '$discountCalc', 0] } },
      shippingCents: { $sum: { $cond: [{ $ne: ['$status', 'Cancelado'] }, '$shippingCalc', 0] } },
      itemsSold: { $sum: { $cond: [{ $ne: ['$status', 'Cancelado'] }, '$itemCount', 0] } },
    } },
  ]);
  return rows[0] || { orders: 0, validOrders: 0, cancelled: 0, revenueCents: 0, discountCents: 0, shippingCents: 0, itemsSold: 0 };
}

async function newCustomerCount(tenantId: mongoose.Types.ObjectId, from: Date, to: Date) {
  const rows = await Order.aggregate([
    { $match: { tenantId, status: { $ne: 'Cancelado' }, usuarioId: { $ne: null } } },
    { $group: { _id: '$usuarioId', firstPurchase: { $min: '$createdAt' } } },
    { $match: { firstPurchase: { $gte: from, $lte: to } } },
    { $count: 'count' },
  ]);
  return Number(rows[0]?.count || 0);
}

function customerAnalyticsBase(tenantId: mongoose.Types.ObjectId, search = ''): any[] {
  const match: Record<string, unknown> = { tenantId };
  if (search) {
    const safe = escapeRegex(search);
    match.$or = [
      { nome: { $regex: safe, $options: 'i' } },
      { telefone: { $regex: safe } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }
  return [
    { $match: match },
    { $lookup: {
      from: 'orders',
      let: { userId: '$_id', tenant: '$tenantId' },
      pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$usuarioId', '$$userId'] }, { $eq: ['$tenantId', '$$tenant'] }, { $ne: ['$status', 'Cancelado'] }] } } },
        { $project: { createdAt: 1, totalCalc: centsExpression('total_centavos', 'total') } },
      ],
      as: 'validOrders',
    } },
    { $addFields: {
      total_pedidos: { $size: '$validOrders' },
      total_gasto_centavos: { $sum: '$validOrders.totalCalc' },
      primeira_compra: { $min: '$validOrders.createdAt' },
      ultima_compra: { $max: '$validOrders.createdAt' },
    } },
    { $addFields: {
      total_gasto: { $divide: ['$total_gasto_centavos', 100] },
      ticket_medio: { $cond: [{ $gt: ['$total_pedidos', 0] }, { $divide: ['$total_gasto_centavos', { $multiply: ['$total_pedidos', 100] }] }, 0] },
      dias_desde_ultima_compra: { $cond: [{ $ne: ['$ultima_compra', null] }, { $dateDiff: { startDate: '$ultima_compra', endDate: '$$NOW', unit: 'day' } }, null] },
      frequencia_media_dias: { $cond: [{ $gt: ['$total_pedidos', 1] }, { $divide: [{ $dateDiff: { startDate: '$primeira_compra', endDate: '$ultima_compra', unit: 'day' } }, { $subtract: ['$total_pedidos', 1] }] }, null] },
    } },
    { $project: { senha: 0, tokenVersion: 0, validOrders: 0, total_gasto_centavos: 0 } },
  ];
}

function customerSegmentStages(segment: string, period: { from: Date; to: Date }) {
  if (segment === 'valuable') return [{ $match: { total_pedidos: { $gt: 0 } } }, { $sort: { total_gasto: -1, total_pedidos: -1 } }];
  if (segment === 'frequent') return [{ $match: { total_pedidos: { $gt: 0 } } }, { $sort: { total_pedidos: -1, frequencia_media_dias: 1 } }];
  if (segment === 'new') return [{ $match: { primeira_compra: { $gte: period.from, $lte: period.to } } }, { $sort: { primeira_compra: -1 } }];
  const inactiveDays = /^inactive(30|60|90)$/.exec(segment)?.[1];
  if (inactiveDays) {
    const cutoff = new Date(Date.now() - Number(inactiveDays) * 86400000);
    return [{ $match: { $or: [{ ultima_compra: { $lt: cutoff } }, { ultima_compra: null }] } }, { $sort: { ultima_compra: 1, createdAt: 1 } }];
  }
  return [{ $sort: { ultima_compra: -1, createdAt: -1 } }];
}

router.patch('/settings/toggle-status', requireCsrf, requirePermission('settings:write'), asyncRoute(async (req, res) => {
  let settings = await StoreSettings.findOne({ tenantId: req.tenant!._id });
  if (!settings) {
    settings = await StoreSettings.create({ tenantId: req.tenant!._id, is_open: false, nome_loja: req.tenant!.displayName });
  }
  
  const currentEffective = computeIsStoreOpen(settings);
  const willOpen = !currentEffective;
  if (willOpen) {
    const activeProducts = await Product.countDocuments({ tenantId: req.tenant!._id, ativo: true });
    if (activeProducts === 0) {
      throw new HttpError(400, 'Cadastre pelo menos 1 produto ativo antes de abrir a loja.', 'NO_ACTIVE_PRODUCTS');
    }
    const allowDelivery = settings.logisticsOptions?.allowDelivery !== false;
    const allowPickup = settings.logisticsOptions?.allowPickup !== false;
    const allowDineIn = Boolean(settings.logisticsOptions?.allowDineIn);
    if (!allowDelivery && !allowPickup && !allowDineIn) {
      throw new HttpError(400, 'Ative pelo menos uma forma de atendimento (Entrega, Retirada ou Comer no local) antes de abrir a loja.', 'NO_LOGISTICS_OPTION');
    }
    const legacyCardEnabled = settings.pagamento_cartao !== false;
    const creditCardEnabled = typeof settings.pagamento_cartao_credito === 'boolean' ? settings.pagamento_cartao_credito : legacyCardEnabled;
    const debitCardEnabled = typeof settings.pagamento_cartao_debito === 'boolean' ? settings.pagamento_cartao_debito : legacyCardEnabled;
    if (!settings.pagamento_pix && !creditCardEnabled && !debitCardEnabled && !settings.pagamento_dinheiro && !settings.pagamento_vale_alimentacao && !settings.pagamento_vale_refeicao) {
      throw new HttpError(400, 'Ative pelo menos uma forma de pagamento nas configurações antes de abrir a loja.', 'NO_PAYMENT_OPTION');
    }
  }

  const before = { is_open: settings.is_open, abertura_automatica: settings.abertura_automatica };
  settings.is_open = willOpen;
  if (settings.abertura_automatica) {
    settings.abertura_automatica = false;
  }
  await settings.save();
  
  await audit(req, { action: 'STORE_STATUS_TOGGLED', targetType: 'StoreSettings', targetId: settings._id.toString(), before, after: { is_open: settings.is_open, abertura_automatica: settings.abertura_automatica } });
  
  res.json({ success: true, is_open: settings.is_open, abertura_automatica: settings.abertura_automatica });
}));

// ENDPOINTS DE ONBOARDING
router.get('/onboarding/status', requirePermission('settings:read'), asyncRoute(async (req, res) => {
  const tenantId = req.tenant!._id;
  const [tenant, productsCount, settings] = await Promise.all([
    Tenant.findById(tenantId).select('displayName onboarding status').lean(),
    Product.countDocuments({ tenantId }),
    StoreSettings.findOne({ tenantId }).lean(),
  ]);

  res.json({
    success: true,
    onboarding: (tenant as any)?.onboarding || { completed: false, step: 'welcome' },
    hasProducts: productsCount > 0,
    productsCount,
    hasSettings: !!settings,
    storeName: tenant?.displayName || '',
    settings: settings || null,
  });
}));

const progressSchema = z.object({
  step: z.string().optional(),
  completed: z.boolean().optional(),
});

router.patch('/onboarding/progress', requireCsrf, requirePermission('settings:write'), validateBody(progressSchema), asyncRoute(async (req, res) => {
  const tenantId = req.tenant!._id;
  const { step, completed } = req.body;
  const updateFields: Record<string, any> = {};
  if (step !== undefined) updateFields['onboarding.step'] = step;
  if (completed !== undefined) updateFields['onboarding.completed'] = completed;

  if (completed === true) {
    await Tenant.updateOne(
      { _id: tenantId },
      { $set: { ...updateFields, status: 'active', activatedAt: new Date() } }
    );
  } else {
    await Tenant.updateOne({ _id: tenantId }, { $set: updateFields });
  }

  const updatedTenant = await Tenant.findById(tenantId).select('onboarding').lean();
  res.json({ success: true, onboarding: (updatedTenant as any)?.onboarding });
}));

router.post('/onboarding/complete', requireCsrf, requirePermission('settings:write'), asyncRoute(async (req, res) => {
  const tenantId = req.tenant!._id;
  await Tenant.updateOne(
    { _id: tenantId },
    { $set: { 'onboarding.completed': true, 'onboarding.step': 'complete', status: 'active', activatedAt: new Date() } }
  );
  await audit(req, { action: 'ONBOARDING_COMPLETED', targetType: 'Tenant', targetId: tenantId.toString() });
  res.json({ success: true, onboarding: { completed: true, step: 'complete' } });
}));

const storeNameSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).optional(),
});

router.patch('/onboarding/store-name', requireCsrf, requirePermission('settings:write'), validateBody(storeNameSchema), asyncRoute(async (req, res) => {
  const tenantId = req.tenant!._id;
  const { name, phone } = req.body;
  
  await Tenant.updateOne({ _id: tenantId }, { $set: { displayName: name } });
  const updateData: Record<string, any> = { nome_loja: name };
  if (phone !== undefined) updateData.telefone = phone;

  await StoreSettings.findOneAndUpdate(
    { tenantId },
    { $set: updateData },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  res.json({ success: true, name, phone });
}));

const serviceOptionsSchema = z.object({
  allowDelivery: z.boolean(),
  allowPickup: z.boolean(),
});

router.patch('/onboarding/service-options', requireCsrf, requirePermission('settings:write'), validateBody(serviceOptionsSchema), asyncRoute(async (req, res) => {
  const tenantId = req.tenant!._id;
  const { allowDelivery, allowPickup } = req.body;
  if (!allowDelivery && !allowPickup) {
    throw new HttpError(400, 'Pelo menos uma modalidade de atendimento deve ser selecionada.', 'LOGISTICS_REQUIRED');
  }

  const settings = await StoreSettings.findOneAndUpdate(
    { tenantId },
    { $set: { 'logisticsOptions.allowDelivery': allowDelivery, 'logisticsOptions.allowPickup': allowPickup } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  res.json({ success: true, logisticsOptions: settings.logisticsOptions });
}));

router.get('/dashboard', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const tenantId = req.tenant!._id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  const lowStockFilter = { tenantId, ativo: { $ne: false }, controlar_estoque: true, $expr: { $lte: ['$estoque', { $ifNull: ['$estoque_minimo', 0] }] } };
  const [products, categories, orders, settings, blocks, lowStockProducts, lowStockCount] = await Promise.all([
    Product.countDocuments({ tenantId }),
    Category.countDocuments({ tenantId }),
    Order.find({ tenantId, createdAt: { $gte: weekStart } }).sort({ createdAt: -1 }).lean(),
    StoreSettings.findOne({ tenantId }).lean(),
    HomeBlock.countDocuments({ tenantId, ativo: { $ne: false } }),
    Product.find(lowStockFilter)
      .select('nome imagem estoque estoque_minimo esgotado ativo')
      .sort({ estoque: 1, nome: 1 })
      .limit(8)
      .lean(),
    Product.countDocuments(lowStockFilter),
  ]);
  type DashboardOrder = { status?: string; total?: number; total_centavos?: number; createdAt: Date | string };
  const dashboardOrders = orders as unknown as DashboardOrder[];
  const validDashboardOrders = dashboardOrders.filter(o => o.status !== 'Cancelado');
  const totalOf = (order: DashboardOrder) => Number(order.total ?? (Number(order.total_centavos || 0) / 100));
  const todayOrders = validDashboardOrders.filter((order) => new Date(order.createdAt) >= today);
  const revenueToday = todayOrders.reduce((sum, order) => sum + totalOf(order), 0);
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const total = validDashboardOrders.filter((order) => new Date(order.createdAt).toDateString() === date.toDateString()).reduce((sum, order) => sum + totalOf(order), 0);
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
    settings: settings ? { ...settings, is_open: computeIsStoreOpen(settings), manual_is_open: Boolean(settings.is_open) } : null,
    activeHomeBlocks: blocks,
    inventory: { lowStockCount, lowStockProducts },
  });
}));

router.get('/orders/active', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const filter = { 
    tenantId: req.tenant!._id,
    status: { $in: ['Pendente', 'Preparando', 'Saiu para Entrega'] }
  };
  const items = await Order.find(filter).sort({ createdAt: 1 }).lean();
  res.json({ success: true, items });
}));

router.get('/orders/history', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter = orderHistoryFilter(req, period);
  const [items, total] = await Promise.all([
    Order.find(filter).select('-trackingTokenHash -trackingToken').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ success: true, items, period: { from: period.fromText, to: period.toText, timezone: period.timezone }, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
}));

router.get('/orders/history/export.csv', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const orders = await Order.find(orderHistoryFilter(req, period)).select('-trackingTokenHash -trackingToken').sort({ createdAt: -1 }).lean();
  const timezone = period.timezone;
  const header = ['Pedido', 'Data', 'Hora', 'Cliente', 'Telefone', 'Tipo de entrega', 'Status', 'Pagamento', 'Subtotal', 'Desconto', 'Taxa de entrega', 'Total'];
  const rows = orders.map((order: Record<string, any>) => {
    const createdAt = new Date(order.createdAt);
    const subtotal = (order.itens || []).reduce((sum: number, item: Record<string, any>) => sum + Number(item.subtotal_centavos ?? Math.round(Number(item.subtotal || 0) * 100)), 0) / 100;
    const discount = Number(order.desconto_cupom || 0) + Number(order.valor_desconto_pontos || 0);
    return [
      order.dailyOrderNumber || order.orderNumber || String(order._id).slice(-6).toUpperCase(),
      createdAt.toLocaleDateString('pt-BR', { timeZone: timezone }),
      createdAt.toLocaleTimeString('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }),
      order.cliente?.nome, order.cliente?.telefone, order.tipo_entrega === 'pickup' ? 'Retirada' : 'Entrega', order.status, paymentMethodLabel(order.metodo_pagamento),
      subtotal.toFixed(2).replace('.', ','), discount.toFixed(2).replace('.', ','), Number(order.frete || 0).toFixed(2).replace('.', ','), Number(order.total || 0).toFixed(2).replace('.', ','),
    ].map(csvCell).join(';');
  });
  const csv = `\uFEFF${[header.map(csvCell).join(';'), ...rows].join('\r\n')}`;
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="pedidos-${period.fromText}-${period.toText}.csv"`);
  res.send(csv);
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
      ...(Number.isFinite(Number(search)) ? [{ dailyOrderNumber: Number(search) }, { orderNumber: Number(search) }] : []),
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
  await validateComboReferences(req.tenant!._id, req.body);
  const product = await Product.create({ ...productMoneyFields(req.body), tenantId: req.tenant!._id });
  await audit(req, { action: 'PRODUCT_CREATED', targetType: 'Product', targetId: product._id.toString(), after: product.toObject() });
  res.status(201).json({ success: true, product });
}));

router.put('/products/:id', requireCsrf, requirePermission('catalog:write'), validateBody(productBaseSchema.partial()), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  if (req.body.categoriaId && !await Category.exists({ _id: req.body.categoriaId, tenantId: req.tenant!._id })) throw new HttpError(400, 'Categoria invalida.', 'INVALID_CATEGORY');
  const before = await Product.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!before) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  const merged = productSchema.parse({ ...before, ...req.body, categoriaId: req.body.categoriaId ?? before.categoriaId?.toString() ?? null });
  if (before.tipo !== 'combo' && merged.tipo === 'combo') {
    const usedBy = await Product.countDocuments({ tenantId: req.tenant!._id, tipo: 'combo', 'combo_etapas.opcoes.produtoId': req.params.id });
    if (usedBy > 0) throw new HttpError(409, `Este produto esta sendo utilizado por ${usedBy} combo${usedBy === 1 ? '' : 's'} e nao pode ser convertido em combo.`, 'PRODUCT_USED_BY_COMBO');
  }
  await validateComboReferences(req.tenant!._id, merged, req.params.id);
  const update: Record<string, unknown> = productMoneyFields(merged);
  const product = await Product.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenant!._id }, { $set: update }, { returnDocument: 'after', runValidators: true }).lean();
  if (before.imagem && req.body.imagem !== undefined && before.imagem !== req.body.imagem) {
    void deleteStoredFile(before.imagem);
  }
  await audit(req, { action: 'PRODUCT_UPDATED', targetType: 'Product', targetId: req.params.id, before, after: product });
  res.json({ success: true, product });
}));

router.delete('/products/:id', requireCsrf, requirePermission('catalog:write'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  const usedBy = await Product.countDocuments({ tenantId: req.tenant!._id, tipo: 'combo', 'combo_etapas.opcoes.produtoId': req.params.id });
  if (usedBy > 0) throw new HttpError(409, `Este produto esta sendo utilizado por ${usedBy} combo${usedBy === 1 ? '' : 's'}. Remova-o dos combos antes de excluir.`, 'PRODUCT_USED_BY_COMBO');
  const product = await Product.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!product) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  if (product.imagem) {
    void deleteStoredFile(product.imagem);
  }
  await audit(req, { action: 'PRODUCT_DELETED', targetType: 'Product', targetId: req.params.id, before: product });
  res.json({ success: true });
}));

async function toggleProduct(req: Request, field: 'ativo' | 'esgotado') {
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenant!._id });
  if (!product) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  if (field === 'ativo' && product.tipo === 'combo' && product.ativo === false) {
    const parsed = productSchema.parse(product.toObject());
    await validateComboReferences(req.tenant!._id, parsed, product._id.toString());
  }
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

router.get('/complement-groups', requirePermission('catalog:read'), asyncRoute(async (req, res) => {
  const items = await ComplementGroup.find({ tenantId: req.tenant!._id })
    .populate('produtos_vinculados', 'nome imagem preco ativo')
    .populate('categorias_vinculadas', 'nome')
    .sort({ ordem: 1, createdAt: 1 })
    .lean();
  res.json({ success: true, items, pagination: { page: 1, limit: items.length, total: items.length, pages: 1 } });
}));

router.post('/complement-groups', requireCsrf, requirePermission('catalog:write'), validateBody(complementGroupSchema), asyncRoute(async (req, res) => {
  const itens = req.body.itens.map((item) => ({
    ...item,
    preco_centavos: reaisToCents(item.preco),
  }));
  const group = await ComplementGroup.create({
    ...req.body,
    itens,
    tenantId: req.tenant!._id,
  });
  await audit(req, { action: 'COMPLEMENT_GROUP_CREATED', targetType: 'ComplementGroup', targetId: group._id.toString(), after: group.toObject() });
  res.status(201).json({ success: true, group });
}));

router.put('/complement-groups/:id', requireCsrf, requirePermission('catalog:write'), validateBody(complementGroupBaseSchema.partial()), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Grupo de complementos nao encontrado.', 'NOT_FOUND');
  const before = await ComplementGroup.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!before) throw new HttpError(404, 'Grupo de complementos nao encontrado.', 'NOT_FOUND');
  const merged = complementGroupSchema.parse({
    ...before,
    ...req.body,
    produtos_vinculados: req.body.produtos_vinculados ?? (before.produtos_vinculados || []).map(String),
    categorias_vinculadas: req.body.categorias_vinculadas ?? (before.categorias_vinculadas || []).map(String),
  });
  const itens = merged.itens.map((item) => ({
    ...item,
    preco_centavos: reaisToCents(item.preco),
  }));
  const group = await ComplementGroup.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenant!._id },
    { $set: { ...merged, itens } },
    { returnDocument: 'after', runValidators: true }
  ).lean();
  await audit(req, { action: 'COMPLEMENT_GROUP_UPDATED', targetType: 'ComplementGroup', targetId: req.params.id, before, after: group });
  res.json({ success: true, group });
}));

router.delete('/complement-groups/:id', requireCsrf, requirePermission('catalog:write'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Grupo de complementos nao encontrado.', 'NOT_FOUND');
  const group = await ComplementGroup.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!group) throw new HttpError(404, 'Grupo de complementos nao encontrado.', 'NOT_FOUND');
  await audit(req, { action: 'COMPLEMENT_GROUP_DELETED', targetType: 'ComplementGroup', targetId: req.params.id, before: group });
  res.json({ success: true });
}));

router.patch('/complement-groups/:id/toggle-active', requireCsrf, requirePermission('catalog:write'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Grupo de complementos nao encontrado.', 'NOT_FOUND');
  const group = await ComplementGroup.findOne({ _id: req.params.id, tenantId: req.tenant!._id });
  if (!group) throw new HttpError(404, 'Grupo de complementos nao encontrado.', 'NOT_FOUND');
  group.set('ativo', !group.get('ativo'));
  await group.save();
  await audit(req, { action: 'COMPLEMENT_GROUP_TOGGLED', targetType: 'ComplementGroup', targetId: group._id.toString(), after: { ativo: group.get('ativo') } });
  res.json({ success: true, group });
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
const benefitBrandSchema = z.enum(['alelo', 'vr', 'ticket', 'pluxee', 'ben', 'caju', 'flash', 'swile', 'ifood_beneficios']);
const settingsSchema = z.object({
  is_open: z.boolean().optional(), nome_loja: z.string().trim().min(2).max(120).optional(), tagline: z.string().max(160).optional(),
  logo_url: z.string().url().or(z.literal('')).optional(), capa_url: z.string().url().or(z.literal('')).optional(), logoShape: z.enum(['circle', 'squircle']).optional(), theme: themeSchema.optional(),
  secondaryBanners: z.array(z.object({ id: z.string().min(1).max(80), imageUrl: z.string().url().or(z.literal('')), active: z.boolean(), link: z.string().max(500) })).max(10).optional(),
  logisticsOptions: z.object({ allowPickup: z.boolean(), allowDelivery: z.boolean(), allowDineIn: z.boolean().optional() }).optional(), tempo_entrega: z.string().max(80).optional(), whatsapp: z.string().max(30).optional(),
  sobre_texto: z.string().max(5_000).optional(), instagram_url: z.string().max(500).optional(), cep_loja: z.string().max(12).optional(), rua_loja: z.string().max(200).optional(), numero_loja: z.string().max(30).optional(), bairro_loja: z.string().max(120).optional(), cidade_loja: z.string().max(120).optional(), estado_loja: z.string().max(2).optional(),
  faixas_entrega: z.array(z.object({ km_ate: money, valor: money })).max(100).optional(), abertura_automatica: z.boolean().optional(), mensagem_fechado: z.string().max(500).optional(),
  horarios_funcionamento: z.object({ domingo: daySchema, segunda: daySchema, terca: daySchema, quarta: daySchema, quinta: daySchema, sexta: daySchema, sabado: daySchema }).optional(),
  pedido_minimo: money.optional(), frete_gratis_acima_de: money.optional(), talheres_ativo: z.boolean().optional(), talheres_valor: money.optional(), pagamento_pix: z.boolean().optional(), pagamento_cartao: z.boolean().optional(), pagamento_cartao_credito: z.boolean().optional(), pagamento_cartao_debito: z.boolean().optional(), pagamento_dinheiro: z.boolean().optional(), pagamento_vale_alimentacao: z.boolean().optional(), bandeiras_vale_alimentacao: z.array(benefitBrandSchema).max(9).optional(), pagamento_vale_refeicao: z.boolean().optional(), bandeiras_vale_refeicao: z.array(benefitBrandSchema).max(9).optional(), chave_pix: z.string().max(300).optional(), instrucoes_pix: z.string().max(1_000).optional(),
  banner_ativo: z.boolean().optional(), banner_texto: z.string().max(500).optional(), cupom_global_ativo: z.boolean().optional(), fidelidade_ativa: z.boolean().optional(), pontos_por_real: money.optional(), valor_ponto_reais: money.optional(),
}).superRefine((settings, context) => {
  if (settings.pagamento_vale_alimentacao && !settings.bandeiras_vale_alimentacao?.length) {
    context.addIssue({ code: 'custom', path: ['bandeiras_vale_alimentacao'], message: 'Selecione ao menos uma bandeira para o Vale-alimentação.' });
  }
  if (settings.pagamento_vale_refeicao && !settings.bandeiras_vale_refeicao?.length) {
    context.addIssue({ code: 'custom', path: ['bandeiras_vale_refeicao'], message: 'Selecione ao menos uma bandeira para o Vale-refeição.' });
  }
});
router.get('/settings', requirePermission('settings:read'), asyncRoute(async (req, res) => res.json({ success: true, settings: await StoreSettings.findOne({ tenantId: req.tenant!._id }).lean() })));
router.put('/settings', requireCsrf, requirePermission('settings:write'), validateBody(settingsSchema), asyncRoute(async (req, res) => {
  const before = await StoreSettings.findOne({ tenantId: req.tenant!._id }).lean();
  const nextSettings = { ...req.body };
  if (req.body.pagamento_cartao_credito !== undefined || req.body.pagamento_cartao_debito !== undefined) {
    const legacyCardEnabled = before?.pagamento_cartao !== false;
    const currentCredit = typeof before?.pagamento_cartao_credito === 'boolean' ? before.pagamento_cartao_credito : legacyCardEnabled;
    const currentDebit = typeof before?.pagamento_cartao_debito === 'boolean' ? before.pagamento_cartao_debito : legacyCardEnabled;
    const nextCredit = req.body.pagamento_cartao_credito ?? currentCredit;
    const nextDebit = req.body.pagamento_cartao_debito ?? currentDebit;
    nextSettings.pagamento_cartao = nextCredit || nextDebit;
  }
  const settings = await StoreSettings.findOneAndUpdate({ tenantId: req.tenant!._id }, { $set: nextSettings }, { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }).lean();
  if (before?.logo_url && req.body.logo_url !== undefined && before.logo_url !== req.body.logo_url) {
    void deleteStoredFile(before.logo_url);
  }
  if (before?.capa_url && req.body.capa_url !== undefined && before.capa_url !== req.body.capa_url) {
    void deleteStoredFile(before.capa_url);
  }
  await audit(req, { action: 'SETTINGS_UPDATED', targetType: 'StoreSettings', targetId: settings!._id.toString(), before, after: settings });
  res.json({ success: true, settings });
}));

export const safeUrlSchema = z.string().max(1_000).default('').refine((val) => {
  if (!val || val.trim() === '') return true;
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return false;
  }

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return !trimmed.startsWith('//') && !/^[a-z0-9+-.]+:/i.test(trimmed);
  }

  return false;
}, { message: 'URL ou caminho relativo invalido ou nao permitido por seguranca.' });

const homeBlockSchema = z.object({
  titulo: z.string().max(200).default(''), subtitulo: z.string().max(300).default(''), descricao: z.string().max(5_000).default(''), imagem_desktop: z.string().url().or(z.literal('')).default(''), imagem_mobile: z.string().url().or(z.literal('')).default(''), link_destino: safeUrlSchema, texto_botao: z.string().max(120).default(''),
  tipo_bloco: z.enum(['banner_principal', 'card_promocional', 'card_institucional', 'fidelidade', 'texto']).default('card_promocional'), posicao_exibicao: z.enum(['below_hero', 'before_products', 'middle_home', 'after_products']).default('below_hero'), acao_clique: z.enum(['nenhuma', 'link', 'modal']).default('nenhuma'),
  modal_titulo: z.string().max(200).default(''), modal_texto_completo: z.string().max(10_000).default(''), modal_imagem: z.string().url().or(z.literal('')).default(''), modal_cta_texto: z.string().max(120).default(''), modal_cta_link: safeUrlSchema, ativo: z.boolean().default(true), ordem: z.coerce.number().int().default(999), abrir_nova_aba: z.boolean().default(false), cor_fundo: z.string().regex(/^#[0-9a-f]{6}$/i).default('#ffffff'), cor_texto: z.string().regex(/^#[0-9a-f]{6}$/i).default('#000000'),
});

const homeBlockUpdateSchema = z.object({
  titulo: z.string().max(200).optional(), subtitulo: z.string().max(300).optional(), descricao: z.string().max(5_000).optional(), imagem_desktop: z.string().url().or(z.literal('')).optional(), imagem_mobile: z.string().url().or(z.literal('')).optional(), link_destino: safeUrlSchema.optional(), texto_botao: z.string().max(120).optional(),
  tipo_bloco: z.enum(['banner_principal', 'card_promocional', 'card_institucional', 'fidelidade', 'texto']).optional(), posicao_exibicao: z.enum(['below_hero', 'before_products', 'middle_home', 'after_products']).optional(), acao_clique: z.enum(['nenhuma', 'link', 'modal']).optional(),
  modal_titulo: z.string().max(200).optional(), modal_texto_completo: z.string().max(10_000).optional(), modal_imagem: z.string().url().or(z.literal('')).optional(), modal_cta_texto: z.string().max(120).optional(), modal_cta_link: safeUrlSchema.optional(), ativo: z.boolean().optional(), ordem: z.coerce.number().int().optional(), abrir_nova_aba: z.boolean().optional(), cor_fundo: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), cor_texto: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
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
router.put('/home-blocks/:id', requireCsrf, requirePermission('settings:write'), validateBody(homeBlockUpdateSchema), asyncRoute(async (req, res) => {
  const before = await HomeBlock.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!before) throw new HttpError(404, 'Bloco nao encontrado.', 'NOT_FOUND');
  const block = await HomeBlock.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenant!._id }, { $set: req.body }, { returnDocument: 'after', runValidators: true }).lean();
  if (!block) throw new HttpError(404, 'Bloco nao encontrado.', 'NOT_FOUND');

  // Remocao de imagens antigas substituidas do Supabase Storage
  const newImages = new Set([block.imagem_desktop, block.imagem_mobile, block.modal_imagem].filter(Boolean));
  const oldImages = [before.imagem_desktop, before.imagem_mobile, before.modal_imagem].filter(Boolean);
  for (const oldUrl of oldImages) {
    if (!newImages.has(oldUrl)) {
      void deleteStoredFile(oldUrl);
    }
  }

  await audit(req, { action: 'HOME_BLOCK_UPDATED', targetType: 'HomeBlock', targetId: req.params.id, before, after: block });
  res.json({ success: true, block });
}));
router.delete('/home-blocks/:id', requireCsrf, requirePermission('settings:write'), asyncRoute(async (req, res) => {
  const block = await HomeBlock.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!block) throw new HttpError(404, 'Bloco nao encontrado.', 'NOT_FOUND');

  // Remocao das imagens do bloco excluido no Supabase Storage
  const images = new Set([block.imagem_desktop, block.imagem_mobile, block.modal_imagem].filter(Boolean));
  for (const imageUrl of images) {
    void deleteStoredFile(imageUrl);
  }

  await audit(req, { action: 'HOME_BLOCK_DELETED', targetType: 'HomeBlock', targetId: req.params.id, before: block });
  res.json({ success: true });
}));
router.get('/customers', requirePermission('customers:read'), asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const period = await tenantPeriod(req, 30);
  const segment = String(req.query.segment || 'all');
  const base = customerAnalyticsBase(req.tenant!._id, String(req.query.search || '').trim());
  const segmentStages = customerSegmentStages(segment, period);
  const [result, summaryRows] = await Promise.all([
    User.aggregate([...base, ...segmentStages, { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], count: [{ $count: 'total' }] } }]),
    User.aggregate([
      ...customerAnalyticsBase(req.tenant!._id),
      { $group: {
        _id: null,
        customers: { $sum: 1 },
        buyers: { $sum: { $cond: [{ $gt: ['$total_pedidos', 0] }, 1, 0] } },
        recurring: { $sum: { $cond: [{ $gt: ['$total_pedidos', 1] }, 1, 0] } },
        newCustomers: { $sum: { $cond: [{ $and: [{ $gte: ['$primeira_compra', period.from] }, { $lte: ['$primeira_compra', period.to] }] }, 1, 0] } },
        inactive30: { $sum: { $cond: [{ $or: [{ $eq: ['$ultima_compra', null] }, { $lt: ['$ultima_compra', new Date(Date.now() - 30 * 86400000)] }] }, 1, 0] } },
        inactive60: { $sum: { $cond: [{ $or: [{ $eq: ['$ultima_compra', null] }, { $lt: ['$ultima_compra', new Date(Date.now() - 60 * 86400000)] }] }, 1, 0] } },
        inactive90: { $sum: { $cond: [{ $or: [{ $eq: ['$ultima_compra', null] }, { $lt: ['$ultima_compra', new Date(Date.now() - 90 * 86400000)] }] }, 1, 0] } },
      } },
    ]),
  ]);
  const items = result[0]?.items || [];
  const total = Number(result[0]?.count?.[0]?.total || 0);
  const summary = summaryRows[0] || { customers: 0, buyers: 0, recurring: 0, newCustomers: 0, inactive30: 0, inactive60: 0, inactive90: 0 };
  res.json({
    success: true,
    items,
    summary: { ...summary, repeatRate: summary.buyers ? summary.recurring / summary.buyers * 100 : null },
    period: { from: period.fromText, to: period.toText, timezone: period.timezone },
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
}));

router.get('/customers/export.csv', requirePermission('customers:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const segment = String(req.query.segment || 'all');
  const items = await User.aggregate([
    ...customerAnalyticsBase(req.tenant!._id, String(req.query.search || '').trim()),
    ...customerSegmentStages(segment, period),
  ]);
  csvResponse(res, `clientes-${period.fromText}-a-${period.toText}.csv`, [
    ['Nome', 'Telefone', 'E-mail', 'Primeira compra', 'Ultima compra', 'Numero de pedidos', 'Total gasto', 'Ticket medio', 'Frequencia media (dias)', 'Dias sem comprar', 'Pontos'],
    ...items.map((item) => [
      item.nome, item.telefone, item.email || '',
      item.primeira_compra ? new Date(item.primeira_compra).toLocaleDateString('pt-BR', { timeZone: period.timezone }) : '',
      item.ultima_compra ? new Date(item.ultima_compra).toLocaleDateString('pt-BR', { timeZone: period.timezone }) : '',
      item.total_pedidos || 0,
      Number(item.total_gasto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      Number(item.ticket_medio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      item.frequencia_media_dias == null ? '' : Number(item.frequencia_media_dias).toFixed(1).replace('.', ','),
      item.dias_desde_ultima_compra ?? '', item.pontos || 0,
    ]),
  ]);
}));

router.get('/customers/password-recoveries', requirePermission('customers:read'), asyncRoute(async (req, res) => {
  const now = new Date();
  await CustomerPasswordRecovery.updateMany(
    { tenantId: req.tenant!._id, status: 'pending', requestExpiresAt: { $lte: now } },
    { $set: { status: 'cancelled', cancelledAt: now } },
  );
  const recoveries = await CustomerPasswordRecovery.find({ tenantId: req.tenant!._id, status: 'pending', requestExpiresAt: { $gt: now } })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  const customerIds = recoveries.map((item) => item.accountId);
  const customers = await User.find({ tenantId: req.tenant!._id, _id: { $in: customerIds } }).select('nome telefone').lean();
  const customerMap = new Map(customers.map((customer) => [String(customer._id), customer]));
  res.json({
    success: true,
    items: recoveries.map((item) => ({
      id: String(item._id),
      reference: item.reference,
      requestedAt: item.createdAt,
      expiresAt: item.requestExpiresAt,
      customer: customerMap.get(String(item.accountId)) || null,
    })),
  });
}));

router.post('/customers/password-recoveries/:id/approve', requireCsrf, requirePermission('customers:write'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Solicitacao nao encontrada.', 'NOT_FOUND');
  const rawToken = crypto.randomBytes(48).toString('base64url');
  const resetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const resetExpiresAt = new Date(Date.now() + 30 * 60_000);
  const recovery = await CustomerPasswordRecovery.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenant!._id, status: 'pending', requestExpiresAt: { $gt: new Date() } },
    { $set: { status: 'approved', resetTokenHash, resetExpiresAt, approvedBy: req.auth!.accountId, approvedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!recovery) throw new HttpError(409, 'Esta solicitacao expirou ou ja foi atendida.', 'RECOVERY_NOT_PENDING');
  const customer = await User.findOne({ _id: recovery.accountId, tenantId: req.tenant!._id }).select('nome telefone').lean();
  if (!customer) throw new HttpError(404, 'Cliente nao encontrado.', 'NOT_FOUND');
  const origin = (getEnv().APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
  const resetUrl = `${origin}/${encodeURIComponent(req.tenant!.slug)}/recuperar-senha/${rawToken}`;
  await audit(req, {
    action: 'CUSTOMER_PASSWORD_RECOVERY_APPROVED',
    targetType: 'User',
    targetId: String(customer._id),
    details: `Link de recuperacao gerado para a solicitacao ${recovery.reference}`,
    after: { reference: recovery.reference, expiresAt: resetExpiresAt },
  });
  res.json({ success: true, recovery: { reference: recovery.reference, resetUrl, expiresAt: resetExpiresAt, customer: { id: String(customer._id), nome: customer.nome, telefone: customer.telefone } } });
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
  const validOrders = orders.filter((order) => order.status !== 'Cancelado');
  const totalSpent = validOrders.reduce((sum, order) => sum + Number(order.total_centavos ?? Math.round(Number(order.total || 0) * 100)), 0) / 100;
  const ascending = [...validOrders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const firstPurchase = ascending[0]?.createdAt || null;
  const lastPurchase = ascending.at(-1)?.createdAt || null;
  const averageFrequencyDays = ascending.length > 1 && firstPurchase && lastPurchase
    ? (new Date(lastPurchase).getTime() - new Date(firstPurchase).getTime()) / 86400000 / (ascending.length - 1)
    : null;
  res.json({
    success: true,
    customer,
    orders,
    metrics: {
      totalSpent,
      orders: validOrders.length,
      averageTicket: validOrders.length ? totalSpent / validOrders.length : 0,
      firstPurchase,
      lastPurchase,
      averageFrequencyDays,
    },
  });
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

router.get('/reports/marketing', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const tenantId = req.tenant!._id;
  const orderMatch = { tenantId, status: { $ne: 'Cancelado' }, createdAt: { $gte: period.from, $lte: period.to } };
  const [couponRows, loyaltyRows, topRedeemedProducts, customersWithBalance, redeemedCustomers, settings, coupons] = await Promise.all([
    Order.aggregate([
      { $match: { ...orderMatch, cupom_codigo: { $nin: ['', null] } } },
      { $addFields: { totalCalc: centsExpression('total_centavos', 'total'), discountCalc: { $round: [{ $multiply: [{ $ifNull: ['$desconto_cupom', 0] }, 100] }, 0] } } },
      { $group: {
        _id: { $toUpper: '$cupom_codigo' }, uses: { $sum: 1 }, customers: { $addToSet: { $ifNull: ['$usuarioId', '$cliente.telefone'] } },
        revenueCents: { $sum: '$totalCalc' }, discountCents: { $sum: '$discountCalc' }, lastUsedAt: { $max: '$createdAt' },
      } },
      { $project: { _id: 0, code: '$_id', uses: 1, customers: { $size: '$customers' }, revenue: { $divide: ['$revenueCents', 100] }, discounts: { $divide: ['$discountCents', 100] }, averageTicket: { $cond: [{ $gt: ['$uses', 0] }, { $divide: ['$revenueCents', { $multiply: ['$uses', 100] }] }, 0] }, lastUsedAt: 1 } },
      { $sort: { revenue: -1, uses: -1 } },
    ]),
    Order.aggregate([
      { $match: orderMatch },
      { $group: { _id: null, pointsGenerated: { $sum: { $ifNull: ['$pontos_creditados', 0] } }, pointsRedeemed: { $sum: { $ifNull: ['$pontos_utilizados', 0] } }, redemptions: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$pontos_utilizados', 0] }, 0] }, 1, 0] } }, equivalentCents: { $sum: { $sum: { $map: { input: { $ifNull: ['$itens', []] }, as: 'item', in: { $cond: ['$$item.resgatado', { $ifNull: ['$$item.valor_resgate_centavos', 0] }, 0] } } } } } } },
    ]),
    Order.aggregate([
      { $match: orderMatch }, { $unwind: '$itens' }, { $match: { 'itens.resgatado': true } },
      { $group: { _id: { productId: '$itens.produtoId', name: '$itens.nome' }, units: { $sum: '$itens.quantidade' }, points: { $sum: { $multiply: [{ $ifNull: ['$itens.pontos_resgate', 0] }, '$itens.quantidade'] } }, equivalentCents: { $sum: { $ifNull: ['$itens.valor_resgate_centavos', 0] } } } },
      { $project: { _id: 0, productId: '$_id.productId', name: { $ifNull: ['$_id.name', 'Produto removido'] }, units: 1, points: 1, equivalentValue: { $divide: ['$equivalentCents', 100] } } },
      { $sort: { units: -1, points: -1 } }, { $limit: 10 },
    ]),
    User.countDocuments({ tenantId, pontos: { $gt: 0 } }),
    Order.distinct('usuarioId', { ...orderMatch, pontos_utilizados: { $gt: 0 }, usuarioId: { $ne: null } }),
    StoreSettings.findOne({ tenantId }).select('fidelidade_ativa pontos_por_real valor_ponto_reais').lean(),
    Coupon.find({ tenantId }).sort({ createdAt: -1 }).lean(),
  ]);
  const minRewardRows = await Product.aggregate([{ $match: { tenantId, ativo: { $ne: false }, pode_resgatar: true, pontos_resgate: { $gt: 0 } } }, { $group: { _id: null, minimum: { $min: '$pontos_resgate' } } }]);
  const minimumReward = Number(minRewardRows[0]?.minimum || 0);
  const nearRewardCustomers = minimumReward > 0
    ? await User.find({ tenantId, pontos: { $gt: 0, $lt: minimumReward } }).select('nome telefone pontos').sort({ pontos: -1 }).limit(10).lean()
    : [];
  const couponMap = new Map(couponRows.map((item) => [String(item.code), item]));
  const couponItems = coupons.map((coupon) => ({
    ...coupon,
    analytics: couponMap.get(String(coupon.normalizedCode || coupon.codigo).toUpperCase()) || { uses: 0, customers: 0, revenue: 0, discounts: 0, averageTicket: 0, lastUsedAt: null },
  }));
  const loyalty = loyaltyRows[0] || { pointsGenerated: 0, pointsRedeemed: 0, redemptions: 0, equivalentCents: 0 };
  res.json({
    success: true,
    period: { from: period.fromText, to: period.toText, timezone: period.timezone },
    coupons: couponItems,
    loyalty: {
      enabled: Boolean(settings?.fidelidade_ativa), pointsGenerated: loyalty.pointsGenerated || 0, pointsRedeemed: loyalty.pointsRedeemed || 0,
      redemptions: loyalty.redemptions || 0, customersWithBalance, customersWhoRedeemed: redeemedCustomers.filter(Boolean).length,
      equivalentValue: topRedeemedProducts.length ? Number(loyalty.equivalentCents || 0) / 100 : null,
      topRedeemedProducts, minimumReward: minimumReward || null, nearRewardCustomers,
      historicalProductRankingAvailable: topRedeemedProducts.length > 0,
    },
  });
}));

router.get('/reports/marketing/export.csv', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const rows = await Order.aggregate([
    { $match: { tenantId: req.tenant!._id, status: { $ne: 'Cancelado' }, createdAt: { $gte: period.from, $lte: period.to }, cupom_codigo: { $nin: ['', null] } } },
    { $addFields: { totalCalc: centsExpression('total_centavos', 'total'), discountCalc: { $round: [{ $multiply: [{ $ifNull: ['$desconto_cupom', 0] }, 100] }, 0] } } },
    { $group: { _id: { $toUpper: '$cupom_codigo' }, uses: { $sum: 1 }, customers: { $addToSet: { $ifNull: ['$usuarioId', '$cliente.telefone'] } }, revenueCents: { $sum: '$totalCalc' }, discountCents: { $sum: '$discountCalc' }, lastUsedAt: { $max: '$createdAt' } } },
    { $sort: { revenueCents: -1 } },
  ]);
  csvResponse(res, `cupons-${period.fromText}-a-${period.toText}.csv`, [
    ['Cupom', 'Utilizacoes', 'Clientes', 'Faturamento gerado', 'Descontos concedidos', 'Ticket medio', 'Ultima utilizacao'],
    ...rows.map((row) => [row._id, row.uses, row.customers.length, (row.revenueCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), (row.discountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), (row.uses ? row.revenueCents / row.uses / 100 : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString('pt-BR', { timeZone: period.timezone }) : '']),
  ]);
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
  const period = await tenantPeriod(req, 30);
  const match = { tenantId, createdAt: { $gte: period.from, $lte: period.to } };
  const [summaryRows, statusRows, paymentRows, byDay] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $addFields: { totalCalc: centsExpression('total_centavos', 'total'), shippingCalc: centsExpression('frete_centavos', 'frete'), discountCalc: { $add: [{ $round: [{ $multiply: [{ $ifNull: ['$desconto_cupom', 0] }, 100] }, 0] }, { $round: [{ $multiply: [{ $ifNull: ['$valor_desconto_pontos', 0] }, 100] }, 0] }] }, itemCount: { $sum: { $map: { input: { $ifNull: ['$itens', []] }, as: 'item', in: { $ifNull: ['$$item.quantidade', 0] } } } } } },
      { $group: { _id: null, orders: { $sum: 1 }, validOrders: { $sum: { $cond: [{ $ne: ['$status', 'Cancelado'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelado'] }, 1, 0] } }, revenueCents: { $sum: { $cond: [{ $ne: ['$status', 'Cancelado'] }, '$totalCalc', 0] } }, discountCents: { $sum: { $cond: [{ $ne: ['$status', 'Cancelado'] }, '$discountCalc', 0] } }, shippingCents: { $sum: { $cond: [{ $ne: ['$status', 'Cancelado'] }, '$shippingCalc', 0] } }, itemsSold: { $sum: { $cond: [{ $ne: ['$status', 'Cancelado'] }, '$itemCount', 0] } } } },
    ]),
    Order.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { ...match, status: { $ne: 'Cancelado' } } }, { $addFields: { totalCalc: centsExpression('total_centavos', 'total') } }, { $group: { _id: '$metodo_pagamento', orders: { $sum: 1 }, totalCents: { $sum: '$totalCalc' } } }, { $sort: { totalCents: -1 } }]),
    Order.aggregate([{ $match: { ...match, status: { $ne: 'Cancelado' } } }, { $addFields: { totalCalc: centsExpression('total_centavos', 'total') } }, { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: period.timezone } }, orders: { $sum: 1 }, revenueCents: { $sum: '$totalCalc' } } }, { $sort: { _id: 1 } }]),
  ]);
  const summary = summaryRows[0] || { orders: 0, validOrders: 0, cancelled: 0, revenueCents: 0, discountCents: 0, shippingCents: 0 };
  const byStatus = Object.fromEntries(statusRows.map((row) => [row._id, row.count]));
  const previousPeriod = previousEquivalentPeriod(period);
  const [previous, currentNewCustomers, previousNewCustomers] = await Promise.all([
    salesMetrics(tenantId, previousPeriod.from, previousPeriod.to),
    newCustomerCount(tenantId, period.from, period.to),
    newCustomerCount(tenantId, previousPeriod.from, previousPeriod.to),
  ]);
  const currentAverage = summary.validOrders ? summary.revenueCents / summary.validOrders / 100 : 0;
  const previousAverage = previous.validOrders ? previous.revenueCents / previous.validOrders / 100 : 0;
  res.json({
    success: true,
    period: { from: period.fromText, to: period.toText, timezone: period.timezone, previousFrom: previousPeriod.fromText, previousTo: previousPeriod.toText },
    metrics: { orders: summary.orders, validOrders: summary.validOrders, cancelled: summary.cancelled, revenue: summary.revenueCents / 100, averageOrder: currentAverage, discounts: summary.discountCents / 100, deliveryFees: summary.shippingCents / 100, newCustomers: currentNewCustomers, itemsSold: Number(summary.itemsSold || 0) },
    previous: { orders: previous.orders, validOrders: previous.validOrders, cancelled: previous.cancelled, revenue: previous.revenueCents / 100, averageOrder: previousAverage, newCustomers: previousNewCustomers, itemsSold: previous.itemsSold },
    comparisons: {
      revenue: comparisonValue(summary.revenueCents / 100, previous.revenueCents / 100),
      validOrders: comparisonValue(summary.validOrders, previous.validOrders),
      averageOrder: comparisonValue(currentAverage, previousAverage),
      cancelled: comparisonValue(summary.cancelled, previous.cancelled, true),
      newCustomers: comparisonValue(currentNewCustomers, previousNewCustomers),
      itemsSold: comparisonValue(Number(summary.itemsSold || 0), Number(previous.itemsSold || 0)),
    },
    byStatus,
    payments: paymentRows.map((row) => ({ method: row._id || 'Nao informado', orders: row.orders, total: row.totalCents / 100 })),
    byDay: byDay.map((row) => ({ date: row._id, orders: row.orders, revenue: row.revenueCents / 100 })),
  });
}));

router.get('/reports/summary/export.csv', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const metrics = await salesMetrics(req.tenant!._id, period.from, period.to);
  const paymentRows = await Order.aggregate([
    { $match: { tenantId: req.tenant!._id, status: { $ne: 'Cancelado' }, createdAt: { $gte: period.from, $lte: period.to } } },
    { $addFields: { totalCalc: centsExpression('total_centavos', 'total') } },
    { $group: { _id: '$metodo_pagamento', totalCents: { $sum: '$totalCalc' } } },
  ]);
  const payments = new Map(paymentRows.map((row) => [String(row._id || ''), Number(row.totalCents || 0) / 100]));
  const voucher = (payments.get('food_voucher') || 0) + (payments.get('meal_voucher') || 0);
  const known = new Set(['pix', 'card', 'credit_card', 'debit_card', 'cash', 'food_voucher', 'meal_voucher']);
  const others = paymentRows.filter((row) => !known.has(String(row._id || ''))).reduce((sum, row) => sum + Number(row.totalCents || 0) / 100, 0);
  const br = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  csvResponse(res, `fechamento-${period.fromText}-a-${period.toText}.csv`, [
    ['Periodo', 'Faturamento', 'Pedidos', 'Ticket medio', 'Pix', 'Cartao de credito', 'Cartao de debito', 'Cartao nao especificado', 'Dinheiro', 'VA/VR', 'Outros', 'Taxas de entrega', 'Descontos', 'Cancelamentos'],
    [`${period.fromText} a ${period.toText}`, br(metrics.revenueCents / 100), metrics.validOrders, br(metrics.validOrders ? metrics.revenueCents / metrics.validOrders / 100 : 0), br(payments.get('pix') || 0), br(payments.get('credit_card') || 0), br(payments.get('debit_card') || 0), br(payments.get('card') || 0), br(payments.get('cash') || 0), br(voucher), br(others), br(metrics.shippingCents / 100), br(metrics.discountCents / 100), metrics.cancelled],
  ]);
}));

router.get('/reports/products', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const products = await Order.aggregate([
    { $match: { tenantId: req.tenant!._id, status: { $ne: 'Cancelado' }, createdAt: { $gte: period.from, $lte: period.to } } },
    { $unwind: '$itens' },
    { $lookup: { from: 'products', localField: 'itens.produtoId', foreignField: '_id', as: 'currentProduct' } },
    { $unwind: { path: '$currentProduct', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'categories', localField: 'currentProduct.categoriaId', foreignField: '_id', as: 'currentCategory' } },
    { $unwind: { path: '$currentCategory', preserveNullAndEmptyArrays: true } },
    { $addFields: { itemRevenue: centsExpression('itens.subtotal_centavos', 'itens.subtotal'), categoryName: { $ifNull: ['$itens.categoria_nome', { $ifNull: ['$currentCategory.nome', 'Sem categoria historica'] }] } } },
    { $group: { _id: { product: '$itens.produtoId', name: { $ifNull: ['$itens.nome', { $ifNull: ['$currentProduct.nome', 'Produto removido'] }] }, category: '$categoryName' }, units: { $sum: '$itens.quantidade' }, revenueCents: { $sum: '$itemRevenue' } } },
    { $project: { _id: 0, productId: '$_id.product', name: '$_id.name', category: '$_id.category', units: 1, revenue: { $divide: ['$revenueCents', 100] } } },
    { $sort: { revenue: -1, units: -1, name: 1 } },
  ]);
  const categoryMap = new Map<string, { category: string; units: number; revenue: number }>();
  for (const product of products) {
    const current = categoryMap.get(product.category) || { category: product.category, units: 0, revenue: 0 };
    current.units += Number(product.units || 0); current.revenue += Number(product.revenue || 0); categoryMap.set(product.category, current);
  }
  const totalRevenue = products.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const categories = [...categoryMap.values()].sort((a, b) => b.revenue - a.revenue).map((item) => ({ ...item, share: totalRevenue ? item.revenue / totalRevenue * 100 : 0 }));
  res.json({ success: true, period: { from: period.fromText, to: period.toText, timezone: period.timezone }, products, categories });
}));

router.get('/reports/products/export.csv', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const products = await Order.aggregate([
    { $match: { tenantId: req.tenant!._id, status: { $ne: 'Cancelado' }, createdAt: { $gte: period.from, $lte: period.to } } },
    { $unwind: '$itens' },
    { $lookup: { from: 'products', localField: 'itens.produtoId', foreignField: '_id', as: 'currentProduct' } },
    { $unwind: { path: '$currentProduct', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'categories', localField: 'currentProduct.categoriaId', foreignField: '_id', as: 'currentCategory' } },
    { $unwind: { path: '$currentCategory', preserveNullAndEmptyArrays: true } },
    { $addFields: { itemRevenue: centsExpression('itens.subtotal_centavos', 'itens.subtotal'), categoryName: { $ifNull: ['$itens.categoria_nome', { $ifNull: ['$currentCategory.nome', 'Sem categoria historica'] }] } } },
    { $group: { _id: { name: { $ifNull: ['$itens.nome', { $ifNull: ['$currentProduct.nome', 'Produto removido'] }] }, category: '$categoryName' }, units: { $sum: '$itens.quantidade' }, revenueCents: { $sum: '$itemRevenue' } } },
    { $sort: { revenueCents: -1, units: -1 } },
  ]);
  const totalRevenue = products.reduce((sum, item) => sum + Number(item.revenueCents || 0), 0);
  const kind = String(req.query.kind || 'products');
  if (kind === 'categories') {
    const grouped = new Map<string, { units: number; revenueCents: number }>();
    for (const item of products) {
      const name = String(item._id.category || 'Sem categoria historica');
      const current = grouped.get(name) || { units: 0, revenueCents: 0 };
      current.units += Number(item.units || 0); current.revenueCents += Number(item.revenueCents || 0); grouped.set(name, current);
    }
    csvResponse(res, `categorias-${period.fromText}-a-${period.toText}.csv`, [
      ['Categoria', 'Quantidade vendida', 'Faturamento', 'Participacao'],
      ...[...grouped.entries()].sort((a, b) => b[1].revenueCents - a[1].revenueCents).map(([name, item]) => [name, item.units, (item.revenueCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), `${(totalRevenue ? item.revenueCents / totalRevenue * 100 : 0).toFixed(2).replace('.', ',')}%`]),
    ]);
    return;
  }
  csvResponse(res, `produtos-vendidos-${period.fromText}-a-${period.toText}.csv`, [
    ['Produto', 'Categoria', 'Quantidade vendida', 'Faturamento', 'Participacao'],
    ...products.map((item) => [item._id.name, item._id.category, item.units, (item.revenueCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), `${(totalRevenue ? item.revenueCents / totalRevenue * 100 : 0).toFixed(2).replace('.', ',')}%`]),
  ]);
}));

router.get('/reports/operation', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const match = { tenantId: req.tenant!._id, createdAt: { $gte: period.from, $lte: period.to } };
  const [timingRows, hourlyRows, totals] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $project: { createdAt: 1, status: 1, preparingAt: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$historico_status', as: 'history', cond: { $eq: ['$$history.status', 'Preparando'] } } }, as: 'history', in: '$$history.data' } }, 0] }, readyAt: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$historico_status', as: 'history', cond: { $eq: ['$$history.status', 'Saiu para Entrega'] } } }, as: 'history', in: '$$history.data' } }, 0] }, deliveredAt: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$historico_status', as: 'history', cond: { $eq: ['$$history.status', 'Entregue'] } } }, as: 'history', in: '$$history.data' } }, 0] } } },
      { $group: { _id: null, startSamples: { $sum: { $cond: [{ $ne: ['$preparingAt', null] }, 1, 0] } }, startMs: { $avg: { $cond: [{ $ne: ['$preparingAt', null] }, { $subtract: ['$preparingAt', '$createdAt'] }, null] } }, prepSamples: { $sum: { $cond: [{ $and: [{ $ne: ['$preparingAt', null] }, { $ne: [{ $ifNull: ['$readyAt', '$deliveredAt'] }, null] }] }, 1, 0] } }, prepMs: { $avg: { $cond: [{ $and: [{ $ne: ['$preparingAt', null] }, { $ne: [{ $ifNull: ['$readyAt', '$deliveredAt'] }, null] }] }, { $subtract: [{ $ifNull: ['$readyAt', '$deliveredAt'] }, '$preparingAt'] }, null] } }, totalSamples: { $sum: { $cond: [{ $ne: ['$deliveredAt', null] }, 1, 0] } }, totalMs: { $avg: { $cond: [{ $ne: ['$deliveredAt', null] }, { $subtract: ['$deliveredAt', '$createdAt'] }, null] } } } },
    ]),
    Order.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { date: '$createdAt', format: '%H:00', timezone: period.timezone } }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([{ $match: match }, { $group: { _id: null, orders: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelado'] }, 1, 0] } } } }]),
  ]);
  const timing = timingRows[0] || {};
  const total = totals[0] || { orders: 0, cancelled: 0 };
  const duration = (value: unknown, samples: number) => samples > 0 && Number.isFinite(Number(value)) ? Math.round(Number(value) / 60000) : null;
  res.json({ success: true, period: { from: period.fromText, to: period.toText, timezone: period.timezone }, metrics: { averageToPrepareMinutes: duration(timing.startMs, timing.startSamples), averagePreparationMinutes: duration(timing.prepMs, timing.prepSamples), averageTotalMinutes: duration(timing.totalMs, timing.totalSamples), cancellationRate: total.orders ? total.cancelled / total.orders * 100 : null, samples: { start: timing.startSamples || 0, preparation: timing.prepSamples || 0, total: timing.totalSamples || 0 } }, byHour: hourlyRows.map((row) => ({ hour: row._id, orders: row.orders })), peakHours: [...hourlyRows].sort((a, b) => b.orders - a.orders).slice(0, 3).map((row) => ({ hour: row._id, orders: row.orders })) });
}));

export default router;
