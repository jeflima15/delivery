import { expect, test } from '@playwright/test';

test('deep links da SPA respondem', async ({ page }) => {
  await page.goto('/loja-piloto');
  await expect(page.locator('body')).toBeVisible();
  await page.goto('/loja-piloto/admin');
  await expect(page.getByText(/Painel da loja|Validando sessao/)).toBeVisible();
  await page.goto('/master');
  await expect(page.getByText(/Admin Master|Validando sessao Master/)).toBeVisible();
});
