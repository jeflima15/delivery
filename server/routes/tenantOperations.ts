import express, { Router } from 'express';
import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import mongoose from 'mongoose';
import type { DeliveryPolygonGeometry } from '../../src/types/deliveryRegions.js';
import { z } from 'zod';
import { isValidEstimate, validateEstimateSettings, readEstimateSettings, readDeliveryEstimate } from '../../src/lib/deliveryEstimates.js';
import Product from '../../src/models/Product.js';
import Category from '../../src/models/Category.js';
import Order from '../../src/models/Order.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import { listPreorderSlots, preorderSettingsSchema, preorderProductPolicySchema } from '../domain/preorderScheduling.js';
import { onboardingDraftSchema } from '../../src/lib/onboardingSetup.js';
import { activePreorderSettings, lockPreorderCalendar, reservePreorder, availablePreorderSlots, nextAvailablePreorderSlot, preorderSelectionSchema } from '../services/preorderService.js';
import HomeBlock from '../../src/models/HomeBlock.js';
import Coupon from '../../src/models/Coupon.js';
import ComplementGroup from '../../src/models/ComplementGroup.js';
import User from '../../src/models/User.js';
import AuditLog from '../../src/models/AuditLog.js';
import Tenant from '../models/Tenant.js';
import CashSession from '../models/CashSession.js';
import StockMovement from '../models/StockMovement.js';
import CustomerPasswordRecovery from '../models/CustomerPasswordRecovery.js';
import { requirePermission } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { effectiveComplementMinimum, validateComplementGroupRules } from '../../src/lib/complementRules.js';
import { validateBody } from '../middleware/validate.js';
import { securityRateLimit } from '../middleware/rateLimit.js';
import { audit } from '../services/auditService.js';
import { reaisToCents } from '../domain/money.js';
import { paymentMethodLabel } from '../../src/lib/paymentMethods.js';
import { createTenantReadUrl, deleteStoredFile } from '../services/storageService.js';
import { createManualPreorder } from '../services/manualOrderService.js';
import { getEnv } from '../config/env.js';
import { computeIsStoreOpen } from '../../src/lib/storeStatus.js';
import DeliveryRegion from '../../src/models/DeliveryRegion.js';
import { geocodeAddress, searchDistricts } from '../services/geocodingService.js';
import { deliveryRegionDto, resolveRegionFromList, validateDeliveryGeometry } from '../services/deliveryRegionService.js';
import { lookupPostalCode } from '../services/postalCodeService.js';
import { calculateLoyaltyPoints } from '../../src/lib/loyalty.js';
import { getOperationalDate } from '../domain/operationalDay.js';
import { hasConfiguredDeliveryRates } from '../../src/lib/deliveryConfiguration.js';
import { testGeminiIntegration, analyzeMenuWithFullLab } from '../services/geminiService.js';

const parseRawCatalogFile: RequestHandler = (req, res, next) => {
  const rawParser = express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    limit: 3 * 1024 * 1024,
  });
  rawParser(req, res, (err: any) => {
    if (err) {
      if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
        return next(new HttpError(413, 'O arquivo enviado excede o limite máximo de 3 MiB.', 'FILE_TOO_LARGE'));
      }
      return next(new HttpError(400, 'Falha ao processar arquivo enviado.', 'INVALID_FILE_PAYLOAD'));
    }
    next();
  });
};

const router = Router({ mergeParams: true });
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const optionalCategoryId = z.preprocess((value) => value === '' ? null : value, objectId.nullable().optional());
const money = z.coerce.number().finite().nonnegative();

const additionalItemSchema = z.object({
  _id: z.unknown().optional(),
  nome: z.string().trim().min(1).max(160),
  descricao: z.string().trim().max(300).optional().default(''),
  preco: money.default(0),
  preco_centavos: z.coerce.number().int().nonnegative().optional(),
  maximo: z.coerce.number().int().nonnegative().optional().default(0),
  ativo: z.boolean().default(true),
});

const validateGroupRules = (group: z.infer<typeof additionalGroupBaseSchema>, context: z.RefinementCtx) => {
  const message = validateComplementGroupRules(group);
  if (message) context.addIssue({ code: 'custom', path: ['itens'], message });
  if (group.obrigatorio && Number(group.minimo) < 1) {
    context.addIssue({ code: 'custom', path: ['minimo'], message: 'Grupos obrigatorios devem exigir pelo menos uma opcao.' });
  }
};

const additionalGroupBaseSchema = z.object({
  _id: z.unknown().optional(),
  nome: z.string().trim().min(1).max(160),
  obrigatorio: z.boolean().default(false),
  minimo: z.coerce.number().int().nonnegative().default(0),
  maximo: z.coerce.number().int().positive().default(1),
  itens: z.array(additionalItemSchema).max(100).default([]),
});

const additionalGroupSchema = additionalGroupBaseSchema.superRefine(validateGroupRules);

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

const complementGroupSchema = complementGroupBaseSchema.superRefine(validateGroupRules);
const complementItemStatusSchema = z.object({ ativo: z.boolean() });

const comboOptionSchema = z.object({
  _id: z.unknown().optional(),
  produtoId: z.preprocess((value) => String(value), objectId),
  acrescimo_centavos: z.coerce.number().int().nonnegative().default(0),
  ordem: z.coerce.number().int().nonnegative().default(0),
});

const fixedComboItemSchema = z.object({
  produtoId: z.preprocess((value) => String(value), objectId),
  quantidade: z.coerce.number().int().positive('Quantidade deve ser maior que zero.').default(1),
});

const comboStageSchema = z.object({
  _id: z.unknown().optional(),
  nome: z.string().trim().min(2).max(160),
  ordem: z.coerce.number().int().nonnegative().default(0),
  valor_etapa_centavos: z.coerce.number().int().nonnegative().default(0),
  cobrar_complementos: z.boolean().default(true),
  opcoes: z.array(comboOptionSchema).min(1, 'Adicione ao menos um produto nesta etapa.').max(100),
}).superRefine((stage, context) => {
  const productIds = stage.opcoes.map((option) => option.produtoId);
  if (new Set(productIds).size !== productIds.length) context.addIssue({ code: 'custom', path: ['opcoes'], message: 'Um produto nao pode aparecer duas vezes na mesma etapa.' });
});

const productBaseSchema = z.object({
  preorderDraft: preorderProductPolicySchema.optional(),
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
  exclusivo_combo: z.boolean().default(false),
  grupos_adicionais: z.array(additionalGroupSchema).max(30).default([]),
  combo_mode: z.enum(['fixed', 'stages']).optional(),
  combo_preco_base_centavos: z.coerce.number().int().nonnegative().optional(),
  combo_itens_fixos: z.array(fixedComboItemSchema).max(50).default([]),
  combo_etapas: z.array(comboStageSchema).max(20).default([]),
});

const productSchema = productBaseSchema.superRefine((product, context) => {
  if (product.tipo === 'combo') {
    const mode = product.combo_mode || (product.combo_itens_fixos.length > 0 && product.combo_etapas.length === 0 ? 'fixed' : 'stages');
    if (mode === 'fixed') {
      if (product.combo_itens_fixos.length === 0) {
        context.addIssue({ code: 'custom', path: ['combo_itens_fixos'], message: 'Adicione ao menos um item ao combo fixo.' });
      }
      const itemProductIds = product.combo_itens_fixos.map((item) => item.produtoId);
      if (new Set(itemProductIds).size !== itemProductIds.length) {
        context.addIssue({ code: 'custom', path: ['combo_itens_fixos'], message: 'Um produto nao pode aparecer duas vezes na lista de itens fixos.' });
      }
      if (product.combo_preco_base_centavos === undefined && (product.preco === undefined || product.preco < 0)) {
        context.addIssue({ code: 'custom', path: ['combo_preco_base_centavos'], message: 'Informe o preco do combo fixo.' });
      }
    } else {
      if (product.combo_etapas.length === 0) {
        context.addIssue({ code: 'custom', path: ['combo_etapas'], message: 'Adicione ao menos uma etapa ao combo.' });
      }
      const stageIds = product.combo_etapas.map((stage) => stage._id && String(stage._id)).filter(Boolean);
      if (new Set(stageIds).size !== stageIds.length) {
        context.addIssue({ code: 'custom', path: ['combo_etapas'], message: 'O combo possui etapas duplicadas.' });
      }
    }
  }
});

function comboStartingPriceCents(product: z.infer<typeof productBaseSchema>) {
  const mode = product.combo_mode || (product.combo_itens_fixos.length > 0 && product.combo_etapas.length === 0 ? 'fixed' : 'stages');
  if (mode === 'fixed') {
    if (typeof product.combo_preco_base_centavos === 'number') {
      return product.combo_preco_base_centavos;
    }
    return reaisToCents(product.preco);
  }
  const baseCents = typeof product.combo_preco_base_centavos === 'number' ? product.combo_preco_base_centavos : 0;
  const stagesExtra = (product.combo_etapas || []).reduce((total, stage) => {
    const smallestExtra = stage.opcoes.length ? Math.min(...stage.opcoes.map((option) => option.acrescimo_centavos)) : 0;
    return total + (stage.valor_etapa_centavos || 0) + (isFinite(smallestExtra) ? smallestExtra : 0);
  }, 0);
  return baseCents + stagesExtra;
}

