import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  test(`map layers render without console or page errors at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width, height: 1000 });
    const settings = {
      nome_loja: 'Mapa E2E', tipo_taxa_entrega: 'regiao',
      cep_loja: '27512112', rua_loja: 'Rua Teste', numero_loja: '10', bairro_loja: 'Centro', cidade_loja: 'Resende', estado_loja: 'RJ',
      logisticsOptions: { allowDelivery: true, allowPickup: true },
    };
    const regions = [
      { name: 'Active area', active: true, blocked: false },
      { name: 'Blocked area', active: true, blocked: true },
      { name: 'Inactive area', active: false, blocked: false },
    ].map((region, index) => ({
      ...region, id: `region-${index}`, priority: index, sourceType: 'polygon',
      feeCents: 500, deliveryTimeMin: 20, deliveryTimeMax: 40,
      geometry: { type: 'Polygon', coordinates: [[[-44.47 + index * 0.01, -22.47], [-44.46 + index * 0.01, -22.47], [-44.46 + index * 0.01, -22.45], [-44.47 + index * 0.01, -22.45], [-44.47 + index * 0.01, -22.47]]] },
    }));
    await page.route('**/api/tenant/stores/mapa-e2e/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/me')) return route.fulfill({ json: {
        success: true, account: { id: '507f1f77bcf86cd799439011', name: 'Admin' },
        tenant: { id: '507f1f77bcf86cd799439012', slug: 'mapa-e2e', name: 'Mapa E2E' },
        membership: { role: 'tenant_owner' }, permissions: ['settings:read', 'settings:write'],
      } });
      if (path.endsWith('/settings')) return route.fulfill({ json: { success: true, settings } });
      if (path.endsWith('/delivery-regions')) return route.fulfill({ json: {
        success: true, regions, storeLocation: { latitude: -22.46, longitude: -44.45, confirmed: true, addressKey: '27512112|rua teste|10|centro|resende|rj' },
      } });
      return route.fulfill({ json: { success: true, items: [], settings, metrics: {}, weekly: [], recentOrders: [] } });
    });
    await page.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ json: {
      version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#edf2f7' } }],
    } }));
    await page.goto('/mapa-e2e/admin/loja');
    await page.getByRole('button', { name: 'Entrega e Pagamento', exact: true }).last().click();
    await page.getByRole('tab', { name: 'Mapa', exact: true }).click();
    const canvas = page.locator('.maplibregl-canvas');
    await expect(canvas).toBeVisible();
    // Allow worker source updates and paint expressions to run, not just React commits.
    const render = async () => { await page.waitForTimeout(400); expect(errors).toEqual([]); };
    await render();
    await page.getByRole('button', { name: /Active area/ }).first().click();
    await render();
    await page.getByRole('button', { name: 'Área circular', exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Map has no bounds');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y + 40, { steps: 5 });
    await render();
    await page.mouse.up();
    await expect(page.getByLabel('Raio (km)', { exact: false })).toBeVisible();
    await render();
    await page.getByRole('button', { name: 'Desenhar polígono', exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    for (const point of [{ x: 30, y: 80 }, { x: 110, y: 80 }, { x: 80, y: 150 }]) {
      await canvas.click({ position: point });
      await render();
    }
    await page.getByRole('button', { name: 'Concluir', exact: true }).click();
    await render();
    expect(errors).toEqual([]);
  });
}
