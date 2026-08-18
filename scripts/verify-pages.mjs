import { chromium } from '@playwright/test';
import path from 'path';

async function verifyPages() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

  const htmlPath = path.resolve('public/manual-do-lojista.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

  const sheets = await page.$$('.page-container');
  console.log(`Total de paginas A4 encontradas no documento: ${sheets.length}`);

  for (let i = 0; i < sheets.length; i++) {
    const box = await sheets[i].boundingBox();
    console.log(`Pagina ${i + 1}: altura = ${box.height}px, largura = ${box.width}px`);
  }

  await browser.close();
}

verifyPages().catch(console.error);
