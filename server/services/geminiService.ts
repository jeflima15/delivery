import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';

export interface GeminiTestResult {
  success: true;
  model: string;
  response: string;
}

export const menuPriceSchema = z.object({
  label: z.string().nullable().optional().default(null),
  amountCents: z.number().int().nonnegative().nullable().optional().default(null),
  prefix: z.string().nullable().optional().default(null),
  unit: z.string().nullable().optional().default(null),
  rawText: z.string().default(''),
});

export const menuProductSchema = z.object({
  name: z.string().trim().min(1, 'Nome do produto não pode ser vazio.'),
  description: z.string().nullable().optional().default(null),
  prices: z.array(menuPriceSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export const menuCategorySchema = z.object({
  name: z.string().nullable().optional().default(null),
  products: z.array(menuProductSchema).default([]),
});

export const menuAnalysisSchema = z.object({
  isMenu: z.boolean(),
  categories: z.array(menuCategorySchema).default([]),
  unmappedTexts: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export type MenuPrice = z.infer<typeof menuPriceSchema>;
export type MenuProduct = z.infer<typeof menuProductSchema>;
export type MenuCategory = z.infer<typeof menuCategorySchema>;
export type MenuAnalysisData = z.infer<typeof menuAnalysisSchema>;

export interface MenuAnalysisResponse {
  success: true;
  model: string;
  executionTimeMs: number;
  data: MenuAnalysisData;
  rawJson: string;
}

const geminiMenuResponseSchema = {
  type: Type.OBJECT,
  description: 'Estruturação completa de um cardápio lido a partir de imagem.',
  properties: {
    isMenu: {
      type: Type.BOOLEAN,
      description: 'true se a imagem contiver um cardápio legível, false se não for um cardápio.',
    },
    categories: {
      type: Type.ARRAY,
      description: 'Lista de categorias explicitamente identificadas.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            nullable: true,
            description: 'Nome da categoria exatamente como visto na imagem, ou null se não houver título de seção.',
          },
          products: {
            type: Type.ARRAY,
            description: 'Produtos listados nesta categoria.',
            items: {
              type: Type.OBJECT,
              properties: {
                name: {
                  type: Type.STRING,
                  description: 'Nome do produto visto na imagem.',
                },
                description: {
                  type: Type.STRING,
                  nullable: true,
                  description: 'Descrição, detalhes ou ingredientes do item, ou null se não houver.',
                },
                prices: {
                  type: Type.ARRAY,
                  description: 'Lista de preços ou variações de tamanho/porção.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: {
                        type: Type.STRING,
                        nullable: true,
                        description: 'Rótulo da variação (ex: "P", "M", "G", "Broto", "Individual"), ou null.',
                      },
                      amountCents: {
                        type: Type.INTEGER,
                        nullable: true,
                        description: 'Valor em centavos inteiros (ex: R$ 29,90 -> 2990), ou null se indeterminado.',
                      },
                      prefix: {
                        type: Type.STRING,
                        nullable: true,
                        description: 'Prefixo como "a partir de", ou null.',
                      },
                      unit: {
                        type: Type.STRING,
                        nullable: true,
                        description: 'Unidade de medida como "350ml", "2L", "kg", "fatia", ou null.',
                      },
                      rawText: {
                        type: Type.STRING,
                        description: 'Texto original do preço visto no cardápio.',
                      },
                    },
                    required: ['rawText'],
                  },
                },
                warnings: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Dúvidas ou alertas específicos sobre este item (ex: preço ilegível, texto ambíguo).',
                },
              },
              required: ['name', 'prices', 'warnings'],
            },
          },
        },
        required: ['products'],
      },
    },
    unmappedTexts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Textos relevantes presentes na imagem que não puderam ser associados com segurança a nenhum produto.',
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Avisos gerais sobre a leitura da imagem (ex: iluminação ruim, partes cortadas ou ilegíveis).',
    },
  },
  required: ['isMenu', 'categories', 'unmappedTexts', 'warnings'],
};

