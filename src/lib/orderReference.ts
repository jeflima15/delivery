type OrderReferenceInput = {
  _id?: unknown;
  id?: unknown;
  codigo?: unknown;
  orderNumber?: unknown;
  dailyOrderNumber?: unknown;
};

export function getOrderDisplayNumber(order: OrderReferenceInput | null | undefined): string {
  const preferred = order?.dailyOrderNumber ?? order?.orderNumber ?? order?.codigo;
  if (preferred !== undefined && preferred !== null && String(preferred).trim()) return String(preferred);
  const legacyId = order?._id ?? order?.id;
  return legacyId ? String(legacyId).slice(-6).toUpperCase() : '---';
}

export function formatOrderReference(order: OrderReferenceInput | null | undefined): string {
  return `#${getOrderDisplayNumber(order)}`;
}
