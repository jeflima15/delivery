import { chromium } from '@playwright/test';
import path from 'path';

async function generatePdf() {
  console.log('Iniciando Chromium para exportar PDF...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const htmlPath = path.resolve('public/manual-do-lojista.html');
  console.log(`Carregando ${htmlPath}...`);
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

  const pdfPath = path.resolve('public/Manual_do_Lojista_Pode_Vir.pdf');
  console.log(`Gerando PDF em ${pdfPath}...`);
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '0mm',
      bottom: '0mm',
      left: '0mm',
      right: '0mm',
    },
  });

  await browser.close();
  console.log('PDF gerado com sucesso!');
}

generatePdf().catch((err) => {
  console.error('Erro ao gerar PDF:', err);
  process.exit(1);
});
