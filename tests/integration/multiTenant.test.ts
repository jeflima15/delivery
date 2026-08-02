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
import authRouter from '../../server/routes/auth';
import masterRouter from '../../server/routes/master';
import { errorHandler } from '../../server/middleware/errors';
import { requestContext } from '../../server/middleware/requestContext';
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

let mongo: MongoMemoryReplSet;
const app = express();
app.use(requestContext, cookieParser(), express.json());
app.use('/api/public/stores/:slug', publicRouter);
app.use('/api/tenant/stores/:slug', tenantRouter);
app.use('/api/customer/stores/:slug', customerRouter);
app.use('/api/platform/auth', authRouter);
app.use('/api/master', masterRouter);
app.use(errorHandler);

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
});

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

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

  await mutate('put', '/api/tenant/stores/loja-a/settings').send({ nome_loja: 'Loja A Atualizada', is_open: false, pagamento_pix: true, chave_pix: 'pix@loja-a.test', cupom_global_ativo: true }).expect(200);
  expect((await StoreSettings.findOne({ tenantId: tenantA._id }).lean())?.nome_loja).toBe('Loja A Atualizada');
  expect((await StoreSettings.findOne({ tenantId: tenantB._id }).lean())?.nome_loja).toBe('Loja B');
  const settings = await request(app).get('/api/tenant/stores/loja-a/settings').set('Cookie', cookie).expect(200);
  expect(settings.body.settings.chave_pix).toBe('pix@loja-a.test');
  const publicStore = await request(app).get('/api/public/stores/loja-a/store').expect(200);
  expect(publicStore.body.settings.chave_pix).toBe('pix@loja-a.test');

  const homeBlock = await mutate('post', '/api/tenant/stores/loja-a/home-blocks').send({ titulo: 'Bloco A', descricao: 'Somente A', tipo_bloco: 'texto' }).expect(201);
  await mutate('put', `/api/tenant/stores/loja-a/home-blocks/${homeBlock.body.block._id}`).send({ titulo: 'Bloco A atualizado' }).expect(200);
  await mutate('put', '/api/tenant/stores/loja-a/home-blocks/reorder').send({ updates: [{ id: homeBlock.body.block._id, ordem: 3, ativo: true }] }).expect(200);
  expect(await HomeBlock.countDocuments({ tenantId: tenantA._id })).toBe(1);
  expect(await HomeBlock.countDocuments({ tenantId: tenantB._id })).toBe(0);
  await mutate('delete', `/api/tenant/stores/loja-a/home-blocks/${homeBlock.body.block._id}`).expect(200);

  const customerA = await User.create({ tenantId: tenantA._id, nome: 'Cliente A', telefone: '24999990001', normalizedPhone: '5524999990001', senha: 'hash', pontos: 2 });
  const customerB = await User.create({ tenantId: tenantB._id, nome: 'Cliente B', telefone: '24999990002', normalizedPhone: '5524999990002', senha: 'hash', pontos: 9 });
  await mutate('patch', `/api/tenant/stores/loja-a/customers/${customerA._id}/points`).send({ pontos: 25 }).expect(200);
  await mutate('patch', `/api/tenant/stores/loja-a/customers/${customerB._id}/points`).send({ pontos: 30 }).expect(404);
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
  const payload = { customer: { name: 'Cliente', phone: '24999999999' }, items: [{ productId: productA._id.toString(), quantity: 1, options: [], price: 1 }], deliveryType: 'pickup', paymentMethod: 'pix' };
  const key = '1234567890abcdef';
  const first = await request(app).post('/api/customer/stores/loja-a/orders').set('Idempotency-Key', key).send(payload).expect(201);
  expect(first.body.totalCents).toBe(1000);
  const repeated = await request(app).post('/api/customer/stores/loja-a/orders').set('Idempotency-Key', key).send(payload).expect(201);
  expect(repeated.body.orderId).toBe(first.body.orderId);
  const tracking = await request(app).get(`/api/customer/stores/loja-a/tracking/${first.body.trackingToken}`).expect(200);
  expect(JSON.stringify(tracking.body)).not.toContain('24999999999');
  expect(JSON.stringify(tracking.body)).not.toContain('Cliente');
  const product = await Product.findById(productA._id).lean();
  expect(product?.estoque).toBe(1);
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
