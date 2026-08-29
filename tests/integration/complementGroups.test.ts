import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Tenant from '../../server/models/Tenant';
import { createAuthoritativeOrder, type CreateOrderInput } from '../../server/services/orderService';
import { publicProductDto } from '../../server/routes/public';
import Category from '../../src/models/Category';
import Product from '../../src/models/Product';
import ComplementGroup from '../../src/models/ComplementGroup';
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

    const globalGroup = await ComplementGroup.create({
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
      maximo: 2,
      ativo: true,
      itens: [
        { nome: 'Bacon Extra', preco: 5, preco_centavos: 500, ativo: true },
        { nome: 'Cebola Crispy', preco: 3, preco_centavos: 300, ativo: true },
        { nome: 'Trufa Rara', preco: 10, preco_centavos: 1000, ativo: false }, // Pausado
      ],
      categorias_vinculadas: [categoryHamburgueres._id],
    });

    const groupId = globalGroup._id.toString();
    const baconItemId = globalGroup.itens[0]._id.toString();
    const cebolaItemId = globalGroup.itens[1]._id.toString();
    const trufaItemId = globalGroup.itens[2]._id.toString();

    // 1. Valid order: Burger (2500) + Bacon (500) + Cebola (300) = 3300 cents (R$ 33,00)
    const validOrder = await createAuthoritativeOrder(
      tenant._id,
      customer._id,
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
              { groupId, itemId: cebolaItemId, quantity: 1 },
            ],
          },
        ],
      }
    );

    expect(validOrder.totalCents).toBe(3300);

    // 2. Reject order violating required minimum (minimo: 1)
    await expect(
      createAuthoritativeOrder(
        tenant._id,
        customer._id,
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
        tenant._id,
        customer._id,
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
  });
});
