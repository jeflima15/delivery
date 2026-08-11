import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import publicRouter from '../../server/routes/public';
import tenantRouter from '../../server/routes/tenant';
import customerRouter from '../../server/routes/customer';
import customerAuthRouter from '../../server/routes/customerAuth';
import authRouter from '../../server/routes/auth';
import masterRouter from '../../server/routes/master';
import { errorHandler, notFound } from '../../server/middleware/errors';
import { requestContext } from '../../server/middleware/requestContext';
import { resetMemoryRateLimitsForTests } from '../../server/middleware/rateLimit';
import Tenant from '../../server/models/Tenant';
import AdminAccount from '../../server/models/AdminAccount';
import TenantMembership from '../../server/models/TenantMembership';
import AuthSession from '../../server/models/AuthSession';
import Category from '../../src/models/Category';
import Product from '../../src/models/Product';
import StoreSettings from '../../src/models/StoreSettings';
import Order from '../../src/models/Order';
import User from '../../src/models/User';
import Coupon from '../../src/models/Coupon';
import HomeBlock from '../../src/models/HomeBlock';
import { encryptMfaSecret } from '../../server/security/mfa';
import Subscription from '../../server/models/Subscription';
import Plan from '../../server/models/Plan';
import { manualBilling } from '../../server/services/billingService';
import AuditLog from '../../src/models/AuditLog';

let mongo: MongoMemoryReplSet | undefined;
const app = express();
app.use(requestContext, cookieParser(), express.json());
app.use('/api/public/stores/:slug', publicRouter);
app.use('/api/tenant/stores/:slug', tenantRouter);
app.use('/api/customer/stores/:slug/auth', customerAuthRouter);
app.use('/api/customer/stores/:slug', customerRouter);
app.use('/api/platform/auth', authRouter);
app.use('/api/master', masterRouter);
app.use('/api', notFound);
app.use(errorHandler);

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
});

