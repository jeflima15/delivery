import express from 'express';
import request from 'supertest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import Tenant from '../../server/models/Tenant.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import { connectDatabase } from '../../server/db/connect.js';
import { contentSecurityPolicy } from '../../server/security/contentSecurityPolicy.js';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('../../server/routes/index.js', () => ({ default: express.Router() }));
vi.mock('../../server/db/connect.js', () => ({ connectDatabase: vi.fn(), databaseReady: () => false }));
const modelMocks = vi.hoisted(() => ({ tenant: vi.fn(), settings: vi.fn() }));
vi.mock('../../server/models/Tenant.js', () => ({ default: { findOne: modelMocks.tenant } }));
vi.mock('../../src/models/StoreSettings.js', () => ({ default: { findOne: modelMocks.settings } }));

let directory: string;
let app: express.Express;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pode-vir-landing-http-'));
  await mkdir(join(directory, 'dist'));
  await writeFile(join(directory, 'dist', 'landing.html'), '<html><title>Institucional</title><h1>Conheça a Pode Vir</h1></html>');
  await writeFile(join(directory, 'dist', 'index.html'), '<html><head><!--tab-icon--><link rel="icon" href="/brand/pode-vir-mark-small.png" /><!--/tab-icon--><!--page-metadata--><title>SPA</title><meta name="description" content="Neutro" /><!--/page-metadata--></head><div id="root"></div></html>');
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);
  try { app = (await import('../../server')).default; }
  finally { cwd.mockRestore(); }
});

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('APP_ORIGIN', 'https://podevir.test'); });

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('renderiza duas lojas sem JavaScript, sem cache compartilhado nem dados privados', async () => {
  for (const [slug, name] of [['loja-a', 'Bolos <A> "teste"'], ['loja-b', 'Pizza B']]) {
    const selectTenant = vi.fn().mockReturnValue({ lean: async () => ({ _id: slug, displayName: name, status: 'active', owner: { email: 'private@test' } }) });
    modelMocks.tenant.mockReturnValue({ select: selectTenant });
    const selectSettings = vi.fn().mockReturnValue({ lean: async () => ({ nome_loja: name, sobre_texto: 'Descrição <script>alert(1)</script>', logo_url: '/brand/logo.png', telefone: 'private-phone' }) });
    modelMocks.settings.mockReturnValue({ select: selectSettings });
    const response = await request(app).get(`/${slug}?utm_source=test`).set('Host', 'evil.test').set('X-Forwarded-Host', 'evil.test').expect(200);
    expect(response.text).toContain(`property="og:url" content="https://podevir.test/${slug}"`);
    expect(response.text).toContain('property="og:image" content="https://podevir.test/brand/logo.png"');
    expect(response.text).toContain(`href="https://podevir.test/brand/logo.png" data-store-slug="${slug}"`);
    expect(response.text.match(/rel="icon"/g)).toHaveLength(1);
    expect(response.text).not.toContain('type="image/png"');
    expect(response.text).not.toContain('<script>alert(1)</script>');
    expect(response.text).not.toMatch(/private@test|private-phone|evil.test/);
    expect(response.text).not.toContain(slug === 'loja-a' ? 'Pizza B' : 'Bolos');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['cdn-cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toBe(contentSecurityPolicy);
    expect(selectTenant).toHaveBeenCalledWith('_id displayName status');
    expect(StoreSettings.findOne).toHaveBeenLastCalledWith({ tenantId: slug });
  }
});

it('nao consulta tenant nem personaliza HTML em admin, Master, login ou reset', async () => {
  for (const path of ['/loja-a/admin', '/loja-a/admin/pedidos', '/master', '/login', '/invite/token', '/loja-a/recuperar-senha/token']) {
    const response = await request(app).get(path).expect(200);
    expect(response.text).not.toContain('og:title');
  }
  expect(Tenant.findOne).not.toHaveBeenCalled();
  expect(connectDatabase).not.toHaveBeenCalled();
});

it('usa HTML neutro para inexistente, indisponivel, origem invalida ou banco fora do ar', async () => {
  for (const { tenant, status } of [{ tenant: null, status: 404 }, { tenant: { status: 'suspended' }, status: 423 }, { tenant: { status: 'archived' }, status: 423 }]) {
    modelMocks.tenant.mockReturnValue({ select: () => ({ lean: async () => tenant }) });
    const response = await request(app).get('/loja-a').expect(status);
    expect(response.text).not.toContain('og:title');
    expect(response.headers['x-robots-tag']).toBe('noindex');
  }
  vi.mocked(connectDatabase).mockRejectedValueOnce(new Error('offline'));
  expect((await request(app).get('/loja-a').expect(503)).text).not.toContain('og:title');
  vi.stubEnv('APP_ORIGIN', 'https://user:pass@evil.test/path');
  expect((await request(app).get('/loja-a').expect(503)).text).not.toContain('og:title');
});

it('serve HTML institucional na raiz sem resolver tenant, criar cookie ou enfraquecer CSP', async () => {
  const response = await request(app).get('/?utm_source=instagram').expect(200);
  expect(response.text).toContain('Conheça a Pode Vir');
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(Tenant.findOne).not.toHaveBeenCalled();
});

it('preserva o documento SPA separado para as demais entradas', async () => {
  const response = await request(app).get('/login').expect(200);
  expect(response.text).not.toContain('Conheça a Pode Vir');
  expect(response.text).toContain('id="root"');
});
