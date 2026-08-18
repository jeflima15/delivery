import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function checkPdfPages() {
  const pdfPath = path.resolve('public/Manual_do_Lojista_Pode_Vir.pdf');
  const buffer = fs.readFileSync(pdfPath);
  // In PDF format, count /Type /Page occurrences (excluding /Pages)
  const content = buffer.toString('latin1');
  const pageMatches = content.match(/\/Type\s*\/Page\b/g);
  console.log(`Numero de paginas no PDF: ${pageMatches ? pageMatches.length : 'Desconhecido'}`);
}

checkPdfPages().catch(console.error);
