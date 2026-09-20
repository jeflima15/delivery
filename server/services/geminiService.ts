import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';
import {
  analyzePdfSemanticEnrichmentWithGemini,
  type PdfSemanticEnrichmentResult,
  type CompactPdfMenuItem,
  type CompactCandidateGroup,
  type CompactRuleBlock,
  type CompactSectionHeading,
  type CompactPageCoverage,
  type CompactUnmappedText,
} from './pdfSemanticService.js';
import {
  analyzePdfPhotoEnrichmentWithGemini,
  type PdfPhotoEnrichmentResult,
  type CompactPdfPhotoItemInput,
} from './pdfPhotoService.js';
import {
  analyzePdfCatalogAuditWithGemini,
  type PdfAuditResult,
} from './pdfCatalogAuditService.js';

export * from './pdfSemanticService.js';
export * from './pdfPhotoService.js';
export * from './pdfCatalogAuditService.js';

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
  sourcePage: z
    .number()
    .int('sourcePage deve ser um número inteiro.')
    .min(1, 'sourcePage deve ser maior ou igual a 1.')
    .nullable()
    .optional()
    .default(null),
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

/* ==========================================================================
   SCHEMA - CHAMADA #1 V3: EXTRAÇÃO DE EVIDÊNCIAS DE CARDÁPIO EM PDF
   ========================================================================== */

export const pdfCandidateGroupOptionSchema = z.object({
  name: z.string().trim().min(1, 'Nome da opção não pode ser vazio.'),
  rawText: z.string().nullable().optional().default(null),
  amountCents: z.number().int().nonnegative().nullable().optional().default(null),
  priceRawText: z.string().nullable().optional().default(null),
});

