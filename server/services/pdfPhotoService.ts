import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';

/* ==========================================================================
   INTERFACES E SCHEMAS - DETECÇÃO VISUAL DE FOTOS EM PDF (CHAMADA #3)
   ========================================================================== */

export const photoRelationSchema = z.enum(['direct', 'shared', 'ambiguous', 'none']);
export type PhotoRelation = z.infer<typeof photoRelationSchema>;

export const pdfPhotoItemSchema = z.object({
  itemKey: z.string().trim().min(1, 'itemKey é obrigatório.'),
  pageNumber: z.number().int().min(1).nullable(),
  photoBox: z
    .tuple([
      z.number().int().min(0).max(1000),
      z.number().int().min(0).max(1000),
      z.number().int().min(0).max(1000),
      z.number().int().min(0).max(1000),
    ])
    .nullable(),
  photoRelation: photoRelationSchema,
  photoWarning: z.string().trim().nullable().optional().default(null),
});
export type PdfPhotoItem = z.infer<typeof pdfPhotoItemSchema>;

export const pdfPhotoEnrichmentDataSchema = z.object({
  items: z.array(pdfPhotoItemSchema).default([]),
  warnings: z.array(z.string()).default([]),
});
export type PdfPhotoEnrichmentData = z.infer<typeof pdfPhotoEnrichmentDataSchema>;

export interface PdfPhotoEnrichmentSuccess {
  status: 'ok';
  model: string;
  executionTimeMs: number;
  data: PdfPhotoEnrichmentData;
  rawJson: string;
}

export interface PdfPhotoEnrichmentFailure {
  status: 'failed';
  error: {
    code: string;
    message: string;
  };
}

export type PdfPhotoEnrichmentResult =
  | PdfPhotoEnrichmentSuccess
  | PdfPhotoEnrichmentFailure;

export interface CompactPdfPhotoItemInput {
  itemKey: string;
  name: string;
  kind: string;
  sourcePage: number;
  photoCandidatePages?: number[];
  parentItemKey: string | null;
  groupKey: string | null;
}

/* ==========================================================================
   SCHEMA GEMINI STRUCTURED OUTPUT (CHAMADA #3)
   ========================================================================== */

export const geminiPdfPhotoResponseSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      description: 'Lista de fotografias associadas aos itens do cardápio informados.',
      items: {
        type: Type.OBJECT,
        properties: {
          itemKey: {
            type: Type.STRING,
            description: 'O itemKey exato do produto/opção enviado (ex: c0-p0).',
          },
          pageNumber: {
            type: Type.INTEGER,
            nullable: true,
            description:
              'O número da página do documento onde a foto se encontra (deve pertencer à lista de photoCandidatePages enviada para o item). Null se não houver foto.',
          },
          photoBox: {
            type: Type.ARRAY,
            nullable: true,
            description:
              'Bounding box [ymin, xmin, ymax, xmax] da foto em inteiros normalizados de 0 a 1000 relativo à página. Null se não houver foto.',
            items: { type: Type.INTEGER },
          },
          photoRelation: {
            type: Type.STRING,
            enum: ['direct', 'shared', 'ambiguous', 'none'],
            description:
              'Relação entre a foto e o item: direct (foto individual do item), shared (foto compartilhada/conjunto que inclui o item), ambiguous (foto duvidosa/genérica), none (sem foto confiável).',
          },
          photoWarning: {
            type: Type.STRING,
            nullable: true,
            description:
              'Observação ou alerta sobre a foto se houver (ex: corte parcial, resolução baixa, ambiguidade).',
          },
        },
        required: ['itemKey', 'pageNumber', 'photoBox', 'photoRelation', 'photoWarning'],
      },
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Observações gerais sobre a análise visual de fotos do documento.',
    },
  },
  required: ['items', 'warnings'],
};

/* ==========================================================================
   VALIDAÇÃO DE CONSISTÊNCIA REFERENCIAL DE FOTOS EM PDF
   ========================================================================== */

