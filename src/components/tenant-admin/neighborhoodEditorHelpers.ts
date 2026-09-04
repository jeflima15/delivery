import type { NeighborhoodItem } from './NeighborhoodTierEditor';

export function previewNeighborhoodUpdate(items: NeighborhoodItem[], draft: { valor: string; min: string; max: string }) {
  const hasFee = draft.valor !== '';
  const hasTime = draft.min !== '' || draft.max !== '';
  if (!hasFee && !hasTime) throw new Error('Informe uma taxa ou um intervalo de prazo para atualizar.');
  if (hasFee && (!Number.isFinite(Number(draft.valor)) || Number(draft.valor) < 0)) {
    throw new Error('A taxa deve ser um número não negativo.');
  }
  if (hasTime && (!draft.min || !draft.max || !Number.isInteger(Number(draft.min)) || !Number.isInteger(Number(draft.max)) || Number(draft.min) < 0 || Number(draft.max) < Number(draft.min))) {
    throw new Error('Informe mínimo e máximo inteiros, não negativos e em ordem crescente.');
  }
  return items.map((item) => item.bloqueado || item.ativo === false ? item : {
    ...item,
    ...(hasFee ? { valor: Number(draft.valor) } : {}),
    ...(hasTime ? { deliveryTimeMin: Number(draft.min), deliveryTimeMax: Number(draft.max), tempo_estimado: `${Number(draft.min)}-${Number(draft.max)} min` } : {}),
  });
}

export function validateEditorDeliveryTimes(config: Record<string, unknown>): string {
  if (config.prazo_entrega_modo !== 'preparo_deslocamento') return '';
  for (const prefix of ['tempo_preparo', 'tempo_deslocamento']) {
    const min = config[`${prefix}_min`];
    const max = config[`${prefix}_max`];
    if (typeof min !== 'number' || typeof max !== 'number' || !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
      return 'Preparo e deslocamento exigem mínimo/máximo inteiros, não negativos, com máximo maior ou igual ao mínimo.';
    }
  }
  return '';
}
