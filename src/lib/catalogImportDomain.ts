/**
 * Domínio de Importação de Catálogo do Pode Vir (Domain-Native Contract)
 *
 * MÓDULO PURO COMPARTILHADO (Frontend & Backend)
 *
 * Responsabilidades:
 * 1. Single Source of Truth para DomainCapabilities factuais da Pode Vir;
 * 2. Schemas Zod RAW para Structured Output via Google GenAI Interactions API (com índices inteiros);
 * 3. Schemas Zod Normalizados para consumo pelo validador, UI e futura persistência;
 * 4. Tipos TypeScript rigorosamente inferidos e contratos de resposta;
 * 5. Helper puro `buildCatalogImportReviewQueue` para deduplicação estrutural de pendências com provenance;
 * 6. JSON Schema adjacente para a Interactions API sincronizado com testes de paridade.
 */

import { z } from 'zod';

/* ==========================================================================
   1. DOMAIN CAPABILITIES FACTUAIS DA PODE VIR
   ========================================================================== */

export interface DomainCapabilities {
  readonly productNativePriceCount: 1;
  readonly supportsOptionPriceDelta: true;
  readonly supportsSingleDimensionPriceModelViaComplementGroup: true;
  readonly supportsNonAdditiveMultiDimensionPricing: false;
  readonly supportsCompositeChoiceFlattening: true;
  readonly supportsSharedGroupsByProducts: true;
  readonly supportsSharedGroupsByCategories: true;
  readonly supportsEmbeddedGroups: true;
  readonly supportsOptionQuantity: true;
  readonly optionQuantityTransportMaximum: 20;
  readonly supportsMaximumPerOption: true;
  readonly supportsMinimumPerOption: false;
  readonly supportsConditionalGroups: false;
  readonly supportsOptionImage: false;
  readonly supportsProductPreorderLeadTime: true;
  readonly supportsFixedCombo: true;
  readonly supportsStagedCombo: true;
  readonly supportsExclusiveComboProducts: true;
  readonly supportsNestedCombo: false;
  readonly supportsMultipleCategoriesPerProduct: false;
}

export const PODE_VIR_DOMAIN_CAPABILITIES: Readonly<DomainCapabilities> = Object.freeze({
  productNativePriceCount: 1,
  supportsOptionPriceDelta: true,
  supportsSingleDimensionPriceModelViaComplementGroup: true,
  supportsNonAdditiveMultiDimensionPricing: false,
  supportsCompositeChoiceFlattening: true,
  supportsSharedGroupsByProducts: true,
  supportsSharedGroupsByCategories: true,
  supportsEmbeddedGroups: true,
  supportsOptionQuantity: true,
  optionQuantityTransportMaximum: 20,
  supportsMaximumPerOption: true,
  supportsMinimumPerOption: false,
  supportsConditionalGroups: false,
  supportsOptionImage: false,
  supportsProductPreorderLeadTime: true,
  supportsFixedCombo: true,
  supportsStagedCombo: true,
  supportsExclusiveComboProducts: true,
  supportsNestedCombo: false,
  supportsMultipleCategoriesPerProduct: false,
});

/* ==========================================================================
   2. ENUMS E TIPOS CANÔNICOS
   ========================================================================== */

export type ProductPriceOrigin =
  | 'source'
  | 'derived'
  | 'technical_zero_exclusive_combo'
  | 'missing';

export const productPriceOriginSchema = z.enum([
  'source',
  'derived',
  'technical_zero_exclusive_combo',
  'missing',
]);

export type UnresolvedType =
  | 'missing_price'
  | 'source_conflict'
  | 'unsupported_domain_rule'
  | 'ambiguous_product_boundary'
  | 'ambiguous_group_scope'
  | 'ambiguous_rule_scope'
  | 'incomplete_combo_component'
  | 'unrepresentable_pricing_matrix'
  | 'ambiguous_category'
  | 'missing_required_data'
  | 'ambiguous_price_semantics'
  | 'unsupported_option_image'
  | 'unsupported_per_option_schedule'
  | 'unsupported_per_product_deposit'
  | 'unsafe_shared_photo'
  | 'unsupported_minimum_per_option'
  | 'unsupported_conditional_group';

export const unresolvedTypeSchema = z.enum([
  'missing_price',
  'source_conflict',
  'unsupported_domain_rule',
  'ambiguous_product_boundary',
  'ambiguous_group_scope',
  'ambiguous_rule_scope',
  'incomplete_combo_component',
  'unrepresentable_pricing_matrix',
  'ambiguous_category',
  'missing_required_data',
  'ambiguous_price_semantics',
  'unsupported_option_image',
  'unsupported_per_option_schedule',
  'unsupported_per_product_deposit',
  'unsafe_shared_photo',
  'unsupported_minimum_per_option',
  'unsupported_conditional_group',
]);

