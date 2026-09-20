/**
 * Serviço Unificado do Laboratório IA de Cardápio (V4 Unified / Single-Pass)
 *
 * Princípios inegociáveis:
 * 1. EXATAMENTE 1 inferência Gemini por análise (via ai.interactions.create) tanto para PDF quanto imagem;
 * 2. Preflight HTTP Range (bytes 0-1023) na signed URL do PDF sem baixar o arquivo inteiro;
 * 3. NUNCA chamar ai.models.generateContent no caminho V4;
 * 4. NUNCA habilitar url_context tool;
 * 5. Structured output nativo via response_format + validação Zod no backend;
 * 6. Referências internas por índices inteiros com geração determinística de IDs pelo backend;
 * 7. Higienização determinística de categorias (eliminando repetições de título global e nome de produto);
 * 8. Resiliência: inconsistências parciais de índices não derrubam toda a análise;
 * 9. Validação determinística local abrangente baseada em fatos (SEM regex de severidade);
 * 10. Mapeamento de tokens reais via interaction.usage (quando disponível).
 */

import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';
import {
  buildLabPreprocessorContext,
  buildUnifiedAnalysisPrompt,
  V4_SYSTEM_INSTRUCTION,
  type LabPreprocessorContext,
} from './catalogLabPreprocessor.js';
import { normalizeTextForComparison } from './pdfSemanticService.js';

/* ==========================================================================
   SCHEMAS ZOD - RESPOSTA RAW DA INTERFACE UNIFICADA (ÍNDICES)
   ========================================================================== */

export const unifiedPriceSchema = z.object({
  label: z.string().nullable().optional().default(null),
  amountCents: z.number().int().nonnegative().nullable().optional().default(null),
  prefix: z.string().nullable().optional().default(null),
  unit: z.string().nullable().optional().default(null),
  rawText: z.string().default(''),
});

export const unifiedProductCandidateSchema = z.object({
  name: z.string().trim().min(1, 'Nome do produto candidato não pode ser vazio.'),
  description: z.string().nullable().optional().default(null),
  sourcePages: z.array(z.number().int().min(1)).default([]),
  categoryHint: z.string().nullable().optional().default(null),
  prices: z.array(unifiedPriceSchema).default([]),
  rawEvidence: z.string().nullable().optional().default(null),
});

export const unifiedChoiceOptionSchema = z.object({
  name: z.string().trim().min(1, 'Nome da opção não pode ser vazio.'),
  rawText: z.string().nullable().optional().default(null),
  amountCents: z.number().int().nonnegative().nullable().optional().default(null),
  priceRawText: z.string().nullable().optional().default(null),
});

export const unifiedChoiceGroupSchema = z.object({
  title: z.string().nullable().optional().default(null),
  sourcePages: z.array(z.number().int().min(1)).default([]),
  instruction: z.string().nullable().optional().default(null),
  parentProductHint: z.string().nullable().optional().default(null),
  options: z.array(unifiedChoiceOptionSchema).default([]),
  rawEvidence: z.string().nullable().optional().default(null),
});

export const unifiedRuleBlockSchema = z.object({
  title: z.string().nullable().optional().default(null),
  body: z.string().trim().min(1, 'Corpo da regra não pode ser vazio.'),
  sourcePages: z.array(z.number().int().min(1)).default([]),
  rawEvidence: z.string().nullable().optional().default(null),
});

export const unifiedResidualTextSchema = z.object({
  text: z.string().trim().min(1),
  sourcePage: z.number().int().min(1),
  probableRole: z.string().nullable().optional().default(null),
});

export const unifiedCatalogProductSchema = z.object({
  sourceProductIndexes: z.array(z.number().int()).default([]),
  kind: z.enum(['product', 'combo']).default('product'),
  pricingModel: z
    .enum(['single', 'quantity_tiers', 'size_variants', 'multiple_prices', 'unknown'])
    .default('single'),
  name: z.string().trim().min(1, 'Nome do produto não pode ser vazio.'),
  description: z.string().nullable().optional().default(null),
  categoryName: z.string().nullable().optional().default(null),
  prices: z.array(unifiedPriceSchema).default([]),
  sourcePages: z.array(z.number().int().min(1)).default([]),
  relatedPages: z.array(z.number().int().min(1)).default([]),
});

export const unifiedCatalogGroupOptionSchema = z.object({
  sourceChoiceGroupIndex: z.number().int().nullable().optional().default(null),
  sourceOptionIndex: z.number().int().nullable().optional().default(null),
  name: z.string().trim().min(1, 'Nome da opção não pode ser vazio.'),
  amountCents: z.number().int().nonnegative().nullable().optional().default(null),
  rawPrice: z.string().nullable().optional().default(null),
  semanticKind: z.enum(['option', 'variant', 'addon']).default('option'),
});

export const unifiedCatalogGroupSchema = z.object({
  parentProductIndex: z.number().int().nullable().optional().default(null),
  sourceChoiceGroupIndexes: z.array(z.number().int()).default([]),
  name: z.string().trim().min(1, 'Nome do grupo não pode ser vazio.'),
  kind: z.enum(['option_group', 'variant_group', 'addon_group', 'unknown']).default('option_group'),
  pricingBehavior: z
    .enum(['inherits_parent', 'own_price_per_item', 'mixed', 'no_price', 'unknown'])
    .default('own_price_per_item'),
  selectionMode: z.enum(['single', 'multiple', 'quantity', 'unknown']).default('single'),
  required: z.boolean().default(false),
  minimum: z.number().int().min(0).default(0),
  maximum: z.number().int().min(1).default(1),
  options: z.array(unifiedCatalogGroupOptionSchema).default([]),
});

export const unifiedCatalogBusinessRuleSchema = z.object({
  sourceRuleIndex: z.number().int().nullable().optional().default(null),
  type: z
    .enum([
      'minimum_order',
      'advance_notice',
      'serving_guidance',
      'packaging',
      'customer_supplied_material',
      'product_specification',
      'ordering_instruction',
      'delivery',
      'payment',
      'other',
    ])
    .default('other'),
  rawText: z.string().trim().min(1, 'Texto da regra não pode ser vazio.'),
  sourcePage: z.number().int().min(1).nullable().optional().default(null),
  parentProductIndex: z.number().int().nullable().optional().default(null),
  groupIndex: z.number().int().nullable().optional().default(null),
});

export const unifiedPhotoSchema = z.object({
  productIndex: z.number().int(),
  pageNumber: z.number().int().min(1).nullable().optional().default(null),
  photoBox: z
    .tuple([
      z.number().int().min(0).max(1000),
      z.number().int().min(0).max(1000),
      z.number().int().min(0).max(1000),
      z.number().int().min(0).max(1000),
    ])
    .nullable()
    .optional()
    .default(null),
  photoRelation: z.enum(['direct', 'shared', 'ambiguous', 'none']).default('none'),
  photoWarning: z.string().nullable().optional().default(null),
});

