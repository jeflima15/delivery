/**
 * Validador Determinístico Server-Side do Domínio de Importação de Catálogo
 *
 * Responsabilidade:
 * - Validar matematicamente e factualmente o ImportPlan contra SourceEvidence e Invariantes do Pode Vir;
 * - Validação de integridade referencial estrita (chaves existentes, escopos e ausência de ciclos);
 * - Validação de matriz aditiva via pricingObservations sem regex semântica;
 * - Validação de regras de proveniência de preço (source, derived, technical_zero_exclusive_combo, missing);
 * - Validação de combos (fixed e stages, proibição de combo dentro de combo e auto-referência);
 * - Validação de limites de transporte do checkout (quantity <= 20);
 * - Validação de cobertura Evidence -> Plan.
 */

import {
  type NormalizedSourceEvidence,
  type ImportPlan,
  type UnresolvedIssue,
  type DeterministicValidationIssue,
  type RegularProductPlan,
  type ComboProductPlan,
} from './catalogImportDomain.js';

export function validateImportPlanDomain(
  sourceEvidence: NormalizedSourceEvidence,
  importPlan: ImportPlan,
  unresolved: UnresolvedIssue[]
): DeterministicValidationIssue[] {
  const issues: DeterministicValidationIssue[] = [];

  const categoryKeys = new Set(importPlan.categories.map((c) => c.key));
  const productKeys = new Set(importPlan.products.map((p) => p.key));
  const productMap = new Map(importPlan.products.map((p) => [p.key, p]));

  // Mapa de opções por chave composta ou individual
  const optionMap = new Map<string, { deltaCents: number; maxPerItem: number; groupKey: string }>();
  for (const group of importPlan.complementGroups) {
    for (const opt of group.options) {
      optionMap.set(opt.key, {
        deltaCents: opt.priceDeltaCents,
        maxPerItem: opt.maximumPerItem,
        groupKey: group.key,
      });
    }
  }

  // Rastreamento de produtos referenciados por combos
  const productsReferencedByCombos = new Set<string>();

  /* ========================================================================
     1. INTEGRIDADE REFERENCIAL DE CATEGORIAS E PRODUTOS
     ======================================================================== */
  for (const product of importPlan.products) {
    if (product.categoryKey !== null && !categoryKeys.has(product.categoryKey)) {
      issues.push({
        severity: 'blocker',
        code: 'INVALID_CATEGORY_REFERENCE',
        message: `O produto "${product.name}" (${product.key}) referencia categoria inexistente "${product.categoryKey}".`,
        affectedEntityKeys: [product.key],
        relatedEvidenceKeys: product.sourceEvidenceKeys,
      });
    }
  }

  /* ========================================================================
     2. VALIDAÇÃO DE COMBOS (FIXED E STAGES)
     ======================================================================== */
  for (const product of importPlan.products) {
    if (product.kind === 'combo') {
      const comboProd = product as ComboProductPlan;
      const comboConfig = comboProd.combo;

      if (!comboConfig) {
        issues.push({
          severity: 'blocker',
          code: 'COMBO_CONFIG_MISSING',
          message: `O combo "${product.name}" (${product.key}) não possui configuração econômica definida.`,
          affectedEntityKeys: [product.key],
          relatedEvidenceKeys: product.sourceEvidenceKeys,
        });
        continue;
      }

      if (comboConfig.comboBasePriceCents === null) {
        issues.push({
          severity: 'blocker',
          code: 'MISSING_PRICE',
          message: `O combo "${product.name}" (${product.key}) está com preço base indefinido na fonte.`,
          affectedEntityKeys: [product.key],
          relatedEvidenceKeys: product.sourceEvidenceKeys,
        });
      }

      if (comboConfig.mode === 'fixed') {
        if (!comboConfig.items || comboConfig.items.length === 0) {
          issues.push({
            severity: 'blocker',
            code: 'FIXED_COMBO_EMPTY_ITEMS',
            message: `O combo fixo "${product.name}" (${product.key}) deve possuir pelo menos 1 item componente.`,
            affectedEntityKeys: [product.key],
            relatedEvidenceKeys: product.sourceEvidenceKeys,
          });
        }

        for (const item of comboConfig.items || []) {
          productsReferencedByCombos.add(item.productKey);

          if (item.quantity < 1) {
            issues.push({
              severity: 'blocker',
              code: 'INVALID_COMBO_ITEM_QUANTITY',
              message: `Item componente "${item.productKey}" no combo "${product.name}" possui quantidade inválida (${item.quantity}).`,
              affectedEntityKeys: [product.key, item.productKey],
              relatedEvidenceKeys: product.sourceEvidenceKeys,
            });
          }

          if (item.quantity > 20) {
            issues.push({
              severity: 'blocker',
              code: 'UNSUPPORTED_OPTION_QUANTITY',
              message: `Item componente "${item.productKey}" no combo "${product.name}" possui quantidade (${item.quantity}) superior ao limite de transporte do checkout (máx 20).`,
              affectedEntityKeys: [product.key, item.productKey],
              relatedEvidenceKeys: product.sourceEvidenceKeys,
            });
          }

          if (item.productKey === product.key) {
            issues.push({
              severity: 'blocker',
              code: 'COMBO_SELF_REFERENCE',
              message: `O combo "${product.name}" (${product.key}) não pode referenciar a si mesmo.`,
              affectedEntityKeys: [product.key],
              relatedEvidenceKeys: product.sourceEvidenceKeys,
            });
          }

          const targetProduct = productMap.get(item.productKey);
          if (!targetProduct) {
            issues.push({
              severity: 'blocker',
              code: 'INVALID_COMBO_PRODUCT_REF',
              message: `Item componente "${item.productKey}" no combo "${product.name}" não existe no plano de produtos.`,
              affectedEntityKeys: [product.key, item.productKey],
              relatedEvidenceKeys: product.sourceEvidenceKeys,
            });
          } else if (targetProduct.kind === 'combo') {
            issues.push({
              severity: 'blocker',
              code: 'NESTED_COMBO_FORBIDDEN',
              message: `O combo "${product.name}" não pode conter outro combo ("${targetProduct.name}").`,
              affectedEntityKeys: [product.key, targetProduct.key],
              relatedEvidenceKeys: product.sourceEvidenceKeys,
            });
          }
        }
      } else if (comboConfig.mode === 'stages') {
        if (!comboConfig.stages || comboConfig.stages.length === 0) {
          issues.push({
            severity: 'blocker',
            code: 'STAGED_COMBO_EMPTY_STAGES',
            message: `O combo em etapas "${product.name}" (${product.key}) deve possuir pelo menos 1 etapa.`,
            affectedEntityKeys: [product.key],
            relatedEvidenceKeys: product.sourceEvidenceKeys,
          });
        }

        for (const stage of comboConfig.stages || []) {
          if (!stage.options || stage.options.length === 0) {
            issues.push({
              severity: 'blocker',
              code: 'COMBO_STAGE_EMPTY_OPTIONS',
              message: `A etapa "${stage.name}" do combo "${product.name}" não possui opções.`,
              affectedEntityKeys: [product.key],
              relatedEvidenceKeys: product.sourceEvidenceKeys,
            });
          }

          for (const opt of stage.options || []) {
            productsReferencedByCombos.add(opt.productKey);

            if (opt.productKey === product.key) {
              issues.push({
                severity: 'blocker',
                code: 'COMBO_SELF_REFERENCE',
                message: `A opção "${opt.productKey}" na etapa "${stage.name}" do combo "${product.name}" auto-referencia o combo.`,
                affectedEntityKeys: [product.key],
                relatedEvidenceKeys: product.sourceEvidenceKeys,
              });
            }

            const targetProduct = productMap.get(opt.productKey);
            if (!targetProduct) {
              issues.push({
                severity: 'blocker',
                code: 'INVALID_COMBO_STAGE_PRODUCT_REF',
                message: `Opção "${opt.productKey}" na etapa "${stage.name}" do combo "${product.name}" referencia produto inexistente.`,
                affectedEntityKeys: [product.key, opt.productKey],
                relatedEvidenceKeys: product.sourceEvidenceKeys,
              });
            } else if (targetProduct.kind === 'combo') {
              issues.push({
                severity: 'blocker',
                code: 'NESTED_COMBO_FORBIDDEN',
                message: `A opção "${targetProduct.name}" na etapa "${stage.name}" do combo "${product.name}" é um combo, o que não é suportado.`,
                affectedEntityKeys: [product.key, targetProduct.key],
                relatedEvidenceKeys: product.sourceEvidenceKeys,
              });
            }
          }
        }
      }
    }
  }

  /* ========================================================================
     3. REGRAS MONETÁRIAS E PROVENIÊNCIA DE PREÇO (TECHNICAL ZERO)
     ======================================================================== */
  for (const product of importPlan.products) {
    if (product.kind === 'product') {
      const regular = product as RegularProductPlan;

      if (regular.priceOrigin === 'technical_zero_exclusive_combo') {
        const isReferencedByCombo = productsReferencedByCombos.has(regular.key);

        if (!regular.exclusiveToCombo) {
          issues.push({
            severity: 'blocker',
            code: 'TECHNICAL_ZERO_INVALID',
            message: `Produto "${regular.name}" (${regular.key}) possui priceOrigin='technical_zero_exclusive_combo', mas exclusiveToCombo é false.`,
            affectedEntityKeys: [regular.key],
            relatedEvidenceKeys: regular.sourceEvidenceKeys,
          });
        }

        if (!isReferencedByCombo) {
          issues.push({
            severity: 'blocker',
            code: 'TECHNICAL_ZERO_INVALID',
            message: `Produto "${regular.name}" (${regular.key}) usa technical_zero_exclusive_combo, mas não é referenciado por nenhum combo no plano.`,
            affectedEntityKeys: [regular.key],
            relatedEvidenceKeys: regular.sourceEvidenceKeys,
          });
        }

        if (regular.basePriceCents !== 0) {
          issues.push({
            severity: 'blocker',
            code: 'TECHNICAL_ZERO_INVALID',
            message: `Produto "${regular.name}" (${regular.key}) usa technical_zero_exclusive_combo, mas basePriceCents é ${regular.basePriceCents} (deve ser 0).`,
            affectedEntityKeys: [regular.key],
            relatedEvidenceKeys: regular.sourceEvidenceKeys,
          });
        }
      } else if (regular.priceOrigin === 'missing') {
        if (regular.basePriceCents !== null) {
          issues.push({
            severity: 'blocker',
            code: 'PRICE_ORIGIN_INCONSISTENCY',
            message: `Produto "${regular.name}" (${regular.key}) possui priceOrigin='missing', mas basePriceCents é ${regular.basePriceCents} (deve ser null).`,
            affectedEntityKeys: [regular.key],
            relatedEvidenceKeys: regular.sourceEvidenceKeys,
          });
        }
        issues.push({
          severity: 'blocker',
          code: 'MISSING_PRICE',
          message: `Produto "${regular.name}" (${regular.key}) não possui preço identificado na fonte documental.`,
          affectedEntityKeys: [regular.key],
          relatedEvidenceKeys: regular.sourceEvidenceKeys,
        });
      } else if (regular.priceOrigin === 'source' || regular.priceOrigin === 'derived') {
        if (regular.basePriceCents === null || regular.basePriceCents <= 0) {
          issues.push({
            severity: 'blocker',
            code: 'MISSING_PRICE',
            message: `Produto "${regular.name}" (${regular.key}) possui proveniência '${regular.priceOrigin}', mas basePriceCents é inválido (${regular.basePriceCents}).`,
            affectedEntityKeys: [regular.key],
            relatedEvidenceKeys: regular.sourceEvidenceKeys,
          });
        }
      }
    }
  }

  /* ========================================================================
     4. VALIDAÇÃO DE COMPLEMENT GROUPS (EMBEDDED vs SHARED & LIMITES)
     ======================================================================== */
  for (const group of importPlan.complementGroups) {
    if (!group.options || group.options.length === 0) {
      issues.push({
        severity: 'blocker',
        code: 'EMPTY_COMPLEMENT_GROUP',
        message: `Grupo de complementos "${group.name}" (${group.key}) não possui nenhuma opção.`,
        affectedEntityKeys: [group.key],
        relatedEvidenceKeys: group.sourceEvidenceKeys,
      });
    }

    if (group.maximum > 20) {
      issues.push({
        severity: 'blocker',
        code: 'UNSUPPORTED_OPTION_QUANTITY',
        message: `Grupo de complementos "${group.name}" (${group.key}) possui máximo (${group.maximum}) superior ao limite de transporte do checkout (máx 20).`,
        affectedEntityKeys: [group.key],
        relatedEvidenceKeys: group.sourceEvidenceKeys,
      });
    }

    if (group.minimum > group.maximum) {
      issues.push({
        severity: 'blocker',
        code: 'GROUP_MIN_EXCEEDS_MAX',
        message: `Grupo de complementos "${group.name}" (${group.key}) possui mínimo (${group.minimum}) maior que o máximo (${group.maximum}).`,
        affectedEntityKeys: [group.key],
        relatedEvidenceKeys: group.sourceEvidenceKeys,
      });
    }

    if (group.required && group.minimum < 1) {
      issues.push({
        severity: 'blocker',
        code: 'REQUIRED_GROUP_MIN_ZERO',
        message: `Grupo de complementos obrigatório "${group.name}" (${group.key}) deve possuir mínimo de pelo menos 1 (atual: ${group.minimum}).`,
        affectedEntityKeys: [group.key],
        relatedEvidenceKeys: group.sourceEvidenceKeys,
      });
    }

    if (group.placement.type === 'embedded_product') {
      const targetProd = productMap.get(group.placement.productKey);
      if (!targetProd) {
        issues.push({
          severity: 'blocker',
          code: 'INVALID_GROUP_PRODUCT_REF',
          message: `Grupo embedded "${group.name}" referencia produto inexistente "${group.placement.productKey}".`,
          affectedEntityKeys: [group.key, group.placement.productKey],
          relatedEvidenceKeys: group.sourceEvidenceKeys,
        });
      }
    } else if (group.placement.type === 'shared') {
      for (const pKey of group.placement.productKeys) {
        if (!productKeys.has(pKey)) {
          issues.push({
            severity: 'blocker',
            code: 'INVALID_SHARED_PRODUCT_REF',
            message: `Grupo shared "${group.name}" referencia produto inexistente "${pKey}".`,
            affectedEntityKeys: [group.key, pKey],
            relatedEvidenceKeys: group.sourceEvidenceKeys,
          });
        }
      }
      for (const cKey of group.placement.categoryKeys) {
        if (!categoryKeys.has(cKey)) {
          issues.push({
            severity: 'blocker',
            code: 'INVALID_SHARED_CATEGORY_REF',
            message: `Grupo shared "${group.name}" referencia categoria inexistente "${cKey}".`,
            affectedEntityKeys: [group.key, cKey],
            relatedEvidenceKeys: group.sourceEvidenceKeys,
          });
        }
      }
    }

    for (const opt of group.options) {
      if (opt.priceDeltaCents < 0) {
        issues.push({
          severity: 'blocker',
          code: 'NEGATIVE_PRICE_DELTA',
          message: `Opção "${opt.name}" no grupo "${group.name}" possui acréscimo delta negativo (${opt.priceDeltaCents}), o que não é suportado.`,
          affectedEntityKeys: [group.key, opt.key],
          relatedEvidenceKeys: opt.sourceEvidenceKeys,
        });
      }

      if (opt.maximumPerItem > 20) {
        issues.push({
          severity: 'blocker',
          code: 'UNSUPPORTED_OPTION_QUANTITY',
          message: `Opção "${opt.name}" no grupo "${group.name}" exige limite individual de ${opt.maximumPerItem}, excedendo o limite de transporte do checkout (máx 20).`,
          affectedEntityKeys: [group.key, opt.key],
          relatedEvidenceKeys: opt.sourceEvidenceKeys,
        });
      }
    }
  }

  /* ========================================================================
     5. VALIDAÇÃO MATEMÁTICA DE MATRIZ ADITIVA (pricingObservations)
     ======================================================================== */
  for (const obs of sourceEvidence.pricingObservations) {
    const candidate =
      sourceEvidence.productCandidates.find((c) => c.candidateKey === obs.candidateKey) ||
      (typeof (obs as any).productCandidateIndex === 'number'
        ? sourceEvidence.productCandidates[(obs as any).productCandidateIndex]
        : undefined);
    if (!candidate) continue;

    // Encontra o produto no importPlan correspondente ao candidato
    const matchedProduct = importPlan.products.find(
      (p) =>
        p.sourceEvidenceKeys.includes(candidate.candidateKey) ||
        p.name.trim().toLowerCase() === candidate.name.trim().toLowerCase()
    );

    if (!matchedProduct || matchedProduct.kind !== 'product') continue;
    const baseCents = (matchedProduct as RegularProductPlan).basePriceCents;
    if (baseCents === null) continue; // Missing price já tratado

    // Soma os deltas das opções correspondentes
    let sumDeltas = 0;
    let validObservation = true;

    for (const selector of obs.selectors) {
      const groupEv =
        sourceEvidence.choiceGroups.find((g) => g.groupKey === selector.groupKey) ||
        (typeof (selector as any).choiceGroupIndex === 'number'
          ? sourceEvidence.choiceGroups[(selector as any).choiceGroupIndex]
          : undefined);
      const optEv =
        groupEv?.options?.find((o) => o.optionKey === selector.optionKey) ||
        (typeof (selector as any).optionIndex === 'number'
          ? groupEv?.options?.[(selector as any).optionIndex]
          : undefined);

      if (!optEv) {
        validObservation = false;
        break;
      }

      // Busca na lista de grupos do plano
      let foundDelta: number | null = null;
      for (const grp of importPlan.complementGroups) {
        const o = grp.options.find(
          (item) =>
            item.sourceEvidenceKeys.includes(optEv.optionKey) ||
            item.name.trim().toLowerCase() === optEv.name.trim().toLowerCase()
        );
        if (o !== undefined) {
          foundDelta = o.priceDeltaCents;
          break;
        }
      }

      if (foundDelta === null) {
        validObservation = false;
        break;
      }

      sumDeltas += foundDelta;
    }

    if (validObservation) {
      const reconstructedPrice = baseCents + sumDeltas;
      if (reconstructedPrice !== obs.amountCents) {
        issues.push({
          severity: 'blocker',
          code: 'PRICING_MATRIX_NON_ADDITIVE',
          message: `Matriz de preço não aditiva para "${matchedProduct.name}": observado R$ ${(
            obs.amountCents / 100
          ).toFixed(2)}, reconstruído R$ ${(reconstructedPrice / 100).toFixed(2)} (base R$ ${(
            baseCents / 100
          ).toFixed(2)} + deltas R$ ${(sumDeltas / 100).toFixed(2)}).`,
          affectedEntityKeys: [matchedProduct.key],
          relatedEvidenceKeys: [obs.observationKey],
          details: {
            observedAmountCents: obs.amountCents,
            reconstructedAmountCents: reconstructedPrice,
            basePriceCents: baseCents,
            sumDeltas,
          },
        });
      }
    }
  }

  /* ========================================================================
     6. VALIDAÇÃO DE PREORDER E POLÍTICAS DA LOJA
     ======================================================================== */
  for (const product of importPlan.products) {
    if (product.preorderPolicy) {
      const { availability, minLeadMinutes } = product.preorderPolicy;
      if (
        availability !== null &&
        availability !== 'immediate_only' &&
        availability !== 'scheduled_only' &&
        availability !== 'both'
      ) {
        issues.push({
          severity: 'blocker',
          code: 'INVALID_PREORDER_AVAILABILITY',
          message: `Disponibilidade de encomenda inválida ("${availability}") no produto "${product.name}".`,
          affectedEntityKeys: [product.key],
          relatedEvidenceKeys: product.sourceEvidenceKeys,
        });
      }

      if (minLeadMinutes !== null && (minLeadMinutes < 0 || minLeadMinutes > 525_600)) {
        issues.push({
          severity: 'blocker',
          code: 'INVALID_PREORDER_LEAD_TIME',
          message: `Tempo de antecedência de encomenda inválido (${minLeadMinutes} min) no produto "${product.name}".`,
          affectedEntityKeys: [product.key],
          relatedEvidenceKeys: product.sourceEvidenceKeys,
        });
      }
    }
  }

  if (importPlan.storePolicy) {
    if (
      importPlan.storePolicy.pedidoMinimoCents !== undefined &&
      importPlan.storePolicy.pedidoMinimoCents !== null &&
      importPlan.storePolicy.pedidoMinimoCents < 0
    ) {
      issues.push({
        severity: 'blocker',
        code: 'INVALID_MINIMUM_ORDER',
        message: `Pedido mínimo da loja não pode ser negativo (${importPlan.storePolicy.pedidoMinimoCents}).`,
        affectedEntityKeys: ['storePolicy'],
        relatedEvidenceKeys: [],
      });
    }

    if (
      importPlan.storePolicy.pedidoMinimoCents !== undefined &&
      importPlan.storePolicy.pedidoMinimoCents !== null &&
      importPlan.storePolicy.pedidoMinimoCents > 1000000
    ) {
      issues.push({
        severity: 'warning',
        code: 'INVALID_STORE_POLICY',
        message: `Pedido mínimo da loja muito elevado (${importPlan.storePolicy.pedidoMinimoCents / 100} BRL).`,
        affectedEntityKeys: ['storePolicy'],
        relatedEvidenceKeys: [],
      });
    }

    if (
      importPlan.storePolicy.globalPreorder?.minLeadMinutes &&
      importPlan.storePolicy.globalPreorder.minLeadMinutes > 525_600
    ) {
      issues.push({
        severity: 'warning',
        code: 'INVALID_PREORDER_POLICY',
        message: `Antecedência global de encomenda superior a 365 dias (${importPlan.storePolicy.globalPreorder.minLeadMinutes} min).`,
        affectedEntityKeys: ['storePolicy'],
        relatedEvidenceKeys: [],
      });
    }
  }

  /* ========================================================================
     7. VALIDAÇÃO DE FOTOS
     ======================================================================== */
  for (const imgPlan of importPlan.productImages) {
    if (!productKeys.has(imgPlan.productKey)) {
      issues.push({
        severity: 'blocker',
        code: 'INVALID_IMAGE_PRODUCT_REF',
        message: `Foto planejada referencia produto inexistente "${imgPlan.productKey}".`,
        affectedEntityKeys: [imgPlan.productKey],
        relatedEvidenceKeys: [imgPlan.sourcePhotoKey],
      });
    }
  }

  /* ========================================================================
     8. COBERTURA ESTRUTURAL EVIDENCE -> IMPORT PLAN & UNRESOLVED
     ======================================================================== */
  const unresolvedEvidenceKeys = new Set(unresolved.flatMap((u) => u.evidenceKeys));
  const unresolvedAffectedKeys = new Set(unresolved.flatMap((u) => u.affectedEntityKeys));
  const isKeyInUnresolved = (key: string) =>
    unresolvedEvidenceKeys.has(key) || unresolvedAffectedKeys.has(key);

  const candidateKeySet = new Set(sourceEvidence.productCandidates.map((c) => c.candidateKey));
  const comboEvidenceKeySet = new Set(sourceEvidence.comboEvidence.map((c) => c.comboKey));
  const choiceGroupKeySet = new Set(sourceEvidence.choiceGroups.map((g) => g.groupKey));

  // 8.1. ProductCandidate relevante sem ProductPlan / Unresolved
  for (const candidate of sourceEvidence.productCandidates) {
    const isMapped = importPlan.products.some(
      (p) =>
        p.sourceEvidenceKeys.includes(candidate.candidateKey) ||
        p.name.trim().toLowerCase() === candidate.name.trim().toLowerCase()
    );
    const isExplicitlyUnresolved = isKeyInUnresolved(candidate.candidateKey);

    if (!isMapped && !isExplicitlyUnresolved) {
      issues.push({
        severity: 'warning',
        code: 'UNMAPPED_PRODUCT_CANDIDATE',
        message: `Candidato a produto documental "${candidate.name}" (${candidate.candidateKey}) não foi mapeado para o plano nem registrado em pendências.`,
        affectedEntityKeys: [],
        relatedEvidenceKeys: [candidate.candidateKey],
      });
    }
  }

  // 8.2. ChoiceGroup relevante sem ComplementGroupPlan / Unresolved
  for (const choiceGroup of sourceEvidence.choiceGroups) {
    const isMapped = importPlan.complementGroups.some(
      (g) =>
        g.sourceEvidenceKeys.includes(choiceGroup.groupKey) ||
        (choiceGroup.title && g.name.trim().toLowerCase() === choiceGroup.title.trim().toLowerCase())
    );
    const isExplicitlyUnresolved = isKeyInUnresolved(choiceGroup.groupKey);

    if (!isMapped && !isExplicitlyUnresolved) {
      issues.push({
        severity: 'warning',
        code: 'UNMAPPED_CHOICE_GROUP',
        message: `Grupo de opções documental "${choiceGroup.title || choiceGroup.groupKey}" (${choiceGroup.groupKey}) não foi mapeado para o plano de complementos nem registrado em pendências.`,
        affectedEntityKeys: [],
        relatedEvidenceKeys: [choiceGroup.groupKey],
      });
    }
  }

  // 8.3. Option relevante desaparecida em grupos mapeados
  for (const choiceGroup of sourceEvidence.choiceGroups) {
    const mappedGroups = importPlan.complementGroups.filter(
      (g) =>
        g.sourceEvidenceKeys.includes(choiceGroup.groupKey) ||
        (choiceGroup.title && g.name.trim().toLowerCase() === choiceGroup.title.trim().toLowerCase())
    );
    if (mappedGroups.length === 0) continue;

    for (const optEv of choiceGroup.options) {
      const isOptMapped = mappedGroups.some((grp) =>
        grp.options.some(
          (optPlan) =>
            optPlan.sourceEvidenceKeys.includes(optEv.optionKey) ||
            optPlan.name.trim().toLowerCase() === optEv.name.trim().toLowerCase()
        )
      );
      const isOptUnresolved = isKeyInUnresolved(optEv.optionKey);

      if (!isOptMapped && !isOptUnresolved) {
        issues.push({
          severity: 'warning',
          code: 'UNMAPPED_OPTION',
          message: `Opção documental "${optEv.name}" (${optEv.optionKey}) do grupo "${choiceGroup.title || choiceGroup.groupKey}" não foi incluída no plano nem registrada em pendências.`,
          affectedEntityKeys: [],
          relatedEvidenceKeys: [optEv.optionKey, choiceGroup.groupKey],
        });
      }
    }
  }

  // 8.4. RuleBlock relevante sem primitive / Unresolved
  for (const rule of sourceEvidence.ruleBlocks) {
    const isReflectedInStorePolicy = Boolean(
      importPlan.storePolicy &&
        (importPlan.storePolicy.pedidoMinimoCents !== null ||
          importPlan.storePolicy.globalPreorder !== null)
    );
    const isReflectedInProductPreorder = importPlan.products.some(
      (p) => p.sourceEvidenceKeys.includes(rule.ruleKey) && p.preorderPolicy !== null
    );
    const isRuleUnresolved = isKeyInUnresolved(rule.ruleKey);

    if (!isReflectedInStorePolicy && !isReflectedInProductPreorder && !isRuleUnresolved) {
      issues.push({
        severity: 'warning',
        code: 'UNMAPPED_RULE_BLOCK',
        message: `Bloco de regra documental "${rule.title || 'Regra'}" (${rule.ruleKey}) não foi modelado em políticas suportadas nem registrado em pendências.`,
        affectedEntityKeys: [],
        relatedEvidenceKeys: [rule.ruleKey],
      });
    }
  }

  // 8.5. ImportPlan entity sem Evidence correspondente (exceto supporting Product legítimo de Combo)
  for (const product of importPlan.products) {
    const isSupportingComboProduct =
      product.exclusiveToCombo && productsReferencedByCombos.has(product.key);

    if (isSupportingComboProduct) {
      continue;
    }

    const hasEvidenceRef =
      product.sourceEvidenceKeys.length > 0 &&
      product.sourceEvidenceKeys.some(
        (k) => candidateKeySet.has(k) || comboEvidenceKeySet.has(k)
      );

    if (!hasEvidenceRef) {
      issues.push({
        severity: 'warning',
        code: 'ORPHAN_IMPORT_PLAN_PRODUCT',
        message: `Produto planejado "${product.name}" (${product.key}) não possui evidência documental correspondente em sourceEvidence.`,
        affectedEntityKeys: [product.key],
        relatedEvidenceKeys: product.sourceEvidenceKeys,
      });
    }
  }

  for (const group of importPlan.complementGroups) {
    const hasEvidenceRef =
      group.sourceEvidenceKeys.length > 0 &&
      group.sourceEvidenceKeys.some((k) => choiceGroupKeySet.has(k));

    if (!hasEvidenceRef) {
      issues.push({
        severity: 'warning',
        code: 'ORPHAN_IMPORT_PLAN_GROUP',
        message: `Grupo de complementos planejado "${group.name}" (${group.key}) não possui evidência documental correspondente em sourceEvidence.`,
        affectedEntityKeys: [group.key],
        relatedEvidenceKeys: group.sourceEvidenceKeys,
      });
    }
  }

  return issues;
}
