import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  test(`scheduled checkout reserves a slot and shows manual deposit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const product = { _id: '507f1f77bcf86cd799439012', categoriaId: '507f1f77bcf86cd799439011', nome: 'Bolo artesanal', descricao: 'Bolo personalizado para celebrar com sua familia.', destaque: true, preco: 100, ativo: true, esgotado: false, grupos_adicionais: [], preorder: { immediateAllowed: false, scheduledAllowed: true, minLeadMinutes: 2880, acceptingPreorders: true } };
    const preorders = { enabled: true, acceptingPreorders: true, salesMode: 'scheduled_only', minLeadMinutes: 2880, maxAdvanceDays: 30, depositPercent: 50, timezone: 'America/Sao_Paulo' };
    let submitted: any;
    const availableDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await page.route('**/brand/atelie-logo.png', route => route.fulfill({ contentType: 'image/png', path: 'public/brand/pode-vir-mark-small.png' }));
    await page.route('**/api/public/stores/encomenda-e2e/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/identity')) return route.fulfill({ json: { success: true, identity: { name: 'Atelie E2E', iconUrl: '/brand/atelie-logo.png' } } });
      if (path.endsWith('/status')) return route.fulfill({ json: { success: true, is_open: false, preorders } });
      if (path.includes('/products/')) return route.fulfill({ json: { success: true, product, relatedProducts: [] } });
      return route.fulfill({ json: { success: true, tenant: { slug: 'encomenda-e2e' }, settings: { nome_loja: 'Atelie E2E', whatsapp: '24999999999', is_open: false, pagamento_pix: true, chave_pix: 'pix@atelie.test', preorders, logisticsOptions: { allowDelivery: false, allowPickup: true, allowDineIn: false } }, products: [product], categories: [{ _id: product.categoriaId, nome: 'Bolos' }], blocks: [] } });
    });
    await page.route('**/api/customer/stores/encomenda-e2e/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/session')) return route.fulfill({ json: { success: true, authenticated: true, passwordVerified: true, user: { id: '507f1f77bcf86cd799439013', nome: 'Cliente teste', telefone: '24999999999', enderecos: [] } } });
      if (path.includes('/tracking/')) return route.fulfill({ json: { success: true, tracking: { orderNumber: 1, status: 'Pendente', deliveryType: 'pickup', total: 100, frete: 0, paidCents: 0, metodo_pagamento: 'pix', itens: [{ nome: 'Bolo artesanal', quantidade: 1, subtotal: 100 }], preorder: { date: availableDate, startTime: '09:00', endTime: '10:00', depositCents: 5000, pixKey: 'pix@atelie.test' } } } });
      if (path.endsWith('/preorders/availability')) {
        const { date } = route.request().postDataJSON();
        return route.fulfill({ json: { success: true, availableDates: [availableDate], policy: { immediateAllowed: false, scheduledAllowed: true }, depositPercent: 50, slots: date === availableDate ? [{ date, startsAt: `${date}T12:00:00.000Z`, startTime: '09:00', endTime: '10:00' }] : [] } });
      }
      if (path.endsWith('/orders') && route.request().method() === 'POST') {
        submitted = route.request().postDataJSON();
        return route.fulfill({ json: { success: true, orderId: '507f1f77bcf86cd799439099', orderNumber: 1, trackingToken: 'test-token', totalCents: 10000, preorder: { ...submitted.preorder, startTime: '09:00', endTime: '10:00', timezone: preorders.timezone, depositCents: 5000, pixKey: 'pix@atelie.test' } } });
      }
      return route.fulfill({ json: { success: true, orders: [], order: null } });
    });
    await page.goto('/encomenda-e2e');
    await expect(page).toHaveTitle('Atelie E2E');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/atelie-logo.png');
    await expect(page.getByText('Aceitando encomendas', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText('Entrega em 45 min', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Somente por encomenda', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`catalog-${width}.png`) });
    await page.getByText('Bolo artesanal', { exact: true }).first().click();
    await expect(page.getByText('Encomende com pelo menos 2 dias de antecedência.', { exact: true }).filter({ visible: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`product-${width}.png`) });
    await page.getByRole('button', { name: /Adicionar encomenda/ }).click();
    if (width < 1024) await page.getByRole('button', { name: 'Ver sacola', exact: true }).click();
    await expect(page.getByText('Somente por encomenda', { exact: true }).filter({ visible: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Continuar pedido', exact: true }).click();
    await expect(page).toHaveTitle('Atelie E2E');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/atelie-logo.png');
    const agenda = page.getByRole('region', { name: 'Agendamento do pedido' });
    await expect(agenda.getByRole('button', { name: 'Agora', exact: true })).toHaveCount(0);
    await expect(agenda.getByLabel('Data da encomenda')).toHaveValue(availableDate);
    await expect(page.getByRole('button', { name: 'Avançar', exact: true })).toBeDisabled();
    await expect(agenda).toBeVisible();
    expect(submitted).toBeUndefined();
    await agenda.getByRole('button', { name: '09:00–10:00', exact: true }).click();
    await page.getByRole('button', { name: 'Avançar', exact: true }).click();
    await page.getByRole('button', { name: 'Avançar', exact: true }).click();
    await page.getByRole('button', { name: /Finalizar Pedido/ }).click();
    await expect(page.getByText('Pedido Realizado!', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Avisar a loja pelo WhatsApp', exact: true })).toHaveAttribute('href', /24999999999/);
    await expect(page.getByText('A mensagem vai pronta. No WhatsApp, toque em Enviar.')).toBeVisible();
    expect(submitted.preorder.startsAt).toContain(submitted.preorder.date);
    expect(submitted.deliveryType).toBe('pickup');
    expect(submitted).not.toHaveProperty('totalCents');
    await expect(page.getByRole('region', { name: 'Resumo da encomenda' }).first()).toContainText('50,00');
    await expect(page.getByRole('button', { name: 'Copiar chave PIX', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`checkout-${width}.png`) });
    await page.getByRole('button', { name: 'Acompanhar pedido', exact: true }).click();
    const tracking = page.getByRole('main', { name: 'Acompanhar pedido' });
    await expect(tracking.getByRole('heading', { name: 'Pedido recebido' })).toBeVisible();
    await expect(page).toHaveTitle('Atelie E2E');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/atelie-logo.png');
    await expect(tracking.getByRole('button', { name: 'Copiar chave Pix', exact: true })).toBeHidden();
    await tracking.getByText('Pagar sinal de R$ 50,00', { exact: true }).click();
    await expect(tracking.getByRole('button', { name: 'Copiar chave Pix', exact: true })).toBeVisible();
    await tracking.getByText('Pagar sinal de R$ 50,00', { exact: true }).click();
    await tracking.getByText('Ver detalhes do pedido', { exact: true }).click();
    await expect(tracking.getByText('Subtotal', { exact: true })).toBeVisible();
    await expect(tracking.getByText('Taxa de Entrega', { exact: true })).toHaveCount(0);
    await tracking.getByText('Ver detalhes do pedido', { exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('footer')).toBeHidden();
    await expect(page.getByText('Pedido realizado com sucesso!', { exact: false })).toBeHidden({ timeout: 10000 });
    await page.screenshot({ path: testInfo.outputPath(`tracking-${width}.png`) });
  });
}