export const unifiedReviewFlagSchema = z.object({
  severity: z.enum(['high', 'medium', 'low']).default('medium'),
  type: z.string().default('other'),
  sourcePage: z.number().int().min(1).nullable().optional().default(null),
  productIndex: z.number().int().nullable().optional().default(null),
  groupIndex: z.number().int().nullable().optional().default(null),
  message: z.string().trim().min(1),
  evidence: z.string().nullable().optional().default(null),
});

export const catalogLabUnifiedRawAnalysisSchema = z.object({
  isMenu: z.boolean(),
  document: z
    .object({
      sourceType: z.enum(['pdf', 'image']).nullable().optional().default('pdf'),
      globalTitle: z.string().nullable().optional().default(null),
      globalTitleRole: z
        .enum(['document_title', 'brand', 'commercial_category', 'unknown'])
        .default('unknown'),
      pageCoverage: z
        .array(
          z.object({
            pageNumber: z.number().int().min(1),
            role: z.string().default('catalog'),
            hasCatalogEvidence: z.boolean().default(true),
            notes: z.string().nullable().optional().default(null),
          })
        )
        .default([]),
      sections: z
        .array(
          z.object({
            name: z.string(),
            role: z
              .enum([
                'document_title',
                'category',
                'product_family',
                'choice_group',
                'rules',
                'marketing',
                'contact',
                'other',
              ])
              .default('category'),
            sourcePages: z.array(z.number().int().min(1)).default([]),
          })
        )
        .default([]),
    })
    .default({
      sourceType: 'image',
      globalTitle: null,
      globalTitleRole: 'unknown',
      pageCoverage: [],
      sections: [],
    }),
  evidence: z
    .object({
      productCandidates: z.array(unifiedProductCandidateSchema).default([]),
      choiceGroups: z.array(unifiedChoiceGroupSchema).default([]),
      ruleBlocks: z.array(unifiedRuleBlockSchema).default([]),
      residualTexts: z.array(unifiedResidualTextSchema).default([]),
    })
    .default({
      productCandidates: [],
      choiceGroups: [],
      ruleBlocks: [],
      residualTexts: [],
    }),
  catalog: z
    .object({
      products: z.array(unifiedCatalogProductSchema).default([]),
      groups: z.array(unifiedCatalogGroupSchema).default([]),
      businessRules: z.array(unifiedCatalogBusinessRuleSchema).default([]),
    })
    .default({
      products: [],
      groups: [],
      businessRules: [],
    }),
  photos: z.array(unifiedPhotoSchema).default([]),
  reviewFlags: z.array(unifiedReviewFlagSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export type CatalogLabUnifiedRawAnalysis = z.infer<typeof catalogLabUnifiedRawAnalysisSchema>;

/* ==========================================================================
   CONTRATO NORMALIZADO FINAL (COM IDENTIFICADORES DETERMINÍSTICOS)
   ========================================================================== */

export interface NormalizedUnifiedProduct extends z.infer<typeof unifiedCatalogProductSchema> {
  productKey: string;
}

export interface NormalizedUnifiedGroupOption
  extends z.infer<typeof unifiedCatalogGroupOptionSchema> {
  optionKey: string;
}

export interface NormalizedUnifiedGroup
  extends Omit<z.infer<typeof unifiedCatalogGroupSchema>, 'options'> {
  groupKey: string;
  parentProductKey: string | null;
  options: NormalizedUnifiedGroupOption[];
}

export interface NormalizedUnifiedBusinessRule
  extends z.infer<typeof unifiedCatalogBusinessRuleSchema> {
  ruleKey: string;
  parentProductKey: string | null;
  groupKey: string | null;
}

export interface NormalizedUnifiedPhoto extends z.infer<typeof unifiedPhotoSchema> {
  productKey: string;
}

export interface NormalizedUnifiedProductCandidate
  extends z.infer<typeof unifiedProductCandidateSchema> {
  candidateKey: string;
}

export interface NormalizedUnifiedChoiceOption
  extends z.infer<typeof unifiedChoiceOptionSchema> {
  optionKey: string;
}

export interface NormalizedUnifiedChoiceGroup
  extends Omit<z.infer<typeof unifiedChoiceGroupSchema>, 'options'> {
  groupKey: string;
  options: NormalizedUnifiedChoiceOption[];
}

export interface NormalizedUnifiedRuleBlock extends z.infer<typeof unifiedRuleBlockSchema> {
  ruleKey: string;
}

export interface NormalizedUnifiedSection {
  headingKey: string;
  name: string;
  role: string;
  sourcePages: number[];
}

export interface NormalizedCatalogLabAnalysis {
  isMenu: boolean;
  document: {
    sourceType: 'pdf' | 'image';
    globalTitle: string | null;
    globalTitleRole: 'document_title' | 'brand' | 'commercial_category' | 'unknown';
    pageCoverage: Array<{
      pageNumber: number;
      role: string;
      hasCatalogEvidence: boolean;
      notes?: string | null;
    }>;
    sections: NormalizedUnifiedSection[];
  };
  evidence: {
    productCandidates: NormalizedUnifiedProductCandidate[];
    choiceGroups: NormalizedUnifiedChoiceGroup[];
    ruleBlocks: NormalizedUnifiedRuleBlock[];
    residualTexts: z.infer<typeof unifiedResidualTextSchema>[];
  };
  catalog: {
    products: NormalizedUnifiedProduct[];
    groups: NormalizedUnifiedGroup[];
    businessRules: NormalizedUnifiedBusinessRule[];
  };
  photos: NormalizedUnifiedPhoto[];
  reviewFlags: z.infer<typeof unifiedReviewFlagSchema>[];
  warnings: string[];
}

export interface UnifiedValidationIssue {
  severity: 'high' | 'medium' | 'low';
  type: string;
  sourcePage?: number | null;
  relatedItemKey?: string | null;
  relatedGroupKey?: string | null;
  message: string;
  evidence?: string | null;
  origin: 'deterministic' | 'gemini';
}

export interface CatalogLabV4Response {
  success: true;
  pipeline: 'v4_unified';
  model: string;
  modelRequestCount: 1;
  inputTransport: 'signed_url' | 'inline';
  executionTimeMs: number;
  inferenceTimeMs: number;
  data: NormalizedCatalogLabAnalysis;
  localIssues: UnifiedValidationIssue[];
  reviewFlags: z.infer<typeof unifiedReviewFlagSchema>[];
  rawJson: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null;
  warnings: string[];
}

/* ==========================================================================
   JSON SCHEMA PARA GOOGLE GENAI INTERACTIONS API
   ========================================================================== */

export const catalogLabUnifiedJsonSchema = {
  type: 'object',
  properties: {
    isMenu: {
      type: 'boolean',
      description: 'true se for um cardápio legível de alimentos/bebidas; false se não for.',
    },
    document: {
      type: 'object',
      properties: {
        sourceType: {
          type: 'string',
          enum: ['pdf', 'image'],
        },
        globalTitle: {
          type: 'string',
          nullable: true,
          description: 'Título geral ou cabeçalho de capa do documento (ex: "Catálogo de Encomendas").',
        },
        globalTitleRole: {
          type: 'string',
          enum: ['document_title', 'brand', 'commercial_category', 'unknown'],
          description: 'Papel do título geral. "document_title" e "brand" NÃO são categorias de produtos.',
        },
        pageCoverage: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pageNumber: { type: 'integer' },
              role: { type: 'string' },
              hasCatalogEvidence: { type: 'boolean' },
              notes: { type: 'string', nullable: true },
            },
            required: ['pageNumber', 'role', 'hasCatalogEvidence'],
          },
        },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              role: {
                type: 'string',
                enum: ['document_title', 'category', 'product_family', 'choice_group', 'rules', 'marketing', 'contact', 'other'],
              },
              sourcePages: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
            required: ['name', 'role', 'sourcePages'],
          },
        },
      },
      required: ['sourceType', 'globalTitleRole', 'pageCoverage', 'sections'],
    },
    evidence: {
      type: 'object',
      properties: {
        productCandidates: {
          type: 'array',
          description: 'Evidências brutas de produtos comerciais identificados.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              sourcePages: { type: 'array', items: { type: 'integer' } },
              categoryHint: { type: 'string', nullable: true },
              prices: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', nullable: true },
                    amountCents: { type: 'integer', nullable: true },
                    prefix: { type: 'string', nullable: true },
                    unit: { type: 'string', nullable: true },
                    rawText: { type: 'string' },
                  },
                  required: ['rawText'],
                },
              },
              rawEvidence: { type: 'string', nullable: true },
            },
            required: ['name', 'sourcePages', 'prices'],
          },
        },
        choiceGroups: {
          type: 'array',
          description: 'Listas de opções/escolhas/sabores/massas/adicionais encontradas.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', nullable: true },
              sourcePages: { type: 'array', items: { type: 'integer' } },
              instruction: { type: 'string', nullable: true },
              parentProductHint: { type: 'string', nullable: true },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    rawText: { type: 'string', nullable: true },
                    amountCents: { type: 'integer', nullable: true },
                    priceRawText: { type: 'string', nullable: true },
                  },
                  required: ['name'],
                },
              },
              rawEvidence: { type: 'string', nullable: true },
            },
            required: ['sourcePages', 'options'],
          },
        },
        ruleBlocks: {
          type: 'array',
          description: 'Blocos de regras operacionais/comerciais com texto completo.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', nullable: true },
              body: { type: 'string' },
              sourcePages: { type: 'array', items: { type: 'integer' } },
              rawEvidence: { type: 'string', nullable: true },
            },
            required: ['body', 'sourcePages'],
          },
        },
        residualTexts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sourcePage: { type: 'integer' },
              probableRole: { type: 'string', nullable: true },
            },
            required: ['text', 'sourcePage'],
          },
        },
      },
      required: ['productCandidates', 'choiceGroups', 'ruleBlocks', 'residualTexts'],
    },
    catalog: {
      type: 'object',
      properties: {
        products: {
          type: 'array',
          description: 'Produtos comerciais autônomos. Variações de tamanho/peso consolidadas em prices.',
          items: {
            type: 'object',
            properties: {
              sourceProductIndexes: {
                type: 'array',
                items: { type: 'integer' },
                description: 'Índices 0-based dos itens correspondentes em evidence.productCandidates.',
              },
              kind: { type: 'string', enum: ['product', 'combo'] },
              pricingModel: {
                type: 'string',
                enum: ['single', 'quantity_tiers', 'size_variants', 'multiple_prices', 'unknown'],
              },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              categoryName: {
                type: 'string',
                nullable: true,
                description: 'Nome da categoria comercial específica (ou null se não houver ou for igual ao título global).',
              },
              prices: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', nullable: true },
                    amountCents: { type: 'integer', nullable: true },
                    prefix: { type: 'string', nullable: true },
                    unit: { type: 'string', nullable: true },
                    rawText: { type: 'string' },
                  },
                  required: ['rawText'],
                },
              },
              sourcePages: { type: 'array', items: { type: 'integer' } },
              relatedPages: { type: 'array', items: { type: 'integer' } },
            },
            required: ['sourceProductIndexes', 'kind', 'name', 'prices', 'sourcePages', 'relatedPages'],
          },
        },
        groups: {
          type: 'array',
          description: 'Grupos de escolhas/complementos associados aos produtos.',
          items: {
            type: 'object',
            properties: {
              parentProductIndex: {
                type: 'integer',
                nullable: true,
                description: 'Índice 0-based em catalog.products.',
              },
              sourceChoiceGroupIndexes: {
                type: 'array',
                items: { type: 'integer' },
                description: 'Índices 0-based em evidence.choiceGroups.',
              },
              name: { type: 'string' },
              kind: {
                type: 'string',
                enum: ['option_group', 'variant_group', 'addon_group', 'unknown'],
              },
              pricingBehavior: {
                type: 'string',
                enum: ['inherits_parent', 'own_price_per_item', 'mixed', 'no_price', 'unknown'],
              },
              selectionMode: {
                type: 'string',
                enum: ['single', 'multiple', 'quantity', 'unknown'],
              },
              required: { type: 'boolean' },
              minimum: { type: 'integer' },
              maximum: { type: 'integer' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    sourceChoiceGroupIndex: { type: 'integer', nullable: true },
                    sourceOptionIndex: { type: 'integer', nullable: true },
                    name: { type: 'string' },
                    amountCents: { type: 'integer', nullable: true },
                    rawPrice: { type: 'string', nullable: true },
                    semanticKind: { type: 'string', enum: ['option', 'variant', 'addon'] },
                  },
                  required: ['name', 'semanticKind'],
                },
              },
            },
            required: [
              'sourceChoiceGroupIndexes',
              'name',
              'kind',
              'pricingBehavior',
              'required',
              'minimum',
              'maximum',
              'options',
            ],
          },
        },
        businessRules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sourceRuleIndex: {
                type: 'integer',
                nullable: true,
                description: 'Índice 0-based em evidence.ruleBlocks.',
              },
              type: {
                type: 'string',
                enum: [
                  'minimum_order',
                  'advance_notice',
                  'serving_guidance',
                  'packaging',
                  'customer_supplied_material',
                  'product_specification',
                  'ordering_instruction',
                  'delivery',
                  'payment',
                  'other',
                ],
              },
              rawText: { type: 'string' },
              sourcePage: { type: 'integer', nullable: true },
              parentProductIndex: { type: 'integer', nullable: true },
              groupIndex: { type: 'integer', nullable: true },
            },
            required: ['type', 'rawText'],
          },
        },
      },
      required: ['products', 'groups', 'businessRules'],
    },
    photos: {
      type: 'array',
      description: 'Avaliação de fotografia EXCLUSIVA para cada item em catalog.products (1 para 1).',
      items: {
        type: 'object',
        properties: {
          productIndex: { type: 'integer' },
          pageNumber: { type: 'integer', nullable: true },
          photoBox: {
            type: 'array',
            nullable: true,
            items: { type: 'integer' },
            description: '[ymin, xmin, ymax, xmax] normalizado 0 a 1000.',
          },
          photoRelation: {
            type: 'string',
            enum: ['direct', 'shared', 'ambiguous', 'none'],
          },
          photoWarning: { type: 'string', nullable: true },
        },
        required: ['productIndex', 'photoRelation'],
      },
    },
    reviewFlags: {
      type: 'array',
      description: 'Sinais de incerteza, ambiguidade ou regras fora do domínio percebidas durante a leitura.',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          type: {
            type: 'string',
            enum: [
              'ambiguous_structure',
              'unsupported_domain_rule',
              'uncertain_price',
              'uncertain_category',
              'uncertain_photo',
              'possible_noise',
              'other',
            ],
          },
          sourcePage: { type: 'integer', nullable: true },
          productIndex: { type: 'integer', nullable: true },
          groupIndex: { type: 'integer', nullable: true },
          message: { type: 'string' },
          evidence: { type: 'string', nullable: true },
        },
        required: ['severity', 'type', 'message'],
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['isMenu', 'document', 'evidence', 'catalog', 'photos', 'reviewFlags', 'warnings'],
};

