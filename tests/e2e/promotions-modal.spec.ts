import { expect, test, type Page } from '@playwright/test';

async function mockPromotionsStore(page: Page) {
  await page.route('**/api/public/stores/promotions-e2e/store', (route) => route.fulfill({
    json: {
      success: true,
      tenant: { slug: 'promotions-e2e' },
      settings: {
        nome_loja: 'Loja Promoções', is_open: true, fidelidade_ativa: false,
        logisticsOptions: { allowPickup: true, allowDelivery: false },
        theme: { primaryColor: '#059669' },
      },
      categories: [{ _id: '507f1f77bcf86cd799439011', nome: 'Lanches' }],
      products: [{
        _id: '507f1f77bcf86cd799439012', categoriaId: '507f1f77bcf86cd799439011',
        nome: 'Lanche em promoção', preco: 12, preco_antigo: 18, ativo: true,
        esgotado: false, grupos_adicionais: [],
      }],
      blocks: [],
    },
  }));
  await page.route('**/api/customer/stores/promotions-e2e/auth/session', (route) => route.fulfill({
    json: { success: true, authenticated: false, user: null },
  }));
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 393, height: 852 }]) {
  test(`promoções fecham pelo X e pelo backdrop em ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockPromotionsStore(page);
    await page.goto('/promotions-e2e?origem=teste');
    await expect(page.getByRole('heading', { name: 'Promoções', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Promoções', exact: true }).filter({ visible: true }).first().click();
    const title = page.getByRole('heading', { name: 'Promoções', exact: true });
    await expect(title).toBeVisible();
    await expect(page).toHaveURL(/#promocoes$/);
    // Click the visible X itself, exercising the SVG hit target as well as the button.
    const close = page.getByRole('button', { name: 'Fechar promoções', exact: true });
    const box = await close.boundingBox();
    if (!box) throw new Error('Botão de fechamento não está visível');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(title).toBeHidden();
    await expect(page).toHaveURL(/\/promotions-e2e\?origem=teste$/);

    await page.getByRole('button', { name: 'Promoções', exact: true }).filter({ visible: true }).first().click();
    await expect(title).toBeVisible();
    await title.click();
    await expect(title).toBeVisible();
    await page.mouse.click(4, viewport.height / 2);
    await expect(title).toBeHidden();
    await expect(page).toHaveURL(/\/promotions-e2e\?origem=teste$/);
    await page.reload();
    await expect(page.getByText('Lanche em promoção', { exact: true }).first()).toBeVisible();
    await expect(title).toBeHidden();
  });
}
