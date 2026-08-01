import { expect, test } from '@playwright/test';

test('deep links da SPA respondem', async ({ page }) => {
  await page.route('**/api/master/session', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Sessao ausente.' } }) });
  });
  await page.goto('/loja-piloto');
  await expect(page.locator('body')).toBeVisible();
  await page.goto('/loja-piloto/admin');
  await expect(page.getByText(/Painel da loja|Validando sessao/)).toBeVisible();
  await page.goto('/master');
  await expect(page.getByRole('heading', { name: 'Admin Master' })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
  await page.goto('/master/financeiro');
  await expect(page).toHaveURL(/\/master\/login$/);
  await expect(page.getByRole('heading', { name: 'Admin Master' })).toBeVisible();
});

test('login MFA entra no dashboard e navega pela sidebar', async ({ page }) => {
  let authenticated = false;
  await page.route('**/api/platform/auth/admin/login', async (route) => {
    authenticated = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/master/session', async (route) => {
    await route.fulfill({
      status: authenticated ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(authenticated
        ? { success: true, account: { _id: '507f1f77bcf86cd799439011', name: 'Master Teste', email: 'master@example.com', platformRole: 'platform_super_admin' } }
        : { error: { message: 'Sessao ausente.' } }),
    });
  });
  await page.route('**/api/master/settings', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, settings: { platformName: 'Delivery Teste', timezone: 'America/Sao_Paulo', currency: 'BRL', defaultPeriod: '30d', defaultPageSize: 25, featureLabels: {}, limitLabels: {} }, billing: { provider: 'manual' }, build: 'e2e' }) }));
  await page.route('**/api/master/dashboard**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, period: { from: '2026-07-01', to: '2026-08-01' }, kpis: { totalTenants: 1, activeTenants: 1, orders: 12, gmvCents: 120000, averageOrderCents: 10000, paidRevenueCents: 9900, pendingRevenueCents: 0, overdueRevenueCents: 0, mrrCents: 9900, arrCents: 118800, trialTenants: 0, trialsEndingSoon: 0, onboardingTenants: 0, newTenants: 1, pastDueTenants: 0, suspendedTenants: 0 }, orderSeries: [{ date: '2026-08-01', orders: 12, gmvCents: 120000 }], revenueSeries: [{ date: '2026-08-01', paidCents: 9900, pendingCents: 0 }], tenantStatusDistribution: [{ status: 'active', count: 1 }], planDistribution: [{ name: 'Piloto', count: 1 }], topStores: [], attention: { overdueInvoices: [], endingTrials: [], stalledOnboarding: [] }, recentActivity: [] }) }));
  await page.route('**/api/master/plans**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, items: [], plans: [], pagination: { page: 1, limit: 25, total: 0, pages: 1 } }) }));

  await page.goto('/master/login');
  await page.getByLabel('E-mail').fill('master@example.com');
  await page.locator('input[autocomplete="current-password"]').fill('senha-segura');
  await page.getByLabel('Código do autenticador').fill('123456');
  await page.getByRole('button', { name: 'Entrar com MFA' }).click();
  await expect(page.locator('h1')).toHaveText('Visão geral');
  await expect(page.getByText('R$ 1.200,00')).toBeVisible();
  await page.getByRole('button', { name: 'Planos' }).click();
  await expect(page).toHaveURL(/\/master\/planos$/);
  await expect(page.locator('h1')).toHaveText('Planos');
});
