import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import masterRouter from '../../server/routes/master';
import tenantRouter from '../../server/routes/tenant';
import { requestContext } from '../../server/middleware/requestContext';
import { errorHandler } from '../../server/middleware/errors';
import Tenant from '../../server/models/Tenant';
import Plan from '../../server/models/Plan';
import Subscription from '../../server/models/Subscription';
import Invoice from '../../server/models/Invoice';
import AdminAccount from '../../server/models/AdminAccount';
import AuthSession from '../../server/models/AuthSession';
import TenantMembership from '../../server/models/TenantMembership';
import AuditLog from '../../src/models/AuditLog';
import { manualBilling } from '../../server/services/billingService';

let mongo: MongoMemoryReplSet;
const app = express();
app.use(requestContext, cookieParser(), express.json());
app.use('/api/master', masterRouter);
app.use('/api/tenant/stores/:slug', tenantRouter);
app.use(errorHandler);
const csrf = 'master-billing-test-csrf';

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Tenant.init(), Plan.init(), Subscription.init(), Invoice.init(), AuditLog.init()]);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function sessionCookie(master = true, verified = true) {
  const account = await AdminAccount.create({
    name: 'Billing test', email: `${crypto.randomUUID()}@example.test`, passwordHash: 'unused-test-hash',
    active: true, platformRole: master ? 'platform_super_admin' : null,
  });
  const session = await AuthSession.create({
    accountType: 'admin', accountId: account._id, tokenVersion: 0, refreshTokenHash: 'unused-test-hash',
    expiresAt: new Date(Date.now() + 600_000), mfaVerified: verified,
  });
  const token = jwt.sign({ sid: String(session._id), sub: String(account._id), kind: 'admin', v: 0 }, process.env.JWT_SECRET!, { expiresIn: 600 });
  return { account, cookies: [`delivery_session_master=${token}`, `delivery_csrf_master=${csrf}`] };
}

async function fixture(status = 'past_due', subscriptionStatus = status) {
  const suffix = crypto.randomUUID();
  const tenant = await Tenant.create({
    legalName: 'Billing Test', displayName: 'Billing Test', slug: `billing-${suffix}`, status,
    owner: { name: 'Owner', email: `${suffix}@example.test` },
  });
  const plan = await Plan.create({ name: 'Plano Teste', code: suffix, priceCents: 9900, interval: 'monthly', trialDays: 7 });
  const subscription = await Subscription.create({
    tenantId: tenant._id, planId: plan._id, status: subscriptionStatus, provider: 'manual', externalId: `manual:${suffix}`,
  });
  tenant.planId = plan._id;
  tenant.subscriptionId = subscription._id;
  await tenant.save();
  return { tenant, subscription, plan };
}

async function invoiceFor(fixtureValue: Awaited<ReturnType<typeof fixture>>, amountCents = 9900, dueAt = new Date(Date.now() - 86_400_000)) {
  return manualBilling.createInvoice({ tenantId: String(fixtureValue.tenant._id), subscriptionId: String(fixtureValue.subscription._id), amountCents, dueAt });
}

it('protege as APIs de cobrança com papel Master, MFA e CSRF', async () => {
  const data = await fixture();
  const body = { tenantId: String(data.tenant._id), subscriptionId: String(data.subscription._id), amountCents: 9900, dueAt: new Date().toISOString() };
  await request(app).post('/api/master/invoices').send(body).expect(401);
  for (const [master, verified] of [[false, true], [true, false]]) {
    const { cookies } = await sessionCookie(master, verified);
    await request(app).post('/api/master/invoices').set('Cookie', cookies).set('x-csrf-token', csrf).send(body).expect(403);
  }
  const { cookies } = await sessionCookie();
  await request(app).post('/api/master/invoices').set('Cookie', cookies).send(body).expect(403);
  expect(await Invoice.countDocuments()).toBe(0);
});

