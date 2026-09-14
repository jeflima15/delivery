import { expect, test } from '@playwright/test';

for (const width of [393, 1440]) {
  for (const mode of ['immediate_only', 'scheduled_only', 'both']) {
    test(`sets up ${mode} and resumes progress at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      let draft: any;
      let step = 'welcome';
      let revision = 0;
      let completed = false;
      let product: any;
      let settings: any = { nome_loja: 'Minha Loja', updatedAt: '2026-09-14T00:00:00.000Z', preorderEnabled: false };
      const applied: any[] = [];
      await page.route('**/api/tenant/stores/onboarding-e2e/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/push')) return route.fulfill({ json: { publicKey: null, devices: [], pending: 0 } });
        if (path.endsWith('/me')) return route.fulfill({ json: { success: true, account: { id: '507f1f77bcf86cd799439011', name: 'Dona' }, tenant: { id: '507f1f77bcf86cd799439012', slug: 'onboarding-e2e', name: 'Ateliê', onboarding: { completed, step } }, membership: { role: 'tenant_owner' }, permissions: ['settings:read', 'settings:write', 'catalog:read', 'catalog:write', 'orders:read'] } });
        if (path.endsWith('/onboarding/status')) return route.fulfill({ json: { success: true, onboarding: { completed, step, draft, revision }, settings, hasProducts: Boolean(product), productsCount: product ? 1 : 0, readiness: { ready: Boolean(product && applied.length), checks: { identity: true, service: true, address: true, delivery: true, hours: true, schedule: true, payments: true, product: Boolean(product) } } } });
        if (path.endsWith('/onboarding/draft')) {
          const body = route.request().postDataJSON();
          if (body.revision !== revision) return route.fulfill({ status: 409, json: { success: false, error: { message: 'Conflito de versão' } } });
          draft = body.draft; step = `setup-${body.step}`; revision++;
          return route.fulfill({ json: { success: true, revision } });
        }
        if (path.endsWith('/settings') && route.request().method() === 'PATCH') { const payload = route.request().postDataJSON(); applied.push(payload); settings = { ...settings, ...payload, updatedAt: '2026-09-14T00:01:00.000Z' }; return route.fulfill({ json: { success: true, settings } }); }
        if (path.endsWith('/categories')) return route.fulfill({ json: route.request().method() === 'POST' ? { success: true, category: { _id: '507f1f77bcf86cd799439013', nome: 'Cardápio' } } : { success: true, items: [] } });
        if (path.endsWith('/products') && route.request().method() === 'POST') { product = route.request().postDataJSON(); return route.fulfill({ json: { success: true, product: { ...product, _id: '507f1f77bcf86cd799439014' } } }); }
        if (path.endsWith('/onboarding/complete')) { completed = true; return route.fulfill({ json: { success: true, onboarding: { completed: true, step: 'complete' } } }); }
        return route.fulfill({ json: { success: true, settings, items: [], metrics: { revenueToday: 0, ordersToday: 0, averageOrderToday: 0, pendingOrders: 0, revenueWeek: 0, products: 0, categories: 0 }, weekly: [], recentOrders: [] } });
      });
      await page.goto('/onboarding-e2e/admin');
      const wizard = page.getByRole('dialog', { name: 'Configurar minha loja' });
      await expect(wizard).toBeVisible();
      const modeLabel = mode === 'immediate_only' ? /Pedidos para agora/ : mode === 'scheduled_only' ? /Somente por encomenda/ : /Os dois/;
      await wizard.getByRole('radio', { name: modeLabel }).check();
      await wizard.getByLabel('Nome da loja', { exact: true }).fill('Ateliê da Ana');
      await wizard.getByLabel('WhatsApp da loja', { exact: true }).fill('24999999999');
      await wizard.getByRole('button', { name: 'Continuar', exact: true }).click();
      await wizard.getByRole('radio', { name: 'Retirada', exact: true }).check();
      await wizard.getByLabel('Rua', { exact: true }).fill('Rua das Flores');
      await wizard.getByLabel('Número', { exact: true }).fill('10');
      await wizard.getByLabel('Cidade', { exact: true }).fill('Itatiaia');
      await expect(wizard.getByLabel('Taxa fixa de entrega (R$)', { exact: true })).toHaveCount(0);
      await expect.poll(() => draft?.city).toBe('Itatiaia');
      await page.reload();
      await expect(wizard.getByLabel('Cidade', { exact: true })).toHaveValue('Itatiaia');
      expect(applied).toHaveLength(0);
      await wizard.getByRole('button', { name: 'Continuar', exact: true }).click();
      if (mode !== 'scheduled_only') {
        const hours = wizard.getByRole('heading', { name: 'Funcionamento dos pedidos para agora', exact: true }).locator('..');
        const bulk = hours.getByText('Preencher vários dias de uma vez', { exact: true }).locator('..');
        await bulk.getByLabel('Horário em lote: início').fill('10:00');
        await bulk.getByLabel('Horário em lote: fim').fill('18:00');
        await bulk.getByRole('button', { name: 'Aplicar aos dias selecionados' }).click();
        await bulk.getByRole('button', { name: 'Confirmar substituição' }).click();
        await hours.getByText('Personalizar por dia', { exact: true }).click();
        await hours.getByLabel('Sábado: fim 1').fill('16:00');
        await wizard.getByLabel('Previsão para pedidos imediatos').fill('40–60 min');
      } else await expect(wizard.getByLabel('Previsão para pedidos imediatos')).toHaveCount(0);
      if (mode !== 'immediate_only') {
        await wizard.getByLabel('Quantos dias de antecedência você precisa?').fill('2');
        const hours = wizard.getByRole('heading', { name: 'Dias e horários para entregar ou retirar encomendas', exact: true }).locator('..');
        const bulk = hours.getByText('Preencher vários dias de uma vez', { exact: true }).locator('..');
        await bulk.getByLabel('Horário em lote: início').fill('09:00');
        await bulk.getByLabel('Horário em lote: fim').fill('18:00');
        await bulk.getByRole('button', { name: 'Aplicar aos dias selecionados' }).click();
        await bulk.getByRole('button', { name: 'Confirmar substituição' }).click();
      }
      await wizard.getByRole('button', { name: 'Continuar', exact: true }).click();
      await wizard.getByLabel('PIX', { exact: true }).check();
      await wizard.getByLabel('Chave PIX', { exact: true }).fill('pix@atelie.test');
      if (mode !== 'immediate_only') await wizard.getByRole('combobox', { name: 'Você cobra sinal para começar a produção?' }).selectOption('50');
      await wizard.getByRole('button', { name: 'Continuar', exact: true }).click();
      await wizard.getByLabel('Nome do primeiro produto').fill('Bolo artesanal');
      await wizard.getByLabel('Preço (R$)', { exact: true }).fill('120');
      if (mode === 'both') await wizard.getByRole('combobox', { name: 'Como este produto será vendido?' }).selectOption('scheduled_only');
      await wizard.getByRole('button', { name: 'Cadastrar produto', exact: true }).click();
      await expect(wizard.getByText('Seu catálogo já tem um produto disponível.', { exact: false })).toBeVisible();
      await wizard.getByRole('button', { name: 'Continuar', exact: true }).click();
      await expect(wizard.getByRole('heading', { name: 'Conferência', exact: true })).toBeVisible();
      expect(applied).toHaveLength(0);
      await page.screenshot({ path: testInfo.outputPath(`review-${mode}-${width}.png`) });
      await wizard.getByRole('button', { name: 'Confirmar e aplicar configurações' }).click();
      await expect(wizard.getByRole('link', { name: 'Visualizar minha loja' })).toBeVisible();
      expect(applied[0]).toMatchObject({ preorderEnabled: mode !== 'immediate_only', logisticsOptions: { allowPickup: true, allowDelivery: false }, expectedSettingsUpdatedAt: '2026-09-14T00:00:00.000Z' });
      if (mode !== 'immediate_only') expect(applied[0].preorderDraft).toMatchObject({ salesMode: mode, depositPercent: 50, minLeadMinutes: 2880 });
      if (mode !== 'scheduled_only') expect(applied[0].horarios_funcionamento).toMatchObject({ segunda: { inicio: '10:00', fim: '18:00' }, sabado: { inicio: '10:00', fim: '16:00' }, domingo: { aberto: false } });
      expect(product.controlar_estoque).toBe(false);
      expect(product.preorderDraft.availability).toBe(mode === 'both' ? 'scheduled_only' : 'inherit');
      await wizard.getByRole('button', { name: 'Concluir configuração', exact: true }).click();
      await expect(wizard).toHaveCount(0);
      expect(completed).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
