import type mongoose from 'mongoose';
import crypto from 'node:crypto';
import StoreSettings from '../../src/models/StoreSettings.js';
import ShippingQuote from '../models/ShippingQuote.js';
import DeliveryRegion from '../../src/models/DeliveryRegion.js';
import { reaisToCents } from '../domain/money.js';
import { HttpError } from '../middleware/errors.js';
import { geocodeAddress, hashAddress, distanceMeters, type GeocodableAddress } from './geocodingService.js';
import { resolvePublishedRegion } from './deliveryRegionService.js';
import { getEnv } from '../config/env.js';
import { calculateDeliveryEstimate, readEstimateSettings, readDeliveryEstimate } from '../../src/lib/deliveryEstimates.js';

type Address = GeocodableAddress;
type NeighborhoodRate = {
  nome?: string;
  cidade?: string;
  estado?: string;
  valor?: number;
  tempo_estimado?: string;
  deliveryTimeMin?: number;
  deliveryTimeMax?: number;
  ativo?: boolean;
  bloqueado?: boolean;
  observacao?: string;
};

type LocationConfirmationPayload = { addressHash: string; latitude: number; longitude: number; expiresAt: number };

function normalizeDistrictName(name: string): string {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function deliveryEstimate(settings: Record<string, unknown>, rate?: NeighborhoodRate) {
  const estimate = calculateDeliveryEstimate(readEstimateSettings(settings), 'delivery', rate);
  if (settings.prazo_entrega_modo === 'preparo_deslocamento' && estimate.deliveryTimeMin == null) {
    throw new HttpError(409, 'Configuracao de prazo invalida.', 'INVALID_DELIVERY_ESTIMATE');
  }
  return { ...estimate, estimateMode: settings.prazo_entrega_modo || 'total' };
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

export function matchCombinedDistrict(destination: Pick<Address, 'district' | 'city' | 'state'>, neighborhood: NeighborhoodRate, storeCity?: string, storeState?: string): boolean {
  const explicitCity = neighborhood.cidade?.trim();
  const legacy = explicitCity ? null : (neighborhood.nome || '').match(/^(.+?)\s*(?:\(([^)]+)\)| - (.+))$/);
  const name = legacy ? legacy[1].trim() : neighborhood.nome;
  const city = explicitCity || legacy?.[2]?.trim() || legacy?.[3]?.trim() || storeCity;
  const state = neighborhood.estado?.trim() || storeState;
  return Boolean(destination.district && destination.city && destination.state && city && state)
    && normalizeDistrictName(destination.district || '') === normalizeDistrictName(name || '')
    && samePlace(destination.city, city) && samePlace(destination.state, state);
}

export async function createShippingQuote(tenantId: mongoose.Types.ObjectId, destination: Address) {
  const settings = await StoreSettings.findOne({ tenantId }).select('logisticsOptions tipo_taxa_entrega taxa_entrega_fixa taxas_bairros taxa_bairro_padrao bloquear_bairros_nao_atendidos tempo_entrega prazo_entrega_modo tempo_preparo_min tempo_preparo_max tempo_deslocamento_min tempo_deslocamento_max cidade_loja estado_loja localizacao_loja delivery_regions_publication').lean();
  if (!settings?.logisticsOptions?.allowDelivery) throw new HttpError(409, 'Entrega indisponivel.', 'DELIVERY_DISABLED');

  const deliveryType = settings.tipo_taxa_entrega;
  const hasPublishedMap = Boolean(deliveryType === 'bairro_regiao' && settings.delivery_regions_publication && await DeliveryRegion.exists({ tenantId, publicationId: settings.delivery_regions_publication, active: true }));

  // 1. MODO TAXA FIXA
  if (deliveryType === 'fixa') {
    assertStoreMunicipality(destination, settings.cidade_loja, settings.estado_loja);
    const feeCents = reaisToCents(Number(settings.taxa_entrega_fixa || 0));
    const estimate = deliveryEstimate(settings);
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
  if (deliveryType === 'bairro' || deliveryType === 'bairro_regiao') {
    const district = destination.district?.trim();
    if (!district && deliveryType === 'bairro') {
      throw new HttpError(422, 'Informe o bairro para calcular a taxa de entrega.', 'DISTRICT_REQUIRED');
    }

    const neighborhoods = (Array.isArray(settings.taxas_bairros) ? settings.taxas_bairros : []) as NeighborhoodRate[];
    const matches = neighborhoods.filter((neighborhood) => neighborhood.ativo !== false && (deliveryType === 'bairro_regiao'
      ? matchCombinedDistrict(destination, neighborhood, settings.cidade_loja, settings.estado_loja)
      : matchDistrict(district || '', destination.city, destination.state, neighborhood, settings.cidade_loja, settings.estado_loja)));
    if (matches.some((neighborhood) => neighborhood.bloqueado)) {
      throw new HttpError(422, 'Bairro bloqueado para entrega.', 'OUTSIDE_DELIVERY_AREA');
    }
    const matched = matches[0];

    if (matched || deliveryType === 'bairro' || !hasPublishedMap) {
      let feeCents: number;
      if (matched) {
        feeCents = reaisToCents(Number(matched.valor || 0));
      } else {
        assertStoreMunicipality(destination, settings.cidade_loja, settings.estado_loja);
        const hasDefaultRate = settings.taxa_bairro_padrao != null && Number(settings.taxa_bairro_padrao) >= 0;
        const rejectDefault = deliveryType === 'bairro'
          ? !hasDefaultRate && settings.bloquear_bairros_nao_atendidos !== false
          : !hasDefaultRate || settings.bloquear_bairros_nao_atendidos !== false;
        if (rejectDefault) {
          throw new HttpError(422, `Desculpe, ainda não realizamos entregas no bairro "${district}".`, 'OUTSIDE_DELIVERY_AREA');
        }
        feeCents = hasDefaultRate ? reaisToCents(Number(settings.taxa_bairro_padrao)) : 0;
      }

      const estimate = deliveryEstimate(settings, matched);

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
  }

  // 3. MODO POR REGIAO DESENHADA NO MAPA
  if (deliveryType === 'regiao' || deliveryType === 'bairro_regiao') {
    if (!settings.delivery_regions_publication) throw new HttpError(409, 'As regioes de entrega ainda nao foram publicadas.', 'DELIVERY_REGIONS_NOT_PUBLISHED');
    const destinationLocation = await resolveDestinationLocation(destination);
    const region = await resolvePublishedRegion(tenantId, settings.delivery_regions_publication, destinationLocation.latitude, destinationLocation.longitude);
    if (!region || region.blocked) throw new HttpError(422, 'Endereco fora da area de entrega.', 'OUTSIDE_DELIVERY_AREA');
    const estimate = deliveryEstimate(settings, readDeliveryEstimate(region));
    const quote = await ShippingQuote.create({
      tenantId,
      feeCents: region.feeCents,
      normalizedAddressHash: hashAddress(destination),
      provider: destinationLocation.provider,
      precision: destinationLocation.precision,
      regionId: region._id,
      regionPublicationId: settings.delivery_regions_publication,
      ...estimate,
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
      estimateMode: estimate.estimateMode,
      regionName: region.name,
      expiresAt: quote.expiresAt,
    };
  }

  throw new HttpError(409, 'Configure uma modalidade de entrega valida no painel da loja.', 'INVALID_DELIVERY_MODE');
}
