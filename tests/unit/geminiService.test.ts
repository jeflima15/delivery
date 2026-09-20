import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  testGeminiIntegration,
  analyzeMenuBufferWithGemini,
  analyzeMenuVisualEnrichmentWithGemini,
  analyzeMenuWithFullLab,
} from '../../server/services/geminiService.js';
import {
  validateSemanticReferences,
} from '../../server/services/pdfSemanticService.js';
import {
  validatePdfPhotoReferences,
} from '../../server/services/pdfPhotoService.js';
import { HttpError } from '../../server/middleware/errors.js';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  return {
    Type: {
      TYPE_UNSPECIFIED: 'TYPE_UNSPECIFIED',
      STRING: 'STRING',
      NUMBER: 'NUMBER',
      INTEGER: 'INTEGER',
      BOOLEAN: 'BOOLEAN',
      ARRAY: 'ARRAY',
      OBJECT: 'OBJECT',
      NULL: 'NULL',
    },
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGenerateContent,
      };
      constructor(_options: any) {}
    },
  };
});

describe('geminiService: testGeminiIntegration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('retorna erro se GEMINI_API_KEY estiver ausente', async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.CATALOG_IMPORT_MODEL = 'gemini-2.5-flash';

    await expect(testGeminiIntegration()).rejects.toThrowError(HttpError);
    await expect(testGeminiIntegration()).rejects.toMatchObject({
      status: 400,
      code: 'GEMINI_API_KEY_MISSING',
      message: 'Configuração ausente: GEMINI_API_KEY não informada no servidor.',
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('retorna erro se CATALOG_IMPORT_MODEL estiver ausente', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key-123';
    delete process.env.CATALOG_IMPORT_MODEL;

    await expect(testGeminiIntegration()).rejects.toThrowError(HttpError);
    await expect(testGeminiIntegration()).rejects.toMatchObject({
      status: 400,
      code: 'CATALOG_IMPORT_MODEL_MISSING',
      message: 'Configuração ausente: CATALOG_IMPORT_MODEL não informado no servidor.',
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('chama o Gemini e retorna sucesso com modelo e resposta esperada', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key-123';
    process.env.CATALOG_IMPORT_MODEL = 'gemini-2.5-flash';

    mockGenerateContent.mockResolvedValue({
      text: 'OK',
    });

    const result = await testGeminiIntegration();
    expect(result).toEqual({
      success: true,
      model: 'gemini-2.5-flash',
      response: 'OK',
    });

    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: 'Responda somente com: OK',
    });
  });

  it('sanitiza mensagens de erro para não expor a chave de API', async () => {
    process.env.GEMINI_API_KEY = 'secret-key-xyz';
    process.env.CATALOG_IMPORT_MODEL = 'gemini-2.5-flash';

    mockGenerateContent.mockRejectedValue(
      new Error('API call failed: https://generativelanguage.googleapis.com/v1beta?key=secret-key-xyz')
    );

    try {
      await testGeminiIntegration();
      expect.unreachable('Deveria ter lançado erro');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(502);
      expect(err.code).toBe('GEMINI_SERVICE_ERROR');
      expect(err.message).not.toContain('secret-key-xyz');
      expect(err.message).toContain('key=[REDACTED]');
    }
  });
});

describe('geminiService: analyzeMenuBufferWithGemini', () => {
  const originalEnv = process.env;
  const sampleBuffer = Buffer.from('fake-image-bytes');
  const sampleMime = 'image/jpeg';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GEMINI_API_KEY = 'test-gemini-key-123';
    process.env.CATALOG_IMPORT_MODEL = 'gemini-2.5-flash';
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('retorna erro se GEMINI_API_KEY estiver ausente', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(analyzeMenuBufferWithGemini(sampleBuffer, sampleMime)).rejects.toThrowError(HttpError);
    await expect(analyzeMenuBufferWithGemini(sampleBuffer, sampleMime)).rejects.toMatchObject({
      status: 400,
      code: 'GEMINI_API_KEY_MISSING',
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('retorna erro se CATALOG_IMPORT_MODEL estiver ausente', async () => {
    delete process.env.CATALOG_IMPORT_MODEL;

    await expect(analyzeMenuBufferWithGemini(sampleBuffer, sampleMime)).rejects.toThrowError(HttpError);
    await expect(analyzeMenuBufferWithGemini(sampleBuffer, sampleMime)).rejects.toMatchObject({
      status: 400,
      code: 'CATALOG_IMPORT_MODEL_MISSING',
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('processa cardápio com sucesso incluindo múltiplos preços e prefixos', async () => {
    const validMenu = {
      isMenu: true,
      categories: [
        {
          name: 'Pizzas Artesanais',
          products: [
            {
              name: 'Calabresa Especial',
              description: 'Molho artesanal, mussarela e calabresa fatiada',
              prices: [
                {
                  label: 'P',
                  amountCents: 3500,
                  prefix: null,
                  unit: null,
                  rawText: 'P R$ 35,00',
                },
                {
                  label: 'G',
                  amountCents: 5500,
                  prefix: 'a partir de',
                  unit: '8 fatias',
                  rawText: 'G a partir de R$ 55,00 (8 fatias)',
                },
              ],
              warnings: [],
            },
          ],
        },
      ],
      unmappedTexts: ['Atendimento das 18h às 23h'],
      warnings: [],
    };

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(validMenu),
    });

    const result = await analyzeMenuBufferWithGemini(sampleBuffer, sampleMime);

    expect(result.success).toBe(true);
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.data.isMenu).toBe(true);
    expect(result.data.categories).toHaveLength(1);
    expect(result.data.categories[0].name).toBe('Pizzas Artesanais');

    const product = result.data.categories[0].products[0];
    expect(product.name).toBe('Calabresa Especial');
    expect(product.prices).toHaveLength(2);
    expect(product.prices[0]).toEqual({
      label: 'P',
      amountCents: 3500,
      prefix: null,
      unit: null,
      rawText: 'P R$ 35,00',
    });
    expect(product.prices[1]).toEqual({
      label: 'G',
      amountCents: 5500,
      prefix: 'a partir de',
      unit: '8 fatias',
      rawText: 'G a partir de R$ 55,00 (8 fatias)',
    });
    expect(result.data.unmappedTexts).toEqual(['Atendimento das 18h às 23h']);

    // Verifica chamada ao SDK com inlineData e prompt
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: sampleBuffer.toString('base64'),
            mimeType: sampleMime,
          },
        },
        expect.objectContaining({
          text: expect.stringContaining('especialista em transcrição'),
        }),
      ],
      config: expect.objectContaining({
        responseMimeType: 'application/json',
        responseSchema: expect.any(Object),
      }),
    });
  });

  it('aceita amountCents nulo quando preço for indeterminado', async () => {
    const menuWithNullPrice = {
      isMenu: true,
      categories: [
        {
          name: 'Pratos do Dia',
          products: [
            {
              name: 'Peixe do Dia',
              description: 'Consulte o garçom',
              prices: [
                {
                  label: null,
                  amountCents: null,
                  prefix: null,
                  unit: null,
                  rawText: 'Preço sob consulta',
                },
              ],
              warnings: ['Preço não especificado numericamente'],
            },
          ],
        },
      ],
      unmappedTexts: [],
      warnings: [],
    };

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(menuWithNullPrice),
    });

    const result = await analyzeMenuBufferWithGemini(sampleBuffer, sampleMime);
    expect(result.data.categories[0].products[0].prices[0].amountCents).toBeNull();
    expect(result.data.categories[0].products[0].prices[0].rawText).toBe('Preço sob consulta');
    expect(result.data.categories[0].products[0].warnings).toContain('Preço não especificado numericamente');
  });

  it('retorna isMenu: false com sucesso amigável quando imagem não for cardápio', async () => {
    const nonMenuResponse = {
      isMenu: false,
      categories: [],
      unmappedTexts: [],
      warnings: ['Não foi possível identificar um cardápio legível nesta imagem.'],
    };

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(nonMenuResponse),
    });

    const result = await analyzeMenuBufferWithGemini(sampleBuffer, sampleMime);
    expect(result.success).toBe(true);
    expect(result.data.isMenu).toBe(false);
    expect(result.data.categories).toEqual([]);
    expect(result.data.warnings).toContain('Não foi possível identificar um cardápio legível nesta imagem.');
  });

  it('lança erro 502 GEMINI_EMPTY_RESPONSE se modelo retornar texto vazio', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '   ',
    });

    await expect(analyzeMenuBufferWithGemini(sampleBuffer, sampleMime)).rejects.toMatchObject({
      status: 502,
      code: 'GEMINI_EMPTY_RESPONSE',
    });
  });

  it('lança erro 502 INVALID_GEMINI_RESPONSE se modelo retornar JSON inválido', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'Não sou um JSON: { isMenu: ...',
    });

    await expect(analyzeMenuBufferWithGemini(sampleBuffer, sampleMime)).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_GEMINI_RESPONSE',
    });
  });

  it('lança erro 502 INVALID_GEMINI_RESPONSE se JSON não atender ao schema Zod', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        isMenu: 'não-booleano', // Deveria ser boolean
      }),
    });

    await expect(analyzeMenuBufferWithGemini(sampleBuffer, sampleMime)).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_GEMINI_RESPONSE',
    });
  });

  it('mapeia erro de cota para 429 GEMINI_QUOTA_EXCEEDED', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Quota exceeded for quota metric'));

    await expect(analyzeMenuBufferWithGemini(sampleBuffer, sampleMime)).rejects.toMatchObject({
      status: 429,
      code: 'GEMINI_QUOTA_EXCEEDED',
    });
  });

  it('mapeia timeout do modelo para 504 GEMINI_TIMEOUT', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Deadline exceeded'));

    await expect(analyzeMenuBufferWithGemini(sampleBuffer, sampleMime)).rejects.toMatchObject({
      status: 504,
      code: 'GEMINI_TIMEOUT',
    });
  });

  it('sanitiza chaves de API em caso de erro genérico do provedor', async () => {
    mockGenerateContent.mockRejectedValue(
      new Error('Failure contacting endpoint: https://generativelanguage.googleapis.com?key=super-secret-key-456')
    );

    try {
      await analyzeMenuBufferWithGemini(sampleBuffer, sampleMime);
      expect.unreachable('Deveria ter lançado erro');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(502);
      expect(err.code).toBe('GEMINI_SERVICE_ERROR');
      expect(err.message).not.toContain('super-secret-key-456');
      expect(err.message).toContain('key=[REDACTED]');
    }
  });
});

