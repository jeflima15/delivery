import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';

/* ==========================================================================
   INTERFACES E SCHEMAS - AUDITORIA DE COBERTURA DE CARDÁPIO (CHAMADA #4)
   ========================================================================== */

export const auditIssueSeveritySchema = z.enum(['high', 'medium', 'low']);
export type AuditIssueSeverity = z.infer<typeof auditIssueSeveritySchema>;

export const auditIssueTypeSchema = z.enum([
  'missing_product',
  'missing_choice_group',
  'missing_option',
  'missing_rule',
  'missing_price',
  'wrong_category',
  'missing_related_page',
  'photo_candidate_gap',
  'possible_noise',
  'overpromoted_product',
  'fragmented_product_family',
  'unsupported_domain_rule',
  'other',
]);
export type AuditIssueType = z.infer<typeof auditIssueTypeSchema>;

export const auditIssueOriginSchema = z.enum(['gemini', 'deterministic']);
export type AuditIssueOrigin = z.infer<typeof auditIssueOriginSchema>;

export const pdfAuditIssueSchema = z.object({
  severity: auditIssueSeveritySchema,
  type: auditIssueTypeSchema,
  sourcePage: z.number().int().min(1).nullable().optional().default(null),
  relatedItemKey: z.string().trim().min(1).nullable().optional().default(null),
  relatedGroupKey: z.string().trim().min(1).nullable().optional().default(null),
  message: z.string().trim().min(1, 'Mensagem da issue é obrigatória.'),
  evidence: z.string().trim().nullable().optional().default(null),
  origin: auditIssueOriginSchema.optional().default('gemini'),
});
export type PdfAuditIssue = z.infer<typeof pdfAuditIssueSchema>;

export const pdfAuditDataSchema = z.object({
  issues: z.array(pdfAuditIssueSchema).default([]),
  warnings: z.array(z.string()).default([]),
});
export type PdfAuditData = z.infer<typeof pdfAuditDataSchema>;

export interface PdfAuditSuccess {
  status: 'ok';
  model: string;
  executionTimeMs: number;
  data: PdfAuditData;
  rawJson: string;
}

export interface PdfAuditFailure {
  status: 'failed';
  error: {
    code: string;
    message: string;
  };
}

export type PdfAuditResult = PdfAuditSuccess | PdfAuditFailure;

/* ==========================================================================
   SCHEMA GEMINI STRUCTURED OUTPUT (CHAMADA #4)
   ========================================================================== */

export const geminiPdfAuditResponseSchema = {
  type: Type.OBJECT,
  description: 'Auditoria de cobertura semântica de cardápio lido a partir de PDF multipágina.',
  properties: {
    issues: {
      type: Type.ARRAY,
      description: 'Lista de lacunas ou discrepâncias comerciais detectadas no documento em relação à extração.',
      items: {
        type: Type.OBJECT,
        properties: {
          severity: {
            type: Type.STRING,
            enum: ['high', 'medium', 'low'],
            description:
              'HIGH: informação essencial para montagem ou pedido ausente/incompleta (sabores, massas, produtos, regras obrigatórias). MEDIUM: estrutura existe, mas associação ou detalhe incompleto. LOW: ruído, aviso secundário ou sugestão não bloqueante.',
          },
          type: {
            type: Type.STRING,
            enum: [
              'missing_product',
              'missing_choice_group',
              'missing_option',
              'missing_rule',
              'missing_price',
              'wrong_category',
              'missing_related_page',
              'photo_candidate_gap',
              'possible_noise',
              'overpromoted_product',
              'fragmented_product_family',
              'unsupported_domain_rule',
              'other',
            ],
            description: 'Tipo da lacuna detectada.',
          },
          sourcePage: {
            type: Type.INTEGER,
            nullable: true,
            description: 'Número humano da página (1, 2, 3...) onde a evidência física reside no PDF, ou null.',
          },
          relatedItemKey: {
            type: Type.STRING,
            nullable: true,
            description: 'itemKey relacionado se a issue disser respeito a um item específico (ex: c0-p0), ou null.',
          },
          relatedGroupKey: {
            type: Type.STRING,
            nullable: true,
            description: 'groupKey relacionado se a issue disser respeito a um grupo (ex: g0), ou null.',
          },
          message: {
            type: Type.STRING,
            description: 'Explicação clara, objetiva e em português sobre o que foi perdido ou está incorreto.',
          },
          evidence: {
            type: Type.STRING,
            nullable: true,
            description: 'Texto literal curto visível no documento que comprova a issue.',
          },
        },
        required: ['severity', 'type', 'message'],
      },
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Observações gerais ou alertas da auditoria.',
    },
  },
  required: ['issues', 'warnings'],
};

