import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { renderStorefrontHtml } from '../../server/services/storefrontHtml';
import { contentSecurityPolicy } from '../../server/security/contentSecurityPolicy';

const fallback = '/brand/pode-vir-mark-small.png';
const icons = { 'loja-a': '/brand/identity-a.svg?v=1', 'loja-b': '/brand/identity-b.png?v=2' };
const names = { 'loja-a': 'Doces da Ana', 'loja-b': 'Pizzaria do Bruno' };
const icon = (page: Page) => page.locator('link[rel="icon"]');

async function fixtures(page: Page) {
  await page.route('**/brand/identity-*.svg*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red"/></svg>' }));
  await page.route('**/brand/identity-b.png*', route => route.fulfill({ contentType: 'image/png', path: 'public/brand/pode-vir-mark-small.png' }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const slug = /\/stores\/([^/]+)/.exec(path)?.[1] || '';
    if (path.endsWith('/identity')) return route.fulfill({ json: { success: true, identity: { name: names[slug] || 'Loja sem logo', iconUrl: icons[slug] || fallback } } });
    if (path.endsWith('/store')) return route.fulfill({ json: { success: true, settings: { nome_loja: names[slug] || 'Loja sem logo', is_open: true }, products: [], categories: [], blocks: [] } });
    if (path.endsWith('/status')) return route.fulfill({ json: { success: true, is_open: true } });
    if (path.endsWith('/auth/session')) return route.fulfill({ json: { success: true, authenticated: false, user: null } });
    return route.fulfill({ status: 401, json: { success: false, error: { message: 'Sessão ausente' } } });
  });
}

async function navigate(page: Page, path: string) {
  await page.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); }, path);
}

test('duas lojas preservam a identidade no admin e restauram a plataforma em navegação cliente e reload', async ({ page }) => {
  await fixtures(page);
  await page.goto('/loja-a');
  await expect(page).toHaveTitle(names['loja-a']);
  await expect(icon(page)).toHaveAttribute('href', icons['loja-a']);
  await expect(icon(page)).not.toHaveAttribute('type');
  await navigate(page, '/loja-b');
  await expect(page).toHaveTitle(names['loja-b']);
  await expect(icon(page)).toHaveAttribute('href', icons['loja-b']);
  await navigate(page, '/loja-b/admin/catalogo');
  await expect(page).toHaveTitle(`Painel — ${names['loja-b']}`);
  await expect(icon(page)).toHaveAttribute('href', icons['loja-b']);
  await expect(page.getByRole('button', { name: 'Entrar no sistema', exact: true })).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/api/public/stores/loja-b/admin.webmanifest');
  await navigate(page, '/');
  await expect(page).toHaveTitle('Pode Vir | Cardápio online, pedidos e encomendas');
  await expect(icon(page)).toHaveAttribute('href', fallback);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  for (const [path, title] of [['/login', 'Acesso do lojista — Pode Vir'], ['/master/login', 'Master — Pode Vir'], ['/invite/token', 'Convite — Pode Vir']]) {
    await navigate(page, path);
    await expect(page).toHaveTitle(title);
    await expect(icon(page)).toHaveAttribute('href', fallback);
    await expect(icon(page)).toHaveCount(1);
  }
  await page.goto('/loja-a/admin');
  await expect(page).toHaveTitle(`Painel — ${names['loja-a']}`);
  await expect(icon(page)).toHaveAttribute('href', icons['loja-a']);
  await page.goto('/login');
  await expect(icon(page)).toHaveAttribute('href', fallback);
  await expect(page).toHaveTitle('Acesso do lojista — Pode Vir');
});

test('logo ausente, corrompido ou removido usa fallback sem herdar o logo anterior', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/public/stores/quebrada/identity', route => route.fulfill({ json: { success: true, identity: { name: 'Logo removido', iconUrl: '/brand/not-found.webp' } } }));
  await page.route('**/brand/not-found.webp', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/loja-a');
  await expect(icon(page)).toHaveAttribute('href', icons['loja-a']);
  await navigate(page, '/sem-logo');
  await expect(page).toHaveTitle('Loja sem logo');
  await expect(icon(page)).toHaveAttribute('href', fallback);
  await navigate(page, '/quebrada');
  await expect(page).toHaveTitle('Logo removido');
  await expect(icon(page)).toHaveAttribute('href', fallback);
  await page.route('**/api/public/stores/quebrada/identity', route => route.fulfill({ status: 423, json: { success: false } }));
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await expect(page).toHaveTitle('Pode Vir');
  await expect(icon(page)).toHaveAttribute('href', fallback);
});

