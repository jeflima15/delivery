export interface PurchaseReadinessInput {
  empty: boolean; conflictingModes: boolean; closed: boolean; canSchedule: boolean;
  deliveryMethod: string | null; hasAddress: boolean; calculating: boolean; pendingPin: boolean;
  needsQuote: boolean; outOfRange: boolean; belowMinimum: boolean;
}
export function purchaseReadiness(input: PurchaseReadinessInput) {
  if (input.empty) return { reason: 'empty', label: 'Escolher produtos', action: 'browse' };
  if (input.conflictingModes) return { reason: 'mixed', label: 'Revisar itens da sacola', action: 'review' };
  if (input.closed && !input.canSchedule) return { reason: 'closed', label: 'Loja fechada no momento', action: 'wait' };
  if (!input.deliveryMethod) return { reason: 'method', label: 'Escolher entrega ou retirada', action: 'method' };
  if (input.calculating) return { reason: 'calculating', label: 'Calculando entrega…', action: 'wait' };
  if (input.deliveryMethod === 'delivery') {
    if (!input.hasAddress) return { reason: 'address', label: 'Informar endereço de entrega', action: 'address' };
    if (input.pendingPin && input.needsQuote) return { reason: 'pin', label: 'Confirmar local de entrega', action: 'pin' };
    if (input.outOfRange || input.needsQuote) return { reason: 'quote', label: 'Revisar endereço de entrega', action: 'address' };
  }
  if (input.belowMinimum) return { reason: 'minimum', label: 'Adicionar mais produtos', action: 'browse' };
  return { reason: 'ready', label: 'Continuar pedido', action: 'checkout' };
}

