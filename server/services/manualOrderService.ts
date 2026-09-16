import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Order from '../../src/models/Order.js';
import User from '../../src/models/User.js';
import CashSession from '../models/CashSession.js';
import DailyOrderSequence from '../models/DailyOrderSequence.js';
import IdempotencyRecord from '../models/IdempotencyRecord.js';
import OrderSequence from '../models/OrderSequence.js';
import { getOperationalDate } from '../domain/operationalDay.js';
import { normalizePhone } from '../domain/phone.js';
import { HttpError } from '../middleware/errors.js';
import { enqueueOrderPush, processPushJobs } from './pushService.js';
import { activePreorderSettings, lockPreorderCalendar, reservePreorder } from './preorderService.js';

export type ManualOrderInput = {
  operationId: string;
  customerName: string;
  customerPhone: string;
  itemName: string;
  description: string;
  referenceImages: Array<{ bucket: string; path: string }>;
  preorder: { date: string; startsAt: string };
  deliveryType: 'pickup' | 'delivery';
  deliveryAddress?: string;
  itemPriceCents: number;
  shippingCents: number;
  paymentMethod: 'pix' | 'card' | 'credit_card' | 'debit_card' | 'cash' | 'food_voucher' | 'meal_voucher';
  receivedCents: number;
  receivedMethod?: ManualOrderInput['paymentMethod'];
};

const hashInput = (input: ManualOrderInput) => crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');

