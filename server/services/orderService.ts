import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Product from '../../src/models/Product.js';
import Order from '../../src/models/Order.js';
import Coupon from '../../src/models/Coupon.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import OrderSequence from '../models/OrderSequence.js';
import ShippingQuote from '../models/ShippingQuote.js';
import IdempotencyRecord from '../models/IdempotencyRecord.js';
import { reaisToCents } from '../domain/money.js';
import { HttpError } from '../middleware/errors.js';

export type CreateOrderInput = {
  customer: { name: string; phone: string; address?: string };
  items: Array<{ productId: string; quantity: number; options: Array<{ groupId: string; itemId: string; quantity: number }> }>;
  deliveryType: 'pickup' | 'delivery';
  paymentMethod: 'pix' | 'card' | 'cash';
  shippingQuoteId?: string;
  couponCode?: string;
  notes?: string;
};

function requestHash(input: CreateOrderInput): string {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export async function createAuthoritativeOrder(tenantId: mongoose.Types.ObjectId, idempotencyKey: string, input: CreateOrderInput) {
  const hash = requestHash(input);
  const previous = await IdempotencyRecord.findOne({ tenantId, scope: 'create-order', key: idempotencyKey }).lean();
  if (previous) {
    if (previous.requestHash !== hash) throw new HttpError(409, 'Idempotency-Key reutilizada com outro pedido.', 'IDEMPOTENCY_CONFLICT');
    if (previous.status === 'completed') return previous.responseBody;
    throw new HttpError(409, 'Pedido com esta chave ainda esta em processamento.', 'IDEMPOTENCY_PROCESSING');
  }

  const session = await mongoose.startSession();
  const trackingToken = crypto.randomBytes(32).toString('base64url');
  try {
    let response: Record<string, unknown> = {};
    await session.withTransaction(async () => {
      await IdempotencyRecord.create([{ tenantId, scope: 'create-order', key: idempotencyKey, requestHash: hash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) }], { session });
      const settings = await StoreSettings.findOne({ tenantId }).session(session).lean();
      if (!settings || settings.is_open === false) throw new HttpError(409, 'A loja esta fechada.', 'STORE_CLOSED');
      if (input.deliveryType === 'pickup' && settings.logisticsOptions?.allowPickup === false) throw new HttpError(409, 'Retirada indisponivel.', 'PICKUP_DISABLED');
      if (input.deliveryType === 'delivery' && settings.logisticsOptions?.allowDelivery === false) throw new HttpError(409, 'Entrega indisponivel.', 'DELIVERY_DISABLED');
      const allowedPayment = { pix: settings.pagamento_pix, card: settings.pagamento_cartao, cash: settings.pagamento_dinheiro };
      if (!allowedPayment[input.paymentMethod]) throw new HttpError(409, 'Forma de pagamento indisponivel.', 'PAYMENT_DISABLED');

      const ids = [...new Set(input.items.map((item) => item.productId))];
      const products = await Product.find({ _id: { $in: ids }, tenantId, ativo: { $ne: false }, esgotado: { $ne: true } }).session(session);
      if (products.length !== ids.length) throw new HttpError(409, 'Um ou mais produtos estao indisponiveis.', 'PRODUCT_UNAVAILABLE');
      const byId = new Map(products.map((product) => [product._id.toString(), product]));
      let subtotalCents = 0;
      const snapshots = [];

      for (const selected of input.items) {
        const product = byId.get(selected.productId)!;
        const baseCents = Number.isSafeInteger(product.preco_centavos) ? product.preco_centavos : reaisToCents(product.preco);
        let optionUnitCents = 0;
        const optionSnapshots = [];
        for (const group of product.grupos_adicionais || []) {
          const chosen = selected.options.filter((option) => option.groupId === group._id.toString());
          const count = chosen.reduce((sum, option) => sum + option.quantity, 0);
          if (count < Number(group.minimo || (group.obrigatorio ? 1 : 0)) || count > Number(group.maximo || 1)) throw new HttpError(409, `Selecao invalida em ${group.nome}.`, 'INVALID_OPTIONS');
          for (const option of chosen) {
            const item = group.itens.id(option.itemId);
            if (!item || item.ativo === false) throw new HttpError(409, 'Adicional indisponivel.', 'OPTION_UNAVAILABLE');
            const cents = Number.isSafeInteger(item.preco_centavos) ? item.preco_centavos : reaisToCents(item.preco || 0);
            optionUnitCents += cents * option.quantity;
            optionSnapshots.push({ opcao: `${group.nome}: ${item.nome}`, quantidade: option.quantity, itemId: item._id, preco_centavos: cents });
          }
        }
        const unitCents = baseCents + optionUnitCents;
        const itemTotalCents = unitCents * selected.quantity;
        subtotalCents += itemTotalCents;
        snapshots.push({ produtoId: product._id, nome: product.nome, quantidade: selected.quantity, opcoes_escolhidas: optionSnapshots, preco_unitario: unitCents / 100, preco_unitario_centavos: unitCents, subtotal: itemTotalCents / 100, subtotal_centavos: itemTotalCents });
        if (product.controlar_estoque) {
          const changed = await Product.updateOne({ _id: product._id, tenantId, estoque: { $gte: selected.quantity } }, { $inc: { estoque: -selected.quantity } }, { session });
          if (changed.modifiedCount !== 1) throw new HttpError(409, `Estoque insuficiente para ${product.nome}.`, 'OUT_OF_STOCK');
        }
      }

      let shippingCents = 0;
      if (input.deliveryType === 'delivery') {
        if (!input.shippingQuoteId || !mongoose.isValidObjectId(input.shippingQuoteId)) throw new HttpError(409, 'Cotacao de entrega obrigatoria.', 'SHIPPING_QUOTE_REQUIRED');
        const quote = await ShippingQuote.findOneAndUpdate({ _id: input.shippingQuoteId, tenantId, consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { returnDocument: 'after', session });
        if (!quote) throw new HttpError(409, 'Cotacao de entrega invalida ou expirada.', 'INVALID_SHIPPING_QUOTE');
        shippingCents = quote.feeCents;
        if (settings.frete_gratis_acima_de > 0 && subtotalCents >= reaisToCents(settings.frete_gratis_acima_de)) shippingCents = 0;
      }

      let discountCents = 0;
      let normalizedCoupon = '';
      if (input.couponCode) {
        normalizedCoupon = input.couponCode.trim().toUpperCase();
        const coupon = await Coupon.findOne({
          tenantId,
          normalizedCode: normalizedCoupon,
          ativo: true,
          $and: [
            { $or: [{ validade: null }, { validade: { $gte: new Date() } }] },
            { $or: [{ usos_restantes: -1 }, { usos_restantes: { $gt: 0 } }] },
          ],
        }).session(session);
        if (!coupon) throw new HttpError(409, 'Cupom invalido.', 'INVALID_COUPON');
        const minimumCents = reaisToCents(coupon.minimo_pedido || 0);
        if (subtotalCents < minimumCents) throw new HttpError(409, 'Pedido abaixo do minimo do cupom.', 'COUPON_MINIMUM');
        discountCents = coupon.tipo === 'porcentagem' ? Math.round(subtotalCents * Math.min(coupon.valor, 100) / 100) : (coupon.valor_centavos ?? reaisToCents(coupon.valor));
        discountCents = Math.min(discountCents, subtotalCents);
        if (coupon.usos_restantes > 0) coupon.usos_restantes -= 1;
        await coupon.save({ session });
      }

      const minimumOrderCents = reaisToCents(settings.pedido_minimo || 0);
      if (subtotalCents < minimumOrderCents) throw new HttpError(409, 'Pedido minimo nao atingido.', 'MINIMUM_ORDER');
      const totalCents = subtotalCents + shippingCents - discountCents;
      const sequence = await OrderSequence.findOneAndUpdate({ tenantId }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after', session, setDefaultsOnInsert: true });
      const [order] = await Order.create([{
        tenantId,
        orderNumber: sequence.value,
        trackingTokenPrefix: trackingToken.slice(0, 12),
        trackingTokenHash: crypto.createHash('sha256').update(trackingToken).digest('hex'),
        cliente: { nome: input.customer.name, telefone: input.customer.phone, endereco: input.deliveryType === 'delivery' ? input.customer.address : 'Retirada na loja' },
        itens: snapshots,
        total: totalCents / 100,
        total_centavos: totalCents,
        frete: shippingCents / 100,
        frete_centavos: shippingCents,
        desconto_cupom: discountCents / 100,
        cupom_codigo: normalizedCoupon,
        metodo_pagamento: input.paymentMethod,
        tipo_entrega: input.deliveryType,
        observacoes: input.notes || '',
        historico_status: [{ status: 'Pendente' }],
      }], { session });
      response = { orderId: order._id, orderNumber: order.orderNumber, trackingToken, totalCents };
      await IdempotencyRecord.updateOne({ tenantId, scope: 'create-order', key: idempotencyKey }, { $set: { status: 'completed', responseStatus: 201, responseBody: response } }, { session });
    });
    return response;
  } catch (error) {
    await IdempotencyRecord.updateOne({ tenantId, scope: 'create-order', key: idempotencyKey, status: 'processing' }, { $set: { status: 'failed' } }).catch(() => undefined);
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function getPublicTracking(tenantId: mongoose.Types.ObjectId, token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new HttpError(404, 'Pedido nao encontrado.', 'NOT_FOUND');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const order = await Order.findOne({ tenantId, trackingTokenPrefix: token.slice(0, 12) }).select('+trackingTokenHash orderNumber status historico_status createdAt updatedAt').lean();
  if (!order?.trackingTokenHash || !crypto.timingSafeEqual(Buffer.from(order.trackingTokenHash), Buffer.from(hash))) throw new HttpError(404, 'Pedido nao encontrado.', 'NOT_FOUND');
  return { orderNumber: order.orderNumber, status: order.status, history: order.historico_status, createdAt: order.createdAt, updatedAt: order.updatedAt };
}