export function validatePdfPhotoReferences(
  data: PdfPhotoEnrichmentData,
  sentItems: CompactPdfPhotoItemInput[]
): PdfPhotoEnrichmentData {
  const sentMap = new Map<string, CompactPdfPhotoItemInput>();
  for (const item of sentItems) {
    sentMap.set(item.itemKey, item);
  }

  // 1. Validação de cobertura exata dos itemKeys enviados para T3
  const itemKeysInResponse = data.items.map((i) => i.itemKey);
  const seenKeys = new Set<string>();

  for (const key of itemKeysInResponse) {
    if (seenKeys.has(key)) {
      throw new HttpError(
        502,
        `ItemKey duplicado na resposta de fotos: "${key}".`,
        'INVALID_PHOTO_REFERENCES'
      );
    }
    seenKeys.add(key);

    if (!sentMap.has(key)) {
      throw new HttpError(
        502,
        `ItemKey inexistente ou não enviado retornado na resposta de fotos: "${key}".`,
        'INVALID_PHOTO_REFERENCES'
      );
    }
  }

  for (const expectedKey of sentMap.keys()) {
    if (!seenKeys.has(expectedKey)) {
      throw new HttpError(
        502,
        `ItemKey obrigatório ausente na resposta de fotos: "${expectedKey}".`,
        'INVALID_PHOTO_REFERENCES'
      );
    }
  }

  // 2. Validação de consistência entre relação, página e bounding box
  for (const photoItem of data.items) {
    const inputItem = sentMap.get(photoItem.itemKey)!;

    if (photoItem.photoRelation === 'none') {
      if (photoItem.pageNumber !== null) {
        throw new HttpError(
          502,
          `Item "${photoItem.itemKey}" possui photoRelation "none" mas informou pageNumber: ${photoItem.pageNumber}. Deve ser null.`,
          'INVALID_PHOTO_REFERENCES'
        );
      }
      if (photoItem.photoBox !== null) {
        throw new HttpError(
          502,
          `Item "${photoItem.itemKey}" possui photoRelation "none" mas informou photoBox. Deve ser null.`,
          'INVALID_PHOTO_REFERENCES'
        );
      }
    } else {
      // photoRelation diferente de none exige pageNumber e photoBox
      if (photoItem.pageNumber === null || photoItem.pageNumber === undefined) {
        throw new HttpError(
          502,
          `Item "${photoItem.itemKey}" possui foto ("${photoItem.photoRelation}") mas pageNumber é nulo.`,
          'INVALID_PHOTO_REFERENCES'
        );
      }

      if (!photoItem.photoBox) {
        throw new HttpError(
          502,
          `Item "${photoItem.itemKey}" possui foto ("${photoItem.photoRelation}") mas photoBox é nulo.`,
          'INVALID_PHOTO_REFERENCES'
        );
      }

      // Validação de página: deve pertencer obrigatoriamente a photoCandidatePages
      const allowedPages = (inputItem.photoCandidatePages && inputItem.photoCandidatePages.length > 0)
        ? inputItem.photoCandidatePages
        : [inputItem.sourcePage];

      if (!allowedPages.includes(photoItem.pageNumber)) {
        throw new HttpError(
          502,
          `Inconsistência de página para item "${photoItem.itemKey}": foto localizada na página ${photoItem.pageNumber}, mas as páginas candidatas válidas são [${allowedPages.join(', ')}].`,
          'INVALID_PHOTO_REFERENCES'
        );
      }

      // Validação das dimensões da bounding box [ymin, xmin, ymax, xmax]
      const [ymin, xmin, ymax, xmax] = photoItem.photoBox;

      if (
        ymin < 0 ||
        ymin > 1000 ||
        xmin < 0 ||
        xmin > 1000 ||
        ymax < 0 ||
        ymax > 1000 ||
        xmax < 0 ||
        xmax > 1000
      ) {
        throw new HttpError(
          502,
          `Coordenadas de photoBox fora do intervalo 0..1000 para item "${photoItem.itemKey}": [${photoItem.photoBox.join(', ')}].`,
          'INVALID_PHOTO_COORDINATES'
        );
      }

      if (ymin >= ymax) {
        throw new HttpError(
          502,
          `Bounding box com altura inválida para item "${photoItem.itemKey}": ymin (${ymin}) deve ser menor que ymax (${ymax}).`,
          'INVALID_PHOTO_COORDINATES'
        );
      }

      if (xmin >= xmax) {
        throw new HttpError(
          502,
          `Bounding box com largura inválida para item "${photoItem.itemKey}": xmin (${xmin}) deve ser menor que xmax (${xmax}).`,
          'INVALID_PHOTO_COORDINATES'
        );
      }
    }
  }

  return data;
}