it('recusa vínculo cruzado e assinatura inexistente antes de criar uma fatura', async () => {
  const a = await fixture();
  const b = await fixture();
  const { cookies } = await sessionCookie();
  const body = { tenantId: String(a.tenant._id), subscriptionId: String(b.subscription._id), amountCents: 9900, dueAt: new Date().toISOString() };
  const mismatch = await request(app).post('/api/master/invoices').set('Cookie', cookies).set('x-csrf-token', csrf).send(body).expect(409);
  expect(mismatch.body.error.code).toBe('BILLING_TENANT_MISMATCH');
  await request(app).post('/api/master/invoices').set('Cookie', cookies).set('x-csrf-token', csrf)
    .send({ ...body, subscriptionId: String(new mongoose.Types.ObjectId()) }).expect(404);
  expect(await Invoice.countDocuments()).toBe(0);
});

it('reutiliza a criação de fatura em retries concorrentes sem duplicar histórico ou auditoria', async () => {
  const data = await fixture();
  const { cookies } = await sessionCookie();
  const body = {
    tenantId: String(data.tenant._id), subscriptionId: String(data.subscription._id), amountCents: 9900,
    dueAt: new Date().toISOString(), idempotencyKey: crypto.randomUUID(),
  };
  const responses = await Promise.all([1, 2].map(() => request(app).post('/api/master/invoices').set('Cookie', cookies).set('x-csrf-token', csrf).send(body)));
  expect(responses.map((response) => response.status)).toEqual([201, 201]);
  expect(responses[0].body.invoice._id).toBe(responses[1].body.invoice._id);
  expect(await Invoice.countDocuments()).toBe(1);
  expect(await AuditLog.countDocuments({ acao: 'INVOICE_CREATED' })).toBe(1);
  await request(app).post('/api/master/invoices').set('Cookie', cookies).set('x-csrf-token', csrf)
    .send({ ...body, amountCents: 1 }).expect(409);
});

it('pagamento e estorno sincronizam assinatura e loja, e ficam visíveis somente na loja correta', async () => {
  const data = await fixture();
  const other = await fixture('active');
  const invoice = await invoiceFor(data);
  const { account, cookies } = await sessionCookie();
  await request(app).post(`/api/master/invoices/${invoice._id}/mark-paid`).set('Cookie', cookies).set('x-csrf-token', csrf)
    .send({ reason: 'Comprovante conferido', paidAt: new Date().toISOString() }).expect(200);
  expect((await Subscription.findById(data.subscription._id))!.status).toBe('active');
  expect((await Tenant.findById(data.tenant._id))!.status).toBe('active');
  const audit = await AuditLog.findOne({ acao: 'INVOICE_MARKED_PAID' }).lean();
  expect(audit!.after.invoice.paidAt).toEqual(expect.any(String));
  expect(audit!.after.invoice.tenantId).toBe(String(data.tenant._id));
  expect(audit!.adminId).toBe(String(account._id));

  const owner = await AdminAccount.create({ name: 'Owner', email: 'owner@test.example', passwordHash: 'unused-test-hash' });
  await TenantMembership.create({ tenantId: data.tenant._id, accountId: owner._id, role: 'tenant_owner' });
  const ownerSession = await AuthSession.create({ accountId: owner._id, accountType: 'admin', tokenVersion: 0, refreshTokenHash: 'unused', expiresAt: new Date(Date.now() + 600_000) });
  const token = jwt.sign({ sid: String(ownerSession._id), sub: String(owner._id), kind: 'admin', v: 0 }, process.env.JWT_SECRET!, { expiresIn: 600 });
  const tenantCookies = [`delivery_session=${token}`];
  const billing = await request(app).get(`/api/tenant/stores/${data.tenant.slug}/billing`).set('Cookie', tenantCookies).expect(200);
  expect(billing.body.subscription.status).toBe('active');
  expect(billing.body.invoices[0].status).toBe('paid');
  await request(app).get(`/api/tenant/stores/${other.tenant.slug}/billing`).set('Cookie', tenantCookies).expect(403);
  await request(app).get(`/api/tenant/stores/${data.tenant.slug}/billing`).set('Cookie', cookies).expect(401);

  await request(app).post(`/api/master/invoices/${invoice._id}/refund`).set('Cookie', cookies).set('x-csrf-token', csrf)
    .send({ reason: 'Devolucao conferida' }).expect(200);
  expect((await Subscription.findById(data.subscription._id))!.status).toBe('past_due');
  expect((await Tenant.findById(data.tenant._id))!.status).toBe('past_due');
});

