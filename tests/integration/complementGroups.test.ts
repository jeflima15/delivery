import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Tenant from '../../server/models/Tenant';
import { createAuthoritativeOrder } from '../../server/services/orderService';
import { createLocationConfirmationToken, createShippingQuote } from '../../server/services/shippingService';
import { publicProductDto } from '../../server/routes/public';
import Category from '../../src/models/Category';
import Product from '../../src/models/Product';
import ComplementGroup from '../../src/models/ComplementGroup';
import StoreSettings from '../../src/models/StoreSettings';
import User from '../../src/models/User';
import DeliveryRegion from '../../src/models/DeliveryRegion';

const objectId = (value: unknown) => value as mongoose.Types.ObjectId;

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

async function seedStore(slugSuffix = 'a') {
  const tenant = await Tenant.create({
    legalName: `Loja ${slugSuffix.toUpperCase()}`,
    displayName: `Loja ${slugSuffix.toUpperCase()}`,
    slug: `loja-complementos-${slugSuffix}`,
    status: 'active',
    owner: { name: 'Dono', email: `dono-${slugSuffix}@example.com` },
  });

  const customer = await User.create({
    tenantId: tenant._id,
    nome: 'Cliente Teste',
    telefone: `2499999111${slugSuffix === 'a' ? '1' : '2'}`,
    normalizedPhone: `+552499999111${slugSuffix === 'a' ? '1' : '2'}`,
  });

  await StoreSettings.create({
    tenantId: tenant._id,
    nome_loja: `Loja ${slugSuffix.toUpperCase()}`,
    is_open: true,
    pedido_minimo: 0,
    pagamento_pix: true,
    logisticsOptions: { allowPickup: true, allowDelivery: true },
  });

  const categoryHamburgueres = await Category.create({
    tenantId: tenant._id,
    nome: 'Hambúrgueres',
    ordem: 1,
  });

  const categoryBebidas = await Category.create({
    tenantId: tenant._id,
    nome: 'Bebidas',
    ordem: 2,
  });

  const burger1 = await Product.create({
    tenantId: tenant._id,
    categoriaId: categoryHamburgueres._id,
    nome: 'X-Burger Artesanal',
    preco: 25,
    preco_centavos: 2500,
    ativo: true,
    grupos_adicionais: [],
  });

  const burger2 = await Product.create({
    tenantId: tenant._id,
    categoriaId: categoryHamburgueres._id,
    nome: 'Smash Duplo',
    preco: 30,
    preco_centavos: 3000,
    ativo: true,
    grupos_adicionais: [
      {
        nome: 'Pão Especial',
        obrigatorio: false,
        minimo: 0,
        maximo: 1,
        itens: [
          { nome: 'Pão Australiano', preco: 3, preco_centavos: 300, ativo: true },
        ],
      },
    ],
  });

  const soda = await Product.create({
    tenantId: tenant._id,
    categoriaId: categoryBebidas._id,
    nome: 'Refrigerante Lata',
    preco: 6,
    preco_centavos: 600,
    ativo: true,
    grupos_adicionais: [],
  });

  return { tenant, customer, categoryHamburgueres, categoryBebidas, burger1, burger2, soda };
}