/* ==========================================================================
   CONSTRUTOR DE PROMPT (CHAMADA #3 - FOTOS EM PDF V3)
   ========================================================================== */

export function buildPdfPhotoPrompt(items: CompactPdfPhotoItemInput[]): string {
  const itemsJson = JSON.stringify(
    items.map((i) => ({
      itemKey: i.itemKey,
      name: i.name,
      kind: i.kind,
      sourcePage: i.sourcePage,
      photoCandidatePages: (i.photoCandidatePages && i.photoCandidatePages.length > 0)
        ? i.photoCandidatePages
        : [i.sourcePage],
      parentItemKey: i.parentItemKey,
      groupKey: i.groupKey,
    })),
    null,
    2
  );

  return `Você é um especialista sênior em visão computacional, diagramação de documentos e análise de cardápios.

Sua tarefa é analisar visualmente o documento PDF em anexo e **LOCALIZAR AS FOTOGRAFIAS REAIS DOS ITENS ENVIADOS**, devolvendo a página exata e as coordenadas normalizadas de bounding box de cada foto.

---
### ITENS ENVIADOS PARA DETECÇÃO DE FOTOS:
\`\`\`json
${itemsJson}
\`\`\`

---
### DIRETRIZES CRÍTICAS PARA DETECÇÃO DE FOTOS:

1. **APENAS FOTOGRAFIAS REAIS**:
   - Identifique exclusivamente fotos reais de alimentos, doces, produtos ou pratos.
   - NUNCA identifique logotipos, ícones gráficos, ilustrações vetoriais, fundos decorativos, formas geométricas ou caixas de texto como foto.

2. **RESTRIÇÃO ÀS PÁGINAS CANDIDATAS (photoCandidatePages)**:
   - Para cada item, você DEVE procurar a fotografia exclusivamente nas páginas listadas em seu campo "photoCandidatePages".
   - Se houver foto, o campo "pageNumber" DEVE pertencer obrigatoriamente à lista "photoCandidatePages" informada.
   - Se nenhuma foto adequada for encontrada nessas páginas, defina photoRelation: "none", pageNumber: null, photoBox: null.

3. **FOTO REPRESENTATIVA DO PRODUTO PRINCIPAL**:
   - Se existirem várias fotos candidatas nas páginas permitidas, prefira a que melhor representa o produto comercial principal.
   - NÃO escolha foto de adicional, opção, ingrediente secundário ou decoração apenas porque está próxima.
   - Fotos de abertura ou capa de seção (ex: página anterior ao preço) PODEM ser usadas se retratarem claramente o produto.

4. **CRITÉRIOS DE ASSOCIAÇÃO (photoRelation)**:
   - "direct": A fotografia retrata especificamente e de forma individual o item informado.
   - "shared": A fotografia retrata uma composição, bandeja ou conjunto que inclui o item informado (ex: foto de vários brigadeiros de festa associada ao produto principal "Brigadeiros de festa").
   - "ambiguous": Há dúvida razoável se a imagem corresponde exatamente ao item ou se é meramente ilustrativa genérica.
   - "none": O item não possui fotografia real correspondente nas páginas candidatas.

5. **SE NÃO HOUVER FOTO CONFIÁVEL**:
   - Defina obrigatoriamente:
     "photoRelation": "none"
     "pageNumber": null
     "photoBox": null
     "photoWarning": null

6. **FORMATO DO BOUNDING BOX (photoBox)**:
   - Retorne uma tupla de 4 números inteiros: [ymin, xmin, ymax, xmax].
   - Coordenadas normalizadas na escala de 0 a 1000 relativas às dimensões da página informada em "pageNumber".
   - Obrigatoriamente: ymin < ymax e xmin < xmax.
   - Enquadre a fotografia real com precisão, sem incluir textos de legendas ou fundos adjacentes desnecessários.

7. **COBERTURA COMPLETA DOS ITENS**:
   - Você DEVE retornar exatamente uma entrada em "items" para CADA itemKey informado na lista acima (${items.map((i) => i.itemKey).join(', ')}).
   - NUNCA omita nenhum itemKey e NUNCA invente novos itemKeys.

Responda exclusivamente no formato JSON estruturado definido pelo schema.`;
}

