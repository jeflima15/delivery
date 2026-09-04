type PreparationSettings = {
  prazo_entrega_modo?: string;
  tempo_preparo_min?: number;
  tempo_preparo_max?: number;
};

export const MAX_DELIVERY_MINUTES = 1_440;
export type DeliveryEstimate = { deliveryTimeMin?: number; deliveryTimeMax?: number };
export type EstimateSettings = PreparationSettings & {
  tempo_entrega?: string;
  tempo_deslocamento_min?: number;
  tempo_deslocamento_max?: number;
};

type TransitEstimate = DeliveryEstimate & { tempo_estimado?: string };
type ValidatedEstimateSettings = EstimateSettings & { taxas_bairros?: TransitEstimate[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readDeliveryEstimate(record: Record<string, unknown>): TransitEstimate {
  return {
    deliveryTimeMin: typeof record.deliveryTimeMin === 'number' ? record.deliveryTimeMin : undefined,
    deliveryTimeMax: typeof record.deliveryTimeMax === 'number' ? record.deliveryTimeMax : undefined,
    tempo_estimado: typeof record.tempo_estimado === 'string' ? record.tempo_estimado : undefined,
  };
}

/** Project only the known fields at the untyped persistence boundary, without coercion. */
export function readEstimateSettings(record: Record<string, unknown>): ValidatedEstimateSettings {
  return {
    prazo_entrega_modo: typeof record.prazo_entrega_modo === 'string' ? record.prazo_entrega_modo : undefined,
    tempo_entrega: typeof record.tempo_entrega === 'string' ? record.tempo_entrega : undefined,
    tempo_preparo_min: typeof record.tempo_preparo_min === 'number' ? record.tempo_preparo_min : undefined,
    tempo_preparo_max: typeof record.tempo_preparo_max === 'number' ? record.tempo_preparo_max : undefined,
    tempo_deslocamento_min: typeof record.tempo_deslocamento_min === 'number' ? record.tempo_deslocamento_min : undefined,
    tempo_deslocamento_max: typeof record.tempo_deslocamento_max === 'number' ? record.tempo_deslocamento_max : undefined,
    taxas_bairros: Array.isArray(record.taxas_bairros)
      ? record.taxas_bairros.filter(isRecord).map(readDeliveryEstimate) : undefined,
  };
}

export function isValidEstimate(min: unknown, max: unknown): boolean {
  return typeof min === 'number' && typeof max === 'number' && Number.isInteger(min)
    && Number.isInteger(max) && min >= 0 && max >= min && max <= MAX_DELIVERY_MINUTES;
}

/** Parse whole durations, never arbitrary digits embedded in prose. */
export function parseDeliveryEstimate(value: unknown): DeliveryEstimate {
  if (typeof value !== 'string') return {};
  const parts = value.trim().toLowerCase().replace(/,/g, '.').split(/\s*(?:-|\u2013|\u2014|\ba\b|\bat[e\u00e9]\b)\s*/);
  if (parts.length > 2) return {};
  const parse = (part: string): number => {
    const hours = part.match(/^(\d+(?:\.\d+)?)\s*(?:h|horas?)(?:\s*(\d+)\s*(?:m|min|minutos?)?)?$/);
    if (hours) return Number(hours[1]) * 60 + Number(hours[2] || 0);
    const minutes = part.match(/^(\d+)\s*(?:m|min|minutos?)?$/);
    return minutes ? Number(minutes[1]) : NaN;
  };
  const hourRange = parts.length === 2 && /^\d+(?:\.\d+)?$/.test(parts[0]) && /^\d+(?:\.\d+)?\s*(?:h|horas?)$/.test(parts[1]);
  const min = hourRange ? Number(parts[0]) * 60 : parse(parts[0]);
  const max = parts.length === 2 ? parse(parts[1]) : min;
  return isValidEstimate(min, max) ? { deliveryTimeMin: min, deliveryTimeMax: max } : {};
}

export function calculateDeliveryEstimate(settings: EstimateSettings, type: 'delivery' | 'pickup' | 'dine_in' | 'local' = 'delivery', transit?: DeliveryEstimate & { tempo_estimado?: string }): DeliveryEstimate {
  const explicit = isValidEstimate(transit?.deliveryTimeMin, transit?.deliveryTimeMax)
    ? { deliveryTimeMin: transit!.deliveryTimeMin, deliveryTimeMax: transit!.deliveryTimeMax }
    : parseDeliveryEstimate(transit?.tempo_estimado);
  if (settings.prazo_entrega_modo !== 'preparo_deslocamento') {
    return type === 'delivery' ? (explicit.deliveryTimeMin != null ? explicit : parseDeliveryEstimate(settings.tempo_entrega)) : {};
  }
  if (!isValidEstimate(settings.tempo_preparo_min, settings.tempo_preparo_max)) return {};
  if (type !== 'delivery') return { deliveryTimeMin: settings.tempo_preparo_min, deliveryTimeMax: settings.tempo_preparo_max };
  const travel = explicit.deliveryTimeMin != null ? explicit : { deliveryTimeMin: settings.tempo_deslocamento_min, deliveryTimeMax: settings.tempo_deslocamento_max };
  if (!isValidEstimate(travel.deliveryTimeMin, travel.deliveryTimeMax)) return {};
  const min = settings.tempo_preparo_min! + travel.deliveryTimeMin!;
  const max = settings.tempo_preparo_max! + travel.deliveryTimeMax!;
  return isValidEstimate(min, max) ? { deliveryTimeMin: min, deliveryTimeMax: max } : {};
}

/** Call with merged persisted settings so partial updates cannot invalidate a pair. */
export function validateEstimateSettings(settings: ValidatedEstimateSettings, regions: DeliveryEstimate[] = []): string | null {
  for (const [min, max] of [[settings.tempo_preparo_min, settings.tempo_preparo_max], [settings.tempo_deslocamento_min, settings.tempo_deslocamento_max]]) {
    if ((min != null || max != null) && !isValidEstimate(min, max)) return 'Informe minimo e maximo validos, entre 0 e 1440 minutos.';
  }
  if (settings.prazo_entrega_modo !== 'preparo_deslocamento') return null;
  if (!isValidEstimate(settings.tempo_preparo_min, settings.tempo_preparo_max) || !isValidEstimate(settings.tempo_deslocamento_min, settings.tempo_deslocamento_max)) return 'Informe os intervalos completos de preparo e deslocamento.';
  const estimates = [{ deliveryTimeMax: settings.tempo_deslocamento_max }, ...(settings.taxas_bairros || []).map((rate) => rate.deliveryTimeMax != null ? rate : parseDeliveryEstimate(rate.tempo_estimado)), ...regions];
  if (estimates.some((estimate) => settings.tempo_preparo_max! + (estimate.deliveryTimeMax || 0) > MAX_DELIVERY_MINUTES)) return 'O prazo total nao pode ultrapassar 1440 minutos.';
  return null;
}

export function getPreparationEstimateLabel(settings?: PreparationSettings | null): string {
  if (settings?.prazo_entrega_modo !== 'preparo_deslocamento') return '';
  const min = settings.tempo_preparo_min;
  const max = settings.tempo_preparo_max;
  if (!isValidEstimate(min, max)) return '';
  return min === max ? `${min} min` : `${min}-${max} min`;
}
