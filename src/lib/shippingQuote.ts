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
};

export class LocationConfirmationRequiredError extends Error {
  constructor(public location: { latitude: number; longitude: number }, public address: ShippingAddress) {
    super('Confirme o ponto de entrega no mapa.');
  }
}

export async function requestShippingQuote(tenantSlug: string, address: ShippingAddress) {
  const response = await fetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/shipping/quote`, {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      postalCode: address.cep, street: address.logradouro, number: address.numero, district: address.bairro,
      city: address.cidade, state: address.estado, latitude: address.latitude, longitude: address.longitude,
      locationConfirmed: address.locationConfirmed,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    if (payload?.error?.code === 'LOCATION_CONFIRMATION_REQUIRED' && payload.error.details?.location) {
      throw new LocationConfirmationRequiredError(payload.error.details.location, address);
    }
    throw new Error(payload?.error?.message || 'Não foi possível calcular a entrega.');
  }
  return payload.quote as { id: string; feeCents: number; deliveryTimeMin?: number; deliveryTimeMax?: number; regionName?: string };
}