/* ==========================================================================
   PROMPT DO SISTEMA PARA AUDITORIA (CHAMADA #4)
   ========================================================================== */

export function buildAuditPrompt(t1Summary: unknown, t2Summary: unknown): string {
  return `Você é um auditor rigoroso e conservador de cardápios de restaurantes processados por IA.
Sua missão é EXCLUSIVAMENTE auditar se informações comerciais importantes presentes no documento PDF foram perdidas ou representadas inadequadamente pelas etapas anteriores.

NÃO refaça o OCR.
NÃO tente corrigir ou editar o cardápio.
NÃO invente problemas.
NÃO crie issues sem evidência física e textual concreta visível nas páginas do PDF.

DADOS EXTRAÍDOS NA ETAPA 1 (EVIDÊNCIAS TEXTUAIS BRUTAS):
${JSON.stringify(t1Summary, null, 2)}

DADOS INTERPRETADOS NA ETAPA 2 (DOMÍNIO SEMÂNTICO DO RESTAURANTE):
${JSON.stringify(t2Summary, null, 2)}

DIRETRIZES DE AUDITORIA:
1. Verifique tanto OMISSÕES (itens faltantes) quanto SUPEREXTRAÇÃO (itens indevidamente promovidos a produtos):
   - "missing_product": produtos ou pacotes comerciais visíveis que não aparecem nos itens;
   - "missing_choice_group": listas de escolhas (sabores, massas, recheios, coberturas, acompanhamentos) visíveis no PDF que ficaram sem grupo semântico correspondente;
   - "missing_option": opções específicas de uma lista que foram ignoradas;
   - "missing_rule": regras operacionais obrigatórias (pedidos mínimos, prazos de antecedência, taxas de entrega/retirada, horários) que foram perdidas;
   - "missing_price": preços explícitos associados a itens ou opções que não foram capturados;
   - "wrong_category": categorias completamente invertidas ou com cabeçalhos de produtos indevidamente categorizados;
   - "photo_candidate_gap": a estrutura semântica deixou de listar uma página onde há foto evidente do produto em photoCandidatePages;
   - "possible_noise": textos puramente institucionais ou irrelevantes que foram transformados em produtos;
   - "overpromoted_product": opções, adicionais, decorações ou personalizações com preço que foram indevidamente promovidas a produtos principais (Product/Combo), quando deveriam ser escolhas de um grupo dependente;
   - "fragmented_product_family": tabelas de variação de um mesmo produto (tamanhos, diâmetros, pesos, porções como P/M/G ou 12cm/15cm/20cm) que foram indevidamente fragmentadas em múltiplos produtos separados, em vez de consolidadas no array de preços (prices[]) de um único produto;
   - "unsupported_domain_rule": regras operacionais ou comerciais válidas presentes no PDF que não conseguem ser representadas fielmente nos campos do domínio do Pode Vir (ex: máximo condicionado ao tamanho, mínimo por sabor/opção, dependência condicional entre escolhas);
   - "other": outras discrepâncias comerciais.

2. Audite expressamente a Independência Comercial:
   - Ter preço, foto ou linha própria NÃO torna uma entidade um Product independente.
   - Se uma entidade existe apenas como configuração ou personalização de outro produto base, transformá-la em produto comercial é um erro grave de modelagem ("overpromoted_product").
   - Se linhas de uma tabela representam apenas tamanhos do mesmo produto com preços diferentes, transformá-las em múltiplos produtos é um erro de modelagem ("fragmented_product_family").

3. Regras fora do domínio suportado ("unsupported_domain_rule"):
   - Verifique regras operacionais ou de montagem detectadas no PDF que a modelagem atual do Pode Vir não expressa integralmente nos campos de ComplementGroup (required, minimum, maximum, selectionMode, pricingBehavior).
   - Exemplos: máximo condicionado a tamanho ("no tamanho P escolha 1 sabor, no tamanho G escolha até 2 sabores"); mínimo por sabor/opção ("mínimo 25 unidades por sabor"); dependência entre escolhas ("escolha de massa X habilita recheio Y").
   - Severidade:
     - "high": quando ignorar a regra permitiria um pedido inválido pelo cliente;
     - "medium": quando exigir apenas conferência ou configuração manual pelo lojista.
   - Apenas diagnostique o problema; NÃO invente novos campos ou soluções de banco de dados.

4. Critérios de Severidade:
   - "high": Informação necessária para montar, personalizar ou pedir o produto está ausente (ex: lista inteira de sabores ou recheios omitida, produto comercial sem cadastro, regra de antecedência obrigatória perdida), ou erro grave de superextração que desconfigura o catálogo (ex: dezenas de decorações virando produtos avulsos).
   - "medium": A estrutura existe, mas há dúvida ou lacuna parcial (ex: uma opção faltante em lista longa, cabeçalho de família ambíguo, tabela de tamanhos fragmentada).
   - "low": Detalhe secundário, texto institucional ou pequena sugestão de melhoria que não inviabiliza o pedido.

5. Seja CONSERVADOR: Se a extração e semântica representaram adequadamente o conteúdo comercial do cardápio, retorne "issues": [].`;
}

