import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';

/* ==========================================================================
   INTERFACES E SCHEMAS - ENRIQUECIMENTO SEMÂNTICO DE PDF (CHAMADA #2 V3)
   ========================================================================== */

export const semanticItemKindSchema = z.enum([
  'product',
  'combo',
  'option',
  'variant',
  'addon',
  'informational',
  'unknown',
]);
export type SemanticItemKind = z.infer<typeof semanticItemKindSchema>;

export const semanticPricingModelSchema = z.enum([
  'single',
  'quantity_tiers',
  'size_variants',
  'multiple_prices',
  'unknown',
]);
export type SemanticPricingModel = z.infer<typeof semanticPricingModelSchema>;

export const itemAssignmentSchema = z.object({
  itemKey: z.string().trim().min(1, 'itemKey é obrigatório.'),
  kind: semanticItemKindSchema,
  parentItemKey: z.string().trim().min(1).nullable(),
  groupKey: z.string().trim().min(1).nullable(),
  pricingModel: semanticPricingModelSchema.nullable(),
  normalizedCategoryName: z.string().trim().min(1).nullable().optional().default(null),
  relatedPages: z.array(z.number().int().min(1)).default([]),
  photoCandidatePages: z.array(z.number().int().min(1)).default([]),
});
export interface SemanticItemAssignment {
  itemKey: string;
  kind: SemanticItemKind;
  parentItemKey?: string | null;
  groupKey?: string | null;
  pricingModel?: SemanticPricingModel | null;
  normalizedCategoryName?: string | null;
  relatedPages?: number[];
  photoCandidatePages?: number[];
}

export const semanticGroupKindSchema = z.enum([
  'option_group',
  'variant_group',
  'addon_group',
  'unknown',
]);
export type SemanticGroupKind = z.infer<typeof semanticGroupKindSchema>;

export const groupPricingBehaviorSchema = z.enum([
  'inherits_parent',
  'own_price_per_item',
  'mixed',
  'no_price',
  'unknown',
]);
export type GroupPricingBehavior = z.infer<typeof groupPricingBehaviorSchema>;

export const groupSelectionModeSchema = z.enum([
  'single',
  'multiple',
  'quantity',
  'unknown',
]);
export type GroupSelectionMode = z.infer<typeof groupSelectionModeSchema>;

export const semanticGroupSchema = z.object({
  groupKey: z.string().trim().min(1, 'groupKey é obrigatório.'),
  name: z.string().trim().min(1, 'Nome do grupo é obrigatório.'),
  kind: semanticGroupKindSchema,
  parentItemKey: z.string().trim().min(1).nullable(),
  itemKeys: z.array(z.string().trim().min(1)).default([]),
  sourceGroupKeys: z.array(z.string().trim().min(1)).default([]),
  pricingBehavior: groupPricingBehaviorSchema,
  selectionMode: groupSelectionModeSchema.default('unknown'),
  required: z.boolean().nullable().default(null),
  minimum: z.number().int().min(0).nullable().default(null),
  maximum: z.number().int().min(1).nullable().default(null),
});

export interface SemanticGroup {
  groupKey: string;
  name: string;
  kind: SemanticGroupKind;
  parentItemKey?: string | null;
  itemKeys: string[];
  sourceGroupKeys?: string[];
  pricingBehavior: GroupPricingBehavior;
  selectionMode?: GroupSelectionMode;
  required?: boolean | null;
  minimum?: number | null;
  maximum?: number | null;
}

export const businessRuleTypeSchema = z.enum([
  'minimum_order',
  'advance_notice',
  'serving_guidance',
  'packaging',
  'customer_supplied_material',
  'product_specification',
  'ordering_instruction',
  'other',
]);
export type BusinessRuleType = z.infer<typeof businessRuleTypeSchema>;

export const businessRuleSchema = z.object({
  type: businessRuleTypeSchema,
  sourceRuleKey: z.string().trim().min(1).nullable().optional().default(null),
  sourceTextKey: z.string().trim().min(1).nullable().optional().default(null),
  rawText: z.string().trim().nullable().optional().default(null),
  sourcePage: z.number().int().min(1).nullable().optional().default(null),
  relatedItemKey: z.string().trim().min(1).nullable().optional().default(null),
  relatedGroupKey: z.string().trim().min(1).nullable().optional().default(null),
});

export interface SemanticBusinessRule {
  type: BusinessRuleType;
  sourceRuleKey?: string | null;
  sourceTextKey?: string | null;
  rawText?: string | null;
  sourcePage?: number | null;
  relatedItemKey?: string | null;
  relatedGroupKey?: string | null;
}

export const ignoredTextReasonSchema = z.enum([
  'placeholder',
  'marketing',
  'contact',
  'decorative',
  'duplicate',
  'irrelevant',
  'other',
]);
export type IgnoredTextReason = z.infer<typeof ignoredTextReasonSchema>;

export const ignoredTextSchema = z.object({
  sourceTextKey: z.string().trim().min(1).nullable(),
  rawText: z.string().trim().nullable().optional().default(null),
  sourcePage: z.number().int().min(1).nullable().optional().default(null),
  reason: ignoredTextReasonSchema,
});

export interface SemanticIgnoredText {
  sourceTextKey?: string | null;
  rawText?: string | null;
  sourcePage?: number | null;
  reason: IgnoredTextReason;
}