describe('geminiService: analyzeMenuVisualEnrichmentWithGemini', () => {
  const originalEnv = process.env;
  const sampleBuffer = Buffer.from('fake-image-bytes');
  const sampleMime = 'image/jpeg';
  const sampleCompactItems = [
    { itemKey: 'c0-p0', category: 'Pizzas', name: 'Calabresa' },
    { itemKey: 'c0-p1', category: 'Pizzas', name: 'Mussarela' },
    { itemKey: 'c1-p0', category: null, name: 'Refrigerante Lata' },
  ];

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GEMINI_API_KEY = 'test-gemini-key-123';
    process.env.CATALOG_IMPORT_MODEL = 'gemini-2.5-flash';
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('retorna erro se GEMINI_API_KEY estiver ausente', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      analyzeMenuVisualEnrichmentWithGemini(sampleBuffer, sampleMime, sampleCompactItems)
    ).rejects.toMatchObject({
      status: 400,
      code: 'GEMINI_API_KEY_MISSING',
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('retorna erro se CATALOG_IMPORT_MODEL estiver ausente', async () => {
    delete process.env.CATALOG_IMPORT_MODEL;

    await expect(
      analyzeMenuVisualEnrichmentWithGemini(sampleBuffer, sampleMime, sampleCompactItems)
    ).rejects.toMatchObject({
      status: 400,
      code: 'CATALOG_IMPORT_MODEL_MISSING',
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('processa enriquecimento visual com sucesso para classificações e bounding boxes', async () => {
    const validEnrichment = {
      sections: [
        { categoryIndex: 0, sectionKind: 'products' },
        { categoryIndex: 1, sectionKind: 'addons' },
      ],
      items: [
        {
          itemKey: 'c0-p0',
          kind: 'product',
          sourceBox: [100, 50, 200, 450],
          photoBox: [110, 60, 190, 200],
          photoRelation: 'direct',
          photoWarning: null,
        },
        {
          itemKey: 'c0-p1',
          kind: 'product',
          sourceBox: [210, 50, 310, 450],
          photoBox: [110, 60, 190, 200],
          photoRelation: 'shared',
          photoWarning: 'Foto compartilhada com a categoria ou item adjacente',
        },
        {
          itemKey: 'c1-p0',
          kind: 'option',
          sourceBox: [500, 50, 550, 300],
          photoBox: null,
          photoRelation: 'none',
          photoWarning: null,
        },
      ],
      warnings: [],
    };

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(validEnrichment),
    });

    const result = await analyzeMenuVisualEnrichmentWithGemini(
      sampleBuffer,
      sampleMime,
      sampleCompactItems
    );

    expect(result.status).toBe('ok');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.data.sections).toHaveLength(2);
    expect(result.data.sections[0]).toEqual({ categoryIndex: 0, sectionKind: 'products' });
    expect(result.data.items).toHaveLength(3);

    const item0 = result.data.items[0];
    expect(item0.itemKey).toBe('c0-p0');
    expect(item0.kind).toBe('product');
    expect(item0.photoRelation).toBe('direct');
    expect(item0.photoBox).toEqual([110, 60, 190, 200]);

    const item2 = result.data.items[2];
    expect(item2.itemKey).toBe('c1-p0');
    expect(item2.kind).toBe('option');
    expect(item2.photoRelation).toBe('none');
    expect(item2.photoBox).toBeNull();
  });

  it('rejeita resposta se photoRelation for "none" mas photoBox não for nulo', async () => {
    const invalidData = {
      sections: [],
      items: [
        {
          itemKey: 'c0-p0',
          kind: 'product',
          sourceBox: [100, 50, 200, 450],
          photoBox: [120, 60, 180, 200], // Inválido para photoRelation none
          photoRelation: 'none',
          photoWarning: null,
        },
      ],
      warnings: [],
    };

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(invalidData),
    });

    await expect(
      analyzeMenuVisualEnrichmentWithGemini(sampleBuffer, sampleMime, sampleCompactItems)
    ).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_GEMINI_RESPONSE',
    });
  });

  it('rejeita resposta se bounding box contiver coordenadas inválidas (ymin >= ymax)', async () => {
    const invalidCoords = {
      sections: [],
      items: [
        {
          itemKey: 'c0-p0',
          kind: 'product',
          sourceBox: [300, 50, 200, 450], // ymin > ymax (300 > 200)
          photoBox: null,
          photoRelation: 'none',
          photoWarning: null,
        },
      ],
      warnings: [],
    };

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(invalidCoords),
    });

    await expect(
      analyzeMenuVisualEnrichmentWithGemini(sampleBuffer, sampleMime, sampleCompactItems)
    ).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_GEMINI_RESPONSE',
    });
  });

  it('lança erro 502 se modelo retornar resposta vazia', async () => {
    mockGenerateContent.mockResolvedValue({ text: '' });

    await expect(
      analyzeMenuVisualEnrichmentWithGemini(sampleBuffer, sampleMime, sampleCompactItems)
    ).rejects.toMatchObject({
      status: 502,
      code: 'GEMINI_EMPTY_RESPONSE',
    });
  });

  it('mapeia erro de cota para 429 GEMINI_QUOTA_EXCEEDED', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Resource has exhausted: quota limit'));

    await expect(
      analyzeMenuVisualEnrichmentWithGemini(sampleBuffer, sampleMime, sampleCompactItems)
    ).rejects.toMatchObject({
      status: 429,
      code: 'GEMINI_QUOTA_EXCEEDED',
    });
  });

  it('mapeia timeout do modelo para 504 GEMINI_TIMEOUT', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Deadline exceeded'));

    await expect(
      analyzeMenuVisualEnrichmentWithGemini(sampleBuffer, sampleMime, sampleCompactItems)
    ).rejects.toMatchObject({
      status: 504,
      code: 'GEMINI_TIMEOUT',
    });
  });

  it('sanitiza chaves de API na mensagem de erro', async () => {
    mockGenerateContent.mockRejectedValue(
      new Error('API failed on key=secret-key-enrich-999')
    );

    try {
      await analyzeMenuVisualEnrichmentWithGemini(sampleBuffer, sampleMime, sampleCompactItems);
      expect.unreachable('Deveria ter lançado erro');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(502);
      expect(err.message).not.toContain('secret-key-enrich-999');
      expect(err.message).toContain('key=[REDACTED]');
    }
  });
});