/* ==========================================================================
   PREFLIGHT HTTP RANGE DO PDF (SEM DOWNLOAD INTEGRAL)
   ========================================================================== */

export async function preflightPdfSignedUrl(
  signedUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<{
  isValidPdf: boolean;
  contentLength?: number;
  detectedSizeBytes?: number;
  headerSnippet?: string;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetchFn(signedUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok && response.status !== 206) {
      throw new HttpError(
        422,
        `Falha ao validar o arquivo no storage (status HTTP ${response.status}).`,
        'PDF_PREFLIGHT_FAILED'
      );
    }

    const contentRange = response.headers.get('content-range');
    const clHeader = response.headers.get('content-length');
    let detectedSizeBytes: number | undefined;
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/);
      if (match) detectedSizeBytes = parseInt(match[1], 10);
    } else if (clHeader) {
      detectedSizeBytes = parseInt(clHeader, 10);
    }

    if (detectedSizeBytes && detectedSizeBytes > 20 * 1024 * 1024) {
      throw new HttpError(
        413,
        `O arquivo PDF excede o limite máximo permitido de 20 MB (tamanho detectado: ${Math.round(
          detectedSizeBytes / (1024 * 1024)
        )} MB).`,
        'PAYLOAD_TOO_LARGE'
      );
    }

    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length === 0) {
      throw new HttpError(
        422,
        'O arquivo PDF temporário no storage está vazio.',
        'PDF_PREFLIGHT_FAILED'
      );
    }

    const rawSnippet = buffer.subarray(0, 1024).toString('latin1');
    const pdfMatch = rawSnippet.match(/(%PDF-\d+\.\d+)/);
    if (!pdfMatch) {
      throw new HttpError(
        422,
        'O arquivo enviado não possui assinatura válida de documento PDF (%PDF-).',
        'PDF_PREFLIGHT_FAILED'
      );
    }

    return {
      isValidPdf: true,
      headerSnippet: pdfMatch[1],
      contentLength: detectedSizeBytes,
      detectedSizeBytes,
    };
  } catch (err: any) {
    if (err instanceof HttpError) throw err;
    const rawMessage = String(err?.message || 'Erro de rede ao validar o arquivo no storage.');
    const sanitized = rawMessage.replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
    throw new HttpError(422, sanitized, 'PDF_PREFLIGHT_FAILED');
  }
}