function productMoneyFields(product: z.infer<typeof productSchema>) {
  if (product.tipo === 'combo') {
    const startingPriceCents = comboStartingPriceCents(product);
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
  const mode = product.combo_mode || (product.combo_itens_fixos.length > 0 && product.combo_etapas.length === 0 ? 'fixed' : 'stages');
  const stageIds = (product.combo_etapas || []).flatMap((stage) => stage.opcoes.map((option) => option.produtoId));
  const fixedIds = (product.combo_itens_fixos || []).map((item) => item.produtoId);
  const ids = [...new Set([...stageIds, ...fixedIds])];
  if (currentId && ids.includes(currentId)) throw new HttpError(400, 'Um combo nao pode conter a si proprio.', 'COMBO_CYCLE');
  const referenced = await Product.find({ tenantId, _id: { $in: ids } }).select('_id nome tipo ativo esgotado controlar_estoque estoque').lean();
  if (referenced.length !== ids.length) throw new HttpError(400, 'O combo possui produtos inexistentes ou de outra loja.', 'INVALID_COMBO_PRODUCTS');
  if (referenced.some((item) => item.tipo === 'combo')) throw new HttpError(400, 'Nao e permitido adicionar um combo dentro de outro combo.', 'NESTED_COMBO');

  if (product.ativo) {
    const byId = new Map(referenced.map((item) => [String(item._id), item]));
    if (mode === 'fixed') {
      for (const item of product.combo_itens_fixos) {
        const component: any = byId.get(item.produtoId);
        if (!component || component.ativo === false || component.esgotado === true) {
          throw new HttpError(400, `O item fixo "${component?.nome || 'Produto'}" esta inativo ou esgotado.`, 'COMBO_COMPONENT_UNAVAILABLE');
        }
        if (component.controlar_estoque && Number(component.estoque || 0) < Number(item.quantidade || 1)) {
          throw new HttpError(400, `O item fixo "${component.nome}" nao possui estoque suficiente (${component.estoque} disponivel, ${item.quantidade} necessario).`, 'COMBO_COMPONENT_LOW_STOCK');
        }
      }
    } else {
      const unavailableStage = product.combo_etapas.find((stage) => !stage.opcoes.some((option) => {
        const item: any = byId.get(option.produtoId);
        return item && item.ativo !== false && item.esgotado !== true && (!item.controlar_estoque || Number(item.estoque || 0) > 0);
      }));
      if (unavailableStage) throw new HttpError(400, `A etapa "${unavailableStage.nome}" nao possui nenhuma opcao disponivel.`, 'COMBO_STAGE_UNAVAILABLE');
    }
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

router.get('/settings/operational-status', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const settings = await StoreSettings.findOne({ tenantId: req.tenant!._id }).select('is_open abertura_automatica horarios_funcionamento pausado_manualmente pausado_ate aberto_manualmente_ate').lean();
  res.json({ success: true, is_open: computeIsStoreOpen(settings, new Date(), req.tenant!.timezone), abertura_automatica: Boolean(settings?.abertura_automatica), pausado_manualmente: Boolean(settings?.pausado_manualmente), pausado_ate: settings?.pausado_ate || null, aberto_manualmente_ate: settings?.aberto_manualmente_ate || null, serverTime: new Date().toISOString() });
}));

router.patch('/settings/toggle-status', requireCsrf, requirePermission('operation:write'), asyncRoute(async (req, res) => {
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

  const before = { is_open: settings.is_open, abertura_automatica: settings.abertura_automatica, pausado_manualmente: settings.pausado_manualmente, pausado_ate: settings.pausado_ate, aberto_manualmente_ate: settings.aberto_manualmente_ate };
  if (settings.abertura_automatica) {
    settings.pausado_manualmente = !willOpen;
    settings.pausado_ate = null;
    settings.aberto_manualmente_ate = willOpen ? new Date(Date.now() + 12 * 60 * 60_000) : null;
  } else {
    settings.is_open = willOpen;
    settings.pausado_manualmente = false;
    settings.pausado_ate = null;
    settings.aberto_manualmente_ate = null;
  }
  await settings.save();
  
  await audit(req, { action: 'STORE_STATUS_TOGGLED', targetType: 'StoreSettings', targetId: settings._id.toString(), before, after: { is_open: settings.is_open, abertura_automatica: settings.abertura_automatica, pausado_manualmente: settings.pausado_manualmente, pausado_ate: settings.pausado_ate, aberto_manualmente_ate: settings.aberto_manualmente_ate } });
  
  res.json({ success: true, is_open: computeIsStoreOpen(settings, new Date(), req.tenant!.timezone), abertura_automatica: settings.abertura_automatica, pausado_manualmente: settings.pausado_manualmente, pausado_ate: settings.pausado_ate, aberto_manualmente_ate: settings.aberto_manualmente_ate });
}));

const storePauseSchema = z.object({ minutes: z.number().int().min(1).max(24 * 60).nullable() });
router.patch('/settings/pause', requireCsrf, requirePermission('operation:write'), validateBody(storePauseSchema), asyncRoute(async (req, res) => {
  let settings = await StoreSettings.findOne({ tenantId: req.tenant!._id });
  if (!settings) settings = await StoreSettings.create({ tenantId: req.tenant!._id, nome_loja: req.tenant!.displayName });
  const before = { pausado_manualmente: settings.pausado_manualmente, pausado_ate: settings.pausado_ate };
  const minutes = req.body.minutes as number | null;
  settings.pausado_manualmente = minutes !== null;
  settings.pausado_ate = minutes === null ? null : new Date(Date.now() + minutes * 60_000);
  settings.aberto_manualmente_ate = null;
  await settings.save();
  await audit(req, { action: minutes === null ? 'STORE_PAUSE_RESUMED' : 'STORE_PAUSED', targetType: 'StoreSettings', targetId: settings._id.toString(), before, after: { pausado_manualmente: settings.pausado_manualmente, pausado_ate: settings.pausado_ate } });
  res.json({ success: true, pausado_manualmente: settings.pausado_manualmente, pausado_ate: settings.pausado_ate, is_open: computeIsStoreOpen(settings) });
}));

// ENDPOINTS DE ONBOARDING
async function activationReadiness(tenantId: mongoose.Types.ObjectId, settingsInput?: any) {
  const settings = settingsInput || await StoreSettings.findOne({ tenantId }).lean();
  const tenant = await Tenant.findById(tenantId).select('onboarding').lean();
  const buyableProducts = await Product.countDocuments({ tenantId, ativo: { $ne: false }, esgotado: { $ne: true }, exclusivo_combo: { $ne: true }, $or: [{ controlar_estoque: { $ne: true } }, { estoque: { $gt: 0 } }] });
  const allowDelivery = settings?.logisticsOptions?.allowDelivery !== false;
  const allowPickup = settings?.logisticsOptions?.allowPickup !== false;
  const allowDineIn = Boolean(settings?.logisticsOptions?.allowDineIn);
  const legacyCard = settings?.pagamento_cartao !== false;
  const payments = Boolean(settings?.pagamento_pix && settings?.chave_pix)
    || Boolean(typeof settings?.pagamento_cartao_credito === 'boolean' ? settings.pagamento_cartao_credito : legacyCard)
    || Boolean(typeof settings?.pagamento_cartao_debito === 'boolean' ? settings.pagamento_cartao_debito : legacyCard)
    || Boolean(settings?.pagamento_dinheiro || settings?.pagamento_vale_alimentacao || settings?.pagamento_vale_refeicao);
  const agenda = preorderSettingsSchema.safeParse(settings?.preorderDraft || {});
  const scheduling = settings?.preorderEnabled === true;
  const scheduleReady = !scheduling || (agenda.success && agenda.data.salesMode !== 'immediate_only'
    && (agenda.data.weeklySchedule.some((day) => day.intervals.length > 0) || agenda.data.dateOverrides.some((day) => day.intervals.length > 0))
    && (agenda.data.depositPercent === 0 || Boolean(settings?.pagamento_pix && String(settings?.chave_pix || '').trim())));
  const checks = {
    profile: !tenant?.onboarding?.draft?.mode || tenant.onboarding.completed === true || tenant.onboarding.draft.mode === (scheduling && agenda.success ? agenda.data.salesMode : 'immediate_only'),
    identity: Boolean(settings?.nome_loja && !['Stitch Delivery', 'Minha Loja'].includes(settings.nome_loja) && (settings?.whatsapp || settings?.telefone)),
    service: allowDelivery || allowPickup || allowDineIn,
    delivery: !allowDelivery || hasConfiguredDeliveryRates(settings),
    address: !(allowDelivery || allowPickup) || Boolean(settings?.rua_loja && settings?.numero_loja && settings?.cidade_loja),
    hours: (scheduling && agenda.success && agenda.data.salesMode === 'scheduled_only') || !settings?.abertura_automatica || Boolean(settings?.horarios_funcionamento && Object.values(settings.horarios_funcionamento).some((day: any) => day?.aberto)),
    schedule: scheduleReady,
    product: buyableProducts > 0,
    payments,
  };
  return { ready: Object.values(checks).every(Boolean), checks, buyableProducts, salesMode: (tenant?.onboarding?.completed !== true && tenant?.onboarding?.draft?.mode) || (scheduling && agenda.success ? agenda.data.salesMode : 'immediate_only') };
}

router.get('/onboarding/status', requirePermission('settings:read'), asyncRoute(async (req, res) => {
  const tenantId = req.tenant!._id;
  const [tenant, productsCount, settings] = await Promise.all([
    Tenant.findById(tenantId).select('displayName onboarding status').lean(),
    Product.countDocuments({ tenantId }),
    StoreSettings.findOne({ tenantId }).lean(),
  ]);

  const readiness = await activationReadiness(tenantId, settings);
  res.json({
    success: true,
    onboarding: (tenant as any)?.onboarding || { completed: false, step: 'welcome' },
    hasProducts: productsCount > 0,
    productsCount,
    hasSettings: !!settings,
    storeName: tenant?.displayName || '',
    settings: settings || null,
    readiness,
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
    const readiness = await activationReadiness(tenantId);
    if (!readiness.ready) throw new HttpError(409, 'Conclua os requisitos obrigatorios antes de ativar a loja.', 'ONBOARDING_INCOMPLETE');
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
  const settings = await StoreSettings.findOne({ tenantId }).lean();
  const readiness = await activationReadiness(tenantId, settings);
  if (!readiness.ready) throw new HttpError(409, 'Conclua os requisitos obrigatorios antes de ativar a loja.', 'ONBOARDING_INCOMPLETE');
  await Tenant.updateOne(
    { _id: tenantId },
    { $set: { 'onboarding.completed': true, 'onboarding.step': 'complete', displayName: settings!.nome_loja, status: 'active', activatedAt: new Date() } }
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
      pendingOrders: await Order.countDocuments({ tenantId, status: { $in: ['Pendente', 'Preparando', 'Pronto', 'Saiu para Entrega'] } }),
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
    readiness: await activationReadiness(tenantId, settings),
  });
}));

router.get('/orders/active', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const filter = { 
    tenantId: req.tenant!._id,
    $or: [{ status: { $in: ['Pendente', 'Preparando', 'Pronto', 'Saiu para Entrega'] } }, { preorder: { $exists: true }, status: 'Cancelado', payment_status: 'refund_pending' }]
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
  Pendente: ['Preparando', 'Pronto', 'Saiu para Entrega', 'Entregue', 'Cancelado'],
  Preparando: ['Pronto', 'Saiu para Entrega', 'Entregue', 'Cancelado'],
  Pronto: ['Saiu para Entrega', 'Entregue', 'Cancelado'],
  'Saiu para Entrega': ['Entregue', 'Cancelado'],
  Entregue: [],
  Cancelado: [],
};
const orderStatusSchema = z.object({
  status: z.enum(['Pendente', 'Preparando', 'Pronto', 'Saiu para Entrega', 'Entregue', 'Cancelado']),
  reason: z.string().trim().min(3).max(500).optional(),
  stockDisposition: z.enum(['return', 'loss', 'mixed', 'not_applicable']).optional(),
  stockReturns: z.array(z.object({ productId: objectId, returnQuantity: z.coerce.number().int().nonnegative() })).max(100).optional(),
}).superRefine((value, context) => {
  if (value.status === 'Cancelado' && !value.reason) context.addIssue({ code: 'custom', path: ['reason'], message: 'Informe o motivo do cancelamento.' });
  if (value.status !== 'Cancelado' && (value.stockDisposition || value.stockReturns)) context.addIssue({ code: 'custom', path: ['stockDisposition'], message: 'Destino de estoque so pode ser informado no cancelamento.' });
});
const partialProductSchema = productBaseSchema.partial().extend({ expectedUpdatedAt: z.string().datetime().optional() });
const productUpdateSchema = z.record(z.string(), z.unknown()).transform((input, context) => {
  const parsed = partialProductSchema.safeParse(input);
  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => context.addIssue({ code: 'custom', path: issue.path, message: issue.message }));
    return z.NEVER;
  }
  // Zod defaults still run under partial(). Only explicitly sent fields may replace stored values.
  return Object.fromEntries(Object.entries(parsed.data).filter(([key]) => Object.hasOwn(input, key)));
});

router.put('/onboarding/draft', requireCsrf, requirePermission('settings:write'), validateBody(z.object({ draft: onboardingDraftSchema, step: z.number().int().min(0).max(5), revision: z.number().int().nonnegative() }).strict()), asyncRoute(async (req, res) => {
  const { draft, step, revision } = req.body;
  const tenant = await Tenant.findOneAndUpdate({ _id: req.tenant!._id, 'onboarding.completed': { $ne: true }, ...(revision === 0 ? { $or: [{ 'onboarding.revision': 0 }, { 'onboarding.revision': { $exists: false } }] } : { 'onboarding.revision': revision }) },
    { $set: { 'onboarding.draft': draft, 'onboarding.step': `setup-${step}` }, $inc: { 'onboarding.revision': 1 } }, { returnDocument: 'after' }).select('onboarding').lean();
  if (!tenant) throw new HttpError(409, 'O assistente foi atualizado em outra aba ou ja foi concluido. Reabra para continuar.', 'ONBOARDING_CONFLICT');
  res.json({ success: true, revision: tenant.onboarding.revision });
}));

const manualOrderSchema = z.object({
  operationId: z.string().uuid(),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(8).max(30),
  itemName: z.string().trim().min(2).max(160),
  description: z.string().trim().min(3).max(3_000),
  referenceImages: z.array(z.object({ bucket: z.literal('order-references'), path: z.string().min(20).max(500) }).strict()).max(3).default([]),
  preorder: preorderSelectionSchema,
  deliveryType: z.enum(['pickup', 'delivery']),
  deliveryAddress: z.string().trim().max(1_000).optional(),
  itemPriceCents: z.number().int().positive(),
  shippingCents: z.number().int().nonnegative().default(0),
  paymentMethod: z.enum(['pix', 'card', 'credit_card', 'debit_card', 'cash', 'food_voucher', 'meal_voucher']),
  receivedCents: z.number().int().nonnegative().default(0),
  receivedMethod: z.enum(['pix', 'card', 'credit_card', 'debit_card', 'cash', 'food_voucher', 'meal_voucher']).optional(),
}).strict();

router.get('/orders/manual/setup', requirePermission('orders:write'), asyncRoute(async (req, res) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
  const settings = await StoreSettings.findOne({ tenantId: req.tenant!._id }).lean();
  if (!settings?.preorderEnabled) throw new HttpError(409, 'Ative a agenda de encomendas em Horarios e operacao antes de cadastrar.', 'PREORDER_DISABLED');
  const config = activePreorderSettings(settings);
  const timezone = req.tenant!.timezone || 'America/Sao_Paulo';
  const availability = await availablePreorderSlots({ tenantId: req.tenant!._id, settings, date, timezone, policies: [{ availability: 'scheduled_only' }] });
  let availabilityMessage = '';
  if (!availability.slots.length) {
    const override = config.dateOverrides.find((entry) => entry.date === date);
    const intervals = override?.intervals ?? config.weeklySchedule.find((entry) => entry.weekday === new Date(`${date}T00:00:00.000Z`).getUTCDay())?.intervals ?? [];
    if (!intervals.length) availabilityMessage = 'A loja não recebe encomendas nesta data.';
    else {
      const emptyCalendarSlots = listPreorderSlots({ settings: config, date, timezone, now: new Date(), products: [{ availability: 'scheduled_only' }] });
      availabilityMessage = emptyCalendarSlots.length ? 'Todos os horários desta data já estão ocupados.' : 'Esta data não atende ao prazo mínimo ou ao período permitido para encomendas.';
    }
  }
  const nextAvailable = availability.slots.length ? null : await nextAvailablePreorderSlot({ tenantId: req.tenant!._id, settings, afterDate: date, timezone, policies: [{ availability: 'scheduled_only' }] });
  res.json({ success: true, slots: availability.slots, availabilityMessage, nextAvailable, depositPercent: config.depositPercent, maxAdvanceDays: config.maxAdvanceDays, logisticsOptions: settings?.logisticsOptions || {}, paymentMethods: {
    pix: settings?.pagamento_pix !== false, card: settings?.pagamento_cartao !== false,
    credit_card: settings?.pagamento_cartao_credito ?? settings?.pagamento_cartao !== false,
    debit_card: settings?.pagamento_cartao_debito ?? settings?.pagamento_cartao !== false,
    cash: settings?.pagamento_dinheiro !== false, food_voucher: Boolean(settings?.pagamento_vale_alimentacao), meal_voucher: Boolean(settings?.pagamento_vale_refeicao),
  } });
}));