describe('geminiService: analyzeMenuWithFullLab (Orquestrador)', () => {
  const originalEnv = process.env;
  const sampleBuffer = Buffer.from('fake-image-bytes');
  const sampleMime = 'image/jpeg';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GEMINI_API_KEY = 'test-gemini-key-123';
    process.env.CATALOG_IMPORT_MODEL = 'gemini-2.5-flash';
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('executa chamadas #1 e #2 com sucesso e retorna tempos e dados estruturados', async () => {
    const menuCall1 = {
      isMenu: true,
      categories: [
        {
          name: 'Pizzas Tradicionais',
          products: [
            {
              name: 'Calabresa',
              description: 'Calabresa fatiada',
              prices: [{ label: null, amountCents: 3500, prefix: null, unit: null, rawText: 'R$ 35,00' }],
              warnings: [],
            },
          ],
        },
        {
          name: '', // Categoria sem nome -> compactItem deve receber category: null
          products: [
            {
              name: 'Guaraná 2L',
              description: '',
              prices: [{ label: null, amountCents: 1000, prefix: null, unit: null, rawText: 'R$ 10,00' }],
              warnings: [],
            },
          ],
        },
      ],
      unmappedTexts: [],
      warnings: [],
    };

    const visualCall2 = {
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
        {
          itemKey: 'c1-p0',
          kind: 'product',
          sourceBox: [300, 50, 350, 450],
          photoBox: null,
          photoRelation: 'none',
          photoWarning: null,
        },
      ],
      warnings: [],
    };

    // Primeira chamada retorna menuCall1; Segunda chamada retorna visualCall2
    mockGenerateContent
      .mockResolvedValueOnce({ text: JSON.stringify(menuCall1) })
      .mockResolvedValueOnce({ text: JSON.stringify(visualCall2) });

    const result = await analyzeMenuWithFullLab(sampleBuffer, sampleMime);

    expect(result.success).toBe(true);
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.extractionExecutionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.data.categories).toHaveLength(2);
    expect(result.enrichment).toBeDefined();
    expect(result.enrichment?.status).toBe('ok');

    if (result.enrichment?.status === 'ok') {
      expect(result.enrichment.data.items).toHaveLength(2);
      expect(result.enrichment.data.items[0].itemKey).toBe('c0-p0');
      expect(result.enrichment.data.items[1].itemKey).toBe('c1-p0');
    }

    // Verifica que generateContent foi chamado exatamente 2 vezes
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);

    // Verifica que o prompt da segunda chamada continha os compactItems sem "Geral"
    const call2Args = mockGenerateContent.mock.calls[1][0];
    const promptText = call2Args.contents[1].text;
    expect(promptText).toContain('c0-p0');
    expect(promptText).toContain('c1-p0');
    // Para a categoria sem nome, category é null (não "Geral" nem "Sem categoria")
    expect(promptText).toContain('"category": null');
    expect(promptText).not.toContain('"category": "Geral"');
  });

  it('NÃO executa chamada #2 se isMenu for false', async () => {
    const nonMenu = {
      isMenu: false,
      categories: [],
      unmappedTexts: [],
      warnings: ['Imagem não é um cardápio'],
    };

    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(nonMenu) });

    const result = await analyzeMenuWithFullLab(sampleBuffer, sampleMime);

    expect(result.success).toBe(true);
    expect(result.data.isMenu).toBe(false);
    expect(result.enrichment).toBeUndefined();
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('NÃO executa chamada #2 se não houver produtos nas categorias', async () => {
    const emptyMenu = {
      isMenu: true,
      categories: [
        { name: 'Vazia', products: [] },
      ],
      unmappedTexts: [],
      warnings: [],
    };

    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(emptyMenu) });

    const result = await analyzeMenuWithFullLab(sampleBuffer, sampleMime);

    expect(result.success).toBe(true);
    expect(result.data.isMenu).toBe(true);
    expect(result.enrichment).toBeUndefined();
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('isola falha da chamada #2: mantém sucesso da extração e retorna status "failed" no enrichment com segredos sanitizados', async () => {
    const validMenu = {
      isMenu: true,
      categories: [
        {
          name: 'Sobremesas',
          products: [
            {
              name: 'Pudim',
              description: 'Pudim de leite condensado',
              prices: [{ label: null, amountCents: 1200, prefix: null, unit: null, rawText: 'R$ 12,00' }],
              warnings: [],
            },
          ],
        },
      ],
      unmappedTexts: [],
      warnings: [],
    };

    // Primeira chamada sucede; Segunda chamada falha (ex: timeout ou quota com chave no log)
    mockGenerateContent
      .mockResolvedValueOnce({ text: JSON.stringify(validMenu) })
      .mockRejectedValueOnce(new Error('Quota limit exceeded for key=sensitive-api-key-xyz'));

    const result = await analyzeMenuWithFullLab(sampleBuffer, sampleMime);

    expect(result.success).toBe(true);
    expect(result.data.isMenu).toBe(true);
    expect(result.data.categories[0].products[0].name).toBe('Pudim');
    expect(result.enrichment).toBeDefined();
    expect(result.enrichment?.status).toBe('failed');

    if (result.enrichment?.status === 'failed') {
      expect(result.enrichment.error.code).toBe('GEMINI_QUOTA_EXCEEDED');
      expect(result.enrichment.error.message).not.toContain('sensitive-api-key-xyz');
    }

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('executa enriquecimento semântico de PDF quando o arquivo for application/pdf', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf data');
    const pdfMime = 'application/pdf';

    const validPdfMenu = {
      isMenu: true,
      categories: [
        {
          name: 'Entradas',
          products: [
            {
              name: 'Bruschetta',
              sourcePage: 1,
              description: 'Tomate e manjericão',
              prices: [{ label: null, amountCents: 2000, prefix: null, unit: null, rawText: 'R$ 20,00' }],
              warnings: [],
            },
            {
              name: 'Carpaccio',
              sourcePage: 2,
              description: 'Carne bovina laminada',
              prices: [{ label: null, amountCents: 3500, prefix: null, unit: null, rawText: 'R$ 35,00' }],
              warnings: [],
            },
          ],
        },
      ],
      unmappedTexts: ['Pedido sob encomenda'],
      warnings: [],
    };

    const validSemanticResponse = {
      items: [
        {
          itemKey: 'c0-p0',
          kind: 'product',
          parentItemKey: null,
          groupKey: null,
          pricingModel: 'single',
        },
        {
          itemKey: 'c0-p1',
          kind: 'product',
          parentItemKey: null,
          groupKey: null,
          pricingModel: 'single',
        },
      ],
      groups: [],
      businessRules: [
        {
          type: 'ordering_instruction',
          sourceTextKey: 'u0',
          sourcePage: 1,
          relatedItemKey: null,
          relatedGroupKey: null,
        },
      ],
      ignoredTexts: [],
      warnings: [],
    };

    const validPhotoResponse = {
      items: [
        {
          itemKey: 'c0-p0',
          photoRelation: 'direct',
          photoBox: [100, 100, 300, 300],
          pageNumber: 1,
          photoWarning: '',
        },
        {
          itemKey: 'c0-p1',
          photoRelation: 'none',
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
      ],
      warnings: [],
    };

    mockGenerateContent
      .mockResolvedValueOnce({ text: JSON.stringify(validPdfMenu) })
      .mockResolvedValueOnce({ text: JSON.stringify(validSemanticResponse) })
      .mockResolvedValueOnce({ text: JSON.stringify(validPhotoResponse) });

    const result = await analyzeMenuWithFullLab(pdfBuffer, pdfMime);

    expect(result.success).toBe(true);
    expect(result.data.isMenu).toBe(true);
    expect(result.data.categories[0].products[0].sourcePage).toBe(1);
    expect(result.data.categories[0].products[1].sourcePage).toBe(2);

    // Deve ter chamado o Gemini 3 vezes (T1 textual + T2 semântica + T3 fotos de PDF)
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);

    // Chamada #1 para PDF
    const call1Args = mockGenerateContent.mock.calls[0][0];
    expect(call1Args.contents[0].inlineData.mimeType).toBe('application/pdf');
    expect(call1Args.contents[1].text).toContain('sourcePage');
    expect(call1Args.contents[1].text).toContain('PDF');

    // Chamada #2 para enriquecimento semântico
    const call2Args = mockGenerateContent.mock.calls[1][0];
    expect(call2Args.contents[0].inlineData.mimeType).toBe('application/pdf');
    expect(call2Args.contents[1].text).toContain('INTERPRETAR A ESTRUTURA COMERCIAL');
    expect(call2Args.contents[1].text).toContain('c0-p0');

    // Chamada #3 para detecção visual de fotos
    const call3Args = mockGenerateContent.mock.calls[2][0];
    expect(call3Args.contents[0].inlineData.mimeType).toBe('application/pdf');
    expect(call3Args.contents[1].text).toContain('LOCALIZAR AS FOTOGRAFIAS REAIS');
    expect(call3Args.contents[1].text).toContain('c0-p0');

    // O visual enrichment de imagens permanece com status "skipped" em PDF
    expect(result.enrichment).toEqual({
      status: 'skipped',
      reason: 'PDF_VISUAL_ENRICHMENT_NOT_ENABLED',
      message: 'A leitura do PDF foi concluída. A detecção automática de fotos em PDF ainda não está habilitada neste laboratório.',
    });

    // O pdfSemanticEnrichment foi executado com sucesso
    expect(result.pdfSemanticEnrichment).toBeDefined();
    expect(result.pdfSemanticEnrichment?.status).toBe('ok');
    if (result.pdfSemanticEnrichment?.status === 'ok') {
      expect(result.pdfSemanticEnrichment.data.items).toHaveLength(2);
      expect(result.pdfSemanticEnrichment.data.businessRules).toHaveLength(1);
      expect(result.pdfSemanticEnrichment.data.businessRules[0].rawText).toBe('Pedido sob encomenda');
    }
  });

  it('isola falha na chamada #2 semântica de PDF preservando a extração textual intacta', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf data');
    const pdfMime = 'application/pdf';

    const validPdfMenu = {
      isMenu: true,
      categories: [
        {
          name: 'Doces',
          products: [
            {
              name: 'Brigadeiro',
              sourcePage: 1,
              description: 'Gourmet',
              prices: [{ label: null, amountCents: 500, prefix: null, unit: null, rawText: 'R$ 5,00' }],
              warnings: [],
            },
          ],
        },
      ],
      unmappedTexts: [],
      warnings: [],
    };

    mockGenerateContent
      .mockResolvedValueOnce({ text: JSON.stringify(validPdfMenu) })
      .mockRejectedValueOnce(new Error('Semantic analysis timeout with key=secret-key-123'));

    const result = await analyzeMenuWithFullLab(pdfBuffer, pdfMime);

    expect(result.success).toBe(true);
    expect(result.data.isMenu).toBe(true);
    expect(result.data.categories[0].products[0].name).toBe('Brigadeiro');

    // Visual enrichment skipped
    expect(result.enrichment?.status).toBe('skipped');

    // Chamada semântica falhou de forma isolada e segura
    expect(result.pdfSemanticEnrichment).toBeDefined();
    expect(result.pdfSemanticEnrichment?.status).toBe('failed');
    if (result.pdfSemanticEnrichment?.status === 'failed') {
      expect(result.pdfSemanticEnrichment.error.code).toBe('PDF_SEMANTIC_TIMEOUT');
      expect(result.pdfSemanticEnrichment.error.message).not.toContain('secret-key-123');
    }
  });

  it('aceita sourcePage nulo ou ausente e normaliza para null', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf data');
    const pdfMime = 'application/pdf';

    const menuWithoutSourcePage = {
      isMenu: true,
      categories: [
        {
          name: 'Bebidas',
          products: [
            {
              name: 'Suco de Laranja',
              description: 'Natural',
              prices: [{ label: null, amountCents: 1000, prefix: null, unit: null, rawText: 'R$ 10,00' }],
              warnings: [],
            },
            {
              name: 'Água Mineral',
              sourcePage: null,
              description: 'Sem gás',
              prices: [{ label: null, amountCents: 500, prefix: null, unit: null, rawText: 'R$ 5,00' }],
              warnings: [],
            },
          ],
        },
      ],
      unmappedTexts: [],
      warnings: [],
    };

    const validSemantic = {
      items: [
        { itemKey: 'c0-p0', kind: 'product', parentItemKey: null, groupKey: null, pricingModel: 'single' },
        { itemKey: 'c0-p1', kind: 'product', parentItemKey: null, groupKey: null, pricingModel: 'single' },
      ],
      groups: [],
      businessRules: [],
      ignoredTexts: [],
      warnings: [],
    };

    mockGenerateContent
      .mockResolvedValueOnce({ text: JSON.stringify(menuWithoutSourcePage) })
      .mockResolvedValueOnce({ text: JSON.stringify(validSemantic) });

    const result = await analyzeMenuWithFullLab(pdfBuffer, pdfMime);

    expect(result.success).toBe(true);
    expect(result.data.categories[0].products[0].sourcePage).toBeNull();
    expect(result.data.categories[0].products[1].sourcePage).toBeNull();
  });
});

