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

  const parseRawImage: express.RequestHandler = (req, res, next) => {
    const rawParser = express.raw({
      type: ['image/jpeg', 'image/png', 'image/webp'],
      limit: 3 * 1024 * 1024,
    });
    rawParser(req, res, (err: any) => {
      if (err) {
        if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
          return next(new HttpError(413, 'O arquivo enviado excede o limite máximo de 3 MiB.', 'FILE_TOO_LARGE'));
        }
        return next(new HttpError(400, 'Falha ao processar imagem enviada.', 'INVALID_IMAGE_PAYLOAD'));
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
    parseRawImage,
    asyncRoute(async (req, res) => {
      const rawContentType = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(rawContentType)) {
        throw new HttpError(415, 'Formato inválido. Envie uma imagem JPG, PNG ou WEBP.', 'INVALID_FILE_TYPE');
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new HttpError(400, 'Nenhum dado de imagem recebido ou arquivo vazio.', 'EMPTY_FILE');
      }

      if (req.body.length > 3 * 1024 * 1024) {
        throw new HttpError(413, 'O arquivo enviado excede o limite máximo de 3 MiB.', 'FILE_TOO_LARGE');
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

  it('rejeita requisição com 415 INVALID_FILE_TYPE se MIME type for inválido (ex: application/pdf)', async () => {
    const app = createTestApp(['catalog:write']);
    const response = await request(app)
      .post('/api/tenant/stores/test-store/catalog/import/analyze-lab')
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('fake-pdf-content'));

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
});
