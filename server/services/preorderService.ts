import mongoose from 'mongoose';
import { z } from 'zod';
import Product from '../../src/models/Product.js';
import Order from '../../src/models/Order.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import { HttpError } from '../middleware/errors.js';
import { listPreorderSlots, preorderSettingsSchema, resolvePreorderCartPolicy, type PreorderProductPolicy } from '../domain/preorderScheduling.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);
export const preorderSelectionSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startsAt: z.string().datetime() }).strict();
export const availabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(z.object({ productId: id, comboSelections: z.array(z.object({ stageId: id, selectedProductId: id })).max(20).default([]) })).min(1).max(100),
}).strict();

export function activePreorderSettings(settings: any) {
  return preorderSettingsSchema.parse(settings?.preorderEnabled ? settings.preorderDraft || {} : {});
}

// A shared tenant write serializes reservations, cancellations and reschedules.
// Transaction retries then recalculate capacity against a fresh snapshot.
export async function lockPreorderCalendar(tenantId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  return StoreSettings.findOneAndUpdate({ tenantId }, { $inc: { preorderLock: 1 } }, { session, returnDocument: 'after', timestamps: false }).lean();
}

export async function cartPreorderPolicies(tenantId: mongoose.Types.ObjectId, items: z.infer<typeof availabilitySchema>['items'], session?: mongoose.ClientSession) {
  const parents = await Product.find({ tenantId, _id: { $in: items.map((item) => item.productId) } }).session(session || null).lean();
  const ids = new Set(items.map((item) => item.productId));
  for (const selected of items) {
    const product = parents.find((entry) => String(entry._id) === selected.productId);
    if (!product || product.ativo === false || product.esgotado) throw new HttpError(409, 'Um item esta indisponivel. Atualize a sacola.', 'PRODUCT_UNAVAILABLE');
    if (product.tipo === 'combo') {
      const fixed = product.combo_mode === 'fixed' || (product.combo_itens_fixos?.length && !product.combo_etapas?.length);
      if (fixed) {
        for (const item of product.combo_itens_fixos || []) ids.add(String(item.produtoId));
      } else {
        if (selected.comboSelections.length !== product.combo_etapas?.length) throw new HttpError(409, 'Complete as etapas do combo.', 'INCOMPLETE_COMBO');
        for (const stage of product.combo_etapas || []) {
          const selection = selected.comboSelections.find((item) => item.stageId === String(stage._id));
          if (!selection || !stage.opcoes.some((option) => String(option.produtoId) === selection.selectedProductId)) throw new HttpError(409, 'Selecao de combo invalida.', 'INVALID_COMBO_SELECTIONS');
          ids.add(selection.selectedProductId);
        }
      }
    }
  }
  const products = await Product.find({ tenantId, _id: { $in: [...ids] } }).session(session || null).lean();
  if (products.length !== ids.size || products.some((product) => product.ativo === false || product.esgotado)) throw new HttpError(409, 'Um item esta indisponivel.', 'PRODUCT_UNAVAILABLE');
  return products.map((product) => product.preorderDraft || {}) as Partial<PreorderProductPolicy>[];
}

export async function availablePreorderSlots(input: {
  tenantId: mongoose.Types.ObjectId; settings: any; date: string; timezone: string;
  policies: Partial<PreorderProductPolicy>[]; now?: Date; session?: mongoose.ClientSession; excludeOrderId?: string;
}) {
  const settings = activePreorderSettings(input.settings);
  const policy = resolvePreorderCartPolicy(settings, input.policies);
  const reservations = await Order.find({ tenantId: input.tenantId, 'preorder.date': input.date, status: { $ne: 'Cancelado' },
    ...(input.excludeOrderId ? { _id: { $ne: input.excludeOrderId } } : {}),
  }).select('preorder').session(input.session || null).lean();
  let slots;
  try {
    slots = listPreorderSlots({ settings, date: input.date, timezone: input.timezone, now: input.now || new Date(), products: input.policies,
      occupancy: { date: input.date, dailyCount: reservations.length, slots: {} } });
  } catch {
    throw new HttpError(400, 'Data ou configuracao da agenda invalida.', 'INVALID_PREORDER_DATE');
  }
  // Overlap, not just identical starts, protects bookings after slot-size changes.
  return { policy, slots: slots.flatMap((slot) => {
    const count = reservations.filter((order) => new Date(order.preorder.startsAt).getTime() < Date.parse(slot.endsAt) && new Date(order.preorder.endsAt).getTime() > Date.parse(slot.startsAt)).length;
    const remaining = Math.min(slot.remainingOrders ?? Infinity, settings.maxOrdersPerSlot == null ? Infinity : settings.maxOrdersPerSlot - count);
    return remaining <= 0 ? [] : [{ ...slot, remainingOrders: Number.isFinite(remaining) ? remaining : null }];
  }) };
}

export async function availablePreorderDates(input: {
  tenantId: mongoose.Types.ObjectId; settings: any; afterDate: string; timezone: string;
  policies: Partial<PreorderProductPolicy>[]; now?: Date;
}) {
  const settings = activePreorderSettings(input.settings);
  const now = input.now || new Date();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: input.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const requestedFirstDate = addDays(input.afterDate, 1);
  const firstDate = requestedFirstDate < today ? today : requestedFirstDate;
  const lastDate = addDays(today, settings.maxAdvanceDays);
  if (firstDate > lastDate) return [];
  const reservations = await Order.find({
    tenantId: input.tenantId,
    'preorder.date': { $gte: firstDate, $lte: lastDate },
    status: { $ne: 'Cancelado' },
  }).select('preorder').lean();
  const dates = [];
  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    const dateReservations = reservations.filter((order) => order.preorder?.date === date);
    let slots;
    try {
      slots = listPreorderSlots({
        settings, date, timezone: input.timezone, now, products: input.policies,
        occupancy: { date, dailyCount: dateReservations.length, slots: {} },
      });
    } catch { continue; }
    const available = slots.find((slot) => {
      const overlaps = dateReservations.filter((order) => new Date(order.preorder.startsAt).getTime() < Date.parse(slot.endsAt)
        && new Date(order.preorder.endsAt).getTime() > Date.parse(slot.startsAt)).length;
      return settings.maxOrdersPerSlot === null || overlaps < settings.maxOrdersPerSlot;
    });
    if (available) dates.push(available);
  }
  return dates;
}

export async function nextAvailablePreorderSlot(input: Parameters<typeof availablePreorderDates>[0]) {
  return (await availablePreorderDates(input))[0] || null;
}

export async function reservePreorder(input: Parameters<typeof availablePreorderSlots>[0] & { startsAt: string }) {
  const result = await availablePreorderSlots(input);
  const slot = result.slots.find((entry) => Date.parse(entry.startsAt) === Date.parse(input.startsAt));
  if (!slot) throw new HttpError(409, 'Este horario nao esta mais disponivel. Escolha outra data ou horario.', 'PREORDER_SLOT_UNAVAILABLE');
  return { ...slot, timezone: input.timezone, minLeadMinutes: result.policy.minLeadMinutes };
}