/* ==========================================================================
   NORMALIZAÇÃO DETERMINÍSTICA DE IDS E HIGIENIZAÇÃO DE CATEGORIAS
   ========================================================================== */

export function normalizeUnifiedData(
  raw: CatalogLabUnifiedRawAnalysis
): {
  normalizedData: NormalizedCatalogLabAnalysis;
  localIssues: UnifiedValidationIssue[];
} {
  const localIssues: UnifiedValidationIssue[] = [];

  const rawProducts = raw.catalog.products || [];
  const rawCandidates = raw.evidence.productCandidates || [];
  const rawChoiceGroups = raw.evidence.choiceGroups || [];
  const rawRuleBlocks = raw.evidence.ruleBlocks || [];
  const globalTitle = raw.document.globalTitle || null;
  const isGlobalDocumentTitleOrBrand =
    raw.document.globalTitleRole === 'document_title' ||
    raw.document.globalTitleRole === 'brand';

  // 1. Normalização de Seções
  const normalizedSections: NormalizedUnifiedSection[] = (raw.document.sections || []).map(
    (sec, idx) => ({
      headingKey: `sh${idx}`,
      name: sec.name,
      role: sec.role,
      sourcePages: sec.sourcePages,
    })
  );

  // 2. Normalização de Candidatos de Evidência
  const normalizedCandidates: NormalizedUnifiedProductCandidate[] = rawCandidates.map(
    (c, idx) => ({
      ...c,
      candidateKey: `ep${idx}`,
    })
  );

  // 3. Normalização de Choice Groups de Evidência
  const normalizedChoiceGroups: NormalizedUnifiedChoiceGroup[] = rawChoiceGroups.map(
    (cg, gIdx) => ({
      ...cg,
      groupKey: `eg${gIdx}`,
      options: (cg.options || []).map((opt, oIdx) => ({
        ...opt,
        optionKey: `eg${gIdx}-o${oIdx}`,
      })),
    })
  );

  // 4. Normalização de Rule Blocks de Evidência
  const normalizedRuleBlocks: NormalizedUnifiedRuleBlock[] = rawRuleBlocks.map(
    (rb, idx) => ({
      ...rb,
      ruleKey: `er${idx}`,
    })
  );

  // 5. Normalização de Produtos do Catálogo
  const normalizedProducts: NormalizedUnifiedProduct[] = rawProducts.map((p, pIdx) => {
    const productKey = `p${pIdx}`;

    // Validação resiliente de sourceProductIndexes
    const validSourceIndexes: number[] = [];
    for (const sIdx of p.sourceProductIndexes || []) {
      if (Number.isInteger(sIdx) && sIdx >= 0 && sIdx < rawCandidates.length) {
        validSourceIndexes.push(sIdx);
      } else {
        localIssues.push({
          severity: 'high',
          type: 'invalid_index_recovered',
          relatedItemKey: productKey,
          message: `Produto "${p.name}" referenciou sourceProductIndex inválido (${sIdx}) fora do intervalo (0 a ${rawCandidates.length - 1}).`,
          evidence: String(sIdx),
          origin: 'deterministic',
        });
      }
    }

    // Higienização determinística de categoria:
    // - se idêntica ao título global (quando document_title ou brand) -> null
    // - se idêntica ao nome do produto -> null
    let categoryName = p.categoryName;
    if (categoryName) {
      const normCat = normalizeTextForComparison(categoryName);
      if (isGlobalDocumentTitleOrBrand && globalTitle && normCat === normalizeTextForComparison(globalTitle)) {
        categoryName = null;
      } else if (normCat === normalizeTextForComparison(p.name)) {
        categoryName = null;
      }
    }

    return {
      ...p,
      productKey,
      sourceProductIndexes: validSourceIndexes,
      categoryName,
    };
  });

  // 6. Normalização de Grupos de Complementos do Catálogo
  const normalizedGroups: NormalizedUnifiedGroup[] = (raw.catalog.groups || []).map((g, gIdx) => {
    const groupKey = `g${gIdx}`;

    // Validação resiliente de parentProductIndex
    let parentProductKey: string | null = null;
    let parentProductIndex = g.parentProductIndex;
    if (typeof parentProductIndex === 'number') {
      if (
        Number.isInteger(parentProductIndex) &&
        parentProductIndex >= 0 &&
        parentProductIndex < normalizedProducts.length
      ) {
        parentProductKey = normalizedProducts[parentProductIndex].productKey;
      } else {
        localIssues.push({
          severity: 'high',
          type: 'invalid_index_recovered',
          relatedGroupKey: groupKey,
          message: `Grupo "${g.name}" referenciou parentProductIndex inválido (${parentProductIndex}) fora do intervalo (0 a ${normalizedProducts.length - 1}).`,
          evidence: String(parentProductIndex),
          origin: 'deterministic',
        });
        parentProductIndex = null;
      }
    }

    // Validação resiliente de sourceChoiceGroupIndexes
    const validChoiceGroupIndexes: number[] = [];
    for (const scgIdx of g.sourceChoiceGroupIndexes || []) {
      if (Number.isInteger(scgIdx) && scgIdx >= 0 && scgIdx < rawChoiceGroups.length) {
        validChoiceGroupIndexes.push(scgIdx);
      } else {
        localIssues.push({
          severity: 'high',
          type: 'invalid_index_recovered',
          relatedGroupKey: groupKey,
          message: `Grupo "${g.name}" referenciou sourceChoiceGroupIndex inválido (${scgIdx}) fora do intervalo (0 a ${rawChoiceGroups.length - 1}).`,
          evidence: String(scgIdx),
          origin: 'deterministic',
        });
      }
    }

    // Normalização das opções do grupo
    const options: NormalizedUnifiedGroupOption[] = (g.options || []).map((opt, oIdx) => ({
      ...opt,
      optionKey: `${groupKey}-o${oIdx}`,
    }));

    return {
      ...g,
      groupKey,
      parentProductIndex,
      parentProductKey,
      sourceChoiceGroupIndexes: validChoiceGroupIndexes,
      options,
    };
  });

  // 7. Normalização de Regras de Negócio do Catálogo
  const normalizedBusinessRules: NormalizedUnifiedBusinessRule[] = (
    raw.catalog.businessRules || []
  ).map((br, rIdx) => {
    const ruleKey = `r${rIdx}`;

    let sourceRuleIndex = br.sourceRuleIndex;
    if (typeof sourceRuleIndex === 'number') {
      if (
        !Number.isInteger(sourceRuleIndex) ||
        sourceRuleIndex < 0 ||
        sourceRuleIndex >= rawRuleBlocks.length
      ) {
        localIssues.push({
          severity: 'high',
          type: 'invalid_index_recovered',
          message: `Regra de negócio "${br.type}" referenciou sourceRuleIndex inválido (${sourceRuleIndex}) fora do intervalo (0 a ${rawRuleBlocks.length - 1}).`,
          evidence: String(sourceRuleIndex),
          origin: 'deterministic',
        });
        sourceRuleIndex = null;
      }
    }

    let parentProductKey: string | null = null;
    if (
      typeof br.parentProductIndex === 'number' &&
      Number.isInteger(br.parentProductIndex) &&
      br.parentProductIndex >= 0 &&
      br.parentProductIndex < normalizedProducts.length
    ) {
      parentProductKey = normalizedProducts[br.parentProductIndex].productKey;
    }

    let groupKey: string | null = null;
    if (
      typeof br.groupIndex === 'number' &&
      Number.isInteger(br.groupIndex) &&
      br.groupIndex >= 0 &&
      br.groupIndex < normalizedGroups.length
    ) {
      groupKey = normalizedGroups[br.groupIndex].groupKey;
    }

    return {
      ...br,
      ruleKey,
      sourceRuleIndex,
      parentProductKey,
      groupKey,
    };
  });

  // 8. Normalização de Fotos (1 registro para cada produto)
  const normalizedPhotos: NormalizedUnifiedPhoto[] = (raw.photos || [])
    .map((photo) => {
      const pIdx = photo.productIndex;
      if (
        !Number.isInteger(pIdx) ||
        pIdx < 0 ||
        pIdx >= normalizedProducts.length
      ) {
        localIssues.push({
          severity: 'high',
          type: 'invalid_index_recovered',
          message: `Avaliação de photo com productIndex inválido (${pIdx}) fora do intervalo (0 a ${normalizedProducts.length - 1}).`,
          evidence: String(pIdx),
          origin: 'deterministic',
        });
        return null;
      }

      return {
        ...photo,
        productKey: normalizedProducts[pIdx].productKey,
      };
    })
    .filter((p): p is NormalizedUnifiedPhoto => p !== null);

  const normalizedData: NormalizedCatalogLabAnalysis = {
    isMenu: raw.isMenu,
    document: {
      sourceType: raw.document.sourceType || 'pdf',
      globalTitle,
      globalTitleRole: raw.document.globalTitleRole,
      pageCoverage: raw.document.pageCoverage || [],
      sections: normalizedSections,
    },
    evidence: {
      productCandidates: normalizedCandidates,
      choiceGroups: normalizedChoiceGroups,
      ruleBlocks: normalizedRuleBlocks,
      residualTexts: raw.evidence.residualTexts || [],
    },
    catalog: {
      products: normalizedProducts,
      groups: normalizedGroups,
      businessRules: normalizedBusinessRules,
    },
    photos: normalizedPhotos,
    reviewFlags: raw.reviewFlags || [],
    warnings: raw.warnings || [],
  };

  return { normalizedData, localIssues };
}

