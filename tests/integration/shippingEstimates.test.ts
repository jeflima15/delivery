import mongoose from 'mongoose';
import circle from '@turf/circle';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import StoreSettings from '../../src/models/StoreSettings';
import DeliveryRegion from '../../src/models/DeliveryRegion';
import Product from '../../src/models/Product';
import User from '../../src/models/User';
import Order from '../../src/models/Order';
import ShippingQuote from '../../server/models/ShippingQuote';
import { createLocationConfirmationToken, createShippingQuote } from '../../server/services/shippingService';
import { createAuthoritativeOrder } from '../../server/services/orderService';

let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
}, 120_000);
afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

const separated = { prazo_entrega_modo: 'preparo_deslocamento', tempo_preparo_min: 10, tempo_preparo_max: 20, tempo_deslocamento_min: 15, tempo_deslocamento_max: 30 };
const address = { street: 'Rua Um', number: '1', district: 'Centro', city: 'Itatiaia', state: 'RJ', postalCode: '27580000', latitude: -22.465, longitude: -44.445, locationConfirmed: true };
const confirmed = (changes = {}) => {
  const result = { ...address, ...changes };
  return { ...result, locationConfirmationToken: createLocationConfirmationToken(result, result) };
};
async function seed(extra = {}) {
  const tenantId = new mongoose.Types.ObjectId();
  await StoreSettings.create({ tenantId, nome_loja: 'Teste', cidade_loja: 'Resende', estado_loja: 'RJ', logisticsOptions: { allowDelivery: true, allowPickup: true, allowDineIn: true }, tipo_taxa_entrega: 'bairro_regiao', delivery_regions_publication: 'pub', tempo_entrega: '45-60 min', ...extra });
  await DeliveryRegion.create({ tenantId, publicationId: 'pub', name: 'Area', sourceType: 'polygon', geometry: { type: 'Polygon', coordinates: [[[-44.46, -22.48], [-44.44, -22.48], [-44.44, -22.46], [-44.46, -22.46], [-44.46, -22.48]]] }, feeCents: 700, active: true, priority: 0 });
  return tenantId;
}

