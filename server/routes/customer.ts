import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Order from '../../src/models/Order.js';
import Product from '../../src/models/Product.js';
import Coupon from '../../src/models/Coupon.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import { resolveTenant } from '../middleware/tenant.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requirePasswordAssurance, requireSession } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { createAuthoritativeOrder, getPublicTracking } from '../services/orderService.js';
import { createShippingQuote } from '../services/shippingService.js';
import { securityRateLimit } from '../middleware/rateLimit.js';
import { assertCustomerTenant, authenticatedCustomer, customerDto } from '../services/customerService.js';
import { reaisToCents } from '../domain/money.js';

const router = Router({ mergeParams: true });
router.use(resolveTenant);
const REVIEW_WINDOW_MS = 15 * 24 * 60 * 60 * 1_000;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const secureOptionSchema = z.object({ groupId: objectId, itemId: objectId, quantity: z.number().int().min(1).max(20) });
const comboSelectionSchema = z.object({
  stageId: objectId,
  selectedProductId: objectId,
  options: z.array(secureOptionSchema).default([]),
});
const addressSchema = z.object({
  titulo: z.string().trim().min(2).max(60), logradouro: z.string().trim().min(2).max(160), numero: z.string().trim().min(1).max(30),
  complemento: z.string().trim().max(120).optional().default(''), referencia: z.string().trim().max(160).optional().default(''), bairro: z.string().trim().min(2).max(100), cidade: z.string().trim().min(2).max(100),
  estado: z.string().trim().length(2).transform((value) => value.toUpperCase()), cep: z.string().regex(/^\d{5}-?\d{3}$/), padrao: z.boolean().optional().default(false),
  latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), locationConfirmed: z.boolean().optional(),
});

const orderSchema = z.object({
  items: z.array(z.object({
    productId: objectId,
    quantity: z.number().int().min(1).max(50),
    redeem: z.boolean().optional().default(false),
    options: z.array(secureOptionSchema).default([]),
    comboSelections: z.array(comboSelectionSchema).default([]),
  })).min(1).max(100),
  deliveryType: z.enum(['pickup', 'delivery', 'dine_in', 'local']), paymentMethod: z.enum(['pix', 'card', 'credit_card', 'debit_card', 'cash', 'food_voucher', 'meal_voucher']), addressId: objectId.optional(), deliveryAddress: addressSchema.omit({ titulo: true, padrao: true }).optional(), shippingQuoteId: objectId.optional(),
  couponCode: z.string().trim().max(60).optional(), notes: z.string().trim().max(1_000).optional(), changeForCents: z.number().int().min(0).max(10_000_000).optional(), cutlery: z.boolean().optional(),
});

router.post('/orders', requireSession, requireCsrf, securityRateLimit({ namespace: 'create-order', limit: 30, windowMs: 5 * 60_000 }), validateBody(orderSchema), asyncRoute(async (req, res) => {
  const accountId = assertCustomerTenant(req);
  const key = req.get('idempotency-key');
  if (!key || key.length < 16 || key.length > 128) throw new HttpError(400, 'Idempotency-Key obrigatoria.', 'IDEMPOTENCY_KEY_REQUIRED');
  const result = await createAuthoritativeOrder(req.tenant!._id, accountId, key, req.body, { timezone: req.tenant!.timezone });
  res.status(201).json({ success: true, ...result });
}));

router.get('/me', requireSession, requirePasswordAssurance, asyncRoute(async (req, res) => {
  res.json({ success: true, user: customerDto((await authenticatedCustomer(req)).toObject()) });
}));

router.get('/me/addresses', requireSession, requirePasswordAssurance, asyncRoute(async (req, res) => {
  const user = await authenticatedCustomer(req);
  res.json({ success: true, items: customerDto(user.toObject()).enderecos });
}));

router.post('/me/addresses', requireSession, requirePasswordAssurance, requireCsrf, validateBody(addressSchema), asyncRoute(async (req, res) => {
  const user = await authenticatedCustomer(req);
  if (req.body.padrao || user.enderecos.length === 0) user.enderecos.forEach((address: any) => { address.padrao = false; });
  user.enderecos.push({ ...req.body, padrao: req.body.padrao || user.enderecos.length === 0 });
  await user.save();
  res.status(201).json({ success: true, user: customerDto(user.toObject()) });
}));