const MENU_EXTRACTION_PROMPT = `Você é um especialista em transcrição e estruturação de cardápios de restaurantes a partir de imagens.
Analise a imagem enviada com máxima fidelidade.

Regras rigorosas:
1. Extraia apenas informações visíveis na imagem. NUNCA invente produtos, descrições ou preços.
2. Se a imagem claramente NÃO for um cardápio ou menu de alimentos/bebidas legível:
   - Defina "isMenu" como false.
   - Deixe "categories" como array vazio [].
   - Adicione em "warnings" uma explicação clara e educada em português (ex: "Não foi possível identificar um cardápio nesta imagem.").
3. Se for um cardápio ("isMenu": true):
   - Identifique categorias apenas se houver títulos visíveis de seção (ex: "Pizzas", "Bebidas", "Sobremesas"). Se não houver, use "name": null. Não invente "Sem categoria".
   - Extraia o nome do produto exatamente como está escrito.
   - Extraia a descrição/ingredientes se houver, ou use null.
   - Mantenha todos os preços e variações encontrados (P/M/G, Taça/Garrafa, etc.).
   - Em "amountCents", converta o valor numérico em reais para centavos inteiros (ex: R$ 29,90 -> 2990; R$ 10,00 -> 1000). Se o número não puder ser determinado com segurança, use null.
   - Em "rawText", preserve o texto literal original do preço visto na imagem.
   - Em "prefix", preserve "a partir de" ou termos semelhantes caso estejam visíveis, caso contrário use null.
   - Em "unit", preserve unidades como "350ml", "1L", "500g", "fatia", etc., caso existam, caso contrário use null.
   - Se houver ambiguidades de preço ou cortes, não adivinhe: registre em "warnings" do produto.
   - Não transforme avisos institucionais (taxa de serviço, Wi-Fi, horário) em produtos. Guarde-os em "unmappedTexts" ou "warnings".`;

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

export async function analyzeMenuBufferWithGemini(
  buffer: Buffer,
  mimeType: string
): Promise<MenuAnalysisResponse> {
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

  const startTime = Date.now();
  const base64Data = buffer.toString('base64');

  let rawText: string;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType,
          },
        },
        {
          text: MENU_EXTRACTION_PROMPT,
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: geminiMenuResponseSchema,
      },
    });

    rawText = (response.text || '').trim();
  } catch (error: any) {
    if (error instanceof HttpError) throw error;

    const rawMessage = String(error?.message || '');
    const status = error?.status || error?.statusCode;

    const sanitized = rawMessage
      .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
      .replace(/apiKey=[^&\s]+/gi, 'apiKey=[REDACTED]');

    if (status === 429 || /quota|rate limit|too many requests/i.test(rawMessage)) {
      throw new HttpError(
        429,
        'Cota ou limite da Gemini API excedido. Tente novamente mais tarde.',
        'GEMINI_QUOTA_EXCEEDED'
      );
    }
    if (status === 504 || /deadline|timeout/i.test(rawMessage)) {
      throw new HttpError(
        504,
        'Tempo limite esgotado ao aguardar resposta da Gemini API.',
        'GEMINI_TIMEOUT'
      );
    }

    throw new HttpError(
      502,
      `Falha ao comunicar com o Gemini: ${sanitized || 'Erro na chamada ao modelo.'}`,
      'GEMINI_SERVICE_ERROR'
    );
  }

  const executionTimeMs = Date.now() - startTime;

  if (!rawText) {
    throw new HttpError(502, 'O Gemini retornou uma resposta vazia.', 'GEMINI_EMPTY_RESPONSE');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    const truncated = rawText.slice(0, 300);
    throw new HttpError(
      502,
      'O modelo não retornou um JSON válido.',
      'INVALID_GEMINI_RESPONSE',
      { rawJsonSnippet: truncated }
    );
  }

  const parseResult = menuAnalysisSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    const truncated = rawText.slice(0, 300);
    throw new HttpError(
      502,
      'A resposta do modelo não atende ao formato estruturado esperado.',
      'INVALID_GEMINI_RESPONSE',
      {
        validationIssues: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        rawJsonSnippet: truncated,
      }
    );
  }

  return {
    success: true,
    model,
    executionTimeMs,
    data: parseResult.data,
    rawJson: rawText,
  };
}

