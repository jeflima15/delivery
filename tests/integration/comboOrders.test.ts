import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Tenant from '../../server/models/Tenant';
import { createAuthoritativeOrder, type CreateOrderInput } from '../../server/services/orderService';
import Order from '../../src/models/Order';
import Product from '../../src/models/Product';
import StoreSettings from '../../src/models/StoreSettings';
import User from '../../src/models/User';

let mongo: MongoMemoryReplSet | undefined;

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
}, 120_000);

async function seedTenant(suffix = 'a') {
  const tenant = await Tenant.create({
    legalName: `Loja ${suffix.toUpperCase()}`,
    displayName: `Loja ${suffix.toUpperCase()}`,
    slug: `combo-${suffix}`,
    status: 'active',
    owner: { name: 'Owner', email: `owner-${suffix}@example.com` },
  });
  const customer = await User.create({
    tenantId: tenant._id,
    nome: 'Cliente Combo',
    telefone: `2499999000${suffix === 'a' ? '1' : '2'}`,
    normalizedPhone: `+552499999000${suffix === 'a' ? '1' : '2'}`,
  });
  await StoreSettings.create({
    tenantId: tenant._id,
    nome_loja: `Loja ${suffix.toUpperCase()}`,
    is_open: true,
    pedido_minimo: 0,
    pagamento_pix: true,
    logisticsOptions: { allowPickup: true, allowDelivery: true },
  });
  return { tenant, customer };
}

function pickup(items: CreateOrderInput['items']): CreateOrderInput {
  return { items, deliveryType: 'pickup', paymentMethod: 'pix' };
}

const objectId = (value: unknown) => value as mongoose.Types.ObjectId;

