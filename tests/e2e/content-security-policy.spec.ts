import { readFile, readdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { contentSecurityPolicy } from '../../server/security/contentSecurityPolicy';

test('HTML aplica CSP permitindo fontes, imagens, mapas e worker, e bloqueando origem externa', async ({ page }) => {
  const font = await readFile('node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf');
  const image = await readFile('public/brand/pode-vir-mark-small.png');
  const pdfWorkerFile = (await readdir('dist/assets')).find((name) => /^pdf\.worker\.min-.*\.mjs$/.test(name));
  expect(pdfWorkerFile).toBeTruthy();
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '@font-face { font-family: Rubik; src: url(https://fonts.gstatic.com/csp-test.ttf) format("truetype"); }' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ contentType: 'font/ttf', headers: { 'access-control-allow-origin': '*' }, body: font }));
  await page.route('**/_vercel/insights/script.js', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  for (const url of ['https://tiles.openfreemap.org/**', 'https://test.supabase.co/**', 'https://api.qrserver.com/**']) {
    await page.route(url, (route) => route.fulfill({ contentType: route.request().resourceType() === 'image' ? 'image/png' : 'application/json', headers: { 'access-control-allow-origin': '*' }, body: route.request().resourceType() === 'image' ? image : '{}' }));
  }
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(contentSecurityPolicy);
  const fontLoaded = await page.evaluate(async () => { await document.fonts.load('16px Rubik'); return document.fonts.check('16px Rubik'); });
  expect(fontLoaded).toBe(true);
  const result = await page.evaluate(async (pdfWorkerUrl) => {
    const violations: string[] = [];
    document.addEventListener('securitypolicyviolation', (event) => violations.push(event.blockedURI));
    await Promise.all(['https://tiles.openfreemap.org/styles/positron', 'https://test.supabase.co/storage/test', 'https://api.qrserver.com/v1/test'].map((url) => fetch(url)));
    await Promise.all(['https://test.supabase.co/image.png', 'https://api.qrserver.com/image.png'].map((url) => new Promise<void>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(); image.onerror = reject; image.src = url;
    })));
    const workerResult = await new Promise<string>((resolve, reject) => {
      const url = URL.createObjectURL(new Blob(['postMessage("worker-ok")'], { type: 'text/javascript' }));
      const worker = new Worker(url);
      worker.onmessage = (event) => { worker.terminate(); URL.revokeObjectURL(url); resolve(event.data); };
      worker.onerror = reject;
    });
    const pdfWorkerResult = await new Promise<string>((resolve, reject) => {
      const worker = new Worker(pdfWorkerUrl, { type: 'module' });
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('PDF worker nao inicializou')); }, 5000);
      worker.onmessage = (event) => {
        if (event.data.action === 'ready') { clearTimeout(timer); worker.terminate(); resolve('pdf-worker-ok'); }
      };
      worker.onerror = (event) => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
    });
    await fetch('https://unauthorized.invalid/data').catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { workerResult, pdfWorkerResult, violations };
  }, `/assets/${pdfWorkerFile}`);
  expect(result.workerResult).toBe('worker-ok');
  expect(result.pdfWorkerResult).toBe('pdf-worker-ok');
  expect(result.violations.map((url) => new URL(url).origin)).toEqual(['https://unauthorized.invalid']);
});
