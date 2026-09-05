import { expect, test } from '@playwright/test';
import type { DeliveryRegionsDraft } from '../../src/types/deliveryRegions';

for (const scenario of ['active-map', 'inactive-map', 'legacy-bairro', 'legacy-regiao', 'legacy-pin', 'empty-map'] as const) {
  test(`joint settings save: ${scenario}`, async ({ page }) => {
    const payloads: Array<{ deliveryRegions?: DeliveryRegionsDraft; tipo_taxa_entrega?: string; taxas_bairros?: Array<{ ativo: boolean }>; taxa_bairro_padrao?: number | null; bloquear_bairros_nao_atendidos?: boolean }> = [];
    let mapReads = 0;
    let geocodes = 0;
    const settings = {
      nome_loja: 'Mapa E2E', tipo_taxa_entrega: scenario === 'legacy-bairro' ? 'bairro' : scenario === 'legacy-regiao' ? 'regiao' : 'bairro_regiao',
      cep_loja: '27512112', rua_loja: 'Rua Teste', numero_loja: '10', bairro_loja: 'Centro', cidade_loja: 'Resende', estado_loja: 'RJ',
      logisticsOptions: { allowDelivery: true, allowPickup: true },
      taxas_bairros: [{ nome: 'Centro', cidade: 'Resende', estado: 'RJ', valor: 5, ativo: true }],
      bloquear_bairros_nao_atendidos: false, taxa_bairro_padrao: null,
    };
    const map: DeliveryRegionsDraft = {
      storeLocation: { latitude: -22.46, longitude: -44.45, confirmed: true,
        ...(scenario === 'legacy-pin' ? {} : { addressKey: '27512112|rua teste|10|centro|resende|rj' }) },
      regions: scenario === 'empty-map' ? [] : [{
        name: 'Area salva', sourceType: 'polygon', active: scenario !== 'inactive-map', blocked: false,
        priority: 0, feeCents: 500,
        geometry: { type: 'Polygon', coordinates: [[[-44.47, -22.47], [-44.46, -22.47], [-44.46, -22.45], [-44.47, -22.47]]] },
      }],
    };
    await page.route('**/api/tenant/stores/mapa-e2e/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/me')) return route.fulfill({ json: {
        success: true, account: { id: '507f1f77bcf86cd799439011', name: 'Admin' },
        tenant: { id: '507f1f77bcf86cd799439012', slug: 'mapa-e2e', name: 'Mapa E2E' },
        membership: { role: 'tenant_owner' }, permissions: ['settings:read', 'settings:write'],
      } });
      if (path.endsWith('/settings')) {
        if (route.request().method() === 'PATCH') payloads.push(route.request().postDataJSON());
        return route.fulfill({ json: { success: true, settings } });
      }
      if (path.endsWith('/delivery-regions')) {
        expect(route.request().method()).toBe('GET');
        mapReads++;
        return route.fulfill({ json: { success: true, publicationId: 'saved', ...map } });
      }
      if (path.includes('geocode')) geocodes++;
      return route.fulfill({ json: { success: true, items: [], settings, metrics: {}, weekly: [], recentOrders: [] } });
    });
    await page.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ json: {
      version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#edf2f7' } }],
    } }));
    await page.goto('/mapa-e2e/admin/loja');
    await page.getByRole('button', { name: 'Entrega e Pagamento', exact: true }).last().click();
    expect(mapReads).toBe(0);
    await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
    if (['active-map', 'inactive-map', 'legacy-pin', 'empty-map'].includes(scenario)) {
      await page.getByRole('tab', { name: 'Mapa', exact: true }).click();
      await expect(page.locator('.maplibregl-canvas')).toBeVisible();
      if (scenario === 'legacy-pin') {
        await expect(page.getByText(/Posição salva preservada/)).toBeVisible();
        expect(geocodes).toBe(0);
        await page.getByRole('button', { name: 'Confirmar posição da loja', exact: true }).click();
      }
      await page.getByRole('tab', { name: 'Bairros', exact: true }).click();
    }
    await page.getByRole('button', { name: /Salvar alterações/i }).last().click();
    if (['inactive-map', 'legacy-bairro', 'empty-map'].includes(scenario)) {
      await expect(page.getByText('Informe uma taxa padrão válida. Para entrega grátis, digite 0.', { exact: true })).toBeVisible();
      expect(payloads).toHaveLength(0);
      await page.getByPlaceholder('Ex.: 10.00').fill('0');
      await page.getByRole('button', { name: /Salvar alterações/i }).last().click();
    }
    await expect(page.getByText('Configurações salvas com sucesso', { exact: true })).toBeVisible();
    expect(payloads).toHaveLength(1);
    expect(payloads[0].tipo_taxa_entrega).toBe('bairro_regiao');
    expect(geocodes).toBe(0);
    if (scenario.startsWith('legacy-') && scenario !== 'legacy-pin') {
      expect(mapReads).toBe(0);
      expect(payloads[0].deliveryRegions).toBeUndefined();
    } else {
      expect(payloads[0].deliveryRegions?.regions[0]?.deliveryTimeMin).toBeUndefined();
      expect(payloads[0].deliveryRegions?.regions[0]?.deliveryTimeMax).toBeUndefined();
    }
    if (scenario === 'legacy-regiao') {
      expect(payloads[0].taxas_bairros?.[0].ativo).toBe(false);
      expect(payloads[0].taxa_bairro_padrao).toBeNull();
      expect(payloads[0].bloquear_bairros_nao_atendidos).toBe(true);
    }
  });
}