/* ==========================================================================
   VALIDAÇÃO DETERMINÍSTICA LOCAL V4 (FATOS E INVARIANTES)
   ========================================================================== */

export function validateUnifiedAnalysis(
  data: NormalizedCatalogLabAnalysis,
  context?: LabPreprocessorContext
): UnifiedValidationIssue[] {
  const issues: UnifiedValidationIssue[] = [];

  const products = data.catalog.products;
  const groups = data.catalog.groups;
  const businessRules = data.catalog.businessRules;
  const candidates = data.evidence.productCandidates;
  const choiceGroups = data.evidence.choiceGroups;
  const ruleBlocks = data.evidence.ruleBlocks;
  const photos = data.photos;
  const reviewFlags = data.reviewFlags;

  // A) Cobertura de Product Candidates
  // Todo candidato deve alimentar pelo menos 1 produto ou estar em reviewFlags
  const usedCandidateIndexes = new Set<number>();
  for (const prod of products) {
    for (const idx of prod.sourceProductIndexes) {
      usedCandidateIndexes.add(idx);
    }
  }
  const flaggedProductIndexes = new Set<number>();
  for (const rf of reviewFlags) {
    if (typeof rf.productIndex === 'number') {
      flaggedProductIndexes.add(rf.productIndex);
    }
  }

  candidates.forEach((cand, cIdx) => {
    if (!usedCandidateIndexes.has(cIdx) && !flaggedProductIndexes.has(cIdx)) {
      issues.push({
        severity: 'high',
        type: 'missing_product',
        sourcePage: cand.sourcePages[0] ?? null,
        relatedItemKey: cand.candidateKey,
        message: `O candidato de produto "${cand.name}" identificado na evidência não foi vinculado a nenhum produto comercial no catálogo.`,
        evidence: cand.name,
        origin: 'deterministic',
      });
    }
  });

  // Verificação de produtos comerciais sem preço cadastrado
  for (const prod of products) {
    if ((!prod.prices || prod.prices.length === 0) && prod.kind === 'product') {
      issues.push({
        severity: 'medium',
        type: 'missing_price',
        relatedItemKey: prod.productKey,
        sourcePage: prod.sourcePages[0] ?? null,
        message: `O produto "${prod.name}" não possui nenhum preço cadastrado no catálogo.`,
        evidence: prod.name,
        origin: 'deterministic',
      });
    }
  }

  // B) Cobertura de Choice Groups
  // Todo choiceGroup de evidence deve alimentar algum group do catálogo ou ter reviewFlag
  const usedChoiceGroupIndexes = new Set<number>();
  for (const grp of groups) {
    for (const idx of grp.sourceChoiceGroupIndexes) {
      usedChoiceGroupIndexes.add(idx);
    }
  }
  const flaggedGroupIndexes = new Set<number>();
  for (const rf of reviewFlags) {
    if (typeof rf.groupIndex === 'number') {
      flaggedGroupIndexes.add(rf.groupIndex);
    }
  }

  choiceGroups.forEach((cg, gIdx) => {
    if (!usedChoiceGroupIndexes.has(gIdx) && !flaggedGroupIndexes.has(gIdx)) {
      issues.push({
        severity: 'high',
        type: 'missing_choice_group',
        sourcePage: cg.sourcePages[0] ?? null,
        relatedGroupKey: cg.groupKey,
        message: `O grupo de escolhas "${cg.title || cg.groupKey}" (${cg.options.length} opções) identificado na evidência não foi vinculado a nenhum grupo de complementos no catálogo.`,
        evidence: cg.title || cg.groupKey,
        origin: 'deterministic',
      });
    }
  });

  // C) Cobertura de Opções em Choice Groups mapeados
  for (const grp of groups) {
    for (const scgIdx of grp.sourceChoiceGroupIndexes) {
      const cg = choiceGroups[scgIdx];
      if (!cg) continue;

      const mappedOptionIndexes = new Set<number>();
      for (const opt of grp.options) {
        if (opt.sourceChoiceGroupIndex === scgIdx && typeof opt.sourceOptionIndex === 'number') {
          mappedOptionIndexes.add(opt.sourceOptionIndex);
        }
      }

      cg.options.forEach((opt, oIdx) => {
        if (!mappedOptionIndexes.has(oIdx)) {
          issues.push({
            severity: 'high',
            type: 'missing_option',
            sourcePage: cg.sourcePages[0] ?? null,
            relatedGroupKey: grp.groupKey,
            relatedItemKey: opt.optionKey,
            message: `A opção "${opt.name}" do grupo de escolhas "${cg.title || cg.groupKey}" não foi incluída no grupo de complementos "${grp.name}".`,
            evidence: opt.name,
            origin: 'deterministic',
          });
        }
      });
    }
  }

  // D) Cobertura de Rule Blocks
  // Todo ruleBlock deve alimentar uma businessRule ou ter reviewFlag correspondente
  const usedRuleIndexes = new Set<number>();
  for (const br of businessRules) {
    if (typeof br.sourceRuleIndex === 'number') {
      usedRuleIndexes.add(br.sourceRuleIndex);
    }
  }

  ruleBlocks.forEach((rb, rIdx) => {
    if (!usedRuleIndexes.has(rIdx)) {
      issues.push({
        severity: 'medium', // SEM REGEX: MEDIUM POR PADRÃO CONFORME ESPECIFICADO
        type: 'missing_rule',
        sourcePage: rb.sourcePages[0] ?? null,
        message: `O bloco de regra "${rb.title || rb.ruleKey}" não foi vinculado a nenhuma regra de negócio no catálogo.`,
        evidence: rb.body.length > 140 ? `${rb.body.slice(0, 137)}...` : rb.body,
        origin: 'deterministic',
      });
    }
  });

  // E) Invariantes de Grupo: minimum <= maximum
  for (const grp of groups) {
    if (grp.minimum > grp.maximum) {
      issues.push({
        severity: 'high',
        type: 'invalid_group_limits',
        relatedGroupKey: grp.groupKey,
        message: `O grupo "${grp.name}" possui mínimo (${grp.minimum}) superior ao máximo (${grp.maximum}).`,
        evidence: `min: ${grp.minimum}, max: ${grp.maximum}`,
        origin: 'deterministic',
      });
    }
  }

  // F) Fotos: Exatamente 1 avaliação por produto/combo e coerência com relatedPages
  if (products.length > 0 && photos.length !== products.length) {
    issues.push({
      severity: 'high',
      type: 'photo_evaluation_count_mismatch',
      message: `Divergência na avaliação de fotos: existem ${products.length} produtos comerciais, mas foram retornadas ${photos.length} avaliações fotográficas.`,
      evidence: `products: ${products.length}, photos: ${photos.length}`,
      origin: 'deterministic',
    });
  }

  const evaluatedProductIndexes = new Set<number>();
  for (const photo of photos) {
    evaluatedProductIndexes.add(photo.productIndex);

    const prod = products[photo.productIndex];
    if (!prod) continue;

    if (photo.photoRelation !== 'none') {
      if (!photo.photoBox) {
        issues.push({
          severity: 'medium',
          type: 'photo_box_missing',
          relatedItemKey: prod.productKey,
          message: `O produto "${prod.name}" possui foto indicada (${photo.photoRelation}), mas photoBox é nulo.`,
          evidence: photo.photoRelation,
          origin: 'deterministic',
        });
      } else {
        const [ymin, xmin, ymax, xmax] = photo.photoBox;
        if (ymin >= ymax || xmin >= xmax || ymin < 0 || ymax > 1000 || xmin < 0 || xmax > 1000) {
          issues.push({
            severity: 'high',
            type: 'invalid_photo_box_coordinates',
            relatedItemKey: prod.productKey,
            message: `Coordenadas inválidas de photoBox para o produto "${prod.name}": [${photo.photoBox.join(', ')}].`,
            evidence: photo.photoBox.join(', '),
            origin: 'deterministic',
          });
        }
      }

      // Coerência com relatedPages
      if (photo.pageNumber !== null && photo.pageNumber !== undefined) {
        const allowedPages = new Set([...(prod.sourcePages || []), ...(prod.relatedPages || [])]);
        if (allowedPages.size > 0 && !allowedPages.has(photo.pageNumber)) {
          issues.push({
            severity: 'medium',
            type: 'photo_page_coherence_warning',
            sourcePage: photo.pageNumber,
            relatedItemKey: prod.productKey,
            message: `A foto do produto "${prod.name}" foi associada à página ${photo.pageNumber}, mas as páginas do produto são [${Array.from(allowedPages).join(', ')}].`,
            evidence: `página ${photo.pageNumber}`,
            origin: 'deterministic',
          });
        }
      }
    } else {
      if (photo.photoBox !== null) {
        issues.push({
          severity: 'medium',
          type: 'photo_none_box_conflict',
          relatedItemKey: prod.productKey,
          message: `O produto "${prod.name}" tem photoRelation "none", mas photoBox não está nulo.`,
          evidence: 'photoRelation: none',
          origin: 'deterministic',
        });
      }
    }
  }

  // G) Cobertura de Páginas quando pageCountKnown está presente
  if (context?.pageCountKnown && context.pageCountKnown >= 1) {
    const coveredPages = new Set(data.document.pageCoverage.map((p) => p.pageNumber));
    for (let page = 1; page <= context.pageCountKnown; page++) {
      if (!coveredPages.has(page)) {
        issues.push({
          severity: 'high',
          type: 'missing_page_coverage',
          sourcePage: page,
          message: `A página ${page} de ${context.pageCountKnown} não foi listada em pageCoverage.`,
          evidence: `página ${page}`,
          origin: 'deterministic',
        });
      }
    }

    // Coleta todas as páginas com evidências estruturais
    const pagesWithEvidence = new Set<number>();
    data.catalog.products.forEach((p) => p.sourcePages.forEach((pg) => pagesWithEvidence.add(pg)));
    data.catalog.groups.forEach((g) => {
      // Grupos não têm sourcePages direto, mas os choiceGroups candidatos sim
      const choiceGroup = data.evidence.choiceGroups.find((cg) => g.sourceChoiceGroupIndexes.includes(parseInt(cg.groupKey.replace('eg', ''), 10)));
      choiceGroup?.sourcePages.forEach((pg) => pagesWithEvidence.add(pg));
    });
    data.catalog.businessRules.forEach((r) => {
      if (typeof r.sourcePage === 'number') pagesWithEvidence.add(r.sourcePage);
    });

    for (const pc of data.document.pageCoverage) {
      if (pc.hasCatalogEvidence && !pagesWithEvidence.has(pc.pageNumber)) {
        issues.push({
          severity: 'medium',
          type: 'page_evidence_gap',
          sourcePage: pc.pageNumber,
          message: `A página ${pc.pageNumber} foi marcada como contendo evidências de catálogo, mas nenhum produto, grupo ou regra foi extraído dela.`,
          evidence: `página ${pc.pageNumber}`,
          origin: 'deterministic',
        });
      }
    }
  }

  return issues;
}

