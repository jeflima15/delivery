import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { errorHandler, HttpError, asyncRoute } from '../../server/middleware/errors.js';
import { validateBody } from '../../server/middleware/validate.js';
import { z } from 'zod';
import {
  CATALOG_IMPORT_TEMP_BUCKET,
  MAX_CATALOG_PDF_SIZE_BYTES,
  validateCatalogPdfTempPath,
} from '../../server/services/storageService.js';

const mockAnalyzeMenuWithFullLab = vi.fn();
const mockCreateCatalogPdfTempUpload = vi.fn();
const mockDownloadPrivateStorageFile = vi.fn();
const mockDeletePrivateStorageFile = vi.fn();

// Monta app Express de teste simulando os endpoints de PDF temporário
function createTestApp(options: {
  userPermissions?: string[];
  tenantId?: string;
} = {}) {
  const { userPermissions = ['catalog:write'], tenantId = '65f1a2b3c4d5e6f7a8b9c0d1' } = options;
  const app = express();
  app.use(express.json());

  // Simula middleware de autenticação e tenant
  app.use((req, _res, next) => {
    req.tenant = { _id: tenantId } as any;
    next();
  });

  const requireCatalogWrite: express.RequestHandler = (_req, _res, next) => {
    if (!userPermissions.includes('catalog:write')) {
      return next(new HttpError(403, 'Permissão insuficiente para alterar o catálogo.', 'FORBIDDEN'));
    }
    next();
  };

  const pdfTempSignSchema = z.object({
    mimeType: z.literal('application/pdf'),
    size: z.number().int().positive().max(MAX_CATALOG_PDF_SIZE_BYTES, 'O PDF deve ter no máximo 20 MB.'),
  });

  app.post(
    '/api/tenant/stores/test-store/catalog/import/pdf-temp/sign',
    requireCatalogWrite,
    validateBody(pdfTempSignSchema),
    asyncRoute(async (req, res) => {
      const upload = await mockCreateCatalogPdfTempUpload(req.tenant!._id, req.body.size);
      res.json({
        success: true,
        bucket: upload.bucket,
        path: upload.path,
        token: upload.token,
      });
    })
  );

  const pdfTempAnalyzeSchema = z.object({
    bucket: z.string(),
    path: z.string(),
  });

  app.post(
    '/api/tenant/stores/test-store/catalog/import/analyze-lab-pdf-temp',
    requireCatalogWrite,
    validateBody(pdfTempAnalyzeSchema),
    asyncRoute(async (req, res) => {
      const { bucket, path } = req.body;
      validateCatalogPdfTempPath(req.tenant!._id, bucket, path);

      try {
        const buffer = await mockDownloadPrivateStorageFile(bucket, path);
        if (!buffer || buffer.length === 0) {
          throw new HttpError(400, 'Nenhum dado recebido ou arquivo vazio.', 'EMPTY_FILE');
        }

        if (buffer.length > MAX_CATALOG_PDF_SIZE_BYTES) {
          throw new HttpError(413, 'O arquivo enviado excede o limite máximo de 20 MiB.', 'FILE_TOO_LARGE');
        }

        const headerSnippet = buffer.subarray(0, 1024).toString('latin1');
        if (!headerSnippet.includes('%PDF-')) {
          throw new HttpError(400, 'O arquivo enviado não parece ser um PDF válido.', 'INVALID_PDF');
        }

        const result = await mockAnalyzeMenuWithFullLab(buffer, 'application/pdf');
        res.json(result);
      } finally {
        await mockDeletePrivateStorageFile(bucket, path);
      }
    })
  );

  const pdfTempDeleteSchema = z.object({
    bucket: z.string(),
    path: z.string(),
  });

  app.delete(
    '/api/tenant/stores/test-store/catalog/import/pdf-temp',
    requireCatalogWrite,
    validateBody(pdfTempDeleteSchema),
    asyncRoute(async (req, res) => {
      const { bucket, path } = req.body;
      validateCatalogPdfTempPath(req.tenant!._id, bucket, path);

      await mockDeletePrivateStorageFile(bucket, path);
      res.json({ success: true });
    })
  );

  app.use(errorHandler);
  return app;
}