export const pdfCandidateGroupSchema = z.object({
  title: z.string().trim().nullable().optional().default(null),
  sourcePage: z.number().int().min(1, 'sourcePage deve ser >= 1'),
  instruction: z.string().nullable().optional().default(null),
  parentProductHint: z.string().nullable().optional().default(null),
  rawText: z.string().nullable().optional().default(null),
  options: z.array(pdfCandidateGroupOptionSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export const pdfRuleBlockSchema = z.object({
  title: z.string().trim().nullable().optional().default(null),
  body: z.string().trim().min(1, 'Corpo da regra não pode ser vazio.'),
  rawText: z.string().trim().default(''),
  sourcePage: z.number().int().min(1, 'sourcePage deve ser >= 1'),
});

export const pdfSectionHeadingSchema = z.object({
  text: z.string().trim().min(1, 'Título de seção não pode ser vazio.'),
  sourcePage: z.number().int().min(1, 'sourcePage deve ser >= 1'),
});

export const pdfPageRoleSchema = z.enum([
  'cover',
  'catalog',
  'rules',
  'marketing',
  'contact',
  'mixed',
  'other',
]);
export type PdfPageRole = z.infer<typeof pdfPageRoleSchema>;

export const pdfPageCoverageItemSchema = z.object({
  pageNumber: z.number().int().min(1, 'pageNumber deve ser >= 1'),
  role: pdfPageRoleSchema,
  hasCatalogEvidence: z.boolean(),
  notes: z.string().nullable().optional().default(null),
});
export type PdfPageCoverageItem = z.infer<typeof pdfPageCoverageItemSchema>;

export const pdfMenuAnalysisRawSchema = menuAnalysisSchema.extend({
  candidateGroups: z.array(pdfCandidateGroupSchema).default([]),
  ruleBlocks: z.array(pdfRuleBlockSchema).default([]),
  sectionHeadings: z.array(pdfSectionHeadingSchema).default([]),
  pageCoverage: z.array(pdfPageCoverageItemSchema).default([]),
});

export interface PdfCandidateGroupOptionWithKey {
  optionKey: string;
  name: string;
  rawText: string | null;
  amountCents: number | null;
  priceRawText: string | null;
}

export interface PdfCandidateGroupWithKey {
  groupKey: string;
  title: string | null;
  sourcePage: number;
  instruction: string | null;
  parentProductHint: string | null;
  rawText: string | null;
  options: PdfCandidateGroupOptionWithKey[];
  warnings: string[];
}

export interface PdfRuleBlockWithKey {
  ruleKey: string;
  title: string | null;
  body: string;
  rawText: string;
  sourcePage: number;
}

export interface PdfSectionHeadingWithKey {
  headingKey: string;
  text: string;
  sourcePage: number;
}

export interface PdfMenuAnalysisData extends MenuAnalysisData {
  candidateGroups: PdfCandidateGroupWithKey[];
  ruleBlocks: PdfRuleBlockWithKey[];
  sectionHeadings: PdfSectionHeadingWithKey[];
  pageCoverage: PdfPageCoverageItem[];
}

export function enrichPdfT1Evidence(
  rawData: z.infer<typeof pdfMenuAnalysisRawSchema>
): PdfMenuAnalysisData {
  // Validação estrita de pageCoverage sem duplicação silenciosa
  const seenPages = new Set<number>();
  for (const item of rawData.pageCoverage) {
    if (!Number.isInteger(item.pageNumber) || item.pageNumber < 1) {
      throw new HttpError(
        502,
        `pageNumber inválido em pageCoverage: ${item.pageNumber}. Deve ser inteiro >= 1.`,
        'INVALID_GEMINI_RESPONSE'
      );
    }
    if (seenPages.has(item.pageNumber)) {
      throw new HttpError(
        502,
        `Página duplicada em pageCoverage: página ${item.pageNumber} reportada mais de uma vez.`,
        'INVALID_GEMINI_RESPONSE'
      );
    }
    seenPages.add(item.pageNumber);
  }

  const sortedCoverage = [...rawData.pageCoverage].sort((a, b) => a.pageNumber - b.pageNumber);

  // Geração determinística de IDs para candidateGroups e options
  const candidateGroups: PdfCandidateGroupWithKey[] = (rawData.candidateGroups || []).map((cg, gIdx) => {
    const groupKey = `cg${gIdx}`;
    const options: PdfCandidateGroupOptionWithKey[] = (cg.options || []).map((opt, oIdx) => ({
      optionKey: `${groupKey}-o${oIdx}`,
      name: opt.name,
      rawText: opt.rawText ?? null,
      amountCents: opt.amountCents ?? null,
      priceRawText: opt.priceRawText ?? null,
    }));
    return {
      groupKey,
      title: cg.title ?? null,
      sourcePage: cg.sourcePage,
      instruction: cg.instruction ?? null,
      parentProductHint: cg.parentProductHint ?? null,
      rawText: cg.rawText ?? null,
      options,
      warnings: cg.warnings || [],
    };
  });

  // Geração determinística de IDs para ruleBlocks: rb0, rb1...
  const ruleBlocks: PdfRuleBlockWithKey[] = (rawData.ruleBlocks || []).map((rb, rIdx) => ({
    ruleKey: `rb${rIdx}`,
    title: rb.title ?? null,
    body: rb.body,
    rawText: rb.rawText || rb.body,
    sourcePage: rb.sourcePage,
  }));

  // Geração determinística de IDs para sectionHeadings: sh0, sh1...
  const sectionHeadings: PdfSectionHeadingWithKey[] = (rawData.sectionHeadings || []).map((sh, sIdx) => ({
    headingKey: `sh${sIdx}`,
    text: sh.text,
    sourcePage: sh.sourcePage,
  }));

  return {
    ...rawData,
    candidateGroups,
    ruleBlocks,
    sectionHeadings,
    pageCoverage: sortedCoverage,
  };
}

export interface MenuAnalysisResponse {
  success: true;
  model: string;
  executionTimeMs: number;
  data: MenuAnalysisData | PdfMenuAnalysisData;
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

export interface VisualEnrichmentSkipped {
  status: 'skipped';
  reason: 'PDF_VISUAL_ENRICHMENT_NOT_ENABLED';
  message: string;
}

export type VisualEnrichmentResult =
  | VisualEnrichmentSuccess
  | VisualEnrichmentFailure
  | VisualEnrichmentSkipped;

export interface FullLabAnalysisResponse {
  success: true;
  model: string;
  executionTimeMs: number; // Tempo total da operação
  extractionExecutionTimeMs: number; // Tempo da chamada #1
  semanticExecutionTimeMs?: number;
  photoExecutionTimeMs?: number;
  auditExecutionTimeMs?: number;
  data: MenuAnalysisData | PdfMenuAnalysisData;
  rawJson: string;
  enrichment?: VisualEnrichmentResult;
  pdfSemanticEnrichment?: PdfSemanticEnrichmentResult;
  pdfPhotoEnrichment?: PdfPhotoEnrichmentResult;
  pdfAudit?: PdfAuditResult;
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
                  description: 'Nome do produto visto na imagem ou documento.',
                },
                sourcePage: {
                  type: Type.INTEGER,
                  nullable: true,
                  description: 'Número humano da página onde o item aparece no documento PDF (1, 2, 3...), ou null se for imagem.',
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

const geminiPdfMenuResponseSchema = {
  type: Type.OBJECT,
  description: 'Estruturação completa de evidências de um cardápio em PDF multipágina (V3).',
  properties: {
    isMenu: {
      type: Type.BOOLEAN,
      description: 'true se o PDF contiver um cardápio legível, false se não for um cardápio.',
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
            description: 'Nome da categoria exatamente como visto no documento, ou null se não houver título de seção.',
          },
          products: {
            type: Type.ARRAY,
            description: 'Produtos listados nesta categoria.',
            items: {
              type: Type.OBJECT,
              properties: {
                name: {
                  type: Type.STRING,
                  description: 'Nome do produto visto no documento.',
                },
                sourcePage: {
                  type: Type.INTEGER,
                  description: 'Número humano da página onde o item aparece no documento PDF (1, 2, 3...).',
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
                  description: 'Dúvidas ou alertas específicos sobre este item.',
                },
              },
              required: ['name', 'sourcePage', 'prices', 'warnings'],
            },
          },
        },
        required: ['products'],
      },
    },
    candidateGroups: {
      type: Type.ARRAY,
      description: 'Listas de opções, escolhas ou complementos (sabores, massas, recheios, adicionais).',
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            nullable: true,
            description: 'Título da lista de escolhas (ex: "Sabores Tradicionais", "Opções de Massa"), ou null.',
          },
          sourcePage: {
            type: Type.INTEGER,
            description: 'Número humano da página onde a lista aparece no documento (1, 2, 3...).',
          },
          instruction: {
            type: Type.STRING,
            nullable: true,
            description: 'Instrução visível para o cliente (ex: "Escolha até 2 sabores", "1 opção inclusa"), ou null.',
          },
          parentProductHint: {
            type: Type.STRING,
            nullable: true,
            description: 'Nome do produto associado caso a lista seja claramente exclusiva de um item específico, ou null se for compartilhada.',
          },
          rawText: {
            type: Type.STRING,
            nullable: true,
            description: 'Trecho textual original do cabeçalho da lista de opções.',
          },
          options: {
            type: Type.ARRAY,
            description: 'Itens ou sabores que compõem esta lista.',
            items: {
              type: Type.OBJECT,
              properties: {
                name: {
                  type: Type.STRING,
                  description: 'Nome da opção ou sabor.',
                },
                rawText: {
                  type: Type.STRING,
                  nullable: true,
                  description: 'Texto bruto original da opção.',
                },
                amountCents: {
                  type: Type.INTEGER,
                  nullable: true,
                  description: 'Valor adicional em centavos, ou null se não houver acréscimo.',
                },
                priceRawText: {
                  type: Type.STRING,
                  nullable: true,
                  description: 'Texto original do preço adicional, se houver.',
                },
              },
              required: ['name'],
            },
          },
          warnings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Alertas sobre a lista de opções.',
          },
        },
        required: ['sourcePage', 'options', 'warnings'],
      },
    },
    ruleBlocks: {
      type: Type.ARRAY,
      description: 'Blocos de regras operacionais ou comerciais visíveis no documento.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            nullable: true,
            description: 'Título do bloco de regras (ex: "Encomendas", "Formas de Pagamento"), ou null.',
          },
          body: {
            type: Type.STRING,
            description: 'Texto completo e detalhado da regra comercial visível no documento. NUNCA resuma.',
          },
          rawText: {
            type: Type.STRING,
            description: 'Texto literal original do bloco de regra.',
          },
          sourcePage: {
            type: Type.INTEGER,
            description: 'Número humano da página onde a regra aparece no documento (1, 2, 3...).',
          },
        },
        required: ['body', 'rawText', 'sourcePage'],
      },
    },
    sectionHeadings: {
      type: Type.ARRAY,
      description: 'Títulos de seção destacados, capas temáticas ou cabeçalhos visuais.',
      items: {
        type: Type.OBJECT,
        properties: {
          text: {
            type: Type.STRING,
            description: 'Texto do cabeçalho ou título destacado de seção.',
          },
          sourcePage: {
            type: Type.INTEGER,
            description: 'Número humano da página onde o título de seção aparece (1, 2, 3...).',
          },
        },
        required: ['text', 'sourcePage'],
      },
    },
    pageCoverage: {
      type: Type.ARRAY,
      description: 'Mapeamento de todas as páginas do documento (sem pular nem duplicar páginas).',
      items: {
        type: Type.OBJECT,
        properties: {
          pageNumber: {
            type: Type.INTEGER,
            description: 'Número humano da página analisada (1, 2, 3...).',
          },
          role: {
            type: Type.STRING,
            description: 'Papel da página: "cover", "catalog", "rules", "marketing", "contact", "mixed", "other".',
          },
          hasCatalogEvidence: {
            type: Type.BOOLEAN,
            description: 'true se a página contiver produtos ou listas de opções do cardápio, false caso contrário.',
          },
          notes: {
            type: Type.STRING,
            nullable: true,
            description: 'Observação breve sobre o conteúdo da página.',
          },
        },
        required: ['pageNumber', 'role', 'hasCatalogEvidence'],
      },
    },
    unmappedTexts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Textos soltos ou informativos que não puderam ser encaixados nas categorias, opções ou regras.',
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Avisos gerais sobre a leitura do documento.',
    },
  },
  required: [
    'isMenu',
    'categories',
    'candidateGroups',
    'ruleBlocks',
    'sectionHeadings',
    'pageCoverage',
    'unmappedTexts',
    'warnings',
  ],
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

