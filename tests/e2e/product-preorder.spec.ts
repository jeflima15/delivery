import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  for (const kind of ['produto', 'combo']) {
    test(`saves and restores preorder rules for ${kind} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const id = '507f1f77bcf86cd799439014';
      const categoryId = '507f1f77bcf86cd799439013';
      const base = { _id: '507f1f77bcf86cd799439015', tipo: 'produto', nome: 'Brigadeiro', preco: 5, ativo: true, categoriaId: categoryId };
      let product: Record<string, unknown> = {
        _id: id, tipo: kind, nome: kind === 'combo' ? 'Kit Festa' : 'Bolo Artesanal', preco: 120, preco_antigo: 0,
        descricao: '', imagem: '', controlar_estoque: false, ativo: true, categoriaId: categoryId,
        grupos_adicionais: [], updatedAt: '2026-09-13T12:00:00.000Z',
        ...(kind === 'combo' ? { combo_mode: 'fixed', combo_preco_base_centavos: 12000, combo_itens_fixos: [{ produtoId: base._id, quantidade: 10 }], combo_etapas: [] } : {}),
      };
      const payloads: Record<string, unknown>[] = [];
      await page.route('**/api/tenant/stores/product-agenda/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/me')) return route.fulfill({ json: {
          success: true, account: { id: '507f1f77bcf86cd799439011', name: 'Admin' },
          tenant: { id: '507f1f77bcf86cd799439012', slug: 'product-agenda', name: 'Atelie', isOpen: true, onboarding: { completed: true } },
          membership: { role: 'tenant_owner' }, permissions: ['catalog:read', 'catalog:write'],
        } });
        if (path.endsWith('/categories')) return route.fulfill({ json: { success: true, items: [{ _id: categoryId, nome: 'Festas' }] } });
        if (path.endsWith(`/products/${id}`) && route.request().method() === 'PUT') {
          const payload = route.request().postDataJSON();
          payloads.push(payload);
          product = { ...product, ...payload, updatedAt: `2026-09-13T12:0${payloads.length}:00.000Z` };
          return route.fulfill({ json: { success: true, product } });
        }
        if (path.endsWith('/products')) return route.fulfill({ json: { success: true, items: [product, base] } });
        return route.fulfill({ json: { success: true, items: [], settings: {}, metrics: {} } });
      });
      await page.goto('/product-agenda/admin/catalogo');
      await page.getByRole('button', { name: 'Cadastro de Produtos', exact: true }).last().click();
      await page.getByPlaceholder('Buscar por nome, descrição ou categoria...').fill(String(product.nome));
      const edit = width < 768 ? page.getByRole('button', { name: 'Editar', exact: true }) : page.getByTitle('Editar produto');
      await edit.click();
      const details = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Forma de venda', exact: true }) }).last();
      await expect(details.getByText('Estas regras valem', { exact: false })).toBeVisible();
      await details.getByLabel('Como este item poderá ser vendido?').selectOption('scheduled_only');
      await details.getByLabel('Usar o tempo de preparo da loja').uncheck();
      await details.getByLabel('Tempo de preparo deste item', { exact: true }).fill('3');
      await details.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`product-preorder-${kind}-${width}.png`) });
      const save = page.getByRole('button', { name: kind === 'combo' ? 'Salvar Alterações' : 'Salvar Produto', exact: true });
      await save.click();
      await expect(details).toHaveCount(0);
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({ expectedUpdatedAt: '2026-09-13T12:00:00.000Z', controlar_estoque: false, preorderDraft: { availability: 'scheduled_only', minLeadMinutes: 4320 } });
      await page.reload();
      if (!await page.getByPlaceholder('Buscar por nome, descrição ou categoria...').isVisible()) {
        await page.getByRole('button', { name: 'Cadastro de Produtos', exact: true }).last().click();
      }
      await page.getByPlaceholder('Buscar por nome, descrição ou categoria...').fill(String(product.nome));
      await edit.click();
      await expect(details.getByLabel('Como este item poderá ser vendido?')).toHaveValue('scheduled_only');
      await expect(details.getByLabel('Tempo de preparo deste item', { exact: true })).toHaveValue('3');
      await details.getByLabel('Usar o tempo de preparo da loja').check();
      await details.getByLabel('Como este item poderá ser vendido?').selectOption('immediate_only');
      await expect(details.getByLabel('Como este item poderá ser vendido?')).toHaveValue('immediate_only');
      await save.click();
      await expect(details).toHaveCount(0);
      expect(payloads).toHaveLength(2);
      expect(payloads[1]).toMatchObject({ expectedUpdatedAt: '2026-09-13T12:01:00.000Z', preorderDraft: { availability: 'immediate_only', minLeadMinutes: null } });
      await page.getByRole('button', { name: 'Alterar forma de venda em lote' }).click();
      const bulk = page.getByRole('dialog', { name: 'Alterar forma de venda' });
      await bulk.getByLabel('Selecionar todos (1)').check();
      await bulk.getByLabel('Vender como').selectOption('scheduled_only');
      await bulk.getByRole('button', { name: 'Aplicar a 1 produto(s)' }).click();
      await bulk.getByRole('button', { name: 'Confirmar alteração' }).click();
      await expect(bulk.getByRole('status')).toContainText('1 produto(s) atualizados');
      expect(payloads[2]).toEqual({ expectedUpdatedAt: '2026-09-13T12:02:00.000Z', preorderDraft: { availability: 'scheduled_only', minLeadMinutes: null } });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}