describe('Biblioteca Global de Complementos e Herança', () => {
  it('vincula grupo global por categoria e mescla automaticamente no catálogo público', async () => {
    const { tenant, categoryHamburgueres, burger1, burger2, soda } = await seedStore('cat');

    await ComplementGroup.create({
      tenantId: tenant._id,
      nome: 'Turbine seu Lanche',
      obrigatorio: false,
      minimo: 0,
      maximo: 3,
      ativo: true,
      itens: [
        { nome: 'Bacon Crocante', preco: 4, preco_centavos: 400, ativo: true },
        { nome: 'Queijo Cheddar', preco: 3.5, preco_centavos: 350, ativo: true },
      ],
      categorias_vinculadas: [categoryHamburgueres._id],
      produtos_vinculados: [],
    });

    const activeGlobals = await ComplementGroup.find({ tenantId: tenant._id, ativo: true }).lean();

    // Burger 1 had 0 own groups -> should now have 1 (the global group)
    const dto1 = publicProductDto(burger1.toObject(), activeGlobals);
    expect(dto1.grupos_adicionais).toHaveLength(1);
    expect(dto1.grupos_adicionais[0].nome).toBe('Turbine seu Lanche');
    expect(dto1.grupos_adicionais[0].itens).toHaveLength(2);
    expect(dto1.grupos_adicionais[0].itens[0].nome).toBe('Bacon Crocante');
    expect(dto1.grupos_adicionais[0].itens[0].preco_centavos).toBe(400);

    // Burger 2 had 1 own group ("Pão Especial") -> should now have 2 (Pão Especial + Turbine seu Lanche)
    const dto2 = publicProductDto(burger2.toObject(), activeGlobals);
    expect(dto2.grupos_adicionais).toHaveLength(2);
    expect(dto2.grupos_adicionais.map((g) => g.nome)).toEqual(['Pão Especial', 'Turbine seu Lanche']);

    // Soda is in Bebidas category -> should NOT receive the burger complement group
    const dtoSoda = publicProductDto(soda.toObject(), activeGlobals);
    expect(dtoSoda.grupos_adicionais).toHaveLength(0);
  });

  it('vincula grupo global a produto individual especifico', async () => {
    const { tenant, burger1, soda } = await seedStore('prod');

    await ComplementGroup.create({
      tenantId: tenant._id,
      nome: 'Gelo e Limão',
      obrigatorio: false,
      minimo: 0,
      maximo: 1,
      ativo: true,
      itens: [
        { nome: 'Com Gelo e Limão', preco: 0, preco_centavos: 0, ativo: true },
      ],
      categorias_vinculadas: [],
      produtos_vinculados: [soda._id],
    });

    const activeGlobals = await ComplementGroup.find({ tenantId: tenant._id, ativo: true }).lean();

    const dtoSoda = publicProductDto(soda.toObject(), activeGlobals);
    expect(dtoSoda.grupos_adicionais).toHaveLength(1);
    expect(dtoSoda.grupos_adicionais[0].nome).toBe('Gelo e Limão');

    const dtoBurger = publicProductDto(burger1.toObject(), activeGlobals);
    expect(dtoBurger.grupos_adicionais).toHaveLength(0);
  });

  it('calcula e valida pedidos autoritativos com adicionais herdados de grupos globais', async () => {
    const { tenant, customer, categoryHamburgueres, burger1 } = await seedStore('order');

    const globalGroup = await ComplementGroup.create({
      tenantId: tenant._id,
      nome: 'Turbine seu Lanche',
      obrigatorio: true,
      minimo: 1,
      maximo: 5,
      ativo: true,
      itens: [
        { nome: 'Bacon Extra', descricao: 'Fatias crocantes artesanais', preco: 5, preco_centavos: 500, maximo: 1, ativo: true },
        { nome: 'Cebola Crispy', descricao: 'Frita no azeite', preco: 3, preco_centavos: 300, maximo: 3, ativo: true },
        { nome: 'Trufa Rara', descricao: 'Importada', preco: 10, preco_centavos: 1000, maximo: 1, ativo: false }, // Pausado
      ],
      categorias_vinculadas: [categoryHamburgueres._id],
    });

    const activeGlobals = await ComplementGroup.find({ tenantId: tenant._id, ativo: true }).lean();
    const dto = publicProductDto(burger1.toObject(), activeGlobals);
    expect(dto.grupos_adicionais[0].itens[0].descricao).toBe('Fatias crocantes artesanais');
    expect(dto.grupos_adicionais[0].itens[0].maximo).toBe(1);

    const groupId = globalGroup._id.toString();
    const baconItemId = globalGroup.itens[0]._id.toString();
    const cebolaItemId = globalGroup.itens[1]._id.toString();
    const trufaItemId = globalGroup.itens[2]._id.toString();

const objectId = (value: unknown) => value as mongoose.Types.ObjectId;

    // 1. Valid order: Burger (2500) + Bacon x1 (500) + Cebola x2 (600) = 3600 cents (R$ 36,00)
    const validOrder = await createAuthoritativeOrder(
      objectId(tenant._id),
      objectId(customer._id),
      'order-key-1',
      {
        deliveryType: 'pickup',
        paymentMethod: 'pix',
        items: [
          {
            productId: burger1._id.toString(),
            quantity: 1,
            options: [
              { groupId, itemId: baconItemId, quantity: 1 },
              { groupId, itemId: cebolaItemId, quantity: 2 },
            ],
          },
        ],
      }
    );

    expect(validOrder.totalCents).toBe(3600);

    // 2. Reject order violating required minimum (minimo: 1)
    await expect(
      createAuthoritativeOrder(
        objectId(tenant._id),
        objectId(customer._id),
        'order-key-2',
        {
          deliveryType: 'pickup',
          paymentMethod: 'pix',
          items: [
            {
              productId: burger1._id.toString(),
              quantity: 1,
              options: [],
            },
          ],
        }
      )
    ).rejects.toThrow('Selecao invalida em Turbine seu Lanche.');

    // 3. Reject order with paused item (ativo: false)
    await expect(
      createAuthoritativeOrder(
        objectId(tenant._id),
        objectId(customer._id),
        'order-key-3',
        {
          deliveryType: 'pickup',
          paymentMethod: 'pix',
          items: [
            {
              productId: burger1._id.toString(),
              quantity: 1,
              options: [
                { groupId, itemId: trufaItemId, quantity: 1 },
              ],
            },
          ],
        }
      )
    ).rejects.toThrow('Adicional indisponivel.');

    // 4. Reject order exceeding individual item max (Bacon has maximo: 1, user asks for 2)
    await expect(
      createAuthoritativeOrder(
        objectId(tenant._id),
        objectId(customer._id),
        'order-key-4',
        {
          deliveryType: 'pickup',
          paymentMethod: 'pix',
          items: [
            {
              productId: burger1._id.toString(),
              quantity: 1,
              options: [
                { groupId, itemId: baconItemId, quantity: 2 },
              ],
            },
          ],
        }
      )
    ).rejects.toThrow('Limite maximo excedido para Bacon Extra (maximo 1).');
  });

  it('calcula frete corretamente pelo modo Por Bairro com normalização de acentos e maiúsculas', async () => {
    const tenant = await Tenant.create({
      legalName: 'Loja Frete Bairro',
      displayName: 'Loja Frete Bairro',
      slug: 'loja-frete-bairro',
      status: 'active',
      owner: { name: 'Dono', email: 'dono-bairro@example.com' },
    });

    await StoreSettings.create({
      tenantId: tenant._id,
      nome_loja: 'Loja Frete Bairro',
      cidade_loja: 'São Paulo',
      estado_loja: 'SP',
      logisticsOptions: { allowPickup: true, allowDelivery: true },
      tipo_taxa_entrega: 'bairro_regiao',
      taxas_bairros: [
        { nome: 'Centro', cidade: 'São Paulo', estado: 'SP', valor: 5.0, deliveryTimeMin: 20, deliveryTimeMax: 30, ativo: true },
        { nome: 'Centro', cidade: 'Campinas', estado: 'SP', valor: 9.0, deliveryTimeMin: 45, deliveryTimeMax: 60, ativo: true },
        { nome: 'Jardim América', cidade: 'São Paulo', estado: 'SP', valor: 7.5, tempo_estimado: '30-40 min', ativo: true },
        { nome: 'Vila Nova', cidade: 'São Paulo', estado: 'SP', valor: 10.0, tempo_estimado: '40-50 min', ativo: true },
      ],
      bloquear_bairros_nao_atendidos: true,
    });

    // 1. Match exato
    const quoteCentro = await createShippingQuote(objectId(tenant._id), {
      street: 'Rua Principal',
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(quoteCentro).toMatchObject({ feeCents: 500, deliveryTimeMin: 20, deliveryTimeMax: 30 });

    const quoteCentroCampinas = await createShippingQuote(objectId(tenant._id), {
      street: 'Rua Principal',
      district: 'Centro',
      city: 'Campinas',
      state: 'SP',
    });
    expect(quoteCentroCampinas).toMatchObject({ feeCents: 900, deliveryTimeMin: 45, deliveryTimeMax: 60 });

    // 2. Match com normalização de acentos e minúsculas
    const quoteJardim = await createShippingQuote(objectId(tenant._id), {
      street: 'Av. das Rosas',
      district: 'jardim america',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(quoteJardim.feeCents).toBe(750);

    // 3. Bairro não atendido com bloqueio ativo
    await expect(
      createShippingQuote(objectId(tenant._id), {
        street: 'Rua Longínqua',
        district: 'Bairro Desconhecido',
        city: 'Rio de Janeiro',
        state: 'RJ',
      })
    ).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
  });

  it('aplica taxa padrão para bairros não listados quando configurado', async () => {
    const tenant = await Tenant.create({
      legalName: 'Loja Taxa Padrao',
      displayName: 'Loja Taxa Padrao',
      slug: 'loja-taxa-padrao',
      status: 'active',
      owner: { name: 'Dono', email: 'dono-padrao@example.com' },
    });

    await StoreSettings.create({
      tenantId: tenant._id,
      nome_loja: 'Loja Taxa Padrao',
      cidade_loja: 'São Paulo',
      estado_loja: 'SP',
      logisticsOptions: { allowPickup: true, allowDelivery: true },
      tipo_taxa_entrega: 'bairro_regiao',
      taxas_bairros: [
        { nome: 'Centro', valor: 5.0, ativo: true },
      ],
      bloquear_bairros_nao_atendidos: false,
      taxa_bairro_padrao: 12.0,
    });

    const quoteOutro = await createShippingQuote(objectId(tenant._id), {
      street: 'Rua Sem Cadastro',
      district: 'Bairro Novo',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(quoteOutro.feeCents).toBe(1200);

    await expect(createShippingQuote(objectId(tenant._id), {
      street: 'Rua Sem Cadastro',
      district: 'Bairro Novo',
      city: 'Campinas',
      state: 'SP',
    })).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
  });

  it('calcula frete corretamente no modo Taxa Fixa e bloqueia se delivery desativado', async () => {
    const tenant = await Tenant.create({
      legalName: 'Loja Taxa Fixa',
      displayName: 'Loja Taxa Fixa',
      slug: 'loja-taxa-fixa',
      status: 'active',
      owner: { name: 'Dono', email: 'dono-fixa@example.com' },
    });

    const settings = await StoreSettings.create({
      tenantId: tenant._id,
      nome_loja: 'Loja Taxa Fixa',
      cidade_loja: 'São Paulo',
      estado_loja: 'SP',
      logisticsOptions: { allowPickup: true, allowDelivery: true },
      tipo_taxa_entrega: 'fixa',
      taxa_entrega_fixa: 6.5,
    });

    const quote = await createShippingQuote(objectId(tenant._id), {
      street: 'Qualquer Rua',
      number: '123',
      district: 'Qualquer Bairro',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(quote.feeCents).toBe(650);

    await expect(createShippingQuote(objectId(tenant._id), {
      street: 'Qualquer Rua',
      district: 'Centro',
      city: 'Campinas',
      state: 'SP',
    })).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });

    // Desativa delivery
    await StoreSettings.updateOne({ _id: settings._id }, { $set: { 'logisticsOptions.allowDelivery': false } });
    await expect(
      createShippingQuote(objectId(tenant._id), {
        street: 'Qualquer Rua',
        district: 'Centro',
        city: 'São Paulo',
      })
    ).rejects.toMatchObject({ code: 'DELIVERY_DISABLED' });
  });

  it('aplica prioridade, bloqueio e taxa nas regioes publicadas do mapa', async () => {
    const tenant = await Tenant.create({
      legalName: 'Loja Regioes', displayName: 'Loja Regioes', slug: 'loja-regioes', status: 'active',
      owner: { name: 'Dono', email: 'dono-regioes@example.com' },
    });
    const publicationId = 'publication-test';
    await StoreSettings.create({
      tenantId: tenant._id,
      nome_loja: 'Loja Regioes',
      logisticsOptions: { allowPickup: true, allowDelivery: true },
      tipo_taxa_entrega: 'bairro_regiao',
      delivery_regions_publication: publicationId,
      localizacao_loja: { latitude: -22.47, longitude: -44.45, confirmed: true },
    });
    await DeliveryRegion.insertMany([
      {
        tenantId: tenant._id, publicationId, name: 'Rua bloqueada', sourceType: 'polygon', priority: 0,
        geometry: { type: 'Polygon', coordinates: [[[-44.452, -22.472], [-44.448, -22.472], [-44.448, -22.468], [-44.452, -22.468], [-44.452, -22.472]]] },
        feeCents: 0, deliveryTimeMin: 0, deliveryTimeMax: 0, blocked: true, active: true,
      },
      {
        tenantId: tenant._id, publicationId, name: 'Centro', sourceType: 'polygon', priority: 1,
        geometry: { type: 'Polygon', coordinates: [[[-44.46, -22.48], [-44.44, -22.48], [-44.44, -22.46], [-44.46, -22.46], [-44.46, -22.48]]] },
        feeCents: 700, deliveryTimeMin: 25, deliveryTimeMax: 40, blocked: false, active: true,
      },
    ]);

    const blockedAddress = { street: 'Rua bloqueada', city: 'Resende', latitude: -22.47, longitude: -44.45, locationConfirmed: true };
    await expect(createShippingQuote(objectId(tenant._id), {
      ...blockedAddress,
      locationConfirmationToken: createLocationConfirmationToken(blockedAddress, blockedAddress),
    })).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });

    const servedAddress = { street: 'Rua atendida', city: 'Resende', latitude: -22.465, longitude: -44.445, locationConfirmed: true };
    const quote = await createShippingQuote(objectId(tenant._id), {
      ...servedAddress,
      locationConfirmationToken: createLocationConfirmationToken(servedAddress, servedAddress),
    });
    expect(quote).toMatchObject({ feeCents: 700, deliveryTimeMin: 25, deliveryTimeMax: 40, regionName: 'Centro' });

    const distantAddress = { street: 'Rua distante', city: 'Resende', latitude: -22.60, longitude: -44.60, locationConfirmed: true };
    await expect(createShippingQuote(objectId(tenant._id), {
      ...distantAddress,
      locationConfirmationToken: createLocationConfirmationToken(distantAddress, distantAddress),
    })).rejects.toMatchObject({ code: 'OUTSIDE_DELIVERY_AREA' });
  });
});