router.get('/orders/manual/cep/:cep', requirePermission('orders:write'), asyncRoute(async (req, res) => {
  res.json({ success: true, address: await lookupPostalCode(String(req.params.cep)) });
}));

router.post('/orders/manual', requireCsrf, requirePermission('orders:write'), validateBody(manualOrderSchema), asyncRoute(async (req, res) => {
  const result = await createManualPreorder(req.tenant!._id, req.auth!.accountId, req.body, { timezone: req.tenant!.timezone || 'America/Sao_Paulo' });
  await audit(req, { action: 'MANUAL_ORDER_CREATED', targetType: 'Order', targetId: String(result.order._id), after: { orderNumber: result.order.orderNumber, totalCents: result.totalCents } });
  res.status(201).json({ success: true, ...result });
}));

router.get('/orders/:id/reference-images/:index', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Imagem nao encontrada.', 'NOT_FOUND');
  const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).select('itens.personalizacao.imagens_referencia').lean();
  const images = (order?.itens || []).flatMap((item: any) => item.personalizacao?.imagens_referencia || []);
  const image = images[Number(req.params.index)];
  if (!image) throw new HttpError(404, 'Imagem nao encontrada.', 'NOT_FOUND');
  res.setHeader('Cache-Control', 'private, no-store');
  res.redirect(await createTenantReadUrl(req.tenant!._id, image.bucket, image.path));
}));

function orderStockDemand(order: any): Map<string, { name: string; quantity: number }> {
  const demand = new Map<string, { name: string; quantity: number }>();
  const add = (id: unknown, name: unknown, quantity: number) => {
    const key = String(id || '');
    if (!mongoose.isValidObjectId(key) || quantity <= 0) return;
    const current = demand.get(key);
    demand.set(key, { name: String(name || current?.name || 'Produto'), quantity: (current?.quantity || 0) + quantity });
  };
  for (const item of order.itens || []) {
    const ordered = Math.max(1, Number(item.quantidade || 1));
    if (item.tipo_item !== 'combo') add(item.produtoId, item.nome, ordered);
    for (const fixed of item.combo_snapshot?.items || []) add(fixed.productId, fixed.productName, Number(fixed.quantidade || 1) * ordered);
    for (const stage of item.combo_snapshot?.etapas || []) add(stage.produtoId, stage.produto_nome, ordered);
  }
  return demand;
}