afterEach(async () => {
  resetMemoryRateLimitsForTests();
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

function responseCookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'];
  return (Array.isArray(header) ? header : [header]).filter(Boolean);
}

function csrfFrom(cookies: string[]): string {
  return cookies.map((value) => value.split(';')[0]).find((value) => value.startsWith('delivery_csrf_customer='))!.split('=')[1];
}

async function registerCustomer(slug: string, phone: string, name = 'Cliente Teste') {
  const response = await request(app).post(`/api/customer/stores/${slug}/auth/register`).send({ name, phone, password: 'SenhaForte123', confirmPassword: 'SenhaForte123' }).expect(201);
  const cookies = responseCookies(response);
  expect(response.body.csrfToken).toBe(csrfFrom(cookies));
  return { response, cookies, csrf: csrfFrom(cookies) };
}

async function seed() {
  const tenantA = await Tenant.create({ legalName: 'A', displayName: 'Loja A', slug: 'loja-a', status: 'active', owner: { name: 'A', email: 'a@example.com' } });
  const tenantB = await Tenant.create({ legalName: 'B', displayName: 'Loja B', slug: 'loja-b', status: 'active', owner: { name: 'B', email: 'b@example.com' } });
  const categoryA = await Category.create({ tenantId: tenantA._id, nome: 'Categoria A', ordem: 1 });
  const categoryB = await Category.create({ tenantId: tenantB._id, nome: 'Categoria B', ordem: 1 });
  const productA = await Product.create({ tenantId: tenantA._id, categoriaId: categoryA._id, nome: 'Produto A', preco: 10, preco_centavos: 1000, ativo: true, controlar_estoque: true, estoque: 2 });
  await Product.create({ tenantId: tenantB._id, categoriaId: categoryB._id, nome: 'Produto B', preco: 90, preco_centavos: 9000, ativo: true });
  await StoreSettings.create({ tenantId: tenantA._id, nome_loja: 'Loja A', is_open: true, pedido_minimo: 0, pagamento_pix: true, logisticsOptions: { allowPickup: true } });
  await StoreSettings.create({ tenantId: tenantB._id, nome_loja: 'Loja B', is_open: true });
  return { tenantA, tenantB, productA };
}

async function tenantAdminCookie(tenantId: mongoose.Types.ObjectId) {
  const account = await AdminAccount.create({ name: 'Owner Teste', email: `owner-${tenantId}@example.com`, passwordHash: await bcrypt.hash('StrongPassword123', 12), active: true });
  await TenantMembership.create({ tenantId, accountId: account._id, role: 'tenant_owner', active: true });
  const session = await AuthSession.create({ accountType: 'admin', accountId: account._id, tenantId, refreshTokenHash: 'hash', tokenVersion: 0, expiresAt: new Date(Date.now() + 60_000) });
  const token = jwt.sign({ sid: session._id.toString(), sub: account._id.toString(), kind: 'admin', v: 0 }, process.env.JWT_SECRET!, { expiresIn: 60 });
  return [`delivery_session=${token}`, 'delivery_csrf=tenant-test-csrf'];
}

it.each([
  '/api/admin/produtos',
  '/api/produtos',
  '/api/categorias',
  '/api/pedidos',
  '/api/configuracoes/publica',
  '/api/blocos_home',
  '/api/geolocalizacao',
])('nao expoe o endpoint global legado %s', async (path) => {
  const response = await request(app).get(path).expect(404);
  expect(response.body.error.code).toBe('NOT_FOUND');
});

it('historico, relatorios e alertas de estoque respeitam o tenant e os snapshots do pedido', async () => {
  const { tenantA, tenantB, productA } = await seed();
  const cookie = await tenantAdminCookie(tenantA._id as mongoose.Types.ObjectId);
  await Product.findByIdAndUpdate(productA._id, { estoque: 1, estoque_minimo: 2 });
  const createdAt = new Date('2026-08-10T15:00:00.000Z');
  const deliveredAt = new Date('2026-08-10T15:30:00.000Z');
  const baseOrder = {
    cliente: { nome: 'Cliente Relatorio', telefone: '24999990000', endereco: 'Retirada' },
    itens: [{ produtoId: productA._id, nome: 'Produto Historico', categoria_nome: 'Categoria Historica', quantidade: 2, preco_unitario: 10, preco_unitario_centavos: 1000, subtotal: 20, subtotal_centavos: 2000 }],
    total: 20,
    total_centavos: 2000,
    frete: 0,
    frete_centavos: 0,
    metodo_pagamento: 'pix',
    tipo_entrega: 'pickup',
    createdAt,
  };
  await Order.create({ ...baseOrder, tenantId: tenantA._id, orderNumber: 101, status: 'Entregue', historico_status: [{ status: 'Pendente', data: createdAt }, { status: 'Preparando', data: new Date('2026-08-10T15:05:00.000Z') }, { status: 'Entregue', data: deliveredAt }] });
  await Order.create({ ...baseOrder, tenantId: tenantA._id, orderNumber: 102, status: 'Cancelado', metodo_pagamento: 'meal_voucher', cliente: { ...baseOrder.cliente, nome: 'Cliente Cancelado' } });
  await Order.create({ ...baseOrder, tenantId: tenantB._id, orderNumber: 101, status: 'Entregue', cliente: { ...baseOrder.cliente, nome: 'Outro Tenant' } });

  const history = await request(app).get('/api/tenant/stores/loja-a/orders/history?from=2026-08-10&to=2026-08-10&limit=1').set('Cookie', cookie).expect(200);
  expect(history.body.pagination).toMatchObject({ page: 1, limit: 1, total: 2, pages: 2 });
  const csv = await request(app).get('/api/tenant/stores/loja-a/orders/history/export.csv?from=2026-08-10&to=2026-08-10').set('Cookie', cookie).expect(200);
  expect(csv.text).toContain('Cliente Relatorio');
  expect(csv.text).toContain('Cliente Cancelado');
  expect(csv.text).toContain('Vale-refeição');
  expect(csv.text).not.toContain('meal_voucher');
  expect(csv.text).not.toContain('Outro Tenant');

  const summary = await request(app).get('/api/tenant/stores/loja-a/reports/summary?from=2026-08-10&to=2026-08-10').set('Cookie', cookie).expect(200);
  expect(summary.body.metrics).toMatchObject({ orders: 2, validOrders: 1, cancelled: 1, revenue: 20, averageOrder: 20 });
  expect(summary.body.payments).toEqual([expect.objectContaining({ method: 'pix', orders: 1, total: 20 })]);

  const products = await request(app).get('/api/tenant/stores/loja-a/reports/products?from=2026-08-10&to=2026-08-10').set('Cookie', cookie).expect(200);
  expect(products.body.products).toEqual([expect.objectContaining({ name: 'Produto Historico', category: 'Categoria Historica', units: 2, revenue: 20 })]);

  const operation = await request(app).get('/api/tenant/stores/loja-a/reports/operation?from=2026-08-10&to=2026-08-10').set('Cookie', cookie).expect(200);
  expect(operation.body.metrics).toMatchObject({ averageToPrepareMinutes: 5, averagePreparationMinutes: 25, averageTotalMinutes: 30, cancellationRate: 50 });

  const dashboard = await request(app).get('/api/tenant/stores/loja-a/dashboard').set('Cookie', cookie).expect(200);
  expect(dashboard.body.inventory.lowStockCount).toBe(1);
  expect(dashboard.body.inventory.lowStockProducts[0].nome).toBe('Produto A');
});

it('inteligencia comercial, comparativos e exportacoes permanecem isolados por tenant', async () => {
  const { tenantA, tenantB, productA } = await seed();
  const cookie = await tenantAdminCookie(tenantA._id as mongoose.Types.ObjectId);
  const customerA = await User.create({ tenantId: tenantA._id, nome: 'Cliente Valioso', telefone: '24999991111', normalizedPhone: '5524999991111', email: 'cliente@a.test', senha: 'hash', pontos: 80 });
  const customerB = await User.create({ tenantId: tenantB._id, nome: 'Cliente Outro Tenant', telefone: '24999992222', normalizedPhone: '5524999992222', senha: 'hash', pontos: 999 });
  await Coupon.create({ tenantId: tenantA._id, codigo: 'A10', normalizedCode: 'A10', tipo: 'porcentagem', valor: 10, usos_restantes: -1 });
  const item = { produtoId: productA._id, nome: 'Produto A', categoria_nome: 'Categoria A', quantidade: 1, preco_unitario: 18, preco_unitario_centavos: 1800, subtotal: 18, subtotal_centavos: 1800, resgatado: true, pontos_resgate: 100, valor_resgate_centavos: 1000 };
  const common = { cliente: { nome: 'Cliente Valioso', telefone: '24999991111', endereco: 'Retirada' }, itens: [item], total: 18, total_centavos: 1800, frete: 0, frete_centavos: 0, metodo_pagamento: 'pix', tipo_entrega: 'pickup', status: 'Entregue' };
  await Order.create({ ...common, tenantId: tenantA._id, usuarioId: customerA._id, orderNumber: 201, createdAt: new Date('2026-08-10T14:00:00Z'), cupom_codigo: 'A10', desconto_cupom: 2, pontos_creditados: 18, pontos_utilizados: 100 });
  await Order.create({ ...common, tenantId: tenantA._id, usuarioId: customerA._id, orderNumber: 200, createdAt: new Date('2026-08-09T14:00:00Z'), total: 10, total_centavos: 1000, itens: [{ ...item, subtotal: 10, subtotal_centavos: 1000, resgatado: false }] });
  await Order.create({ ...common, tenantId: tenantB._id, usuarioId: customerB._id, orderNumber: 201, createdAt: new Date('2026-08-10T14:00:00Z'), total: 999, total_centavos: 99900 });

  const customers = await request(app).get('/api/tenant/stores/loja-a/customers?from=2026-08-01&to=2026-08-10&segment=valuable').set('Cookie', cookie).expect(200);
  expect(customers.body.items).toHaveLength(1);
  expect(customers.body.items[0]).toMatchObject({ nome: 'Cliente Valioso', total_pedidos: 2, total_gasto: 28 });
  expect(customers.body.items[0]).not.toHaveProperty('senha');
  expect(customers.body.summary).toMatchObject({ buyers: 1, recurring: 1, newCustomers: 1 });

  const customerCsv = await request(app).get('/api/tenant/stores/loja-a/customers/export.csv?from=2026-08-01&to=2026-08-10').set('Cookie', cookie).expect(200);
  expect(customerCsv.text).toContain('Cliente Valioso');
  expect(customerCsv.text).not.toContain('Cliente Outro Tenant');
  expect(customerCsv.text).not.toContain('hash');

  const marketing = await request(app).get('/api/tenant/stores/loja-a/reports/marketing?from=2026-08-10&to=2026-08-10').set('Cookie', cookie).expect(200);
  expect(marketing.body.coupons[0].analytics).toMatchObject({ uses: 1, customers: 1, revenue: 18, discounts: 2 });
  expect(marketing.body.loyalty).toMatchObject({ pointsGenerated: 18, pointsRedeemed: 100, redemptions: 1, customersWithBalance: 1, customersWhoRedeemed: 1 });
  expect(marketing.body.loyalty.topRedeemedProducts[0]).toMatchObject({ name: 'Produto A', units: 1, points: 100, equivalentValue: 10 });

  const summary = await request(app).get('/api/tenant/stores/loja-a/reports/summary?from=2026-08-10&to=2026-08-10').set('Cookie', cookie).expect(200);
  expect(summary.body.previous).toMatchObject({ revenue: 10, validOrders: 1 });
  expect(summary.body.comparisons.revenue).toMatchObject({ state: 'available', favorable: true });

  const closingCsv = await request(app).get('/api/tenant/stores/loja-a/reports/summary/export.csv?from=2026-08-10&to=2026-08-10').set('Cookie', cookie).expect(200);
  expect(closingCsv.text).toContain('Faturamento');
  expect(closingCsv.text).not.toContain('999,00');
  const productsCsv = await request(app).get('/api/tenant/stores/loja-a/reports/products/export.csv?from=2026-08-10&to=2026-08-10').set('Cookie', cookie).expect(200);
  expect(productsCsv.text).toContain('Produto A');
  const couponCsv = await request(app).get('/api/tenant/stores/loja-a/reports/marketing/export.csv?from=2026-08-10&to=2026-08-10').set('Cookie', cookie).expect(200);
  expect(couponCsv.text).toContain('A10');
});

it('operacoes administrativas permanecem isoladas em todos os dominios tenant', async () => {
  const { tenantA, tenantB, productA } = await seed();
  const cookie = await tenantAdminCookie(tenantA._id as mongoose.Types.ObjectId);
  const mutate = (method: 'post' | 'put' | 'patch' | 'delete', path: string) => request(app)[method](path).set('Cookie', cookie).set('x-csrf-token', 'tenant-test-csrf');

  const products = await request(app).get('/api/tenant/stores/loja-a/products').set('Cookie', cookie).expect(200);
  expect(products.body.items.map((item: any) => item.nome)).toEqual(['Produto A']);
  const createdProduct = await mutate('post', '/api/tenant/stores/loja-a/products').send({ nome: 'Produto Novo', descricao: 'Somente A', preco: 12, categoriaId: null }).expect(201);
  expect(await Product.exists({ _id: createdProduct.body.product._id, tenantId: tenantB._id })).toBeNull();
  await mutate('put', `/api/tenant/stores/loja-a/products/${createdProduct.body.product._id}`).send({ descricao: 'Editado pela loja A', preco: 13 }).expect(200);
  await mutate('patch', `/api/tenant/stores/loja-a/products/${createdProduct.body.product._id}/toggle-active`).expect(200);
  await mutate('patch', `/api/tenant/stores/loja-a/products/${createdProduct.body.product._id}/toggle-sold-out`).expect(200);

  const category = await mutate('post', '/api/tenant/stores/loja-a/categories').send({ nome: 'Nova categoria', descricao: 'Tenant A' }).expect(201);
  const temporaryCategory = await mutate('post', '/api/tenant/stores/loja-a/categories').send({ nome: 'Categoria temporaria' }).expect(201);
  await mutate('put', `/api/tenant/stores/loja-a/categories/${temporaryCategory.body.category._id}`).send({ descricao: 'Atualizada' }).expect(200);
  await mutate('delete', `/api/tenant/stores/loja-a/categories/${temporaryCategory.body.category._id}`).expect(200);
  const structure = await request(app).get('/api/tenant/stores/loja-a/catalog/structure').set('Cookie', cookie).expect(200);
  await mutate('put', '/api/tenant/stores/loja-a/catalog/structure').send({
    categories: structure.body.categories.map((item: any, index: number) => ({ id: item._id, ordem: index })),
    productOrders: [...structure.body.categories.flatMap((item: any) => item.produtos), ...structure.body.uncategorized].map((item: any, index: number) => ({ id: item._id, ordem_categoria: index, destaque: false, categoriaId: category.body.category._id })),
  }).expect(200);
  expect(String((await Product.findById(productA._id).lean())?.categoriaId)).toBe(category.body.category._id);
  await mutate('delete', `/api/tenant/stores/loja-a/products/${createdProduct.body.product._id}`).send({ email: `owner-${tenantA._id}@example.com`, senha: 'StrongPassword123' }).expect(200);

  await mutate('put', '/api/tenant/stores/loja-a/settings').send({ nome_loja: 'Loja A Atualizada', is_open: false, pagamento_pix: true, chave_pix: 'pix@loja-a.test', cupom_global_ativo: true, theme: { primaryColor: '#2563EB' } }).expect(200);
  expect((await StoreSettings.findOne({ tenantId: tenantA._id }).lean())?.nome_loja).toBe('Loja A Atualizada');
  expect((await StoreSettings.findOne({ tenantId: tenantB._id }).lean())?.nome_loja).toBe('Loja B');
  const settings = await request(app).get('/api/tenant/stores/loja-a/settings').set('Cookie', cookie).expect(200);
  expect(settings.body.settings.chave_pix).toBe('pix@loja-a.test');
  const publicStore = await request(app).get('/api/public/stores/loja-a/store').expect(200);
  expect(publicStore.body.settings.chave_pix).toBe('pix@loja-a.test');
  expect(publicStore.body.settings.theme).toMatchObject({ primaryColor: '#2563EB', primaryTextColor: '#ffffff' });
  expect(publicStore.body.settings.theme.primaryHoverColor).not.toBe('#047857');

  const homeBlock = await mutate('post', '/api/tenant/stores/loja-a/home-blocks').send({ titulo: 'Bloco A', descricao: 'Somente A', tipo_bloco: 'texto' }).expect(201);
  await mutate('put', `/api/tenant/stores/loja-a/home-blocks/${homeBlock.body.block._id}`).send({ titulo: 'Bloco A atualizado' }).expect(200);
  await mutate('put', '/api/tenant/stores/loja-a/home-blocks/reorder').send({ updates: [{ id: homeBlock.body.block._id, ordem: 3, ativo: true }] }).expect(200);
  expect(await HomeBlock.countDocuments({ tenantId: tenantA._id })).toBe(1);
  expect(await HomeBlock.countDocuments({ tenantId: tenantB._id })).toBe(0);
  await mutate('delete', `/api/tenant/stores/loja-a/home-blocks/${homeBlock.body.block._id}`).expect(200);

  const customerA = await User.create({ tenantId: tenantA._id, nome: 'Cliente A', telefone: '24999990001', normalizedPhone: '5524999990001', senha: 'hash', pontos: 2 });
  const customerB = await User.create({ tenantId: tenantB._id, nome: 'Cliente B', telefone: '24999990002', normalizedPhone: '5524999990002', senha: 'hash', pontos: 9 });
  await mutate('patch', `/api/tenant/stores/loja-a/customers/${customerA._id}/points`).send({ pontos: 25, reason: 'Ajuste de teste auditado' }).expect(200);
  await mutate('patch', `/api/tenant/stores/loja-a/customers/${customerB._id}/points`).send({ pontos: 30, reason: 'Tentativa entre lojas' }).expect(404);
  expect((await User.findById(customerB._id).lean())?.pontos).toBe(9);
  const customers = await request(app).get('/api/tenant/stores/loja-a/customers').set('Cookie', cookie).expect(200);
  expect(customers.body.items.map((item: any) => item.nome)).toEqual(['Cliente A']);

  const coupon = await mutate('post', '/api/tenant/stores/loja-a/coupons').send({ codigo: 'A10', tipo: 'porcentagem', valor: 10, minimo_pedido: 0, usos_restantes: -1 }).expect(201);
  expect(await Coupon.countDocuments({ tenantId: tenantA._id })).toBe(1);
  expect(await Coupon.countDocuments({ tenantId: tenantB._id })).toBe(0);
  const coupons = await request(app).get('/api/tenant/stores/loja-a/coupons').set('Cookie', cookie).expect(200);
  expect(coupons.body.items).toHaveLength(1);
  await mutate('delete', `/api/tenant/stores/loja-a/coupons/${coupon.body.coupon._id}`).expect(200);

  const orderA = await Order.create({ tenantId: tenantA._id, cliente: { nome: 'Cliente A', telefone: '24999990001', endereco: 'Retirada' }, itens: [{ produtoId: productA._id, nome: 'Produto A', quantidade: 1, preco_unitario: 10, subtotal: 10 }], total: 10, metodo_pagamento: 'pix', tipo_entrega: 'pickup' });
  const productB = await Product.findOne({ tenantId: tenantB._id });
  const orderB = await Order.create({ tenantId: tenantB._id, cliente: { nome: 'Cliente B', telefone: '24999990002', endereco: 'Retirada' }, itens: [{ produtoId: productB!._id, nome: 'Produto B', quantidade: 1, preco_unitario: 90, subtotal: 90 }], total: 90, metodo_pagamento: 'pix', tipo_entrega: 'pickup' });
  const orders = await request(app).get('/api/tenant/stores/loja-a/orders').set('Cookie', cookie).expect(200);
  expect(orders.body.items.map((item: any) => item._id)).toEqual([orderA._id.toString()]);
  await mutate('patch', `/api/tenant/stores/loja-a/orders/${orderA._id}/status`).send({ status: 'Preparando' }).expect(200);
  await mutate('patch', `/api/tenant/stores/loja-a/orders/${orderB._id}/status`).send({ status: 'Preparando' }).expect(404);
  const dashboard = await request(app).get('/api/tenant/stores/loja-a/dashboard').set('Cookie', cookie).expect(200);
  expect(dashboard.body.metrics.orders).toBe(1);
  const session = await request(app).get('/api/tenant/stores/loja-a/me').set('Cookie', cookie).expect(200);
  expect(session.body.tenant.slug).toBe('loja-a');

  const audit = await request(app).get('/api/tenant/stores/loja-a/audit').set('Cookie', cookie).expect(200);
  expect(audit.body.items.length).toBeGreaterThan(0);
  expect(await AuditLog.countDocuments({ tenantId: tenantB._id })).toBe(0);
});

it('catalogo publico nunca mistura tenants', async () => {
  await seed();
  const responseA = await request(app).get('/api/public/stores/loja-a/catalog').expect(200);
  const responseB = await request(app).get('/api/public/stores/loja-b/catalog').expect(200);
  expect(responseA.body.products.map((item: any) => item.nome)).toEqual(['Produto A']);
  expect(responseB.body.products.map((item: any) => item.nome)).toEqual(['Produto B']);
});

it('permite que o mesmo telefone tenha uma conta independente em cada loja', async () => {
  const { tenantA, tenantB } = await seed();
  await registerCustomer('loja-a', '24999997604', 'Cliente da Loja A');
  await registerCustomer('loja-b', '24999997604', 'Cliente da Loja B');

  const accounts = await User.find({ normalizedPhone: '+5524999997604' }).sort({ nome: 1 }).lean();
  expect(accounts).toHaveLength(2);
  expect(accounts.map((account) => String(account.tenantId)).sort()).toEqual([String(tenantA._id), String(tenantB._id)].sort());
});

it('admin da loja A recebe 403 ao consultar loja B', async () => {
  const { tenantA } = await seed();
  const account = await AdminAccount.create({ name: 'Admin A', email: 'admin-a@example.com', passwordHash: 'hash', active: true });
  await TenantMembership.create({ tenantId: tenantA._id, accountId: account._id, role: 'tenant_owner', active: true });
  const session = await AuthSession.create({ accountType: 'admin', accountId: account._id, tenantId: tenantA._id, refreshTokenHash: 'hash', expiresAt: new Date(Date.now() + 60_000) });
  const token = jwt.sign({ sid: session._id.toString(), sub: account._id.toString(), kind: 'admin', v: 0 }, process.env.JWT_SECRET!, { expiresIn: 60 });
  await request(app).get('/api/tenant/stores/loja-b/catalog').set('Cookie', `delivery_session=${token}`).expect(403);
});

it('recalcula preco, protege estoque, idempotencia e rastreio sem PII', async () => {
  const { productA } = await seed();
  const registration = await request(app).post('/api/customer/stores/loja-a/auth/register').send({ name: 'Cliente', phone: '24999999999', password: 'SenhaForte123', confirmPassword: 'SenhaForte123' }).expect(201);
  const cookies = Array.isArray(registration.headers['set-cookie']) ? registration.headers['set-cookie'] : [registration.headers['set-cookie']];
  const csrf = cookies.map((value: string) => value.split(';')[0]).find((value: string) => value.startsWith('delivery_csrf_customer='))!.split('=')[1];
  const payload = { items: [{ productId: productA._id.toString(), quantity: 1, options: [], price: 1 }], deliveryType: 'pickup', paymentMethod: 'pix' };
  const key = '1234567890abcdef';
  const create = () => request(app).post('/api/customer/stores/loja-a/orders').set('Cookie', cookies).set('x-csrf-token', csrf).set('Idempotency-Key', key).send(payload);
  const first = await create().expect(201);
  expect(first.body.totalCents).toBe(1000);
  const repeated = await create().expect(201);
  expect(repeated.body.orderId).toBe(first.body.orderId);
  const tracking = await request(app).get(`/api/customer/stores/loja-a/tracking/${first.body.trackingToken}`).expect(200);
  expect(JSON.stringify(tracking.body)).not.toContain('24999999999');
  expect(JSON.stringify(tracking.body)).not.toContain('Cliente');
  const product = await Product.findById(productA._id).lean();
  expect(product?.estoque).toBe(1);
  expect((await Order.findById(first.body.orderId).lean())?.usuarioId).toBeTruthy();
});

it('identifica cadastro ou login sem expor PII e mantem contas isoladas por tenant', async () => {
  await seed();
  const missing = await request(app).post('/api/customer/stores/loja-a/auth/identify').send({ phone: '24999991111' }).expect(200);
  expect(missing.body.needsRegistration).toBe(true);
  expect(missing.body.phone).toBe('24999991111');

  // Registrar cliente via registerFast
  const registered = await request(app).post('/api/customer/stores/loja-a/auth/register-fast').send({ name: 'Jeferson Lima', phone: '24999991111', nascimento: '24/02/1994' }).expect(201);
  expect(registered.body.authenticated).toBe(true);
  expect(registered.body.user.nome).toBe('Jeferson Lima');
  expect(registered.body.user.hasPassword).toBe(false);

  // Agora identify deve reconhecer o usuario cadastrado
  const existing = await request(app).post('/api/customer/stores/loja-a/auth/identify').send({ phone: '24999991111' }).expect(200);
  expect(existing.body.authenticated).toBe(true);
  expect(existing.body.user).toHaveProperty('telefone');
  expect(existing.body.user).not.toHaveProperty('senha');
});

it('limita a sessao identificada e conclui recuperacao manual com link de uso unico', async () => {
  const { tenantA } = await seed();
  await registerCustomer('loja-a', '24999991112', 'Cliente Recuperacao');
  await User.updateOne(
    { tenantId: tenantA._id, normalizedPhone: '+5524999991112' },
    { $set: { email: 'privado@example.com', pontos: 80, enderecos: [{ titulo: 'Casa', logradouro: 'Rua Privada', numero: '12', bairro: 'Centro', cidade: 'Resende', estado: 'RJ', cep: '27500000', padrao: true }] } },
  );

  const identified = await request(app).post('/api/customer/stores/loja-a/auth/identify').send({ phone: '24999991112' }).expect(200);
  const customerCookies = responseCookies(identified);
  const customerCsrf = csrfFrom(customerCookies);
  expect(identified.body).toMatchObject({ authenticated: true, passwordVerified: false });
  expect(identified.body.user).toMatchObject({ nome: 'Cliente Recuperacao', pontos: 0, enderecos: [] });
  expect(identified.body.user.email).toBe('');
  await request(app).get('/api/customer/stores/loja-a/me/orders').set('Cookie', customerCookies).expect(403)
    .expect((response) => expect(response.body.error.code).toBe('PASSWORD_VERIFICATION_REQUIRED'));

  const requested = await request(app).post('/api/customer/stores/loja-a/auth/password/manual/request')
    .set('Cookie', customerCookies).set('x-csrf-token', customerCsrf).send({}).expect(202);
  expect(requested.body.request.reference).toMatch(/^REC-[A-F0-9]{8}$/);

  const adminCookies = await tenantAdminCookie(tenantA._id as mongoose.Types.ObjectId);
  const pending = await request(app).get('/api/tenant/stores/loja-a/customers/password-recoveries').set('Cookie', adminCookies).expect(200);
  expect(pending.body.items).toHaveLength(1);
  expect(pending.body.items[0].reference).toBe(requested.body.request.reference);

  const approved = await request(app).post(`/api/tenant/stores/loja-a/customers/password-recoveries/${pending.body.items[0].id}/approve`)
    .set('Cookie', adminCookies).set('x-csrf-token', 'tenant-test-csrf').send({}).expect(200);
  const resetUrl = new URL(approved.body.recovery.resetUrl);
  const resetToken = resetUrl.pathname.split('/').at(-1)!;
  expect(resetUrl.pathname).toContain('/loja-a/recuperar-senha/');

  await request(app).get(`/api/customer/stores/loja-a/auth/password/manual/${resetToken}`).expect(200)
    .expect((response) => expect(response.body.request.reference).toBe(requested.body.request.reference));
  await request(app).post(`/api/customer/stores/loja-a/auth/password/manual/${resetToken}`)
    .send({ newPassword: 'NovaSenhaForte456', confirmPassword: 'NovaSenhaForte456' }).expect(200);
  await request(app).post(`/api/customer/stores/loja-a/auth/password/manual/${resetToken}`)
    .send({ newPassword: 'OutraSenhaForte789', confirmPassword: 'OutraSenhaForte789' }).expect(400);
  await request(app).post('/api/customer/stores/loja-a/auth/login').send({ phone: '24999991112', password: 'SenhaForte123' }).expect(401);
  await request(app).post('/api/customer/stores/loja-a/auth/login').send({ phone: '24999991112', password: 'NovaSenhaForte456' }).expect(200);
});

it('sessao anonima e contrato de autenticacao nao devolvem erro nem senha', async () => {
  await seed();
  const anonymous = await request(app).get('/api/customer/stores/loja-a/auth/session').expect(200);
  expect(anonymous.body).toMatchObject({ authenticated: false, user: null });
  expect(JSON.stringify(anonymous.body)).not.toContain('senha');
});

it('valida telefone, duplicidade e permite a mesma identidade em tenants distintos', async () => {
  await seed();
  const invalid = await request(app).post('/api/customer/stores/loja-a/auth/identify').send({ phone: '123' }).expect(400);
  expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  await registerCustomer('loja-a', '24999992222');
  const duplicate = await request(app).post('/api/customer/stores/loja-a/auth/register').send({ name: 'Duplicado', phone: '24999992222', password: 'SenhaForte123', confirmPassword: 'SenhaForte123' }).expect(409);
  expect(duplicate.body.error.code).toBe('ACCOUNT_EXISTS');
  await registerCustomer('loja-b', '24999992222');
  expect(await User.countDocuments({ telefone: '24999992222' })).toBe(2);
});

it('login e sessao sao tenant-scoped e nunca retornam o hash', async () => {
  const { tenantA } = await seed();
  await registerCustomer('loja-a', '24999993333', 'Pessoa Completa');
  await User.create({ tenantId: tenantA._id, nome: 'Conta Legada', telefone: '24999993334', normalizedPhone: '+5524999993334', senha: await bcrypt.hash('senha-antiga', 12) });
  await request(app).post('/api/customer/stores/loja-a/auth/login').send({ phone: '24999993334', password: 'senha-antiga' }).expect(200);
  await request(app).post('/api/customer/stores/loja-a/auth/login').send({ phone: '24999993333', password: 'SenhaErrada123' }).expect(401);
  const login = await request(app).post('/api/customer/stores/loja-a/auth/login').send({ phone: '24999993333', password: 'SenhaForte123' }).expect(200);
  const cookies = responseCookies(login);
  const own = await request(app).get('/api/customer/stores/loja-a/auth/session').set('Cookie', cookies).expect(200);
  expect(own.body.authenticated).toBe(true);
  expect(own.body.csrfToken).toBe(csrfFrom(cookies));
  expect(own.body.user).toMatchObject({ nome: 'Pessoa Completa', email: '', pontos: 0 });
  expect(JSON.stringify(own.body)).not.toContain('senha');
  const foreign = await request(app).get('/api/customer/stores/loja-b/auth/session').set('Cookie', cookies).expect(200);
  expect(foreign.body).toMatchObject({ authenticated: false, user: null });
});

it('sessoes de administrador e cliente coexistem no mesmo navegador', async () => {
  const { tenantA } = await seed();
  const adminCookies = await tenantAdminCookie(tenantA._id as mongoose.Types.ObjectId);
  const customer = await registerCustomer('loja-a', '24999993335');
  const combinedCookies = [...adminCookies, ...customer.cookies];

  const account = await request(app).get('/api/customer/stores/loja-a/me').set('Cookie', combinedCookies).expect(200);
  expect(account.body.user.telefone).toBe('24999993335');
  await request(app).post('/api/customer/stores/loja-a/me/addresses')
    .set('Cookie', combinedCookies)
    .set('x-csrf-token', customer.csrf)
    .send({ titulo: 'Casa', logradouro: 'Rua da Torre', numero: '12', bairro: 'Novo Surubi', cidade: 'Resende', estado: 'RJ', cep: '27512112' })
    .expect(201);
  await request(app).get('/api/tenant/stores/loja-a/products').set('Cookie', combinedCookies).expect(200);
});

it('perfil, enderecos, padrao e logout exigem sessao e CSRF validos', async () => {
  await seed();
  const auth = await registerCustomer('loja-a', '24999994444');
  await request(app).put('/api/customer/stores/loja-a/auth/profile').set('Cookie', auth.cookies).send({ nome: 'Sem CSRF' }).expect(403);
  const profile = await request(app).put('/api/customer/stores/loja-a/auth/profile').set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf).send({ nome: 'Cliente Atualizado', email: 'cliente@example.com', nascimento: '2000-01-01', genero: 'nao-informado' }).expect(200);
  expect(profile.body.user.email).toBe('cliente@example.com');
  expect(profile.body.user.nascimento).toBe('2000-01-01');
  await request(app).put('/api/customer/stores/loja-a/auth/profile').set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf).send({ nome: 'Cliente Atualizado', nascimento: '31/02/2000' }).expect(400);
  const first = await request(app).post('/api/customer/stores/loja-a/me/addresses').set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf).send({ titulo: 'Casa', logradouro: 'Rua A', numero: '10', complemento: '', referencia: 'Portao verde', bairro: 'Centro', cidade: 'Resende', estado: 'RJ', cep: '27500-000', padrao: true }).expect(201);
  const firstId = first.body.user.enderecos[0].id;
  const second = await request(app).post('/api/customer/stores/loja-a/me/addresses').set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf).send({ titulo: 'Trabalho', logradouro: 'Rua B', numero: '20', bairro: 'Centro', cidade: 'Resende', estado: 'RJ', cep: '27500001' }).expect(201);
  const secondId = second.body.user.enderecos[1].id;
  const changed = await request(app).patch(`/api/customer/stores/loja-a/me/addresses/${secondId}/default`).set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf).expect(200);
  expect(changed.body.user.enderecos.find((item: any) => item.id === secondId).padrao).toBe(true);
  expect(changed.body.user.enderecos.find((item: any) => item.id === firstId).padrao).toBe(false);
  await request(app).delete(`/api/customer/stores/loja-a/me/addresses/${firstId}`).set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf).expect(200);
  await request(app).post('/api/customer/stores/loja-a/auth/logout').set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf).expect(200);
  await request(app).get('/api/customer/stores/loja-a/me').set('Cookie', auth.cookies).expect(401);
});

