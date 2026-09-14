import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  test(`owner reschedules and records deposit without open cash at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    let order: any = { _id: '507f1f77bcf86cd799439099', orderNumber: 1, dailyOrderNumber: 1, status: 'Pendente', tipo_entrega: 'pickup', metodo_pagamento: 'pix', cliente: { nome: 'Ana Encomenda', telefone: '24999999999' }, itens: [{ nome: 'Bolo', quantidade: 1, preco_unitario: 100, subtotal: 100 }], total: 100, total_centavos: 10000, frete: 0, paid_amount_cents: 0, refunded_amount_cents: 0, payment_status: 'pending', payments: [], historico_status: [], createdAt: new Date().toISOString(), updatedAt: '2026-09-13T12:00:00.000Z', preorder: { date, startTime: '09:00', endTime: '10:00', startsAt: `${date}T12:00:00.000Z`, endsAt: `${date}T13:00:00.000Z`, timezone: 'America/Sao_Paulo', depositCents: 5000, pixKey: 'pix@teste.com' } };
    let payment: any;
    let reschedule: any;
    await page.route('**/api/tenant/stores/operacao-agenda/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/me')) return route.fulfill({ json: { success: true, account: { id: '507f1f77bcf86cd799439011', name: 'Dona' }, tenant: { id: '507f1f77bcf86cd799439012', slug: 'operacao-agenda', name: 'Atelie', onboarding: { completed: true } }, membership: { role: 'tenant_owner' }, permissions: ['orders:read', 'orders:write', 'payments:write', 'cash:read'] } });
      if (path.endsWith('/orders/active')) return route.fulfill({ json: { success: true, items: [order] } });
      if (path.endsWith('/preorder-slots')) return route.fulfill({ json: { success: true, slots: [{ startsAt: `${date}T14:00:00.000Z`, startTime: '11:00', endTime: '12:00' }] } });
      if (path.endsWith('/reschedule')) {
        reschedule = route.request().postDataJSON();
        order = { ...order, updatedAt: '2026-09-13T12:01:00.000Z', preorder: { ...order.preorder, startTime: '11:00', endTime: '12:00', startsAt: reschedule.startsAt } };
        return route.fulfill({ json: { success: true, order } });
      }
      if (path.endsWith('/payments')) {
        payment = route.request().postDataJSON();
        order = { ...order, paid_amount_cents: payment.amountCents, payment_status: 'partial', updatedAt: '2026-09-13T12:02:00.000Z' };
        return route.fulfill({ json: { success: true, order } });
      }
      return route.fulfill({ json: { success: true, items: [], cash: null, settings: {}, metrics: {}, expectedByMethod: {} } });
    });
    await page.goto('/operacao-agenda/admin/pedidos');
    await page.getByRole('button', { name: 'Encomendas (1)', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Detalhes', exact: true }).click();
    else await page.getByRole('row').filter({ hasText: 'Ana Encomenda' }).click();
    await expect(page.getByRole('region', { name: 'Resumo da encomenda' })).toContainText('50,00');
    await page.getByRole('button', { name: 'Reagendar encomenda', exact: true }).click();
    await page.getByRole('combobox', { name: 'Novo horário', exact: true }).selectOption({ index: 1 });
    await page.getByLabel('Motivo / combinado com o cliente').fill('Cliente pediu mais tarde');
    await page.getByRole('button', { name: 'Confirmar nova data', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Resumo da encomenda' })).toContainText('11:00');
    expect(reschedule.expectedUpdatedAt).toBe('2026-09-13T12:00:00.000Z');
    await page.getByRole('button', { name: 'Registrar recebimento ou devolução', exact: true }).click();
    await expect(page.getByLabel('Valor (R$)', { exact: true })).toHaveValue('50,00');
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Resumo da encomenda' })).toContainText('Sinal conferido');
    expect(payment).toMatchObject({ type: 'payment', amountCents: 5000, method: 'pix' });
    expect(payment.operationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`admin-${width}.png`) });
  });
}
