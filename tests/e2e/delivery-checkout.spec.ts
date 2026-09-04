import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  test(`checkout preserva modal e prazo de preparo em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/public/stores/frete-e2e/products/*', (route) => route.fulfill({
      json: { success: true, product: { _id: '507f1f77bcf86cd799439012', nome: 'Lanche teste', preco: 12, ativo: true, esgotado: false, grupos_adicionais: [] }, relatedProducts: [] },
    }));
    await page.route('**/api/public/stores/frete-e2e/store', (route) => route.fulfill({
      json: {
        success: true, tenant: { slug: 'frete-e2e' },
        settings: {
          nome_loja: 'Frete E2E', is_open: true, tempo_entrega: '60-90 min',
          prazo_entrega_modo: 'preparo_deslocamento', tempo_preparo_min: 15, tempo_preparo_max: 25,
          tempo_deslocamento_min: 20, tempo_deslocamento_max: 30,
          pagamento_pix: true, logisticsOptions: { allowDelivery: false, allowPickup: true, allowDineIn: true },
        },
        categories: [{ _id: '507f1f77bcf86cd799439011', nome: 'Lanches' }],
        products: [{ _id: '507f1f77bcf86cd799439012', categoriaId: '507f1f77bcf86cd799439011', nome: 'Lanche teste', preco: 12, ativo: true, esgotado: false, grupos_adicionais: [] }],
        blocks: [],
      },
    }));
    await page.route('**/api/customer/stores/frete-e2e/auth/session', (route) => route.fulfill({
      json: { success: true, authenticated: true, passwordVerified: true, user: { id: '507f1f77bcf86cd799439013', nome: 'Cliente teste', telefone: '24999999999', enderecos: [] } },
    }));
    await page.goto('/frete-e2e');
    await page.getByText('Lanche teste', { exact: true }).first().click();
    await page.getByRole('button', { name: /Adicionar/ }).click();
    if (width < 1024) await page.getByRole('button', { name: 'Ver sacola', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar pedido', exact: true }).click();
    await expect(page.getByText('Checkout', { exact: true })).toBeVisible();
    await expect(page.getByText('Disponível para retirada em 15-25 min')).toBeVisible();
    await page.getByRole('button', { name: /Comer no local/ }).last().click();
    await expect(page.getByText('Checkout', { exact: true })).toBeVisible();
    await expect(page.getByText('Preparo estimado em 15-25 min')).toBeVisible();
    await page.getByRole('button', { name: 'Avançar', exact: true }).click();
    await page.getByRole('button', { name: 'Avançar', exact: true }).click();
    await expect(page.getByRole('button', { name: /Finalizar Pedido/ })).toContainText('12.00');
    // Do not submit an order: this test only exercises the checkout presentation.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