router.patch('/orders/:id/status', requireCsrf, requirePermission('orders:write'), validateBody(orderStatusSchema), (req, _res, next) => {
  if (req.body.status === 'Cancelado' && !req.auth?.permissions.includes('orders:cancel')) return next(new HttpError(403, 'Voce nao tem permissao para cancelar pedidos.', 'FORBIDDEN'));
  next();
}, asyncRoute(async (req, res) => {
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
      if (order.preorder && req.body.status !== 'Cancelado') {
        const net = Number(order.paid_amount_cents || 0) - Number(order.refunded_amount_cents || 0);
        const required = req.body.status === 'Entregue' ? Number(order.total_centavos) : Number(order.preorder.depositCents);
        if (net < required) throw new HttpError(409, req.body.status === 'Entregue' ? 'Confira o saldo restante antes de concluir a encomenda.' : 'Confira o sinal antes de iniciar a producao.', 'PREORDER_PAYMENT_REQUIRED');
      }
      if (req.body.status === 'Cancelado') {
        if (order.preorder) await lockPreorderCalendar(req.tenant!._id, session);
        const demand = orderStockDemand(order);
        const trackedProducts = await Product.find({ _id: { $in: [...demand.keys()] }, tenantId: req.tenant!._id, controlar_estoque: true }).session(session);
        const trackedIds = new Set(trackedProducts.map((product) => String(product._id)));
        if (trackedIds.size > 0 && !req.body.stockDisposition) throw new HttpError(400, 'Informe se os itens controlados voltam ao estoque ou foram perdidos.', 'STOCK_DISPOSITION_REQUIRED');
        const requestedReturns = new Map((req.body.stockReturns || []).map((item: any) => [String(item.productId), Number(item.returnQuantity)]));
        const cancellationItems: Array<Record<string, unknown>> = [];
        for (const product of trackedProducts) {
          const key = String(product._id);
          const itemDemand = demand.get(key)!;
          const returned = req.body.stockDisposition === 'return'
            ? itemDemand.quantity
            : req.body.stockDisposition === 'mixed'
              ? Number(requestedReturns.get(key) || 0)
              : 0;
          if (returned > itemDemand.quantity) throw new HttpError(400, `Quantidade devolvida invalida para ${itemDemand.name}.`, 'INVALID_STOCK_RETURN');
          const lost = itemDemand.quantity - returned;
          if (returned > 0) {
            await Product.updateOne(
              { _id: product._id, tenantId: req.tenant!._id },
              [{ $set: { estoque: { $add: ['$estoque', returned] }, esgotado: { $cond: ['$esgotado_automatico', false, '$esgotado'] }, esgotado_automatico: false } }],
              { session, updatePipeline: true },
            );
            await StockMovement.create([{ tenantId: req.tenant!._id, orderId: order._id, productId: product._id, type: 'cancellation_return', quantity: returned, actorId: req.auth!.accountId, reason: req.body.reason, operationKey: `cancel:return:${order._id}:${key}` }], { session });
          }
          if (lost > 0) await StockMovement.create([{ tenantId: req.tenant!._id, orderId: order._id, productId: product._id, type: 'cancellation_loss', quantity: lost, actorId: req.auth!.accountId, reason: req.body.reason, operationKey: `cancel:loss:${order._id}:${key}` }], { session });
          cancellationItems.push({ productId: product._id, productName: itemDemand.name, orderedQuantity: itemDemand.quantity, returnedQuantity: returned, lostQuantity: lost });
        }
        order.cancellation = { reason: req.body.reason, stockDisposition: trackedIds.size === 0 ? 'not_applicable' : req.body.stockDisposition, items: cancellationItems, actorId: req.auth!.accountId, createdAt: new Date() };
        if (Number(order.paid_amount_cents || 0) > Number(order.refunded_amount_cents || 0)) order.payment_status = 'refund_pending';
      }
      order.status = req.body.status;
      order.historico_status.push({ status: req.body.status, data: new Date(), actorId: req.auth!.accountId, reason: req.body.reason });
      if (order.usuarioId && req.body.status === 'Cancelado' && order.pontos_utilizados > 0 && !order.loyaltyRedeemReverted) {
        await User.updateOne({ _id: order.usuarioId, tenantId: req.tenant!._id }, { $inc: { pontos: order.pontos_utilizados } }, { session });
        order.loyaltyRedeemReverted = true;
      }
      if (order.usuarioId && req.body.status === 'Entregue' && !order.loyaltyCreditApplied) {
        const hasCheckoutSnapshot = typeof order.loyalty_enabled_at_checkout === 'boolean';
        // Legacy orders have no checkout snapshot, so they retain the prior delivery-time rule.
        const legacySettings = hasCheckoutSnapshot
          ? null
          : await StoreSettings.findOne({ tenantId: req.tenant!._id }).select('fidelidade_ativa pontos_por_real').session(session).lean();
        const earned = hasCheckoutSnapshot
          ? order.loyalty_enabled_at_checkout
            ? Math.max(0, Math.floor(Number(order.loyalty_points_expected || 0)))
            : 0
          : calculateLoyaltyPoints(
              Number(order.total_centavos || Math.round(order.total * 100)),
              legacySettings?.fidelidade_ativa === true,
              Number(legacySettings?.pontos_por_real || 0),
            );
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

router.get('/orders/:id', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Pedido não encontrado.', 'NOT_FOUND');
  const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).select('-trackingToken -trackingTokenHash').lean();
  if (!order) throw new HttpError(404, 'Pedido não encontrado.', 'NOT_FOUND');
  res.json({ success: true, order });
}));

router.get('/orders/:id/preorder-slots', requirePermission('orders:read'), asyncRoute(async (req, res) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
  const order = mongoose.isValidObjectId(req.params.id) ? await Order.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).lean() : null;
  if (!order?.preorder) throw new HttpError(404, 'Encomenda nao encontrada.', 'NOT_FOUND');
  const settings = await StoreSettings.findOne({ tenantId: req.tenant!._id }).lean();
  const result = await availablePreorderSlots({ tenantId: req.tenant!._id, settings, date, timezone: order.preorder.timezone, policies: [{ availability: 'scheduled_only', minLeadMinutes: order.preorder.minLeadMinutes }], excludeOrderId: String(order._id) });
  res.json({ success: true, ...result });
}));

router.post('/orders/:id/reschedule', requireCsrf, requirePermission('orders:write'), validateBody(preorderSelectionSchema.extend({ expectedUpdatedAt: z.string().datetime(), reason: z.string().trim().min(3).max(500) })), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Encomenda nao encontrada.', 'NOT_FOUND');
  let updated: any;
  await mongoose.connection.transaction(async (session) => {
    const settings = await lockPreorderCalendar(req.tenant!._id, session);
    const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).session(session);
    if (!order?.preorder) throw new HttpError(404, 'Encomenda nao encontrada.', 'NOT_FOUND');
    if (order.status !== 'Pendente') throw new HttpError(409, 'So e possivel reagendar antes de iniciar a producao.', 'PREORDER_ALREADY_STARTED');
    if (order.updatedAt.toISOString() !== req.body.expectedUpdatedAt) throw new HttpError(409, 'A encomenda mudou. Reabra os detalhes.', 'STALE_ORDER');
    const slot = await reservePreorder({ tenantId: req.tenant!._id, settings, date: req.body.date, startsAt: req.body.startsAt, timezone: order.preorder.timezone, policies: [{ availability: 'scheduled_only', minLeadMinutes: order.preorder.minLeadMinutes }], excludeOrderId: String(order._id), session });
    const previous = `${order.preorder.date} ${order.preorder.startTime}`;
    order.preorder.set({ ...slot });
    order.historico_status.push({ status: order.status, data: new Date(), actorId: req.auth!.accountId, reason: `Reagendado de ${previous} para ${slot.date} ${slot.startTime}: ${req.body.reason}` });
    await order.save({ session });
    updated = order.toObject();
  });
  await audit(req, { action: 'PREORDER_RESCHEDULED', targetType: 'Order', targetId: req.params.id, reason: req.body.reason, after: updated });
  res.json({ success: true, order: updated });
}));

router.post('/orders/:id/print-events', requireCsrf, requirePermission('orders:write'), asyncRoute(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenant!._id });
  if (!order) throw new HttpError(404, 'Pedido nao encontrado.', 'NOT_FOUND');
  const kind = order.print_history?.length ? 'reprint' : 'first_print';
  order.print_history.push({ kind, actorId: req.auth!.accountId, createdAt: new Date() });
  await order.save();
  await audit(req, { action: kind === 'reprint' ? 'ORDER_REPRINTED' : 'ORDER_PRINTED', targetType: 'Order', targetId: order._id.toString(), after: { printCount: order.print_history.length } });
  res.status(201).json({ success: true, kind, printCount: order.print_history.length });
}));

const paymentSchema = z.object({
  operationId: z.string().uuid().optional(),
  type: z.enum(['payment', 'refund']).default('payment'),
  amountCents: z.coerce.number().int().positive(),
  method: z.enum(['pix', 'credit_card', 'debit_card', 'card', 'cash', 'food_voucher', 'meal_voucher', 'cartao_credito', 'cartao_debito', 'cartao', 'dinheiro', 'vale_alimentacao', 'vale_refeicao', 'other']),
  note: z.string().trim().max(500).default(''),
});

