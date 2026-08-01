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