/* ==========================================================================
   EXECUTOR DA CHAMADA #3 (FOTOS EM PDF)
   ========================================================================== */

export async function analyzePdfPhotoEnrichmentWithGemini(
  pdfBuffer: Buffer,
  mimeType: string,
  items: CompactPdfPhotoItemInput[]
): Promise<PdfPhotoEnrichmentSuccess> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HttpError(
      400,
      'Configuração ausente: GEMINI_API_KEY não informada no servidor.',
      'GEMINI_API_KEY_MISSING'
    );
  }

  const model = process.env.CATALOG_IMPORT_MODEL;
  if (!model) {
    throw new HttpError(
      400,
      'Configuração ausente: CATALOG_IMPORT_MODEL não informado no servidor.',
      'CATALOG_IMPORT_MODEL_MISSING'
    );
  }

  const prompt = buildPdfPhotoPrompt(items);
  const startTime = Date.now();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          inlineData: {
            data: pdfBuffer.toString('base64'),
            mimeType,
          },
        },
        {
          text: prompt,
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: geminiPdfPhotoResponseSchema,
      },
    });

    const executionTimeMs = Date.now() - startTime;
    const rawText = response.text;

    if (!rawText || rawText.trim().length === 0) {
      throw new HttpError(
        502,
        'O provedor de IA retornou uma resposta vazia na detecção de fotos do PDF.',
        'PDF_PHOTO_EMPTY_RESPONSE'
      );
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      throw new HttpError(
        502,
        'O provedor de IA retornou um JSON inválido na detecção de fotos do PDF.',
        'INVALID_PDF_PHOTO_RESPONSE'
      );
    }

    const parseResult = pdfPhotoEnrichmentDataSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      const errorDetails = parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new HttpError(
        502,
        `A resposta de fotos do PDF não atendeu ao formato estruturado: ${errorDetails}`,
        'INVALID_PDF_PHOTO_RESPONSE'
      );
    }

    // Validação referencial estreita: cobertura completa, bounding boxes e relação com sourcePage
    const validatedData = validatePdfPhotoReferences(parseResult.data, items);

    return {
      status: 'ok',
      model,
      executionTimeMs,
      data: validatedData,
      rawJson: rawText,
    };
  } catch (err: any) {
    if (err instanceof HttpError) throw err;

    const rawMessage = String(err?.message || 'Erro desconhecido ao chamar API do Gemini para fotos em PDF.');
    const status = err?.status || err?.statusCode;

    // Sanitiza qualquer API key que possa ter vazado na mensagem
    const sanitized = rawMessage
      .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
      .replace(/apiKey=[^&\s]+/gi, 'apiKey=[REDACTED]');

    if (status === 429 || /quota|rate/i.test(rawMessage)) {
      throw new HttpError(
        429,
        `Limite de requisições excedido no Gemini para fotos: ${sanitized}`,
        'PDF_PHOTO_QUOTA_EXCEEDED'
      );
    }

    if (status === 504 || /deadline|timeout/i.test(rawMessage)) {
      throw new HttpError(
        504,
        `Tempo limite excedido na análise visual de fotos em PDF: ${sanitized}`,
        'PDF_PHOTO_TIMEOUT'
      );
    }

    throw new HttpError(
      502,
      `Falha na integração com Gemini (Fotos PDF): ${sanitized}`,
      'PDF_PHOTO_SERVICE_ERROR'
    );
  }
}