router.put('/me/addresses/:addressId', requireSession, requirePasswordAssurance, requireCsrf, validateBody(addressSchema), asyncRoute(async (req, res) => {
  const user = await authenticatedCustomer(req);
  const address = user.enderecos.id(req.params.addressId);
  if (!address) throw new HttpError(404, 'Endereco nao encontrado.', 'NOT_FOUND');
  if (req.body.padrao) user.enderecos.forEach((item: any) => { item.padrao = false; });
  address.set(req.body);
  await user.save();
  res.json({ success: true, user: customerDto(user.toObject()) });
}));

router.delete('/me/addresses/:addressId', requireSession, requirePasswordAssurance, requireCsrf, asyncRoute(async (req, res) => {
  const user = await authenticatedCustomer(req);
  const address = user.enderecos.id(req.params.addressId);
  if (!address) throw new HttpError(404, 'Endereco nao encontrado.', 'NOT_FOUND');
  const wasDefault = Boolean(address.padrao);
  address.deleteOne();
  if (wasDefault && user.enderecos[0]) user.enderecos[0].padrao = true;
  await user.save();
  res.json({ success: true, user: customerDto(user.toObject()) });
}));

router.patch('/me/addresses/:addressId/default', requireSession, requirePasswordAssurance, requireCsrf, asyncRoute(async (req, res) => {
  const user = await authenticatedCustomer(req);
  const address = user.enderecos.id(req.params.addressId);
  if (!address) throw new HttpError(404, 'Endereco nao encontrado.', 'NOT_FOUND');
  user.enderecos.forEach((item: any) => { item.padrao = item._id.equals(address._id); });
  await user.save();
  res.json({ success: true, user: customerDto(user.toObject()) });
}));

function orderDto(order: Record<string, any>) {
  const deliveredEntry = [...(order.historico_status || [])].reverse().find((entry: Record<string, any>) => entry.status === 'Entregue');
  const deliveredAt = deliveredEntry?.data ? new Date(deliveredEntry.data) : order.status === 'Entregue' ? new Date(order.updatedAt || order.createdAt) : null;
  const reviewDeadlineAt = deliveredAt ? new Date(deliveredAt.getTime() + REVIEW_WINDOW_MS) : null;
  const review = order.avaliacao?.nota ? {
    score: Number(order.avaliacao.nota), comment: order.avaliacao.comentario || '',
    createdAt: order.avaliacao.criadaEm || null, updatedAt: order.avaliacao.atualizadaEm || null,
  } : null;
  return {
    id: String(order._id), orderNumber: order.orderNumber, dailyOrderNumber: order.dailyOrderNumber, operationalDate: order.operationalDate, status: order.status, createdAt: order.createdAt, updatedAt: order.updatedAt,
    deliveryType: order.tipo_entrega, paymentMethod: order.metodo_pagamento, address: order.cliente?.endereco || '', notes: order.observacoes || '',
    items: (order.itens || []).map((item: Record<string, any>) => ({
      productId: String(item.produtoId), name: item.nome, quantity: item.quantidade,
      itemType: item.tipo_item === 'combo' ? 'combo' : 'produto',
      unitPriceCents: item.preco_unitario_centavos ?? Math.round(item.preco_unitario * 100),
      subtotalCents: item.subtotal_centavos ?? Math.round(item.subtotal * 100),
      options: (item.opcoes_escolhidas || []).map((option: Record<string, any>) => ({
        ...option,
        groupId: option.groupId ? String(option.groupId) : null,
        itemId: option.itemId ? String(option.itemId) : null,
      })),
      comboSnapshot: item.combo_snapshot?.etapas ? {
        stages: item.combo_snapshot.etapas.map((stage: Record<string, any>) => ({
          stageId: String(stage.stageId), name: stage.nome,
          stagePriceCents: Number(stage.valor_etapa_centavos || 0),
          chargeComplements: stage.cobrar_complementos !== false,
          selectedProductId: String(stage.produtoId), selectedProductName: stage.produto_nome,
          extraCents: Number(stage.acrescimo_centavos || 0),
          options: (stage.adicionais || []).map((option: Record<string, any>) => ({
            groupId: option.groupId ? String(option.groupId) : null,
            itemId: option.itemId ? String(option.itemId) : null,
            groupName: option.grupo_nome, itemName: option.item_nome,
            quantity: option.quantidade, unitPriceCents: option.preco_unitario_centavos,
          })),
        })),
      } : null,
    })),
    subtotalCents: Math.max(0, Number(order.total_centavos || 0) - Number(order.frete_centavos || 0) + Math.round(Number(order.desconto_cupom || 0) * 100)),
    shippingCents: Number(order.frete_centavos || 0), discountCents: Math.round(Number(order.desconto_cupom || 0) * 100), totalCents: Number(order.total_centavos ?? Math.round(order.total * 100)),
    pointsUsed: Number(order.pontos_utilizados || 0), trackingToken: order.trackingToken || null, history: order.historico_status || [],
    review, reviewDeadlineAt, canReview: order.status === 'Entregue' && !review && Boolean(reviewDeadlineAt && reviewDeadlineAt.getTime() >= Date.now()),
  };
}