it('troca de senha revoga a sessao e exige a nova credencial', async () => {
  await seed();
  const auth = await registerCustomer('loja-a', '24999994445');
  await request(app).put('/api/customer/stores/loja-a/auth/password').set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf).send({ currentPassword: 'SenhaErrada123', newPassword: 'NovaSenhaForte123' }).expect(400);
  const changed = await request(app).put('/api/customer/stores/loja-a/auth/password').set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf).send({ currentPassword: 'SenhaForte123', newPassword: 'NovaSenhaForte123' }).expect(200);
  expect(changed.body.reauthenticationRequired).toBe(true);
  await request(app).get('/api/customer/stores/loja-a/me').set('Cookie', auth.cookies).expect(401);
  await request(app).post('/api/customer/stores/loja-a/auth/login').send({ phone: '24999994445', password: 'SenhaForte123' }).expect(401);
  await request(app).post('/api/customer/stores/loja-a/auth/login').send({ phone: '24999994445', password: 'NovaSenhaForte123' }).expect(200);
});

it('recuperacao informa indisponibilidade quando nao existe provedor OTP', async () => {
  await seed();
  const response = await request(app).post('/api/customer/stores/loja-a/auth/password/request').send({ phone: '24999994446' }).expect(503);
  expect(response.body.error.code).toBe('OTP_UNAVAILABLE');
});

