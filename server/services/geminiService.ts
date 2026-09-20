import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';

export interface GeminiTestResult {
  success: true;
  model: string;
  response: string;
}

/* ==========================================================================
   SCHEMA - CHAMADA #1: EXTRAÇÃO TEXTUAL DO CARDÁPIO
   ========================================================================== */

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

/* ==========================================================================
   SCHEMA - CHAMADA #2: CLASSIFICAÇÃO SEMÂNTICA E LOCALIZAÇÃO VISUAL (ENRICHMENT)
   ========================================================================== */

export const boundingBoxSchema = z
  .tuple([
    z.number().int().min(0).max(1000), // ymin
    z.number().int().min(0).max(1000), // xmin
    z.number().int().min(0).max(1000), // ymax
    z.number().int().min(0).max(1000), // xmax
  ])
  .refine(([ymin, xmin, ymax, xmax]) => ymin < ymax && xmin < xmax, {
    message: 'Bounding box inválida: ymin deve ser menor que ymax e xmin menor que xmax.',
  });

export type BoundingBox = z.infer<typeof boundingBoxSchema>;

export const sectionKindSchema = z.enum([
  'products',
  'combos',
  'addons',
  'options',
  'mixed',
  'unknown',
]);
export type SectionKind = z.infer<typeof sectionKindSchema>;

export const itemKindSchema = z.enum([
  'product',
  'combo',
  'addon',
  'option',
  'informational',
  'unknown',
]);
export type ItemKind = z.infer<typeof itemKindSchema>;

export const photoRelationSchema = z.enum([
  'direct',
  'shared',
  'ambiguous',
  'none',
]);
export type PhotoRelation = z.infer<typeof photoRelationSchema>;

export const visualSectionSchema = z.object({
  categoryIndex: z.number().int().nonnegative(),
  sectionKind: sectionKindSchema,
});
export type VisualSection = z.infer<typeof visualSectionSchema>;

export const visualItemSchema = z
  .object({
    itemKey: z.string().trim().min(1),
    kind: itemKindSchema,
    sourceBox: boundingBoxSchema.nullable().optional().default(null),
    photoBox: boundingBoxSchema.nullable().optional().default(null),
    photoRelation: photoRelationSchema,
    photoWarning: z.string().nullable().optional().default(null),
  })
  .refine(
    (item) => {
      if (item.photoRelation === 'none' && item.photoBox !== null) {
        return false;
      }
      return true;
    },
    {
      message: 'photoBox deve ser null quando photoRelation for "none".',
    }
  );
export type VisualItem = z.infer<typeof visualItemSchema>;

export const visualEnrichmentSchema = z.object({
  sections: z.array(visualSectionSchema).default([]),
  items: z.array(visualItemSchema).default([]),
  warnings: z.array(z.string()).default([]),
});
export type VisualEnrichmentData = z.infer<typeof visualEnrichmentSchema>;

export interface VisualEnrichmentSuccess {
  status: 'ok';
  model: string;
  executionTimeMs: number;
  data: VisualEnrichmentData;
  rawJson: string;
}

export interface VisualEnrichmentFailure {
  status: 'failed';
  error: {
    code: string;
    message: string;
  };
}

export type VisualEnrichmentResult = VisualEnrichmentSuccess | VisualEnrichmentFailure;

export interface FullLabAnalysisResponse {
  success: true;
  model: string;
  executionTimeMs: number; // Tempo total da operação
  extractionExecutionTimeMs: number; // Tempo da chamada #1
  data: MenuAnalysisData;
  rawJson: string;
  enrichment?: VisualEnrichmentResult;
}

export interface CompactMenuItem {
  itemKey: string;
  category: string | null;
  name: string;
}

/* ==========================================================================
   GEMINI RESPONSE SCHEMAS (STRUCTURED OUTPUT)
   ========================================================================== */

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