it.each(['suspended', 'cancelled', 'archived'])('pagamento preserva a situação administrativa %s da loja', async (status) => {
  const data = await fixture(status, 'past_due');
  const invoice = await invoiceFor(data);
  const { cookies } = await sessionCookie();
  await request(app).post(`/api/master/invoices/${invoice._id}/mark-paid`).set('Cookie', cookies).set('x-csrf-token', csrf)
    .send({ reason: 'Comprovante conferido' }).expect(200);
  expect((await Tenant.findById(data.tenant._id))!.status).toBe(status);
});

it.each(['suspended', 'cancelled'])('pagamento não reabre assinatura %s', async (status) => {
  const data = await fixture(status, status);
  const invoice = await invoiceFor(data);
  const { account } = await sessionCookie();
  await manualBilling.markPaid(String(invoice._id), account._id as mongoose.Types.ObjectId, 'Comprovante conferido');
  expect((await Subscription.findById(data.subscription._id))!.status).toBe(status);
  expect((await Tenant.findById(data.tenant._id))!.status).toBe(status);
});

it('mantém a inadimplência enquanto existir outra fatura vencida e serializa quitações concorrentes', async () => {
  const data = await fixture();
  const first = await invoiceFor(data);
  const second = await invoiceFor(data);
  const third = await invoiceFor(data);
  const { account } = await sessionCookie();
  await manualBilling.markPaid(String(first._id), account._id as mongoose.Types.ObjectId, 'Primeiro pagamento conferido');
  expect((await Tenant.findById(data.tenant._id))!.status).toBe('past_due');
  await Promise.all([second, third].map((invoice) => manualBilling.markPaid(String(invoice._id), account._id as mongoose.Types.ObjectId, 'Pagamento concorrente conferido')));
  expect((await Subscription.findById(data.subscription._id))!.status).toBe('active');
  expect((await Tenant.findById(data.tenant._id))!.status).toBe('active');
});

it('duplo pagamento da mesma fatura não duplica efeitos', async () => {
  const data = await fixture();
  const invoice = await invoiceFor(data);
  const { cookies } = await sessionCookie();
  const responses = await Promise.all([1, 2].map(() => request(app).post(`/api/master/invoices/${invoice._id}/mark-paid`)
    .set('Cookie', cookies).set('x-csrf-token', csrf).send({ reason: 'Comprovante conferido' })));
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect((await Invoice.findById(invoice._id))!.history.filter((entry: { status: string }) => entry.status === 'paid')).toHaveLength(1);
  expect(await AuditLog.countDocuments({ acao: 'INVOICE_MARKED_PAID' })).toBe(1);
});

it('falha na auditoria desfaz pagamento, histórico e ativação da loja', async () => {
  const data = await fixture();
  const invoice = await invoiceFor(data);
  const { cookies } = await sessionCookie();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('forced audit failure'));
  await request(app).post(`/api/master/invoices/${invoice._id}/mark-paid`).set('Cookie', cookies).set('x-csrf-token', csrf)
    .send({ reason: 'Comprovante conferido' }).expect(500);
  expect((await Invoice.findById(invoice._id))!.status).toBe('pending');
  expect((await Invoice.findById(invoice._id))!.history).toHaveLength(1);
  expect((await Subscription.findById(data.subscription._id))!.status).toBe('past_due');
  expect((await Tenant.findById(data.tenant._id))!.status).toBe('past_due');
});