describe('Validador rígido de path: validateCatalogPdfTempPath', () => {
  const tenantId = '65f1a2b3c4d5e6f7a8b9c0d1';
  const validUuid = crypto.randomUUID();
  const validPath = `tenants/${tenantId}/catalog-import-temp/lab/${validUuid}.pdf`;

  it('aceita formato exato tenants/<tenantId>/catalog-import-temp/lab/<UUID>.pdf', () => {
    const result = validateCatalogPdfTempPath(tenantId, CATALOG_IMPORT_TEMP_BUCKET, validPath);
    expect(result).toEqual({ tenantId, uuid: validUuid });
  });

  it('rejeita bucket diferente de catalog-import-temp com INVALID_STORAGE_BUCKET (400)', () => {
    expect(() => {
      validateCatalogPdfTempPath(tenantId, 'outro-bucket', validPath);
    }).toThrowError(expect.objectContaining({ code: 'INVALID_STORAGE_BUCKET', status: 400 }));
  });

  it('rejeita path pertencente a outro tenant (cross-tenant attack) com FORBIDDEN_STORAGE_PATH (403)', () => {
    const otherTenantId = '99f9a9b9c9d9e9f9a9b9c9d9';
    expect(() => {
      validateCatalogPdfTempPath(tenantId, CATALOG_IMPORT_TEMP_BUCKET, `tenants/${otherTenantId}/catalog-import-temp/lab/${validUuid}.pdf`);
    }).toThrowError(expect.objectContaining({ code: 'FORBIDDEN_STORAGE_PATH', status: 403 }));
  });

  it('rejeita path com subpasta extra com FORBIDDEN_STORAGE_PATH (403)', () => {
    expect(() => {
      validateCatalogPdfTempPath(tenantId, CATALOG_IMPORT_TEMP_BUCKET, `tenants/${tenantId}/catalog-import-temp/lab/subpasta/${validUuid}.pdf`);
    }).toThrowError(expect.objectContaining({ code: 'FORBIDDEN_STORAGE_PATH', status: 403 }));
  });

  it('rejeita path com UUID inválido com FORBIDDEN_STORAGE_PATH (403)', () => {
    expect(() => {
      validateCatalogPdfTempPath(tenantId, CATALOG_IMPORT_TEMP_BUCKET, `tenants/${tenantId}/catalog-import-temp/lab/not-a-valid-uuid.pdf`);
    }).toThrowError(expect.objectContaining({ code: 'FORBIDDEN_STORAGE_PATH', status: 403 }));
  });

  it('rejeita path com extensão não pdf com FORBIDDEN_STORAGE_PATH (403)', () => {
    expect(() => {
      validateCatalogPdfTempPath(tenantId, CATALOG_IMPORT_TEMP_BUCKET, `tenants/${tenantId}/catalog-import-temp/lab/${validUuid}.png`);
    }).toThrowError(expect.objectContaining({ code: 'FORBIDDEN_STORAGE_PATH', status: 403 }));
  });

  it('rejeita path traversal com FORBIDDEN_STORAGE_PATH (403)', () => {
    expect(() => {
      validateCatalogPdfTempPath(tenantId, CATALOG_IMPORT_TEMP_BUCKET, `tenants/${tenantId}/catalog-import-temp/lab/../${validUuid}.pdf`);
    }).toThrowError(expect.objectContaining({ code: 'FORBIDDEN_STORAGE_PATH', status: 403 }));
  });
});