describe('pedidos autoritativos com combos', () => {
  it('gera numero diario atomico por loja e reinicia na virada operacional das 06:00', async () => {
    const tenantA = await seedTenant('a');
    const tenantB = await seedTenant('b');
    const productA = await Product.create({ tenantId: tenantA.tenant._id, nome: 'Produto A', preco: 10, ativo: true });
    const productB = await Product.create({ tenantId: tenantB.tenant._id, nome: 'Produto B', preco: 10, ativo: true });
    const item = (productId: unknown) => pickup([{ productId: String(productId), quantity: 1, options: [] }]);

    const firstA = await createAuthoritativeOrder(
      objectId(tenantA.tenant._id),
      objectId(tenantA.customer._id),
      'daily-a-1',
      item(productA._id),
      { timezone: 'America/Sao_Paulo', now: new Date('2026-08-29T08:00:00.000Z') },
    );
    const secondA = await createAuthoritativeOrder(
      objectId(tenantA.tenant._id),
      objectId(tenantA.customer._id),
      'daily-a-2',
      item(productA._id),
      { timezone: 'America/Sao_Paulo', now: new Date('2026-08-29T08:30:00.000Z') },
    );
    const firstB = await createAuthoritativeOrder(
      objectId(tenantB.tenant._id),
      objectId(tenantB.customer._id),
      'daily-b-1',
      item(productB._id),
      { timezone: 'America/Sao_Paulo', now: new Date('2026-08-29T08:30:00.000Z') },
    );
    const nextDayA = await createAuthoritativeOrder(
      objectId(tenantA.tenant._id),
      objectId(tenantA.customer._id),
      'daily-a-next',
      item(productA._id),
      { timezone: 'America/Sao_Paulo', now: new Date('2026-08-29T09:00:00.000Z') },
    );

    expect(firstA).toMatchObject({ dailyOrderNumber: 1, operationalDate: '2026-08-28' });
    expect(secondA).toMatchObject({ dailyOrderNumber: 2, operationalDate: '2026-08-28' });
    expect(firstB).toMatchObject({ dailyOrderNumber: 1, operationalDate: '2026-08-28' });
    expect(nextDayA).toMatchObject({ dailyOrderNumber: 1, operationalDate: '2026-08-29' });
    expect(new Set([firstA.orderNumber, secondA.orderNumber, nextDayA.orderNumber]).size).toBe(3);
  });

  it('continua aceitando o snapshot antigo de pedido sem campos de combo', async () => {
    const { tenant, customer } = await seedTenant();
    const product = await Product.create({
      tenantId: tenant._id,
      nome: 'Produto antigo',
      preco: 8,
      ativo: true,
    });
    const order = await Order.create({
      tenantId: tenant._id,
      usuarioId: customer._id,
      orderNumber: 1,
      cliente: { nome: 'Cliente Combo', telefone: '24999990001', endereco: 'Retirada' },
      itens: [{ produtoId: product._id, nome: 'Produto antigo', quantidade: 1, opcoes_escolhidas: [], preco_unitario: 8, subtotal: 8 }],
      total: 8,
      metodo_pagamento: 'pix',
      tipo_entrega: 'pickup',
    });

    const persisted = await Order.findById(order._id).lean();
    expect(persisted?.itens[0]).toMatchObject({ nome: 'Produto antigo', tipo_item: 'produto' });
    expect(persisted?.itens[0].combo_snapshot?.etapas || []).toHaveLength(0);
  });

  it('mantem produto legado sem tipo como produto normal e ignora preco enviado pelo cliente', async () => {
    const { tenant, customer } = await seedTenant();
    const legacyId = new mongoose.Types.ObjectId();
    await Product.collection.insertOne({
      _id: legacyId,
      tenantId: tenant._id,
      nome: 'Produto legado',
      preco: 12.5,
      preco_centavos: 1250,
      ativo: true,
      controlar_estoque: false,
      esgotado: false,
      grupos_adicionais: [],
      combo_etapas: [],
    });
    expect((await Product.collection.findOne({ _id: legacyId }))?.tipo).toBeUndefined();

    const input = pickup([{
      productId: legacyId.toString(),
      quantity: 1,
      options: [],
      price: 1,
      subtotal: 1,
    } as CreateOrderInput['items'][number]]);
    const response = await createAuthoritativeOrder(objectId(tenant._id), objectId(customer._id), 'legacy-product-key', input);
    const order = await Order.findById(response.orderId).lean();

    expect(response.totalCents).toBe(1250);
    expect(order?.itens[0]).toMatchObject({
      nome: 'Produto legado',
      tipo_item: 'produto',
      preco_unitario_centavos: 1250,
      subtotal_centavos: 1250,
    });
  });

  it('cobra talheres apenas quando a loja e o produto permitem', async () => {
    const { tenant, customer } = await seedTenant();
    await StoreSettings.updateOne({ tenantId: tenant._id }, { $set: { talheres_ativo: true, talheres_valor: 0.1 } });
    const eligible = await Product.create({ tenantId: tenant._id, nome: 'Marmita', preco: 20, preco_centavos: 2000, ativo: true, permite_talheres: true });
    const response = await createAuthoritativeOrder(
      objectId(tenant._id),
      objectId(customer._id),
      'cutlery-eligible',
      { ...pickup([{ productId: String(eligible._id), quantity: 1, options: [] }]), cutlery: true },
    );
    const order = await Order.findById(response.orderId).lean();
    expect(response.totalCents).toBe(2010);
    expect(order).toMatchObject({ talheres: true, talheres_valor_centavos: 10, total_centavos: 2010 });

    const unavailable = await Product.create({ tenantId: tenant._id, nome: 'Hamburguer', preco: 18, preco_centavos: 1800, ativo: true, permite_talheres: false });
    await expect(createAuthoritativeOrder(
      objectId(tenant._id),
      objectId(customer._id),
      'cutlery-unavailable',
      { ...pickup([{ productId: String(unavailable._id), quantity: 1, options: [] }]), cutlery: true },
    )).rejects.toMatchObject({ code: 'CUTLERY_UNAVAILABLE' });
  });

  it('calcula preco no servidor, cobra ou inclui adicionais, agrega estoque, salva snapshot e respeita idempotencia', async () => {
    const { tenant, customer } = await seedTenant();
    const component = await Product.create({
      tenantId: tenant._id,
      tipo: 'produto',
      nome: 'X-Bacon',
      preco: 99,
      preco_centavos: 9900,
      ativo: true,
      controlar_estoque: true,
      estoque: 5,
      grupos_adicionais: [{
        nome: 'Extras',
        obrigatorio: true,
        minimo: 1,
        maximo: 1,
        itens: [{ nome: 'Bacon extra', preco: 2.5, preco_centavos: 250, ativo: true }],
      }],
    });
    const group = component.grupos_adicionais[0] as any;
    const addition = group.itens[0] as any;
    const combo = await Product.create({
      tenantId: tenant._id,
      tipo: 'combo',
      nome: 'Combo duplo',
      preco: 0.01,
      preco_centavos: 1,
      ativo: true,
      controlar_estoque: false,
      combo_etapas: [
        {
          nome: 'Primeiro lanche',
          ordem: 0,
          valor_etapa_centavos: 1000,
          cobrar_complementos: true,
          opcoes: [{ produtoId: component._id, acrescimo_centavos: 300, ordem: 0 }],
        },
        {
          nome: 'Segundo lanche',
          ordem: 1,
          valor_etapa_centavos: 500,
          cobrar_complementos: false,
          opcoes: [{ produtoId: component._id, acrescimo_centavos: 0, ordem: 0 }],
        },
      ],
    });
    const [chargedStage, freeStage] = combo.combo_etapas as any[];
    const selectedAddition = [{ groupId: String(group._id), itemId: String(addition._id), quantity: 1 }];
    const input = pickup([{
      productId: combo._id.toString(),
      quantity: 2,
      options: [],
      comboSelections: [
        { stageId: String(chargedStage._id), selectedProductId: component._id.toString(), options: selectedAddition },
        { stageId: String(freeStage._id), selectedProductId: component._id.toString(), options: selectedAddition },
      ],
      price: 1,
      subtotal: 2,
    } as CreateOrderInput['items'][number]]);

    const first = await createAuthoritativeOrder(objectId(tenant._id), objectId(customer._id), 'combo-idempotency-key', input);
    expect(first.totalCents).toBe(4100);
    expect((await Product.findById(component._id).lean())?.estoque).toBe(1);

    const order = await Order.findById(first.orderId).lean();
    expect(order?.itens).toHaveLength(1);
    expect(order?.itens[0]).toMatchObject({
      nome: 'Combo duplo',
      tipo_item: 'combo',
      quantidade: 2,
      preco_unitario_centavos: 2050,
      subtotal_centavos: 4100,
    });
    const stages = order?.itens[0].combo_snapshot.etapas as any[];
    expect(stages).toHaveLength(2);
    expect(stages[0]).toMatchObject({
      stageId: chargedStage._id,
      nome: 'Primeiro lanche',
      produtoId: component._id,
      produto_nome: 'X-Bacon',
      valor_etapa_centavos: 1000,
      acrescimo_centavos: 300,
      cobrar_complementos: true,
    });
    expect(stages[0].adicionais[0]).toMatchObject({ item_nome: 'Bacon extra', quantidade: 1, preco_unitario_centavos: 250 });
    expect(stages[1]).toMatchObject({ nome: 'Segundo lanche', cobrar_complementos: false });
    expect(stages[1].adicionais[0]).toMatchObject({ item_nome: 'Bacon extra', quantidade: 1, preco_unitario_centavos: 0 });

    const repeated = await createAuthoritativeOrder(objectId(tenant._id), objectId(customer._id), 'combo-idempotency-key', input);
    expect(String(repeated.orderId)).toBe(String(first.orderId));
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect((await Product.findById(component._id).lean())?.estoque).toBe(1);
  });

  it('rejeita combo dentro de combo e produto pertencente a outro tenant', async () => {
    const { tenant, customer } = await seedTenant('a');
    const { tenant: foreignTenant } = await seedTenant('b');
    const foreignProduct = await Product.create({
      tenantId: foreignTenant._id,
      tipo: 'produto',
      nome: 'Produto estrangeiro',
      preco: 10,
      preco_centavos: 1000,
      ativo: true,
    });
    const nestedCombo = await Product.create({
      tenantId: tenant._id,
      tipo: 'combo',
      nome: 'Combo interno',
      preco: 5,
      preco_centavos: 500,
      ativo: true,
      combo_etapas: [{
        nome: 'Etapa interna',
        ordem: 0,
        valor_etapa_centavos: 500,
        opcoes: [{ produtoId: new mongoose.Types.ObjectId(), acrescimo_centavos: 0, ordem: 0 }],
      }],
    });
    const parentCombo = await Product.create({
      tenantId: tenant._id,
      tipo: 'combo',
      nome: 'Combo pai invalido',
      preco: 10,
      preco_centavos: 1000,
      ativo: true,
      combo_etapas: [{
        nome: 'Escolha',
        ordem: 0,
        valor_etapa_centavos: 1000,
        opcoes: [
          { produtoId: nestedCombo._id, acrescimo_centavos: 0, ordem: 0 },
          { produtoId: foreignProduct._id, acrescimo_centavos: 0, ordem: 1 },
        ],
      }],
    });
    const stage = (parentCombo.combo_etapas as any[])[0];

    await expect(createAuthoritativeOrder(objectId(tenant._id), objectId(customer._id), 'nested-combo-key', pickup([{
      productId: parentCombo._id.toString(),
      quantity: 1,
      options: [],
      comboSelections: [{ stageId: String(stage._id), selectedProductId: nestedCombo._id.toString(), options: [] }],
    }]))).rejects.toMatchObject({ code: 'INVALID_COMBO_PRODUCT' });

    await expect(createAuthoritativeOrder(objectId(tenant._id), objectId(customer._id), 'foreign-product-key', pickup([{
      productId: parentCombo._id.toString(),
      quantity: 1,
      options: [],
      comboSelections: [{ stageId: String(stage._id), selectedProductId: foreignProduct._id.toString(), options: [] }],
    }]))).rejects.toMatchObject({ code: 'INVALID_COMBO_PRODUCT' });

    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('rejeita opcao nao permitida, produto esgotado, estoque insuficiente e repeticao textual insegura', async () => {
    const { tenant, customer } = await seedTenant();
    const allowed = await Product.create({
      tenantId: tenant._id,
      tipo: 'produto',
      nome: 'Permitido',
      preco: 20,
      preco_centavos: 2000,
      ativo: true,
      controlar_estoque: true,
      estoque: 1,
      grupos_adicionais: [{
        nome: 'Escolha obrigatoria',
        obrigatorio: true,
        minimo: 1,
        maximo: 1,
        itens: [{ nome: 'Adicional seguro', preco: 2, preco_centavos: 200, ativo: true }],
      }],
    });
    const other = await Product.create({ tenantId: tenant._id, tipo: 'produto', nome: 'Nao permitido', preco: 5, preco_centavos: 500, ativo: true });
    const combo = await Product.create({
      tenantId: tenant._id,
      tipo: 'combo',
      nome: 'Combo protegido',
      preco: 20,
      preco_centavos: 2000,
      ativo: true,
      combo_etapas: [{ nome: 'Principal', ordem: 0, valor_etapa_centavos: 2000, opcoes: [{ produtoId: allowed._id, acrescimo_centavos: 0, ordem: 0 }] }],
    });
    const stage = (combo.combo_etapas as any[])[0];
    const group = (allowed.grupos_adicionais as any[])[0];
    const addition = group.itens[0];

    await expect(createAuthoritativeOrder(objectId(tenant._id), objectId(customer._id), 'invalid-option-product-key', pickup([{
      productId: combo._id.toString(), quantity: 1, options: [],
      comboSelections: [{ stageId: String(stage._id), selectedProductId: other._id.toString(), options: [] }],
    }]))).rejects.toMatchObject({ code: 'INVALID_COMBO_PRODUCT' });

    await Product.findByIdAndUpdate(allowed._id, { esgotado: true });
    await expect(createAuthoritativeOrder(objectId(tenant._id), objectId(customer._id), 'sold-out-component-key', pickup([{
      productId: combo._id.toString(), quantity: 1, options: [],
      comboSelections: [{ stageId: String(stage._id), selectedProductId: allowed._id.toString(), options: [] }],
    }]))).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });

    await Product.findByIdAndUpdate(allowed._id, { esgotado: false });
    await expect(createAuthoritativeOrder(objectId(tenant._id), objectId(customer._id), 'insufficient-component-stock-key', pickup([{
      productId: combo._id.toString(), quantity: 2, options: [],
      comboSelections: [{
        stageId: String(stage._id), selectedProductId: allowed._id.toString(),
        options: [{ groupId: String(group._id), itemId: String(addition._id), quantity: 1 }],
      }],
    }]))).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });

    await expect(createAuthoritativeOrder(objectId(tenant._id), objectId(customer._id), 'legacy-repeat-text-key', pickup([{
      productId: allowed._id.toString(), quantity: 1, options: [],
      opcoes_escolhidas: [{ opcao: 'Escolha obrigatoria: Adicional seguro', quantidade: 1 }],
    } as CreateOrderInput['items'][number]]))).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });

    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect((await Product.findById(allowed._id).lean())?.estoque).toBe(1);
  });

  it('bloqueia compra avulsa de item exclusivo de combo mas permite compra dentro de combo por etapas', async () => {
    const { tenant, customer } = await seedTenant('exclusive');

    const exclusiveItem = await Product.create({
      tenantId: tenant._id,
      tipo: 'produto',
      nome: 'Mini Refrigerante 220ml Exclusivo',
      preco: 4,
      preco_centavos: 400,
      ativo: true,
      exclusivo_combo: true,
      controlar_estoque: true,
      estoque: 5,
    });

    const combo = await Product.create({
      tenantId: tenant._id,
      tipo: 'combo',
      nome: 'Combo Burguer + Mini Refri',
      preco: 25,
      preco_centavos: 2500,
      ativo: true,
      combo_etapas: [{
        nome: 'Escolha a Bebida',
        ordem: 0,
        valor_etapa_centavos: 2500,
        opcoes: [{ produtoId: exclusiveItem._id, acrescimo_centavos: 0, ordem: 0 }],
      }],
    });
    const stage = (combo.combo_etapas as any[])[0];

    // 1. Tentar comprar o item exclusivo avulso deve ser bloqueado
    await expect(
      createAuthoritativeOrder(objectId(tenant._id), objectId(customer._id), 'exclusive-standalone-attempt', pickup([{
        productId: exclusiveItem._id.toString(),
        quantity: 1,
        options: [],
      }]))
    ).rejects.toMatchObject({ code: 'ITEM_EXCLUSIVE_TO_COMBO' });

    // 2. Comprar o item exclusivo dentro do combo deve ser aprovado
    const res = await createAuthoritativeOrder(
      objectId(tenant._id),
      objectId(customer._id),
      'exclusive-in-combo-success',
      pickup([{
        productId: combo._id.toString(),
        quantity: 1,
        options: [],
        comboSelections: [{
          stageId: String(stage._id),
          selectedProductId: exclusiveItem._id.toString(),
          options: [],
        }],
      }])
    );

    expect(res.totalCents).toBe(2500);

    const savedOrder = await Order.findById(res.orderId).lean();
    expect(savedOrder?.itens[0].tipo_item).toBe('combo');

    // 3. Verifica baixa de estoque do componente exclusivo
    const updatedItem = await Product.findById(exclusiveItem._id).lean();
    expect(updatedItem?.estoque).toBe(4);
  });
});

