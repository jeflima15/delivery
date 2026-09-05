import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  test(`grupos de complementos seguem a densidade do catálogo em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/tenant/stores/complementos-e2e/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/me')) return route.fulfill({ json: {
        success: true,
        account: { id: '507f1f77bcf86cd799439011', name: 'Admin' },
        tenant: {
          id: '507f1f77bcf86cd799439012', slug: 'complementos-e2e', name: 'Loja Complementos',
          isOpen: true, onboarding: { completed: true },
        },
        membership: { role: 'tenant_owner' },
        permissions: ['orders:read', 'catalog:read', 'catalog:write'],
      } });
      if (path.endsWith('/orders/active')) return route.fulfill({ json: { success: true, items: [] } });
      if (path.endsWith('/categories')) return route.fulfill({ json: { success: true, items: [
        { _id: '507f1f77bcf86cd799439013', nome: 'Lanches' },
      ] } });
      if (path.endsWith('/products')) return route.fulfill({ json: { success: true, items: [
        { _id: '507f1f77bcf86cd799439014', nome: 'X-Burger', categoriaId: '507f1f77bcf86cd799439013', ativo: true },
      ] } });
      if (path.endsWith('/complement-groups')) return route.fulfill({ json: { success: true, items: [
        {
          _id: '507f1f77bcf86cd799439015', nome: 'Troca de acompanhamento', obrigatorio: false,
          minimo: 0, maximo: 1, ativo: true,
          itens: [{ nome: 'Batata frita', preco: 2, maximo: 1, ativo: true }],
          produtos_vinculados: [{ _id: '507f1f77bcf86cd799439014', nome: 'X-Burger' }],
          categorias_vinculadas: [],
        },
      ] } });
      return route.fulfill({ json: { success: true, items: [], metrics: {}, settings: {} } });
    });

    await page.goto('/complementos-e2e/admin/catalogo');
    await page.getByRole('button', { name: 'Grupos de Complementos', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Grupos de complementos', exact: true })).toBeVisible();
    await expect(page.getByText('1 grupo', { exact: true })).toBeVisible();
    await expect(page.getByText('1 ativo', { exact: true })).toBeVisible();
    await expect(page.getByText('Troca de acompanhamento', { exact: true })).toBeVisible();
    await expect(page.getByText('Total de Grupos', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Novo grupo', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Novo Grupo de Complementos' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Criar Grupo' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`complementos-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
