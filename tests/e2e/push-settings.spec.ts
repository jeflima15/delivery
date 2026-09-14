import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  test(`manages push devices and opens the notified order at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const endpoint = 'https://fcm.googleapis.com/fcm/send/test-browser';
    const publicKey = 'B'.repeat(87);
    const id = '507f1f77bcf86cd799439011';
    let devices: any[] = [];
    let tested = false;
    let saved = false;
    await page.addInitScript(({ endpoint }) => {
      const subscription = { endpoint, options: {}, toJSON: () => ({ endpoint, keys: { p256dh: 'test', auth: 'test' } }) };
      const serviceWorker = { register: async () => ({ active: true, pushManager: { getSubscription: async () => subscription, subscribe: async () => subscription } }) };
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
      Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
      Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted', requestPermission: async () => 'granted' } });
    }, { endpoint });
    await page.route('**/api/tenant/stores/push-e2e/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/me')) return route.fulfill({ json: { success: true, account: { id, name: 'Dona' }, tenant: { id, slug: 'push-e2e', name: 'Ateliê', onboarding: { completed: true } }, permissions: ['orders:read', 'orders:write', 'settings:read'] } });
      if (path.endsWith('/push') && route.request().method() === 'GET') return route.fulfill({ json: { publicKey, devices, pending: 0 } });
      if (path.endsWith('/push') && route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        saved = true;
        const hash = await page.evaluate(async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, '0')).join(''), endpoint);
        devices = [{ _id: id, endpointHash: hash, name: body.name, enabled: true }];
        return route.fulfill({ json: { success: true, id } });
      }
      if (path.endsWith(`/push/${id}/test`)) { tested = true; return route.fulfill({ json: { success: true } }); }
      if (path.endsWith(`/push/${id}`) && route.request().method() === 'DELETE') { devices = []; return route.fulfill({ json: { success: true } }); }
      if (path.endsWith(`/orders/${id}`)) return route.fulfill({ json: { order: { _id: id, orderNumber: 154, status: 'Pendente', total: 100, itens: [], cliente: { nome: 'Cliente Teste' }, createdAt: new Date().toISOString() } } });
      return route.fulfill({ json: { success: true, items: [], settings: {}, metrics: {}, weekly: [], recentOrders: [] } });
    });
    await page.goto('/push-e2e/admin/pedidos');
    await page.getByRole('button', { name: 'Notificações', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Configurar notificações' });
    await dialog.getByLabel('Nome do aparelho').fill('Celular da Ana');
    await dialog.getByRole('button', { name: 'Ativar notificações', exact: true }).click();
    await expect(dialog.getByText('Aparelho cadastrado.', { exact: false })).toBeVisible();
    expect(saved).toBe(true);
    await dialog.getByRole('button', { name: 'Enviar aviso de teste' }).click();
    await expect(dialog.getByText('Teste enviado ao serviço', { exact: false })).toBeVisible();
    expect(tested).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`push-${width}.png`) });
    await dialog.getByText('Meus aparelhos nesta loja', { exact: false }).click();
    await dialog.getByRole('button', { name: 'Desativar avisos neste aparelho' }).click();
    await expect(dialog.getByText('Neste aparelho: avisos não ativados')).toBeVisible();
    await page.goto(`/push-e2e/admin/pedidos?order=${id}`);
    await expect(page.getByLabel('Detalhes do pedido').getByText('Cliente Teste', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
