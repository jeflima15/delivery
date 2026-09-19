import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { testGeminiIntegration } from '../../server/services/geminiService.js';
import { HttpError } from '../../server/middleware/errors.js';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  return {
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