describe('shipping and order estimates', () => {
  it('ignores inactive map drafts, honors block before default, and never invents zero', async () => {
    const tenantId = await seed({ cidade_loja: 'Itatiaia', bloquear_bairros_nao_atendidos: false });
    await DeliveryRegion.updateMany({ tenantId }, { $set: { active: false } });
    await expect(createShippingQuote(tenantId, address)).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
    await StoreSettings.updateOne({ tenantId }, { $set: { taxa_bairro_padrao: 8 } });
    expect(await createShippingQuote(tenantId, address)).toMatchObject({ feeCents: 800 });
    await StoreSettings.updateOne({ tenantId }, { $set: { bloquear_bairros_nao_atendidos: true } });
    await expect(createShippingQuote(tenantId, address)).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
    await StoreSettings.updateOne({ tenantId }, { $set: { bloquear_bairros_nao_atendidos: false, taxa_bairro_padrao: 0 } });
    expect(await createShippingQuote(tenantId, address)).toMatchObject({ feeCents: 0 });
    await DeliveryRegion.updateMany({ tenantId }, { $set: { active: true, blocked: true } });
    await expect(createShippingQuote(tenantId, confirmed())).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
    await expect(createShippingQuote(tenantId, confirmed({ latitude: -23 }))).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
  });

  it('preserves legacy isolated pricing engines and explicit old neighborhood defaults', async () => {
    const tenantId = await seed({ cidade_loja: 'Itatiaia', taxas_bairros: [{ nome: 'Centro', cidade: 'Itatiaia', estado: 'RJ', valor: 3, bloqueado: true }], taxa_bairro_padrao: 2 });
    await StoreSettings.collection.updateOne({ tenantId }, { $set: { tipo_taxa_entrega: 'regiao' } });
    expect(await createShippingQuote(tenantId, confirmed())).toMatchObject({ feeCents: 700 });
    await StoreSettings.collection.updateOne({ tenantId }, { $set: { tipo_taxa_entrega: 'bairro' } });
    await expect(createShippingQuote(tenantId, confirmed())).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
    expect(await createShippingQuote(tenantId, confirmed({ district: 'Outro' }))).toMatchObject({ feeCents: 200 });
    await StoreSettings.updateOne({ tenantId }, { $set: { taxa_bairro_padrao: null, bloquear_bairros_nao_atendidos: false } });
    expect(await createShippingQuote(tenantId, confirmed({ district: 'Outro' }))).toMatchObject({ feeCents: 0 });
  });

  it('defaults new stores to neighborhood pricing without implicitly offering free delivery', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const settings = await StoreSettings.create({ tenantId, cidade_loja: 'Itatiaia', estado_loja: 'RJ', logisticsOptions: { allowDelivery: true } });
    expect(settings.tipo_taxa_entrega).toBe('bairro_regiao');
    expect(settings.bloquear_bairros_nao_atendidos).toBe(true);
    await expect(createShippingQuote(tenantId, confirmed())).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
    expect(await ShippingQuote.countDocuments({ tenantId })).toBe(0);
  });

  it('rejects removed and unknown modes without falling back to another pricing engine', async () => {
    const tenantId = await seed();
    await expect(StoreSettings.updateOne({ tenantId }, { $set: { tipo_taxa_entrega: 'km' } }, { runValidators: true })).rejects.toThrow();
    for (const mode of ['km', 'unknown', null]) {
      // Simulate an invalid persisted document, bypassing model validation deliberately.
      await StoreSettings.collection.updateOne({ tenantId }, { $set: { tipo_taxa_entrega: mode } });
      await expect(createShippingQuote(tenantId, confirmed())).rejects.toMatchObject({ code: 'INVALID_DELIVERY_MODE' });
    }
    await StoreSettings.collection.updateOne({ tenantId }, { $unset: { tipo_taxa_entrega: '' } });
    await expect(createShippingQuote(tenantId, confirmed())).rejects.toMatchObject({ code: 'INVALID_DELIVERY_MODE' });
    expect(await ShippingQuote.countDocuments({ tenantId })).toBe(0);
  });

  it('keeps concentric map circles with their priority, fees and coverage limit', async () => {
    const tenantId = await seed();
    await DeliveryRegion.deleteMany({ tenantId });
    const center = { latitude: address.latitude, longitude: address.longitude };
    await DeliveryRegion.insertMany([
      { radius: 2, feeCents: 900, priority: 1 },
      { radius: 1, feeCents: 350, priority: 0 },
    ].map(({ radius, feeCents, priority }) => ({
      tenantId, publicationId: 'pub', name: `${radius} km`, sourceType: 'circle',
      center, radiusMeters: radius * 1000, feeCents, priority, active: true,
      geometry: circle([center.longitude, center.latitude], radius, { steps: 72, units: 'kilometers' }).geometry,
    })));
    expect(await createShippingQuote(tenantId, confirmed())).toMatchObject({ feeCents: 350 });
    expect(await createShippingQuote(tenantId, confirmed({ longitude: address.longitude + 0.013 }))).toMatchObject({ feeCents: 900 });
    await expect(createShippingQuote(tenantId, confirmed({ longitude: address.longitude + 0.04 }))).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
  });

  it('chooses active neighborhood before region and handles homonyms and legacy names', async () => {
    const tenantId = await seed({ taxas_bairros: [
      { nome: 'Centro', cidade: 'Resende', estado: 'RJ', valor: 5 },
      { nome: 'Centro (Itatiaia)', valor: 9 },
    ] });
    expect(await createShippingQuote(tenantId, confirmed())).toMatchObject({ feeCents: 900, deliveryTimeMin: 45, deliveryTimeMax: 60 });
    expect(await createShippingQuote(tenantId, confirmed({ city: 'Resende' }))).toMatchObject({ feeCents: 500 });
    expect(await createShippingQuote(tenantId, confirmed({ state: 'SP' }))).toMatchObject({ feeCents: 700 });
  });
  it('blocked neighborhood wins over fallback and a duplicate allowed entry', async () => {
    const tenantId = await seed({ taxa_bairro_padrao: 0, bloquear_bairros_nao_atendidos: false, taxas_bairros: [
      { nome: 'Centro (Itatiaia)', valor: 1 }, { nome: 'Centro (Itatiaia)', valor: 0, bloqueado: true },
    ] });
    await expect(createShippingQuote(tenantId, confirmed())).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
  });
  it.each(['Centro (Sul)', 'Centro(Sul)'])('blocks structured %s instead of falling back to the allowed map', async (nome) => {
    const tenantId = await seed({ taxas_bairros: [{ nome, cidade: 'Itatiaia', estado: 'RJ', valor: 0, bloqueado: true }] });
    await expect(createShippingQuote(tenantId, confirmed({ district: nome }))).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
    expect(await createShippingQuote(tenantId, confirmed())).toMatchObject({ feeCents: 700 });
  });
  it('falls back to published region without default fee, respecting block and coverage', async () => {
    const tenantId = await seed({ ...separated, taxa_bairro_padrao: 1, bloquear_bairros_nao_atendidos: false, taxas_bairros: [{ nome: 'Centro (Itatiaia)', valor: 3, ativo: false }] });
    expect(await createShippingQuote(tenantId, confirmed())).toMatchObject({ feeCents: 700, deliveryTimeMin: 25, deliveryTimeMax: 50 });
    await DeliveryRegion.updateMany({ tenantId }, { $set: { blocked: true } });
    await expect(createShippingQuote(tenantId, confirmed())).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
    await expect(createShippingQuote(tenantId, confirmed({ latitude: -23 }))).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
  });
  it('keeps legacy region totals, adds preparation only on opt-in and handles absent region ETA', async () => {
    const tenantId = await seed();
    expect(await createShippingQuote(tenantId, confirmed())).toMatchObject({ deliveryTimeMin: 45, deliveryTimeMax: 60 });
    await DeliveryRegion.updateMany({ tenantId }, { $set: { deliveryTimeMin: 5, deliveryTimeMax: 10 } });
    expect(await createShippingQuote(tenantId, confirmed())).toMatchObject({ deliveryTimeMin: 5, deliveryTimeMax: 10 });
    await StoreSettings.updateOne({ tenantId }, { $set: separated });
    expect(await createShippingQuote(tenantId, confirmed())).toMatchObject({ deliveryTimeMin: 15, deliveryTimeMax: 30 });
  });
  it.each(['pickup', 'dine_in'] as const)('snapshots only preparation for %s', async (deliveryType) => {
    const tenantId = await seed(separated);
    const customer = await User.create({ tenantId, nome: 'Cliente', telefone: '24999999999' });
    const product = await Product.create({ tenantId, nome: 'Produto', preco: 25, preco_centavos: 2500, ativo: true });
    await createAuthoritativeOrder(tenantId, customer._id as mongoose.Types.ObjectId, deliveryType, { deliveryType, paymentMethod: 'pix', items: [{ productId: String(product._id), quantity: 1, options: [] }] });
    expect(await Order.findOne({ tenantId }).lean()).toMatchObject({ prazo_entrega_min: 10, prazo_entrega_max: 20, prazo_entrega_modo: 'preparo_deslocamento', frete_centavos: 0 });
  });
  it('free shipping still requires a valid covered quote, then snapshots its total', async () => {
    const tenantId = await seed({ ...separated, frete_gratis_acima_de: 1 });
    const customer = await User.create({ tenantId, nome: 'Cliente', telefone: '24999999999' });
    const product = await Product.create({ tenantId, nome: 'Produto', preco: 25, preco_centavos: 2500, ativo: true });
    const input = { deliveryType: 'delivery' as const, paymentMethod: 'pix' as const, deliveryAddress: { logradouro: address.street, numero: address.number, bairro: address.district, cidade: address.city, estado: address.state, cep: address.postalCode }, items: [{ productId: String(product._id), quantity: 1, options: [] }] };
    await expect(createAuthoritativeOrder(tenantId, customer._id as mongoose.Types.ObjectId, 'no-quote', input)).rejects.toMatchObject({ code: 'SHIPPING_QUOTE_REQUIRED' });
    const quote = await createShippingQuote(tenantId, confirmed());
    await createAuthoritativeOrder(tenantId, customer._id as mongoose.Types.ObjectId, 'valid', { ...input, shippingQuoteId: String(quote.id) });
    expect(await Order.findOne({ tenantId }).lean()).toMatchObject({ prazo_entrega_min: 25, prazo_entrega_max: 50, frete_centavos: 0 });
  });
});
