import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  test(`preorder draft saves and reloads without enabling checkout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let settings: Record<string, unknown> = { updatedAt: '2026-09-13T12:00:00.000Z', nome_loja: 'Atelie Teste', is_open: true, logisticsOptions: { allowPickup: true, allowDelivery: false } };
    const payloads: Record<string, unknown>[] = [];
    await page.route('**/api/tenant/stores/agenda-e2e/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/me')) return route.fulfill({ json: {
        success: true, account: { id: '507f1f77bcf86cd799439011', name: 'Admin' },
        tenant: { id: '507f1f77bcf86cd799439012', slug: 'agenda-e2e', name: 'Atelie Teste' },
        membership: { role: 'tenant_owner' }, permissions: ['settings:read', 'settings:write'],
      } });
      if (path.endsWith('/settings')) {
        if (route.request().method() === 'PATCH') {
          const payload = route.request().postDataJSON();
          payloads.push(payload);
          settings = { ...settings, ...payload, updatedAt: '2026-09-13T12:01:00.000Z' };
        }
        return route.fulfill({ json: { success: true, settings } });
      }
      return route.fulfill({ json: { success: true, items: [], metrics: {}, weekly: [], recentOrders: [] } });
    });
    await page.goto('/agenda-e2e/admin/loja');
    await page.getByRole('button', { name: 'Horários & Operação', exact: false }).click();
    const agenda = page.getByRole('region', { name: 'Agenda de encomendas' });
    await expect(agenda.getByText('Encomendas desativadas.', { exact: false })).toBeVisible();
    await agenda.getByLabel('Como você pretende vender?').selectOption('scheduled_only');
    await agenda.getByLabel('Quanto tempo precisa para preparar?').fill('3');
    await agenda.getByLabel('Máximo de pedidos por dia', { exact: true }).fill('5');
    await agenda.getByLabel('Segunda-feira', { exact: true }).check();
    await agenda.getByText('Datas especiais e folgas', { exact: false }).click();
    await agenda.getByRole('button', { name: 'Adicionar data especial', exact: true }).click();
    await agenda.getByLabel('Data especial 1', { exact: true }).fill('2026-12-25');
    await agenda.getByLabel('Máximo de pedidos por dia', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Salvar alterações', exact: false }).last().click();
    await expect(agenda.getByRole('alert')).toContainText('maiores que zero');
    expect(payloads).toHaveLength(0);
    await agenda.getByLabel('Máximo de pedidos por dia', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Salvar alterações', exact: false }).last().click();
    await expect(page.getByText('Configurações salvas com sucesso', { exact: true })).toBeVisible();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ expectedSettingsUpdatedAt: '2026-09-13T12:00:00.000Z', preorderDraft: {
      salesMode: 'scheduled_only', minLeadMinutes: 4320, maxOrdersPerDay: 5,
      weeklySchedule: [{ weekday: 1, intervals: [{ start: '09:00', end: '18:00' }] }],
      dateOverrides: [{ date: '2026-12-25', intervals: [] }],
    } });
    expect(payloads[0]).not.toHaveProperty('deliveryRegions');
    await page.reload();
    if (!await agenda.isVisible()) await page.getByRole('button', { name: 'Horários & Operação', exact: false }).click();
    await expect(agenda.getByLabel('Quanto tempo precisa para preparar?')).toHaveValue('3');
    await expect(agenda.getByLabel('Segunda-feira', { exact: true })).toBeChecked();
    await expect(agenda.getByLabel('Como você pretende vender?')).toHaveValue('scheduled_only');
    await agenda.getByLabel('Ativar encomendas no cardápio').check();
    await page.getByRole('button', { name: 'Salvar alterações', exact: false }).last().click();
    await expect.poll(() => payloads.length).toBe(2);
    expect(payloads[1]).toMatchObject({ preorderEnabled: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await agenda.screenshot({ path: testInfo.outputPath(`preorder-${width}.png`) });
  });
}
