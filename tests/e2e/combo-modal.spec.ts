import { expect, test, type Page } from '@playwright/test';

const categoryId = '507f1f77bcf86cd799439011';
const comboId = '507f1f77bcf86cd799439012';
const itemId = '507f1f77bcf86cd799439013';

async function mockComboStore(page: Page) {
  const component = {
    _id: itemId,
    categoriaId: categoryId,
    tipo: 'produto',
    nome: 'Hambúrguer incluso',
    descricao: 'Item principal',
    preco: 18,
    ativo: true,
    esgotado: false,
    exclusivo_combo: true,
    grupos_adicionais: [],
  };
  const combo = {
    _id: comboId,
    categoriaId: categoryId,
    tipo: 'combo',
    combo_mode: 'fixed',
    combo_preco_base_centavos: 2500,
    combo_itens_fixos: [{ produtoId: itemId, quantidade: 1 }],
    combo_etapas: [],
    nome: 'Combo E2E',
    descricao: 'Combo usado no teste do modal',
    preco: 25,
    ativo: true,
    esgotado: false,
  };

  await page.route(`**/api/public/stores/combo-e2e/products/${comboId}`, (route) => route.fulfill({
    json: { success: true, product: combo, relatedProducts: [component] },
  }));
  await page.route('**/api/public/stores/combo-e2e/store', (route) => route.fulfill({
    json: {
      success: true,
      tenant: { slug: 'combo-e2e' },
      settings: {
        nome_loja: 'Loja Combo',
        is_open: true,
        tempo_entrega: '30 min',
        fidelidade_ativa: false,
        logisticsOptions: { allowPickup: true, allowDelivery: false },
        theme: { primaryColor: '#059669' },
      },
      categories: [{ _id: categoryId, nome: 'Combos' }],
      products: [combo, component],
      blocks: [],
    },
  }));
  await page.route('**/api/customer/stores/combo-e2e/auth/session', (route) => route.fulfill({
    json: { success: true, authenticated: false, user: null },
  }));
}

test('combo fecha pelo backdrop e Escape sem fechar ao interagir dentro', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockComboStore(page);
  await page.goto('/combo-e2e');

  const openCombo = () => page.getByText('Combo E2E', { exact: true }).first().click();
  await openCombo();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Combo E2E' })).toBeVisible();

  await dialog.getByText(/Combo pronto com/).click();
  await expect(dialog).toBeVisible();

  await page.mouse.click(24, 450);
  await expect(dialog).toBeHidden();

  await openCombo();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('combo mobile mantém fechamento explícito no botão', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await mockComboStore(page);
  await page.goto('/combo-e2e');
  await page.getByText('Combo E2E', { exact: true }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
