import { GoogleGenAI } from '@google/genai';
import { HttpError } from '../middleware/errors.js';

export interface GeminiTestResult {
  success: true;
  model: string;
  response: string;
}

export async function testGeminiIntegration(): Promise<GeminiTestResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.CATALOG_IMPORT_MODEL?.trim();

  if (!apiKey) {
    throw new HttpError(
      400,
      'Configuração ausente: GEMINI_API_KEY não informada no servidor.',
      'GEMINI_API_KEY_MISSING'
    );
  }

  if (!model) {
    throw new HttpError(
      400,
      'Configuração ausente: CATALOG_IMPORT_MODEL não informado no servidor.',
      'CATALOG_IMPORT_MODEL_MISSING'
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: 'Responda somente com: OK',
    });

    const text = (response.text || '').trim();
    return {
      success: true,
      model,
      response: text,
    };
  } catch (error: any) {
    const rawMessage = String(error?.message || '');
    // Sanitização para garantir que chaves ou query strings sensíveis nunca sejam expostas
    const sanitized = rawMessage
      .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
      .replace(/apiKey=[^&\s]+/gi, 'apiKey=[REDACTED]');

    throw new HttpError(
      502,
      `Falha ao comunicar com o Gemini: ${sanitized || 'Erro na chamada ao modelo.'}`,
      'GEMINI_SERVICE_ERROR'
    );
  }
}
