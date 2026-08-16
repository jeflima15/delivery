import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('public/manual-assets');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function capture() {
  console.log('Iniciando navegador Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  console.log('Acessando https://podevir-app.vercel.app/loja-piloto/admin ...');
  await page.goto('https://podevir-app.vercel.app/loja-piloto/admin', { waitUntil: 'networkidle' });

  // Check if login form is present
  const emailInput = await page.$('input[type="email"], input[placeholder*="email" i]');
  if (emailInput) {
    console.log('Preenchendo credenciais de login...');
    await emailInput.fill('teste@teste.com');
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.fill('123@Mudar@');
    }
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    }
    console.log('Aguardando login...');
    await page.waitForTimeout(4000);
  }

  // 1. Dashboard Screenshot
  console.log('Capturando 1_dashboard.png...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '1_dashboard.png'), fullPage: false });

  // 2. Pedidos Screenshot
  console.log('Navegando para Pedidos...');
  const pedidosBtn = await page.$('button:has-text("Pedidos"), a:has-text("Pedidos")');
  if (pedidosBtn) {
    await pedidosBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '2_pedidos_kanban.png'), fullPage: false });
  }

  // 3. Catálogo / Produtos Screenshot
  console.log('Navegando para Catálogo...');
  const catalogoBtn = await page.$('button:has-text("Catálogo"), a:has-text("Catálogo")');
  if (catalogoBtn) {
    await catalogoBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '3_catalogo_produtos.png'), fullPage: false });
  }

  // 4. Loja / Configurações Screenshot
  console.log('Navegando para Loja...');
  const lojaBtn = await page.$('button:has-text("Loja"), a:has-text("Loja")');
  if (lojaBtn) {
    await lojaBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '4_config_loja.png'), fullPage: false });

    // Subtab Horários & Operação
    const operacaoBtn = await page.$('button:has-text("Horários"), button:has-text("Operação")');
    if (operacaoBtn) {
      await operacaoBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '5_config_operacao.png'), fullPage: false });
    }

    // Subtab Entrega e Pagamento
    const entregaBtn = await page.$('button:has-text("Entrega"), button:has-text("Pagamento")');
    if (entregaBtn) {
      await entregaBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '6_config_entrega_pagamento.png'), fullPage: false });
    }
  }

  // 5. Divulgar Loja Modal Screenshot
  console.log('Abrindo modal de divulgação...');
  const divulgarBtn = await page.$('button:has-text("Divulgar")');
  if (divulgarBtn) {
    await divulgarBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '7_divulgar_loja.png'), fullPage: false });
    // Close modal
    const closeBtn = await page.$('button:has-text("Fechar"), svg.lucide-x');
    if (closeBtn) await closeBtn.click();
  }

  // 6. Vitrine Mobile do Cliente
  console.log('Capturando vitrine mobile do cliente...');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('https://podevir-app.vercel.app/loja-piloto', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(2500);
  await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '8_vitrine_mobile.png'), fullPage: false });

  await browser.close();
  console.log('Todas as capturas foram salvas em public/manual-assets/ com sucesso!');
}

capture().catch((err) => {
  console.error('Erro na captura:', err);
  process.exit(1);
});