export const PDF_V3_EXTRACTION_PROMPT = `Você é um especialista em transcrição e estruturação de cardápios de restaurantes a partir de documentos PDF multipágina.
Sua tarefa é ler atentamente TODAS as páginas do documento PDF e transcrever com máxima fidelidade as evidências do cardápio: produtos comerciais, listas de opções/sabores, regras de negócio e cabeçalhos de seção.

Regras rigorosas:
1. Extraia apenas informações visíveis no documento PDF. NUNCA invente produtos, opções, regras ou preços.
2. Analise TODAS as páginas do documento PDF do início ao fim (página 1 até a última página). Não pare antes do fim do documento.
3. Se o documento claramente NÃO for um cardápio ou menu de alimentos/bebidas legível (ex: boleto, contrato, documento em branco):
   - Defina "isMenu": false.
   - Deixe "categories", "candidateGroups", "ruleBlocks", "sectionHeadings" como arrays vazios [].
   - Em "pageCoverage", liste todas as páginas e em "warnings" adicione uma explicação clara em português.

---
### TESTE DE INDEPENDÊNCIA COMERCIAL (CRÍTICO)
ANTES de colocar qualquer entidade em "categories[].products", faça obrigatoriamente a seguinte pergunta:
"Esta entidade pode ser comprada/pedida de forma independente pelo cliente ou ela existe somente como configuração/escolha de outro produto?"

Somente use "categories[].products" para:
- Produto comercial independente (ex: "Bolo de Festa", "Cento de Brigadeiros", "Torta Holandesa", "Pizza Calabresa");
- Combo ou pacote comercial independente (ex: "Kit Festa Essencial", "Combo Família");
- Família comercial representada como um ÚNICO produto com suas variações consolidadas no array "prices".

NÃO use "categories[].products" para:
- Tamanho, diâmetro, peso, porção ou quantidade;
- Sabor escolhido dentro de outro produto;
- Massa, recheio ou cobertura;
- Decoração (padrão ou especial);
- Adicional ou acréscimo;
- Borda, molho ou acompanhamento;
- Personalização, opção de troca ou característica do produto.
Mesmo que essas entidades possuam foto própria, nome destacado, preço próprio, valor de acréscimo ou bloco visual individual no PDF, elas NÃO SÃO produtos independentes.

---
### REGRA FORTE PARA TABELAS DE VARIAÇÕES (CONSOLIDAÇÃO EM "prices")
TER NOME, FOTO OU PREÇO NÃO TORNA UMA ENTIDADE UM PRODUCT.
Se existir UM produto/família comercial e abaixo dele (ou associado a ele) uma tabela onde as linhas diferem principalmente por:
- tamanho (ex: 12 cm, 15 cm, 20 cm, 25 cm);
- diâmetro ou peso (ex: 1,5kg, 2kg, 3kg);
- volume ou porção (ex: Broto, Média, Grande; 300ml, 500ml);
- número de pessoas ou fatias atendidas;
- número de unidades (ex: Caixa 50 unid, Caixa 100 unid);

essas linhas são VARIAÇÕES DE PREÇO DO MESMO PRODUTO!
Devem ser obrigatoriamente consolidadas em:
categories[].products[um único produto].prices[]
NUNCA crie um produto por linha!

Exemplo comparativo obrigatório:
Se o PDF contiver:
"Bolo de festa"
12 cm / 1,5kg — R$ 128
15 cm / 2kg — R$ 175
20 cm / 3kg — R$ 229

CORRETO:
{
  "name": "Bolo de festa",
  "prices": [
    { "label": "12 cm, aprox. 1,5kg", "amountCents": 12800, "rawText": "12 cm / 1,5kg — R$ 128" },
    { "label": "15 cm, aprox. 2kg", "amountCents": 17500, "rawText": "15 cm / 2kg — R$ 175" },
    { "label": "20 cm, aprox. 3kg", "amountCents": 22900, "rawText": "20 cm / 3kg — R$ 229" }
  ]
}

ERRADO (PROIBIDO):
products:
- "12 cm"
- "15 cm"
- "20 cm"

---
### REGRA FORTE PARA PERSONALIZAÇÕES COM PREÇO
PREÇO NÃO IMPLICA INDEPENDÊNCIA COMERCIAL.
Se uma opção aparece dentro do contexto de personalização de outro produto e seu preço significa:
- "+ R$ X";
- "acréscimo";
- "adicional";
- "a partir de +...";
- "consulte valores";
- "incluso" ou "sem acréscimo";

essa entidade deve OBRIGATORIAMENTE ser registrada em "candidateGroups" com suas opções e "amountCents". NUNCA a promova a Product!

Exemplo:
"Decorações especiais — opções disponíveis com acréscimo"
- Semi floral — a partir de R$ 10
- Semi vintage — a partir de R$ 15
- Cachepô duplo — a partir de R$ 10
- Vintage — a partir de R$ 20

Destino correto:
-> "candidateGroups": título "Decorações especiais", opções com amountCents (1000, 1500, 2000).
-> NUNCA crie 4 Products para essas decorações!

---
### CONTEXTO MULTIPÁGINA PARA parentProductHint
O campo "parentProductHint" em "candidateGroups" NÃO precisa de nome de produto repetido na mesma página física.
Ele pode e DEVE apontar para o produto identificado na MESMA SEÇÃO MULTIPÁGINA visual, utilizando a continuidade visual do documento e os títulos em "sectionHeadings".
Exemplo de continuidade multipágina:
- Página 4: Abertura / título de seção "Bolos de festa"
- Página 5: Tabela de tamanhos e preços do "Bolo de festa"
- Página 6: Listas de massas e recheios disponíveis
- Página 7: Decorações inclusas
- Página 8: Decorações especiais com acréscimo
Enquanto não houver evidência clara de mudança para outra família de produtos, as listas das páginas 6, 7 e 8 pertencem todas ao contexto "Bolos de festa":
-> Massas -> parentProductHint: "Bolos de festa"
-> Recheios -> parentProductHint: "Bolos de festa"
-> Decorações -> parentProductHint: "Bolos de festa"
-> Decorações especiais -> parentProductHint: "Bolos de festa"

---
### EVITAR DUPLICAÇÃO ENTRE PRODUCTS E CANDIDATEGROUPS
A mesma evidência física do documento NÃO DEVE aparecer simultaneamente como Product e como candidateGroup option sem justificativa comercial real.
- Se a entidade só existe como escolha, sabor, massa, recheio ou personalização de outro produto -> registre APENAS em "candidateGroups".
- Se a entidade é vendida como item principal avulso -> registre em "products".
- Se houver ambiguidade real se é produto avulso ou escolha -> prefira "candidateGroups" com aviso em "warnings" quando o contexto visual indicar personalização. NUNCA duplique para "garantir".

---
### OUTRAS DIRETRIZES:
1. REGRAS DE NEGÓCIO E CONDIÇÕES OPERACIONAIS (ruleBlocks):
   - Todo bloco de texto que define regras comerciais (antecedência mínima de pedido, taxa/condições de entrega, instruções de pagamento, conservação, alérgenos) DEVE ser registrado em "ruleBlocks".
   - PRESERVE O CORPO COMPLETO da regra em "body" e "rawText". NUNCA resuma, descarte ou trunque o texto da regra para apenas um título.
2. TÍTULOS DE SEÇÃO E CABEÇALHOS (sectionHeadings):
   - Títulos visuais destacados, capas de seção ou chamadas temáticas (ex: "Linha Festa", "Cardápio Especial de Páscoa") devem ser registrados em "sectionHeadings" com sua respectiva sourcePage.
3. COBERTURA TOTAL DE PÁGINAS (pageCoverage):
   - Mapeie TODAS as páginas do documento (da página 1 até a última), sem pular nenhuma página e SEM DUPLICAR NENHUMA PÁGINA.
   - Informe "role": "cover", "catalog", "rules", "marketing", "contact", "mixed" ou "other".
   - "hasCatalogEvidence": true se houver produtos ou listas de opções nessa página; false caso contrário.
4. Não faça merge silencioso nem descarte dados visíveis.`;

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
  const isPdf = mimeType.toLowerCase() === 'application/pdf';
  const extractionPrompt = isPdf ? PDF_V3_EXTRACTION_PROMPT : MENU_EXTRACTION_PROMPT;
  const responseSchema = isPdf ? geminiPdfMenuResponseSchema : geminiMenuResponseSchema;

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
          text: extractionPrompt,
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema,
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

  if (isPdf) {
    const parseResult = pdfMenuAnalysisRawSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      const truncated = rawText.slice(0, 300);
      throw new HttpError(
        502,
        'A resposta do modelo para o PDF não atende ao formato estruturado esperado.',
        'INVALID_GEMINI_RESPONSE',
        {
          validationIssues: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
          rawJsonSnippet: truncated,
        }
      );
    }

    const enrichedData = enrichPdfT1Evidence(parseResult.data);
    return {
      success: true,
      model,
      executionTimeMs,
      data: enrichedData,
      rawJson: rawText,
    };
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
  let pdfSemanticEnrichment: PdfSemanticEnrichmentResult | undefined;
  let pdfPhotoEnrichment: PdfPhotoEnrichmentResult | undefined;
  let pdfAudit: PdfAuditResult | undefined;
  let semanticExecutionTimeMs: number | undefined;
  let photoExecutionTimeMs: number | undefined;
  let auditExecutionTimeMs: number | undefined;

  // Se for PDF: chamada #2 é semântica e chamadas #3 (fotos) e #4 (auditoria) rodam em paralelo
  if (mimeType.toLowerCase() === 'application/pdf') {
    enrichment = {
      status: 'skipped',
      reason: 'PDF_VISUAL_ENRICHMENT_NOT_ENABLED',
      message:
        'A leitura do PDF foi concluída. A detecção automática de fotos em PDF ainda não está habilitada neste laboratório.',
    };

    const pdfData = extractionResult.data as PdfMenuAnalysisData;
    const hasProducts = pdfData.categories.some(
      (c) => Array.isArray(c.products) && c.products.length > 0
    );
    const hasCandidateGroups = Array.isArray(pdfData.candidateGroups) && pdfData.candidateGroups.length > 0;

    if (pdfData.isMenu && (hasProducts || hasCandidateGroups)) {
      const compactPdfItems: CompactPdfMenuItem[] = [];

      // Itens de produtos comerciais
      pdfData.categories.forEach((cat, catIdx) => {
        cat.products.forEach((prod, prodIdx) => {
          compactPdfItems.push({
            itemKey: `c${catIdx}-p${prodIdx}`,
            sourceType: 'product_candidate',
            evidenceGroupKey: null,
            parentProductHint: null,
            category: cat.name || null,
            name: prod.name,
            sourcePage: typeof prod.sourcePage === 'number' ? prod.sourcePage : null,
            prices: (prod.prices || []).map((p) => ({
              label: p.label || null,
              amountCents: p.amountCents ?? null,
            })),
          });
        });
      });

      // Opções dos candidateGroups registradas com chave determinística cgX-oY
      (pdfData.candidateGroups || []).forEach((cg) => {
        (cg.options || []).forEach((opt) => {
          compactPdfItems.push({
            itemKey: opt.optionKey,
            sourceType: 'choice_option',
            evidenceGroupKey: cg.groupKey,
            parentProductHint: cg.parentProductHint || null,
            category: cg.title || null,
            name: opt.name,
            sourcePage: typeof cg.sourcePage === 'number' ? cg.sourcePage : null,
            prices:
              opt.amountCents !== null
                ? [
                    {
                      label: null,
                      amountCents: opt.amountCents,
                    },
                  ]
                : [],
          });
        });
      });

      const compactCandidateGroups: CompactCandidateGroup[] = (pdfData.candidateGroups || []).map((cg) => ({
        groupKey: cg.groupKey,
        title: cg.title,
        sourcePage: cg.sourcePage,
        instruction: cg.instruction,
        parentProductHint: cg.parentProductHint,
        options: cg.options.map((opt) => ({
          optionKey: opt.optionKey,
          name: opt.name,
          amountCents: opt.amountCents,
        })),
      }));

      const compactRuleBlocks: CompactRuleBlock[] = (pdfData.ruleBlocks || []).map((rb) => ({
        ruleKey: rb.ruleKey,
        title: rb.title,
        body: rb.body,
        sourcePage: rb.sourcePage,
      }));

      const compactSectionHeadings: CompactSectionHeading[] = (pdfData.sectionHeadings || []).map((sh) => ({
        headingKey: sh.headingKey,
        text: sh.text,
        sourcePage: sh.sourcePage,
      }));

      const compactPageCoverage: CompactPageCoverage[] = (pdfData.pageCoverage || []).map((pc) => ({
        pageNumber: pc.pageNumber,
        role: pc.role,
        hasCatalogEvidence: pc.hasCatalogEvidence,
      }));

      const compactUnmappedTexts: CompactUnmappedText[] = (
        pdfData.unmappedTexts || []
      ).map((text, idx) => ({
        textKey: `u${idx}`,
        rawText: text,
      }));

      if (compactPdfItems.length > 0) {
        try {
          pdfSemanticEnrichment = await analyzePdfSemanticEnrichmentWithGemini(
            buffer,
            mimeType,
            compactPdfItems,
            compactCandidateGroups,
            compactRuleBlocks,
            compactSectionHeadings,
            compactPageCoverage,
            compactUnmappedTexts
          );
        } catch (err: any) {
          // Falha na chamada #2 semântica NUNCA invalida a chamada #1
          const rawMessage = String(
            err?.message || 'Falha ao processar interpretação semântica do cardápio em PDF.'
          );
          const sanitized = rawMessage
            .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
            .replace(/apiKey=[^&\s]+/gi, 'apiKey=[REDACTED]');

          pdfSemanticEnrichment = {
            status: 'failed',
            error: {
              code: err?.code || 'PDF_SEMANTIC_FAILED',
              message: sanitized,
            },
          };
        }

        // T3 (Fotos) e T4 (Auditoria) executam em PARALELO via Promise.allSettled
        if (pdfSemanticEnrichment?.status === 'ok') {
          semanticExecutionTimeMs = pdfSemanticEnrichment.executionTimeMs;

          // Filtra itens fotográficos: apenas 'product' e 'combo'
          const photoEligibleKinds = new Set(['product', 'combo']);
          const photoItemsInput: CompactPdfPhotoItemInput[] = [];

          pdfSemanticEnrichment.data.items.forEach((sItem) => {
            if (!photoEligibleKinds.has(sItem.kind)) return;

            const t1Item = compactPdfItems.find((ci) => ci.itemKey === sItem.itemKey);
            if (!t1Item) return;

            const candidatePages =
              Array.isArray(sItem.photoCandidatePages) && sItem.photoCandidatePages.length > 0
                ? sItem.photoCandidatePages
                : typeof t1Item.sourcePage === 'number' && t1Item.sourcePage >= 1
                ? [t1Item.sourcePage]
                : [];

            if (candidatePages.length === 0) return;

            photoItemsInput.push({
              itemKey: sItem.itemKey,
              name: t1Item.name,
              kind: sItem.kind,
              sourcePage: typeof t1Item.sourcePage === 'number' ? t1Item.sourcePage : candidatePages[0],
              photoCandidatePages: candidatePages,
              parentItemKey: sItem.parentItemKey,
              groupKey: sItem.groupKey,
            });
          });

          const currentSemanticData = pdfSemanticEnrichment.data;

          // Definição das tarefas independentes T3 e T4
          const runT3 = async (): Promise<PdfPhotoEnrichmentResult | null> => {
            if (photoItemsInput.length === 0) return null;
            const t3Start = Date.now();
            try {
              const photoResult = await analyzePdfPhotoEnrichmentWithGemini(
                buffer,
                mimeType,
                photoItemsInput
              );
              if (photoResult.status === 'ok') {
                photoExecutionTimeMs = photoResult.executionTimeMs;
              }
              return photoResult;
            } catch (err: any) {
              photoExecutionTimeMs = Date.now() - t3Start;
              const rawMessage = String(
                err?.message || 'Falha ao processar detecção de fotos do cardápio em PDF.'
              );
              const sanitized = rawMessage
                .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
                .replace(/apiKey=[^&\s]+/gi, 'apiKey=[REDACTED]');

              return {
                status: 'failed',
                error: {
                  code: err?.code || 'PDF_PHOTO_FAILED',
                  message: sanitized,
                },
              };
            }
          };

          const runT4 = async (): Promise<PdfAuditResult> => {
            const t4Start = Date.now();
            try {
              const auditResult = await analyzePdfCatalogAuditWithGemini(
                buffer,
                mimeType,
                {
                  categories: pdfData.categories,
                  candidateGroups: pdfData.candidateGroups,
                  ruleBlocks: pdfData.ruleBlocks,
                  sectionHeadings: pdfData.sectionHeadings,
                  pageCoverage: pdfData.pageCoverage,
                },
                currentSemanticData
              );
              if (auditResult.status === 'ok') {
                auditExecutionTimeMs = auditResult.executionTimeMs;
              }
              return auditResult;
            } catch (err: any) {
              auditExecutionTimeMs = Date.now() - t4Start;
              const rawMessage = String(
                err?.message || 'Falha ao processar auditoria de cobertura do cardápio em PDF.'
              );
              const sanitized = rawMessage
                .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
                .replace(/apiKey=[^&\s]+/gi, 'apiKey=[REDACTED]');

              return {
                status: 'failed',
                error: {
                  code: err?.code || 'PDF_AUDIT_FAILED',
                  message: sanitized,
                },
              };
            }
          };

          const [t3Settled, t4Settled] = await Promise.allSettled([runT3(), runT4()]);

          if (t3Settled.status === 'fulfilled' && t3Settled.value) {
            pdfPhotoEnrichment = t3Settled.value;
          }
          if (t4Settled.status === 'fulfilled' && t4Settled.value) {
            pdfAudit = t4Settled.value;
          }
        }
      }
    }
  } else {
    // Para imagens: verifica se a chamada #2 visual deve ser executada
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
  }

  const totalExecutionTimeMs = Date.now() - globalStartTime;

  return {
    success: true,
    model: extractionResult.model,
    executionTimeMs: totalExecutionTimeMs,
    extractionExecutionTimeMs,
    semanticExecutionTimeMs,
    photoExecutionTimeMs,
    auditExecutionTimeMs,
    data: extractionResult.data,
    rawJson: extractionResult.rawJson,
    enrichment,
    pdfSemanticEnrichment,
    pdfPhotoEnrichment,
    pdfAudit,
  };
}
