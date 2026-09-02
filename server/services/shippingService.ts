import type mongoose from 'mongoose';
import crypto from 'node:crypto';
import StoreSettings from '../../src/models/StoreSettings.js';
import ShippingQuote from '../models/ShippingQuote.js';
import { reaisToCents } from '../domain/money.js';
import { HttpError } from '../middleware/errors.js';
import { geocodeAddress, hashAddress, distanceMeters, type GeocodableAddress } from './geocodingService.js';
import { resolvePublishedRegion } from './deliveryRegionService.js';
import { getEnv } from '../config/env.js';

type Address = GeocodableAddress;
type DeliveryEstimate = { deliveryTimeMin?: number; deliveryTimeMax?: number };
type NeighborhoodRate = {
  nome?: string;
  cidade?: string;
  estado?: string;
  valor?: number;
  tempo_estimado?: string;
  deliveryTimeMin?: number;
  deliveryTimeMax?: number;
  ativo?: boolean;
};

type LocationConfirmationPayload = { addressHash: string; latitude: number; longitude: number; expiresAt: number };

function normalizeDistrictName(name: string): string {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseDeliveryEstimate(value: unknown): DeliveryEstimate {
  const normalized = String(value || '').toLowerCase();
  const compactHours = normalized.trim().match(/^(\d+)\s*h(?:\s*(\d+))?$/);
  if (compactHours) {
    const totalMinutes = Number(compactHours[1]) * 60 + Number(compactHours[2] || 0);
    return { deliveryTimeMin: totalMinutes, deliveryTimeMax: totalMinutes };
  }
  const minutes = normalized.match(/\d+/g)?.map(Number).filter(Number.isFinite) || [];
  if (!minutes.length) return {};
  if (/\b(hora|horas)\b|\d+\s*h\b/.test(normalized)) {
    return {
      deliveryTimeMin: minutes[0] * 60,
      deliveryTimeMax: (minutes[1] ?? minutes[0]) * 60,
    };
  }
  return { deliveryTimeMin: minutes[0], deliveryTimeMax: minutes[1] ?? minutes[0] };
}

function deliveryEstimate(rate: NeighborhoodRate | null | undefined, fallback: unknown): DeliveryEstimate {
  const min = rate?.deliveryTimeMin;
  const max = rate?.deliveryTimeMax;
  if (Number.isFinite(min) && Number.isFinite(max)) return { deliveryTimeMin: Number(min), deliveryTimeMax: Number(max) };
  return parseDeliveryEstimate(rate?.tempo_estimado || fallback);
}

function samePlace(actual: string | undefined, expected: string | undefined) {
  if (!expected) return true;
  return Boolean(actual) && normalizeDistrictName(actual || '') === normalizeDistrictName(expected);
}

function assertStoreMunicipality(destination: Address, storeCity: string | undefined, storeState: string | undefined) {
  if (!samePlace(destination.city, storeCity) || !samePlace(destination.state, storeState)) {
    throw new HttpError(422, 'Endereco fora da cidade atendida pela loja.', 'OUTSIDE_DELIVERY_AREA');
  }
}

export function createLocationConfirmationToken(address: Address, location: { latitude: number; longitude: number }) {
  const payload: LocationConfirmationPayload = {
    addressHash: hashAddress(address),
    latitude: location.latitude,
    longitude: location.longitude,
    expiresAt: Date.now() + 24 * 60 * 60_000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getEnv().JWT_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyLocationConfirmation(address: Address) {
  if (!address.locationConfirmationToken || !address.locationConfirmed || !Number.isFinite(address.latitude) || !Number.isFinite(address.longitude)) return null;
  const [encoded, signature] = address.locationConfirmationToken.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', getEnv().JWT_SECRET).update(encoded).digest();
  const received = Buffer.from(signature, 'base64url');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as LocationConfirmationPayload;
    if (payload.expiresAt <= Date.now() || payload.addressHash !== hashAddress(address)) return null;
    const selected = { latitude: Number(address.latitude), longitude: Number(address.longitude) };
    if (distanceMeters(payload, selected) > 10_000) return null;
    return { ...selected, provider: 'customer-confirmed', precision: 'confirmed' as const, formattedAddress: '' };
  } catch {
    return null;
  }
}

async function resolveDestinationLocation(destination: Address) {
  const confirmed = verifyLocationConfirmation(destination);
  if (confirmed) return confirmed;
  const location = await geocodeAddress({ ...destination, latitude: undefined, longitude: undefined, locationConfirmed: false, locationConfirmationToken: undefined });
  if (!['confirmed', 'exact'].includes(location.precision)) {
    throw new HttpError(409, 'Confirme o ponto de entrega no mapa.', 'LOCATION_CONFIRMATION_REQUIRED', {
      location: { latitude: location.latitude, longitude: location.longitude },
      confirmationToken: createLocationConfirmationToken(destination, location),
      precision: location.precision,
    });
  }
  return location;
}

function matchDistrict(targetDistrict: string, targetCity: string | undefined, targetState: string | undefined, neighborhood: NeighborhoodRate, storeCity?: string, storeState?: string): boolean {
  const normTargetDist = normalizeDistrictName(targetDistrict);
  const normTargetCity = targetCity ? normalizeDistrictName(targetCity) : '';
  const normEntry = normalizeDistrictName(neighborhood.nome || '');

  if (neighborhood.cidade || neighborhood.estado) {
    return normEntry === normTargetDist
      && samePlace(targetCity, neighborhood.cidade)
      && samePlace(targetState, neighborhood.estado);
  }

  if (normEntry === normTargetDist) {
    return samePlace(targetCity, storeCity) && samePlace(targetState, storeState);
  }

  const cityMatch = normEntry.match(/^(.+?)\s*\((.+?)\)$/);
  if (cityMatch) {
    const entryDist = cityMatch[1].trim();
    const entryCity = cityMatch[2].trim();

    if (normTargetDist === entryDist) {
      if (normTargetCity && (normTargetCity.includes(entryCity) || entryCity.includes(normTargetCity))) {
        return true;
      }
      if (!normTargetCity) return true;
    }
    return false;
  }

  if (normTargetCity && (normEntry === `${normTargetDist} (${normTargetCity})` || normEntry === `${normTargetDist} - ${normTargetCity}`)) {
    return true;
  }

  return false;
}

export async function createShippingQuote(tenantId: mongoose.Types.ObjectId, destination: Address) {
  const settings = await StoreSettings.findOne({ tenantId }).select('logisticsOptions tipo_taxa_entrega taxa_entrega_fixa taxas_bairros taxa_bairro_padrao bloquear_bairros_nao_atendidos faixas_entrega tempo_entrega cep_loja rua_loja numero_loja bairro_loja cidade_loja estado_loja localizacao_loja delivery_regions_publication').lean();
  if (!settings?.logisticsOptions?.allowDelivery) throw new HttpError(409, 'Entrega indisponivel.', 'DELIVERY_DISABLED');

  const deliveryType = settings.tipo_taxa_entrega || 'km';

  // 1. MODO TAXA FIXA
  if (deliveryType === 'fixa') {
    assertStoreMunicipality(destination, settings.cidade_loja, settings.estado_loja);
    const feeCents = reaisToCents(Number(settings.taxa_entrega_fixa || 0));
    const estimate = parseDeliveryEstimate(settings.tempo_entrega);
    const quote = await ShippingQuote.create({
      tenantId,
      feeCents,
      ...estimate,
      normalizedAddressHash: hashAddress(destination),
      provider: 'fixed',
      distanceMeters: 0,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return { id: quote._id, feeCents: quote.feeCents, distanceMeters: 0, ...estimate, expiresAt: quote.expiresAt };
  }

  // 2. MODO POR BAIRRO
  if (deliveryType === 'bairro') {
    const district = destination.district?.trim();
    if (!district) {
      throw new HttpError(422, 'Informe o bairro para calcular a taxa de entrega.', 'DISTRICT_REQUIRED');
    }

    const neighborhoods = (Array.isArray(settings.taxas_bairros) ? settings.taxas_bairros : []) as NeighborhoodRate[];
    const matched = neighborhoods.find(
      (neighborhood) => neighborhood.ativo !== false && matchDistrict(district, destination.city, destination.state, neighborhood, settings.cidade_loja, settings.estado_loja)
    );

    let feeCents: number;
    if (matched) {
      feeCents = reaisToCents(Number(matched.valor || 0));
    } else {
      assertStoreMunicipality(destination, settings.cidade_loja, settings.estado_loja);
      const hasDefaultRate = settings.taxa_bairro_padrao != null && Number(settings.taxa_bairro_padrao) >= 0;
      if (settings.bloquear_bairros_nao_atendidos !== false && !hasDefaultRate) {
        throw new HttpError(422, `Desculpe, ainda não realizamos entregas no bairro "${district}".`, 'OUTSIDE_DELIVERY_AREA');
      }
      feeCents = hasDefaultRate ? reaisToCents(Number(settings.taxa_bairro_padrao)) : 0;
    }

    const estimate = deliveryEstimate(matched, settings.tempo_entrega);

    const quote = await ShippingQuote.create({
      tenantId,
      feeCents,
      ...estimate,
      normalizedAddressHash: hashAddress(destination),
      provider: 'bairro',
      distanceMeters: 0,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return { id: quote._id, feeCents: quote.feeCents, distanceMeters: 0, ...estimate, expiresAt: quote.expiresAt };
  }

  // 3. MODO POR REGIAO DESENHADA NO MAPA
  if (deliveryType === 'regiao') {
    if (!settings.delivery_regions_publication) throw new HttpError(409, 'As regioes de entrega ainda nao foram publicadas.', 'DELIVERY_REGIONS_NOT_PUBLISHED');
    const destinationLocation = await resolveDestinationLocation(destination);
    const region = await resolvePublishedRegion(tenantId, settings.delivery_regions_publication, destinationLocation.latitude, destinationLocation.longitude);
    if (!region || region.blocked) throw new HttpError(422, 'Endereco fora da area de entrega.', 'OUTSIDE_DELIVERY_AREA');
    const quote = await ShippingQuote.create({
      tenantId,
      feeCents: region.feeCents,
      normalizedAddressHash: hashAddress(destination),
      provider: destinationLocation.provider,
      precision: destinationLocation.precision,
      regionId: region._id,
      regionPublicationId: settings.delivery_regions_publication,
      deliveryTimeMin: region.deliveryTimeMin,
      deliveryTimeMax: region.deliveryTimeMax,
      regionName: region.name,
      destination: { latitude: destinationLocation.latitude, longitude: destinationLocation.longitude },
      distanceMeters: settings.localizacao_loja?.latitude != null ? distanceMeters(settings.localizacao_loja, destinationLocation) : undefined,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return {
      id: quote._id,
      feeCents: quote.feeCents,
      distanceMeters: quote.distanceMeters,
      deliveryTimeMin: quote.deliveryTimeMin,
      deliveryTimeMax: quote.deliveryTimeMax,
      regionName: region.name,
      expiresAt: quote.expiresAt,
    };
  }

  // 4. MODO POR DISTANCIA (KM)
  const origin: Address = { postalCode: settings.cep_loja, street: settings.rua_loja, number: settings.numero_loja, district: settings.bairro_loja, city: settings.cidade_loja, state: settings.estado_loja };
  if (!origin.street || !origin.city) throw new HttpError(409, 'Endereco da loja incompleto.', 'STORE_ADDRESS_INCOMPLETE');
  const to = await resolveDestinationLocation(destination);
  const from = settings.localizacao_loja?.confirmed
    && Number.isFinite(settings.localizacao_loja.latitude)
    && Number.isFinite(settings.localizacao_loja.longitude)
    ? settings.localizacao_loja
    : await geocodeAddress(origin);
  const meters = distanceMeters(from, to);
  const bands = [...(settings.faixas_entrega || [])].sort((a, b) => Number(a.km_ate) - Number(b.km_ate));
  const band = bands.find((item) => meters <= Number(item.km_ate) * 1_000);
  if (!band) throw new HttpError(422, 'Endereco fora da area de entrega.', 'OUTSIDE_DELIVERY_AREA');
  const estimate = parseDeliveryEstimate(settings.tempo_entrega);
  const quote = await ShippingQuote.create({ tenantId, feeCents: reaisToCents(Number(band.valor)), ...estimate, normalizedAddressHash: hashAddress(destination), provider: `${from.provider}+${to.provider}`, destination: { latitude: to.latitude, longitude: to.longitude }, distanceMeters: meters, expiresAt: new Date(Date.now() + 15 * 60_000) });
  return { id: quote._id, feeCents: quote.feeCents, distanceMeters: meters, ...estimate, expiresAt: quote.expiresAt };
}