it('enderecos e padrao permanecem isolados entre lojas', async () => {
  await seed();
  const authA = await registerCustomer('loja-a', '24999994447');
  const authB = await registerCustomer('loja-b', '24999994447');
  await request(app).post('/api/customer/stores/loja-a/me/addresses').set('Cookie', authA.cookies).set('x-csrf-token', authA.csrf).send({ titulo: 'Casa A', logradouro: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Resende', estado: 'RJ', cep: '27500000', padrao: true }).expect(201);
  const own = await request(app).get('/api/customer/stores/loja-a/me/addresses').set('Cookie', authA.cookies).expect(200);
  const foreign = await request(app).get('/api/customer/stores/loja-b/me/addresses').set('Cookie', authB.cookies).expect(200);
  expect(own.body.items.map((item: any) => item.titulo)).toEqual(['Casa A']);
  expect(foreign.body.items).toEqual([]);
});

it('cupom e historico nao atravessam tenant nem cliente', async () => {
  const { tenantA, tenantB, productA } = await seed();
  const authA = await registerCustomer('loja-a', '24999995555', 'Cliente A');
  const userA = await User.findOne({ tenantId: tenantA._id, telefone: '24999995555' });
  const userB = await User.create({ tenantId: tenantA._id, nome: 'Cliente B', telefone: '24999996666', normalizedPhone: '5524999996666', senha: await bcrypt.hash('SenhaForte123', 12) });
  await Coupon.create({ tenantId: tenantA._id, codigo: 'A10', normalizedCode: 'A10', tipo: 'porcentagem', valor: 10, minimo_pedido: 0, usos_restantes: -1, ativo: true });
  await Coupon.create({ tenantId: tenantB._id, codigo: 'B10', normalizedCode: 'B10', tipo: 'porcentagem', valor: 10, minimo_pedido: 0, usos_restantes: -1, ativo: true });
  await request(app).post('/api/customer/stores/loja-a/coupon/preview').set('Cookie', authA.cookies).set('x-csrf-token', authA.csrf).send({ code: 'B10', subtotalCents: 1000 }).expect(409);
  const coupon = await request(app).post('/api/customer/stores/loja-a/coupon/preview').set('Cookie', authA.cookies).set('x-csrf-token', authA.csrf).send({ code: 'A10', subtotalCents: 1000 }).expect(200);
  expect(coupon.body.coupon.discountCents).toBe(100);
  const ownOrder = await Order.create({ tenantId: tenantA._id, usuarioId: userA!._id, orderNumber: 11, cliente: { nome: 'Cliente A', telefone: '24999995555', endereco: 'Retirada' }, itens: [{ produtoId: productA._id, nome: 'Produto A', quantidade: 1, preco_unitario: 10, subtotal: 10 }], total: 10, total_centavos: 1000, metodo_pagamento: 'pix', tipo_entrega: 'pickup', status: 'Pendente' });
  const foreignOrder = await Order.create({ tenantId: tenantA._id, usuarioId: userB._id, orderNumber: 12, cliente: { nome: 'Cliente B', telefone: '24999996666', endereco: 'Retirada' }, itens: [{ produtoId: productA._id, nome: 'Produto A', quantidade: 1, preco_unitario: 10, subtotal: 10 }], total: 10, total_centavos: 1000, metodo_pagamento: 'pix', tipo_entrega: 'pickup', status: 'Entregue' });
  const active = await request(app).get('/api/customer/stores/loja-a/me/orders?state=active&page=1&limit=10').set('Cookie', authA.cookies).expect(200);
  expect(active.body.items.map((item: any) => item.id)).toEqual([ownOrder._id.toString()]);
  await request(app).get(`/api/customer/stores/loja-a/me/orders/${foreignOrder._id}`).set('Cookie', authA.cookies).expect(404);
  await request(app).post('/api/customer/stores/loja-a/orders').set('Idempotency-Key', 'anonymous-order-01').send({ items: [], deliveryType: 'pickup', paymentMethod: 'pix' }).expect(401);
});

it('permite avaliar apenas pedido entregue, proprio e dentro de 15 dias', async () => {
  const { tenantA, productA } = await seed();
  const auth = await registerCustomer('loja-a', '24999997777', 'Cliente Avaliador');
  const user = await User.findOne({ tenantId: tenantA._id, telefone: '24999997777' });
  const deliveredAt = new Date(Date.now() - 24 * 60 * 60_000);
  const order = await Order.create({
    tenantId: tenantA._id, usuarioId: user!._id, orderNumber: 77,
    cliente: { nome: 'Cliente Avaliador', telefone: '24999997777', endereco: 'Retirada' },
    itens: [{ produtoId: productA._id, nome: 'Produto A', quantidade: 1, preco_unitario: 10, subtotal: 10 }],
    total: 10, total_centavos: 1000, metodo_pagamento: 'pix', tipo_entrega: 'pickup', status: 'Entregue',
    historico_status: [{ status: 'Entregue', data: deliveredAt }],
  });

  const listed = await request(app).get('/api/customer/stores/loja-a/me/orders?state=completed').set('Cookie', auth.cookies).expect(200);
  expect(listed.body.items[0]).toMatchObject({ id: order._id.toString(), canReview: true, review: null });

  const reviewed = await request(app).post(`/api/customer/stores/loja-a/me/orders/${order._id}/review`)
    .set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf)
    .send({ score: 5, comment: 'Pedido excelente.' }).expect(201);
  expect(reviewed.body.order).toMatchObject({ canReview: false, review: { score: 5, comment: 'Pedido excelente.' } });
  expect((await Order.findById(order._id).lean())?.avaliacao).toMatchObject({ nota: 5, comentario: 'Pedido excelente.' });

  await request(app).post(`/api/customer/stores/loja-a/me/orders/${order._id}/review`)
    .set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf)
    .send({ score: 4, comment: '' }).expect(409);

  const expiredAt = new Date(Date.now() - 16 * 24 * 60 * 60_000);
  const expired = await Order.create({
    tenantId: tenantA._id, usuarioId: user!._id, orderNumber: 78,
    cliente: { nome: 'Cliente Avaliador', telefone: '24999997777', endereco: 'Retirada' },
    itens: [{ produtoId: productA._id, nome: 'Produto A', quantidade: 1, preco_unitario: 10, subtotal: 10 }],
    total: 10, metodo_pagamento: 'pix', tipo_entrega: 'pickup', status: 'Entregue', historico_status: [{ status: 'Entregue', data: expiredAt }],
  });
  const expiredResponse = await request(app).post(`/api/customer/stores/loja-a/me/orders/${expired._id}/review`)
    .set('Cookie', auth.cookies).set('x-csrf-token', auth.csrf)
    .send({ score: 5, comment: '' }).expect(409);
  expect(expiredResponse.body.error.code).toBe('REVIEW_WINDOW_EXPIRED');
});