it('não altera fatura legada com relacionamento cruzado nem aceita pagamento futuro', async () => {
  const a = await fixture();
  const b = await fixture();
  const invoice = await invoiceFor(a);
  await Invoice.updateOne({ _id: invoice._id }, { $set: { subscriptionId: b.subscription._id } });
  const { cookies } = await sessionCookie();
  await request(app).post(`/api/master/invoices/${invoice._id}/mark-paid`).set('Cookie', cookies).set('x-csrf-token', csrf)
    .send({ reason: 'Comprovante conferido' }).expect(409);
  await request(app).post(`/api/master/invoices/${invoice._id}/mark-paid`).set('Cookie', cookies).set('x-csrf-token', csrf)
    .send({ reason: 'Comprovante conferido', paidAt: new Date(Date.now() + 86_400_000).toISOString() }).expect(400);
  expect((await Invoice.findById(invoice._id))!.status).toBe('pending');
  expect((await Subscription.findById(b.subscription._id))!.status).toBe('past_due');
});

it('não substitui assinatura existente nem transforma uma assinatura ativa em trial pela prorrogação', async () => {
  const data = await fixture('active');
  const { cookies } = await sessionCookie();
  await request(app).post('/api/master/subscriptions').set('Cookie', cookies).set('x-csrf-token', csrf)
    .send({ tenantId: String(data.tenant._id), planId: String(data.plan._id), status: 'trial' }).expect(409);
  await request(app).post(`/api/master/subscriptions/${data.subscription._id}/extend-trial`).set('Cookie', cookies).set('x-csrf-token', csrf).expect(409);
  expect((await Subscription.findById(data.subscription._id))!.status).toBe('active');
  expect((await Tenant.findById(data.tenant._id))!.status).toBe('active');
});

it('prorroga somente trial e preserva suspensão administrativa', async () => {
  const data = await fixture('suspended', 'trial');
  const end = new Date(Date.now() + 86_400_000);
  await Subscription.updateOne({ _id: data.subscription._id }, { $set: { trialEndsAt: end } });
  const { cookies } = await sessionCookie();
  const response = await request(app).post(`/api/master/subscriptions/${data.subscription._id}/extend-trial`)
    .set('Cookie', cookies).set('x-csrf-token', csrf).expect(200);
  expect(new Date(response.body.trialEndsAt).getTime()).toBe(end.getTime() + 7 * 86_400_000);
  expect((await Tenant.findById(data.tenant._id))!.status).toBe('suspended');
});

it('atribui assinatura sem reabrir loja bloqueada e não grava nada se a auditoria falhar', async () => {
  const existing = await fixture('active');
  const { cookies } = await sessionCookie();
  const tenant = await Tenant.create({ legalName: 'Nova Loja', displayName: 'Nova Loja', slug: 'nova-loja', status: 'suspended', owner: { name: 'Owner', email: 'new@example.test' } });
  const body = { tenantId: String(tenant._id), planId: String(existing.plan._id), status: 'active' };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const auditFailure = vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('forced audit failure'));
  await request(app).post('/api/master/subscriptions').set('Cookie', cookies).set('x-csrf-token', csrf).send(body).expect(500);
  expect(await Subscription.countDocuments({ tenantId: tenant._id })).toBe(0);
  expect((await Tenant.findById(tenant._id))!.subscriptionId).toBeNull();
  auditFailure.mockRestore();
  const assigned = await request(app).post('/api/master/subscriptions').set('Cookie', cookies).set('x-csrf-token', csrf).send(body).expect(201);
  const savedTenant = await Tenant.findById(tenant._id);
  expect(savedTenant!.status).toBe('suspended');
  expect(String(savedTenant!.subscriptionId)).toBe(assigned.body.subscription._id);
});

