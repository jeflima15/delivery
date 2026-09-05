import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  test(`appearance saves independently and remains usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const payloads: Record<string, unknown>[] = [];
    let mapReads = 0;
    const settings = {
      updatedAt: '2026-09-05T12:00:00.000Z',
      nome_loja: 'Loja Visual', tagline: 'Sabor de verdade', sobre_texto: '',
      whatsapp: '24999999999', instagram_url: '@lojavisual', logo_url: '', capa_url: '',
      logoShape: 'squircle', theme: { primaryColor: '#059669' },
      cep_loja: '12345000', rua_loja: '', numero_loja: '', bairro_loja: '', cidade_loja: 'Cidade Pequena', estado_loja: 'SP',
      logisticsOptions: { allowDelivery: true, allowPickup: true },
    };
    await page.route('**/api/tenant/stores/visual-e2e/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/me')) return route.fulfill({ json: {
        success: true, account: { id: '507f1f77bcf86cd799439011', name: 'Admin' },
        tenant: { id: '507f1f77bcf86cd799439012', slug: 'visual-e2e', name: 'Loja Visual' },
        membership: { role: 'tenant_owner' }, permissions: ['settings:read', 'settings:write'],
      } });
      if (path.endsWith('/delivery-regions')) {
        mapReads++;
        return route.fulfill({ json: { success: true, publicationId: 'mapa', storeLocation: { latitude: undefined, longitude: undefined }, regions: [] } });
      }
      if (path.endsWith('/settings')) {
        if (route.request().method() === 'PATCH') {
          payloads.push(route.request().postDataJSON());
          return route.fulfill({ json: { success: true, settings: { ...settings, ...payloads.at(-1), updatedAt: '2026-09-05T12:01:00.000Z' } } });
        }
        return route.fulfill({ json: { success: true, settings } });
      }
      return route.fulfill({ json: { success: true, items: [], metrics: {}, weekly: [], recentOrders: [] } });
    });

    await page.goto('/visual-e2e/admin/loja');
    await page.getByPlaceholder('Ex: Burger House').fill('Loja Visual Premium');
    await page.getByRole('button', { name: 'Salvar alterações', exact: false }).last().click();
    await expect(page.getByText('Configurações salvas com sucesso', { exact: true })).toBeVisible();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ nome_loja: 'Loja Visual Premium', expectedSettingsUpdatedAt: settings.updatedAt });
    expect(payloads[0]).not.toHaveProperty('deliveryRegions');
    expect(payloads[0]).not.toHaveProperty('cep_loja');
    expect(mapReads).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`appearance-${width}.png`), fullPage: true });
  });
}