router.get('/me/orders', requireSession, requirePasswordAssurance, asyncRoute(async (req, res) => {
  const accountId = assertCustomerTenant(req);
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(30, Math.max(1, Number(req.query.limit || 10)));
  const state = String(req.query.state || 'all');
  const filter: Record<string, any> = { tenantId: req.tenant!._id, usuarioId: accountId };
  if (state === 'active') filter.status = { $nin: ['Entregue', 'Cancelado'] };
  if (state === 'completed') filter.status = { $in: ['Entregue', 'Cancelado'] };
  const [items, total] = await Promise.all([
    Order.find(filter).select('+trackingToken').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ success: true, items: items.map(orderDto), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
}));

router.get('/me/orders/:orderId', requireSession, requirePasswordAssurance, asyncRoute(async (req, res) => {
  const accountId = assertCustomerTenant(req);
  const order = mongoose.isValidObjectId(req.params.orderId) ? await Order.findOne({ _id: req.params.orderId, tenantId: req.tenant!._id, usuarioId: accountId }).select('+trackingToken').lean() : null;
  if (!order) throw new HttpError(404, 'Pedido nao encontrado.', 'NOT_FOUND');
  res.json({ success: true, order: orderDto(order) });
}));

const reviewSchema = z.object({ score: z.number().int().min(1).max(5), comment: z.string().trim().max(1_000).optional().default('') });
router.post('/me/orders/:orderId/review', requireSession, requirePasswordAssurance, requireCsrf, securityRateLimit({ namespace: 'order-review', limit: 20, windowMs: 60 * 60_000 }), validateBody(reviewSchema), asyncRoute(async (req, res) => {
  const accountId = assertCustomerTenant(req);
  const order = mongoose.isValidObjectId(req.params.orderId) ? await Order.findOne({ _id: req.params.orderId, tenantId: req.tenant!._id, usuarioId: accountId }) : null;
  if (!order) throw new HttpError(404, 'Pedido nao encontrado.', 'NOT_FOUND');
  if (order.status !== 'Entregue') throw new HttpError(409, 'Somente pedidos entregues podem ser avaliados.', 'ORDER_NOT_DELIVERED');
  if (order.avaliacao?.nota) throw new HttpError(409, 'Este pedido ja foi avaliado.', 'ORDER_ALREADY_REVIEWED');

  const deliveredEntry = [...(order.historico_status || [])].reverse().find((entry: Record<string, any>) => entry.status === 'Entregue');
  const deliveredAt = deliveredEntry?.data ? new Date(deliveredEntry.data) : new Date(order.updatedAt || order.createdAt);
  if (Date.now() > deliveredAt.getTime() + REVIEW_WINDOW_MS) throw new HttpError(409, 'O prazo de 15 dias para avaliar este pedido terminou.', 'REVIEW_WINDOW_EXPIRED');

  const now = new Date();
  order.avaliacao = { nota: req.body.score, comentario: req.body.comment, criadaEm: now, atualizadaEm: now };
  await order.save();
  res.status(201).json({ success: true, order: orderDto(order.toObject()) });
}));

router.get('/me/loyalty', requireSession, requirePasswordAssurance, asyncRoute(async (req, res) => {
  const user = await authenticatedCustomer(req);
  const settings = await StoreSettings.findOne({ tenantId: req.tenant!._id }).select('fidelidade_ativa pontos_por_real valor_ponto_reais').lean();
  const products = settings?.fidelidade_ativa ? await Product.find({ tenantId: req.tenant!._id, ativo: { $ne: false }, esgotado: { $ne: true }, pode_resgatar: true, pontos_resgate: { $gt: 0 } }).select('nome imagem pontos_resgate').sort({ ordem_categoria: 1 }).lean() : [];
  res.json({ success: true, enabled: Boolean(settings?.fidelidade_ativa), balance: Number(user.pontos || 0), pointsPerReal: Number(settings?.pontos_por_real || 0), eligibleProducts: products.map((product: any) => ({ id: String(product._id), name: product.nome, image: product.imagem || '', points: product.pontos_resgate, canRedeem: user.pontos >= product.pontos_resgate })) });
}));

const couponPreviewSchema = z.object({ code: z.string().trim().min(1).max(60), subtotalCents: z.number().int().min(0) });
router.post('/coupon/preview', requireSession, requireCsrf, validateBody(couponPreviewSchema), asyncRoute(async (req, res) => {
  assertCustomerTenant(req);
  const coupon = await Coupon.findOne({ tenantId: req.tenant!._id, normalizedCode: req.body.code.toUpperCase(), ativo: true, $and: [{ $or: [{ validade: null }, { validade: { $gte: new Date() } }] }, { $or: [{ usos_restantes: -1 }, { usos_restantes: { $gt: 0 } }] }] }).lean();
  if (!coupon || req.body.subtotalCents < reaisToCents(coupon.minimo_pedido || 0)) throw new HttpError(409, 'Cupom invalido para este pedido.', 'INVALID_COUPON');
  const discountCents = Math.min(req.body.subtotalCents, coupon.tipo === 'porcentagem' ? Math.round(req.body.subtotalCents * Math.min(coupon.valor, 100) / 100) : Number(coupon.valor_centavos ?? reaisToCents(coupon.valor)));
  res.json({ success: true, coupon: { code: coupon.codigo, type: coupon.tipo, value: coupon.valor, discountCents } });
}));

const quoteAddressSchema = z.object({ postalCode: z.string().max(12).optional(), street: z.string().trim().min(2).max(160), number: z.string().trim().max(30).optional(), district: z.string().trim().max(100).optional(), city: z.string().trim().min(2).max(100), state: z.string().trim().max(2).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), locationConfirmed: z.boolean().optional() });
router.post('/shipping/quote', securityRateLimit({ namespace: 'shipping-quote', limit: 30, windowMs: 5 * 60_000 }), validateBody(quoteAddressSchema), asyncRoute(async (req, res) => {
  res.status(201).json({ success: true, quote: await createShippingQuote(req.tenant!._id, req.body) });
}));

router.get('/cep/:cep', securityRateLimit({ namespace: 'cep-proxy', limit: 60, windowMs: 5 * 60_000 }), asyncRoute(async (req, res) => {
  const cep = String(req.params.cep).replace(/\D/g, '');
  if (!/^\d{8}$/.test(cep)) throw new HttpError(400, 'CEP invalido.', 'INVALID_POSTAL_CODE');
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new HttpError(502, 'Nao foi possivel consultar o CEP.', 'POSTAL_CODE_PROVIDER_ERROR');
  const data = await response.json() as Record<string, any>;
  if (data.erro) throw new HttpError(404, 'CEP nao encontrado.', 'POSTAL_CODE_NOT_FOUND');
  res.json({ success: true, address: { cep: data.cep, logradouro: data.logradouro, complemento: data.complemento, bairro: data.bairro, cidade: data.localidade, estado: data.uf } });
}));

router.get('/tracking/:token', securityRateLimit({ namespace: 'public-tracking', limit: 60, windowMs: 5 * 60_000 }), asyncRoute(async (req, res) => {
  res.json({ success: true, tracking: await getPublicTracking(req.tenant!._id, req.params.token) });
}));

export default router;