/* ==========================================================================
   3. SCHEMAS ZOD RAW (INTERAÇÃO DIRETA COM A IA — ÍNDICES INTEIROS)
   ========================================================================== */

export const rawPricingObservationSchema = z.object({
  productCandidateIndex: z.number().int().min(0),
  amountCents: z.number().int().nonnegative(),
  selectors: z
    .array(
      z.object({
        choiceGroupIndex: z.number().int().min(0),
        optionIndex: z.number().int().min(0),
      })
    )
    .default([]),
  rawText: z.string().default(''),
  sourcePages: z.array(z.number().int().min(1)).default([]),
});

export const rawProductCandidateSchema = z.object({
  name: z.string().trim().min(1, 'Nome do produto candidato é obrigatório'),
  description: z.string().nullable().optional().default(null),
  sourcePages: z.array(z.number().int().min(1)).default([]),
  categoryHint: z.string().nullable().optional().default(null),
  prices: z
    .array(
      z.object({
        label: z.string().nullable().optional().default(null),
        amountCents: z.number().int().nonnegative().nullable().optional().default(null),
        prefix: z.string().nullable().optional().default(null),
        unit: z.string().nullable().optional().default(null),
        rawText: z.string().default(''),
      })
    )
    .default([]),
  rawEvidence: z.string().nullable().optional().default(null),
});

export const rawChoiceOptionSchema = z.object({
  name: z.string().trim().min(1, 'Nome da opção é obrigatório'),
  rawText: z.string().nullable().optional().default(null),
  amountCents: z.number().int().nonnegative().nullable().optional().default(null),
  priceRawText: z.string().nullable().optional().default(null),
});

export const rawChoiceGroupSchema = z.object({
  title: z.string().nullable().optional().default(null),
  sourcePages: z.array(z.number().int().min(1)).default([]),
  instruction: z.string().nullable().optional().default(null),
  parentCandidateIndex: z.number().int().min(0).nullable().optional().default(null),
  appliesToCandidateIndexes: z.array(z.number().int().min(0)).optional(),
  options: z.array(rawChoiceOptionSchema).default([]),
  rawEvidence: z.string().nullable().optional().default(null),
});

export const rawRuleBlockSchema = z.object({
  title: z.string().nullable().optional().default(null),
  body: z.string().trim().min(1, 'Corpo da regra não pode ser vazio'),
  scope: z.enum(['global', 'products', 'category', 'ambiguous']).optional(),
  targetCandidateIndexes: z.array(z.number().int().min(0)).optional(),
  targetCategoryIndexes: z.array(z.number().int().min(0)).optional(),
  sourcePages: z.array(z.number().int().min(1)).default([]),
  rawEvidence: z.string().nullable().optional().default(null),
});

export const rawComboComponentSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().int().min(1).default(1),
  rawText: z.string().default(''),
  productCandidateIndex: z.number().int().min(0).nullable().optional().default(null),
  isFixed: z.boolean().default(true),
});

export const rawComboEvidenceSchema = z.object({
  rawTitle: z.string().trim().min(1),
  rawDescription: z.string().nullable().optional().default(null),
  observedPriceCents: z.number().int().nonnegative().nullable().optional().default(null),
  components: z.array(rawComboComponentSchema).default([]),
  rawText: z.string().default(''),
  sourcePages: z.array(z.number().int().min(1)).default([]),
});

export const rawPhotoSchema = z.object({
  productIndex: z.number().int().min(0),
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

export const rawResidualTextSchema = z.object({
  text: z.string().trim().min(1),
  sourcePage: z.number().int().min(1),
  probableRole: z.string().nullable().optional().default(null),
});

export const rawCategoryPlanSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().default(''),
  order: z.number().int().default(0),
  sourceEvidenceCandidateIndexes: z.array(z.number().int().min(0)).default([]),
});

export const rawPreorderPolicySchema = z
  .object({
    availability: z.enum(['immediate_only', 'scheduled_only', 'both']).nullable().optional().default(null),
    minLeadMinutes: z.number().int().min(0).max(525_600).nullable().optional().default(null),
  })
  .nullable()
  .optional()
  .default(null);

export const rawFixedComboConfigSchema = z.object({
  mode: z.literal('fixed'),
  comboBasePriceCents: z.number().int().nonnegative().nullable().optional().default(null),
  items: z
    .array(
      z.object({
        productIndex: z.number().int().min(0),
        quantity: z.number().int().min(1).default(1),
      })
    )
    .default([]),
});

export const rawStagedComboConfigSchema = z.object({
  mode: z.literal('stages'),
  comboBasePriceCents: z.number().int().nonnegative().nullable().optional().default(null),
  stages: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        order: z.number().int().default(0),
        stageValueCents: z.number().int().nonnegative().default(0),
        chargeComplements: z.boolean().default(false),
        options: z
          .array(
            z.object({
              productIndex: z.number().int().min(0),
              extraCents: z.number().int().nonnegative().default(0),
              order: z.number().int().default(0),
            })
          )
          .default([]),
      })
    )
    .default([]),
});