describe('Endpoint POST /catalog/import/pdf-temp/sign', () => {
  beforeEach(() => {
    mockCreateCatalogPdfTempUpload.mockReset();
  });

  it('rejeita se usuário não tiver permissão catalog:write (403)', async () => {
    const app = createTestApp({ userPermissions: [] });
    const res = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/pdf-temp/sign')
      .send({ mimeType: 'application/pdf', size: 1024 });

    expect(res.status).toBe(403);
  });

  it('rejeita mimeType diferente de application/pdf (400)', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/pdf-temp/sign')
      .send({ mimeType: 'image/jpeg', size: 1024 });

    expect(res.status).toBe(400);
  });

  it('rejeita tamanho superior a 20 MiB (400/413)', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/pdf-temp/sign')
      .send({ mimeType: 'application/pdf', size: 21 * 1024 * 1024 });

    expect(res.status).toBe(400);
  });

  it('retorna signed upload data com sucesso', async () => {
    const app = createTestApp();
    mockCreateCatalogPdfTempUpload.mockResolvedValueOnce({
      bucket: 'catalog-import-temp',
      path: 'tenants/65f1a2b3c4d5e6f7a8b9c0d1/catalog-import-temp/lab/test-uuid.pdf',
      token: 'signed-token-123',
    });

    const res = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/pdf-temp/sign')
      .send({ mimeType: 'application/pdf', size: 5 * 1024 * 1024 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      bucket: 'catalog-import-temp',
      path: 'tenants/65f1a2b3c4d5e6f7a8b9c0d1/catalog-import-temp/lab/test-uuid.pdf',
      token: 'signed-token-123',
    });
  });
});

