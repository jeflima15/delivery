import { expect, test, type Page } from '@playwright/test';

const legacyStorefrontPaths = [
  '/api/auth/identificar', '/api/auth/login', '/api/auth/register', '/api/auth/logout',
  '/api/pedidos', '/api/pedidos/meus', '/api/cupons/validar',
];

async function mockPublicStore(page: Page, slug = 'loja-e2e') {
  await page.route(`**/api/public/stores/${slug}/store`, async (route: any) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, tenant: { slug }, settings: {
        nome_loja: 'Loja E2E', is_open: true, tempo_entrega: '30 min', fidelidade_ativa: false,
        pagamento_pix: true, pagamento_cartao: false, pagamento_dinheiro: false,
        logisticsOptions: { allowPickup: true, allowDelivery: false }, theme: { primaryColor: '#059669' },
      },
      categories: [{ _id: '507f1f77bcf86cd799439011', nome: 'Lanches', descricao: '' }],
      products: [{ _id: '507f1f77bcf86cd799439012', categoriaId: '507f1f77bcf86cd799439011', nome: 'Produto E2E', descricao: 'Produto usado no fluxo automatizado', preco: 12, preco_antigo: 0, ativo: true, esgotado: false, grupos_adicionais: [] }],
      blocks: [],
    }),
  }));
  await page.route(`**/api/customer/stores/${slug}/auth/session`, async (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, authenticated: false, user: null }) }));
}

test('raiz renderiza a plataforma sem carregar APIs da loja', async ({ page }) => {
  const forbiddenRequests: string[] = [];
  page.on('request', (request) => {
    if (['/api/configuracoes/publica', '/api/categorias', '/api/produtos', '/api/blocos_home'].some((path) => request.url().includes(path))) forbiddenRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Seu cardapio online/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver demonstracao' }).first()).toHaveAttribute('href', '/loja-piloto');
  await expect(page.getByRole('link', { name: 'Conhecer o painel' })).toHaveAttribute('href', '/loja-piloto/admin');
  await expect(page.getByText('Planos em breve')).toBeVisible();
  expect(forbiddenRequests).toEqual([]);
});

test('vitrine mobile preserva sacola, valida telefone inline e abre cadastro sem API legada', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await mockPublicStore(page);
  const legacyRequests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (legacyStorefrontPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) legacyRequests.push(pathname);
  });
  await page.route('**/api/customer/stores/loja-e2e/auth/identify', async (route) => {
    const phone = String(route.request().postDataJSON()?.phone || '').replace(/\D/g, '');
    if (phone.length < 10) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INVALID_PHONE', message: 'Telefone invalido.' } }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, flowId: '507f1f77bcf86cd799439099', nextStep: 'register', maskedPhone: '5524*****11' }) });
  });

  await page.goto('/loja-e2e');
  await expect(page.getByText('Produto E2E', { exact: true }).first()).toBeVisible();
  await page.getByText('Produto E2E', { exact: true }).first().click();
  await page.getByRole('button', { name: /Adicionar/ }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cart:loja-e2e') || '[]').length)).toBe(1);

  await page.getByText('Perfil', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrar ou criar conta' })).toBeVisible();
  await page.getByLabel('Telefone').fill('123');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Telefone invalido.');
  await page.getByLabel('Telefone').fill('24999999911');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible();
  await expect(page.getByLabel('Nome completo')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart:loja-e2e') || '[]'))).toHaveLength(1);
  expect(legacyRequests).toEqual([]);
});

test('/admin preserva links antigos e redireciona para o painel canonico', async ({ page }) => {
  await page.goto('/admin?origem=favorito');
  await expect(page).toHaveURL(/\/loja-piloto\/admin\?origem=favorito$/);
});

test('painel tenant usa slug, sessao e dashboard novos sem chamar API legada', async ({ page }) => {
  let authenticated = false;
  let loginPayload: Record<string, string> | null = null;
  const legacyRequests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/api/admin/')) legacyRequests.push(request.url()); });
  await page.route('**/api/platform/auth/admin/login', async (route) => {
    loginPayload = route.request().postDataJSON();
    authenticated = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/tenant/stores/loja-piloto/me', async (route) => {
    await route.fulfill({
      status: authenticated ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(authenticated ? {
        success: true,
        account: { id: '507f1f77bcf86cd799439011', name: 'Lojista Teste', email: 'lojista@example.com' },
        tenant: { id: '507f1f77bcf86cd799439012', slug: 'loja-piloto', name: 'Loja Piloto' },
        membership: { role: 'tenant_owner' },
        permissions: ['orders:read', 'orders:write', 'catalog:read', 'catalog:write', 'settings:read', 'settings:write', 'customers:read', 'customers:write', 'coupons:write', 'audit:read'],
      } : { error: { message: 'Sessao ausente.' } }),
    });
  });
  await page.route('**/api/tenant/stores/loja-piloto/dashboard', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, metrics: { products: 3, categories: 2, orders: 8, pendingOrders: 2, ordersToday: 3, revenueToday: 120, averageOrderToday: 40, revenueWeek: 520 }, weekly: [{ date: '2026-08-01', label: 'sab', total: 120 }], recentOrders: [], settings: { nome_loja: 'Loja Piloto', is_open: true, logisticsOptions: { allowPickup: true, allowDelivery: true } }, activeHomeBlocks: 2 }) }));

  await page.goto('/loja-piloto/admin');
  await expect(page.getByRole('heading', { name: 'Painel da loja' })).toBeVisible();
  await page.getByLabel('E-mail').fill('lojista@example.com');
  await page.locator('input[aria-label="Senha"]').fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar no sistema' }).click();
  await expect(page.getByText('Loja Piloto').first()).toBeVisible();
  await expect(page.getByText('Faturamento de hoje')).toBeVisible();
  expect(loginPayload).toMatchObject({ email: 'lojista@example.com', password: 'senha-segura', slug: 'loja-piloto' });
  expect(legacyRequests).toEqual([]);
});

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
