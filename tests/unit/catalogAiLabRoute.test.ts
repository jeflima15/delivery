import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler, HttpError, asyncRoute } from '../../server/middleware/errors.js';

const mockAnalyzeMenuWithFullLab = vi.fn();

vi.mock('../../server/services/geminiService.js', () => ({
  analyzeMenuWithFullLab: (...args: any[]) => mockAnalyzeMenuWithFullLab(...args),
}));

// Monta app Express de teste simulando o pipeline da rota de laboratório
function createTestApp(userPermissions: string[] = ['catalog:write']) {
  const app = express();

  const parseRawCatalogFile: express.RequestHandler = (req, res, next) => {
    const rawParser = express.raw({
      type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      limit: 3 * 1024 * 1024,
    });
    rawParser(req, res, (err: any) => {
      if (err) {
        if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
          return next(new HttpError(413, 'O arquivo enviado excede o limite máximo de 3 MiB.', 'FILE_TOO_LARGE'));
        }
        return next(new HttpError(400, 'Falha ao processar arquivo enviado.', 'INVALID_FILE_PAYLOAD'));
      }
      next();
    });
  };

  const requireCatalogWrite: express.RequestHandler = (_req, _res, next) => {
    if (!userPermissions.includes('catalog:write')) {
      return next(new HttpError(403, 'Permissão insuficiente para alterar o catálogo.', 'FORBIDDEN'));
    }
    next();
  };

  app.post(
    '/api/tenant/stores/test-store/catalog/import/analyze-lab',
    requireCatalogWrite,
    parseRawCatalogFile,
    asyncRoute(async (req, res) => {
      const rawContentType = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!validTypes.includes(rawContentType)) {
        throw new HttpError(415, 'Formato inválido. Envie uma imagem JPG, PNG, WEBP ou um arquivo PDF.', 'INVALID_FILE_TYPE');
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new HttpError(400, 'Nenhum dado recebido ou arquivo vazio.', 'EMPTY_FILE');
      }

      if (req.body.length > 3 * 1024 * 1024) {
        throw new HttpError(413, 'O arquivo enviado excede o limite máximo de 3 MiB.', 'FILE_TOO_LARGE');
      }

      if (rawContentType === 'application/pdf') {
        const headerSnippet = req.body.subarray(0, 1024).toString('latin1');
        if (!headerSnippet.includes('%PDF-')) {
          throw new HttpError(400, 'O arquivo enviado não parece ser um PDF válido.', 'INVALID_PDF');
        }
      }

      const result = await mockAnalyzeMenuWithFullLab(req.body, rawContentType);
      res.json(result);
    })
  );

  app.use(errorHandler);
  return app;
}