router.post('/orders/:id/payments', requireCsrf, requirePermission('payments:write'), validateBody(paymentSchema), asyncRoute(async (req, res) => {
  const session = await mongoose.startSession();
  let updated: Record<string, any> | null = null;
  try {
    await session.withTransaction(async () => {
      const cash = await CashSession.findOne({ tenantId: req.tenant!._id, status: 'open' }).session(session);
      const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).session(session);
      if (!order) throw new HttpError(404, 'Pedido nao encontrado.', 'NOT_FOUND');
      if (!cash && !order.preorder) throw new HttpError(409, 'Abra o caixa antes de registrar recebimentos ou devolucoes.', 'CASH_SESSION_REQUIRED');
      if (order.preorder && !req.body.operationId) throw new HttpError(400, 'Identificador do recebimento obrigatorio.', 'PAYMENT_OPERATION_REQUIRED');
      const requestHash = crypto.createHash('sha256').update(JSON.stringify({ type: req.body.type, amount: req.body.amountCents, method: req.body.method, note: req.body.note })).digest('hex');
      const existing = req.body.operationId && order.payments?.find((entry: any) => entry.paymentId === req.body.operationId);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new HttpError(409, 'Identificador reutilizado com outro pagamento.', 'PAYMENT_CONFLICT');
        updated = order.toObject(); return;
      }
      if (req.body.type === 'payment' && order.status === 'Cancelado') throw new HttpError(409, 'Pedido cancelado aceita apenas devolucao.', 'CANCELLED_ORDER_PAYMENT');
      const paid = Number(order.paid_amount_cents || 0);
      const refunded = Number(order.refunded_amount_cents || 0);
      const total = Number(order.total_centavos || Math.round(Number(order.total || 0) * 100));
      if (req.body.type === 'payment' && paid - refunded + req.body.amountCents > total) throw new HttpError(409, 'O recebimento ultrapassa o saldo do pedido.', 'PAYMENT_EXCEEDS_BALANCE');
      if (req.body.type === 'refund' && req.body.amountCents > paid - refunded) throw new HttpError(409, 'A devolucao ultrapassa o valor recebido.', 'REFUND_EXCEEDS_PAID');
      const paymentId = req.body.operationId || crypto.randomUUID();
      const entry = { paymentId, requestHash, type: req.body.type, amount_cents: req.body.amountCents, method: req.body.method, note: req.body.note, actorId: req.auth!.accountId, createdAt: new Date() };
      if (!Array.isArray(order.payments)) order.payments = [];
      order.payments.push(entry);
      if (req.body.type === 'payment') order.paid_amount_cents = paid + req.body.amountCents;
      else order.refunded_amount_cents = refunded + req.body.amountCents;
      const net = Number(order.paid_amount_cents || 0) - Number(order.refunded_amount_cents || 0);
      order.payment_status = net <= 0 && Number(order.refunded_amount_cents || 0) > 0 ? 'refunded' : net <= 0 ? 'pending' : net < total ? 'partial' : 'paid';
      if (order.status === 'Cancelado' && net > 0) order.payment_status = 'refund_pending';
      if (cash) {
        cash.movements.push({ type: req.body.type, amountCents: req.body.amountCents, method: req.body.method, orderId: order._id, paymentId, note: req.body.note, actorId: req.auth!.accountId, createdAt: new Date() });
        await cash.save({ session });
      }
      await order.save({ session });
      updated = order.toObject();
    });
  } finally {
    await session.endSession();
  }
  await audit(req, { action: req.body.type === 'payment' ? 'ORDER_PAYMENT_RECORDED' : 'ORDER_REFUND_RECORDED', targetType: 'Order', targetId: req.params.id, reason: req.body.note, after: { amountCents: req.body.amountCents, method: req.body.method } });
  res.status(201).json({ success: true, order: updated });
}));

function cashSummary(cash: any) {
  const expected: Record<string, number> = { cash: Number(cash.openingBalanceCents || 0) };
  for (const movement of cash.movements || []) {
    const method = String(movement.method || 'other');
    const direction = ['refund', 'withdrawal'].includes(movement.type) ? -1 : 1;
    expected[method] = (expected[method] || 0) + direction * Number(movement.amountCents || 0);
  }
  return expected;
}

router.get('/cash/current', requirePermission('cash:read'), asyncRoute(async (req, res) => {
  const cash = await CashSession.findOne({ tenantId: req.tenant!._id, status: 'open' }).lean();
  res.json({ success: true, cash, expectedByMethod: cash ? cashSummary(cash) : {} });
}));

router.post('/cash/open', requireCsrf, requirePermission('cash:write'), validateBody(z.object({ openingBalanceCents: z.coerce.number().int().nonnegative() })), asyncRoute(async (req, res) => {
  if (await CashSession.exists({ tenantId: req.tenant!._id, status: 'open' })) throw new HttpError(409, 'Ja existe um caixa aberto para esta loja.', 'CASH_ALREADY_OPEN');
  const now = new Date();
  const cash = await CashSession.create({ tenantId: req.tenant!._id, operationalDate: getOperationalDate(now, req.tenant!.timezone), openingBalanceCents: req.body.openingBalanceCents, openedBy: req.auth!.accountId, openedAt: now });
  await audit(req, { action: 'CASH_OPENED', targetType: 'CashSession', targetId: cash._id.toString(), after: { openingBalanceCents: req.body.openingBalanceCents } });
  res.status(201).json({ success: true, cash, expectedByMethod: cashSummary(cash) });
}));

const cashMovementSchema = z.object({ type: z.enum(['supply', 'withdrawal']), amountCents: z.coerce.number().int().positive(), note: z.string().trim().min(3).max(500) });
router.post('/cash/movements', requireCsrf, requirePermission('cash:write'), validateBody(cashMovementSchema), asyncRoute(async (req, res) => {
  const cash = await CashSession.findOne({ tenantId: req.tenant!._id, status: 'open' });
  if (!cash) throw new HttpError(409, 'Nao ha caixa aberto.', 'CASH_NOT_OPEN');
  cash.movements.push({ type: req.body.type, amountCents: req.body.amountCents, method: 'cash', note: req.body.note, actorId: req.auth!.accountId, createdAt: new Date() });
  await cash.save();
  await audit(req, { action: req.body.type === 'supply' ? 'CASH_SUPPLY_RECORDED' : 'CASH_WITHDRAWAL_RECORDED', targetType: 'CashSession', targetId: cash._id.toString(), reason: req.body.note, after: { amountCents: req.body.amountCents } });
  res.status(201).json({ success: true, cash, expectedByMethod: cashSummary(cash) });
}));

const closeCashSchema = z.object({ countedByMethod: z.record(z.string(), z.coerce.number().int().nonnegative()), note: z.string().trim().max(500).default('') });
router.post('/cash/close', requireCsrf, requirePermission('cash:write'), validateBody(closeCashSchema), asyncRoute(async (req, res) => {
  const cash = await CashSession.findOne({ tenantId: req.tenant!._id, status: 'open' });
  if (!cash) throw new HttpError(409, 'Nao ha caixa aberto.', 'CASH_NOT_OPEN');
  const expected = cashSummary(cash);
  const methods = new Set([...Object.keys(expected), ...Object.keys(req.body.countedByMethod)]);
  const difference = Object.fromEntries([...methods].map((method) => [method, Number(req.body.countedByMethod[method] || 0) - Number(expected[method] || 0)]));
  if (Object.values(difference).some((value) => value !== 0) && req.body.note.length < 3) throw new HttpError(400, 'Justifique as diferencas antes de fechar o caixa.', 'CASH_DIFFERENCE_NOTE_REQUIRED');
  cash.status = 'closed';
  cash.countedByMethod = req.body.countedByMethod;
  cash.expectedByMethod = expected;
  cash.differenceByMethod = difference;
  cash.closingNote = req.body.note;
  cash.closedBy = req.auth!.accountId;
  cash.closedAt = new Date();
  await cash.save();
  await audit(req, { action: 'CASH_CLOSED', targetType: 'CashSession', targetId: cash._id.toString(), reason: req.body.note, after: { expected, counted: req.body.countedByMethod, difference } });
  res.json({ success: true, cash });
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
  if (!req.body.preorderDraft || req.body.preorderDraft.availability === 'inherit') {
    const settings = await StoreSettings.findOne({ tenantId: req.tenant!._id }).select('preorderEnabled preorderDraft').lean();
    req.body.preorderDraft = { ...req.body.preorderDraft, availability: settings?.preorderEnabled && settings.preorderDraft?.salesMode === 'scheduled_only' ? 'scheduled_only' : 'immediate_only' };
  }
  const product = await Product.create({ ...productMoneyFields(req.body), tenantId: req.tenant!._id });
  await audit(req, { action: 'PRODUCT_CREATED', targetType: 'Product', targetId: product._id.toString(), after: product.toObject() });
  res.status(201).json({ success: true, product });
}));

router.put('/products/:id', requireCsrf, requirePermission('catalog:write'), validateBody(productUpdateSchema), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  if (req.body.categoriaId && !await Category.exists({ _id: req.body.categoriaId, tenantId: req.tenant!._id })) throw new HttpError(400, 'Categoria invalida.', 'INVALID_CATEGORY');
  const before = await Product.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!before) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  if (req.body.preorderDraft !== undefined && !req.body.expectedUpdatedAt) {
    throw new HttpError(400, 'Reabra o cadastro antes de salvar as regras de encomenda.', 'PRODUCT_VERSION_REQUIRED');
  }
  if (req.body.expectedUpdatedAt && before.updatedAt?.toISOString() !== req.body.expectedUpdatedAt) {
    throw new HttpError(409, 'Este produto mudou enquanto voce editava. Reabra o cadastro para usar os dados mais recentes.', 'STALE_PRODUCT_UPDATE');
  }
  const productPatch = { ...req.body };
  delete productPatch.expectedUpdatedAt;
  const merged = productSchema.parse({ ...before, ...productPatch, categoriaId: productPatch.categoriaId ?? before.categoriaId?.toString() ?? null });
  if (before.tipo !== 'combo' && merged.tipo === 'combo') {
    const usedBy = await Product.countDocuments({
      tenantId: req.tenant!._id,
      tipo: 'combo',
      $or: [
        { 'combo_etapas.opcoes.produtoId': req.params.id },
        { 'combo_itens_fixos.produtoId': req.params.id },
      ],
    });
    if (usedBy > 0) throw new HttpError(409, `Este produto esta sendo utilizado por ${usedBy} combo${usedBy === 1 ? '' : 's'} e nao pode ser convertido em combo.`, 'PRODUCT_USED_BY_COMBO');
  }
  await validateComboReferences(req.tenant!._id, merged, req.params.id);
  const update: Record<string, unknown> = productMoneyFields(merged);
  const product = await Product.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenant!._id, updatedAt: before.updatedAt }, { $set: update }, { returnDocument: 'after', runValidators: true }).lean();
  if (!product) throw new HttpError(409, 'Este produto mudou durante o salvamento. Reabra o cadastro e tente novamente.', 'STALE_PRODUCT_UPDATE');
  if (before.imagem && req.body.imagem !== undefined && before.imagem !== req.body.imagem) {
    void deleteStoredFile(before.imagem);
  }
  await audit(req, { action: 'PRODUCT_UPDATED', targetType: 'Product', targetId: req.params.id, before, after: product });
  res.json({ success: true, product });
}));