/* ==========================================================================
   FUNÇÃO EXECUTORA DA AUDITORIA (CHAMADA #4)
   ========================================================================== */

export async function analyzePdfCatalogAuditWithGemini(
  buffer: Buffer,
  mimeType: string,
  t1Summary: unknown,
  t2Summary: unknown
): Promise<PdfAuditResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.CATALOG_IMPORT_MODEL?.trim();

  if (!apiKey) {
    throw new HttpError(400, 'Configuração ausente: GEMINI_API_KEY não informada no servidor.', 'GEMINI_API_KEY_MISSING');
  }
  if (!model) {
    throw new HttpError(400, 'Configuração ausente: CATALOG_IMPORT_MODEL não informado no servidor.', 'CATALOG_IMPORT_MODEL_MISSING');
  }

  const startTime = Date.now();
  const base64Data = buffer.toString('base64');
  const prompt = buildAuditPrompt(t1Summary, t2Summary);

  let rawText: string;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [
        { inlineData: { data: base64Data, mimeType } },
        { text: prompt },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: geminiPdfAuditResponseSchema,
      },
    });

    rawText = (response.text || '').trim();
  } catch (error: any) {
    const rawMessage = String(error?.message || '');
    const sanitized = rawMessage
      .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
      .replace(/apiKey=[^&\s]+/gi, 'apiKey=[REDACTED]');

    return {
      status: 'failed',
      error: {
        code: error?.code || 'PDF_AUDIT_SERVICE_ERROR',
        message: sanitized || 'Falha na comunicação com o Gemini durante auditoria.',
      },
    };
  }

  const executionTimeMs = Date.now() - startTime;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return {
      status: 'failed',
      error: {
        code: 'INVALID_GEMINI_RESPONSE',
        message: 'O modelo não retornou um JSON válido na auditoria.',
      },
    };
  }

  const parseResult = pdfAuditDataSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    return {
      status: 'failed',
      error: {
        code: 'INVALID_GEMINI_RESPONSE',
        message: 'A resposta da auditoria não atende ao formato estruturado esperado.',
      },
    };
  }

  return {
    status: 'ok',
    model,
    executionTimeMs,
    data: parseResult.data,
    rawJson: rawText,
  };
}

