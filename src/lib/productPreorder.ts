export interface ProductPreorderInfo {
  immediateAllowed: boolean;
  scheduledAllowed: boolean;
  minLeadMinutes: number;
  acceptingPreorders: boolean;
}

export function combineProductPreorders(values: Array<ProductPreorderInfo | null | undefined>): ProductPreorderInfo | null {
  const rules = values.filter((value): value is ProductPreorderInfo => Boolean(value));
  if (!rules.length) return null;
  return {
    immediateAllowed: rules.every((rule) => rule.immediateAllowed),
    scheduledAllowed: rules.every((rule) => rule.scheduledAllowed),
    minLeadMinutes: Math.max(...rules.map((rule) => rule.minLeadMinutes)),
    acceptingPreorders: rules.every((rule) => rule.acceptingPreorders),
  };
}

export function preorderLeadLabel(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? 'dia' : 'dias'}`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hora' : 'horas'}`;
  return `${minutes} minutos`;
}