export const pdfSemanticEnrichmentDataSchema = z.object({
  items: z.array(itemAssignmentSchema).default([]),
  groups: z.array(semanticGroupSchema).default([]),
  businessRules: z.array(businessRuleSchema).default([]),
  ignoredTexts: z.array(ignoredTextSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export interface PdfSemanticEnrichmentData {
  items: SemanticItemAssignment[];
  groups: SemanticGroup[];
  businessRules: SemanticBusinessRule[];
  ignoredTexts: SemanticIgnoredText[];
  warnings: string[];
}

export interface PdfSemanticEnrichmentSuccess {
  status: 'ok';
  model: string;
  executionTimeMs: number;
  data: PdfSemanticEnrichmentData;
  rawJson: string;
}

export interface PdfSemanticEnrichmentFailure {
  status: 'failed';
  error: {
    code: string;
    message: string;
  };
}

export type PdfSemanticEnrichmentResult =
  | PdfSemanticEnrichmentSuccess
  | PdfSemanticEnrichmentFailure;

export interface CompactPdfMenuItem {
  itemKey: string;
  sourceType?: 'product_candidate' | 'choice_option';
  evidenceGroupKey?: string | null;
  parentProductHint?: string | null;
  category: string | null;
  name: string;
  sourcePage: number | null;
  prices: Array<{
    label: string | null;
    amountCents: number | null;
  }>;
}

export type CompactPdfMenuItemInput = Partial<CompactPdfMenuItem> & {
  itemKey: string;
};

export interface CompactCandidateGroup {
  groupKey: string;
  title: string | null;
  sourcePage: number;
  instruction?: string | null;
  parentProductHint?: string | null;
  options: Array<{
    optionKey: string;
    name: string;
    amountCents: number | null;
  }>;
}

export interface CompactRuleBlock {
  ruleKey: string;
  title: string | null;
  body: string;
  sourcePage: number;
}

export interface CompactSectionHeading {
  headingKey: string;
  text: string;
  sourcePage: number;
}

export interface CompactPageCoverage {
  pageNumber: number;
  role: string;
  hasCatalogEvidence: boolean;
}

export interface CompactUnmappedText {
  textKey: string;
  rawText: string;
}

/* ==========================================================================
   SCHEMA DO GEMINI (STRUCTURED OUTPUT V3)
   ========================================================================== */

export const geminiPdfSemanticResponseSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      description: 'Atribuição semântica para CADA itemKey fornecido no input (produtos e opções).',
      items: {
        type: Type.OBJECT,
        properties: {
          itemKey: {
            type: Type.STRING,
            description: 'Identificador exato do item (ex: c0-p0, cg0-o0). Deve corresponder exatamente a um itemKey do input.',
          },
          kind: {
            type: Type.STRING,
            enum: ['product', 'combo', 'option', 'variant', 'addon', 'informational', 'unknown'],
            description: 'Classificação semântica do item.',
          },
          parentItemKey: {
            type: Type.STRING,
            nullable: true,
            description: 'itemKey do produto pai se este item for uma opção/sabor/adicional/variação. Null se for produto comercial principal.',
          },
          groupKey: {
            type: Type.STRING,
            nullable: true,
            description: 'groupKey do grupo ao qual este item pertence (ex: g0). Null se não pertencer a nenhum grupo.',
          },
          pricingModel: {
            type: Type.STRING,
            nullable: true,
            enum: ['single', 'quantity_tiers', 'size_variants', 'multiple_prices', 'unknown'],
            description: 'Modelo de precificação do item quando for produto principal. Null para opções/adicionais.',
          },
          normalizedCategoryName: {
            type: Type.STRING,
            nullable: true,
            description: 'Nome da categoria ou família normalizada para produto/combo (ex: "Torta Gelada"). Deve ser null para opções, adicionais ou se for redundante com o nome do produto.',
          },
          relatedPages: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: 'Lista de páginas relacionadas a este item ou seção (contexto multipágina).',
          },
          photoCandidatePages: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: 'Páginas plausíveis onde pode haver uma fotografia representativa do produto (máximo 5 páginas).',
          },
        },
        required: [
          'itemKey',
          'kind',
          'parentItemKey',
          'groupKey',
          'pricingModel',
          'normalizedCategoryName',
          'relatedPages',
          'photoCandidatePages',
        ],
      },
    },
    groups: {
      type: Type.ARRAY,
      description: 'Grupos semânticos (ComplementGroup) criados com base nas evidências de candidateGroups.',
      items: {
        type: Type.OBJECT,
        properties: {
          groupKey: {
            type: Type.STRING,
            description: 'Identificador do grupo (ex: g0, g1).',
          },
          name: {
            type: Type.STRING,
            description: 'Nome comercial do grupo (ex: "Sabores", "Massas", "Recheios", "Adicionais").',
          },
          kind: {
            type: Type.STRING,
            enum: ['option_group', 'variant_group', 'addon_group', 'unknown'],
            description: 'Tipo do grupo.',
          },
          parentItemKey: {
            type: Type.STRING,
            nullable: true,
            description: 'itemKey do produto pai ao qual o grupo se vincula (ex: c0-p0). Null se aplicável globalmente.',
          },
          itemKeys: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Lista de itemKeys das opções que pertencem a este grupo.',
          },
          sourceGroupKeys: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Chaves dos candidateGroups da T1 que originaram este grupo (ex: ["cg0"] ou ["cg0", "cg1"] se for continuação multipágina).',
          },
          pricingBehavior: {
            type: Type.STRING,
            enum: ['inherits_parent', 'own_price_per_item', 'mixed', 'no_price', 'unknown'],
            description: 'Comportamento de preço do grupo.',
          },
          selectionMode: {
            type: Type.STRING,
            enum: ['single', 'multiple', 'quantity', 'unknown'],
            description: 'Modo de seleção das opções (ex: single para escolha única, multiple para várias escolhas).',
          },
          required: {
            type: Type.BOOLEAN,
            nullable: true,
            description: 'true se a escolha for obrigatória, false se opcional, null se não evidenciado.',
          },
          minimum: {
            type: Type.INTEGER,
            nullable: true,
            description: 'Quantidade mínima exigida do grupo se houver evidência real, caso contrário null.',
          },
          maximum: {
            type: Type.INTEGER,
            nullable: true,
            description: 'Quantidade máxima permitida do grupo se houver evidência real, caso contrário null.',
          },
        },
        required: [
          'groupKey',
          'name',
          'kind',
          'parentItemKey',
          'itemKeys',
          'sourceGroupKeys',
          'pricingBehavior',
          'selectionMode',
          'required',
          'minimum',
          'maximum',
        ],
      },
    },
    businessRules: {
      type: Type.ARRAY,
      description: 'Regras comerciais e condições de pedido explícitas extraídas dos ruleBlocks da T1.',
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: [
              'minimum_order',
              'advance_notice',
              'serving_guidance',
              'packaging',
              'customer_supplied_material',
              'product_specification',
              'ordering_instruction',
              'other',
            ],
            description: 'Tipo da regra de negócio.',
          },
          sourceRuleKey: {
            type: Type.STRING,
            nullable: true,
            description: 'Chave do ruleBlock da T1 de onde a regra foi extraída (ex: "rb0").',
          },
          sourceTextKey: {
            type: Type.STRING,
            nullable: true,
            description: 'textKey do unmappedTexts da T1 (ex: "u0") se aplicável.',
          },
          sourcePage: {
            type: Type.INTEGER,
            nullable: true,
            description: 'Número da página do documento onde a regra se encontra (>= 1).',
          },
          relatedItemKey: {
            type: Type.STRING,
            nullable: true,
            description: 'itemKey do produto relacionado se a regra for específica para ele, caso contrário null.',
          },
          relatedGroupKey: {
            type: Type.STRING,
            nullable: true,
            description: 'groupKey do grupo relacionado se a regra for específica para ele, caso contrário null.',
          },
        },
        required: ['type', 'sourceRuleKey', 'sourceTextKey', 'sourcePage', 'relatedItemKey', 'relatedGroupKey'],
      },
    },
    ignoredTexts: {
      type: Type.ARRAY,
      description: 'Textos identificados como ruído ou sem relevância comercial.',
      items: {
        type: Type.OBJECT,
        properties: {
          sourceTextKey: {
            type: Type.STRING,
            nullable: true,
            description: 'textKey do unmappedTexts identificado como ruído (ex: u1).',
          },
          sourcePage: {
            type: Type.INTEGER,
            nullable: true,
            description: 'Número da página onde o texto se encontra (>= 1).',
          },
          reason: {
            type: Type.STRING,
            enum: ['placeholder', 'marketing', 'contact', 'decorative', 'duplicate', 'irrelevant', 'other'],
            description: 'Motivo pelo qual o texto deve ser ignorado.',
          },
        },
        required: ['sourceTextKey', 'sourcePage', 'reason'],
      },
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Alertas ou observações sobre ambiguidades encontradas na estrutura do documento.',
    },
  },
  required: ['items', 'groups', 'businessRules', 'ignoredTexts', 'warnings'],
};

