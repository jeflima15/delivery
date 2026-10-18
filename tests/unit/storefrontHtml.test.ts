import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { publicOrigin, renderStorefrontHtml, storefrontSlug } from '../../server/services/storefrontHtml.js';
import { contentSecurityPolicy } from '../../server/security/contentSecurityPolicy.js';
import { PLATFORM_ICON, publicStoreIdentity } from '../../src/lib/storeIdentity.js';

it('usa apenas o logo na aba, preserva capa de compartilhamento e versiona sem alterar o original', async () => {
  const template = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const logo = 'https://store.supabase.co/storage/v1/object/public/loja/tenants/a/identity/logo.webp';
  const input = { slug: 'loja-a', origin: 'https://host.test', storageOrigin: 'https://store.supabase.co', name: 'Bolos & Cia', description: '', cover: '/brand/pode-vir-social.png', logo, updatedAt: new Date('2026-10-18T12:00:00Z') };
  const html = renderStorefrontHtml(template, input);
  expect(html).toContain('<title>Bolos &amp; Cia</title>');
  expect(html).not.toContain('| Pode Vir');
  expect(html).toContain(`href="${logo}?v=${input.updatedAt.getTime()}"`);
  expect(html).toContain('property="og:image" content="https://host.test/brand/pode-vir-social.png"');
  expect(html.match(/rel="icon"/g)).toHaveLength(1);
  expect(html.match(/rel="apple-touch-icon"/g)).toHaveLength(1);
  expect(html.match(/<title>/g)).toHaveLength(1);
  expect(html).not.toContain('type="image/png" href="https://store.supabase.co');
  expect(publicStoreIdentity({ ...input, updatedAt: '2026-10-18T13:00:00Z' }).iconUrl).not.toBe(publicStoreIdentity(input).iconUrl);
  expect(input.logo).toBe(logo);
});

it('usa ícone da plataforma para logo ausente ou inseguro mesmo com capa válida', async () => {
  const template = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  for (const logo of ['', null, 'data:image/png;base64,AA', 'javascript:alert(1)', 'https://evil.test/a.png', 'https://store.supabase.co/storage/v1/object/sign/loja/a?token=secret', 'https://user:secret@store.supabase.co/storage/v1/object/public/loja/a.webp']) {
    const html = renderStorefrontHtml(template, { slug: 'loja-b', origin: 'https://host.test', storageOrigin: 'https://store.supabase.co', name: 'Loja B', description: '', cover: '/brand/pode-vir-social.png', logo });
    expect(html).toContain(`rel="icon" type="image/png" href="${PLATFORM_ICON}"`);
    expect(html).not.toContain('secret');
  }
});

it('valida origem e somente reconhece caminhos de vitrine', () => {
  for (const value of ['javascript:alert(1)', 'https://u:p@host.test', 'https://host.test/path', 'https://host.test/?q=x', 'http://host.test']) expect(publicOrigin(value)).toBeNull();
  expect(publicOrigin('https://host.test')).toBe('https://host.test');
  expect(publicOrigin('http://localhost:4173', true)).toBe('http://localhost:4173');
  for (const path of ['/master', '/login', '/loja/admin', '/abc.png', '/invite/token']) expect(storefrontSlug(path)).toBeNull();
  expect(storefrontSlug('/loja-teste/')).toBe('loja-teste');
});

it('descarta imagens privadas, assinadas, maliciosas ou de origem externa', async () => {
  const template = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  for (const cover of ['javascript:alert(1)', '//evil.test/img', 'https://store.supabase.co/storage/v1/object/sign/loja/photo?token=private', 'https://evil.test/img']) {
    const html = renderStorefrontHtml(template, { slug: 'loja-a', origin: 'https://host.test', storageOrigin: 'https://store.supabase.co', name: '<img onerror="attack">', description: 'teste $&', cover, logo: '' });
    expect(html).toContain('property="og:image" content="https://host.test/brand/pode-vir-social.png"');
    expect(html).not.toContain('<img onerror=');
    expect(html).not.toContain('token=private');
    expect(html).toContain('teste $&');
  }
  const html = renderStorefrontHtml(template, { slug: 'loja-a', origin: 'https://host.test', storageOrigin: 'https://store.supabase.co', name: 'Loja', description: '', cover: 'https://store.supabase.co/storage/v1/object/public/loja/tenants/a/cover.webp', logo: '' });
  expect(html).toContain('og:image" content="https://store.supabase.co/storage/v1/object/public/loja/tenants/a/cover.webp');
});

it('aplica a mesma CSP na hospedagem estatica e no Express; preserva raiz, API e estaticos', async () => {
  const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
  expect(config.headers[0].headers.find((header: { key: string }) => header.key === 'Content-Security-Policy').value).toBe(contentSecurityPolicy);
  expect(config.rewrites).toEqual([
    { source: '/api/(.*)', destination: '/server.ts' },
    { source: '/', destination: '/landing.html' },
    { source: '/(.*)', destination: '/server.ts' },
  ]);
  expect(contentSecurityPolicy).not.toMatch(/script-src[^;]*unsafe/);
  for (const directive of ["object-src 'none'", 'font-src', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://tiles.openfreemap.org', "worker-src 'self' blob:"]) expect(contentSecurityPolicy).toContain(directive);
});
