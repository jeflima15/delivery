type ComplementRuleGroup = {
  obrigatorio?: boolean;
  minimo?: unknown;
  maximo?: unknown;
  itens?: Array<{ ativo?: boolean }>;
};

const safeNonNegativeInteger = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

export function effectiveComplementMinimum(group: ComplementRuleGroup) {
  const configuredMinimum = safeNonNegativeInteger(group.minimo);
  return group.obrigatorio ? Math.max(1, configuredMinimum) : configuredMinimum;
}

export function activeComplementItemCount(group: ComplementRuleGroup) {
  return Array.isArray(group.itens)
    ? group.itens.filter((item) => item.ativo !== false).length
    : 0;
}

export function validateComplementGroupRules(group: ComplementRuleGroup) {
  const minimum = effectiveComplementMinimum(group);
  const maximum = Math.max(1, safeNonNegativeInteger(group.maximo));
  const activeItems = activeComplementItemCount(group);

  if (maximum < minimum) {
    return `A quantidade maxima deve ser maior ou igual a minima (${minimum}).`;
  }
  if (activeItems < minimum) {
    return `Mantenha pelo menos ${minimum} ${minimum === 1 ? 'opcao ativa' : 'opcoes ativas'} neste grupo.`;
  }
  return null;
}