const geminiVisualEnrichmentResponseSchema = {
  type: Type.OBJECT,
  description: 'Classificação semântica e localização visual de produtos e fotos no cardápio.',
  properties: {
    sections: {
      type: Type.ARRAY,
      description: 'Classificação semântica das seções/categorias do cardápio.',
      items: {
        type: Type.OBJECT,
        properties: {
          categoryIndex: {
            type: Type.INTEGER,
            description: 'Índice numérico da categoria na listagem fornecida (0-based).',
          },
          sectionKind: {
            type: Type.STRING,
            description: 'Classificação da seção: "products", "combos", "addons", "options", "mixed", "unknown".',
          },
        },
        required: ['categoryIndex', 'sectionKind'],
      },
    },
    items: {
      type: Type.ARRAY,
      description: 'Classificação e localização visual de cada item fornecido na lista.',
      items: {
        type: Type.OBJECT,
        properties: {
          itemKey: {
            type: Type.STRING,
            description: 'Identificador exato do item fornecido (ex: "c0-p0").',
          },
          kind: {
            type: Type.STRING,
            description: 'Classificação do item: "product", "combo", "addon", "option", "informational", "unknown".',
          },
          sourceBox: {
            type: Type.ARRAY,
            nullable: true,
            description: 'Coordenadas inteiras [ymin, xmin, ymax, xmax] normalizadas de 0 a 1000 que delimitam o bloco do item no cardápio.',
            items: { type: Type.INTEGER },
          },
          photoBox: {
            type: Type.ARRAY,
            nullable: true,
            description: 'Coordenadas inteiras [ymin, xmin, ymax, xmax] normalizadas de 0 a 1000 delimitando estritamente a fotografia do alimento. null se não houver foto individual nítida.',
            items: { type: Type.INTEGER },
          },
          photoRelation: {
            type: Type.STRING,
            description: 'Relação da foto com o item: "direct", "shared", "ambiguous", "none".',
          },
          photoWarning: {
            type: Type.STRING,
            nullable: true,
            description: 'Observação descritiva sobre a foto (ex: imagem representa o combo completo, foto compartilhada por vários itens), ou null.',
          },
        },
        required: ['itemKey', 'kind', 'photoRelation'],
      },
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Avisos gerais sobre a análise visual ou fotos não associadas.',
    },
  },
  required: ['sections', 'items', 'warnings'],
};

/* ==========================================================================
   PROMPTS DO SISTEMA
   ========================================================================== */

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

function buildVisualEnrichmentPrompt(compactItems: CompactMenuItem[]): string {
  return `Você é um especialista em análise visual de cardápios de restaurantes.
Uma transcrição prévia já identificou os itens presentes neste cardápio.
Sua tarefa é EXCLUSIVAMENTE:
1. Classificar semanticamente as seções e cada item fornecido.
2. Localizar visualmente a caixa do item no cardápio (sourceBox).
3. Localizar a fotografia/ilustração correspondente do alimento (photoBox), se houver.

ITENS A LOCALIZAR E CLASSIFICAR:
${JSON.stringify(compactItems, null, 2)}

REGRAS RIGOROSAS:
1. Não altere, não adivinhe e não crie novos nomes de itens. Responda usando EXATAMENTE os "itemKey"s fornecidos.
2. Classificação de seções (sectionKind):
   - "products": seção com produtos padrão/pratos principais ("LINHA CLÁSSICA", "PIZZAS TRADICIONAIS").
   - "combos": seção de combos ou promoções combinadas ("COMBOS BULLS", "COMBOS FAMÍLIA").
   - "addons": seção de adicionais/acréscimos ("ADICIONAIS", "TURBINE SEU BURGER").
   - "options": opções de troca ou escolha ("TROQUE SUA BEBIDA POR", "ESCOLHA SEU MOLHO").
   - "mixed": seção com mistura de itens de diferentes naturezas.
   - "unknown": não foi possível determinar com segurança.
3. Classificação de itens (kind):
   - "product": produto individual padrão.
   - "combo": pacote/combo com múltiplos itens reunidos.
   - "addon": ingrediente extra ou adicional pago.
   - "option": alternativa de escolha/substituição de acompanhamento ou bebida.
   - "informational": aviso institucional, taxa de entrega, horário ou mensagem.
   - "unknown": classificação incerta.
4. Bounding boxes (Coordenadas normalizadas [ymin, xmin, ymax, xmax] inteiros de 0 a 1000):
   - O canto superior esquerdo da imagem é [0, 0] e o inferior direito é [1000, 1000].
   - Sempre respeite ymin < ymax e xmin < xmax.
   - "sourceBox": engloba o bloco do item no cardápio (nome, descrição, preço e eventual imagem associada).
   - "photoBox": delimita ESTRITAMENTE a fotografia do alimento. NUNCA inclua texto, nome, preço, descrições, logotipos ou bordas de cabeçalho dentro da photoBox.
   - Se o item não possuir foto individual nítida, defina "photoBox": null.
5. Relação da foto (photoRelation):
   - "direct": a foto representa diretamente o item individual ou o combo completo.
   - "shared": a mesma fotografia é compartilhada visualmente por mais de um item.
   - "ambiguous": há uma foto próxima, mas é incerto se pertence a este item ou ao vizinho.
   - "none": não existe fotografia para este item.
   - REGRA OBRIGATÓRIA: se "photoRelation" for "none", "photoBox" DEVE ser obrigatoriamente null.
6. ATENÇÃO A ELEMENTOS QUE NÃO SÃO FOTOS DE PRODUTOS:
   - Logotipos da loja (ex: marca Bulls BBQ) NUNCA são fotos de produtos.
   - Escudos de times de futebol (Flamengo, Vasco, Botafogo, etc.) NUNCA são fotos de hambúrgueres.
   - Ícones, ilustrações decorativas ou fundos temáticos NUNCA são fotos de produtos.
   - Não associe a foto de um produto vizinho a este item apenas pela proximidade espacial.`;
}