export const rawPriceSourceRefSchema = z.object({
  candidateIndex: z.number().int().min(0),
  priceIndex: z.number().int().min(0),
});

export const rawProductPlanSchema = z.object({
  kind: z.enum(['product', 'combo']).default('product'),
  name: z.string().trim().min(1),
  description: z.string().nullable().optional().default(null),
  categoryIndex: z.number().int().min(0).nullable().optional().default(null),
  basePriceCents: z.number().int().nonnegative().nullable().optional().default(null),
  basePriceSource: rawPriceSourceRefSchema.nullable().optional(),
  priceOrigin: productPriceOriginSchema.default('missing'),
  exclusiveToCombo: z.boolean().default(false),
  order: z.number().int().default(0),
  preorderPolicy: rawPreorderPolicySchema,
  combo: z.union([rawFixedComboConfigSchema, rawStagedComboConfigSchema]).nullable().optional().default(null),
  sourceProductCandidateIndexes: z.array(z.number().int().min(0)).default([]),
  sourceRuleIndexes: z.array(z.number().int().min(0)).optional().default([]),
});

export const rawComplementOptionPlanSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().default(''),
  priceDeltaCents: z.number().int().default(0),
  maximumPerItem: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  sourceChoiceGroupIndex: z.number().int().min(0).nullable().optional().default(null),
  sourceOptionIndex: z.number().int().min(0).nullable().optional().default(null),
  sourcePriceRefs: z.array(rawPriceSourceRefSchema).optional(),
});

export const rawComplementGroupPlanSchema = z.object({
  name: z.string().trim().min(1),
  placementType: z.enum(['embedded_product', 'shared']).default('embedded_product'),
  parentProductIndex: z.number().int().min(0).nullable().optional().default(null),
  targetProductIndexes: z.array(z.number().int().min(0)).default([]),
  targetCategoryIndexes: z.array(z.number().int().min(0)).default([]),
  required: z.boolean().default(false),
  minimum: z.number().int().min(0).default(0),
  maximum: z.number().int().min(1).default(1),
  active: z.boolean().default(true),
  options: z.array(rawComplementOptionPlanSchema).default([]),
  sourceChoiceGroupIndexes: z.array(z.number().int().min(0)).default([]),
});

export const rawProductImagePlanSchema = z.object({
  productIndex: z.number().int().min(0),
  sourcePhotoIndex: z.number().int().min(0),
  confidence: z.number().min(0).max(1).default(1),
  transformation: z.enum(['use_crop', 'use_full_source_image', 'requires_review']).default('use_crop'),
});

export const rawStorePolicyProposalSchema = z
  .object({
    pedidoMinimoCents: z.number().int().nonnegative().nullable().optional().default(null),
    sourceRuleIndexes: z.array(z.number().int().min(0)).optional().default([]),
    globalPreorder: z
      .object({
        minLeadMinutes: z.number().int().min(0).max(525_600).nullable().optional().default(null),
        salesMode: z.enum(['immediate_only', 'scheduled_only', 'both']).nullable().optional().default(null),
        sourceRuleIndexes: z.array(z.number().int().min(0)).optional().default([]),
      })
      .nullable()
      .optional()
      .default(null),
  })
  .nullable()
  .optional()
  .default(null);

export const rawUnresolvedIssueSchema = z.object({
  type: unresolvedTypeSchema,
  severity: z.enum(['blocker', 'warning']).default('blocker'),
  found: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  evidenceCandidateIndexes: z.array(z.number().int().min(0)).default([]),
  evidenceChoiceGroupIndexes: z.array(z.number().int().min(0)).default([]),
  evidenceRuleIndexes: z.array(z.number().int().min(0)).default([]),
  evidencePriceRefs: z.array(rawPriceSourceRefSchema).optional().default([]),
  affectedProductIndexes: z.array(z.number().int().min(0)).default([]),
  affectedGroupIndexes: z.array(z.number().int().min(0)).default([]),
  possibleResolutions: z.array(z.string()).default([]),
});