describe('Rota /catalog/import/analyze-lab', () => {
  beforeEach(() => {
    mockAnalyzeMenuWithFullLab.mockReset();
  });

  it('rejeita requisição com 403 FORBIDDEN se o usuário não tiver permissão catalog:write', async () => {
    const app = createTestApp([]); // sem permissões
    const response = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('fake-image-data'));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(mockAnalyzeMenuWithFullLab).not.toHaveBeenCalled();
  });

  it('rejeita requisição com 415 INVALID_FILE_TYPE se MIME type for inválido (ex: text/plain)', async () => {
    const app = createTestApp(['catalog:write']);
    const response = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab')
      .set('Content-Type', 'text/plain')
      .send(Buffer.from('arquivo texto'));

    expect(response.status).toBe(415);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'INVALID_FILE_TYPE' },
    });
    expect(mockAnalyzeMenuWithFullLab).not.toHaveBeenCalled();
  });

  it('rejeita requisição com 400 EMPTY_FILE se o arquivo enviado estiver vazio', async () => {
    const app = createTestApp(['catalog:write']);
    const response = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(0));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'EMPTY_FILE' },
    });
    expect(mockAnalyzeMenuWithFullLab).not.toHaveBeenCalled();
  });

  it('rejeita requisição com 413 FILE_TOO_LARGE se o payload exceder 3 MiB', async () => {
    const app = createTestApp(['catalog:write']);
    const oversizedBuffer = Buffer.alloc(3 * 1024 * 1024 + 1024); // 3 MiB + 1 KB

    const response = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab')
      .set('Content-Type', 'image/jpeg')
      .send(oversizedBuffer);

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'FILE_TOO_LARGE' },
    });
    expect(mockAnalyzeMenuWithFullLab).not.toHaveBeenCalled();
  });

  it('rejeita PDF com 400 INVALID_PDF se a assinatura %PDF- não for encontrada nos primeiros 1024 bytes', async () => {
    const app = createTestApp(['catalog:write']);
    const corruptedPdfBuffer = Buffer.from('NOT_A_VALID_PDF_HEADER_BLAH_BLAH');

    const response = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab')
      .set('Content-Type', 'application/pdf')
      .send(corruptedPdfBuffer);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'INVALID_PDF',
        message: 'O arquivo enviado não parece ser um PDF válido.',
      },
    });
    expect(mockAnalyzeMenuWithFullLab).not.toHaveBeenCalled();
  });

  it('aceita PDF válido contendo %PDF- nos primeiros 1024 bytes e chama analyzeMenuWithFullLab', async () => {
    const app = createTestApp(['catalog:write']);
    // Simula PDF com alguns bytes de prefixo mas %PDF- nos primeiros 1024 bytes
    const validPdfBuffer = Buffer.concat([
      Buffer.from('   \r\n'), // espaço/CRLF tolerado
      Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'),
    ]);

    mockAnalyzeMenuWithFullLab.mockResolvedValue({
      success: true,
      model: 'gemini-2.5-flash',
      executionTimeMs: 1200,
      extractionExecutionTimeMs: 1200,
      data: {
        isMenu: true,
        categories: [
          {
            name: 'Sobremesas',
            products: [
              {
                name: 'Torta de Limão',
                sourcePage: 2,
                description: 'Cremosa',
                prices: [{ label: null, amountCents: 1500, prefix: null, unit: null, rawText: 'R$ 15,00' }],
                warnings: [],
              },
            ],
          },
        ],
        unmappedTexts: [],
        warnings: [],
      },
      rawJson: '{"isMenu":true}',
      enrichment: {
        status: 'skipped',
        reason: 'PDF_VISUAL_ENRICHMENT_NOT_ENABLED',
        message: 'A leitura do PDF foi concluída. A detecção automática de fotos em PDF ainda não está habilitada neste laboratório.',
      },
    });

    const response = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab')
      .set('Content-Type', 'application/pdf')
      .send(validPdfBuffer);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.categories[0].products[0].sourcePage).toBe(2);
    expect(response.body.enrichment.status).toBe('skipped');
    expect(mockAnalyzeMenuWithFullLab).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf');
  });

  it('retorna 200 e resultado estruturado com enrichment quando enviado Buffer de imagem válido', async () => {
    const app = createTestApp(['catalog:write']);
    const validBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // magic bytes JPEG

    mockAnalyzeMenuWithFullLab.mockResolvedValue({
      success: true,
      model: 'gemini-2.5-flash',
      executionTimeMs: 950,
      extractionExecutionTimeMs: 450,
      data: {
        isMenu: true,
        categories: [
          {
            name: 'Pizzas',
            products: [
              {
                name: 'Mussarela',
                description: 'Molho e mussarela',
                prices: [{ label: null, amountCents: 3000, prefix: null, unit: null, rawText: 'R$ 30,00' }],
                warnings: [],
              },
            ],
          },
        ],
        unmappedTexts: [],
        warnings: [],
      },
      rawJson: '{"isMenu":true}',
      enrichment: {
        status: 'ok',
        model: 'gemini-2.5-flash',
        executionTimeMs: 500,
        data: {
          sections: [{ categoryIndex: 0, sectionKind: 'products' }],
          items: [
            {
              itemKey: 'c0-p0',
              kind: 'product',
              sourceBox: [100, 50, 200, 450],
              photoBox: [110, 60, 190, 200],
              photoRelation: 'direct',
              photoWarning: null,
            },
          ],
          warnings: [],
        },
        rawJson: '{"items":[]}',
      },
    });

    const response = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab')
      .set('Content-Type', 'image/jpeg')
      .send(validBuffer);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.isMenu).toBe(true);
    expect(response.body.data.categories[0].products[0].name).toBe('Mussarela');
    expect(response.body.enrichment.status).toBe('ok');
    expect(response.body.enrichment.data.items[0].itemKey).toBe('c0-p0');
    expect(response.body.extractionExecutionTimeMs).toBe(450);
    expect(mockAnalyzeMenuWithFullLab).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg');
  });

  it('processa PDF válido com sucesso retornando enrichment skipped e pdfSemanticEnrichment', async () => {
    const app = createTestApp(['catalog:write']);
    const validPdfBuffer = Buffer.from('%PDF-1.4 fake pdf data for laboratory');

    mockAnalyzeMenuWithFullLab.mockResolvedValueOnce({
      success: true,
      model: 'gemini-2.5-flash',
      executionTimeMs: 1200,
      extractionExecutionTimeMs: 700,
      semanticExecutionTimeMs: 500,
      data: {
        isMenu: true,
        categories: [
          {
            name: 'Brigadeiros',
            products: [
              {
                name: 'Cento de Brigadeiros',
                sourcePage: 1,
                description: 'Doces finos',
                prices: [{ label: '100 un', amountCents: 28000, prefix: null, unit: null, rawText: 'R$ 280,00' }],
                warnings: [],
              },
            ],
          },
        ],
        unmappedTexts: ['Mínimo 25 por sabor'],
        warnings: [],
      },
      rawJson: '{"isMenu":true}',
      photoExecutionTimeMs: 400,
      enrichment: {
        status: 'skipped',
        reason: 'PDF_VISUAL_ENRICHMENT_NOT_ENABLED',
        message: 'A leitura do PDF foi concluída.',
      },
      pdfSemanticEnrichment: {
        status: 'ok',
        model: 'gemini-2.5-flash',
        executionTimeMs: 500,
        data: {
          items: [
            {
              itemKey: 'c0-p0',
              kind: 'product',
              parentItemKey: null,
              groupKey: null,
              pricingModel: 'quantity_tiers',
            },
          ],
          groups: [],
          businessRules: [
            {
              type: 'minimum_order',
              sourceTextKey: 'u0',
              rawText: 'Mínimo 25 por sabor',
              sourcePage: 1,
              relatedItemKey: 'c0-p0',
              relatedGroupKey: null,
            },
          ],
          ignoredTexts: [],
          warnings: [],
        },
        rawJson: '{"items":[]}',
      },
      pdfPhotoEnrichment: {
        status: 'ok',
        model: 'gemini-2.5-flash',
        executionTimeMs: 400,
        data: {
          items: [
            {
              itemKey: 'c0-p0',
              photoRelation: 'direct',
              photoBox: [100, 100, 300, 300],
              pageNumber: 1,
              photoWarning: '',
            },
          ],
          warnings: [],
        },
        rawJson: '{"items":[{"itemKey":"c0-p0"}]}',
      },
    });

    const response = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab')
      .set('Content-Type', 'application/pdf')
      .send(validPdfBuffer);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.isMenu).toBe(true);
    expect(response.body.enrichment.status).toBe('skipped');
    expect(response.body.pdfSemanticEnrichment).toBeDefined();
    expect(response.body.pdfSemanticEnrichment.status).toBe('ok');
    expect(response.body.pdfSemanticEnrichment.data.items[0].kind).toBe('product');
    expect(response.body.pdfSemanticEnrichment.data.businessRules[0].type).toBe('minimum_order');
    expect(response.body.semanticExecutionTimeMs).toBe(500);
    expect(response.body.photoExecutionTimeMs).toBe(400);
    expect(response.body.pdfPhotoEnrichment).toBeDefined();
    expect(response.body.pdfPhotoEnrichment.status).toBe('ok');
    expect(response.body.pdfPhotoEnrichment.data.items[0].photoRelation).toBe('direct');
    expect(response.body.pdfPhotoEnrichment.data.items[0].photoBox).toEqual([100, 100, 300, 300]);
    expect(mockAnalyzeMenuWithFullLab).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf');
  });
});
