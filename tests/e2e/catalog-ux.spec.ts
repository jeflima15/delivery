import { expect, test, type Page } from '@playwright/test';

const slug = 'ux-e2e';
const category = { _id: '507f1f77bcf86cd799439011', nome: 'Lanches' };
const products = Array.from({ length: 32 }, (_, index) => ({
  _id: (100 + index).toString(16).padStart(24, '0'), categoriaId: category._id,
  nome: `Hambúrguer ${index + 1}`, preco: 12, ativo: true, grupos_adicionais: [],
  esgotado: false, catalogAvailability: { purchasable: index !== 1, reason: index === 1 ? 'unavailable' : null },
  updatedAt: '2026-10-01T12:00:00.000Z',
}));
async function store(page: Page) {
  await page.route('**/api/platform/auth/csrf?*', route => route.fulfill({ json: { success: true, csrfToken: 'test-csrf' } }));
  await page.route(`**/api/public/stores/${slug}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/products/')) return route.fulfill({ json: { success: true, product: products.find(p => path.endsWith(p._id)), relatedProducts: [] } });
    return route.fulfill({ json: { success: true, tenant: { slug }, settings: {
      nome_loja: 'Loja UX', is_open: true, pagamento_dinheiro: true, pagamento_pix: true,
      logisticsOptions: { allowDelivery: false, allowPickup: true },
    }, categories: [category], products, blocks: [] } });
  });
  await page.route(`**/api/customer/stores/${slug}/auth/session`, route => route.fulfill({ json: {
    success: true, authenticated: true, passwordVerified: true,
    user: { id: '507f1f77bcf86cd799439013', nome: 'Cliente', telefone: '24999999999', enderecos: [] },
  } }));
}
for (const width of [360, 393, 1440]) {
  test(`busca sem acentos, mais resultados e retorno preservado em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await store(page); await page.goto(`/${slug}`);
    await page.getByRole('button', { name: 'Buscar no cardápio', exact: true }).click();
    const search = page.getByRole('dialog', { name: 'Buscar no cardápio' });
    await search.getByRole('textbox').fill('hamburguer');
    await expect(search.getByRole('status')).toContainText('32');
    await expect(search.getByRole('button', { name: /Hambúrguer 2 / })).toBeDisabled();
    await search.getByRole('button', { name: 'Mostrar mais resultados' }).click();
    await search.getByRole('button', { name: /Hambúrguer 20 / }).click();
    const detail = page.getByRole('dialog', { name: 'Detalhes de Hambúrguer 20' });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Fechar detalhes do produto' }).click();
    await expect(search.getByRole('textbox')).toHaveValue('hamburguer');
    await expect(search.getByRole('button', { name: /Hambúrguer 20 / })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(search).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`vitrine-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('checkout edita item sem perder pagamento e repete a mesma tentativa após resposta incerta', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 900 }); await store(page);
  const requests: Array<{ key: string | undefined; body: any }> = [];
  await page.route(`**/api/customer/stores/${slug}/orders`, route => {
    requests.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
    if (requests.length === 1) return route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE', message: 'Indisponível' } } });
    return route.fulfill({ json: { success: true, orderId: '507f1f77bcf86cd799439099', trackingToken: 'test-tracking', totalCents: 2400 } });
  });
  await page.route(`**/api/public/stores/${slug}/orders/**`, route => route.fulfill({ json: { success: true, order: { status: 'novo', items: [], totalCents: 2400 } } }));
  await page.goto(`/${slug}`);
  await page.getByText('Hambúrguer 1', { exact: true }).first().click();
  await page.getByRole('button', { name: /Adicionar/ }).click();
  await page.getByRole('button', { name: 'Ver sacola', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar pedido', exact: true }).click();
  await page.getByRole('button', { name: /Dinheiro/ }).click();
  await page.getByRole('button', { name: 'Avançar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar item', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Detalhes de Hambúrguer 1' });
  await detail.getByRole('button', { name: 'Aumentar quantidade' }).click();
  await detail.getByRole('button', { name: /Atualizar/ }).click();
  await expect(page.getByText('2× Hambúrguer 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Finalizar Pedido/ })).toContainText('24,00');
  await page.getByRole('button', { name: /Finalizar Pedido/ }).click();
  await expect(page.getByText(/Ainda não confirmamos/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar item', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /Finalizar Pedido/ }).click();
  await expect(page.getByRole('button', { name: 'Acompanhar pedido', exact: true })).toBeVisible();
  expect(requests).toHaveLength(2); expect(requests[0].key).toBeTruthy(); expect(requests[1]).toEqual(requests[0]);
});

test('editor administrativo retoma URL, protege alterações e pagina sem truncar catálogo', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(`**/api/tenant/stores/${slug}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me')) return route.fulfill({ json: { success: true, account: { id: 'admin', name: 'Admin' }, tenant: { id: 'tenant', slug, name: 'Loja UX', isOpen: true, onboarding: { completed: true } }, membership: { role: 'tenant_owner' }, permissions: ['catalog:read', 'catalog:write', 'orders:read'] } });
    if (path.endsWith('/categories')) return route.fulfill({ json: { success: true, items: [category] } });
    if (path.endsWith('/products')) return route.fulfill({ json: { success: true, items: products } });
    if (path.includes('/products/')) return route.fulfill({ json: { success: true, product: products.find(p => path.endsWith(p._id)) } });
    return route.fulfill({ json: { success: true, items: [], metrics: {}, settings: {} } });
  });
  await page.goto(`/${slug}/admin/catalogo?tab=produtos&q=hamburguer&editor=produto&id=${products[0]._id}`);
  const name = page.getByPlaceholder('Ex: Hambúrguer Artesanal'); await expect(name).toHaveValue('Hambúrguer 1');
  await page.reload(); await expect(name).toHaveValue('Hambúrguer 1');
  await name.fill('Nome alterado');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Cancelar', exact: true }).first().click(); await expect(name).toHaveValue('Nome alterado');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Cancelar', exact: true }).first().click(); await expect(name).toBeHidden();
  await expect(page.getByPlaceholder('Buscar por nome, descrição ou categoria...')).toHaveValue('hamburguer');
  await page.getByRole('checkbox', { name: 'Selecionar esta página' }).check();
  await expect(page.getByText('25 selecionado(s)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Selecionar todos os resultados (32)' }).click();
  await expect(page.getByText('32 selecionado(s)', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('admin-lista.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
