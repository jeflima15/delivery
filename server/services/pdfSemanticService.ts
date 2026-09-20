import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';

/* ==========================================================================
   INTERFACES E SCHEMAS - ENRIQUECIMENTO SEMÂNTICO DE PDF (CHAMADA #2)
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
});
export type SemanticItemAssignment = z.infer<typeof itemAssignmentSchema>;

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

export const semanticGroupSchema = z.object({
  groupKey: z.string().trim().min(1, 'groupKey é obrigatório.'),
  name: z.string().trim().min(1, 'Nome do grupo é obrigatório.'),
  kind: semanticGroupKindSchema,
  parentItemKey: z.string().trim().min(1).nullable(),
  itemKeys: z.array(z.string().trim().min(1)).default([]),
  pricingBehavior: groupPricingBehaviorSchema,
});
export type SemanticGroup = z.infer<typeof semanticGroupSchema>;

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
  sourceTextKey: z.string().trim().min(1).nullable(),
  rawText: z.string().trim().nullable().optional().default(null),
  sourcePage: z.number().int().min(1).nullable(),
  relatedItemKey: z.string().trim().min(1).nullable(),
  relatedGroupKey: z.string().trim().min(1).nullable(),
});
export type SemanticBusinessRule = z.infer<typeof businessRuleSchema>;

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
  sourcePage: z.number().int().min(1).nullable(),
  reason: ignoredTextReasonSchema,
});
export type SemanticIgnoredText = z.infer<typeof ignoredTextSchema>;

export const pdfSemanticEnrichmentDataSchema = z.object({
  items: z.array(itemAssignmentSchema).default([]),
  groups: z.array(semanticGroupSchema).default([]),
  businessRules: z.array(businessRuleSchema).default([]),
  ignoredTexts: z.array(ignoredTextSchema).default([]),
  warnings: z.array(z.string()).default([]),
});
export type PdfSemanticEnrichmentData = z.infer<typeof pdfSemanticEnrichmentDataSchema>;

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
  category: string | null;
  name: string;
  sourcePage: number | null;
  prices: Array<{
    label: string | null;
    amountCents: number | null;
  }>;
}

export interface CompactUnmappedText {
  textKey: string;
  rawText: string;
}

/* ==========================================================================
   SCHEMA DO GEMINI (STRUCTURED OUTPUT)
   ========================================================================== */

export const geminiPdfSemanticResponseSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      description: 'Atribuição semântica para CADA itemKey fornecido no input da transcrição literal.',
      items: {
        type: Type.OBJECT,
        properties: {
          itemKey: {
            type: Type.STRING,
            description: 'Identificador exato do item (ex: c0-p0, c1-p0). Deve corresponder a um itemKey do input.',
          },
          kind: {
            type: Type.STRING,
            enum: ['product', 'combo', 'option', 'variant', 'addon', 'informational', 'unknown'],
            description: 'Classificação semântica do item.',
          },
          parentItemKey: {
            type: Type.STRING,
            nullable: true,
            description: 'itemKey do produto pai se este item for uma opção/sabor/adicional/variação de outro item. Null se for produto principal.',
          },
          groupKey: {
            type: Type.STRING,
            nullable: true,
            description: 'groupKey do grupo de opções ao qual este item pertence (ex: g0). Null se não pertencer a nenhum grupo.',
          },
          pricingModel: {
            type: Type.STRING,
            nullable: true,
            enum: ['single', 'quantity_tiers', 'size_variants', 'multiple_prices', 'unknown'],
            description: 'Modelo de precificação do item quando for produto principal (ex: quantity_tiers para faixas de 50/100 unidades). Null para opções.',
          },
        },
        required: ['itemKey', 'kind', 'parentItemKey', 'groupKey', 'pricingModel'],
      },
    },
    groups: {
      type: Type.ARRAY,
      description: 'Grupos semânticos identificados no documento (ex: Sabores, Recheios, Tamanhos).',
      items: {
        type: Type.OBJECT,
        properties: {
          groupKey: {
            type: Type.STRING,
            description: 'Identificador determinístico do grupo (ex: g0, g1).',
          },
          name: {
            type: Type.STRING,
            description: 'Nome do grupo como visto no documento (ex: Sabores, Recheios).',
          },
          kind: {
            type: Type.STRING,
            enum: ['option_group', 'variant_group', 'addon_group', 'unknown'],
            description: 'Tipo do grupo.',
          },
          parentItemKey: {
            type: Type.STRING,
            nullable: true,
            description: 'itemKey do produto pai ao qual o grupo se vincula (ex: c0-p0 para o brigadeiro). Null se aplicável a múltiplos ou genérico.',
          },
          itemKeys: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Lista de itemKeys que pertencem a este grupo.',
          },
          pricingBehavior: {
            type: Type.STRING,
            enum: ['inherits_parent', 'own_price_per_item', 'mixed', 'no_price', 'unknown'],
            description: 'Comportamento de preço do grupo. inherits_parent quando as opções não têm preço próprio pois o cliente paga pelo produto pai.',
          },
        },
        required: ['groupKey', 'name', 'kind', 'parentItemKey', 'itemKeys', 'pricingBehavior'],
      },
    },
    businessRules: {
      type: Type.ARRAY,
      description: 'Regras comerciais e condições de pedido explícitas extraídas do documento.',
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
          sourceTextKey: {
            type: Type.STRING,
            nullable: true,
            description: 'textKey do unmappedTexts de onde a regra foi extraída (ex: u0). Se a regra estiver vinculada diretamente a um item, pode ser null.',
          },
          sourcePage: {
            type: Type.INTEGER,
            nullable: true,
            description: 'Número da página do documento onde a regra se encontra (>= 1).',
          },
          relatedItemKey: {
            type: Type.STRING,
            nullable: true,
            description: 'itemKey do produto relacionado a esta regra se for específica para um produto. Null se for regra geral.',
          },
          relatedGroupKey: {
            type: Type.STRING,
            nullable: true,
            description: 'groupKey do grupo relacionado a esta regra se houver. Null caso contrário.',
          },
        },
        required: ['type', 'sourceTextKey', 'sourcePage', 'relatedItemKey', 'relatedGroupKey'],
      },
    },
    ignoredTexts: {
      type: Type.ARRAY,
      description: 'Textos que representam resíduos de template, slogans decorativos ou dados de contato sem valor de catálogo.',
      items: {
        type: Type.OBJECT,
        properties: {
          sourceTextKey: {
            type: Type.STRING,
            nullable: true,
            description: 'textKey do unmappedTexts identificado como ruído/placeholder (ex: u1).',
          },
          sourcePage: {
            type: Type.INTEGER,
            nullable: true,
            description: 'Número da página onde o texto se encontra (>= 1).',
          },
          reason: {
            type: Type.STRING,
            enum: ['placeholder', 'marketing', 'contact', 'decorative', 'duplicate', 'irrelevant', 'other'],
            description: 'Motivo pelo qual o texto deve ser ignorado no catálogo.',
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
   VALIDAÇÃO DE CONSISTÊNCIA REFERENCIAL ESTREITA (BACKEND)
   ========================================================================== */

export function validateSemanticReferences(
  data: PdfSemanticEnrichmentData,
  validItemKeys: Set<string>,
  validTextKeysMap: Map<string, string>
): PdfSemanticEnrichmentData {
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

  // Verifica se a IA omitiu algum item ou inventou chaves
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

  // 2. VALIDAÇÃO DOS GRUPOS
  const groupKeys = new Set<string>();
  const groupMap = new Map<string, SemanticGroup>();

  for (const group of data.groups) {
    if (groupKeys.has(group.groupKey)) {
      throw new HttpError(
        502,
        `groupKey duplicado na resposta semântica: "${group.groupKey}".`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }
    groupKeys.add(group.groupKey);
    groupMap.set(group.groupKey, group);

    if (group.parentItemKey !== null && !validItemKeys.has(group.parentItemKey)) {
      throw new HttpError(
        502,
        `group "${group.groupKey}" referencia parentItemKey inexistente: "${group.parentItemKey}".`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }

    // Validação dos itemKeys do grupo
    const groupItemsSet = new Set<string>();
    for (const memberKey of group.itemKeys) {
      if (!validItemKeys.has(memberKey)) {
        throw new HttpError(
          502,
          `group "${group.groupKey}" referencia itemKey inexistente: "${memberKey}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
      if (groupItemsSet.has(memberKey)) {
        throw new HttpError(
          502,
          `group "${group.groupKey}" possui itemKey duplicado: "${memberKey}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
      groupItemsSet.add(memberKey);
    }
  }

  // 3. CONSISTÊNCIA BIDIRECIONAL ITENS <-> GRUPOS E PARENTESCO
  const assignmentMap = new Map<string, SemanticItemAssignment>();
  for (const item of data.items) {
    assignmentMap.set(item.itemKey, item);

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

  // 4. RASTREABILIDADE E RESOLUÇÃO DE BUSINESS RULES
  const resolvedRules: SemanticBusinessRule[] = [];
  for (const rule of data.businessRules) {
    // Não permitir regra sem nenhuma origem rastreável
    if (!rule.sourceTextKey && !rule.relatedItemKey) {
      throw new HttpError(
        502,
        `Regra de negócio sem origem rastreável: deve possuir sourceTextKey ou relatedItemKey.`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }

    let resolvedRawText = rule.rawText || '';

    if (rule.sourceTextKey !== null) {
      if (!validTextKeysMap.has(rule.sourceTextKey)) {
        throw new HttpError(
          502,
          `Regra de negócio referencia sourceTextKey inexistente: "${rule.sourceTextKey}".`,
          'INVALID_SEMANTIC_REFERENCES'
        );
      }
      // Sempre priorizar e resolver com o texto original da extração #1
      resolvedRawText = validTextKeysMap.get(rule.sourceTextKey) || resolvedRawText;
    }

    if (rule.relatedItemKey !== null && !validItemKeys.has(rule.relatedItemKey)) {
      throw new HttpError(
        502,
        `Regra de negócio referencia relatedItemKey inexistente: "${rule.relatedItemKey}".`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }

    if (rule.relatedGroupKey !== null && !groupKeys.has(rule.relatedGroupKey)) {
      throw new HttpError(
        502,
        `Regra de negócio referencia relatedGroupKey inexistente: "${rule.relatedGroupKey}".`,
        'INVALID_SEMANTIC_REFERENCES'
      );
    }

    resolvedRules.push({
      ...rule,
      rawText: resolvedRawText,
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
   CONSTRUTOR DO PROMPT
   ========================================================================== */

export function buildPdfSemanticPrompt(
  compactItems: CompactPdfMenuItem[],
  compactTexts: CompactUnmappedText[]
): string {
  const itemsJson = JSON.stringify(compactItems, null, 2);
  const textsJson = JSON.stringify(compactTexts, null, 2);

  return `Você é um especialista sênior em arquitetura de cardápios, precificação e engenharia de menus para delivery e comércio alimentício.

Seu objetivo nesta etapa NÃO É fazer OCR e NÃO É transcrever texto. A transcrição literal já foi realizada com precisão na primeira etapa.
Sua tarefa é analisar o documento PDF anexado em conjunto com a lista de itens e textos já extraídos para **INTERPRETAR A ESTRUTURA COMERCIAL, RELAÇÕES PAI/FILHO, GRUPOS DE OPÇÕES E REGRAS DE PEDIDO**.

---
### ENTRADA FORNECIDA:

1. **ITENS EXTRAÍDOS NA ETAPA 1 (com chaves determinísticas itemKey):**
\`\`\`json
${itemsJson}
\`\`\`

2. **TEXTOS NÃO MAPEADOS EXTRAÍDOS NA ETAPA 1 (com chaves determinísticas textKey):**
\`\`\`json
${textsJson}
\`\`\`

---
### DIRETRIZES CRÍTICAS DE INTERPRETAÇÃO:

1. **COBERTURA TOTAL DOS ITENS**:
   - Você DEVE retornar exatamente UMA entrada em "items" para CADA "itemKey" fornecido acima (${compactItems.map((i) => i.itemKey).join(', ')}).
   - NUNCA omita nenhum itemKey.
   - NUNCA crie novos itemKeys não listados.
   - NUNCA duplique um itemKey.

2. **RELAÇÕES PAI/FILHO E DISTINÇÃO DE PRODUTO VS. OPÇÃO/SABOR**:
   - Cardápios de confeitaria, pizzarias, lanchonetes e restaurantes frequentemente listam um produto principal com preços (ex.: "BRIGADEIROS de festa" com faixas de 50 e 100 unidades) e, em seguida ou em outra página, uma lista de opções/sabores/recheios (ex.: Amendoim, Beijinho, Chocolate...).
   - Esses sabores/opções NÃO são produtos independentes para venda avulsa. Eles são opções pertencentes a um produto principal!
   - Quando identificar esse padrão:
     - O item principal recebe \`kind: "product"\`, \`parentItemKey: null\`, \`groupKey: null\` e \`pricingModel: "quantity_tiers"\` (ou "size_variants" conforme aplicável).
     - Crie um grupo em \`groups\` com \`name: "Sabores"\` (ou o título exato visto no documento), \`kind: "option_group"\`, \`parentItemKey: <itemKey_do_produto_pai>\`, \`pricingBehavior: "inherits_parent"\`, listando os itemKeys das opções em \`itemKeys\`.
     - Cada sabor recebe \`kind: "option"\`, \`parentItemKey: <itemKey_do_produto_pai>\` e \`groupKey: <groupKey_do_grupo>\`.
   - **NÃO INVENTE RELAÇÕES**: Se um item for genuinamente um produto independente ou se houver dúvida se pertence a outro, mantenha \`parentItemKey: null\`, \`groupKey: null\` e \`kind: "product"\` ou \`"unknown"\`.

3. **CONSISTÊNCIA BIDIRECIONAL DE GRUPOS**:
   - Se um item tem \`groupKey: "g0"\`, o grupo "g0" DEVE conter esse itemKey em \`itemKeys\`.
   - Se o grupo "g0" lista um itemKey em \`itemKeys\`, esse item DEVE ter \`groupKey: "g0"\`.
   - Um item só pode pertencer a no máximo UM grupo.

4. **REGRAS COMERCIAIS (businessRules)**:
   - Identifique condições reais de pedido, tais como:
     - \`minimum_order\`: Pedido mínimo (ex: "Pedido mínimo: 25 unidades por sabor").
     - \`advance_notice\`: Prazos de antecedência de encomenda (ex: "encomendas com 3 dias de antecedência").
     - \`serving_guidance\`: Recomendações de quantidade por pessoa (ex: "Recomendamos de 6 a 8 doces por pessoa"). Não transforme recomendação em pedido mínimo!
     - \`packaging\`: Informações sobre caixas, forminhas ou embalagens.
     - \`ordering_instruction\`: Instruções operacionais de envio de pedido.
   - Toda regra de negócio DEVE ter origem rastreável: referencie \`sourceTextKey\` correspondente ao texto em unmappedTexts (ex: "u0") OU informe \`relatedItemKey\` se vier diretamente da descrição/aviso de um produto.
   - NUNCA invente números ou obrigações não presentes no documento.

5. **RUÍDOS E PLACEHOLDERS (ignoredTexts)**:
   - Identifique textos residuais de templates ou sem relação com o catálogo comercial:
     - \`placeholder\`: Textos de rascunho de templates de design (ex: "Texto do seu parágrafo", "Lorem ipsum", "Adicione seu texto aqui").
     - \`marketing\`: Slogans genéricos não comerciais.
     - \`contact\`: Dados de endereço, telefone ou redes sociais isolados.
   - Referencie o \`sourceTextKey\` exato da lista de unmappedTexts.

Responda exclusivamente no formato JSON especificado pelo schema, com precisão técnica e rigor referencial.`;
}

/* ==========================================================================
   FUNÇÃO PRINCIPAL DE ANÁLISE SEMÂNTICA COM O GEMINI
   ========================================================================== */

export async function analyzePdfSemanticEnrichmentWithGemini(
  buffer: Buffer,
  mimeType: string,
  compactItems: CompactPdfMenuItem[],
  compactTexts: CompactUnmappedText[]
): Promise<PdfSemanticEnrichmentSuccess> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.CATALOG_IMPORT_MODEL;

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
  const prompt = buildPdfSemanticPrompt(compactItems, compactTexts);

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

  // Validação de integridade referencial estrita
  const validItemKeys = new Set(compactItems.map((i) => i.itemKey));
  const validTextKeysMap = new Map(compactTexts.map((t) => [t.textKey, t.rawText]));

  const validatedData = validateSemanticReferences(parseResult.data, validItemKeys, validTextKeysMap);

  return {
    status: 'ok',
    model,
    executionTimeMs,
    data: validatedData,
    rawJson: rawText,
  };
}
