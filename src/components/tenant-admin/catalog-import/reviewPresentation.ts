import type { CatalogImportDraft } from '../api';

export interface ReviewTask {
  key: string;
  entityKey: string | null;
  title: string;
  detail: string;
  action: string;
  severity: 'blocker' | 'warning';
  modelIssueKey?: string;
}

function entityName(draft: CatalogImportDraft, key: string | null) {
  if (!key) return 'o cardápio';
  const plan = draft.workingPlan;
  return plan?.products.find((item) => item.key === key)?.name
    || plan?.categories.find((item) => item.key === key)?.name
    || plan?.complementGroups.find((item) => item.key === key)?.name
    || plan?.complementGroups.flatMap((group) => group.options).find((item) => item.key === key)?.name
    || 'o item';
}

function presentation(code: string, name: string, fallback: string) {
  switch (code) {
    case 'FIXED_COMBO_EMPTY_ITEMS': return { title: `${name} está sem produtos`, action: 'Adicionar produtos ao combo' };
    case 'STAGED_COMBO_EMPTY_STAGES': return { title: `${name} está sem etapas`, action: 'Revisar composição do combo' };
    case 'COMBO_STAGE_EMPTY_OPTIONS': return { title: `Uma etapa de ${name} está vazia`, action: 'Revisar composição do combo' };
    case 'MISSING_PRICE': return { title: `${name} está sem preço`, action: 'Definir preço' };
    case 'EMPTY_COMPLEMENT_GROUP': return { title: `${name} está sem opções`, action: 'Revisar complementos' };
    case 'INVALID_CATEGORY_REFERENCE': return { title: `${name} está sem categoria válida`, action: 'Escolher categoria' };
    case 'UNMAPPED_COMBO_COMPONENT': return { title: `Confira os itens de ${name}`, action: 'Revisar composição do combo' };
    case 'EXCLUDED_COMBO_COMPONENT': return { title: `${name} usa um produto não importado`, action: 'Revisar composição do combo' };
    default: return { title: fallback.replace(/\s*\([^)]*\)/g, ''), action: 'Revisar item' };
  }
}

export function buildReviewTasks(draft: CatalogImportDraft): ReviewTask[] {
  const excluded = new Set(draft.decisions.excludedEntityKeys || []);
  const entityKeys = new Set([
    ...(draft.workingPlan?.products.map((item) => item.key) || []),
    ...(draft.workingPlan?.categories.map((item) => item.key) || []),
    ...(draft.workingPlan?.complementGroups.map((item) => item.key) || []),
  ]);
  const optionParents = new Map(draft.workingPlan?.complementGroups.flatMap((group) => group.options.map((option) => [option.key, group.key] as const)) || []);
  const editableKey = (affected: string[]) => affected.map((key) => entityKeys.has(key) ? key : optionParents.get(key)).find((key): key is string => Boolean(key)) || null;
  const tasks: ReviewTask[] = [];
  for (const issue of draft.readiness.deterministicIssues || []) {
    if (issue.affectedEntityKeys.length && issue.affectedEntityKeys.every((key) => excluded.has(key))) continue;
    const entityKey = editableKey(issue.affectedEntityKeys);
    const display = presentation(issue.code, entityName(draft, entityKey), issue.message);
    tasks.push({ key: `det:${issue.code}:${issue.affectedEntityKeys.join(':')}`, entityKey, ...display, detail: issue.message, severity: issue.severity });
  }
  for (const issue of draft.analysis?.data.unresolved || []) {
    if (draft.decisions.resolvedIssueKeys?.includes(issue.key)) continue;
    if (issue.affectedEntityKeys.length && issue.affectedEntityKeys.every((key) => excluded.has(key))) continue;
    const entityKey = editableKey(issue.affectedEntityKeys);
    tasks.push({ key: `model:${issue.key}`, entityKey, title: issue.found, detail: issue.reason, action: 'Revisar item', severity: issue.severity, modelIssueKey: issue.key });
  }
  return tasks.sort((a, b) => Number(b.severity === 'blocker') - Number(a.severity === 'blocker'));
}
