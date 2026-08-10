export const BENEFIT_CARD_BRANDS = [
  { id: 'alelo', label: 'Alelo' },
  { id: 'vr', label: 'VR Beneficios' },
  { id: 'ticket', label: 'Ticket' },
  { id: 'pluxee', label: 'Pluxee' },
  { id: 'ben', label: 'Ben' },
  { id: 'caju', label: 'Caju' },
  { id: 'flash', label: 'Flash' },
  { id: 'swile', label: 'Swile' },
  { id: 'ifood_beneficios', label: 'iFood Beneficios' },
] as const;

export type BenefitCardBrand = (typeof BENEFIT_CARD_BRANDS)[number]['id'];

const paymentMethodLabels: Record<string, string> = {
  pix: 'PIX',
  card: 'Cartão na entrega',
  cash: 'Dinheiro',
  food_voucher: 'Vale-alimentação',
  meal_voucher: 'Vale-refeição',
};

export function paymentMethodLabel(method?: string | null) {
  return paymentMethodLabels[method || ''] || method || 'Nao informado';
}

export function benefitBrandLabels(brands?: string[]) {
  if (!Array.isArray(brands)) return [];
  const labels = new Map<string, string>(BENEFIT_CARD_BRANDS.map((brand) => [brand.id, brand.label]));
  return brands.map((brand) => labels.get(brand) || brand).filter(Boolean);
}