router.delete('/products/:id', requireCsrf, requirePermission('catalog:write'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Produto nao encontrado.', 'NOT_FOUND');
  const usedBy = await Product.countDocuments({
    tenantId: req.tenant!._id,
    tipo: 'combo',
    $or: [
      { 'combo_etapas.opcoes.produtoId': req.params.id },
      { 'combo_itens_fixos.produtoId': req.params.id },
    ],
  });
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
  const existing = await Category.findOne({
    tenantId: req.tenant!._id,
    nome: { $regex: new RegExp(`^${req.body.nome.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  }).lean();
  if (existing) {
    throw new HttpError(409, `Já existe uma categoria chamada "${existing.nome}" cadastrada nesta loja.`, 'CATEGORY_ALREADY_EXISTS');
  }
  const category = await Category.create({ ...req.body, tenantId: req.tenant!._id });
  await audit(req, { action: 'CATEGORY_CREATED', targetType: 'Category', targetId: category._id.toString(), after: category.toObject() });
  res.status(201).json({ success: true, category });
}));
router.put('/categories/:id', requireCsrf, requirePermission('catalog:write'), validateBody(categorySchema.partial()), asyncRoute(async (req, res) => {
  const before = await Category.findOne({ _id: req.params.id, tenantId: req.tenant!._id }).lean();
  if (!before) throw new HttpError(404, 'Categoria nao encontrada.', 'NOT_FOUND');
  if (req.body.nome && req.body.nome.trim().toLowerCase() !== before.nome.trim().toLowerCase()) {
    const existing = await Category.findOne({
      _id: { $ne: req.params.id },
      tenantId: req.tenant!._id,
      nome: { $regex: new RegExp(`^${req.body.nome.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).lean();
    if (existing) {
      throw new HttpError(409, `Já existe uma categoria chamada "${existing.nome}" cadastrada nesta loja.`, 'CATEGORY_ALREADY_EXISTS');
    }
  }
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

router.patch('/complement-groups/:groupId/items/:itemId/status', requireCsrf, requirePermission('catalog:write'), validateBody(complementItemStatusSchema), asyncRoute(async (req, res) => {
  const { groupId, itemId } = req.params;
  if (!mongoose.isValidObjectId(groupId) || !mongoose.isValidObjectId(itemId)) {
    throw new HttpError(404, 'Opcao de complemento nao encontrada.', 'NOT_FOUND');
  }

  const before = await ComplementGroup.findOne({ _id: groupId, tenantId: req.tenant!._id }).lean();
  if (!before) throw new HttpError(404, 'Grupo de complementos nao encontrado.', 'NOT_FOUND');
  const items = Array.isArray(before.itens) ? before.itens : [];
  const item = items.find((candidate: any) => String(candidate._id) === itemId);
  if (!item) throw new HttpError(404, 'Opcao de complemento nao encontrada.', 'NOT_FOUND');

  const nextActive = req.body.ativo;
  if (!nextActive && item.ativo !== false) {
    const remainingActive = items.filter((candidate: any) => String(candidate._id) !== itemId && candidate.ativo !== false).length;
    const minimum = effectiveComplementMinimum({ obrigatorio: before.obrigatorio, minimo: before.minimo });
    if (remainingActive < minimum) {
      throw new HttpError(
        409,
        `Este grupo exige pelo menos ${minimum} ${minimum === 1 ? 'opcao ativa' : 'opcoes ativas'}.`,
        'MINIMUM_ACTIVE_OPTIONS',
        { groupId, itemId, minimum, activeItems: remainingActive },
      );
    }
  }

  const updated = await ComplementGroup.findOneAndUpdate(
    { _id: groupId, tenantId: req.tenant!._id, __v: before.__v, 'itens._id': itemId },
    { $set: { 'itens.$.ativo': nextActive }, $inc: { __v: 1 } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!updated) {
    throw new HttpError(409, 'O grupo foi alterado em outra tela. Recarregue e tente novamente.', 'COMPLEMENT_GROUP_CHANGED');
  }

  await audit(req, {
    action: 'COMPLEMENT_ITEM_STATUS_CHANGED',
    targetType: 'ComplementGroup',
    targetId: groupId,
    before: { itemId, ativo: item.ativo !== false },
    after: { itemId, ativo: nextActive },
  });
  res.json({ success: true, item: { _id: itemId, ativo: nextActive } });
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

router.post('/catalog/import/test-ai', requireCsrf, requirePermission('catalog:write'), asyncRoute(async (_req, res) => {
  const result = await testGeminiIntegration();
  res.json(result);
}));

router.post(
  '/catalog/import/analyze-lab',
  securityRateLimit({ namespace: 'catalog-ai-lab', limit: 5, windowMs: 60 * 1000 }),
  parseRawCatalogFile,
  requireCsrf,
  requirePermission('catalog:write'),
  asyncRoute(async (req, res) => {
    const rawContentType = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(rawContentType)) {
      throw new HttpError(415, 'Formato inválido. Envie uma imagem JPG, PNG, WEBP ou um arquivo PDF.', 'INVALID_FILE_TYPE');
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new HttpError(400, 'Nenhum dado recebido ou arquivo vazio.', 'EMPTY_FILE');
    }

    if (req.body.length > 3 * 1024 * 1024) {
      throw new HttpError(413, 'O arquivo enviado excede o limite máximo de 3 MiB.', 'FILE_TOO_LARGE');
    }

    // Validação mínima de assinatura para PDF: procurar %PDF- dentro dos primeiros 1024 bytes
    if (rawContentType === 'application/pdf') {
      const headerSnippet = req.body.subarray(0, 1024).toString('latin1');
      if (!headerSnippet.includes('%PDF-')) {
        throw new HttpError(400, 'O arquivo enviado não parece ser um PDF válido.', 'INVALID_PDF');
      }
    }

    const result = await analyzeMenuWithFullLab(req.body, rawContentType);
    res.json(result);
  })
);

const optionalTime = z.string().regex(/^\d{2}:\d{2}$/).optional();
const daySchema = z.object({ aberto: z.boolean(), inicio: z.string().regex(/^\d{2}:\d{2}$/), fim: z.string().regex(/^\d{2}:\d{2}$/), inicio2: optionalTime, fim2: optionalTime })
  .refine((day) => Boolean(day.inicio2) === Boolean(day.fim2), { message: 'Informe o início e o fim do segundo turno.' });
const themeSchema = z.object({ primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i), primaryTextColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), primaryHoverColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), primarySoftColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), primaryBorderColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional() });
const benefitBrandSchema = z.enum(['alelo', 'vr', 'ticket', 'pluxee', 'ben', 'caju', 'flash', 'swile', 'ifood_beneficios']);
export const settingsSchema = z.object({
  preorderEnabled: z.boolean().optional(),
  preorderDraft: preorderSettingsSchema.optional(),
  expectedSettingsUpdatedAt: z.string().datetime().nullable().optional(),
  prazo_entrega_modo: z.enum(['total', 'preparo_deslocamento']).optional(),
  tempo_preparo_min: z.number().int().min(0).max(1_440).optional(),
  tempo_preparo_max: z.number().int().min(0).max(1_440).optional(),
  tempo_deslocamento_min: z.number().int().min(0).max(1_440).optional(),
  tempo_deslocamento_max: z.number().int().min(0).max(1_440).optional(),
  is_open: z.boolean().optional(), nome_loja: z.string().trim().min(2).max(120).optional(), tagline: z.string().max(160).optional(),
  logo_url: z.string().url().or(z.literal('')).optional(), capa_url: z.string().url().or(z.literal('')).optional(), logoShape: z.enum(['circle', 'squircle']).optional(), theme: themeSchema.optional(),
  secondaryBanners: z.array(z.object({ id: z.string().min(1).max(80), imageUrl: z.string().url().or(z.literal('')), active: z.boolean(), link: z.string().max(500) })).max(10).optional(),
  logisticsOptions: z.object({ allowPickup: z.boolean(), allowDelivery: z.boolean(), allowDineIn: z.boolean().optional() }).optional(), tempo_entrega: z.string().max(80).optional(), whatsapp: z.string().max(30).optional(),
  encomendas_personalizadas: z.object({ ativo: z.boolean(), titulo: z.string().trim().min(3).max(100).optional(), texto_botao: z.string().trim().min(3).max(80), whatsapp: z.string().trim().max(30) }).strict().optional(),
  sobre_texto: z.string().max(5_000).optional(), instagram_url: z.string().max(500).optional(), cep_loja: z.string().max(12).optional(), rua_loja: z.string().max(200).optional(), numero_loja: z.string().max(30).optional(), bairro_loja: z.string().max(120).optional(), cidade_loja: z.string().max(120).optional(), estado_loja: z.string().max(2).optional(),
  tipo_taxa_entrega: z.enum(['fixa', 'bairro_regiao']).optional(),
  deliveryRegions: z.lazy(() => deliveryRegionBatchSchema).optional(),
  taxa_entrega_fixa: money.optional(),
  taxas_bairros: z.array(z.object({
    nome: z.string().trim().max(100),
    cidade: z.string().trim().max(100).optional().default(''),
    estado: z.string().trim().max(2).optional().default(''),
    valor: money,
    tempo_estimado: z.string().max(60).optional().default(''),
    bloqueado: z.boolean().optional().default(false),
    observacao: z.string().trim().max(500).optional().default(''),
    deliveryTimeMin: z.coerce.number().int().min(0).max(1_440).optional(),
    deliveryTimeMax: z.coerce.number().int().min(0).max(1_440).optional(),
    ativo: z.boolean().optional().default(true),
  }).refine((item) => (item.deliveryTimeMin == null && item.deliveryTimeMax == null) || isValidEstimate(item.deliveryTimeMin, item.deliveryTimeMax), { message: 'Informe minimo e maximo validos para o bairro.' })).transform((items) => items.filter((item) => item.nome.length > 0)).optional(),
  taxa_bairro_padrao: z.number().finite().nonnegative().nullable().optional(),
  bloquear_bairros_nao_atendidos: z.boolean().optional(),
  abertura_automatica: z.boolean().optional(), mensagem_fechado: z.string().max(500).optional(),
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
const settingsUpdateHandlers = [requireCsrf, requirePermission('settings:write'), validateBody(settingsSchema), asyncRoute(async (req, res) => {
  const before = await StoreSettings.findOne({ tenantId: req.tenant!._id }).lean();
  if ((req.body.preorderDraft !== undefined || req.body.preorderEnabled !== undefined) && req.body.expectedSettingsUpdatedAt === undefined) {
    throw new HttpError(400, 'Recarregue as configuracoes antes de salvar a agenda.', 'SETTINGS_VERSION_REQUIRED');
  }
  if (req.body.expectedSettingsUpdatedAt !== undefined && req.body.expectedSettingsUpdatedAt !== (before?.updatedAt?.toISOString() ?? null)) {
    throw new HttpError(409, 'As configuracoes mudaram. Recarregue antes de salvar novamente.', 'SETTINGS_CONFLICT');
  }
  let deliveryRegions = req.body.deliveryRegions as z.infer<typeof deliveryRegionBatchSchema> | undefined;
  const nextSettings = { ...req.body };
  delete nextSettings.deliveryRegions;
  delete nextSettings.expectedSettingsUpdatedAt;
  if (nextSettings.tipo_taxa_entrega === 'bairro_regiao') {
    // Explicit conversion must not awaken an engine dormant in a legacy mode.
    if (before?.tipo_taxa_entrega === 'regiao') {
      if (nextSettings.taxas_bairros === undefined) nextSettings.taxas_bairros = [];
      if (nextSettings.taxa_bairro_padrao === undefined) nextSettings.taxa_bairro_padrao = null;
      if (nextSettings.bloquear_bairros_nao_atendidos === undefined) nextSettings.bloquear_bairros_nao_atendidos = true;
    }
    if (before?.tipo_taxa_entrega === 'bairro' && !deliveryRegions) {
      const dormantRegions = before.delivery_regions_publication
        ? await DeliveryRegion.find({ tenantId: req.tenant!._id, publicationId: before.delivery_regions_publication }).lean()
        : [];
      deliveryRegions = deliveryRegionBatchSchema.parse({
        storeLocation: before.localizacao_loja || null,
        regions: dormantRegions.map((region) => ({ ...deliveryRegionDto(region), active: false })),
      });
    }
  }
  const merged = { ...before, ...nextSettings };
  if (merged.encomendas_personalizadas?.ativo && !String(merged.encomendas_personalizadas.whatsapp || merged.whatsapp || '').trim()) {
    throw new HttpError(400, 'Informe o WhatsApp principal ou um numero para encomendas personalizadas.', 'CUSTOM_ORDER_WHATSAPP_REQUIRED');
  }
  if (merged.preorderEnabled) {
    const agenda = preorderSettingsSchema.parse(merged.preorderDraft || {});
    if (agenda.salesMode === 'immediate_only' || (!agenda.weeklySchedule.some((day) => day.intervals.length) && !agenda.dateOverrides.some((day) => day.intervals.length))) throw new HttpError(400, 'Escolha um modo com encomendas e ao menos um horario antes de ativar.', 'PREORDER_SETUP_REQUIRED');
    if (agenda.depositPercent > 0 && (!merged.pagamento_pix || !String(merged.chave_pix || '').trim())) throw new HttpError(400, 'Configure o PIX e sua chave em Entrega e Pagamento antes de exigir sinal.', 'PREORDER_PIX_REQUIRED');
    if (merged.logisticsOptions?.allowPickup === false && merged.logisticsOptions?.allowDelivery === false) throw new HttpError(400, 'Habilite entrega ou retirada para receber encomendas.', 'PREORDER_DELIVERY_REQUIRED');
  }
  if (deliveryRegions?.regions.some((region) => region.active)) {
    const addressKey = [String(merged.cep_loja || '').replace(/\D/g, ''), merged.rua_loja, merged.numero_loja, merged.bairro_loja, merged.cidade_loja, merged.estado_loja]
      .filter(Boolean).join('|').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!addressKey || deliveryRegions.storeLocation?.addressKey !== addressKey) {
      throw new HttpError(400, 'Localize e confirme novamente a loja apos alterar o endereco.', 'DELIVERY_LOCATION_ADDRESS_MISMATCH');
    }
  }
  const publishedRegions = deliveryRegions ? deliveryRegions.regions : before?.delivery_regions_publication
    ? await DeliveryRegion.find({ tenantId: req.tenant!._id, publicationId: before.delivery_regions_publication }).lean() : [];
  const addressFields = ['cep_loja', 'rua_loja', 'numero_loja', 'bairro_loja', 'cidade_loja', 'estado_loja'] as const;
  const normalizeAddressField = (field: typeof addressFields[number], value: unknown) => field === 'cep_loja'
    ? String(value || '').replace(/\D/g, '')
    : String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const addressChanged = addressFields.some((field) => normalizeAddressField(field, before?.[field]) !== normalizeAddressField(field, merged[field]));
  if (!deliveryRegions && addressChanged && publishedRegions.some((region) => region.active !== false)) {
    throw new HttpError(400, 'Abra o mapa e confirme novamente a posicao da loja para salvar o novo endereco junto com as regioes.', 'DELIVERY_LOCATION_ADDRESS_MISMATCH');
  }
  const estimateError = validateEstimateSettings(readEstimateSettings(merged), publishedRegions.map(readDeliveryEstimate));
  if (estimateError) throw new HttpError(400, estimateError, 'INVALID_DELIVERY_ESTIMATE');
  if (req.body.pagamento_cartao_credito !== undefined || req.body.pagamento_cartao_debito !== undefined) {
    const legacyCardEnabled = before?.pagamento_cartao !== false;
    const currentCredit = typeof before?.pagamento_cartao_credito === 'boolean' ? before.pagamento_cartao_credito : legacyCardEnabled;
    const currentDebit = typeof before?.pagamento_cartao_debito === 'boolean' ? before.pagamento_cartao_debito : legacyCardEnabled;
    const nextCredit = req.body.pagamento_cartao_credito ?? currentCredit;
    const nextDebit = req.body.pagamento_cartao_debito ?? currentDebit;
    nextSettings.pagamento_cartao = nextCredit || nextDebit;
  }
  if (deliveryRegions) {
    const regions = deliveryRegions.regions;
    const storeLocation = deliveryRegions.storeLocation;
    regions.forEach((region) => validateDeliveryGeometry(region.geometry as DeliveryPolygonGeometry, region.active ? storeLocation || undefined : undefined));
    const publicationId = regions.length ? crypto.randomUUID() : '';
    // Failed/abandoned staging expires; activation removes TTL transactionally.
    if (regions.length) await DeliveryRegion.insertMany(regions.map((region, priority) => ({ ...region, priority, tenantId: req.tenant!._id, publicationId, expiresAt: new Date(Date.now() + 86_400_000) })));
    nextSettings.localizacao_loja = deliveryRegions.storeLocation;
    nextSettings.delivery_regions_publication = publicationId;
    nextSettings.delivery_regions_active_count = regions.filter((region) => region.active !== false).length;
  }
  const filter = before
    ? { tenantId: req.tenant!._id, updatedAt: before.updatedAt, __v: before.__v ?? { $exists: false } }
    : { tenantId: req.tenant!._id, _id: new mongoose.Types.ObjectId() };
  const update = async (session?: mongoose.ClientSession) => {
    const settings = await StoreSettings.findOneAndUpdate(filter, { $set: nextSettings, $inc: { __v: 1 } }, { session, upsert: !before, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }).lean();
    if (!settings) throw new HttpError(409, 'As configuracoes mudaram. Recarregue antes de salvar novamente.', 'SETTINGS_CONFLICT');
    return settings;
  };
  const settings = deliveryRegions ? await mongoose.connection.transaction(async (session) => {
    if (nextSettings.delivery_regions_publication) {
      const activated = await DeliveryRegion.updateMany({ tenantId: req.tenant!._id, publicationId: nextSettings.delivery_regions_publication }, { $unset: { expiresAt: '' } }, { session });
      if (activated.matchedCount !== deliveryRegions.regions.length) throw new HttpError(409, 'A publicacao expirou. Salve novamente.', 'SETTINGS_CONFLICT');
    }
    const saved = await update(session);
    if (before?.delivery_regions_publication) {
      // Only the generation replaced by this CAS is retired. UUIDs are never reused.
      await DeliveryRegion.updateMany({ tenantId: req.tenant!._id, publicationId: before.delivery_regions_publication }, { $set: { expiresAt: new Date(Date.now() + 86_400_000) } }, { session });
    }
    return saved;
  }) : await update();
  if (before?.logo_url && req.body.logo_url !== undefined && before.logo_url !== req.body.logo_url) {
    void deleteStoredFile(before.logo_url);
  }
  if (before?.capa_url && req.body.capa_url !== undefined && before.capa_url !== req.body.capa_url) {
    void deleteStoredFile(before.capa_url);
  }
  await audit(req, { action: 'SETTINGS_UPDATED', targetType: 'StoreSettings', targetId: settings!._id.toString(), before, after: settings })
    .catch((error) => console.warn('[settings] Settings saved, but audit failed.', error));
  res.json({ success: true, settings });
})] as const;
router.put('/settings', ...settingsUpdateHandlers);
router.patch('/settings', ...settingsUpdateHandlers);

const mapLocationSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), confirmed: z.boolean().default(true), addressKey: z.string().max(500).optional() });
const deliveryGeometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(4).max(500)).length(1),
});
const deliveryRegionSchema = z.object({
  notes: z.string().trim().max(500).optional().default(''),
  id: z.string().optional(),
  name: z.string().trim().min(2).max(100),
  sourceType: z.enum(['circle', 'polygon']),
  geometry: deliveryGeometrySchema,
  center: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  radiusMeters: z.number().int().min(100).max(150_000).optional(),
  feeCents: z.number().int().min(0).max(10_000_000),
  deliveryTimeMin: z.number().int().min(0).max(1_440).optional(),
  deliveryTimeMax: z.number().int().min(0).max(1_440).optional(),
  blocked: z.boolean().default(false),
  active: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000),
}).superRefine((region, context) => {
  if ((region.deliveryTimeMin == null) !== (region.deliveryTimeMax == null)) context.addIssue({ code: 'custom', path: ['deliveryTimeMax'], message: 'Informe ambos os prazos ou deixe ambos vazios para usar o prazo global.' });
  if (region.deliveryTimeMin != null && region.deliveryTimeMax != null && region.deliveryTimeMax < region.deliveryTimeMin) context.addIssue({ code: 'custom', path: ['deliveryTimeMax'], message: 'O tempo maximo deve ser maior ou igual ao minimo.' });
  if (region.sourceType === 'circle' && (!region.center || !region.radiusMeters)) context.addIssue({ code: 'custom', path: ['radiusMeters'], message: 'Informe centro e raio da area circular.' });
});
const deliveryRegionBatchSchema = z.object({ storeLocation: mapLocationSchema.nullable(), regions: z.array(deliveryRegionSchema).max(50) }).refine((payload) => !payload.regions.some((region) => region.active) || payload.storeLocation?.confirmed, { path: ['storeLocation'], message: 'Confirme a posicao da loja no mapa antes de publicar.' });
const storeAddressSchema = z.object({ postalCode: z.string().max(12).optional(), street: z.string().trim().min(2).max(160), number: z.string().trim().min(1).max(30), district: z.string().trim().max(100).optional(), city: z.string().trim().min(2).max(100), state: z.string().trim().max(2).optional() });
const regionTestSchema = z.object({ storeLocation: mapLocationSchema, regions: z.array(deliveryRegionSchema).min(1).max(50), address: storeAddressSchema.optional(), location: mapLocationSchema.optional() }).refine((payload) => payload.address || payload.location, { message: 'Informe um endereco ou ponto para testar.' });