/* ==========================================================================
   HELPER DE NORMALIZAÇÃO TEXTUAL SEGURA (V3.2)
   ========================================================================== */

export function normalizeTextForComparison(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ==========================================================================
   VALIDAÇÃO DE CONSISTÊNCIA REFERENCIAL ESTREITA (BACKEND V3)
   ========================================================================== */

export function validateSemanticReferences(
  data: PdfSemanticEnrichmentData,
  validItemKeysOrMap: Set<string> | Map<string, CompactPdfMenuItemInput>,
  arg3?: Set<string> | Map<string, string>,
  arg4?: Map<string, { body: string; sourcePage: number }> | Map<string, CompactPdfMenuItemInput>,
  arg5?: Map<string, string>,
  arg6?: Map<string, CompactPdfMenuItemInput>
): PdfSemanticEnrichmentData {
  let validItemKeys: Set<string>;
  let validCandidateGroupKeys = new Set<string>();
  let validRuleBlocksMap = new Map<string, { body: string; sourcePage: number }>();
  let validTextKeysMap = new Map<string, string>();
  let inputItemsMap = new Map<string, CompactPdfMenuItemInput>();

  if (validItemKeysOrMap instanceof Map) {
    validItemKeys = new Set(validItemKeysOrMap.keys());
    inputItemsMap = validItemKeysOrMap;
  } else {
    validItemKeys = validItemKeysOrMap;
  }

  if (arg3 instanceof Map) {
    // Assinatura legada V2: (data, validItemKeys, validTextKeysMap, inputItemsMap)
    validTextKeysMap = arg3;
    if (arg4 instanceof Map) {
      inputItemsMap = arg4 as Map<string, CompactPdfMenuItemInput>;
    }
  } else {
    // Assinatura V3: (data, validItemKeys, validCandidateGroupKeys, validRuleBlocksMap, validTextKeysMap, inputItemsMap)
    if (arg3 instanceof Set) {
      validCandidateGroupKeys = arg3;
    }
    if (arg4 instanceof Map) {
      validRuleBlocksMap = arg4 as Map<string, { body: string; sourcePage: number }>;
    }
    if (arg5 instanceof Map) {
      validTextKeysMap = arg5;
    }
    if (arg6 instanceof Map) {
      inputItemsMap = arg6;
    }
  }
  // 1. COBERTURA COMPLETA E EXATA DOS ITEMKEYS
  const itemKeysInResponse = data.items.map((i) => i.itemKey);
  const itemKeySet = new Set<string>();

  for (const key of itemKeysInResponse) {
    if (itemKeySet.has(key)) {
      throw new HttpError(
        502,
        `ItemKey duplicado na resposta semântica: "${key}".`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }
    itemKeySet.add(key);
  }

  // Verifica se a IA omitiu algum item esperado ou inventou chaves
  for (const expectedKey of validItemKeys) {
    if (!itemKeySet.has(expectedKey)) {
      throw new HttpError(
        502,
        `ItemKey obrigatório da extração ausente na resposta semântica: "${expectedKey}".`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }
  }

  for (const key of itemKeySet) {
    if (!validItemKeys.has(key)) {
      throw new HttpError(
        502,
        `ItemKey inexistente ou inventado pelo modelo: "${key}".`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }
  }

  // 2. UNICIDADE E CONSISTÊNCIA DE GRUPOS
  const groupKeys = new Set<string>();
  const groupMap = new Map<string, SemanticGroup>();

  for (const group of data.groups) {
    if (groupKeys.has(group.groupKey)) {
      throw new HttpError(
        502,
        `GroupKey duplicado na resposta semântica: "${group.groupKey}".`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }
    groupKeys.add(group.groupKey);
    groupMap.set(group.groupKey, group);

    // Valida que sourceGroupKeys referenciam candidateGroups válidos
    if (group.sourceGroupKeys && group.sourceGroupKeys.length > 0) {
      for (const sgKey of group.sourceGroupKeys) {
        if (!validCandidateGroupKeys.has(sgKey)) {
          throw new HttpError(
            502,
            `Grupo "${group.groupKey}" referencia sourceGroupKey inexistente: "${sgKey}".`,
            'INVALID_SEMANTIC_REFERENCES'
          );
        }
      }
    }

    // Se o grupo aponta para parentItemKey, o produto pai deve existir
    if (group.parentItemKey !== null && !validItemKeys.has(group.parentItemKey)) {
      throw new HttpError(
        502,
        `Grupo "${group.groupKey}" aponta para parentItemKey inexistente: "${group.parentItemKey}".`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }

    // Valida itens membros do grupo
    for (const memberKey of group.itemKeys) {
      if (!validItemKeys.has(memberKey)) {
        throw new HttpError(
          502,
          `Grupo "${group.groupKey}" contém itemKey inexistente: "${memberKey}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
    }
  }

  // 3. CONSISTÊNCIA BIDIRECIONAL ENTRE ITENS E GRUPOS E NORMALIZAÇÕES
  const assignmentMap = new Map<string, SemanticItemAssignment>();
  for (const item of data.items) {
    if (!item.photoCandidatePages) {
      item.photoCandidatePages = [];
    }
    if (!item.relatedPages) {
      item.relatedPages = [];
    }
    if (item.normalizedCategoryName === undefined) {
      item.normalizedCategoryName = null;
    }

    assignmentMap.set(item.itemKey, item);

    // Invariante 1: Opção de candidateGroup (choice_option) NUNCA pode ser promovida a product ou combo
    const inputItem = inputItemsMap.get(item.itemKey);
    if (inputItem && inputItem.sourceType === 'choice_option') {
      if (item.kind === 'product' || item.kind === 'combo') {
        throw new HttpError(
          502,
          `Item "${item.itemKey}" extraído como opção de escolha ("choice_option") não pode ser promovido a "${item.kind}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
    }

    // Invariante 2: Product ou Combo principal não pode ter parentItemKey nem groupKey
    if (item.kind === 'product' || item.kind === 'combo') {
      if (item.parentItemKey !== null && item.parentItemKey !== undefined) {
        throw new HttpError(
          502,
          `Item "${item.itemKey}" classificado como "${item.kind}" não pode possuir parentItemKey ("${item.parentItemKey}").`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
      if (item.groupKey !== null && item.groupKey !== undefined) {
        throw new HttpError(
          502,
          `Item "${item.itemKey}" classificado como "${item.kind}" não pode pertencer a um grupo (groupKey: "${item.groupKey}").`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
    }

    // Invariante 3: normalizedCategoryName tem significado exclusivamente para product ou combo
    if (item.kind !== 'product' && item.kind !== 'combo') {
      item.normalizedCategoryName = null;
    } else if (item.normalizedCategoryName) {
      // Remoção determinística de categoria auto-duplicada (V3.2):
      // Se normalizedCategoryName for trivialmente idêntico ao nome do próprio produto, limpa para null.
      const rawItemName = inputItem?.name;
      if (rawItemName && normalizeTextForComparison(item.normalizedCategoryName) === normalizeTextForComparison(rawItemName)) {
        item.normalizedCategoryName = null;
      }
    }

    // Validação de photoCandidatePages
    if (item.photoCandidatePages && item.photoCandidatePages.length > 0) {
      if (item.photoCandidatePages.length > 5) {
        throw new HttpError(
          502,
          `Item "${item.itemKey}" excede o limite máximo de 5 páginas em photoCandidatePages.`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
      for (const p of item.photoCandidatePages) {
        if (!Number.isInteger(p) || p < 1) {
          throw new HttpError(
            502,
            `Página inválida em photoCandidatePages do item "${item.itemKey}": ${p}. Deve ser inteiro >= 1.`,
            'INVALID_SEMANTIC_REFERENCES'
          );
        }
      }
    } else {
      // Fallback determinístico para a sourcePage do item caso não tenha sido sugerida nenhuma página
      const inputItem = inputItemsMap.get(item.itemKey);
      if (inputItem && typeof inputItem.sourcePage === 'number' && inputItem.sourcePage >= 1) {
        item.photoCandidatePages = [inputItem.sourcePage];
      }
    }

    // Validação de relatedPages
    if (item.relatedPages && item.relatedPages.length > 0) {
      for (const p of item.relatedPages) {
        if (!Number.isInteger(p) || p < 1) {
          throw new HttpError(
            502,
            `Página inválida em relatedPages do item "${item.itemKey}": ${p}. Deve ser inteiro >= 1.`,
            'INVALID_SEMANTIC_REFERENCES'
          );
        }
      }
    }

    // Não pode ser pai de si mesmo
    if (item.parentItemKey !== null) {
      if (!validItemKeys.has(item.parentItemKey)) {
        throw new HttpError(
          502,
          `Item "${item.itemKey}" referencia parentItemKey inexistente: "${item.parentItemKey}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
      if (item.parentItemKey === item.itemKey) {
        throw new HttpError(
          502,
          `Item "${item.itemKey}" não pode ser pai de si mesmo.`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
    }

    // Se possui groupKey, o grupo deve existir
    if (item.groupKey !== null) {
      if (!groupKeys.has(item.groupKey)) {
        throw new HttpError(
          502,
          `Item "${item.itemKey}" referencia groupKey inexistente: "${item.groupKey}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }

      const targetGroup = groupMap.get(item.groupKey);
      if (!targetGroup || !targetGroup.itemKeys.includes(item.itemKey)) {
        throw new HttpError(
          502,
          `Inconsistência bidirecional: item "${item.itemKey}" declara groupKey "${item.groupKey}", mas o grupo não contém esse item em sua lista.`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }

      // Se ambos definem parentItemKey, devem ser coerentes
      if (
        item.parentItemKey !== null &&
        targetGroup.parentItemKey !== null &&
        item.parentItemKey !== targetGroup.parentItemKey
      ) {
        throw new HttpError(
          502,
          `Incoerência de parentItemKey: item "${item.itemKey}" aponta para pai "${item.parentItemKey}", mas seu grupo "${item.groupKey}" aponta para pai "${targetGroup.parentItemKey}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
    }
  }

  // Checagem inversa: todo item listado em group.itemKeys deve ter groupKey correspondente
  for (const group of data.groups) {
    for (const memberKey of group.itemKeys) {
      const assignment = assignmentMap.get(memberKey);
      if (!assignment || assignment.groupKey !== group.groupKey) {
        throw new HttpError(
          502,
          `Inconsistência bidirecional: grupo "${group.groupKey}" lista item "${memberKey}", mas o item declara groupKey "${assignment?.groupKey || 'null'}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
    }
  }

  // 4. RASTREABILIDADE E RESOLUÇÃO DE BUSINESS RULES (Correção 1: corpo vem da T1)
  const resolvedRules: SemanticBusinessRule[] = [];
  for (const rule of data.businessRules) {
    if (!rule.sourceRuleKey && !rule.sourceTextKey && !rule.relatedItemKey) {
      throw new HttpError(
        502,
        `Regra de negócio sem origem rastreável: deve possuir sourceRuleKey, sourceTextKey ou relatedItemKey.`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }

    let resolvedRawText = rule.rawText || '';
    let resolvedSourcePage = rule.sourcePage;

    // Se referenciar um ruleBlock da T1:
    if (rule.sourceRuleKey) {
      if (!validRuleBlocksMap.has(rule.sourceRuleKey)) {
        throw new HttpError(
          502,
          `Regra de negócio referencia sourceRuleKey inexistente: "${rule.sourceRuleKey}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
      const rb = validRuleBlocksMap.get(rule.sourceRuleKey)!;
      // O corpo final da regra VEM DA T1, não de texto reescrito pela T2!
      resolvedRawText = rb.body;
      if (resolvedSourcePage === null || resolvedSourcePage === undefined) {
        resolvedSourcePage = rb.sourcePage;
      }
    } else if (rule.sourceTextKey !== null && rule.sourceTextKey !== undefined) {
      if (!validTextKeysMap.has(rule.sourceTextKey)) {
        throw new HttpError(
          502,
          `Regra de negócio referencia sourceTextKey inexistente: "${rule.sourceTextKey}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
      resolvedRawText = validTextKeysMap.get(rule.sourceTextKey) || resolvedRawText;
    }

    if (rule.relatedItemKey !== null && rule.relatedItemKey !== undefined && !validItemKeys.has(rule.relatedItemKey)) {
      throw new HttpError(
        502,
        `Regra de negócio referencia relatedItemKey inexistente: "${rule.relatedItemKey}".`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }

    if (rule.relatedGroupKey !== null && rule.relatedGroupKey !== undefined && !groupKeys.has(rule.relatedGroupKey)) {
      throw new HttpError(
        502,
        `Regra de negócio referencia relatedGroupKey inexistente: "${rule.relatedGroupKey}".`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }

    resolvedRules.push({
      ...rule,
      rawText: resolvedRawText,
      sourcePage: resolvedSourcePage ?? null,
    });
  }

  // 5. RASTREABILIDADE E RESOLUÇÃO DE IGNORED TEXTS
  const resolvedIgnoredTexts: SemanticIgnoredText[] = [];
  for (const ignored of data.ignoredTexts) {
    let resolvedRawText = ignored.rawText || '';

    if (ignored.sourceTextKey !== null) {
      if (!validTextKeysMap.has(ignored.sourceTextKey)) {
        throw new HttpError(
          502,
          `Texto ignorado referencia sourceTextKey inexistente: "${ignored.sourceTextKey}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
      resolvedRawText = validTextKeysMap.get(ignored.sourceTextKey) || resolvedRawText;
    } else if (!resolvedRawText) {
      throw new HttpError(
        502,
        `Texto ignorado sem sourceTextKey e sem texto identificador.`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }

    resolvedIgnoredTexts.push({
      ...ignored,
      rawText: resolvedRawText,
    });
  }

  return {
    ...data,
    businessRules: resolvedRules,
    ignoredTexts: resolvedIgnoredTexts,
  };
}

/* ==========================================================================
   CONSTRUTOR DO PROMPT V3
   ========================================================================== */

export function buildPdfSemanticPrompt(
  compactItems: CompactPdfMenuItem[],
  candidateGroups: CompactCandidateGroup[],
  ruleBlocks: CompactRuleBlock[],
  sectionHeadings: CompactSectionHeading[],
  pageCoverage: CompactPageCoverage[],
  compactTexts: CompactUnmappedText[]
): string {
  const itemsJson = JSON.stringify(compactItems, null, 2);
  const candidateGroupsJson = JSON.stringify(candidateGroups, null, 2);
  const ruleBlocksJson = JSON.stringify(ruleBlocks, null, 2);
  const headingsJson = JSON.stringify(sectionHeadings, null, 2);
  const coverageJson = JSON.stringify(pageCoverage, null, 2);
  const textsJson = JSON.stringify(compactTexts, null, 2);

  return `Você é um especialista sênior em arquitetura de cardápios, precificação e modelagem de domínio para delivery e comércio alimentício.

Seu objetivo nesta etapa NÃO É fazer OCR e NÃO É transcrever texto. A extração de evidências literais já foi realizada com precisão na primeira etapa.
Sua tarefa é analisar o documento PDF anexado em conjunto com as evidências extraídas para **INTERPRETAR A ESTRUTURA COMERCIAL, RELAÇÕES PAI/FILHO, GRUPOS DE COMPLEMENTOS E REGRAS DE PEDIDO PARA O DOMÍNIO DO PODE VIR**.

---
### DOMÍNIO REAL DO PODE VIR (REQUISITOS E RESTRIÇÕES):
1. **Product**:
   - Item comercial principal à venda (ex: bolo, combo, cento de brigadeiros, torta, pizza).
   - Possui imagem própria, preços e pode possuir grupos de complementos vinculados.
2. **ComplementGroup**:
   - Pertence a um produto.
   - Modela escolhas do cliente: sabores, massas, recheios, adicionais, coberturas, acompanhamentos, opções de troca.
   - Possui obrigatoriedade (required: true/false), mínimo e máximo de escolhas do grupo.
   - As opções individuais possuem nome e podem ter preço (acréscimo), mas NÃO possuem imagem própria no catálogo.
   - NÃO existe no domínio do sistema a regra de "mínimo por opção" (ex: "mínimo 25 unidades por sabor"). Se essa regra existir no cardápio, preserve-a em businessRules ("minimum_order") para revisão do lojista, sem inventar campos inexistentes.

---
### EVIDÊNCIAS FORNECIDAS DA ETAPA 1:

1. **ITENS A CLASSIFICAR (com chaves determinísticas itemKey):**
\`\`\`json
${itemsJson}
\`\`\`

2. **GRUPOS CANDIDATOS DE ESCOLHAS / PERSONALIZAÇÕES (candidateGroups com groupKey):**
\`\`\`json
${candidateGroupsJson}
\`\`\`

3. **BLOCOS DE REGRAS COMERCIAIS COMPLETAS (ruleBlocks com ruleKey):**
\`\`\`json
${ruleBlocksJson}
\`\`\`

4. **TÍTULOS E CABEÇALHOS DE SEÇÃO (sectionHeadings com headingKey):**
\`\`\`json
${headingsJson}
\`\`\`

5. **COBERTURA DE PÁGINAS (pageCoverage):**
\`\`\`json
${coverageJson}
\`\`\`

6. **TEXTOS NÃO MAPEADOS (com textKey):**
\`\`\`json
${textsJson}
\`\`\`

---
### DIRETRIZES CRÍTICAS DE INTERPRETAÇÃO:

1. **REAVALIAÇÃO DE "product_candidate" (CRÍTICO - NÃO É PRODUTO CONFIRMADO)**:
   - O campo "sourceType": "product_candidate" vindo da Etapa 1 significa APENAS: "A extração inicial colocou esta evidência na lista preliminar de itens".
   - ISSO NÃO SIGNIFICA que o item seja obrigatoriamente um Product!
   - A T2 DEVE REAVALIAR OBRIGATORIAMENTE A INDEPENDÊNCIA COMERCIAL DE CADA ITEM.
   - Se uma opção, tamanho, diâmetro, sabor, decoração ou adicional foi extraído como "product_candidate", RECLASSIFIQUE-O como "option", "addon" ou "variant"!

2. **TESTE DE INDEPENDÊNCIA COMERCIAL NA T2**:
   Antes de classificar qualquer item como "product" ou "combo", pergunte:
   A) O cliente pode pedir/comprar esta entidade sozinha no balcão ou delivery?
   B) Ela representa o objeto comercial completo ou apenas uma característica, personalização ou escolha de outro objeto?
   C) Seu preço é o valor do item completo ou apenas o valor de um acréscimo / variação?
   D) O heading, título ou seção visual indica personalização ("escolha", "sabores", "decoração", "adicionais", "recheios", "massas")?

   -> SOMENTE classifique como "product" ou "combo" quando houver evidência incontestável de independência comercial.
   -> Caso contrário, use "variant", "option" ou "addon" conforme apropriado.

3. **EXEMPLOS NEGATIVOS E POSITIVOS OBRIGATÓRIOS**:
   - Exemplo A (Variações de tamanho):
     Produto "Bolo de festa": linha "12 cm — R$ 100" e linha "20 cm — R$ 180".
     "12 cm" NÃO é Product. "20 cm" NÃO é Product. São variações (variant) ou configurações do mesmo produto.
   - Exemplo B (Borda de pizza):
     Produto "Pizza": opção "Borda Catupiry + R$ 8".
     "Borda Catupiry" NÃO é Product. É addon/option vinculado à pizza.
   - Exemplo C (Decoração de confeitaria):
     Produto "Bolo": opção "Decoração Floral + R$ 15".
     "Decoração Floral" NÃO é Product. É addon vinculado ao bolo.
   - Exemplo D (Combo/Pacote):
     "Kit Festa Essencial — R$ 269".
     É Combo porque representa um pacote comercial completo e independente que pode ser comprado como unidade.
   - Exemplo E (Produtos com sabores independentes):
     "Torta Morango — R$ 160", "Torta Abacaxi — R$ 150".
     Se cada uma representa uma torta inteira vendida de forma independente no cardápio, ambas são Products com parentItemKey: null.

4. **COBERTURA TOTAL DOS ITENS**:
   - Retorne exatamente UMA entrada em "items" para CADA "itemKey" fornecido (${compactItems.map((i) => i.itemKey).join(', ')}).
   - NUNCA omita nenhum itemKey e NUNCA crie itemKeys não fornecidos.

5. **TRANSFORMAÇÃO DE CANDIDATEGROUPS EM COMPLEMENTGROUPS (COBERTURA TOTAL DE OPÇÕES)**:
   - Para cada lista de opções (sabores, massas, recheios, adicionais, decorações):
     - Crie um grupo correspondente em "groups" com kind ("option_group" ou "addon_group"), nome claro (ex: "Sabores", "Massas", "Decorações Especiais"), parentItemKey apontando para o produto principal.
     - Em "sourceGroupKeys", liste as chaves de candidateGroups correspondentes (ex: ["cg0"]). Se um mesmo grupo visual continuar na página seguinte (ex: Sabores na pág 6 e pág 7 com cg0 e cg1), FUNDA-OS em um único grupo listando sourceGroupKeys: ["cg0", "cg1"].
     - Atribua a cada opção kind: "option" (ou "addon"), parentItemKey apontando para o produto principal e groupKey apontando para o grupo.
   - QUANDO UM SemanticGroup declarar sourceGroupKeys: ["cgX", ...]:
     - Ele está afirmando formalmente que aquele grupo semântico representa essas evidências da T1.
     - TODAS as opções comerciais de cada sourceGroupKey devem ser contabilizadas!
     - Cada optionKey deve aparecer exatamente uma vez no grupo adequado ("group.itemKeys").
     - NÃO omita silenciosamente opções, NÃO reduza listas longas, NÃO use "..." e NÃO descarte item apenas porque a lista contém muitos sabores/opções (ex: uma lista de 12 sabores na T1 DEVE ter todas as 12 opções vinculadas ao grupo em itemKeys).
     - Se uma opção de candidateGroup NÃO for realmente uma opção comercial e precisar ser classificada como "informational" ou "unknown", isso deve constar explicitamente no item correspondente e gerar aviso em "warnings". NUNCA simplesmente deixe a optionKey fora de "group.itemKeys".

6. **NORMALIZAÇÃO DE CATEGORIAS (normalizedCategoryName)**:
   - Defina normalizedCategoryName para produtos comerciais e combos quando houver um título de seção ou família evidente (ex: "Torta Gelada", "Linha Festiva").
   - Se o heading for idêntico ao nome do próprio produto, use null.
   - NUNCA crie categorias como "Sabores", "Massas", "Recheios", "Decorações" ou "Adicionais" quando representarem escolhas.
   - Para opções, adicionais e variantes (kind "option", "addon", "variant"), normalizedCategoryName DEVE SER null.

7. **PÁGINAS RELACIONADAS E FOTOS (relatedPages e photoCandidatePages)**:
   - Em "relatedPages", informe as páginas que compõem o contexto daquele produto ou seção.
   - Em "photoCandidatePages", informe APENAS as páginas plausíveis (máximo 5 páginas) onde uma fotografia do produto comercial principal possa estar (por exemplo, página de capa de seção imediatamente anterior ou a própria página de preços).

8. **REGRAS DE NEGÓCIO (businessRules) E PRESERVAÇÃO DE REGRAS NÃO REPRESENTÁVEIS NO DOMÍNIO**:
   - Identifique condições reais de pedido a partir dos ruleBlocks fornecidos.
   - Em "sourceRuleKey", informe obrigatoriamente a chave exata do ruleBlock correspondente (ex: "rb0").
   - Associe relatedItemKey ou relatedGroupKey se a regra for específica para um item ou grupo.
   - Quando encontrar uma regra comercial ou operacional válida que o domínio atual do Pode Vir não consegue expressar integralmente nos campos de ComplementGroup (ex: limite máximo condicionado ao tamanho do produto, mínimo por sabor/opção, dependência entre escolhas):
     - NÃO descarte a regra!
     - Preserve-a obrigatoriamente em "businessRules" com seu sourceRuleKey.
     - NÃO tente deformar a regra para caber à força no ComplementGroup (por exemplo, NÃO transforme "mínimo 25 unidades por sabor" em group.minimum = 25, pois isso mudaria completamente o significado para "escolha 25 sabores").

Responda exclusivamente no formato JSON especificado pelo schema.`;
}

/* ==========================================================================
   FUNÇÃO PRINCIPAL DE ANÁLISE SEMÂNTICA COM O GEMINI
   ========================================================================== */

export async function analyzePdfSemanticEnrichmentWithGemini(
  buffer: Buffer,
  mimeType: string,
  compactItems: CompactPdfMenuItem[],
  candidateGroups: CompactCandidateGroup[] = [],
  ruleBlocks: CompactRuleBlock[] = [],
  sectionHeadings: CompactSectionHeading[] = [],
  pageCoverage: CompactPageCoverage[] = [],
  compactTexts: CompactUnmappedText[] = []
): Promise<PdfSemanticEnrichmentSuccess> {
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
  const prompt = buildPdfSemanticPrompt(
    compactItems,
    candidateGroups,
    ruleBlocks,
    sectionHeadings,
    pageCoverage,
    compactTexts
  );

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
        responseSchema: geminiPdfSemanticResponseSchema,
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
        'Cota ou limite da Gemini API excedido na análise semântica. Tente novamente mais tarde.',
        'PDF_SEMANTIC_QUOTA_EXCEEDED'
      );
    }
    if (status === 504 || /deadline|timeout/i.test(rawMessage)) {
      throw new HttpError(
        504,
        'Tempo limite esgotado ao aguardar resposta da análise semântica do Gemini.',
        'PDF_SEMANTIC_TIMEOUT'
      );
    }

    throw new HttpError(
      502,
      `Falha na análise semântica do PDF com o Gemini: ${sanitized || 'Erro na chamada ao modelo.'}`,
      'PDF_SEMANTIC_SERVICE_ERROR'
    );
  }

  const executionTimeMs = Date.now() - startTime;

  if (!rawText) {
    throw new HttpError(
      502,
      'O Gemini retornou uma resposta vazia na análise semântica do PDF.',
      'PDF_SEMANTIC_EMPTY_RESPONSE'
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    const truncated = rawText.slice(0, 300);
    throw new HttpError(
      502,
      'O modelo não retornou um JSON válido na análise semântica do PDF.',
      'PDF_SEMANTIC_INVALID_RESPONSE',
      { rawJsonSnippet: truncated }
    );
  }

  const parseResult = pdfSemanticEnrichmentDataSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    const truncated = rawText.slice(0, 300);
    throw new HttpError(
      502,
      'A resposta da análise semântica não atende ao formato estruturado esperado.',
      'PDF_SEMANTIC_INVALID_RESPONSE',
      {
        validationIssues: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        rawJsonSnippet: truncated,
      }
    );
  }

  // Validação de integridade referencial estrita V3
  const validItemKeys = new Set(compactItems.map((i) => i.itemKey));
  const validCandidateGroupKeys = new Set(candidateGroups.map((g) => g.groupKey));
  const validRuleBlocksMap = new Map(ruleBlocks.map((rb) => [rb.ruleKey, { body: rb.body, sourcePage: rb.sourcePage }]));
  const validTextKeysMap = new Map(compactTexts.map((t) => [t.textKey, t.rawText]));
  const inputItemsMap = new Map(compactItems.map((i) => [i.itemKey, i]));

  const validatedData = validateSemanticReferences(
    parseResult.data,
    validItemKeys,
    validCandidateGroupKeys,
    validRuleBlocksMap,
    validTextKeysMap,
    inputItemsMap
  );

  return {
    status: 'ok',
    model,
    executionTimeMs,
    data: validatedData,
    rawJson: rawText,
  };
}
