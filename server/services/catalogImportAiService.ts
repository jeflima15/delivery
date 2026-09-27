/** Canonical Domain-Native analysis engine for catalog imports. */
import { GoogleGenAI } from '@google/genai';
import { HttpError } from '../middleware/errors.js';
import {
  buildDomainNativePreprocessorContext,
  DOMAIN_NATIVE_SYSTEM_INSTRUCTION,
  buildDomainNativeAnalysisPrompt,
} from './catalogImportPreprocessor.js';
import {
  catalogImportDomainRawAnalysisSchema,
  domainNativeJsonSchema,
  buildCatalogImportReviewQueue,
  DOMAIN_NATIVE_GENERATION_SEED,
  type CatalogImportDomainRawAnalysis,
  type CatalogImportDomainRawInput,
  type CatalogImportDomainAnalysis,
  type CatalogImportAnalysisResult,
  type DeterministicValidationIssue,
  type RegularProductPlan,
  type ComboProductPlan,
  type ModelingChoice,
} from '../domain/catalogImportDomain.js';
import { validateImportPlanDomain } from '../domain/catalogImportValidation.js';

function normalizeTextForComparison(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

export interface AnalyzeCatalogImportParams {
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

export function normalizeDomainNativeData(rawInput: CatalogImportDomainRawAnalysis | CatalogImportDomainRawInput): {
  normalizedData: CatalogImportDomainAnalysis;
  localIssues: DeterministicValidationIssue[];
} {
  const parsed = catalogImportDomainRawAnalysisSchema.safeParse(rawInput);
  const raw: CatalogImportDomainRawAnalysis = parsed.success
    ? parsed.data
    : (rawInput as CatalogImportDomainRawAnalysis);
  const localIssues: DeterministicValidationIssue[] = [];

  // 1. Documento e Seções
  const sections = (raw.document.sections || []).map((sec, i) => ({
    headingKey: `head${i}`,
    name: sec.name.trim(),
    role: sec.role,
    sourcePages: sec.sourcePages || [],
  }));

  const documentNormalized = {
    sourceType: raw.document.sourceType || 'pdf',
    globalTitle: raw.document.globalTitle || null,
    globalTitleRole: raw.document.globalTitleRole || 'unknown',
    brand: raw.document.brand || null,
    pageCount: null,
    pageCoverage: (raw.document.pageCoverage || []).map((pc) => ({
      pageNumber: pc.pageNumber,
      role: pc.role,
      hasCatalogEvidence: pc.hasCatalogEvidence,
      notes: pc.notes || null,
    })),
    sections,
  };

  // 2. Source Evidence: Candidatos
  const productCandidates = (raw.sourceEvidence.productCandidates || []).map((cand, i) => {
    const candidateKey = `cand${i}`;
    const prices = (cand.prices || []).map((p, pIdx) => ({
      priceKey: `${candidateKey}-price${pIdx}`,
      label: p.label || null,
      amountCents: p.amountCents ?? null,
      prefix: p.prefix || null,
      unit: p.unit || null,
      rawText: p.rawText || '',
    }));

    return {
      candidateKey,
      name: cand.name.trim(),
      description: cand.description || null,
      sourcePages: cand.sourcePages || [],
      categoryHint: cand.categoryHint || null,
      prices,
      rawEvidence: cand.rawEvidence || null,
    };
  });

  // 3. Source Evidence: Grupos de Escolha e Opções
  const choiceGroups = (raw.sourceEvidence.choiceGroups || []).map((cg, i) => {
    const groupKey = `grp-raw${i}`;

    const candidateIndices =
      Array.isArray(cg.appliesToCandidateIndexes) && cg.appliesToCandidateIndexes.length > 0
        ? cg.appliesToCandidateIndexes
        : typeof cg.parentCandidateIndex === 'number'
        ? [cg.parentCandidateIndex]
        : [];

    const appliesToCandidateKeys = candidateIndices
      .filter((idx) => {
        const inBounds = idx >= 0 && idx < productCandidates.length;
        if (!inBounds) {
          localIssues.push({
            severity: 'warning',
            code: 'INVALID_INDEX_REFERENCE',
            message: `candidateIndex ${idx} no grupo bruto "${cg.title || groupKey}" está fora dos limites (total: ${productCandidates.length}).`,
            affectedEntityKeys: [groupKey],
            relatedEvidenceKeys: [],
          });
        }
        return inBounds;
      })
      .map((idx) => `cand${idx}`);

    const parentCandidateKey = appliesToCandidateKeys[0] || null;

    return {
      groupKey,
      title: cg.title || null,
      sourcePages: cg.sourcePages || [],
      instruction: cg.instruction || null,
      appliesToCandidateKeys,
      parentCandidateKey,
      options: (cg.options || []).map((opt, j) => ({
        optionKey: `${groupKey}-opt${j}`,
        name: opt.name.trim(),
        rawText: opt.rawText || null,
        amountCents: opt.amountCents ?? null,
        priceRawText: opt.priceRawText || null,
      })),
      rawEvidence: cg.rawEvidence || null,
    };
  });

  // 4. Source Evidence: Observações de Preço (Pricing Observations)
  const pricingObservations = (raw.sourceEvidence.pricingObservations || []).map((obs, i) => {
    const obsKey = `obs${i}`;
    let candidateKey = `cand${obs.productCandidateIndex}`;
    if (obs.productCandidateIndex < 0 || obs.productCandidateIndex >= productCandidates.length) {
      localIssues.push({
        severity: 'warning',
        code: 'INVALID_INDEX_REFERENCE',
        message: `productCandidateIndex ${obs.productCandidateIndex} na observação de preço "${obsKey}" fora dos limites.`,
        affectedEntityKeys: [obsKey],
        relatedEvidenceKeys: [],
      });
      candidateKey = `cand-unknown-${obs.productCandidateIndex}`;
    }

    const selectors = (obs.selectors || []).map((sel) => {
      const gKey = `grp-raw${sel.choiceGroupIndex}`;
      const oKey = `${gKey}-opt${sel.optionIndex}`;
      return { groupKey: gKey, optionKey: oKey };
    });

    return {
      observationKey: obsKey,
      candidateKey,
      amountCents: obs.amountCents,
      selectors,
      rawText: obs.rawText || '',
      sourcePages: obs.sourcePages || [],
    };
  });

  // 5. Source Evidence: Blocos de Regras
  const ruleBlocks = (raw.sourceEvidence.ruleBlocks || []).map((rb, i) => {
    const targetCandidateKeys = (rb.targetCandidateIndexes || [])
      .filter((idx) => idx >= 0 && idx < productCandidates.length)
      .map((idx) => `cand${idx}`);

    const targetCategoryKeys = (rb.targetCategoryIndexes || [])
      .filter((idx) => idx >= 0 && idx < (raw.importPlan?.categories || []).length)
      .map((idx) => `cat${idx}`);

    return {
      ruleKey: `rule${i}`,
      title: rb.title || null,
      body: rb.body.trim(),
      scope: rb.scope || 'ambiguous',
      targetCandidateKeys,
      targetCategoryKeys,
      sourcePages: rb.sourcePages || [],
      rawEvidence: rb.rawEvidence || null,
    };
  });

  // 6. Source Evidence: Combo Evidence
  const comboEvidence = (raw.sourceEvidence.comboEvidence || []).map((ce, i) => ({
    comboKey: `combo-ev${i}`,
    rawTitle: ce.rawTitle.trim(),
    rawDescription: ce.rawDescription || null,
    observedPriceCents: ce.observedPriceCents ?? null,
    components: (ce.components || []).map((comp) => {
      let candidateKey: string | null = null;
      if (typeof comp.productCandidateIndex === 'number') {
        if (comp.productCandidateIndex >= 0 && comp.productCandidateIndex < productCandidates.length) {
          candidateKey = `cand${comp.productCandidateIndex}`;
        }
      }
      return {
        name: comp.name.trim(),
        quantity: comp.quantity || 1,
        rawText: comp.rawText || '',
        candidateKey,
        isFixed: comp.isFixed !== false,
      };
    }),
    rawText: ce.rawText || '',
    sourcePages: ce.sourcePages || [],
  }));

  // 7. Source Evidence: Fotos
  const photos = (raw.sourceEvidence.photos || []).map((ph, i) => {
    let candidateKey: string | null = null;
    if (ph.productIndex >= 0 && ph.productIndex < productCandidates.length) {
      candidateKey = `cand${ph.productIndex}`;
    }
    return {
      photoKey: `photo${i}`,
      candidateKey,
      pageNumber: ph.pageNumber ?? null,
      photoBox:
        Array.isArray(ph.photoBox) && ph.photoBox.length === 4
          ? ([ph.photoBox[0], ph.photoBox[1], ph.photoBox[2], ph.photoBox[3]] as [number, number, number, number])
          : null,
      photoRelation: ph.photoRelation || 'none',
      photoWarning: ph.photoWarning || null,
    };
  });

  // 8. Source Evidence: Textos Residuais
  const residualTexts = (raw.sourceEvidence.residualTexts || []).map((rt) => ({
    text: rt.text.trim(),
    sourcePage: rt.sourcePage,
    probableRole: rt.probableRole || null,
  }));

  const sourceEvidenceNormalized = {
    document: documentNormalized,
    productCandidates,
    pricingObservations,
    choiceGroups,
    ruleBlocks,
    comboEvidence,
    photos,
    residualTexts,
  };

  // 9. Import Plan: Categorias
  function sanitizeCategoryName(name: string): string {
    let clean = name.trim();
    clean = clean.replace(/^\d+[.\-\s]+/, '');
    clean = clean.replace(/\s*-\s*(CARDÁPIO|CARDAPIO|MENU|CATÁLOGO|CATALOGO)\s*$/i, '');
    if (clean === clean.toUpperCase() && clean.length > 3) {
      clean = clean
        .toLowerCase()
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
    return clean.trim();
  }

  const categories = (raw.importPlan.categories || []).map((cat, i) => ({
    key: `cat${i}`,
    name: sanitizeCategoryName(cat.name),
    description: cat.description || '',
    order: cat.order ?? i,
    sourceEvidenceKeys: (cat.sourceEvidenceCandidateIndexes || [])
      .filter((idx) => idx >= 0 && idx < productCandidates.length)
      .map((idx) => `cand${idx}`),
  }));

  // 10. Import Plan: Produtos e Combos
  const rawProducts = raw.importPlan.products || [];
  const normalizedProducts: (RegularProductPlan | ComboProductPlan)[] = [];

  rawProducts.forEach((rawProd, i) => {
    const productKey = `prod${i}`;

    // Higienização determinística de categoria
    let resolvedCategoryKey: string | null = null;
    if (typeof rawProd.categoryIndex === 'number') {
      if (rawProd.categoryIndex >= 0 && rawProd.categoryIndex < categories.length) {
        const cat = categories[rawProd.categoryIndex];
        const normalizedCatName = normalizeTextForComparison(cat.name);
        const normalizedProdName = normalizeTextForComparison(rawProd.name);
        const normalizedDocTitle = documentNormalized.globalTitle
          ? normalizeTextForComparison(documentNormalized.globalTitle)
          : '';

        // Se a categoria for idêntica ao título global ou ao nome do produto, sanitiza para null
        if (
          normalizedCatName &&
          (normalizedCatName === normalizedDocTitle || normalizedCatName === normalizedProdName)
        ) {
          resolvedCategoryKey = null;
        } else {
          resolvedCategoryKey = cat.key;
        }
      } else {
        localIssues.push({
          severity: 'warning',
          code: 'INVALID_INDEX_REFERENCE',
          message: `categoryIndex ${rawProd.categoryIndex} no produto "${rawProd.name}" fora dos limites de categorias (${categories.length}).`,
          affectedEntityKeys: [productKey],
          relatedEvidenceKeys: [],
        });
      }
    }

    const sourceEvidenceKeys = (rawProd.sourceProductCandidateIndexes || [])
      .filter((idx) => idx >= 0 && idx < productCandidates.length)
      .map((idx) => `cand${idx}`);

    const sourceRuleKeys = (rawProd.sourceRuleIndexes || [])
      .filter((idx) => idx >= 0 && idx < ruleBlocks.length)
      .map((idx) => `rule${idx}`);

    let basePriceSourceKey: string | null = null;
    if (rawProd.basePriceSource && typeof rawProd.basePriceSource.candidateIndex === 'number') {
      const cIdx = rawProd.basePriceSource.candidateIndex;
      const pIdx = rawProd.basePriceSource.priceIndex;
      if (cIdx >= 0 && cIdx < productCandidates.length && pIdx >= 0) {
        basePriceSourceKey = `cand${cIdx}-price${pIdx}`;
      }
    }

    // Fallback determinístico: vincula ao preço correspondente do candidato primário se houver match exato
    if (!basePriceSourceKey && typeof rawProd.basePriceCents === 'number' && rawProd.basePriceCents > 0) {
      const primaryCandidateIdx = (rawProd.sourceProductCandidateIndexes || [])[0];
      if (typeof primaryCandidateIdx === 'number' && productCandidates[primaryCandidateIdx]) {
        const cand = productCandidates[primaryCandidateIdx];
        const match = cand.prices.find((p) => p.amountCents === rawProd.basePriceCents);
        if (match?.priceKey) {
          basePriceSourceKey = match.priceKey;
        }
      }
    }

    const baseFields = {
      key: productKey,
      name: rawProd.name.trim(),
      description: rawProd.description || null,
      categoryKey: resolvedCategoryKey,
      exclusiveToCombo: Boolean(rawProd.exclusiveToCombo),
      order: rawProd.order ?? i,
      preorderPolicy: rawProd.preorderPolicy
        ? {
            availability: rawProd.preorderPolicy.availability ?? null,
            minLeadMinutes: rawProd.preorderPolicy.minLeadMinutes ?? null,
          }
        : null,
      basePriceSourceKey,
      sourceEvidenceKeys,
      sourceRuleKeys,
    };

    if (rawProd.kind === 'combo') {
      const comboRaw = rawProd.combo;
      let comboConfig: any = null;
      let startingPriceCents: number | null = null;

      if (comboRaw?.mode === 'fixed') {
        const fixedItems = (comboRaw.items || []).map((item) => {
          let targetProductKey = `prod${item.productIndex}`;
          if (item.productIndex < 0 || item.productIndex >= rawProducts.length) {
            localIssues.push({
              severity: 'blocker',
              code: 'INVALID_INDEX_REFERENCE',
              message: `Item componente de índice ${item.productIndex} no combo "${rawProd.name}" fora dos limites (${rawProducts.length}).`,
              affectedEntityKeys: [productKey],
              relatedEvidenceKeys: [],
            });
            targetProductKey = `prod-unknown-${item.productIndex}`;
          }
          return {
            productKey: targetProductKey,
            quantity: item.quantity || 1,
          };
        });

        const baseCents = comboRaw.comboBasePriceCents ?? null;
        comboConfig = {
          mode: 'fixed',
          comboBasePriceCents: baseCents,
          items: fixedItems,
        };
        startingPriceCents = baseCents;
      } else if (comboRaw?.mode === 'stages') {
        let stagesMin = 0;
        const stages = (comboRaw.stages || []).map((stg, stgIdx) => {
          let minExtra = Infinity;
          const options = (stg.options || []).map((opt) => {
            let targetProductKey = `prod${opt.productIndex}`;
            if (opt.productIndex < 0 || opt.productIndex >= rawProducts.length) {
              localIssues.push({
                severity: 'blocker',
                code: 'INVALID_INDEX_REFERENCE',
                message: `Opção de stage de índice ${opt.productIndex} no combo "${rawProd.name}" fora dos limites.`,
                affectedEntityKeys: [productKey],
                relatedEvidenceKeys: [],
              });
              targetProductKey = `prod-unknown-${opt.productIndex}`;
            }
            if (typeof opt.extraCents === 'number' && opt.extraCents < minExtra) {
              minExtra = opt.extraCents;
            }
            return {
              productKey: targetProductKey,
              extraCents: opt.extraCents || 0,
              order: opt.order ?? 0,
            };
          });

          stagesMin += (stg.stageValueCents || 0) + (isFinite(minExtra) ? minExtra : 0);

          return {
            key: `stg${stgIdx}`,
            name: stg.name.trim(),
            order: stg.order ?? stgIdx,
            stageValueCents: stg.stageValueCents || 0,
            chargeComplements: Boolean(stg.chargeComplements),
            options,
          };
        });

        const baseCents = comboRaw.comboBasePriceCents ?? null;
        comboConfig = {
          mode: 'stages',
          comboBasePriceCents: baseCents,
          stages,
        };

        startingPriceCents = baseCents !== null ? (baseCents || 0) + stagesMin : null;
      }

      normalizedProducts.push({
        ...baseFields,
        kind: 'combo',
        combo: comboConfig,
        startingPriceCents,
      });
    } else {
      normalizedProducts.push({
        ...baseFields,
        kind: 'product',
        basePriceCents: rawProd.basePriceCents ?? null,
        priceOrigin: rawProd.priceOrigin || 'missing',
      });
    }
  });

  // 11. Import Plan: Grupos de Complementos
  const complementGroups = (raw.importPlan.complementGroups || []).map((grp, i) => {
    const groupKey = `grp${i}`;
    let placement: any;

    if (grp.placementType === 'embedded_product') {
      let productKey = `prod${grp.parentProductIndex ?? 0}`;
      if (
        typeof grp.parentProductIndex !== 'number' ||
        grp.parentProductIndex < 0 ||
        grp.parentProductIndex >= rawProducts.length
      ) {
        localIssues.push({
          severity: 'blocker',
          code: 'INVALID_INDEX_REFERENCE',
          message: `parentProductIndex ${grp.parentProductIndex} no grupo embedded "${grp.name}" está fora dos limites de produtos.`,
          affectedEntityKeys: [groupKey],
          relatedEvidenceKeys: [],
        });
        productKey = `prod-unknown-${grp.parentProductIndex}`;
      }
      placement = {
        type: 'embedded_product',
        productKey,
      };
    } else {
      const targetProductKeys = (grp.targetProductIndexes || [])
        .filter((idx) => {
          const inBounds = idx >= 0 && idx < rawProducts.length;
          if (!inBounds) {
            localIssues.push({
              severity: 'warning',
              code: 'INVALID_INDEX_REFERENCE',
              message: `targetProductIndex ${idx} no grupo shared "${grp.name}" fora dos limites.`,
              affectedEntityKeys: [groupKey],
              relatedEvidenceKeys: [],
            });
          }
          return inBounds;
        })
        .map((idx) => `prod${idx}`);

      const targetCategoryKeys = (grp.targetCategoryIndexes || [])
        .filter((idx) => {
          const inBounds = idx >= 0 && idx < categories.length;
          if (!inBounds) {
            localIssues.push({
              severity: 'warning',
              code: 'INVALID_INDEX_REFERENCE',
              message: `targetCategoryIndex ${idx} no grupo shared "${grp.name}" fora dos limites.`,
              affectedEntityKeys: [groupKey],
              relatedEvidenceKeys: [],
            });
          }
          return inBounds;
        })
        .map((idx) => `cat${idx}`);

      placement = {
        type: 'shared',
        productKeys: targetProductKeys,
        categoryKeys: targetCategoryKeys,
      };
    }

    const options = (grp.options || []).map((opt, j) => {
      const optionKey = `${groupKey}-opt${j}`;
      const optEvidenceKeys: string[] = [];
      if (
        typeof opt.sourceChoiceGroupIndex === 'number' &&
        typeof opt.sourceOptionIndex === 'number' &&
        opt.sourceChoiceGroupIndex >= 0 &&
        opt.sourceChoiceGroupIndex < choiceGroups.length
      ) {
        optEvidenceKeys.push(`grp-raw${opt.sourceChoiceGroupIndex}-opt${opt.sourceOptionIndex}`);
      }

      // Linhagem explícita de sourcePriceKeys (via sourcePriceRefs)
      const sourcePriceKeys: string[] = [];
      if (Array.isArray(opt.sourcePriceRefs)) {
        for (const ref of opt.sourcePriceRefs) {
          if (
            ref.candidateIndex >= 0 &&
            ref.candidateIndex < productCandidates.length &&
            ref.priceIndex >= 0
          ) {
            sourcePriceKeys.push(`cand${ref.candidateIndex}-price${ref.priceIndex}`);
          }
        }
      }

      // Fallback determinístico causal para linhagem de preço (apenas se o grupo for uma dimensão de precificação com deltas):
      const groupHasPriceDeltas = (grp.options || []).some((o) => (o.priceDeltaCents || 0) > 0);
      if (sourcePriceKeys.length === 0 && (opt.priceDeltaCents > 0 || groupHasPriceDeltas)) {
        let parentCandidateKeys: string[] = [];
        if (placement.type === 'embedded_product') {
          const parentProd = normalizedProducts.find((p) => p.key === placement.productKey);
          if (parentProd) {
            parentCandidateKeys = parentProd.sourceEvidenceKeys;
          }
        } else if (placement.type === 'shared') {
          for (const pk of placement.productKeys) {
            const p = normalizedProducts.find((item) => item.key === pk);
            if (p) parentCandidateKeys.push(...p.sourceEvidenceKeys);
          }
        }

        for (const cKey of parentCandidateKeys) {
          const cand = productCandidates.find((c) => c.candidateKey === cKey);
          if (cand) {
            const targetProd = normalizedProducts.find((p) => p.sourceEvidenceKeys.includes(cKey));
            const baseCents = (targetProd as RegularProductPlan)?.basePriceCents ?? 0;
            const targetPriceCents = baseCents + (opt.priceDeltaCents || 0);
            const matchingPrice = cand.prices.find((p) => p.amountCents === targetPriceCents);
            if (matchingPrice?.priceKey && !sourcePriceKeys.includes(matchingPrice.priceKey)) {
              sourcePriceKeys.push(matchingPrice.priceKey);
            }
          }
        }
      }

      return {
        key: optionKey,
        name: opt.name.trim(),
        description: opt.description || '',
        priceDeltaCents: opt.priceDeltaCents || 0,
        maximumPerItem: opt.maximumPerItem ?? 0,
        active: opt.active !== false,
        sourceEvidenceKeys: optEvidenceKeys,
        sourcePriceKeys,
      };
    });

    const sourceEvidenceKeys = (grp.sourceChoiceGroupIndexes || [])
      .filter((idx) => idx >= 0 && idx < choiceGroups.length)
      .map((idx) => `grp-raw${idx}`);

    // Se o grupo não tem choiceGroup referenciado, mas é embedded em produto com evidência, vincula à evidência do produto
    if (sourceEvidenceKeys.length === 0 && placement.type === 'embedded_product') {
      const parentProd = normalizedProducts.find((p) => p.key === placement.productKey);
      if (parentProd && parentProd.sourceEvidenceKeys.length > 0) {
        sourceEvidenceKeys.push(...parentProd.sourceEvidenceKeys);
      }
    }

    return {
      key: groupKey,
      name: grp.name.trim(),
      placement,
      required: Boolean(grp.required),
      minimum: grp.minimum ?? 0,
      maximum: grp.maximum ?? 1,
      active: grp.active !== false,
      options,
      sourceEvidenceKeys,
    };
  });

  // 12. Import Plan: Imagens de Produtos
  const productImages = (raw.importPlan.productImages || []).map((img) => {
    let productKey = `prod${img.productIndex}`;
    if (img.productIndex < 0 || img.productIndex >= rawProducts.length) {
      localIssues.push({
        severity: 'warning',
        code: 'INVALID_INDEX_REFERENCE',
        message: `productIndex ${img.productIndex} na foto planejada fora dos limites.`,
        affectedEntityKeys: [],
        relatedEvidenceKeys: [],
      });
      productKey = `prod-unknown-${img.productIndex}`;
    }

    let sourcePhotoKey = `photo${img.sourcePhotoIndex}`;
    if (img.sourcePhotoIndex < 0 || img.sourcePhotoIndex >= photos.length) {
      localIssues.push({
        severity: 'warning',
        code: 'INVALID_INDEX_REFERENCE',
        message: `sourcePhotoIndex ${img.sourcePhotoIndex} na foto planejada fora dos limites.`,
        affectedEntityKeys: [productKey],
        relatedEvidenceKeys: [],
      });
      sourcePhotoKey = `photo-unknown-${img.sourcePhotoIndex}`;
    }

    return {
      productKey,
      sourcePhotoKey,
      confidence: img.confidence ?? 1,
      transformation: img.transformation || 'use_crop',
    };
  });

  // Complementa deterministicamente productImages caso o modelo tenha identificado foto direct com box válido, mas não tenha incluído explicitamente em productImages
  photos.forEach((ph) => {
    if (ph.photoRelation === 'direct' && ph.photoBox && ph.candidateKey) {
      const targetProd = normalizedProducts.find((p) => p.sourceEvidenceKeys.includes(ph.candidateKey!));
      if (targetProd) {
        const alreadyMapped = productImages.some(
          (pi) => pi.productKey === targetProd.key || pi.sourcePhotoKey === ph.photoKey
        );
        if (!alreadyMapped) {
          productImages.push({
            productKey: targetProd.key,
            sourcePhotoKey: ph.photoKey,
            confidence: 1,
            transformation: 'use_crop',
          });
        }
      }
    }
  });

  // 13. Import Plan: Políticas da Loja
  const rawStorePolicy = raw.importPlan.storePolicy;
  const storePolicy = rawStorePolicy
    ? {
        pedidoMinimoCents: rawStorePolicy.pedidoMinimoCents ?? null,
        sourceRuleKeys: (rawStorePolicy.sourceRuleIndexes || [])
          .filter((idx) => idx >= 0 && idx < ruleBlocks.length)
          .map((idx) => `rule${idx}`),
        globalPreorder: rawStorePolicy.globalPreorder
          ? {
              minLeadMinutes: rawStorePolicy.globalPreorder.minLeadMinutes ?? null,
              salesMode: rawStorePolicy.globalPreorder.salesMode ?? null,
              sourceRuleKeys: (rawStorePolicy.globalPreorder.sourceRuleIndexes || [])
                .filter((idx) => idx >= 0 && idx < ruleBlocks.length)
                .map((idx) => `rule${idx}`),
            }
          : null,
      }
    : null;

  // 14. Unresolved Issues
  const unresolved = (raw.unresolved || []).map((unres, i) => {
    const unresKey = `unres${i}`;

    const affectedEntityKeys: string[] = [];
    (unres.affectedProductIndexes || []).forEach((idx) => {
      if (idx >= 0 && idx < rawProducts.length) affectedEntityKeys.push(`prod${idx}`);
    });
    (unres.affectedGroupIndexes || []).forEach((idx) => {
      if (idx >= 0 && idx < complementGroups.length) affectedEntityKeys.push(`grp${idx}`);
    });

    const evidenceKeys: string[] = [];
    (unres.evidenceCandidateIndexes || []).forEach((idx) => {
      if (idx >= 0 && idx < productCandidates.length) evidenceKeys.push(`cand${idx}`);
    });
    (unres.evidenceChoiceGroupIndexes || []).forEach((idx) => {
      if (idx >= 0 && idx < choiceGroups.length) evidenceKeys.push(`grp-raw${idx}`);
    });
    (unres.evidenceRuleIndexes || []).forEach((idx) => {
      if (idx >= 0 && idx < ruleBlocks.length) evidenceKeys.push(`rule${idx}`);
    });

    const evidencePriceKeys: string[] = [];
    if (Array.isArray((unres as any).evidencePriceRefs)) {
      for (const ref of (unres as any).evidencePriceRefs) {
        if (
          typeof ref.candidateIndex === 'number' &&
          ref.candidateIndex >= 0 &&
          ref.candidateIndex < productCandidates.length &&
          typeof ref.priceIndex === 'number' &&
          ref.priceIndex >= 0
        ) {
          const pKey = `cand${ref.candidateIndex}-price${ref.priceIndex}`;
          evidencePriceKeys.push(pKey);
          if (!evidenceKeys.includes(pKey)) {
            evidenceKeys.push(pKey);
          }
        }
      }
    }

    return {
      key: unresKey,
      type: unres.type,
      severity: unres.severity || 'blocker',
      found: unres.found.trim(),
      reason: unres.reason.trim(),
      evidenceKeys,
      evidencePriceKeys: evidencePriceKeys.length > 0 ? evidencePriceKeys : undefined,
      affectedEntityKeys,
      possibleResolutions: unres.possibleResolutions || [],
    };
  });

  // 14. Higienização Determinística de Categorias Não Utilizadas
  const referencedCategoryKeys = new Set<string>();
  normalizedProducts.forEach((p) => {
    if (p.categoryKey) referencedCategoryKeys.add(p.categoryKey);
  });
  complementGroups.forEach((g) => {
    if (g.placement.type === 'shared' && g.placement.categoryKeys) {
      g.placement.categoryKeys.forEach((cKey) => referencedCategoryKeys.add(cKey));
    }
  });

  const activeCategories = categories.filter((cat) => referencedCategoryKeys.has(cat.key));

  const importPlan = {
    categories: activeCategories,
    products: normalizedProducts,
    complementGroups,
    productImages,
    storePolicy,
  };

  // 15. Decisões de Modelagem (Modeling Choices)
  const modelingChoices: ModelingChoice[] = (raw.modelingChoices || []).map((mc, idx) => {
    const mcKey = mc.key || `mc${idx}`;
    const affectedEvidenceKeys: string[] = [];

    (mc.affectedEvidenceCandidateIndexes || []).forEach((cIdx) => {
      if (cIdx >= 0 && cIdx < productCandidates.length) {
        affectedEvidenceKeys.push(`cand${cIdx}`);
      }
    });

    (mc.affectedEvidenceGroupIndexes || []).forEach((gIdx) => {
      if (gIdx >= 0 && gIdx < choiceGroups.length) {
        affectedEvidenceKeys.push(`grp${gIdx}`);
      }
    });

    return {
      key: mcKey,
      type: mc.type,
      affectedEvidenceKeys,
      title: mc.title.trim(),
      description: mc.description.trim(),
      recommendedStrategy: mc.recommendedStrategy.trim(),
      alternatives: (mc.alternatives || []).map((alt) => ({
        strategy: alt.strategy.trim(),
        label: alt.label.trim(),
        description: alt.description.trim(),
      })),
      requiresUserDecision: Boolean(mc.requiresUserDecision),
    };
  });

  const normalizedData: CatalogImportDomainAnalysis = {
    isMenu: raw.isMenu !== false,
    document: documentNormalized,
    sourceEvidence: sourceEvidenceNormalized,
    importPlan,
    modelingChoices,
    unresolved,
    reviewQueue: [],
    validationIssues: [],
    warnings: raw.warnings || [],
  };

  return {
    normalizedData,
    localIssues,
  };
}

/* ==========================================================================
   SERVIÇO PRINCIPAL DOMAIN_NATIVE (1 MODEL REQUEST VIA INTERACTIONS API)
   ========================================================================== */

export async function analyzeMenuDomainNativeWithGemini(
  params: AnalyzeCatalogImportParams
): Promise<CatalogImportAnalysisResult> {
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
  const preprocessorContext = buildDomainNativePreprocessorContext({
    sourceType,
    mimeType,
    fileSize,
    pageCountKnown,
  });

  const prompt = buildDomainNativeAnalysisPrompt(preprocessorContext);

  // 2. Montagem do input para ai.interactions.create
  let inputContent: any[];

  if (sourceType === 'pdf') {
    if (!signedUrl) {
      throw new HttpError(
        400,
        'URL assinada do PDF temporário não fornecida para a análise Domain-Native.',
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
        'Buffer da imagem não fornecido para a análise Domain-Native.',
        'EMPTY_FILE'
      );
    }

    const base64Data = buffer.toString('base64');
    inputContent = [
      {
        type: 'image',
        data: base64Data,
        mime_type: mimeType,
      },
      {
        type: 'text',
        text: prompt,
      },
    ];
  }

  // 3. Execução de EXATAMENTE 1 inferência via ai.interactions.create
  const ai = params.aiClient || new GoogleGenAI({ apiKey });

  const interactionPayload: any = {
    model,
    input: inputContent,
    system_instruction: DOMAIN_NATIVE_SYSTEM_INSTRUCTION,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: domainNativeJsonSchema,
    },
    generation_config: {
      max_output_tokens: 16384,
      thinking_level: 'medium',
      seed: DOMAIN_NATIVE_GENERATION_SEED,
    },
  };

  const modelStartTime = Date.now();
  let interactionRes: any;

  try {
    if (ai?.interactions?.create) {
      interactionRes = await ai.interactions.create(interactionPayload);
    } else {
      throw new Error(
        'SDK @google/genai incompatível: ai.interactions.create não está disponível no runtime.'
      );
    }
  } catch (err: any) {
    const msg = String(err?.message || err);
    const sanitized = msg
      .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
      .replace(/apiKey=[^&\s]+/gi, 'apiKey=[REDACTED]')
      .replace(/token=[^&\s]+/gi, 'token=[REDACTED]')
      .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, 'data:image/[REDACTED]')
      .replace(/https:\/\/[^\s"'<>]+\/catalog-import-temp\/[^\s"'<>]+/gi, 'https://[REDACTED_SIGNED_URL]');

    if (msg.includes('abort') || msg.includes('timeout') || msg.includes('DEADLINE_EXCEEDED')) {
      throw new HttpError(
        504,
        'Tempo limite esgotado ao aguardar resposta da Gemini API.',
        'GEMINI_TIMEOUT'
      );
    }

    throw new HttpError(
      502,
      `Falha na análise Domain-Native com o Gemini: ${sanitized || 'Erro na chamada ao modelo.'}`,
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
      'O Gemini retornou uma resposta vazia na inferência Domain-Native.',
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

  // 5. Validação estrutural de schema Zod RAW
  const parseResult = catalogImportDomainRawAnalysisSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    const truncated = rawText.slice(0, 300);
    throw new HttpError(
      502,
      'A IA não retornou uma resposta estruturada válida (schema RAW incompatível).',
      'INVALID_GEMINI_RESPONSE',
      {
        validationIssues: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        rawJsonSnippet: truncated,
      }
    );
  }

  // 6. Normalização determinística de índices para chaves
  const { normalizedData, localIssues: normalizationIssues } = normalizeDomainNativeData(
    parseResult.data
  );

  // 7. Validação determinística local do domínio (matriz aditiva, limites, invariantes)
  const validationIssues = validateImportPlanDomain(
    normalizedData.sourceEvidence,
    normalizedData.importPlan,
    normalizedData.unresolved
  );

  const allDeterministicIssues = [...normalizationIssues, ...validationIssues];

  // 8. Construção da Review Queue consolidada (deduplicação estrutural com provenance)
  const reviewQueue = buildCatalogImportReviewQueue(
    normalizedData.unresolved,
    allDeterministicIssues
  );

  normalizedData.reviewQueue = reviewQueue;
  normalizedData.validationIssues = allDeterministicIssues;

  // 9. Coleta de metadados reais de uso de tokens
  let usageMetadata: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null =
    null;
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
    pipeline: 'domain_native',
    model,
    modelRequestCount: 1,
    inputTransport: signedUrl ? 'signed_url' : 'inline',
    thinkingLevel: 'medium',
    seed: DOMAIN_NATIVE_GENERATION_SEED,
    executionTimeMs: totalExecutionTimeMs,
    inferenceTimeMs,
    data: normalizedData,
    usage: usageMetadata,
    warnings: normalizedData.warnings,
  };
}
