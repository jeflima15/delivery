export type ShippingAddress = {
  cep?: string;
  logradouro: string;
  numero?: string;
  bairro?: string;
  cidade: string;
  estado?: string;
  latitude?: number;
  longitude?: number;
  locationConfirmed?: boolean;
  locationConfirmationToken?: string;
};

export class LocationConfirmationRequiredError extends Error {
  constructor(public location: { latitude: number; longitude: number }, public address: ShippingAddress, public confirmationToken: string) {
    super('Confirme o ponto de entrega no mapa.');
  }
}

export type ShippingQuoteResult = {
  id: string;
  feeCents: number;
  distanceMeters?: number;
  deliveryTimeMin?: number;
  deliveryTimeMax?: number;
  regionName?: string;
  expiresAt: string;
};

export function shippingEstimateLabel(quote?: Pick<ShippingQuoteResult, 'deliveryTimeMin' | 'deliveryTimeMax'> | null) {
  if (quote?.deliveryTimeMin == null) return '';
  return quote.deliveryTimeMax != null && quote.deliveryTimeMax !== quote.deliveryTimeMin
    ? `${quote.deliveryTimeMin}-${quote.deliveryTimeMax} min`
    : `${quote.deliveryTimeMin} min`;
}

// One owner per surface: changing context cancels both fetch and late responses.
export class ShippingQuoteRequestGuard {
  private controller?: AbortController;

  cancel() {
    this.controller?.abort();
  }

  start(): AbortSignal {
    this.cancel();
    this.controller = new AbortController();
    return this.controller.signal;
  }

  isCurrent(signal: AbortSignal): boolean {
    return this.controller?.signal === signal && !signal.aborted;
  }
}

export function shippingQuoteNeedsConfirmation(
  previous: ShippingQuoteResult | null,
  next: ShippingQuoteResult,
  previousEffectiveFeeCents: number,
  nextEffectiveFeeCents: number,
): boolean {
  return !previous || previousEffectiveFeeCents !== nextEffectiveFeeCents
    || previous.deliveryTimeMin !== next.deliveryTimeMin
    || previous.deliveryTimeMax !== next.deliveryTimeMax;
}

export async function requestShippingQuote(tenantSlug: string, address: ShippingAddress, signal?: AbortSignal) {
  const response = await fetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/shipping/quote`, {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, signal,
    body: JSON.stringify({
      postalCode: address.cep, street: address.logradouro, number: address.numero, district: address.bairro,
      city: address.cidade, state: address.estado, latitude: address.latitude, longitude: address.longitude,
      locationConfirmed: address.locationConfirmed,
      locationConfirmationToken: address.locationConfirmationToken,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    if (payload?.error?.code === 'LOCATION_CONFIRMATION_REQUIRED' && payload.error.details?.location) {
      throw new LocationConfirmationRequiredError(payload.error.details.location, address, String(payload.error.details.confirmationToken || ''));
    }
    throw new Error(payload?.error?.message || 'Não foi possível calcular a entrega.');
  }
  return payload.quote as ShippingQuoteResult;
}
