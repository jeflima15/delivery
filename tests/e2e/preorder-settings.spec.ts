import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  test(`sales mode guides setup and publishes the matching checkout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let settings: Record<string, unknown> = { updatedAt: '2026-09-13T12:00:00.000Z', nome_loja: 'Atelie Teste', is_open: true, logisticsOptions: { allowPickup: true, allowDelivery: false }, preorderEnabled: false, preorderDraft: { salesMode: 'scheduled_only' } };
    const payloads: Record<string, unknown>[] = [];
    await page.route('**/api/tenant/stores/agenda-e2e/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/me')) return route.fulfill({ json: {
        success: true, account: { id: '507f1f77bcf86cd799439011', name: 'Admin' },
        tenant: { id: '507f1f77bcf86cd799439012', slug: 'agenda-e2e', name: 'Atelie Teste' },
        membership: { role: 'tenant_owner' }, permissions: ['settings:read', 'settings:write', 'operation:write', 'catalog:read'],
      } });
      if (path.endsWith('/settings')) {
        if (route.request().method() === 'PATCH') {
          const payload = route.request().postDataJSON();
          payloads.push(payload);
          settings = { ...settings, ...payload, updatedAt: '2026-09-13T12:01:00.000Z' };
        }
        return route.fulfill({ json: { success: true, settings } });
      }
      if (path.endsWith('/settings/operational-status')) return route.fulfill({ json: {
        success: true, is_open: true, statusText: 'Aberto', abertura_automatica: false,
        pausado_manualmente: false, pausado_ate: null, aberto_manualmente_ate: null,
        preorders: { enabled: settings.preorderEnabled === true, salesMode: settings.preorderEnabled === true ? (settings.preorderDraft as { salesMode?: string } | undefined)?.salesMode || 'immediate_only' : 'immediate_only', acceptingPreorders: (settings.preorderDraft as { acceptingPreorders?: boolean } | undefined)?.acceptingPreorders !== false },
        serverTime: '2026-09-13T12:00:00.000Z',
      } });
      return route.fulfill({ json: { success: true, items: [], metrics: {}, weekly: [], recentOrders: [] } });
    });
    await page.goto('/agenda-e2e/admin/loja');
    await page.getByRole('button', { name: 'Horários & Operação', exact: false }).click();
    await expect(page.getByText('Não aceitando', { exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Pedidos para agora' })).toBeChecked();
    await expect(page.getByText('Regras de encomenda guardadas')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`operation-summary-${width}.png`) });
    const agenda = page.getByRole('region', { name: 'Agenda de encomendas' });
    await expect(agenda).toHaveCount(0);
    await page.getByRole('radio', { name: 'Os dois' }).check();
    await expect(agenda).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Horários dos pedidos para agora' })).toBeVisible();
    await page.getByRole('radio', { name: 'Somente por encomenda' }).check();
    await expect(agenda).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Horários dos pedidos para agora' })).toHaveCount(0);
    await expect(agenda.getByText('Alterações na agenda ainda não publicadas.', { exact: false })).toBeVisible();
    await expect(page.getByText('Modo ainda não publicado')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Revisar produtos em outra aba' })).toHaveAttribute('target', '_blank');
    await expect(page.getByText('Não aceitando', { exact: true })).toBeVisible();
    await agenda.getByLabel('Quanto tempo precisa para preparar?').fill('3');
    await agenda.getByText('Intervalos e limites de pedidos').click();
    await agenda.getByLabel('Máximo de pedidos por dia', { exact: true }).fill('5');
    await agenda.getByText('Dias e horários para entrega ou retirada', { exact: false }).click();
    await agenda.getByLabel('Segunda-feira', { exact: true }).check();
    await agenda.getByText('Datas especiais e folgas', { exact: false }).click();
    await agenda.getByRole('button', { name: 'Adicionar data especial', exact: true }).click();
    await agenda.getByLabel('Data especial 1', { exact: true }).fill('2026-12-25');
    await agenda.getByLabel('Máximo de pedidos por dia', { exact: true }).fill('0');
    await page.getByRole('button', { name: /^Salvar(?: alterações)?$/i }).last().click();
    await expect(agenda.getByRole('alert')).toContainText('maiores que zero');
    expect(payloads).toHaveLength(0);
    await agenda.getByLabel('Máximo de pedidos por dia', { exact: true }).fill('5');
    await page.getByRole('button', { name: /^Salvar(?: alterações)?$/i }).last().click();
    await expect(page.getByText('Configurações salvas com sucesso', { exact: true })).toBeVisible();
    await expect(agenda.getByText('Alterações na agenda ainda não publicadas.', { exact: false })).toHaveCount(0);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ expectedSettingsUpdatedAt: '2026-09-13T12:00:00.000Z', preorderEnabled: true, preorderDraft: {
      salesMode: 'scheduled_only', minLeadMinutes: 4320, maxOrdersPerDay: 5,
      weeklySchedule: [{ weekday: 1, intervals: [{ start: '09:00', end: '18:00' }] }],
      dateOverrides: [{ date: '2026-12-25', intervals: [] }],
    } });
    expect(payloads[0]).not.toHaveProperty('deliveryRegions');
    await page.reload();
    if (!await agenda.isVisible()) await page.getByRole('button', { name: 'Horários & Operação', exact: false }).click();
    await expect(page.getByRole('radio', { name: 'Somente por encomenda' })).toBeChecked();
    await expect(agenda.getByLabel('Quanto tempo precisa para preparar?')).toHaveValue('3');
    await agenda.getByText('Dias e horários para entrega ou retirada', { exact: false }).click();
    await expect(agenda.getByLabel('Segunda-feira', { exact: true })).toBeChecked();
    await agenda.getByLabel('Receber novas encomendas').uncheck();
    await page.getByRole('radio', { name: 'Pedidos para agora' }).check();
    await expect(agenda).toHaveCount(0);
    await expect(page.getByText('Regras de encomenda guardadas')).toBeVisible();
    await page.getByRole('button', { name: /^Salvar(?: alterações)?$/i }).last().click();
    await expect.poll(() => payloads.length).toBe(2);
    expect(payloads[1]).toMatchObject({ preorderEnabled: false, preorderDraft: { salesMode: 'immediate_only', acceptingPreorders: false, weeklySchedule: [{ weekday: 1, intervals: [{ start: '09:00', end: '18:00' }] }] } });
    await expect(page.getByText('Não aceitando', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Somente por encomenda' }).check();
    await expect(agenda.getByLabel('Receber novas encomendas')).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await agenda.screenshot({ path: testInfo.outputPath(`preorder-${width}.png`) });
  });
}

test('manager can operate immediate orders without editing store settings', async ({ page }) => {
  let open = true;
  let toggles = 0;
  let settingWrites = 0;
  await page.route('**/api/tenant/stores/agenda-e2e/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me')) return route.fulfill({ json: {
      success: true, account: { id: '507f1f77bcf86cd799439011', name: 'Gerente' },
      tenant: { id: '507f1f77bcf86cd799439012', slug: 'agenda-e2e', name: 'Atelie Teste' },
      membership: { role: 'tenant_manager' }, permissions: ['settings:read', 'operation:write'],
    } });
    if (path.endsWith('/settings/operational-status')) return route.fulfill({ json: {
      success: true, is_open: open, statusText: open ? 'Aberto' : 'Fechado', abertura_automatica: false,
      pausado_manualmente: false, pausado_ate: null, aberto_manualmente_ate: null,
      preorders: { enabled: true, salesMode: 'both', acceptingPreorders: true }, serverTime: '2026-09-13T12:00:00.000Z',
    } });
    if (path.endsWith('/settings/toggle-status')) {
      toggles += 1;
      open = !open;
      return route.fulfill({ json: { success: true, is_open: open, abertura_automatica: false, pausado_manualmente: false, pausado_ate: null, aberto_manualmente_ate: null, updatedAt: '2026-09-13T12:01:00.000Z' } });
    }
    if (path.endsWith('/settings')) {
      if (route.request().method() === 'PATCH') settingWrites += 1;
      return route.fulfill({ json: { success: true, settings: { nome_loja: 'Atelie Teste', is_open: true, updatedAt: '2026-09-13T12:00:00.000Z', preorderEnabled: true, preorderDraft: { salesMode: 'both', acceptingPreorders: true } } } });
    }
    return route.fulfill({ json: { success: true, items: [], metrics: {}, weekly: [], recentOrders: [] } });
  });
  await page.goto('/agenda-e2e/admin/loja');
  await page.getByRole('button', { name: 'Horários & Operação', exact: false }).click();
  await expect(page.getByText('Pedidos para agora', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Aceitando pedidos')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar alterações', exact: false })).toHaveCount(0);
  await expect(page.getByLabel('Seguir horários automaticamente')).toBeDisabled();
  await page.getByRole('button', { name: 'Fechar pedidos para agora' }).click();
  await expect(page.getByRole('button', { name: 'Abrir pedidos para agora' })).toBeVisible();
  expect(toggles).toBe(1);
  expect(settingWrites).toBe(0);
});

test('automatic opening explains and blocks an empty weekly schedule on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 900 });
  let settings: Record<string, unknown> = { nome_loja: 'Atelie Teste', updatedAt: '2026-09-13T12:00:00.000Z', is_open: true, abertura_automatica: false };
  let writes = 0;
  await page.route('**/api/tenant/stores/agenda-e2e/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me')) return route.fulfill({ json: {
      success: true, account: { id: '507f1f77bcf86cd799439011', name: 'Admin' },
      tenant: { id: '507f1f77bcf86cd799439012', slug: 'agenda-e2e', name: 'Atelie Teste' },
      membership: { role: 'tenant_owner' }, permissions: ['settings:read', 'settings:write', 'operation:write'],
    } });
    if (path.endsWith('/settings/operational-status')) return route.fulfill({ json: {
      success: true, is_open: true, statusText: 'Aberto', abertura_automatica: Boolean(settings.abertura_automatica),
      pausado_manualmente: false, pausado_ate: null, aberto_manualmente_ate: null,
      preorders: { enabled: false, salesMode: 'immediate_only', acceptingPreorders: true }, serverTime: '2026-09-13T12:00:00.000Z',
    } });
    if (path.endsWith('/settings')) {
      if (route.request().method() === 'PATCH') {
        writes += 1;
        settings = { ...settings, ...route.request().postDataJSON(), updatedAt: '2026-09-13T12:01:00.000Z' };
      }
      return route.fulfill({ json: { success: true, settings } });
    }
    return route.fulfill({ json: { success: true, items: [], metrics: {}, weekly: [], recentOrders: [] } });
  });
  await page.goto('/agenda-e2e/admin/loja');
  await page.getByRole('button', { name: 'Horários & Operação', exact: false }).click();
  await page.getByLabel('Seguir horários automaticamente').check();
  await expect(page.getByRole('alert')).toContainText('abra pelo menos um dia');
  await page.getByRole('button', { name: /^Salvar(?: alterações)?$/i }).last().click();
  expect(writes).toBe(0);
  await page.getByText('Editar dias e horários de pedidos para agora', { exact: false }).click();
  await page.getByLabel('Segunda-feira', { exact: true }).first().check();
  await expect(page.getByRole('alert').filter({ hasText: 'Revise a grade' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Salvar(?: alterações)?$/i }).last().click();
  await expect.poll(() => writes).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