/* ==========================================================================
   FUNÇÕES DE INTEGRAÇÃO COM GEMINI API
   ========================================================================== */

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

/**
 * Chamada IA #1: Extração textual estruturada do cardápio a partir do Buffer da imagem.
 */
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

/**
 * Chamada IA #2: Enriquecimento visual (classificação semântica + localização de fotos e bounding boxes).
 */
export async function analyzeMenuVisualEnrichmentWithGemini(
  buffer: Buffer,
  mimeType: string,
  compactItems: CompactMenuItem[]
): Promise<VisualEnrichmentSuccess> {
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
  const prompt = buildVisualEnrichmentPrompt(compactItems);

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
          text: prompt,
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: geminiVisualEnrichmentResponseSchema,
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
      `Falha na análise visual com o Gemini: ${sanitized || 'Erro na chamada ao modelo.'}`,
      'GEMINI_SERVICE_ERROR'
    );
  }

  const executionTimeMs = Date.now() - startTime;

  if (!rawText) {
    throw new HttpError(502, 'O Gemini retornou uma resposta vazia na análise visual.', 'GEMINI_EMPTY_RESPONSE');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    const truncated = rawText.slice(0, 300);
    throw new HttpError(
      502,
      'O modelo não retornou um JSON válido na análise visual.',
      'INVALID_GEMINI_RESPONSE',
      { rawJsonSnippet: truncated }
    );
  }

  const parseResult = visualEnrichmentSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    const truncated = rawText.slice(0, 300);
    throw new HttpError(
      502,
      'A resposta da análise visual não atende ao formato estruturado esperado.',
      'INVALID_GEMINI_RESPONSE',
      {
        validationIssues: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        rawJsonSnippet: truncated,
      }
    );
  }

  return {
    status: 'ok',
    model,
    executionTimeMs,
    data: parseResult.data,
    rawJson: rawText,
  };
}

/**
 * Função Orquestradora do Lab IA V2:
 * 1. Executa a Chamada #1 (extração textual).
 * 2. Se for cardápio legível com produtos, executa a Chamada #2 (classificação + fotos).
 * 3. Se a Chamada #2 falhar, preserva integralmente a resposta da Chamada #1 sem quebrar a requisição.
 */
export async function analyzeMenuWithFullLab(
  buffer: Buffer,
  mimeType: string
): Promise<FullLabAnalysisResponse> {
  const globalStartTime = Date.now();

  // Chamada #1: Extração textual obrigatória
  const extractionResult = await analyzeMenuBufferWithGemini(buffer, mimeType);
  const extractionExecutionTimeMs = extractionResult.executionTimeMs;

  let enrichment: VisualEnrichmentResult | undefined;

  // Verifica se a chamada #2 deve ser executada
  const hasProducts = extractionResult.data.categories.some(
    (c) => Array.isArray(c.products) && c.products.length > 0
  );

  if (extractionResult.data.isMenu && hasProducts) {
    // Monta itens compactos determinísticos com category: string | null (sem inventar "Geral")
    const compactItems: CompactMenuItem[] = [];
    extractionResult.data.categories.forEach((cat, catIdx) => {
      cat.products.forEach((prod, prodIdx) => {
        compactItems.push({
          itemKey: `c${catIdx}-p${prodIdx}`,
          category: cat.name || null,
          name: prod.name,
        });
      });
    });

    if (compactItems.length > 0) {
      try {
        enrichment = await analyzeMenuVisualEnrichmentWithGemini(buffer, mimeType, compactItems);
      } catch (err: any) {
        // Falha na chamada #2 NUNCA invalida a chamada #1
        const rawMessage = String(err?.message || 'Falha ao processar análise visual das fotos.');
        const sanitized = rawMessage
          .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
          .replace(/apiKey=[^&\s]+/gi, 'apiKey=[REDACTED]');

        enrichment = {
          status: 'failed',
          error: {
            code: err?.code || 'VISUAL_ENRICHMENT_FAILED',
            message: sanitized,
          },
        };
      }
    }
  }

  const totalExecutionTimeMs = Date.now() - globalStartTime;

  return {
    success: true,
    model: extractionResult.model,
    executionTimeMs: totalExecutionTimeMs,
    extractionExecutionTimeMs,
    data: extractionResult.data,
    rawJson: extractionResult.rawJson,
    enrichment,
  };
}