/* ==========================================================================
   AUDITORIA DETERMINÍSTICA LOCAL (T1 -> T2 SEM GEMINI)
   ========================================================================== */

export interface DeterministicAuditCandidateGroup {
  groupKey: string;
  title: string | null;
  sourcePage: number;
  options: Array<{
    optionKey: string;
    name: string;
    amountCents: number | null;
  }>;
}

export interface DeterministicAuditItem {
  itemKey: string;
  kind: string;
  parentItemKey?: string | null;
  groupKey?: string | null;
}

export interface DeterministicAuditGroup {
  groupKey: string;
  name: string;
  kind?: string;
  parentItemKey?: string | null;
  itemKeys: string[];
  sourceGroupKeys?: string[];
}

export interface DeterministicAuditRuleBlock {
  ruleKey: string;
  title: string | null;
  body: string;
  sourcePage: number;
}

export interface DeterministicAuditBusinessRule {
  type: string;
  sourceRuleKey?: string | null;
  sourceTextKey?: string | null;
  sourcePage?: number | null;
  relatedItemKey?: string | null;
  relatedGroupKey?: string | null;
}

export interface DeterministicAuditInput {
  candidateGroups: DeterministicAuditCandidateGroup[];
  items?: DeterministicAuditItem[];
  groups?: DeterministicAuditGroup[];
  ruleBlocks?: DeterministicAuditRuleBlock[];
  businessRules?: DeterministicAuditBusinessRule[];
}

