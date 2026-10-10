import express from 'express';
import request from 'supertest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import Tenant from '../../server/models/Tenant.js';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('../../server/routes/index.js', () => ({ default: express.Router() }));
vi.mock('../../server/db/connect.js', () => ({ connectDatabase: vi.fn(), databaseReady: () => false }));
vi.mock('../../server/models/Tenant.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../src/models/StoreSettings.js', () => ({ default: { findOne: vi.fn() } }));

let directory: string;
let app: express.Express;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pode-vir-landing-http-'));
  await mkdir(join(directory, 'dist'));
  await writeFile(join(directory, 'dist', 'landing.html'), '<html><title>Institucional</title><h1>Conheça a Pode Vir</h1></html>');
  await writeFile(join(directory, 'dist', 'index.html'), '<html><title>SPA</title><div id="root"></div></html>');
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);
  try { app = (await import('../../server')).default; }
  finally { cwd.mockRestore(); }
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (directory) await rm(directory, { recursive: true, force: true });
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