router.get('/delivery-regions', requirePermission('settings:read'), asyncRoute(async (req, res) => {
  const settings = await StoreSettings.findOne({ tenantId: req.tenant!._id }).select('localizacao_loja delivery_regions_publication').lean();
  const regions = settings?.delivery_regions_publication
    ? await DeliveryRegion.find({ tenantId: req.tenant!._id, publicationId: settings.delivery_regions_publication }).sort({ priority: 1 }).lean()
    : [];
  const savedLocation = settings?.localizacao_loja;
  const storeLocation = Number.isFinite(savedLocation?.latitude) && Number.isFinite(savedLocation?.longitude)
    ? savedLocation
    : null;
  res.json({ success: true, storeLocation, publicationId: settings?.delivery_regions_publication || null, regions: regions.map(deliveryRegionDto) });
}));

router.get('/delivery-regions/cep/:cep', requirePermission('settings:read'), asyncRoute(async (req, res) => {
  res.json({ success: true, address: await lookupPostalCode(String(req.params.cep)) });
}));

router.post('/delivery-regions/geocode-store', requireCsrf, requirePermission('settings:write'), validateBody(storeAddressSchema), asyncRoute(async (req, res) => {
  const result = await geocodeAddress(req.body);
  res.json({ success: true, location: { latitude: result.latitude, longitude: result.longitude, confirmed: false }, provider: result.provider, precision: result.precision, formattedAddress: result.formattedAddress });
}));