it('codigo de recuperacao MFA e de uso unico e libera Master somente na sessao verificada', async () => {
  const recoveryCode = 'a1b2c3d4e5f6';
  await AdminAccount.create({
    name: 'Master', email: 'master@example.com', passwordHash: await bcrypt.hash('StrongPassword123', 12),
    active: true, platformRole: 'platform_super_admin',
    mfa: { enabled: true, secretEncrypted: encryptMfaSecret('JBSWY3DPEHPK3PXP'), recoveryCodeHashes: [await bcrypt.hash(recoveryCode, 12)] },
  });
  const login = await request(app).post('/api/platform/auth/admin/login').send({
    email: 'master@example.com', password: 'StrongPassword123', recoveryCode,
  }).expect(200);
  const cookies = login.headers['set-cookie'];
  await request(app).get('/api/master/tenants').set('Cookie', cookies).expect(200);
  await request(app).post('/api/platform/auth/admin/login').send({
    email: 'master@example.com', password: 'StrongPassword123', recoveryCode,
  }).expect(401);
});

it('renova silenciosamente a sessao administrativa e estende sua janela de atividade', async () => {
  const { tenantA } = await seed();
  const account = await AdminAccount.create({ name: 'Operador', email: 'operador@example.com', passwordHash: await bcrypt.hash('StrongPassword123', 12), active: true });
  await TenantMembership.create({ tenantId: tenantA._id, accountId: account._id, role: 'tenant_owner', active: true });
  const login = await request(app).post('/api/platform/auth/admin/login').send({
    email: 'operador@example.com', password: 'StrongPassword123', slug: 'loja-a',
  }).expect(200);
  const cookies = responseCookies(login);
  const csrf = cookies.map((value) => value.split(';')[0]).find((value) => value.startsWith('delivery_csrf='))!.split('=')[1];
  expect(login.body.csrfToken).toBe(csrf);
  const sessionBefore = await AuthSession.findOne({ accountId: account._id }).lean();

  const refreshed = await request(app).post('/api/platform/auth/refresh')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrf)
    .expect(200);

  expect(refreshed.body.csrfToken).toEqual(expect.any(String));
  expect(refreshed.body.csrfToken).not.toBe(csrf);
  const sessionAfter = await AuthSession.findById(sessionBefore!._id).lean();
  expect(sessionAfter!.lastUsedAt.getTime()).toBeGreaterThanOrEqual(sessionBefore!.lastUsedAt.getTime());
  expect(sessionAfter!.expiresAt.getTime()).toBeGreaterThanOrEqual(sessionBefore!.expiresAt.getTime());
});

