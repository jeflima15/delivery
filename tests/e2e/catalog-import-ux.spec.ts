import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  test(`prévia salva o editor e bloqueia resultado antigo após falha em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const id = '507f1f77bcf86cd799439014';
    const draft = {
      id, status: 'reviewing', revision: 1, analysisGeneration: 1,
      source: { originalName: 'cardapio.png' },
      workingPlan: { categories: [{ key: 'cat', name: 'Lanches' }], products: [{ key: 'p', kind: 'product', name: 'Hambúrguer', description: '', basePriceCents: 1200, categoryKey: 'cat' }], complementGroups: [], images: [], storePolicyProposals: [] },
      decisions: {}, reconciliation: { duplicates: [] }, readiness: { canConfirm: true, deterministicIssues: [] },
      analysis: { data: { unresolved: [], modelingChoices: [], sourceEvidence: { photos: [], productCandidates: [] } } },
      createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    };
    let rejectReview = false; const calls: string[] = [];
    await page.route('**/api/platform/auth/csrf?*', route => route.fulfill({ json: { success: true, csrfToken: 'test-csrf' } }));
    await page.route('**/api/tenant/stores/import-ux/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/me')) return route.fulfill({ json: { success: true, account: { id: 'admin', name: 'Admin' }, tenant: { id: 'tenant', slug: 'import-ux', name: 'Loja UX', isOpen: true, onboarding: { completed: true } }, membership: { role: 'tenant_owner' }, permissions: ['catalog:read', 'catalog:write'] } });
      if (path.endsWith('/catalog-imports')) return route.fulfill({ json: { success: true, items: [draft], limits: { image: 3145728, pdf: 20971520 } } });
      if (path.endsWith('/review')) {
        calls.push('review');
        if (rejectReview) return route.fulfill({ status: 409, json: { success: false, error: { code: 'REVISION_CONFLICT', message: 'Rascunho mudou. Recarregue.' } } });
        const body = route.request().postDataJSON(); expect(body.expectedRevision).toBe(draft.revision);
        draft.workingPlan.products[0].name = body.operations[0].patch.name; draft.revision++;
        return route.fulfill({ json: { success: true, import: draft } });
      }
      if (path.endsWith('/preview')) { calls.push('preview'); return route.fulfill({ json: { success: true, previewHash: 'hash-' + draft.revision, preview: { categories: { created: 1 }, products: { created: 1 }, images: 0 } } }); }
      if (path.endsWith('/' + id)) return route.fulfill({ json: { success: true, import: draft } });
      return route.fulfill({ json: { success: true, items: [], settings: {}, metrics: {} } });
    });
    await page.goto(`/import-ux/admin/catalogo?tab=importar&import=${id}`);
    await page.getByRole('tab', { name: 'Todos os itens' }).click();
    await page.getByRole('button', { name: /Hambúrguer/ }).click();
    const editor = page.locator('#catalog-import-editor');
    await editor.getByLabel('Nome', { exact: true }).fill('Hambúrguer revisado');
    await page.getByRole('button', { name: 'Visualizar o que será criado' }).click();
    await expect(page.getByRole('heading', { name: 'Confira antes de criar' })).toBeVisible();
    expect(calls).toEqual(['review', 'preview']); expect(draft.workingPlan.products[0].name).toBe('Hambúrguer revisado');
    await page.screenshot({ path: testInfo.outputPath(`importacao-${width}.png`), fullPage: true });
    rejectReview = true;
    await editor.getByLabel('Nome', { exact: true }).fill('Outro nome');
    await expect(page.getByRole('button', { name: 'Confirmar importação' })).toBeHidden();
    await page.getByRole('button', { name: 'Visualizar o que será criado' }).click();
    await expect(page.getByText('Rascunho mudou. Recarregue.', { exact: true })).toBeVisible();
    expect(calls).toEqual(['review', 'preview', 'review']);
    await expect(page.getByRole('button', { name: 'Confirmar importação' })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
