import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('public/manual-assets-focused');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function captureFocused() {
  console.log('Iniciando navegador para capturas focadas e em alta definicao...');
  const browser = await chromium.launch({ headless: true });
  
  // Desktop context with 2.5x zoom / scale factor
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  console.log('Acessando painel...');
  await page.goto('https://podevir-app.vercel.app/loja-piloto/admin', { waitUntil: 'networkidle' });

  // Login
  const emailInput = await page.$('input[type="email"], input[placeholder*="email" i]');
  if (emailInput) {
    await emailInput.fill('teste@teste.com');
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) await passwordInput.fill('123@Mudar@');
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await page.waitForTimeout(4000);
  }

  // 1. Dashboard: Capturar a área principal de métricas e status (sem as margens vazias da janela)
  console.log('Capturando 1_dashboard_focused.png...');
  await page.waitForTimeout(1500);
  // Capturar a área de conteúdo
  const mainContent = await page.$('main') || await page.$('#root');
  if (mainContent) {
    await mainContent.screenshot({ path: path.join(SCREENSHOT_DIR, '1_dashboard_focused.png') });
  } else {
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '1_dashboard_focused.png') });
  }

  // 2. Pedidos: Capturar a esteira Kanban de pedidos bem de perto
  console.log('Navegando para Pedidos...');
  const pedidosBtn = await page.$('button:has-text("Pedidos"), a:has-text("Pedidos")');
  if (pedidosBtn) {
    await pedidosBtn.click();
    await page.waitForTimeout(2000);
    const pedidosMain = await page.$('main') || await page.$('#root');
    if (pedidosMain) {
      await pedidosMain.screenshot({ path: path.join(SCREENSHOT_DIR, '2_pedidos_focused.png') });
    }
  }

  // 3. Catálogo: Capturar a lista de produtos com fotos, preços e chaves de ativação
  console.log('Navegando para Catálogo...');
  const catalogoBtn = await page.$('button:has-text("Catálogo"), a:has-text("Catálogo")');
  if (catalogoBtn) {
    await catalogoBtn.click();
    await page.waitForTimeout(2000);
    // Switch to produtos tab if needed
    const produtosTab = await page.$('button:has-text("Produtos"), button:has-text("Itens")');
    if (produtosTab) {
      await produtosTab.click();
      await page.waitForTimeout(1000);
    }
    const catalogoMain = await page.$('main') || await page.$('#root');
    if (catalogoMain) {
      await catalogoMain.screenshot({ path: path.join(SCREENSHOT_DIR, '3_catalogo_focused.png') });
    }
  }

  // 4. Loja: Aparência
  console.log('Navegando para Loja...');
  const lojaBtn = await page.$('button:has-text("Loja"), a:has-text("Loja")');
  if (lojaBtn) {
    await lojaBtn.click();
    await page.waitForTimeout(2000);
    const aparenciaMain = await page.$('main') || await page.$('#root');
    if (aparenciaMain) {
      await aparenciaMain.screenshot({ path: path.join(SCREENSHOT_DIR, '4_aparencia_focused.png') });
    }

    // Subtab Horários & Operação
    const operacaoBtn = await page.$('button:has-text("Horários"), button:has-text("Operação")');
    if (operacaoBtn) {
      await operacaoBtn.click();
      await page.waitForTimeout(1500);
      const operacaoMain = await page.$('main') || await page.$('#root');
      if (operacaoMain) {
        await operacaoMain.screenshot({ path: path.join(SCREENSHOT_DIR, '5_operacao_focused.png') });
      }
    }

    // Subtab Entrega e Pagamento
    const entregaBtn = await page.$('button:has-text("Entrega"), button:has-text("Pagamento")');
    if (entregaBtn) {
      await entregaBtn.click();
      await page.waitForTimeout(1500);
      const entregaMain = await page.$('main') || await page.$('#root');
      if (entregaMain) {
        await entregaMain.screenshot({ path: path.join(SCREENSHOT_DIR, '6_entrega_focused.png') });
      }
    }
  }

  // 5. Divulgar Loja Modal
  console.log('Abrindo modal Divulgar...');
  const divulgarBtn = await page.$('button:has-text("Divulgar")');
  if (divulgarBtn) {
    await divulgarBtn.click();
    await page.waitForTimeout(1500);
    // Find the modal dialog
    const modalEl = await page.$('div[role="dialog"]') || await page.$('.fixed.inset-0 > div');
    if (modalEl) {
      await modalEl.screenshot({ path: path.join(SCREENSHOT_DIR, '7_divulgar_focused.png') });
    } else {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '7_divulgar_focused.png') });
    }
    const closeBtn = await page.$('button:has-text("Fechar"), svg.lucide-x');
    if (closeBtn) await closeBtn.click();
  }

  // 6. Vitrine Mobile do Cliente
  console.log('Capturando vitrine mobile...');
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2.5,
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('https://podevir-app.vercel.app/loja-piloto', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(2500);
  await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '8_mobile_focused.png') });

  await browser.close();
  console.log('Capturas focadas geradas com sucesso em public/manual-assets-focused/ !');
}

captureFocused().catch((err) => {
  console.error('Erro na captura focada:', err);
  process.exit(1);
});
