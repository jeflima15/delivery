import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  test(`scheduled checkout reserves a slot and shows manual deposit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const product = { _id: '507f1f77bcf86cd799439012', categoriaId: '507f1f77bcf86cd799439011', nome: 'Bolo artesanal', preco: 100, ativo: true, esgotado: false, grupos_adicionais: [] };
    const preorders = { enabled: true, acceptingPreorders: true, salesMode: 'scheduled_only', minLeadMinutes: 2880, maxAdvanceDays: 30, depositPercent: 50, timezone: 'America/Sao_Paulo' };
    let submitted: any;
    await page.route('**/api/public/stores/encomenda-e2e/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/status')) return route.fulfill({ json: { success: true, is_open: false, preorders } });
      if (path.includes('/products/')) return route.fulfill({ json: { success: true, product, relatedProducts: [] } });
      return route.fulfill({ json: { success: true, tenant: { slug: 'encomenda-e2e' }, settings: { nome_loja: 'Atelie E2E', is_open: false, pagamento_pix: true, chave_pix: 'pix@atelie.test', preorders, logisticsOptions: { allowDelivery: false, allowPickup: true, allowDineIn: false } }, products: [product], categories: [{ _id: product.categoriaId, nome: 'Bolos' }], blocks: [] } });
    });
    await page.route('**/api/customer/stores/encomenda-e2e/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/session')) return route.fulfill({ json: { success: true, authenticated: true, passwordVerified: true, user: { id: '507f1f77bcf86cd799439013', nome: 'Cliente teste', telefone: '24999999999', enderecos: [] } } });
      if (path.endsWith('/preorders/availability')) {
        const { date } = route.request().postDataJSON();
        return route.fulfill({ json: { success: true, policy: { immediateAllowed: false, scheduledAllowed: true }, depositPercent: 50, slots: [{ date, startsAt: `${date}T12:00:00.000Z`, startTime: '09:00', endTime: '10:00' }] } });
      }
      if (path.endsWith('/orders') && route.request().method() === 'POST') {
        submitted = route.request().postDataJSON();
        return route.fulfill({ json: { success: true, orderId: '507f1f77bcf86cd799439099', orderNumber: 1, trackingToken: 'test-token', totalCents: 10000, preorder: { ...submitted.preorder, startTime: '09:00', endTime: '10:00', timezone: preorders.timezone, depositCents: 5000, pixKey: 'pix@atelie.test' } } });
      }
      return route.fulfill({ json: { success: true, orders: [], order: null } });
    });
    await page.goto('/encomenda-e2e');
    await expect(page.getByText('Aceitando encomendas', { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByText('Bolo artesanal', { exact: true }).first().click();
    await page.getByRole('button', { name: /Adicionar/ }).click();
    if (width < 1024) await page.getByRole('button', { name: 'Ver sacola', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar pedido', exact: true }).click();
    const agenda = page.getByRole('region', { name: 'Agendamento do pedido' });
    await expect(agenda.getByRole('button', { name: 'Agora', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Avançar', exact: true }).click();
    await expect(agenda).toBeVisible();
    expect(submitted).toBeUndefined();
    await agenda.getByLabel('Horário (America/Sao_Paulo)').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Avançar', exact: true }).click();
    await page.getByRole('button', { name: 'Avançar', exact: true }).click();
    await page.getByRole('button', { name: /Finalizar Pedido/ }).click();
    await expect(page.getByText('Pedido Realizado!', { exact: true })).toBeVisible();
    expect(submitted.preorder.startsAt).toContain(submitted.preorder.date);
    expect(submitted.deliveryType).toBe('pickup');
    expect(submitted).not.toHaveProperty('totalCents');
    await expect(page.getByRole('region', { name: 'Resumo da encomenda' }).first()).toContainText('50,00');
    await expect(page.getByRole('button', { name: 'Copiar chave PIX', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`checkout-${width}.png`) });
  });
}
