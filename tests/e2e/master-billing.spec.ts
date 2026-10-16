import { expect, test, type Page } from '@playwright/test';
import { masterCalendarDate, masterDateBoundary } from '../../src/lib/masterReporting';

test.use({ timezoneId: 'Pacific/Honolulu' });

const tenant = { _id: '507f1f77bcf86cd799439011', displayName: 'Loja Cobrança', slug: 'loja-cobranca', owner: { name: 'Owner', email: 'owner@example.test' } };
const plan = { _id: '507f1f77bcf86cd799439012', name: 'Plano Teste', priceCents: 9900, interval: 'monthly' };
const subscription = { _id: '507f1f77bcf86cd799439013', tenantId: tenant._id, tenant, planId: plan._id, plan, status: 'past_due' };
const fixtureInvoice = {
  _id: '507f1f77bcf86cd799439014', tenantId: tenant._id, tenant, subscriptionId: subscription._id, subscription, plan,
  amountCents: 9900, status: 'pending', effectiveStatus: 'overdue', dueAt: '2026-09-25T02:59:59.999Z', createdAt: '2026-08-01T12:00:00Z',
};

async function mockMaster(page: Page) {
  await page.route('**/api/platform/auth/**', (route) => route.fulfill({ json: { success: true, csrfToken: 'master-e2e-csrf' } }));
  await page.route('**/api/master/session', (route) => route.fulfill({ json: {
    success: true, account: { _id: '507f1f77bcf86cd799439015', name: 'Master Teste', email: 'master@example.test', platformRole: 'platform_super_admin' },
  } }));
  await page.route('**/api/master/settings', (route) => route.fulfill({ json: { success: true, settings: { platformName: 'Pode Vir' } } }));
  await page.route('**/api/master/subscriptions?*', (route) => route.fulfill({ json: { success: true, items: [subscription], pagination: { page: 1, limit: 100, total: 1, pages: 1 } } }));
}

test('registra pagamento no calendário da plataforma mesmo em outro fuso', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-01T02:30:00Z') });
  await mockMaster(page);
  let paid = false;
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/master/invoices**', async (route) => {
    if (route.request().method() === 'POST') {
      submitted = route.request().postDataJSON();
      paid = true;
      await route.fulfill({ json: { success: true, invoice: { ...fixtureInvoice, status: 'paid' } } });
      return;
    }
    await route.fulfill({ json: {
      success: true, items: [{ ...fixtureInvoice, status: paid ? 'paid' : 'pending', effectiveStatus: paid ? 'paid' : 'overdue' }],
      pagination: { page: 1, limit: 25, total: 1, pages: 1 }, summaries: { [paid ? 'paid' : 'overdue']: { cents: 9900, count: 1 } },
    } });
  });
  await page.goto('/master/financeiro');
  await expect(page.getByRole('heading', { name: 'Cobrança Pode Vir' })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar pagamento', exact: true }).click();
  await expect(page.getByLabel('Data do pagamento')).toHaveValue('2026-09-30');
  await expect(page.getByLabel('Data do pagamento')).toHaveAttribute('max', '2026-09-30');
  await page.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await expect.poll(() => submitted?.paidAt).toBe('2026-09-30T03:00:00.000Z');
  await expect(page.getByRole('button', { name: 'Registrar estorno', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar estorno', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registrar estorno manual' })).toBeVisible();
  await expect(page.getByText(/Confirme somente após devolver o dinheiro por outro meio/)).toBeVisible();
});

test('retry da criação mantém a mesma chave e o vencimento até o fim do dia em Brasília', async ({ page }) => {
  await mockMaster(page);
  const submissions: Array<Record<string, unknown>> = [];
  await page.route('**/api/master/invoices**', async (route) => {
    if (route.request().method() === 'POST') {
      submissions.push(route.request().postDataJSON());
      await route.fulfill(submissions.length === 1
        ? { status: 503, json: { success: false, error: { message: 'Falha temporária simulada' } } }
        : { status: 201, json: { success: true, invoice: fixtureInvoice } });
      return;
    }
    await route.fulfill({ json: { success: true, items: [], pagination: { page: 1, limit: 25, total: 0, pages: 1 }, summaries: {} } });
  });
  await page.goto('/master/financeiro');
  await page.getByRole('button', { name: 'Nova fatura', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Assinatura', exact: true }).selectOption(subscription._id);
  await page.getByLabel('Vencimento', { exact: true }).fill('2026-10-20');
  await page.getByRole('button', { name: 'Criar fatura', exact: true }).click();
  await expect(page.getByText('Falha temporária simulada')).toBeVisible();
  await page.getByRole('button', { name: 'Criar fatura', exact: true }).click();
  await expect.poll(() => submissions.length).toBe(2);
  expect(submissions[0]).toEqual(submissions[1]);
  expect(submissions[0].idempotencyKey).toMatch(/^[a-f\d-]{36}$/);
  expect(submissions[0].dueAt).toBe('2026-10-21T02:59:59.999Z');
  await expect(page.getByText('Fatura manual criada.', { exact: true })).toBeVisible();
});

test('expõe filtros financeiros e recusa de pagamento sem esconder o erro no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMaster(page);
  let lastQuery: URLSearchParams | undefined;
  await page.route('**/api/master/invoices**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 409, json: { success: false, error: { message: 'Pagamento já registrado. Atualize a lista.' } } });
      return;
    }
    lastQuery = new URL(route.request().url()).searchParams;
    await route.fulfill({ json: { success: true, items: [fixtureInvoice], pagination: { page: 1, limit: 25, total: 1, pages: 1 }, summaries: { overdue: { cents: 9900, count: 1 } } } });
  });
  await page.goto('/master/financeiro');
  await expect(page.getByRole('heading', { name: 'Cobrança Pode Vir' })).toBeVisible();
  await page.getByLabel('Filtrar período por').selectOption('dueAt');
  await page.getByLabel('De', { exact: true }).fill('2026-09-01');
  await page.getByLabel('Até', { exact: true }).fill('2026-09-30');
  await page.getByLabel('Situação da fatura').selectOption('overdue');
  await expect.poll(() => lastQuery?.get('dateField')).toBe('dueAt');
  await expect.poll(() => lastQuery?.get('from')).toBe('2026-09-01');
  await expect.poll(() => lastQuery?.get('to')).toBe('2026-09-30');
  await expect.poll(() => lastQuery?.get('status')).toBe('overdue');
  await page.getByRole('button', { name: 'Registrar pagamento', exact: true }).click();
  await expect(page.getByLabel('Data do pagamento')).toHaveValue(masterCalendarDate());
  expect(masterDateBoundary(masterCalendarDate()).getTime()).toBeLessThanOrEqual(Date.now());
  await page.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await expect(page.getByText('Pagamento já registrado. Atualize a lista.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar pagamento' })).toBeVisible();
});
