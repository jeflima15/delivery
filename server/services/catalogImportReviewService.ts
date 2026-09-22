import crypto from 'node:crypto';
import type mongoose from 'mongoose';
import Category from '../../src/models/Category.js';
import Product from '../../src/models/Product.js';
import ComplementGroup from '../../src/models/ComplementGroup.js';
import { validateImportPlanDomain } from '../domain/catalogImportValidation.js';
import { getCatalogRevision } from './catalogRevisionService.js';
import { HttpError } from '../middleware/errors.js';

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashValue(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function normalizeCatalogName(value: unknown): string {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export async function reconcileCatalogImport(tenantId: mongoose.Types.ObjectId, plan: any, decisions: any) {
  const [categories, products, groups, catalogRevision] = await Promise.all([
    Category.find({ tenantId }).select('_id nome descricao updatedAt').lean(),
    Product.find({ tenantId }).select('_id nome categoriaId tipo preco_centavos preco updatedAt').lean(),
    ComplementGroup.find({ tenantId }).select('_id nome minimo maximo itens updatedAt').lean(),
    getCatalogRevision(tenantId),
  ]);
  const categoryByKey = new Map((plan.categories || []).map((entry: any) => [entry.key, entry]));
  const existingCategoryByName = new Map(categories.map((entry: any) => [normalizeCatalogName(entry.nome), entry]));
  const duplicates: any[] = [];

  for (const category of plan.categories || []) {
    const existing = existingCategoryByName.get(normalizeCatalogName(category.name));
    if (existing) duplicates.push({
      entityKey: category.key,
      entityType: 'category',
      name: category.name,
      candidates: [{ id: String(existing._id), name: existing.nome }],
      resolution: { action: 'reuse_existing', existingId: String(existing._id), automatic: true },
    });
  }

  for (const product of plan.products || []) {
    const categoryName = product.categoryKey ? (categoryByKey.get(product.categoryKey) as any)?.name : '';
    const candidates = products.filter((existing: any) => {
      if (normalizeCatalogName(existing.nome) !== normalizeCatalogName(product.name)) return false;
      const existingCategory = categories.find((category: any) => String(category._id) === String(existing.categoriaId));
      return normalizeCatalogName(existingCategory?.nome || '') === normalizeCatalogName(categoryName) && (existing.tipo || 'produto') === (product.kind === 'combo' ? 'combo' : 'produto');
    }).map((entry: any) => ({ id: String(entry._id), name: entry.nome, priceCents: Number(entry.preco_centavos ?? Math.round(Number(entry.preco || 0) * 100)) }));
    if (candidates.length) duplicates.push({
      entityKey: product.key,
      entityType: product.kind,
      name: product.name,
      candidates,
      resolution: decisions?.duplicates?.[product.key] || null,
    });
  }

  for (const group of plan.complementGroups || []) {
    if (group.placement?.type !== 'shared') continue;
    const candidates = groups.filter((existing: any) => normalizeCatalogName(existing.nome) === normalizeCatalogName(group.name))
      .map((entry: any) => ({ id: String(entry._id), name: entry.nome, minimum: entry.minimo, maximum: entry.maximo }));
    if (candidates.length) duplicates.push({
      entityKey: group.key,
      entityType: 'complement_group',
      name: group.name,
      candidates,
      resolution: decisions?.duplicates?.[group.key] || null,
    });
  }

  return { catalogRevision, checkedAt: new Date(), duplicates };
}

export function computeImportReadiness(analysisData: any, plan: any, decisions: any, reconciliation: any) {
  const excluded = new Set<string>(decisions?.excludedEntityKeys || []);
  const unavailable = (key: string) => excluded.has(key) || decisions?.duplicates?.[key]?.action === 'skip';
  const resolvedIssues = new Set<string>(decisions?.resolvedIssueKeys || []);
  const deterministic = validateImportPlanDomain(analysisData.sourceEvidence, plan, analysisData.unresolved || []);
  const decisionIssues: any[] = [];
  for (const combo of (plan.products || []).filter((entry: any) => entry.kind === 'combo' && !unavailable(entry.key))) {
    const componentKeys = combo.combo?.mode === 'fixed'
      ? (combo.combo.items || []).map((entry: any) => entry.productKey)
      : (combo.combo?.stages || []).flatMap((stage: any) => (stage.options || []).map((entry: any) => entry.productKey));
    const missing = componentKeys.filter(unavailable);
    if (missing.length) decisionIssues.push({ severity: 'blocker', code: 'EXCLUDED_COMBO_COMPONENT', message: `O combo "${combo.name}" usa itens marcados para não importar.`, affectedEntityKeys: [combo.key, ...missing], relatedEvidenceKeys: [] });
  }
  for (const group of (plan.complementGroups || []).filter((entry: any) => entry.placement?.type === 'shared' && !unavailable(entry.key))) {
    const availableTargets = [...(group.placement.productKeys || []), ...(group.placement.categoryKeys || [])].filter((key: string) => !unavailable(key));
    if (availableTargets.length === 0) decisionIssues.push({ severity: 'blocker', code: 'SHARED_GROUP_WITHOUT_TARGET', message: `O grupo "${group.name}" ficou sem produtos ou categorias de destino.`, affectedEntityKeys: [group.key], relatedEvidenceKeys: [] });
  }
  for (const group of (plan.complementGroups || []).filter((entry: any) => !unavailable(entry.key))) {
    const availableOptions = (group.options || []).filter((option: any) => !unavailable(option.key) && option.active !== false).length;
    if (availableOptions < Number(group.minimum || 0)) decisionIssues.push({ severity: 'blocker', code: 'GROUP_MINIMUM_WITH_EXCLUDED_OPTIONS', message: `O grupo "${group.name}" não possui opções ativas suficientes para o mínimo configurado.`, affectedEntityKeys: [group.key], relatedEvidenceKeys: [] });
  }
  const allDeterministic = [...deterministic, ...decisionIssues];
  const deterministicBlockers = allDeterministic.filter((issue: any) => issue.severity === 'blocker' && !issue.affectedEntityKeys.every((key: string) => excluded.has(key)));
  const modelBlockers = (analysisData.unresolved || []).filter((issue: any) => issue.severity === 'blocker' && !resolvedIssues.has(issue.key) && !issue.affectedEntityKeys.every((key: string) => excluded.has(key)));
  const requiredChoices = (analysisData.modelingChoices || []).filter((choice: any) => choice.requiresUserDecision && !decisions?.modeling?.[choice.key]);
  const unresolvedDuplicates = (reconciliation?.duplicates || []).filter((duplicate: any) => duplicate.entityType !== 'category' && !decisions?.duplicates?.[duplicate.entityKey] && !excluded.has(duplicate.entityKey));
  return {
    blockerCount: deterministicBlockers.length + modelBlockers.length,
    requiredDecisionCount: requiredChoices.length,
    unresolvedDuplicateCount: unresolvedDuplicates.length,
    canConfirm: deterministicBlockers.length === 0 && modelBlockers.length === 0 && requiredChoices.length === 0 && unresolvedDuplicates.length === 0,
    deterministicIssues: allDeterministic,
  };
}

export function applyReviewOperations(plan: any, analysisData: any, decisions: any, operations: any[]) {
  const nextPlan = structuredClone(plan);
  const nextDecisions = structuredClone(decisions || { modeling: {}, duplicates: {}, acknowledgedWarnings: [], resolvedIssueKeys: [], excludedEntityKeys: [], imageSelections: {}, imageSourceKeys: {} });
  nextDecisions.modeling ||= {};
  nextDecisions.duplicates ||= {};
  nextDecisions.acknowledgedWarnings ||= [];
  nextDecisions.resolvedIssueKeys ||= [];
  nextDecisions.excludedEntityKeys ||= [];
  nextDecisions.imageSelections ||= {};
  nextDecisions.imageSourceKeys ||= {};
  const hasStructuralEdit = operations.some((entry) => ['edit_category', 'edit_product', 'edit_combo', 'edit_group', 'edit_option'].includes(entry.type));
  const touchedEntityKeys = new Set<string>();

  for (const operation of operations) {
    if (operation.type === 'edit_category') {
      const item = nextPlan.categories.find((entry: any) => entry.key === operation.key);
      if (!item) throw new HttpError(404, 'Categoria do rascunho não encontrada.', 'DRAFT_ENTITY_NOT_FOUND');
      if (operation.patch.name !== undefined) item.name = String(operation.patch.name).trim();
      if (operation.patch.description !== undefined) item.description = String(operation.patch.description).trim();
      touchedEntityKeys.add(operation.key);
    } else if (operation.type === 'edit_product') {
      const item = nextPlan.products.find((entry: any) => entry.key === operation.key);
      if (!item) throw new HttpError(404, 'Produto do rascunho não encontrado.', 'DRAFT_ENTITY_NOT_FOUND');
      for (const field of ['name', 'description', 'categoryKey', 'basePriceCents', 'exclusiveToCombo', 'preorderPolicy']) {
        if (Object.prototype.hasOwnProperty.call(operation.patch, field)) item[field] = operation.patch[field];
      }
      touchedEntityKeys.add(operation.key);
    } else if (operation.type === 'edit_combo') {
      const item = nextPlan.products.find((entry: any) => entry.key === operation.key && entry.kind === 'combo');
      if (!item) throw new HttpError(404, 'Combo do rascunho não encontrado.', 'DRAFT_ENTITY_NOT_FOUND');
      item.combo = operation.combo;
      item.startingPriceCents = operation.combo.comboBasePriceCents === null
        ? null
        : operation.combo.mode === 'fixed'
          ? operation.combo.comboBasePriceCents
          : operation.combo.comboBasePriceCents + operation.combo.stages.reduce((total: number, stage: any) => {
            const minimumExtra = Math.min(...stage.options.map((option: any) => option.extraCents));
            return total + stage.stageValueCents + (Number.isFinite(minimumExtra) ? minimumExtra : 0);
          }, 0);
      touchedEntityKeys.add(operation.key);
    } else if (operation.type === 'edit_group') {
      const item = nextPlan.complementGroups.find((entry: any) => entry.key === operation.key);
      if (!item) throw new HttpError(404, 'Grupo do rascunho não encontrado.', 'DRAFT_ENTITY_NOT_FOUND');
      for (const field of ['name', 'required', 'minimum', 'maximum', 'active', 'placement']) if (Object.prototype.hasOwnProperty.call(operation.patch, field)) item[field] = operation.patch[field];
      touchedEntityKeys.add(operation.key);
    } else if (operation.type === 'edit_option') {
      const group = nextPlan.complementGroups.find((entry: any) => entry.key === operation.groupKey);
      const item = group?.options?.find((entry: any) => entry.key === operation.optionKey);
      if (!item) throw new HttpError(404, 'Opção do rascunho não encontrada.', 'DRAFT_ENTITY_NOT_FOUND');
      for (const field of ['name', 'description', 'priceDeltaCents', 'maximumPerItem', 'active']) if (Object.prototype.hasOwnProperty.call(operation.patch, field)) item[field] = operation.patch[field];
      touchedEntityKeys.add(operation.groupKey);
      touchedEntityKeys.add(operation.optionKey);
    } else if (operation.type === 'set_excluded') {
      const allKeys = new Set<string>([
        ...(nextPlan.categories || []).map((entry: any) => entry.key),
        ...(nextPlan.products || []).map((entry: any) => entry.key),
        ...(nextPlan.complementGroups || []).flatMap((entry: any) => [entry.key, ...(entry.options || []).map((option: any) => option.key)]),
      ]);
      if (!allKeys.has(operation.key)) throw new HttpError(404, 'Item do rascunho não encontrado.', 'DRAFT_ENTITY_NOT_FOUND');
      const set = new Set<string>(nextDecisions.excludedEntityKeys);
      if (operation.excluded) set.add(operation.key);
      else set.delete(operation.key);
      nextDecisions.excludedEntityKeys = [...set];
    } else if (operation.type === 'set_duplicate') {
      if (!['create', 'reuse_existing', 'skip'].includes(operation.action)) throw new HttpError(400, 'Resolução de duplicidade inválida.', 'INVALID_DUPLICATE_RESOLUTION');
      nextDecisions.duplicates[operation.key] = { action: operation.action, existingId: operation.existingId || null };
    } else if (operation.type === 'select_modeling') {
      const choice = (analysisData.modelingChoices || []).find((entry: any) => entry.key === operation.key);
      if (!choice || !choice.alternatives.some((entry: any) => entry.strategy === operation.strategy)) throw new HttpError(400, 'Alternativa de modelagem inválida.', 'INVALID_MODELING_CHOICE');
      if (operation.strategy !== choice.recommendedStrategy && !hasStructuralEdit && hashValue(nextPlan) === hashValue(analysisData.importPlan)) throw new HttpError(409, 'Esta alternativa exige edição estruturada do rascunho antes de ser selecionada.', 'MODELING_TRANSFORMATION_REQUIRED');
      nextDecisions.modeling[operation.key] = { strategy: operation.strategy, appliedAtRevision: operation.expectedRevision };
    } else if (operation.type === 'resolve_issue') {
      const issue = (analysisData.unresolved || []).find((entry: any) => entry.key === operation.key);
      if (!issue) throw new HttpError(404, 'Pendência não encontrada.', 'DRAFT_ENTITY_NOT_FOUND');
      const affected = issue.affectedEntityKeys || [];
      const safelyHandled = affected.length > 0 && affected.every((key: string) => nextDecisions.excludedEntityKeys.includes(key));
      if (issue.severity === 'blocker' && !safelyHandled && !affected.some((key: string) => touchedEntityKeys.has(key))) {
        throw new HttpError(409, 'Corrija ou exclua os itens afetados antes de resolver este bloqueio.', 'BLOCKER_REQUIRES_CHANGE');
      }
      nextDecisions.resolvedIssueKeys = [...new Set([...nextDecisions.resolvedIssueKeys, operation.key])];
    } else if (operation.type === 'set_image') {
      if (operation.url && !/^https:\/\//i.test(operation.url)) throw new HttpError(400, 'URL de imagem inválida.', 'INVALID_IMAGE_URL');
      if (!nextPlan.products.some((entry: any) => entry.key === operation.productKey)) throw new HttpError(404, 'Produto do rascunho não encontrado.', 'DRAFT_ENTITY_NOT_FOUND');
      nextDecisions.imageSelections[operation.productKey] = operation.url || '';
      if (operation.url && operation.sourcePhotoKey) nextDecisions.imageSourceKeys[operation.productKey] = operation.sourcePhotoKey;
      else delete nextDecisions.imageSourceKeys[operation.productKey];
    } else {
      throw new HttpError(400, 'Operação de revisão não suportada.', 'INVALID_REVIEW_OPERATION');
    }
  }
  for (const issue of analysisData.unresolved || []) {
    if (issue.severity === 'blocker' && (issue.affectedEntityKeys || []).some((key: string) => touchedEntityKeys.has(key))) {
      nextDecisions.resolvedIssueKeys = [...new Set([...nextDecisions.resolvedIssueKeys, issue.key])];
    }
  }
  return { plan: nextPlan, decisions: nextDecisions };
}

export function buildImportPreview(importDoc: any) {
  const excluded = new Set<string>(importDoc.decisions?.excludedEntityKeys || []);
  const duplicates = importDoc.decisions?.duplicates || {};
  const count = (items: any[], type: string) => items.reduce((acc, item) => {
    if (excluded.has(item.key) || duplicates[item.key]?.action === 'skip') acc.skipped++;
    else if (duplicates[item.key]?.action === 'reuse_existing' || (type === 'category' && importDoc.reconciliation?.duplicates?.some((entry: any) => entry.entityKey === item.key))) acc.reused++;
    else acc.created++;
    return acc;
  }, { created: 0, reused: 0, skipped: 0 });
  const preview = {
    categories: count(importDoc.workingPlan?.categories || [], 'category'),
    products: count((importDoc.workingPlan?.products || []).filter((entry: any) => entry.kind === 'product'), 'product'),
    combos: count((importDoc.workingPlan?.products || []).filter((entry: any) => entry.kind === 'combo'), 'combo'),
    complementGroups: count(importDoc.workingPlan?.complementGroups || [], 'complement_group'),
    images: Object.values(importDoc.decisions?.imageSelections || {}).filter(Boolean).length,
    catalogRevision: Number(importDoc.reconciliation?.catalogRevision || 0),
    importRevision: Number(importDoc.revision || 0),
  };
  return { preview, previewHash: hashValue(preview) };
}