it('billing manual cria, confirma e estorna fatura sem confiar no navegador', async () => {
  const tenant = await Tenant.create({ legalName: 'Billing', displayName: 'Billing', slug: 'billing', status: 'active', owner: { name: 'Owner', email: 'owner@example.com' } });
  const plan = await Plan.create({ name: 'Pro', code: 'pro', priceCents: 9900, interval: 'monthly' });
  const subscription = await Subscription.create({ tenantId: tenant._id, planId: plan._id, status: 'past_due', provider: 'manual' });
  const actorId = new mongoose.Types.ObjectId();
  const invoice = await manualBilling.createInvoice({
    tenantId: tenant._id as mongoose.Types.ObjectId,
    subscriptionId: subscription._id as mongoose.Types.ObjectId,
    amountCents: 9900,
    dueAt: new Date(),
  });
  const paid = await manualBilling.markPaid(invoice._id.toString(), actorId, 'Pagamento confirmado manualmente');
  expect(paid.status).toBe('paid');
  const refunded = await manualBilling.refundInvoice(invoice._id.toString(), actorId, 'Estorno solicitado e validado');
  expect(refunded.status).toBe('refunded');
  expect((await Subscription.findById(subscription._id).lean())?.status).toBe('past_due');
});

it('Master entrega dashboard, listas, detalhe, financeiro, atividade e relatorios tipados', async () => {
  const recoveryCode = 'feedface1234';
  const account = await AdminAccount.create({
    name: 'Master', email: 'master-dashboard@example.com', passwordHash: await bcrypt.hash('StrongPassword123', 12),
    active: true, platformRole: 'platform_super_admin',
    mfa: { enabled: true, secretEncrypted: encryptMfaSecret('JBSWY3DPEHPK3PXP'), recoveryCodeHashes: [await bcrypt.hash(recoveryCode, 12)] },
  });
  const tenant = await Tenant.create({ legalName: 'Operacao Teste', displayName: 'Loja Métrica', slug: 'loja-metrica', status: 'active', owner: { name: 'Responsavel', email: 'owner@metrica.test' } });
  const plan = await Plan.create({ name: 'Profissional', code: 'profissional', priceCents: 12990, interval: 'monthly', active: true, trialDays: 7 });
  const subscription = await Subscription.create({ tenantId: tenant._id, planId: plan._id, status: 'active', provider: 'manual', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) });
  tenant.planId = plan._id; tenant.subscriptionId = subscription._id; await tenant.save();
  await manualBilling.createInvoice({ tenantId: tenant._id as mongoose.Types.ObjectId, subscriptionId: subscription._id as mongoose.Types.ObjectId, amountCents: 12990, dueAt: new Date(Date.now() + 5 * 86_400_000) });
  await AuditLog.create({ tenantId: tenant._id, adminId: account._id.toString(), acao: 'TENANT_UPDATED', detalhes: 'Loja atualizada', tabela: 'Tenant', targetType: 'Tenant', documentoId: tenant._id.toString() });
  const login = await request(app).post('/api/platform/auth/admin/login').send({ email: 'master-dashboard@example.com', password: 'StrongPassword123', recoveryCode }).expect(200);
  const cookies = login.headers['set-cookie'];

  const dashboard = await request(app).get('/api/master/dashboard?from=2020-01-01&to=2030-12-31').set('Cookie', cookies).expect(200);
  expect(dashboard.body.kpis.totalTenants).toBe(1);
  expect(dashboard.body.kpis.mrrCents).toBe(12990);
  const tenants = await request(app).get('/api/master/tenants?search=Métrica&page=1&limit=10').set('Cookie', cookies).expect(200);
  expect(tenants.body.items[0].slug).toBe('loja-metrica');
  expect(tenants.body.pagination.total).toBe(1);
  const detail = await request(app).get(`/api/master/tenants/${tenant._id}?from=2020-01-01&to=2030-12-31`).set('Cookie', cookies).expect(200);
  expect(detail.body.subscription.planId.name).toBe('Profissional');
  expect(detail.body.activities[0].action).toBe('TENANT_UPDATED');
  const [plans, subscriptions, invoices, activity, report, planReport, mrrReport, inactiveReport, settings, search] = await Promise.all([
    request(app).get('/api/master/plans?limit=10').set('Cookie', cookies).expect(200),
    request(app).get('/api/master/subscriptions?limit=10').set('Cookie', cookies).expect(200),
    request(app).get('/api/master/invoices?limit=10').set('Cookie', cookies).expect(200),
    request(app).get('/api/master/activity?limit=10').set('Cookie', cookies).expect(200),
    request(app).get('/api/master/reports/tenant-status').set('Cookie', cookies).expect(200),
    request(app).get('/api/master/reports/tenant-plan').set('Cookie', cookies).expect(200),
    request(app).get('/api/master/reports/mrr-by-plan').set('Cookie', cookies).expect(200),
    request(app).get('/api/master/reports/inactive-stores?from=2020-01-01&to=2030-12-31').set('Cookie', cookies).expect(200),
    request(app).get('/api/master/settings').set('Cookie', cookies).expect(200),
    request(app).get('/api/master/search?q=metrica').set('Cookie', cookies).expect(200),
  ]);
  expect(plans.body.items).toHaveLength(1);
  expect(subscriptions.body.items[0].plan.name).toBe('Profissional');
  expect(invoices.body.items[0].amountCents).toBe(12990);
  expect(activity.body.items[0].action).toBe('TENANT_UPDATED');
  expect(report.body.items[0].value).toBe(1);
  expect(planReport.body.items[0]._id.plan).toBe('Profissional');
  expect(mrrReport.body.items[0].cents).toBe(12990);
  expect(inactiveReport.body.items[0].displayName).toBe('Loja Métrica');
  expect(settings.body.settings.currency).toBe('BRL');
  expect(search.body.groups.tenants[0].slug).toBe('loja-metrica');
});