describe('Endpoint POST /catalog/import/analyze-lab-pdf-temp', () => {
  const tenantId = '65f1a2b3c4d5e6f7a8b9c0d1';
  const validUuid = crypto.randomUUID();
  const validPath = `tenants/${tenantId}/catalog-import-temp/lab/${validUuid}.pdf`;

  beforeEach(() => {
    mockDownloadPrivateStorageFile.mockReset();
    mockDeletePrivateStorageFile.mockReset();
    mockAnalyzeMenuWithFullLab.mockReset();
  });

  it('rejeita requisição com 403 se usuário não tiver permissão catalog:write', async () => {
    const app = createTestApp({ userPermissions: [] });
    const res = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab-pdf-temp')
      .send({ bucket: 'catalog-import-temp', path: validPath });

    expect(res.status).toBe(403);
  });

  it('rejeita se o arquivo baixado for vazio (400 EMPTY_FILE)', async () => {
    const app = createTestApp({ tenantId });
    mockDownloadPrivateStorageFile.mockResolvedValueOnce(Buffer.alloc(0));

    const res = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab-pdf-temp')
      .send({ bucket: 'catalog-import-temp', path: validPath });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMPTY_FILE');
    // Confirma que delete foi chamado no finally mesmo com erro
    expect(mockDeletePrivateStorageFile).toHaveBeenCalledWith('catalog-import-temp', validPath);
  });

  it('rejeita se o arquivo exceder 20 MiB (413 FILE_TOO_LARGE)', async () => {
    const app = createTestApp({ tenantId });
    mockDownloadPrivateStorageFile.mockResolvedValueOnce(Buffer.alloc(20 * 1024 * 1024 + 1));

    const res = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab-pdf-temp')
      .send({ bucket: 'catalog-import-temp', path: validPath });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(mockDeletePrivateStorageFile).toHaveBeenCalledWith('catalog-import-temp', validPath);
  });

  it('rejeita se o arquivo não contiver assinatura %PDF- (400 INVALID_PDF)', async () => {
    const app = createTestApp({ tenantId });
    mockDownloadPrivateStorageFile.mockResolvedValueOnce(Buffer.from('corrupted data without pdf header'));

    const res = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab-pdf-temp')
      .send({ bucket: 'catalog-import-temp', path: validPath });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PDF');
    expect(mockDeletePrivateStorageFile).toHaveBeenCalledWith('catalog-import-temp', validPath);
  });

  it('processa PDF com sucesso, chama analyzeMenuWithFullLab e deleta no finally', async () => {
    const app = createTestApp({ tenantId });
    const fakePdfBuffer = Buffer.from('%PDF-1.4 mock content for menu analysis');
    mockDownloadPrivateStorageFile.mockResolvedValueOnce(fakePdfBuffer);
    mockDeletePrivateStorageFile.mockResolvedValueOnce(true);
    mockAnalyzeMenuWithFullLab.mockResolvedValueOnce({
      success: true,
      model: 'gemini-2.5-flash',
      executionTimeMs: 1200,
      extractionExecutionTimeMs: 400,
      data: { isMenu: true, categories: [] },
      rawJson: '{}',
    });

    const res = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab-pdf-temp')
      .send({ bucket: 'catalog-import-temp', path: validPath });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockAnalyzeMenuWithFullLab).toHaveBeenCalledWith(fakePdfBuffer, 'application/pdf');
    // Confirma que delete foi chamado no finally em caso de sucesso
    expect(mockDeletePrivateStorageFile).toHaveBeenCalledWith('catalog-import-temp', validPath);
  });

  it('exclui arquivo no finally mesmo se a IA falhar com erro', async () => {
    const app = createTestApp({ tenantId });
    const fakePdfBuffer = Buffer.from('%PDF-1.4 mock content');
    mockDownloadPrivateStorageFile.mockResolvedValueOnce(fakePdfBuffer);
    mockAnalyzeMenuWithFullLab.mockRejectedValueOnce(new HttpError(500, 'Gemini failure', 'AI_FAILED'));

    const res = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab-pdf-temp')
      .send({ bucket: 'catalog-import-temp', path: validPath });

    expect(res.status).toBe(500);
    expect(mockDeletePrivateStorageFile).toHaveBeenCalledWith('catalog-import-temp', validPath);
  });

  it('preserva resposta da análise mesmo se a exclusão do storage retornar falso ou falhar', async () => {
    const app = createTestApp({ tenantId });
    const fakePdfBuffer = Buffer.from('%PDF-1.4 mock content');
    mockDownloadPrivateStorageFile.mockResolvedValueOnce(fakePdfBuffer);
    mockDeletePrivateStorageFile.mockResolvedValueOnce(false); // delete retornou falso mas não interrompeu
    mockAnalyzeMenuWithFullLab.mockResolvedValueOnce({
      success: true,
      model: 'gemini-2.5-flash',
      executionTimeMs: 1200,
      extractionExecutionTimeMs: 400,
      data: { isMenu: true, categories: [] },
      rawJson: '{}',
    });

    const res = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab-pdf-temp')
      .send({ bucket: 'catalog-import-temp', path: validPath });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Endpoint DELETE /catalog/import/pdf-temp', () => {
  const tenantId = '65f1a2b3c4d5e6f7a8b9c0d1';
  const validUuid = crypto.randomUUID();
  const validPath = `tenants/${tenantId}/catalog-import-temp/lab/${validUuid}.pdf`;

  beforeEach(() => {
    mockDeletePrivateStorageFile.mockReset();
  });

  it('rejeita se o path for inválido ou de outro tenant (403)', async () => {
    const app = createTestApp({ tenantId });
    const res = await request(app)
      .delete('/api/tenant/stores/test-store/catalog/import/pdf-temp')
      .send({ bucket: 'catalog-import-temp', path: 'tenants/other-tenant/catalog-import-temp/lab/uuid.pdf' });

    expect(res.status).toBe(403);
    expect(mockDeletePrivateStorageFile).not.toHaveBeenCalled();
  });

  it('executa exclusão manual com sucesso para path válido', async () => {
    const app = createTestApp({ tenantId });
    mockDeletePrivateStorageFile.mockResolvedValueOnce(true);

    const res = await request(app)
      .delete('/api/tenant/stores/test-store/catalog/import/pdf-temp')
      .send({ bucket: 'catalog-import-temp', path: validPath });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockDeletePrivateStorageFile).toHaveBeenCalledWith('catalog-import-temp', validPath);
  });
});
