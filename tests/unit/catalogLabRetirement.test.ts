import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import tenantOperationsRouter from '../../server/routes/tenantOperations.js';
import { TenantAdminApi } from '../../src/components/tenant-admin/api';

describe('Retired experimental catalog routes', () => {
  const app = express();
  app.use(tenantOperationsRouter);
  app.use((_req, res) => { res.status(404).json({ code: 'NOT_FOUND' }); });

  it.each([
    ['post', '/catalog/import/test-ai'],
    ['post', '/catalog/import/analyze-lab'],
    ['post', '/catalog/import/pdf-temp/sign'],
    ['post', '/catalog/import/analyze-lab-pdf-temp'],
    ['delete', '/catalog/import/pdf-temp'],
  ] as const)('does not expose %s %s', async (method, path) => {
    const response = await request(app)[method](path).send({});
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('retains only the final importer API', () => {
    expect(TenantAdminApi.prototype.createCatalogImport).toBeTypeOf('function');
    expect(TenantAdminApi.prototype.confirmCatalogImport).toBeTypeOf('function');
    for (const method of ['testCatalogImportAi', 'analyzeMenuImageLab', 'signPdfTempUpload', 'analyzePdfTempLab', 'deletePdfTempUpload']) {
      expect(method in TenantAdminApi.prototype).toBe(false);
    }
  });
});
