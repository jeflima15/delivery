import { expect, test } from '@playwright/test';
import type { DeliveryRegionsDraft } from '../../src/types/deliveryRegions';

for (const width of [393, 1440]) {
test(`mapa desenha circulo arrastando e mantem rascunho em ${width}px`, async ({ page }, testInfo) => {
  const mapErrors: string[] = [];
  page.on('pageerror', (error) => mapErrors.push(error.message));
  page.on('console', (message) => { if (/Expected value to be of type/.test(message.text())) mapErrors.push(message.text()); });
  await page.setViewportSize({ width, height: 1000 });
  let publications = 0;
  let jointPayload: {
    deliveryRegions?: DeliveryRegionsDraft;
    tipo_taxa_entrega?: string;
    expectedSettingsUpdatedAt?: string;
    taxas_bairros?: Array<{ nome: string; cidade: string }>;
  } = {};
  let rejectSave = true;
  const settings = {
    updatedAt: '2026-09-05T12:00:00.000Z',
    taxas_bairros: [{ nome: 'Centro (Itatiaia)', valor: 5, ativo: true }],
    nome_loja: 'Mapa E2E', tipo_taxa_entrega: 'regiao',
    cep_loja: '27512112', rua_loja: 'Rua Teste', numero_loja: '10', bairro_loja: 'Centro', cidade_loja: 'Resende', estado_loja: 'RJ',
    logisticsOptions: { allowDelivery: true, allowPickup: true },
  };
  await page.route('**/api/tenant/stores/mapa-e2e/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me')) return route.fulfill({ json: {
      success: true, account: { id: '507f1f77bcf86cd799439011', name: 'Admin teste' },
      tenant: { id: '507f1f77bcf86cd799439012', slug: 'mapa-e2e', name: 'Mapa E2E' },
      membership: { role: 'tenant_owner' }, permissions: ['settings:read', 'settings:write'],
    } });
    if (path.endsWith('/settings')) {
      if (route.request().method() === 'PATCH') {
        jointPayload = route.request().postDataJSON();
        if (rejectSave) return route.fulfill({ status: 400, json: { error: { message: 'Falha simulada' } } });
        publications++;
      }
      return route.fulfill({ json: { success: true, settings } });
    }
    if (path.endsWith('/delivery-regions')) {
      if (route.request().method() !== 'GET') publications++;
      return route.fulfill({ json: { success: true, regions: [], storeLocation: {
        latitude: -22.46, longitude: -44.45, confirmed: true,
        addressKey: '27512112|rua teste|10|centro|resende|rj',
      } } });
    }
    return route.fulfill({ json: { success: true, items: [], settings, metrics: {}, weekly: [], recentOrders: [] } });
  });
  // Test interaction deterministically without external tiles or geocoding.
  await page.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({
    json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#edf2f7' } }] },
  }));
  await page.goto('/mapa-e2e/admin/loja');
  await page.getByRole('button', { name: 'Entrega e Pagamento', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Por distância', exact: true })).toHaveCount(0);
  for (const name of ['Bairros + mapa', 'Taxa Fixa']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Área circular', exact: true }).click();
  const canvas = page.locator('.maplibregl-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Mapa sem dimensoes');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (width < 1024) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 10, y: y + step * 6 }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y + 50, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.getByLabel('Raio (km)', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Raio da região: arraste para redimensionar' })).toBeVisible();
  if (width >= 1024) {
    const radius = page.getByLabel('Raio (km)', { exact: false });
    const before = await radius.inputValue();
    await page.getByRole('button', { name: 'Raio da região: arraste para redimensionar' }).scrollIntoViewIfNeeded();
    const handle = await page.getByRole('button', { name: 'Raio da região: arraste para redimensionar' }).boundingBox();
    if (!handle) throw new Error('Alca ausente');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2 - 30, { steps: 8 });
    await page.mouse.up();
    await expect(radius).not.toHaveValue(before);
  }
  await expect(page.getByText('Rascunho do mapa alterado. Use Salvar alterações para aplicar junto com a loja.')).toBeVisible();
  expect(publications).toBe(0);
  expect(mapErrors).toEqual([]);
  await canvas.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`map-${width}.png`) });
  const radius = page.getByLabel('Raio (km)', { exact: false });
  const savedRadius = await radius.inputValue();
  await page.getByRole('tab', { name: 'Bairros', exact: true }).click();
  await expect(canvas).toBeHidden();
  await page.getByRole('checkbox', { name: 'Bloquear bairros não listados quando não houver mapa ativo' }).locator('..').click();
  const fallback = page.getByPlaceholder('Ex.: 10.00');
  await fallback.fill('0');
  await page.getByRole('button', { name: /Salvar alterações/i }).last().click();
  await expect(page.getByRole('alert').getByText('Falha simulada', { exact: true })).toBeVisible();
  await expect(fallback).toHaveValue('0');
  await page.getByRole('tab', { name: 'Mapa', exact: true }).click();
  await expect(radius).toHaveValue(savedRadius);
  expect(jointPayload.deliveryRegions?.regions).toHaveLength(1);
  expect(jointPayload.tipo_taxa_entrega).toBe('bairro_regiao');
  expect(jointPayload.expectedSettingsUpdatedAt).toBe(settings.updatedAt);
  expect(jointPayload.taxas_bairros).toHaveLength(1);
  expect(jointPayload.taxas_bairros?.[0]).toMatchObject({ nome: 'Centro', cidade: 'Itatiaia' });
  expect(publications).toBe(0);
  rejectSave = false;
  await page.getByRole('button', { name: /Salvar alterações/i }).last().click();
  await expect(page.getByText('Configurações salvas com sucesso', { exact: true })).toBeVisible();
  expect(publications).toBe(1);
  expect(jointPayload.expectedSettingsUpdatedAt).toBe(settings.updatedAt);
  expect(jointPayload.taxas_bairros?.[0]).toMatchObject({ nome: 'Centro', cidade: 'Itatiaia' });
  await radius.fill('9');
  await page.getByRole('tab', { name: 'Bairros', exact: true }).click();
  await fallback.fill('12');
  await page.getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(fallback).toHaveValue('0');
  await page.getByRole('tab', { name: 'Mapa', exact: true }).click();
  await expect(radius).toHaveValue(savedRadius);
  await expect(page.getByRole('button', { name: 'Publicar regiões' })).toHaveCount(0);
});
}