router.get('/neighborhoods/search', securityRateLimit({ namespace: 'neighborhoods-search', limit: 60, windowMs: 60_000 }), requirePermission('settings:read'), asyncRoute(async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 100);
  const city = String(req.query.city || '').trim().slice(0, 100);
  const state = String(req.query.state || '').trim().slice(0, 2);
  res.json({ success: true, items: await searchDistricts(query, city, state) });
}));

router.post('/delivery-regions/test', requireCsrf, requirePermission('settings:write'), validateBody(regionTestSchema), asyncRoute(async (req, res) => {
  req.body.regions.forEach((region: any) => validateDeliveryGeometry(region.geometry, req.body.storeLocation));
  const location = req.body.location || await geocodeAddress(req.body.address);
  const region = resolveRegionFromList(req.body.regions, location.latitude, location.longitude);
  res.json({ success: true, location: { latitude: location.latitude, longitude: location.longitude }, precision: location.precision || 'confirmed', result: region ? { matched: true, blocked: region.blocked, regionName: region.name, feeCents: region.feeCents, deliveryTimeMin: region.deliveryTimeMin, deliveryTimeMax: region.deliveryTimeMax } : { matched: false } });
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

router.get('/reports/marketing', requirePermission('reports:read'), asyncRoute(async (req, res) => {
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
      enabled: settings?.fidelidade_ativa === true, pointsGenerated: loyalty.pointsGenerated || 0, pointsRedeemed: loyalty.pointsRedeemed || 0,
      redemptions: loyalty.redemptions || 0, customersWithBalance, customersWhoRedeemed: redeemedCustomers.filter(Boolean).length,
      equivalentValue: topRedeemedProducts.length ? Number(loyalty.equivalentCents || 0) / 100 : null,
      topRedeemedProducts, minimumReward: minimumReward || null, nearRewardCustomers,
      historicalProductRankingAvailable: topRedeemedProducts.length > 0,
    },
  });
}));

router.get('/reports/marketing/export.csv', requirePermission('reports:read'), asyncRoute(async (req, res) => {
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

router.get('/reports/summary', requirePermission('reports:read'), asyncRoute(async (req, res) => {
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

router.get('/reports/summary/export.csv', requirePermission('reports:read'), asyncRoute(async (req, res) => {
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

router.get('/reports/products', requirePermission('reports:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const products = await Order.aggregate([
    { $match: { tenantId: req.tenant!._id, status: { $ne: 'Cancelado' }, createdAt: { $gte: period.from, $lte: period.to } } },
    { $unwind: '$itens' },
    { $lookup: { from: 'products', localField: 'itens.produtoId', foreignField: '_id', as: 'currentProduct' } },
    { $unwind: { path: '$currentProduct', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'categories', localField: 'currentProduct.categoriaId', foreignField: '_id', as: 'currentCategory' } },
    { $unwind: { path: '$currentCategory', preserveNullAndEmptyArrays: true } },
    { $addFields: { itemRevenue: centsExpression('itens.subtotal_centavos', 'itens.subtotal'), categoryName: { $cond: [{ $eq: ['$itens.tipo_item', 'personalizado'] }, 'Personalizados', { $ifNull: ['$itens.categoria_nome', { $ifNull: ['$currentCategory.nome', 'Sem categoria historica'] }] }] } } },
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

router.get('/reports/products/export.csv', requirePermission('reports:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const products = await Order.aggregate([
    { $match: { tenantId: req.tenant!._id, status: { $ne: 'Cancelado' }, createdAt: { $gte: period.from, $lte: period.to } } },
    { $unwind: '$itens' },
    { $lookup: { from: 'products', localField: 'itens.produtoId', foreignField: '_id', as: 'currentProduct' } },
    { $unwind: { path: '$currentProduct', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'categories', localField: 'currentProduct.categoriaId', foreignField: '_id', as: 'currentCategory' } },
    { $unwind: { path: '$currentCategory', preserveNullAndEmptyArrays: true } },
    { $addFields: { itemRevenue: centsExpression('itens.subtotal_centavos', 'itens.subtotal'), categoryName: { $cond: [{ $eq: ['$itens.tipo_item', 'personalizado'] }, 'Personalizados', { $ifNull: ['$itens.categoria_nome', { $ifNull: ['$currentCategory.nome', 'Sem categoria historica'] }] }] } } },
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

router.get('/reports/operation', requirePermission('reports:read'), asyncRoute(async (req, res) => {
  const period = await tenantPeriod(req, 30);
  const match = { tenantId: req.tenant!._id, createdAt: { $gte: period.from, $lte: period.to } };
  const [timingRows, hourlyRows, totals] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $project: { createdAt: 1, status: 1, preparingAt: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$historico_status', as: 'history', cond: { $eq: ['$$history.status', 'Preparando'] } } }, as: 'history', in: '$$history.data' } }, 0] }, readyAt: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$historico_status', as: 'history', cond: { $eq: ['$$history.status', 'Pronto'] } } }, as: 'history', in: '$$history.data' } }, 0] }, deliveredAt: { $arrayElemAt: [{ $map: { input: { $filter: { input: '$historico_status', as: 'history', cond: { $eq: ['$$history.status', 'Entregue'] } } }, as: 'history', in: '$$history.data' } }, 0] } } },
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