export const catalogImportDomainRawAnalysisSchema = z.object({
  isMenu: z.boolean(),
  document: z
    .object({
      sourceType: z.enum(['pdf', 'image']).default('pdf'),
      globalTitle: z.string().nullable().optional().default(null),
      globalTitleRole: z
        .enum(['document_title', 'brand', 'commercial_category', 'unknown'])
        .default('unknown'),
      brand: z.string().nullable().optional().default(null),
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
            role: z.string().default('category'),
            sourcePages: z.array(z.number().int().min(1)).default([]),
          })
        )
        .default([]),
    })
    .default({
      sourceType: 'pdf',
      globalTitle: null,
      globalTitleRole: 'unknown',
      brand: null,
      pageCoverage: [],
      sections: [],
    }),
  sourceEvidence: z
    .object({
      productCandidates: z.array(rawProductCandidateSchema).default([]),
      pricingObservations: z.array(rawPricingObservationSchema).default([]),
      choiceGroups: z.array(rawChoiceGroupSchema).default([]),
      ruleBlocks: z.array(rawRuleBlockSchema).default([]),
      comboEvidence: z.array(rawComboEvidenceSchema).default([]),
      photos: z.array(rawPhotoSchema).default([]),
      residualTexts: z.array(rawResidualTextSchema).default([]),
    })
    .default({
      productCandidates: [],
      pricingObservations: [],
      choiceGroups: [],
      ruleBlocks: [],
      comboEvidence: [],
      photos: [],
      residualTexts: [],
    }),
  importPlan: z
    .object({
      categories: z.array(rawCategoryPlanSchema).default([]),
      products: z.array(rawProductPlanSchema).default([]),
      complementGroups: z.array(rawComplementGroupPlanSchema).default([]),
      productImages: z.array(rawProductImagePlanSchema).default([]),
      storePolicy: rawStorePolicyProposalSchema,
    })
    .default({
      categories: [],
      products: [],
      complementGroups: [],
      productImages: [],
      storePolicy: null,
    }),
  unresolved: z.array(rawUnresolvedIssueSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export type CatalogImportDomainRawAnalysis = z.infer<
  typeof catalogImportDomainRawAnalysisSchema
>;
export type CatalogImportDomainRawInput = z.input<
  typeof catalogImportDomainRawAnalysisSchema
>;

/* ==========================================================================
   4. CONTRATO NORMALIZADO FINAL (CHAVES DETERMINÍSTICAS PARA UI E BANCO)
   ========================================================================== */

export interface SourcePricingObservation {
  observationKey: string;
  candidateKey: string;
  amountCents: number;
  selectors: Array<{
    groupKey: string;
    optionKey: string;
  }>;
  rawText: string;
  sourcePages: number[];
}

export interface SourceComboComponent {
  name: string;
  quantity: number;
  rawText: string;
  candidateKey: string | null;
  isFixed: boolean;
}

export interface SourceComboEvidence {
  comboKey: string;
  rawTitle: string;
  rawDescription: string | null;
  observedPriceCents: number | null;
  components: SourceComboComponent[];
  rawText: string;
  sourcePages: number[];
}

export interface NormalizedSourceEvidence {
  document: {
    sourceType: 'pdf' | 'image';
    globalTitle: string | null;
    globalTitleRole: 'document_title' | 'brand' | 'commercial_category' | 'unknown';
    brand: string | null;
    pageCount: number | null;
    pageCoverage: Array<{
      pageNumber: number;
      role: string;
      hasCatalogEvidence: boolean;
      notes?: string | null;
    }>;
    sections: Array<{
      headingKey: string;
      name: string;
      role: string;
      sourcePages: number[];
    }>;
  };
  productCandidates: Array<{
    candidateKey: string;
    name: string;
    description: string | null;
    sourcePages: number[];
    categoryHint: string | null;
    prices: Array<{
      priceKey?: string;
      label: string | null;
      amountCents: number | null;
      prefix: string | null;
      unit: string | null;
      rawText: string;
    }>;
    rawEvidence: string | null;
  }>;
  pricingObservations: SourcePricingObservation[];
  choiceGroups: Array<{
    groupKey: string;
    title: string | null;
    sourcePages: number[];
    instruction: string | null;
    appliesToCandidateKeys?: string[];
    parentCandidateKey: string | null;
    options: Array<{
      optionKey: string;
      name: string;
      rawText: string | null;
      amountCents: number | null;
      priceRawText: string | null;
    }>;
    rawEvidence: string | null;
  }>;
  ruleBlocks: Array<{
    ruleKey: string;
    title: string | null;
    body: string;
    scope?: 'global' | 'products' | 'category' | 'ambiguous';
    targetCandidateKeys?: string[];
    targetCategoryKeys?: string[];
    sourcePages: number[];
    rawEvidence: string | null;
  }>;
  comboEvidence: SourceComboEvidence[];
  photos: Array<{
    photoKey: string;
    candidateKey: string | null;
    pageNumber: number | null;
    photoBox: [number, number, number, number] | null;
    photoRelation: 'direct' | 'shared' | 'ambiguous' | 'none';
    photoWarning?: string | null;
  }>;
  residualTexts: Array<{
    text: string;
    sourcePage: number;
    probableRole?: string | null;
  }>;
}

export interface CategoryPlan {
  key: string;
  name: string;
  description: string;
  order: number;
  sourceEvidenceKeys: string[];
}

export interface ProductPlanBase {
  key: string;
  name: string;
  description: string | null;
  categoryKey: string | null;
  exclusiveToCombo: boolean;
  order: number;
  preorderPolicy?: {
    availability: 'immediate_only' | 'scheduled_only' | 'both' | null;
    minLeadMinutes: number | null;
  } | null;
  basePriceSourceKey?: string | null;
  sourceEvidenceKeys: string[];
  sourceRuleKeys: string[];
}

export interface RegularProductPlan extends ProductPlanBase {
  kind: 'product';
  basePriceCents: number | null;
  priceOrigin: ProductPriceOrigin;
}

export interface FixedComboPlanConfig {
  mode: 'fixed';
  comboBasePriceCents: number | null;
  items: Array<{
    productKey: string;
    quantity: number;
  }>;
}

export interface StagedComboPlanConfig {
  mode: 'stages';
  comboBasePriceCents: number | null;
  stages: Array<{
    key: string;
    name: string;
    order: number;
    stageValueCents: number;
    chargeComplements: boolean;
    options: Array<{
      productKey: string;
      extraCents: number;
      order: number;
    }>;
  }>;
}

export interface ComboProductPlan extends ProductPlanBase {
  kind: 'combo';
  combo: FixedComboPlanConfig | StagedComboPlanConfig;
  startingPriceCents: number | null;
}

export type ProductPlan = RegularProductPlan | ComboProductPlan;

export interface ComplementOptionPlan {
  key: string;
  name: string;
  description?: string;
  priceDeltaCents: number;
  maximumPerItem: number;
  active: boolean;
  sourceEvidenceKeys: string[];
  sourcePriceKeys?: string[];
}

export interface ComplementGroupPlan {
  key: string;
  name: string;
  placement:
    | { type: 'embedded_product'; productKey: string }
    | { type: 'shared'; productKeys: string[]; categoryKeys: string[] };
  required: boolean;
  minimum: number;
  maximum: number;
  active: boolean;
  options: ComplementOptionPlan[];
  sourceEvidenceKeys: string[];
}

export interface ProductImagePlan {
  productKey: string;
  sourcePhotoKey: string;
  confidence: number;
  transformation: 'use_crop' | 'use_full_source_image' | 'requires_review';
}

export interface StorePolicyProposal {
  pedidoMinimoCents?: number | null;
  sourceRuleKeys?: string[];
  globalPreorder?: {
    minLeadMinutes?: number | null;
    salesMode?: 'immediate_only' | 'scheduled_only' | 'both' | null;
    sourceRuleKeys?: string[];
  } | null;
}

export interface ImportPlan {
  categories: CategoryPlan[];
  products: ProductPlan[];
  complementGroups: ComplementGroupPlan[];
  productImages: ProductImagePlan[];
  storePolicy?: StorePolicyProposal | null;
}

export interface UnresolvedIssue {
  key: string;
  type: UnresolvedType;
  severity: 'blocker' | 'warning';
  found: string;
  reason: string;
  evidenceKeys: string[];
  evidencePriceKeys?: string[];
  affectedEntityKeys: string[];
  possibleResolutions: string[];
}

export interface DeterministicValidationIssue {
  severity: 'blocker' | 'warning';
  code: string;
  message: string;
  affectedEntityKeys: string[];
  relatedEvidenceKeys: string[];
  details?: Record<string, unknown>;
}

export interface ReviewQueueItem {
  key: string;
  type: string;
  severity: 'blocker' | 'warning';
  provenance: 'model' | 'deterministic' | 'both';
  title: string;
  description: string;
  affectedEntityKeys: string[];
  evidenceKeys: string[];
  possibleResolutions: string[];
  modelDetails?: UnresolvedIssue;
  deterministicDetails?: DeterministicValidationIssue[];
}

export interface CatalogImportDomainAnalysis {
  isMenu: boolean;
  document: NormalizedSourceEvidence['document'];
  sourceEvidence: NormalizedSourceEvidence;
  importPlan: ImportPlan;
  unresolved: UnresolvedIssue[];
  reviewQueue: ReviewQueueItem[];
  validationIssues: DeterministicValidationIssue[];
  warnings: string[];
}

export interface CatalogLabDomainResponse {
  success: true;
  pipeline: 'domain_native';
  model: string;
  modelRequestCount: 1;
  inputTransport: 'signed_url' | 'inline';
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  executionTimeMs: number;
  inferenceTimeMs: number;
  data: CatalogImportDomainAnalysis;
  rawJson: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null;
  warnings: string[];
}

/* ==========================================================================
   5. REVIEW QUEUE HELPER (DEDUPLICAÇÃO ESTRUTURAL PURA)
   ========================================================================== */

/**
 * Constrói a fila consolidada de pendências para o operador humano.
 * Deduplica estruturalmente ocorrências que afetam a mesma entidade e o mesmo tipo de problema,
 * atribuindo procedência ('model', 'deterministic' ou 'both').
 */
export function buildCatalogImportReviewQueue(
  modelUnresolved: UnresolvedIssue[],
  deterministicIssues: DeterministicValidationIssue[]
): ReviewQueueItem[] {
  const queueMap = new Map<string, ReviewQueueItem>();

  // 1. Processa itens vindos do modelo
  for (const item of modelUnresolved) {
    const primaryEntity = item.affectedEntityKeys[0] || 'global';
    const dedupKey = `${primaryEntity}::${item.type}`;

    queueMap.set(dedupKey, {
      key: `rq-${item.key}`,
      type: item.type,
      severity: item.severity,
      provenance: 'model',
      title: item.found,
      description: item.reason,
      affectedEntityKeys: [...item.affectedEntityKeys],
      evidenceKeys: [...item.evidenceKeys],
      possibleResolutions: [...item.possibleResolutions],
      modelDetails: item,
      deterministicDetails: [],
    });
  }

  // 2. Mescla/adiciona itens apurados deterministicamente pelo validador
  let detCounter = 0;
  for (const det of deterministicIssues) {
    const primaryEntity = det.affectedEntityKeys[0] || 'global';
    const normalizedType =
      det.code === 'MISSING_PRICE' || det.code === 'TECHNICAL_ZERO_INVALID'
        ? 'missing_price'
        : det.code === 'PRICING_MATRIX_NON_ADDITIVE'
        ? 'unrepresentable_pricing_matrix'
        : det.code === 'UNSUPPORTED_OPTION_QUANTITY'
        ? 'unsupported_domain_rule'
        : det.code.toLowerCase();

    const dedupKey = `${primaryEntity}::${normalizedType}`;
    const existing = queueMap.get(dedupKey);

    if (existing) {
      existing.provenance = 'both';
      if (det.severity === 'blocker') existing.severity = 'blocker';
      existing.deterministicDetails = existing.deterministicDetails || [];
      existing.deterministicDetails.push(det);
      for (const ent of det.affectedEntityKeys) {
        if (!existing.affectedEntityKeys.includes(ent)) {
          existing.affectedEntityKeys.push(ent);
        }
      }
      for (const ev of det.relatedEvidenceKeys) {
        if (!existing.evidenceKeys.includes(ev)) {
          existing.evidenceKeys.push(ev);
        }
      }
    } else {
      detCounter += 1;
      queueMap.set(dedupKey, {
        key: `rq-det-${detCounter}`,
        type: normalizedType,
        severity: det.severity,
        provenance: 'deterministic',
        title: det.message,
        description: `Validação determinística apurou inconformidade com o domínio: ${det.message}`,
        affectedEntityKeys: [...det.affectedEntityKeys],
        evidenceKeys: [...det.relatedEvidenceKeys],
        possibleResolutions: [
          'Ajustar os dados da entidade ou aceitar como pendência de importação.',
        ],
        modelDetails: undefined,
        deterministicDetails: [det],
      });
    }
  }

  return Array.from(queueMap.values()).sort((a, b) => {
    if (a.severity === 'blocker' && b.severity !== 'blocker') return -1;
    if (a.severity !== 'blocker' && b.severity === 'blocker') return 1;
    return a.title.localeCompare(b.title);
  });
}

/* ==========================================================================
   6. JSON SCHEMA ADJACENTE PARA GOOGLE GENAI INTERACTIONS API
   ========================================================================== */

export const domainNativeJsonSchema = {
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
        },
        brand: {
          type: 'string',
          nullable: true,
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
              role: { type: 'string' },
              sourcePages: { type: 'array', items: { type: 'integer' } },
            },
            required: ['name', 'role', 'sourcePages'],
          },
        },
      },
      required: ['sourceType', 'globalTitleRole', 'pageCoverage', 'sections'],
    },
    sourceEvidence: {
      type: 'object',
      properties: {
        productCandidates: {
          type: 'array',
          description:
            'Ofertas comerciais principais e autônomas identificadas na fonte documental. Não promova personalizações ou opções subordinadas a produto.',
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
        pricingObservations: {
          type: 'array',
          description:
            'Observações de preços compostos e seletores de opções para validação matemática da matriz aditiva.',
          items: {
            type: 'object',
            properties: {
              productCandidateIndex: { type: 'integer' },
              amountCents: { type: 'integer' },
              selectors: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    choiceGroupIndex: { type: 'integer' },
                    optionIndex: { type: 'integer' },
                  },
                  required: ['choiceGroupIndex', 'optionIndex'],
                },
              },
              rawText: { type: 'string' },
              sourcePages: { type: 'array', items: { type: 'integer' } },
            },
            required: ['productCandidateIndex', 'amountCents', 'selectors', 'rawText', 'sourcePages'],
          },
        },
        choiceGroups: {
          type: 'array',
          description:
            'Grupos brutos de opções, variações, personalizações, tamanhos, massas, sabores ou adicionais identificados no documento.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', nullable: true },
              sourcePages: { type: 'array', items: { type: 'integer' } },
              instruction: { type: 'string', nullable: true },
              parentCandidateIndex: { type: 'integer', nullable: true },
              appliesToCandidateIndexes: { type: 'array', items: { type: 'integer' } },
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
          description:
            'Blocos textuais completos de regras de antecedência, pedido mínimo, retirada, entrega ou conservação.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', nullable: true },
              body: { type: 'string' },
              scope: {
                type: 'string',
                enum: ['global', 'products', 'category', 'ambiguous'],
              },
              targetCandidateIndexes: { type: 'array', items: { type: 'integer' } },
              targetCategoryIndexes: { type: 'array', items: { type: 'integer' } },
              sourcePages: { type: 'array', items: { type: 'integer' } },
              rawEvidence: { type: 'string', nullable: true },
            },
            required: ['body', 'sourcePages'],
          },
        },
        comboEvidence: {
          type: 'array',
          description:
            'Evidências de ofertas compostas ou combos com componentes estruturados e preços observados.',
          items: {
            type: 'object',
            properties: {
              rawTitle: { type: 'string' },
              rawDescription: { type: 'string', nullable: true },
              observedPriceCents: { type: 'integer', nullable: true },
              components: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    quantity: { type: 'integer' },
                    rawText: { type: 'string' },
                    productCandidateIndex: { type: 'integer', nullable: true },
                    isFixed: { type: 'boolean' },
                  },
                  required: ['name', 'quantity', 'rawText', 'isFixed'],
                },
              },
              rawText: { type: 'string' },
              sourcePages: { type: 'array', items: { type: 'integer' } },
            },
            required: ['rawTitle', 'components', 'rawText', 'sourcePages'],
          },
        },
        photos: {
          type: 'array',
          description:
            'Avaliação visual individual e obrigatória para cada ProductCandidate (índices 0..N-1 correspondentes). Exatamente uma avaliação por candidato. "direct" para foto específica do produto; "shared" para foto comercial compartilhada; "ambiguous" para relação incerta; "none" quando não houver foto comercial adequada.',
          items: {
            type: 'object',
            properties: {
              productIndex: { type: 'integer' },
              pageNumber: { type: 'integer', nullable: true },
              photoBox: {
                type: 'array',
                items: { type: 'integer' },
                nullable: true,
                description: '[ymin, xmin, ymax, xmax] normalizado 0-1000',
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
      required: [
        'productCandidates',
        'pricingObservations',
        'choiceGroups',
        'ruleBlocks',
        'comboEvidence',
        'photos',
        'residualTexts',
      ],
    },
    importPlan: {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              order: { type: 'integer' },
              sourceEvidenceCandidateIndexes: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
            required: ['name', 'description', 'order'],
          },
        },
        products: {
          type: 'array',
          description:
            'Produtos comerciais principais ou combos estruturados segundo as capacidades do Pode Vir, com preço base único ou exclusiveToCombo.',
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['product', 'combo'],
              },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              categoryIndex: { type: 'integer', nullable: true },
              basePriceCents: { type: 'integer', nullable: true },
              basePriceSource: {
                type: 'object',
                nullable: true,
                properties: {
                  candidateIndex: { type: 'integer' },
                  priceIndex: { type: 'integer' },
                },
                required: ['candidateIndex', 'priceIndex'],
              },
              priceOrigin: {
                type: 'string',
                enum: ['source', 'derived', 'technical_zero_exclusive_combo', 'missing'],
              },
              exclusiveToCombo: { type: 'boolean' },
              order: { type: 'integer' },
              preorderPolicy: {
                type: 'object',
                nullable: true,
                properties: {
                  availability: {
                    type: 'string',
                    enum: ['immediate_only', 'scheduled_only', 'both'],
                    nullable: true,
                  },
                  minLeadMinutes: { type: 'integer', nullable: true },
                },
              },
              combo: {
                type: 'object',
                nullable: true,
                properties: {
                  mode: { type: 'string', enum: ['fixed', 'stages'] },
                  comboBasePriceCents: { type: 'integer', nullable: true },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        productIndex: { type: 'integer' },
                        quantity: { type: 'integer' },
                      },
                      required: ['productIndex', 'quantity'],
                    },
                  },
                  stages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        order: { type: 'integer' },
                        stageValueCents: { type: 'integer' },
                        chargeComplements: { type: 'boolean' },
                        options: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              productIndex: { type: 'integer' },
                              extraCents: { type: 'integer' },
                              order: { type: 'integer' },
                            },
                            required: ['productIndex', 'extraCents', 'order'],
                          },
                        },
                      },
                      required: ['name', 'order', 'stageValueCents', 'options'],
                    },
                  },
                },
              },
              sourceProductCandidateIndexes: {
                type: 'array',
                items: { type: 'integer' },
              },
              sourceRuleIndexes: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
            required: ['kind', 'name', 'priceOrigin', 'exclusiveToCombo', 'order'],
          },
        },
        complementGroups: {
          type: 'array',
          description:
            'Grupos de opções e personalizações (embedded_product ou shared), com limites min/max e deltas de preço aditivos.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              placementType: {
                type: 'string',
                enum: ['embedded_product', 'shared'],
              },
              parentProductIndex: { type: 'integer', nullable: true },
              targetProductIndexes: { type: 'array', items: { type: 'integer' } },
              targetCategoryIndexes: { type: 'array', items: { type: 'integer' } },
              required: { type: 'boolean' },
              minimum: { type: 'integer' },
              maximum: { type: 'integer' },
              active: { type: 'boolean' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    priceDeltaCents: { type: 'integer' },
                    maximumPerItem: { type: 'integer' },
                    active: { type: 'boolean' },
                    sourceChoiceGroupIndex: { type: 'integer', nullable: true },
                    sourceOptionIndex: { type: 'integer', nullable: true },
                    sourcePriceRefs: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          candidateIndex: { type: 'integer' },
                          priceIndex: { type: 'integer' },
                        },
                        required: ['candidateIndex', 'priceIndex'],
                      },
                    },
                  },
                  required: ['name', 'priceDeltaCents', 'maximumPerItem', 'active'],
                },
              },
              sourceChoiceGroupIndexes: { type: 'array', items: { type: 'integer' } },
            },
            required: ['name', 'placementType', 'required', 'minimum', 'maximum', 'options'],
          },
        },
        productImages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productIndex: { type: 'integer' },
              sourcePhotoIndex: { type: 'integer' },
              confidence: { type: 'number' },
              transformation: {
                type: 'string',
                enum: ['use_crop', 'use_full_source_image', 'requires_review'],
              },
            },
            required: ['productIndex', 'sourcePhotoIndex', 'confidence', 'transformation'],
          },
        },
        storePolicy: {
          type: 'object',
          nullable: true,
          properties: {
            pedidoMinimoCents: { type: 'integer', nullable: true },
            sourceRuleIndexes: {
              type: 'array',
              items: { type: 'integer' },
            },
            globalPreorder: {
              type: 'object',
              nullable: true,
              properties: {
                minLeadMinutes: { type: 'integer', nullable: true },
                salesMode: {
                  type: 'string',
                  enum: ['immediate_only', 'scheduled_only', 'both'],
                  nullable: true,
                },
                sourceRuleIndexes: {
                  type: 'array',
                  items: { type: 'integer' },
                },
              },
            },
          },
        },
      },
      required: ['categories', 'products', 'complementGroups', 'productImages'],
    },
    unresolved: {
      type: 'array',
      description:
        'Pendências, ambiguidades documentais, incompatibilidades estruturais ou regras de negócio que não cabem fielmente no domínio.',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'missing_price',
              'source_conflict',
              'unsupported_domain_rule',
              'ambiguous_product_boundary',
              'ambiguous_group_scope',
              'ambiguous_rule_scope',
              'incomplete_combo_component',
              'unrepresentable_pricing_matrix',
              'ambiguous_category',
              'missing_required_data',
              'ambiguous_price_semantics',
              'unsupported_option_image',
              'unsupported_per_option_schedule',
              'unsupported_per_product_deposit',
              'unsafe_shared_photo',
              'unsupported_minimum_per_option',
              'unsupported_conditional_group',
            ],
          },
          severity: {
            type: 'string',
            enum: ['blocker', 'warning'],
          },
          found: { type: 'string' },
          reason: { type: 'string' },
          evidenceCandidateIndexes: { type: 'array', items: { type: 'integer' } },
          evidenceChoiceGroupIndexes: { type: 'array', items: { type: 'integer' } },
          evidenceRuleIndexes: { type: 'array', items: { type: 'integer' } },
          evidencePriceRefs: {
            type: 'array',
            description: 'Referências específicas aos preços brutos afetados { candidateIndex, priceIndex }.',
            items: {
              type: 'object',
              properties: {
                candidateIndex: { type: 'integer' },
                priceIndex: { type: 'integer' },
              },
              required: ['candidateIndex', 'priceIndex'],
            },
          },
          affectedProductIndexes: { type: 'array', items: { type: 'integer' } },
          affectedGroupIndexes: { type: 'array', items: { type: 'integer' } },
          possibleResolutions: { type: 'array', items: { type: 'string' } },
        },
        required: ['type', 'severity', 'found', 'reason', 'possibleResolutions'],
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['isMenu', 'document', 'sourceEvidence', 'importPlan', 'unresolved', 'warnings'],
};