test('lista de pedidos conserva nome e logo da loja autenticada', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/customer/stores/loja-a/auth/session', route => route.fulfill({ json: { success: true, authenticated: true, passwordVerified: true, user: { id: 'customer', nome: 'Cliente', telefone: '24999999999' } } }));
  await page.route('**/api/customer/stores/loja-a/me/orders?*', route => route.fulfill({ json: { success: true, items: [], pagination: { page: 1, pages: 1 } } }));
  await page.goto('/loja-a');
  await expect(page).toHaveTitle(names['loja-a']);
  await page.getByRole('button', { name: 'Pedidos', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('button', { name: 'Em andamento', exact: true })).toBeVisible();
  await expect(page).toHaveTitle(names['loja-a']);
  await expect(icon(page)).toHaveAttribute('href', icons['loja-a']);
});

test('revalida logo ao voltar à aba e depois de salvar; descarta resposta atrasada de outra loja', async ({ page }) => {
  await fixtures(page);
  let version = 1;
  await page.route('**/api/public/stores/loja-a/identity', route => route.fulfill({ json: { success: true, identity: { name: names['loja-a'], iconUrl: `/brand/identity-a.svg?v=${version}` } } }));
  await page.goto('/loja-a');
  await expect(icon(page)).toHaveAttribute('href', '/brand/identity-a.svg?v=1');
  version = 2;
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await expect(icon(page)).toHaveAttribute('href', '/brand/identity-a.svg?v=2');
  version = 3;
  await page.evaluate(() => dispatchEvent(new CustomEvent('store-identity-changed', { detail: { slug: 'loja-a' } })));
  await expect(icon(page)).toHaveAttribute('href', '/brand/identity-a.svg?v=3');
  let release: () => void = () => {};
  const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/public/stores/loja-a/identity', async route => {
    await wait;
    await route.fulfill({ json: { success: true, identity: { name: 'Resposta antiga', iconUrl: icons['loja-a'] } } }).catch(() => {});
  });
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await navigate(page, '/loja-b');
  await expect(page).toHaveTitle(names['loja-b']);
  release();
  await expect(icon(page)).toHaveAttribute('href', icons['loja-b']);
  await expect(page).toHaveTitle(names['loja-b']);
});

test('logo retangular ganha margem transparente sem deformação nem alteração do original', async ({ page }) => {
  await fixtures(page);
  await page.route('**/brand/wide.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64"><rect width="128" height="64" fill="red"/></svg>' }));
  await page.route('**/api/public/stores/loja-a/identity', route => route.fulfill({ json: { success: true, identity: { name: names['loja-a'], iconUrl: '/brand/wide.svg' } } }));
  await page.goto('/loja-a');
  await expect(icon(page)).toHaveAttribute('href', /^data:image\/png;/);
  const pixels = await page.evaluate(async () => {
    const image = new Image(); image.src = document.querySelector<HTMLLinkElement>('#page-favicon')!.href;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    return { top: [...context.getImageData(32, 0, 1, 1).data], middle: [...context.getImageData(32, 32, 1, 1).data], width: image.width, height: image.height };
  });
  expect(pixels).toEqual({ top: [0, 0, 0, 0], middle: [255, 0, 0, 255], width: 64, height: 64 });
  expect(await page.evaluate(() => fetch('/brand/wide.svg').then(response => response.text()))).toContain('width="128" height="64"');
});

test('HTML inicial funciona sem JavaScript com logo da loja e imagem de compartilhamento separados', async ({ browser }) => {
  const template = await readFile('dist/index.html', 'utf8');
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.route('**/loja-a', route => route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': contentSecurityPolicy }, body: renderStorefrontHtml(template, { slug: 'loja-a', origin: 'http://127.0.0.1:4173', storageOrigin: null, name: names['loja-a'], description: 'Cardápio', logo: '/brand/pode-vir-mark-small.png', cover: '/brand/pode-vir-social.png' }) }));
  await page.goto('/loja-a');
  await expect(page).toHaveTitle(names['loja-a']);
  await expect(icon(page)).toHaveCount(1);
  await expect(icon(page)).toHaveAttribute('href', 'http://127.0.0.1:4173/brand/pode-vir-mark-small.png');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'http://127.0.0.1:4173/brand/pode-vir-social.png');
  await context.close();
});

test('verifica logo do HTML inicial mesmo com API offline e elimina tags duplicadas', async ({ page }) => {
  const template = await readFile('dist/index.html', 'utf8');
  await fixtures(page);
  await page.route('**/api/public/stores/loja-a/identity', route => route.abort());
  await page.route('**/brand/missing.webp', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/loja-a', route => route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': contentSecurityPolicy }, body: renderStorefrontHtml(template, { slug: 'loja-a', origin: 'http://127.0.0.1:4173', storageOrigin: null, name: names['loja-a'], description: '', logo: '/brand/missing.webp', cover: '' }).replace('</head>', '<link rel="shortcut icon" href="/brand/identity-b.png" /></head>') }));
  await page.goto('/loja-a');
  await expect(page).toHaveTitle(names['loja-a']);
  await expect(icon(page)).toHaveCount(1);
  await expect(icon(page)).toHaveAttribute('href', fallback);
  await expect(page.locator('link[rel="shortcut icon"]')).toHaveCount(0);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