describe('pdfSemanticService: validateSemanticReferences', () => {
  const validItemKeys = new Set(['c0-p0', 'c0-p1', 'c0-p2']);
  const validTextKeysMap = new Map([
    ['u0', 'Mínimo de 25 unidades por sabor.'],
    ['u1', 'Texto do seu parágrafo (placeholder).'],
  ]);

  it('valida com sucesso uma estrutura consistente com produtos principais e grupos de opções', () => {
    const inputData = {
      items: [
        {
          itemKey: 'c0-p0',
          kind: 'product' as const,
          parentItemKey: null,
          groupKey: null,
          pricingModel: 'quantity_tiers' as const,
        },
        {
          itemKey: 'c0-p1',
          kind: 'option' as const,
          parentItemKey: 'c0-p0',
          groupKey: 'g0',
          pricingModel: null,
        },
        {
          itemKey: 'c0-p2',
          kind: 'option' as const,
          parentItemKey: 'c0-p0',
          groupKey: 'g0',
          pricingModel: null,
        },
      ],
      groups: [
        {
          groupKey: 'g0',
          name: 'Sabores Tradicionais',
          kind: 'option_group' as const,
          parentItemKey: 'c0-p0',
          itemKeys: ['c0-p1', 'c0-p2'],
          pricingBehavior: 'inherits_parent' as const,
        },
      ],
      businessRules: [
        {
          type: 'minimum_order' as const,
          sourceTextKey: 'u0',
          rawText: null,
          sourcePage: 1,
          relatedItemKey: 'c0-p0',
          relatedGroupKey: 'g0',
        },
      ],
      ignoredTexts: [
        {
          sourceTextKey: 'u1',
          rawText: null,
          sourcePage: 1,
          reason: 'placeholder' as const,
        },
      ],
      warnings: [],
    };

    const validated = validateSemanticReferences(inputData, validItemKeys, validTextKeysMap);

    expect(validated.items).toHaveLength(3);
    expect(validated.groups).toHaveLength(1);
    expect(validated.businessRules).toHaveLength(1);
    // Verifica que o rawText foi resolvido a partir do texto original extraído
    expect(validated.businessRules[0].rawText).toBe('Mínimo de 25 unidades por sabor.');
    expect(validated.ignoredTexts[0].rawText).toBe('Texto do seu parágrafo (placeholder).');
  });

  it('lança INVALID_SEMANTIC_REFERENCES se faltar algum itemKey da extração #1', () => {
    const incompleteData = {
      items: [
        {
          itemKey: 'c0-p0',
          kind: 'product' as const,
          parentItemKey: null,
          groupKey: null,
          pricingModel: 'single' as const,
        },
        // c0-p1 e c0-p2 omitidos
      ],
      groups: [],
      businessRules: [],
      ignoredTexts: [],
      warnings: [],
    };

    expect(() => validateSemanticReferences(incompleteData, validItemKeys, validTextKeysMap)).toThrow(
      HttpError
    );
    try {
      validateSemanticReferences(incompleteData, validItemKeys, validTextKeysMap);
    } catch (err: any) {
      expect(err.code).toBe('INVALID_SEMANTIC_REFERENCES');
      expect(err.message).toContain('c0-p1');
    }
  });

  it('lança INVALID_SEMANTIC_REFERENCES se houver itemKey duplicado', () => {
    const duplicateData = {
      items: [
        { itemKey: 'c0-p0', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
        { itemKey: 'c0-p0', kind: 'option' as const, parentItemKey: null, groupKey: null, pricingModel: null },
        { itemKey: 'c0-p1', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
        { itemKey: 'c0-p2', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
      ],
      groups: [],
      businessRules: [],
      ignoredTexts: [],
      warnings: [],
    };

    expect(() => validateSemanticReferences(duplicateData, validItemKeys, validTextKeysMap)).toThrow(
      HttpError
    );
  });

  it('lança INVALID_SEMANTIC_REFERENCES se a IA inventar um itemKey inexistente', () => {
    const inventedData = {
      items: [
        { itemKey: 'c0-p0', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
        { itemKey: 'c0-p1', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
        { itemKey: 'c0-p2', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
        { itemKey: 'c99-p99', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
      ],
      groups: [],
      businessRules: [],
      ignoredTexts: [],
      warnings: [],
    };

    expect(() => validateSemanticReferences(inventedData, validItemKeys, validTextKeysMap)).toThrow(
      HttpError
    );
  });

  it('lança INVALID_SEMANTIC_REFERENCES se item declara groupKey mas o grupo não o inclui', () => {
    const inconsistentData = {
      items: [
        { itemKey: 'c0-p0', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
        { itemKey: 'c0-p1', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: 'g0', pricingModel: null },
        { itemKey: 'c0-p2', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null },
      ],
      groups: [
        {
          groupKey: 'g0',
          name: 'Sabores',
          kind: 'option_group' as const,
          parentItemKey: 'c0-p0',
          itemKeys: ['c0-p2'], // Inconsistência: g0 lista c0-p2 mas não c0-p1
          pricingBehavior: 'inherits_parent' as const,
        },
      ],
      businessRules: [],
      ignoredTexts: [],
      warnings: [],
    };

    expect(() => validateSemanticReferences(inconsistentData, validItemKeys, validTextKeysMap)).toThrow(
      HttpError
    );
  });

  it('lança INVALID_SEMANTIC_REFERENCES se item for pai de si mesmo', () => {
    const selfParentData = {
      items: [
        { itemKey: 'c0-p0', kind: 'product' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null },
        { itemKey: 'c0-p1', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
        { itemKey: 'c0-p2', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
      ],
      groups: [],
      businessRules: [],
      ignoredTexts: [],
      warnings: [],
    };

    expect(() => validateSemanticReferences(selfParentData, validItemKeys, validTextKeysMap)).toThrow(
      HttpError
    );
  });

  it('lança INVALID_SEMANTIC_REFERENCES se businessRule não tiver sourceTextKey nem relatedItemKey', () => {
    const orphanedRuleData = {
      items: [
        { itemKey: 'c0-p0', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
        { itemKey: 'c0-p1', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
        { itemKey: 'c0-p2', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null },
      ],
      groups: [],
      businessRules: [
        {
          type: 'minimum_order' as const,
          sourceTextKey: null, // sem origem
          rawText: null,
          sourcePage: null,
          relatedItemKey: null, // sem item associado
          relatedGroupKey: null,
        },
      ],
      ignoredTexts: [],
      warnings: [],
    };

    expect(() => validateSemanticReferences(orphanedRuleData, validItemKeys, validTextKeysMap)).toThrow(
      HttpError
    );
  });
});

describe('pdfPhotoService: validatePdfPhotoReferences', () => {
  const inputItems = [
    { itemKey: 'c0-p0', name: 'Bolo de Chocolate', category: 'Bolos', sourcePage: 1, kind: 'product' as const, parentItemKey: null, groupKey: null },
    { itemKey: 'c0-p1', name: 'Bolo de Cenoura', category: 'Bolos', sourcePage: 1, kind: 'product' as const, parentItemKey: null, groupKey: null },
    { itemKey: 'c1-p0', name: 'Coxinha de Frango', category: 'Salgados', sourcePage: 2, kind: 'product' as const, parentItemKey: null, groupKey: null },
  ];

  it('valida com sucesso dados corretos de fotos', () => {
    const validPhotoData = {
      items: [
        {
          itemKey: 'c0-p0',
          photoRelation: 'direct' as const,
          photoBox: [100, 200, 400, 600] as [number, number, number, number],
          pageNumber: 1,
          photoWarning: '',
        },
        {
          itemKey: 'c0-p1',
          photoRelation: 'shared' as const,
          photoBox: [100, 200, 400, 600] as [number, number, number, number],
          pageNumber: 1,
          photoWarning: 'Foto compartilhada com Bolo de Chocolate',
        },
        {
          itemKey: 'c1-p0',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
      ],
      warnings: [],
    };

    const result = validatePdfPhotoReferences(validPhotoData, inputItems);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].photoRelation).toBe('direct');
    expect(result.items[2].photoRelation).toBe('none');
  });

  it('lança INVALID_PHOTO_REFERENCES se faltar um item enviado', () => {
    const missingData = {
      items: [
        {
          itemKey: 'c0-p0',
          photoRelation: 'direct' as const,
          photoBox: [100, 200, 400, 600] as [number, number, number, number],
          pageNumber: 1,
          photoWarning: '',
        },
        // c0-p1 ausente
        {
          itemKey: 'c1-p0',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
      ],
      warnings: [],
    };

    expect(() => validatePdfPhotoReferences(missingData, inputItems)).toThrow(HttpError);
    expect(() => validatePdfPhotoReferences(missingData, inputItems)).toThrowError(
      /ItemKey obrigatório ausente/
    );
  });

  it('lança INVALID_PHOTO_REFERENCES se houver itemKey duplicado', () => {
    const duplicateData = {
      items: [
        {
          itemKey: 'c0-p0',
          photoRelation: 'direct' as const,
          photoBox: [100, 200, 400, 600] as [number, number, number, number],
          pageNumber: 1,
          photoWarning: '',
        },
        {
          itemKey: 'c0-p0', // duplicado
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
        {
          itemKey: 'c0-p1',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
        {
          itemKey: 'c1-p0',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
      ],
      warnings: [],
    };

    expect(() => validatePdfPhotoReferences(duplicateData, inputItems)).toThrow(HttpError);
    expect(() => validatePdfPhotoReferences(duplicateData, inputItems)).toThrowError(
      /ItemKey duplicado/
    );
  });

  it('lança INVALID_PHOTO_REFERENCES se houver itemKey inventado', () => {
    const inventedData = {
      items: [
        {
          itemKey: 'c0-p0',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
        {
          itemKey: 'c0-p1',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
        {
          itemKey: 'c1-p0',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
        {
          itemKey: 'c99-p99', // inventado
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
      ],
      warnings: [],
    };

    expect(() => validatePdfPhotoReferences(inventedData, inputItems)).toThrow(HttpError);
    expect(() => validatePdfPhotoReferences(inventedData, inputItems)).toThrowError(
      /ItemKey inexistente ou não enviado retornado/
    );
  });

  it('lança INVALID_PHOTO_REFERENCES se pageNumber divergir de sourcePage', () => {
    const wrongPageData = {
      items: [
        {
          itemKey: 'c0-p0',
          photoRelation: 'direct' as const,
          photoBox: [100, 200, 400, 600] as [number, number, number, number],
          pageNumber: 2, // sourcePage é 1
          photoWarning: '',
        },
        {
          itemKey: 'c0-p1',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
        {
          itemKey: 'c1-p0',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
      ],
      warnings: [],
    };

    expect(() => validatePdfPhotoReferences(wrongPageData, inputItems)).toThrow(HttpError);
    expect(() => validatePdfPhotoReferences(wrongPageData, inputItems)).toThrowError(
      /Inconsistência de página para item/
    );
  });

  it('lança INVALID_PHOTO_REFERENCES se photoRelation for none mas vier com photoBox', () => {
    const inconsistentNoneData = {
      items: [
        {
          itemKey: 'c0-p0',
          photoRelation: 'none' as const,
          photoBox: [100, 200, 400, 600] as [number, number, number, number], // deve ser null
          pageNumber: null,
          photoWarning: '',
        },
        {
          itemKey: 'c0-p1',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
        {
          itemKey: 'c1-p0',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
      ],
      warnings: [],
    };

    expect(() => validatePdfPhotoReferences(inconsistentNoneData, inputItems)).toThrow(HttpError);
    expect(() => validatePdfPhotoReferences(inconsistentNoneData, inputItems)).toThrowError(
      /possui photoRelation "none" mas informou photoBox/
    );
  });

  it('lança INVALID_PHOTO_REFERENCES se photoRelation for direct mas faltar photoBox', () => {
    const missingBoxData = {
      items: [
        {
          itemKey: 'c0-p0',
          photoRelation: 'direct' as const,
          photoBox: null, // obrigatório
          pageNumber: 1,
          photoWarning: '',
        },
        {
          itemKey: 'c0-p1',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
        {
          itemKey: 'c1-p0',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
      ],
      warnings: [],
    };

    expect(() => validatePdfPhotoReferences(missingBoxData, inputItems)).toThrow(HttpError);
    expect(() => validatePdfPhotoReferences(missingBoxData, inputItems)).toThrowError(
      /possui foto .* mas photoBox é nulo/
    );
  });

  it('lança INVALID_PHOTO_REFERENCES se photoBox tiver coordenadas invertidas', () => {
    const invertedBoxData = {
      items: [
        {
          itemKey: 'c0-p0',
          photoRelation: 'direct' as const,
          photoBox: [500, 200, 300, 600] as [number, number, number, number], // ymin > ymax
          pageNumber: 1,
          photoWarning: '',
        },
        {
          itemKey: 'c0-p1',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
        {
          itemKey: 'c1-p0',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
      ],
      warnings: [],
    };

    expect(() => validatePdfPhotoReferences(invertedBoxData, inputItems)).toThrow(HttpError);
    expect(() => validatePdfPhotoReferences(invertedBoxData, inputItems)).toThrowError(
      /Bounding box com altura inválida para item/
    );
  });

  it('lança INVALID_PHOTO_REFERENCES se photoBox tiver coordenadas fora de 0..1000', () => {
    const outOfBoundsData = {
      items: [
        {
          itemKey: 'c0-p0',
          photoRelation: 'direct' as const,
          photoBox: [100, 200, 400, 1050] as [number, number, number, number], // xmax > 1000
          pageNumber: 1,
          photoWarning: '',
        },
        {
          itemKey: 'c0-p1',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
        {
          itemKey: 'c1-p0',
          photoRelation: 'none' as const,
          photoBox: null,
          pageNumber: null,
          photoWarning: '',
        },
      ],
      warnings: [],
    };

    expect(() => validatePdfPhotoReferences(outOfBoundsData, inputItems)).toThrow(HttpError);
    expect(() => validatePdfPhotoReferences(outOfBoundsData, inputItems)).toThrowError(
      /Coordenadas de photoBox fora do intervalo 0\.\.1000/
    );
  });
});

describe('geminiService: analyzeMenuWithFullLab com PDF (T1 -> T2 -> T3)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GEMINI_API_KEY = 'test-gemini-key-123';
    process.env.CATALOG_IMPORT_MODEL = 'gemini-2.5-flash';
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('executa T1, T2 e T3 sequencialmente com sucesso para PDF', async () => {
    // T1: Extração textual
    const t1Json = JSON.stringify({
      isMenu: true,
      categories: [
        {
          name: 'Doces',
          products: [
            {
              name: 'Brigadeiro Tradicional',
              sourcePage: 1,
              prices: [{ label: null, amountCents: 500, prefix: null, unit: null, rawText: 'R$ 5,00' }],
            },
          ],
        },
      ],
      unmappedTexts: [],
      warnings: [],
    });

    // T2: Estrutura semântica
    const t2Json = JSON.stringify({
      items: [
        {
          itemKey: 'c0-p0',
          kind: 'product',
          parentItemKey: null,
          groupKey: null,
          pricingModel: 'single',
        },
      ],
      groups: [],
      businessRules: [],
      ignoredTexts: [],
      warnings: [],
    });

    // T3: Detecção visual de fotos
    const t3Json = JSON.stringify({
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
    });

    mockGenerateContent
      .mockResolvedValueOnce({ text: t1Json })
      .mockResolvedValueOnce({ text: t2Json })
      .mockResolvedValueOnce({ text: t3Json });

    const pdfBuffer = Buffer.from('%PDF-1.4 mock content');
    const result = await analyzeMenuWithFullLab(pdfBuffer, 'application/pdf');

    expect(result.success).toBe(true);
    expect(result.data.isMenu).toBe(true);
    expect(result.pdfSemanticEnrichment?.status).toBe('ok');
    expect(result.pdfPhotoEnrichment?.status).toBe('ok');
    if (result.pdfPhotoEnrichment?.status === 'ok') {
      expect(result.pdfPhotoEnrichment.data.items[0].photoRelation).toBe('direct');
      expect(result.pdfPhotoEnrichment.data.items[0].photoBox).toEqual([100, 100, 300, 300]);
    }
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  it('isola falha na T3 sem quebrar a requisição, preservando T1 e T2', async () => {
    // T1: Extração textual
    const t1Json = JSON.stringify({
      isMenu: true,
      categories: [
        {
          name: 'Doces',
          products: [
            {
              name: 'Brigadeiro Tradicional',
              sourcePage: 1,
              prices: [{ label: null, amountCents: 500, prefix: null, unit: null, rawText: 'R$ 5,00' }],
            },
          ],
        },
      ],
      unmappedTexts: [],
      warnings: [],
    });

    // T2: Estrutura semântica
    const t2Json = JSON.stringify({
      items: [
        {
          itemKey: 'c0-p0',
          kind: 'product',
          parentItemKey: null,
          groupKey: null,
          pricingModel: 'single',
        },
      ],
      groups: [],
      businessRules: [],
      ignoredTexts: [],
      warnings: [],
    });

    // T3 falha com erro da API do Gemini
    mockGenerateContent
      .mockResolvedValueOnce({ text: t1Json })
      .mockResolvedValueOnce({ text: t2Json })
      .mockRejectedValueOnce(new Error('503 Service Unavailable on photo visual model'));

    const pdfBuffer = Buffer.from('%PDF-1.4 mock content');
    const result = await analyzeMenuWithFullLab(pdfBuffer, 'application/pdf');

    expect(result.success).toBe(true);
    expect(result.data.isMenu).toBe(true);
    expect(result.pdfSemanticEnrichment?.status).toBe('ok');
    expect(result.pdfPhotoEnrichment?.status).toBe('failed');
    if (result.pdfPhotoEnrichment?.status === 'failed') {
      expect(result.pdfPhotoEnrichment.error.code).toBe('PDF_PHOTO_SERVICE_ERROR');
    }
  });

  it('não envia itens com kind informational nem sourcePage null para a T3', async () => {
    // T1: 2 itens (um com sourcePage 1, outro com sourcePage null)
    const t1Json = JSON.stringify({
      isMenu: true,
      categories: [
        {
          name: 'Cardápio',
          products: [
            {
              name: 'Item com Página',
              sourcePage: 1,
              prices: [{ label: null, amountCents: 1000, prefix: null, unit: null, rawText: 'R$ 10,00' }],
            },
            {
              name: 'Aviso Rodapé',
              sourcePage: null,
              prices: [],
            },
          ],
        },
      ],
      unmappedTexts: [],
      warnings: [],
    });

    // T2 classifica o segundo como informational
    const t2Json = JSON.stringify({
      items: [
        {
          itemKey: 'c0-p0',
          kind: 'product',
          parentItemKey: null,
          groupKey: null,
          pricingModel: 'single',
        },
        {
          itemKey: 'c0-p1',
          kind: 'informational',
          parentItemKey: null,
          groupKey: null,
          pricingModel: null,
        },
      ],
      groups: [],
      businessRules: [],
      ignoredTexts: [],
      warnings: [],
    });

    // T3: Apenas c0-p0 deve ser enviado e retornado
    const t3Json = JSON.stringify({
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
    });

    mockGenerateContent
      .mockResolvedValueOnce({ text: t1Json })
      .mockResolvedValueOnce({ text: t2Json })
      .mockResolvedValueOnce({ text: t3Json });

    const pdfBuffer = Buffer.from('%PDF-1.4 mock content');
    const result = await analyzeMenuWithFullLab(pdfBuffer, 'application/pdf');

    expect(result.success).toBe(true);
    expect(result.pdfPhotoEnrichment?.status).toBe('ok');
    if (result.pdfPhotoEnrichment?.status === 'ok') {
      expect(result.pdfPhotoEnrichment.data.items).toHaveLength(1);
      expect(result.pdfPhotoEnrichment.data.items[0].itemKey).toBe('c0-p0');
    }
  });
});