export function buildDeterministicPdfAuditIssues(input: DeterministicAuditInput): PdfAuditIssue[] {
  const issues: PdfAuditIssue[] = [];
  const groups = input.groups || [];
  const candidateGroups = input.candidateGroups || [];
  const items = input.items || [];
  const ruleBlocks = input.ruleBlocks || [];
  const businessRules = input.businessRules || [];

  const itemsMap = new Map(items.map((i) => [i.itemKey, i]));

  // Mapa de referência reversa: candidateGroupKey -> array de grupos semânticos que o referenciam
  const candidateGroupUsage = new Map<string, DeterministicAuditGroup[]>();
  for (const g of groups) {
    if (Array.isArray(g.sourceGroupKeys)) {
      for (const sgKey of g.sourceGroupKeys) {
        const list = candidateGroupUsage.get(sgKey) || [];
        list.push(g);
        candidateGroupUsage.set(sgKey, list);
      }
    }
  }

  // 1. candidateGroup completamente perdido
  for (const cg of candidateGroups) {
    const referencingGroups = candidateGroupUsage.get(cg.groupKey);
    if (!referencingGroups || referencingGroups.length === 0) {
      const optionsPreview = cg.options.map((o) => o.name).filter(Boolean).join(', ');
      issues.push({
        severity: 'high',
        type: 'missing_choice_group',
        sourcePage: cg.sourcePage,
        relatedItemKey: null,
        relatedGroupKey: null,
        message: `O grupo de escolhas "${cg.title || cg.groupKey}" (página ${cg.sourcePage}) possui ${cg.options.length} opções na T1, mas não foi vinculado a nenhum grupo de complementos na T2.`,
        evidence: cg.title || optionsPreview || cg.groupKey,
        origin: 'deterministic',
      });
    }
  }

  // 2. candidateGroup parcialmente perdido (opções ausentes em semanticGroup)
  for (const g of groups) {
    if (!Array.isArray(g.sourceGroupKeys) || g.sourceGroupKeys.length === 0) continue;

    const representedItemKeys = new Set(g.itemKeys || []);

    for (const sgKey of g.sourceGroupKeys) {
      const cg = candidateGroups.find((c) => c.groupKey === sgKey);
      if (!cg) continue;

      const missingOptions = cg.options.filter((opt) => !representedItemKeys.has(opt.optionKey));

      for (const missingOpt of missingOptions) {
        const itemRecord = itemsMap.get(missingOpt.optionKey);
        const isInformationalOrUnknown =
          itemRecord?.kind === 'informational' || itemRecord?.kind === 'unknown';

        issues.push({
          severity: isInformationalOrUnknown ? 'medium' : 'high',
          type: 'missing_option',
          sourcePage: cg.sourcePage,
          relatedItemKey: missingOpt.optionKey,
          relatedGroupKey: g.groupKey,
          message: `O grupo "${g.name}" possui ${cg.options.length} opções na T1 (${cg.groupKey}), mas apenas ${representedItemKeys.size} foram vinculadas ao grupo semântico (opção "${missingOpt.name}" ausente).`,
          evidence: missingOpt.name,
          origin: 'deterministic',
        });
      }
    }
  }

  // 3. ruleBlock T1 sem businessRule T2
  const referencedRuleKeys = new Set<string>();
  for (const br of businessRules) {
    if (br.sourceRuleKey) {
      referencedRuleKeys.add(br.sourceRuleKey);
    }
  }

  for (const rb of ruleBlocks) {
    if (!referencedRuleKeys.has(rb.ruleKey)) {
      const textToTest = `${rb.title || ''} ${rb.body}`.toLowerCase();
      const isHigh =
        /m[ií]nimo|anteced[eê]ncia|prazo|taxa|frete|entrega|retirada|pagamento|sinal|dep[oó]sito|cancelamento|limita[cç][aã]o|bloqueio|obrigat[oó]ri/i.test(
          textToTest
        );

      issues.push({
        severity: isHigh ? 'high' : 'medium',
        type: 'missing_rule',
        sourcePage: rb.sourcePage,
        relatedItemKey: null,
        relatedGroupKey: null,
        message: `A regra comercial/operacional "${rb.title || rb.ruleKey}" (página ${rb.sourcePage}) não foi vinculada a nenhuma regra de negócio na T2.`,
        evidence: rb.body.length > 150 ? `${rb.body.slice(0, 147)}...` : rb.body,
        origin: 'deterministic',
      });
    }
  }

  return issues;
}

export function mergePdfAuditIssues(
  geminiIssues: PdfAuditIssue[],
  deterministicIssues: PdfAuditIssue[]
): PdfAuditIssue[] {
  const normalizedGemini: PdfAuditIssue[] = geminiIssues.map((issue) => ({
    ...issue,
    origin: issue.origin || 'gemini',
  }));

  const result: PdfAuditIssue[] = [...normalizedGemini];

  for (const det of deterministicIssues) {
    const isDuplicate = normalizedGemini.some((g) => {
      if (g.type !== det.type) return false;
      if (det.sourcePage && g.sourcePage && det.sourcePage !== g.sourcePage) return false;
      if (det.relatedItemKey && g.relatedItemKey && det.relatedItemKey === g.relatedItemKey) return true;
      if (det.relatedGroupKey && g.relatedGroupKey && det.relatedGroupKey === g.relatedGroupKey) {
        if (det.type === 'missing_choice_group') return true;
      }
      if (det.evidence && g.evidence) {
        const normDet = det.evidence.trim().toLowerCase();
        const normG = g.evidence.trim().toLowerCase();
        if (normDet === normG || (normDet.length >= 4 && normG.includes(normDet))) {
          return true;
        }
      }
      return false;
    });

    if (!isDuplicate) {
      result.push(det);
    }
  }

  return result;
}
