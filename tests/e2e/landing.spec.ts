import { expect, test } from '@playwright/test';

test('landing prerenderizada apresenta conteúdo e contato sem JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Seu cardápio online.');
  await expect(page.getByRole('link', { name: /Conhecer a Pode Vir/ }).first()).toHaveAttribute('href', /wa\.me/);
  await expect(page.getByRole('link', { name: 'Acesso do lojista' }).first()).toHaveAttribute('href', '/login');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /pode-vir-social\.png$/);
  await expect(page.locator('#initial-loading')).toHaveCount(0);
  await context.close();
});

for (const width of [360, 390, 768, 820, 1024, 1440]) {
  test(`navegação e conteúdo permanecem acessíveis em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Abrir menu', exact: true });
    if (width < 1100) {
      await menu.click();
      const mobileNav = page.getByRole('navigation', { name: 'Navegação móvel' });
      await expect(mobileNav.getByRole('link', { name: 'Produto', exact: true })).toBeFocused();
      await expect(mobileNav.getByRole('link', { name: 'Acesso do lojista' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await menu.click();
      await mobileNav.getByRole('link', { name: 'Encomendas', exact: true }).click();
      await expect(mobileNav).toBeHidden();
    } else {
      await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Encomendas' }).click();
    }
    await expect(page).toHaveURL(/#encomendas$/);
    const sectionTop = await page.locator('#encomendas').evaluate((element) => element.getBoundingClientRect().top);
    const headerBottom = await page.locator('header').evaluate((element) => element.getBoundingClientRect().bottom);
    expect(sectionTop).toBeGreaterThanOrEqual(headerBottom - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('demonstração e FAQ funcionam por teclado sem carregar loja ou consumidor', async ({ page }) => {
  const storefrontRequests: string[] = [];
  const hydrationErrors: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/(public|customer)\/stores\//.test(request.url()) || /\/StorefrontApp-[^/]+\.js/.test(request.url())) storefrontRequests.push(request.url());
  });
  page.on('console', (message) => { if (message.type() === 'error' && /hydration|Minified React error/.test(message.text())) hydrationErrors.push(message.text()); });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Cardápio' }).focus();
  await expect(page.getByRole('heading', { name: /Seu cardápio já existe\.\s*Comece por ele\./ })).toBeVisible();
  await expect(page.locator('.pv-import-block')).toContainText('revisar e confirmar');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Pedidos', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Pedidos', exact: true })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tabpanel', { name: 'Encomendas', exact: true })).toContainText('Saldo restante');
  const pix = page.getByRole('button', { name: 'A Pode Vir recebe o Pix automaticamente?' });
  await pix.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'A Pode Vir recebe o Pix automaticamente?' })).toContainText('registrados manualmente');
  expect(storefrontRequests).toEqual([]);
  expect(hydrationErrors).toEqual([]);
});

test('documento de acesso não recebe conteúdo nem metadados institucionais da raiz', async ({ request }) => {
  const response = await request.get('/login');
  const html = await response.text();
  expect(html).not.toContain('data-landing-prerender');
  expect(html).not.toContain('Seu cardápio online.');
  expect(html).not.toContain('rel="canonical"');
  expect(html).not.toContain('property="og:image"');
});