it('troca de plano é atômica e preserva o bloqueio administrativo', async () => {
  const data = await fixture('suspended', 'active');
  const nextPlan = await Plan.create({ name: 'Novo Plano', code: 'next-plan', priceCents: 19900, active: true });
  const { cookies } = await sessionCookie();
  const body = { planId: String(nextPlan._id), status: 'active', reason: 'Troca comercial autorizada' };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const auditFailure = vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('forced audit failure'));
  await request(app).patch(`/api/master/subscriptions/${data.subscription._id}`).set('Cookie', cookies).set('x-csrf-token', csrf).send(body).expect(500);
  expect(String((await Subscription.findById(data.subscription._id))!.planId)).toBe(String(data.plan._id));
  expect(String((await Tenant.findById(data.tenant._id))!.planId)).toBe(String(data.plan._id));
  auditFailure.mockRestore();
  await request(app).patch(`/api/master/subscriptions/${data.subscription._id}`).set('Cookie', cookies).set('x-csrf-token', csrf).send(body).expect(200);
  expect(String((await Subscription.findById(data.subscription._id))!.planId)).toBe(String(nextPlan._id));
  expect(String((await Tenant.findById(data.tenant._id))!.planId)).toBe(String(nextPlan._id));
  expect((await Tenant.findById(data.tenant._id))!.status).toBe('suspended');
});

it('concilia recebido por pagamento e vencidos por vencimento em dashboard, relatório e filtros', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  const data = await fixture('active');
  const receipt = await invoiceFor(data, 12345, new Date('2026-08-01T12:00:00Z'));
  const outside = await invoiceFor(data, 999, new Date('2026-09-15T12:00:00Z'));
  const overdue = await invoiceFor(data, 2500, new Date('2026-09-25T12:00:00Z'));
  await Invoice.updateOne({ _id: receipt._id }, { $set: { status: 'paid', paidAt: new Date('2026-10-01T02:30:00Z'), createdAt: new Date('2026-08-01T12:00:00Z') } }, { timestamps: false });
  await Invoice.updateOne({ _id: outside._id }, { $set: { status: 'paid', paidAt: new Date('2026-10-01T03:30:00Z'), createdAt: new Date('2026-09-01T12:00:00Z') } }, { timestamps: false });
  const { cookies } = await sessionCookie();
  const period = 'from=2026-09-01&to=2026-09-30';
  const dashboard = await request(app).get(`/api/master/dashboard?${period}`).set('Cookie', cookies).expect(200);
  expect(dashboard.body.kpis.paidRevenueCents).toBe(12345);
  expect(dashboard.body.kpis.overdueRevenueCents).toBe(2500);
  expect(dashboard.body.revenueSeries.find((point: { date: string }) => point.date === '2026-09-30').paidCents).toBe(12345);
  const report = await request(app).get(`/api/master/reports/revenue?${period}`).set('Cookie', cookies).expect(200);
  expect(report.body.items.find((row: { _id: { status: string } }) => row._id.status === 'paid').cents).toBe(dashboard.body.kpis.paidRevenueCents);
  const invoices = await request(app).get(`/api/master/invoices?${period}&dateField=paidAt&status=paid`).set('Cookie', cookies).expect(200);
  expect(invoices.body.items.map((item: { _id: string }) => item._id)).toEqual([String(receipt._id)]);
  expect(invoices.body.summaries.paid.cents).toBe(12345);
  const overdueList = await request(app).get(`/api/master/invoices?${period}&dateField=dueAt&status=overdue`).set('Cookie', cookies).expect(200);
  expect(overdueList.body.items.map((item: { _id: string }) => item._id)).toEqual([String(overdue._id)]);
  expect(overdueList.body.items[0].status).toBe('pending');
  expect(overdueList.body.items[0].effectiveStatus).toBe('overdue');
  expect(overdueList.body.summaries.overdue.cents).toBe(2500);
});