export async function createManualPreorder(
  tenantId: mongoose.Types.ObjectId,
  actorId: mongoose.Types.ObjectId,
  input: ManualOrderInput,
  options: { timezone: string; now?: Date },
) {
  const requestHash = hashInput(input);
  const previous = await IdempotencyRecord.findOne({ tenantId, scope: 'create-manual-order', key: input.operationId }).lean();
  if (previous) {
    if (previous.requestHash !== requestHash) throw new HttpError(409, 'Esta tentativa ja foi usada com outros dados.', 'IDEMPOTENCY_CONFLICT');
    if (previous.status === 'completed') return previous.responseBody;
    throw new HttpError(409, 'A encomenda ainda esta sendo salva.', 'IDEMPOTENCY_PROCESSING');
  }

  const trackingToken = crypto.randomBytes(32).toString('base64url');
  const session = await mongoose.startSession();
  let response: Record<string, any> = {};
  try {
    await session.withTransaction(async () => {
      await IdempotencyRecord.create([{ tenantId, scope: 'create-manual-order', key: input.operationId, requestHash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) }], { session });
      const settings = await lockPreorderCalendar(tenantId, session);
      if (!settings?.preorderEnabled) throw new HttpError(409, 'Ative a agenda de encomendas antes de cadastrar uma encomenda.', 'PREORDER_DISABLED');
      if (input.deliveryType === 'pickup' && settings.logisticsOptions?.allowPickup === false) throw new HttpError(409, 'Retirada indisponivel.', 'PICKUP_DISABLED');
      if (input.deliveryType === 'delivery' && settings.logisticsOptions?.allowDelivery === false) throw new HttpError(409, 'Entrega indisponivel.', 'DELIVERY_DISABLED');
      if (input.deliveryType === 'delivery' && !input.deliveryAddress?.trim()) throw new HttpError(400, 'Informe o endereco de entrega.', 'ADDRESS_REQUIRED');

      const preorderSettings = activePreorderSettings(settings);
      const legacyCard = settings.pagamento_cartao !== false;
      const allowedPayment: Record<ManualOrderInput['paymentMethod'], boolean> = {
        pix: settings.pagamento_pix !== false,
        card: legacyCard,
        credit_card: settings.pagamento_cartao_credito ?? legacyCard,
        debit_card: settings.pagamento_cartao_debito ?? legacyCard,
        cash: settings.pagamento_dinheiro !== false,
        food_voucher: Boolean(settings.pagamento_vale_alimentacao),
        meal_voucher: Boolean(settings.pagamento_vale_refeicao),
      };
      if (!allowedPayment[input.paymentMethod] || (input.receivedCents > 0 && input.receivedMethod && !allowedPayment[input.receivedMethod])) throw new HttpError(409, 'Forma de pagamento indisponivel.', 'PAYMENT_DISABLED');
      const slot = await reservePreorder({ tenantId, settings, policies: [{ availability: 'scheduled_only' }], ...input.preorder, timezone: options.timezone, now: options.now, session });
      const imagePrefix = `tenants/${tenantId}/order-references/`;
      if (input.referenceImages.some((image) => image.bucket !== 'order-references' || !image.path.startsWith(imagePrefix))) {
        throw new HttpError(400, 'Referencia de imagem invalida.', 'INVALID_REFERENCE_IMAGE');
      }

      const totalCents = input.itemPriceCents + input.shippingCents;
      if (input.receivedCents > totalCents) throw new HttpError(400, 'O valor recebido ultrapassa o total.', 'PAYMENT_EXCEEDS_BALANCE');
      let normalizedPhone: string;
      try {
        normalizedPhone = normalizePhone(input.customerPhone);
      } catch {
        throw new HttpError(400, 'Informe um WhatsApp valido com DDD.', 'INVALID_PHONE');
      }
      const customer = await User.findOne({ tenantId, normalizedPhone }).select('_id').session(session).lean();
      const createdAt = options.now || new Date();
      const operationalDate = getOperationalDate(createdAt, options.timezone);
      const sequence = await OrderSequence.findOneAndUpdate(
        { tenantId },
        { $inc: { value: 1 } },
        { upsert: true, returnDocument: 'after', session, setDefaultsOnInsert: true },
      );
      const dailySequence = await DailyOrderSequence.findOneAndUpdate(
        { tenantId, operationalDate },
        { $inc: { value: 1 } },
        { upsert: true, returnDocument: 'after', session, setDefaultsOnInsert: true },
      );
      const paymentId = `manual:${input.operationId}`;
      const payments = input.receivedCents > 0 ? [{
        paymentId,
        requestHash: crypto.createHash('sha256').update(JSON.stringify({ amount: input.receivedCents, method: input.receivedMethod || input.paymentMethod })).digest('hex'),
        type: 'payment', amount_cents: input.receivedCents, method: input.receivedMethod || input.paymentMethod,
        note: 'Valor informado na criacao da encomenda', actorId, createdAt,
      }] : [];
      const depositCents = Math.ceil(totalCents * preorderSettings.depositPercent / 100);
      const [order] = await Order.create([{
        tenantId,
        origem: 'admin_manual',
        preorder: { ...slot, depositPercent: preorderSettings.depositPercent, depositCents, pixKey: settings.chave_pix || '', pixInstructions: settings.instrucoes_pix || '' },
        orderNumber: sequence.value,
        dailyOrderNumber: dailySequence.value,
        operationalDate,
        createdAt,
        trackingTokenPrefix: trackingToken.slice(0, 12),
        trackingTokenHash: crypto.createHash('sha256').update(trackingToken).digest('hex'),
        trackingToken,
        ...(customer?._id ? { usuarioId: customer._id } : {}),
        cliente: {
          nome: input.customerName,
          telefone: input.customerPhone,
          endereco: input.deliveryType === 'delivery' ? input.deliveryAddress!.trim() : 'Retirada na loja',
        },
        itens: [{
          tipo_item: 'personalizado', nome: input.itemName, quantidade: 1,
          observacao: input.description.slice(0, 500),
          personalizacao: { descricao: input.description, imagens_referencia: input.referenceImages },
          opcoes_escolhidas: [], preco_unitario: input.itemPriceCents / 100,
          preco_unitario_centavos: input.itemPriceCents, subtotal: input.itemPriceCents / 100,
          subtotal_centavos: input.itemPriceCents,
        }],
        total: totalCents / 100,
        total_centavos: totalCents,
        frete: input.shippingCents / 100,
        frete_centavos: input.shippingCents,
        metodo_pagamento: input.paymentMethod,
        tipo_entrega: input.deliveryType,
        observacoes: input.description,
        payment_status: input.receivedCents <= 0 ? 'pending' : input.receivedCents < totalCents ? 'partial' : 'paid',
        payments,
        paid_amount_cents: input.receivedCents,
        refunded_amount_cents: 0,
        historico_status: [{ status: 'Pendente', data: createdAt, actorId, reason: 'Encomenda cadastrada pela loja' }],
      }], { session });

      if (input.receivedCents > 0) {
        const cash = await CashSession.findOne({ tenantId, status: 'open' }).session(session);
        if (cash) {
          cash.movements.push({ type: 'payment', amountCents: input.receivedCents, method: input.receivedMethod || input.paymentMethod, orderId: order._id, paymentId, note: 'Valor inicial da encomenda', actorId, createdAt });
          await cash.save({ session });
        }
      }
      await enqueueOrderPush(tenantId, order._id as mongoose.Types.ObjectId, session);
      response = { order: order.toObject(), trackingToken, depositCents, totalCents };
      await IdempotencyRecord.updateOne({ tenantId, scope: 'create-manual-order', key: input.operationId }, { $set: { status: 'completed', responseStatus: 201, responseBody: response } }, { session });
    });
    await processPushJobs({ tenantId, orderId: response.order?._id }).catch(() => undefined);
    return response;
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      const completed = await IdempotencyRecord.findOne({ tenantId, scope: 'create-manual-order', key: input.operationId }).lean();
      if (completed && completed.requestHash !== requestHash) throw new HttpError(409, 'Esta tentativa ja foi usada com outros dados.', 'IDEMPOTENCY_CONFLICT');
      if (completed?.status === 'completed') return completed.responseBody;
    }
    await IdempotencyRecord.updateOne({ tenantId, scope: 'create-manual-order', key: input.operationId, status: 'processing' }, { $set: { status: 'failed' } }).catch(() => undefined);
    throw error;
  } finally {
    await session.endSession();
  }
}