/* ==========================================================================
   SERVIÇO PRINCIPAL UNIFICADO V4 (1 MODEL REQUEST VIA INTERACTIONS API)
   ========================================================================== */

export interface AnalyzeMenuUnifiedParams {
  sourceType: 'pdf' | 'image';
  tenantId?: string;
  pdfSignedUrl?: string | null;
  signedUrl?: string | null;
  imageBase64?: string | null;
  imageMimeType?: string | null;
  mimeType?: string | null;
  buffer?: Buffer | null;
  fileSize?: number;
  aiClient?: any;
  fetchClient?: typeof fetch;
  pageCountKnown?: number | null;
}

export async function analyzeMenuUnifiedWithGemini(
  params: AnalyzeMenuUnifiedParams
): Promise<CatalogLabV4Response> {
  const globalStartTime = Date.now();
  const apiKey = process.env.GEMINI_API_KEY?.trim() || (params.aiClient ? 'mock-api-key' : '');
  const model = process.env.CATALOG_IMPORT_MODEL?.trim() || 'gemini-2.5-flash';

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

  const sourceType = params.sourceType;
  const signedUrl = params.signedUrl || params.pdfSignedUrl || null;
  let buffer = params.buffer || null;
  if (!buffer && params.imageBase64) {
    buffer = Buffer.from(params.imageBase64, 'base64');
  }
  const mimeType =
    params.mimeType ||
    params.imageMimeType ||
    (sourceType === 'pdf' ? 'application/pdf' : 'image/jpeg');
  const fileSize = params.fileSize || buffer?.length || 0;
  const pageCountKnown = params.pageCountKnown ?? null;

  // 1. Preparo determinístico no pré-processador local (sem OCR, sem IA)
  const preprocessorContext = buildLabPreprocessorContext({
    sourceType,
    mimeType,
    fileSize,
    pageCountKnown,
  });

  const prompt = buildUnifiedAnalysisPrompt(preprocessorContext);

  // 2. Montagem do input para ai.interactions.create
  let inputContent: any[];

  if (sourceType === 'pdf') {
    if (!signedUrl) {
      throw new HttpError(
        400,
        'URL assinada do PDF temporário não fornecida para a análise V4.',
        'MISSING_SIGNED_URL'
      );
    }

    // Preflight HTTP Range (0-1023 bytes) sem download integral
    const preflight = await preflightPdfSignedUrl(signedUrl, params.fetchClient);
    if (!preflight.isValidPdf) {
      throw new HttpError(
        400,
        `Falha na validação prévia do PDF: ${preflight.error || 'Arquivo inválido.'}`,
        'PDF_PREFLIGHT_FAILED'
      );
    }

    inputContent = [
      {
        type: 'document',
        uri: signedUrl,
        mime_type: 'application/pdf',
      },
      {
        type: 'text',
        text: prompt,
      },
    ];
  } else {
    if (!buffer || buffer.length === 0) {
      throw new HttpError(
        400,
        'Buffer da imagem não fornecido para a análise V4.',
        'EMPTY_FILE'
      );
    }

    inputContent = [
      {
        type: 'image',
        data: buffer.toString('base64'),
        mime_type: mimeType,
      },
      {
        type: 'text',
        text: prompt,
      },
    ];
  }

  // 3. EXATAMENTE UMA INFERÊNCIA GEMINI VIA INTERACTIONS API
  const modelStartTime = Date.now();
  let interactionRes: any;

  try {
    const ai = params.aiClient || new GoogleGenAI({ apiKey });
    interactionRes = await ai.interactions.create({
      model,
      input: inputContent,
      system_instruction: V4_SYSTEM_INSTRUCTION,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: catalogLabUnifiedJsonSchema,
      },
    });
  } catch (error: any) {
    if (error instanceof HttpError) throw error;

    const rawMessage = String(error?.message || '');
    const status = error?.status || error?.statusCode;

    const sanitized = rawMessage
      .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
      .replace(/apiKey=[^&\s]+/gi, 'apiKey=[REDACTED]')
      .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');

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
      `Falha na análise unificada com o Gemini: ${sanitized || 'Erro na chamada ao modelo.'}`,
      'GEMINI_SERVICE_ERROR'
    );
  }

  const inferenceTimeMs = Date.now() - modelStartTime;

  // Extração do texto de saída gerado pelo modelo
  const rawText = (
    interactionRes?.output_text ||
    interactionRes?.text ||
    (interactionRes?.steps || [])
      .flatMap((s: any) => s.content || [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('') ||
    ''
  ).trim();

  if (!rawText) {
    throw new HttpError(
      502,
      'O Gemini retornou uma resposta vazia na inferência unificada.',
      'GEMINI_EMPTY_RESPONSE'
    );
  }

  // 4. Parse JSON seguro
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    const truncated = rawText.slice(0, 300);
    throw new HttpError(
      502,
      'A IA não retornou uma resposta estruturada válida (JSON malformado).',
      'INVALID_GEMINI_RESPONSE',
      { rawJsonSnippet: truncated }
    );
  }

  // 5. Validação estrutural de schema Zod (Fatal se a base do JSON for incompatível)
  const parseResult = catalogLabUnifiedRawAnalysisSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    const truncated = rawText.slice(0, 300);
    throw new HttpError(
      502,
      'A IA não retornou uma resposta estruturada válida (schema incompatível).',
      'INVALID_GEMINI_RESPONSE',
      {
        validationIssues: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        rawJsonSnippet: truncated,
      }
    );
  }

  // 6. Normalização determinística de IDs + Resiliência contra referências inválidas
  const { normalizedData, localIssues: normalizationIssues } = normalizeUnifiedData(parseResult.data);

  // 7. Validação determinística local de fatos e invariantes (sem inteligência em regex)
  const validationIssues = validateUnifiedAnalysis(normalizedData, preprocessorContext);

  // Unifica as inconsistências locais detectadas
  const allLocalIssues = [...normalizationIssues, ...validationIssues];

  // 8. Coleta de metadados reais de uso de tokens
  let usageMetadata: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null = null;
  const rawUsage = interactionRes?.usage;
  if (rawUsage) {
    const totalTokens =
      typeof rawUsage.total_tokens === 'number'
        ? rawUsage.total_tokens
        : typeof rawUsage.totalTokens === 'number'
        ? rawUsage.totalTokens
        : typeof rawUsage.totalTokenCount === 'number'
        ? rawUsage.totalTokenCount
        : undefined;

    let inputTokens: number | undefined;
    if (typeof rawUsage.prompt_tokens === 'number') {
      inputTokens = rawUsage.prompt_tokens;
    } else if (typeof rawUsage.input_tokens === 'number') {
      inputTokens = rawUsage.input_tokens;
    } else if (typeof rawUsage.inputTokens === 'number') {
      inputTokens = rawUsage.inputTokens;
    } else if (typeof rawUsage.promptTokenCount === 'number') {
      inputTokens = rawUsage.promptTokenCount;
    } else if (Array.isArray(rawUsage.input_tokens_by_modality)) {
      inputTokens = rawUsage.input_tokens_by_modality.reduce(
        (acc: number, m: any) => acc + (m.token_count || 0),
        0
      );
    }

    let outputTokens: number | undefined;
    if (typeof rawUsage.candidates_tokens === 'number') {
      outputTokens = rawUsage.candidates_tokens;
    } else if (typeof rawUsage.output_tokens === 'number') {
      outputTokens = rawUsage.output_tokens;
    } else if (typeof rawUsage.outputTokens === 'number') {
      outputTokens = rawUsage.outputTokens;
    } else if (typeof rawUsage.candidatesTokenCount === 'number') {
      outputTokens = rawUsage.candidatesTokenCount;
    } else if (Array.isArray(rawUsage.output_tokens_by_modality)) {
      outputTokens = rawUsage.output_tokens_by_modality.reduce(
        (acc: number, m: any) => acc + (m.token_count || 0),
        0
      );
    }

    if (totalTokens !== undefined || inputTokens !== undefined || outputTokens !== undefined) {
      usageMetadata = {
        totalTokens,
        inputTokens,
        outputTokens,
      };
    }
  }

  const totalExecutionTimeMs = Date.now() - globalStartTime;

  return {
    success: true,
    pipeline: 'v4_unified',
    model,
    modelRequestCount: 1,
    inputTransport: signedUrl ? 'signed_url' : 'inline',
    executionTimeMs: totalExecutionTimeMs,
    inferenceTimeMs,
    data: normalizedData,
    localIssues: allLocalIssues,
    reviewFlags: normalizedData.reviewFlags,
    rawJson: rawText,
    usage: usageMetadata,
    warnings: normalizedData.warnings,
  };
}
