import crypto from 'node:crypto';
import GeocodeCache from '../models/GeocodeCache.js';
import { getEnv } from '../config/env.js';
import { HttpError } from '../middleware/errors.js';
import type { GeocodePrecision } from '../../src/types/deliveryRegions.js';

export type GeocodableAddress = {
  postalCode?: string;
  street: string;
  number?: string;
  district?: string;
  city: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  locationConfirmed?: boolean;
  locationConfirmationToken?: string;
};

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  provider: string;
  precision: GeocodePrecision;
  formattedAddress: string;
};

const GEOCODER_CACHE_VERSION = 'v4';
const LOCATIONIQ_MIN_INTERVAL_MS = 550;
const locationIqInFlight = new Map<string, Promise<Record<string, any>[]>>();
let locationIqQueue = Promise.resolve();
let locationIqLastRequestAt = 0;

const STREET_NUMBER_WORDS: Array<[string, string]> = [
  ['trinta e um', '31'], ['vinte e nove', '29'], ['vinte e oito', '28'], ['vinte e sete', '27'],
  ['vinte e seis', '26'], ['vinte e cinco', '25'], ['vinte e quatro', '24'], ['vinte e tres', '23'],
  ['vinte e dois', '22'], ['vinte e um', '21'], ['dezenove', '19'], ['dezoito', '18'],
  ['dezessete', '17'], ['dezesseis', '16'], ['quinze', '15'], ['quatorze', '14'], ['catorze', '14'],
  ['treze', '13'], ['doze', '12'], ['onze', '11'], ['dez', '10'], ['nove', '9'], ['oito', '8'],
  ['sete', '7'], ['seis', '6'], ['cinco', '5'], ['quatro', '4'], ['tres', '3'], ['dois', '2'],
  ['primeiro', '1'], ['uma', '1'], ['um', '1'], ['vinte', '20'], ['trinta', '30'],
];

function stripAccents(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeAddress(address: GeocodableAddress): string {
  return [address.postalCode?.replace(/\D/g, ''), address.street, address.number, address.district, address.city, address.state]
    .filter(Boolean).join('|').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function hashAddress(address: GeocodableAddress): string {
  return crypto.createHash('sha256').update(`${GEOCODER_CACHE_VERSION}|${normalizeAddress(address)}`).digest('hex');
}

function normalizedComparable(value: unknown) {
  return stripAccents(String(value || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCoordinate(value: unknown, min: number, max: number) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function normalizedRoad(value: unknown) {
  let normalized = stripAccents(String(value || '')).toLowerCase();
  for (const [word, number] of STREET_NUMBER_WORDS) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), number);
  }
  return normalized
    .replace(/\b(rua|r|avenida|av|travessa|tv|estrada|est|rodovia|rod)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function requestedNumberMatches(address: GeocodableAddress, item: Record<string, any>) {
  const requested = normalizedComparable(address.number);
  if (!requested) return false;
  const returned = normalizedComparable(item.address?.house_number);
  return Boolean(returned) && returned === requested;
}

function requestedRoadMatches(address: GeocodableAddress, item: Record<string, any>) {
  const resultAddress = item.address || {};
  const requested = normalizedRoad(address.street);
  const returned = normalizedRoad(resultAddress.road || resultAddress.pedestrian || resultAddress.residential);
  return Boolean(requested && returned) && (requested.includes(returned) || returned.includes(requested));
}

function requestedCityMatches(address: GeocodableAddress, item: Record<string, any>) {
  const resultAddress = item.address || {};
  const requested = normalizedComparable(address.city);
  const returned = normalizedComparable(resultAddress.city || resultAddress.town || resultAddress.municipality || resultAddress.village);
  return Boolean(requested && returned) && requested === returned;
}

function requestedDistrictMatches(address: GeocodableAddress, item: Record<string, any>) {
  const resultAddress = item.address || {};
  const requested = normalizedComparable(address.district);
  const returned = normalizedComparable(resultAddress.neighbourhood || resultAddress.suburb || resultAddress.quarter || resultAddress.city_district);
  return Boolean(requested && returned) && (requested.includes(returned) || returned.includes(requested));
}

function precisionFromLocationIq(address: GeocodableAddress, item: Record<string, any>): GeocodePrecision {
  const matchCode = String(item.matchquality?.matchcode || item.matchcode || '').toLowerCase();
  if (requestedNumberMatches(address, item) && requestedRoadMatches(address, item) && requestedCityMatches(address, item) && !['fallback', 'approximate'].includes(matchCode)) return 'exact';
  if (requestedRoadMatches(address, item) && requestedCityMatches(address, item)) return 'street';
  if (requestedDistrictMatches(address, item) && requestedCityMatches(address, item)) return 'district';
  return 'postal_code';
}

function locationIqResult(address: GeocodableAddress, item: Record<string, any>, fallbackLabel: string): GeocodeResult | null {
  const latitude = parseCoordinate(item?.lat, -90, 90);
  const longitude = parseCoordinate(item?.lon, -180, 180);
  if (latitude == null || longitude == null) return null;
  return {
    latitude,
    longitude,
    provider: 'locationiq',
    precision: precisionFromLocationIq(address, item),
    formattedAddress: String(item.display_name || fallbackLabel),
  };
}

function scoreLocationIqResult(address: GeocodableAddress, item: Record<string, any>) {
  const resultAddress = item.address || {};
  let score = Number(item.importance || 0);
  if (requestedNumberMatches(address, item)) score += 20;
  if (normalizedComparable(resultAddress.postcode) === normalizedComparable(address.postalCode)) score += 8;
  const resultCity = resultAddress.city || resultAddress.town || resultAddress.municipality || resultAddress.village;
  if (requestedCityMatches(address, item)) score += 5;
  else if (resultCity) score -= 15;
  if (requestedRoadMatches(address, item)) score += 10;
  return score;
}

async function fetchLocationIqResults(url: string) {
  const existing = locationIqInFlight.get(url);
  if (existing) return existing;
  const request = (async () => {
    const previous = locationIqQueue;
    let releaseQueue = () => undefined;
    locationIqQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
    await previous;
    const waitMs = Math.max(0, LOCATIONIQ_MIN_INTERVAL_MS - (Date.now() - locationIqLastRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    locationIqLastRequestAt = Date.now();
    releaseQueue();

    const appOrigin = getEnv().APP_ORIGIN;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PodeVir/1.0',
        ...(appOrigin ? { Referer: appOrigin } : {}),
      },
    }).catch(() => null);
    if (!response) {
      console.warn('[geocoding] LocationIQ indisponivel por falha de rede.');
      return [];
    }
    if (!response.ok) {
      console.warn(`[geocoding] LocationIQ respondeu HTTP ${response.status}${response.status === 429 ? ' (limite de requisicoes)' : ''}.`);
      return [];
    }
    const rows = await response.json() as Record<string, any>[];
    return Array.isArray(rows) ? rows : [];
  })();
  locationIqInFlight.set(url, request);
  try {
    return await request;
  } finally {
    locationIqInFlight.delete(url);
  }
}

async function locationIq(address: GeocodableAddress): Promise<GeocodeResult | null> {
  const token = getEnv().LOCATIONIQ_TOKEN;
  if (!token) return null;
  const query = [address.street, address.number, address.district, address.city, address.state, address.postalCode, 'Brasil'].filter(Boolean).join(', ');
  const common = {
    key: token,
    format: 'json',
    limit: '5',
    countrycodes: 'br',
    addressdetails: '1',
    normalizeaddress: '1',
    normalizecity: '1',
    matchquality: '1',
  };
  const structuredParams = new URLSearchParams({
    ...common,
    street: [address.number, address.street].filter(Boolean).join(' '),
    city: address.city,
    state: address.state || '',
    postalcode: address.postalCode?.replace(/\D/g, '') || '',
    country: 'Brasil',
  });
  const freeformParams = new URLSearchParams({ ...common, q: query });
  const exactRows = await fetchLocationIqResults(`https://us1.locationiq.com/v1/search/structured?${structuredParams}`);
  const exactStructured = exactRows.find((item) => precisionFromLocationIq(address, item) === 'exact');
  if (exactStructured) return locationIqResult(address, exactStructured, query);

  const freeformRows = await fetchLocationIqResults(`https://us1.locationiq.com/v1/search?${freeformParams}`);
  const allExactCandidates = [...exactRows, ...freeformRows];
  const exactFreeform = allExactCandidates.find((item) => precisionFromLocationIq(address, item) === 'exact');
  if (exactFreeform) return locationIqResult(address, exactFreeform, query);

  let streetRows = allExactCandidates.filter((item) => requestedCityMatches(address, item) && requestedRoadMatches(address, item));
  if (!streetRows.length) {
    const streetParams = new URLSearchParams({
      ...common,
      street: address.street,
      city: address.city,
      state: address.state || '',
      postalcode: address.postalCode?.replace(/\D/g, '') || '',
      country: 'Brasil',
    });
    streetRows = (await fetchLocationIqResults(`https://us1.locationiq.com/v1/search/structured?${streetParams}`))
      .filter((item) => requestedCityMatches(address, item) && requestedRoadMatches(address, item));
  }
  const street = streetRows.sort((a, b) => scoreLocationIqResult(address, b) - scoreLocationIqResult(address, a))[0];
  if (street) return locationIqResult(address, street, query);

  if (address.district) {
    const districtParams = new URLSearchParams({ ...common, q: [address.district, address.city, address.state, address.postalCode, 'Brasil'].filter(Boolean).join(', ') });
    const districtRows = await fetchLocationIqResults(`https://us1.locationiq.com/v1/search?${districtParams}`);
    const district = districtRows.find((item) => requestedCityMatches(address, item) && requestedDistrictMatches(address, item));
    if (district) return locationIqResult(address, district, query);
  }

  return null;
}

async function brasilApi(address: GeocodableAddress): Promise<GeocodeResult | null> {
  const postalCode = address.postalCode?.replace(/\D/g, '');
  if (postalCode?.length !== 8) return null;
  const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${postalCode}`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
  if (!response?.ok) return null;
  const data = await response.json();
  const latitude = parseCoordinate(data?.location?.coordinates?.latitude, -90, 90);
  const longitude = parseCoordinate(data?.location?.coordinates?.longitude, -180, 180);
  if (latitude == null || longitude == null) return null;
  return {
    latitude,
    longitude,
    provider: 'brasilapi',
    precision: 'postal_code',
    formattedAddress: [data.street, data.neighborhood, data.city, data.state].filter(Boolean).join(', '),
  };
}

export async function geocodeAddress(address: GeocodableAddress): Promise<GeocodeResult> {
  if (address.locationConfirmed && Number.isFinite(address.latitude) && Number.isFinite(address.longitude)) {
    return { latitude: Number(address.latitude), longitude: Number(address.longitude), provider: 'customer-confirmed', precision: 'confirmed', formattedAddress: '' };
  }

  if (!String(address.number || '').trim()) {
    throw new HttpError(422, 'Informe o numero antes de localizar o endereco.', 'ADDRESS_NUMBER_REQUIRED');
  }

  const addressHash = hashAddress(address);
  const cached = await GeocodeCache.findOne({ addressHash, expiresAt: { $gt: new Date() } }).lean();
  if (cached) return {
    latitude: cached.latitude,
    longitude: cached.longitude,
    provider: cached.provider,
    precision: cached.precision || (cached.provider === 'brasilapi' ? 'postal_code' : 'street'),
    formattedAddress: cached.formattedAddress || '',
  };

  const result = await locationIq(address) || await brasilApi(address);
  if (!result) throw new HttpError(422, 'Nao foi possivel localizar o endereco.', 'ADDRESS_NOT_FOUND');
  if (result.provider === 'locationiq') {
    const ttl = 48 * 60 * 60_000;
    await GeocodeCache.updateOne({ addressHash }, { $set: { addressHash, ...result, expiresAt: new Date(Date.now() + ttl) } }, { upsert: true });
  }
  return result;
}

export function distanceMeters(a: Pick<GeocodeResult, 'latitude' | 'longitude'>, b: Pick<GeocodeResult, 'latitude' | 'longitude'>): number {
  const radians = (value: number) => value * Math.PI / 180;
  const earth = 6_371_000;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

export function normalizeSearchTerm(value: string) {
  return stripAccents(value).toLowerCase().trim();
}

export async function searchDistricts(query: string, city = '', state = '') {
  const token = getEnv().LOCATIONIQ_TOKEN;
  if (!token || query.trim().length < 2) return [];
  const params = new URLSearchParams({ key: token, q: [query, city, state, 'Brasil'].filter(Boolean).join(', '), format: 'json', limit: '6', countrycodes: 'br', addressdetails: '1', normalizecity: '1' });
  const response = await fetch(`https://api.locationiq.com/v1/autocomplete?${params}`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
  if (!response?.ok) return [];
  const rows = await response.json() as Record<string, any>[];
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const address = row.address || {};
    const district = address.neighbourhood || address.suburb || address.quarter || address.city_district || row.display_place || row.display_name?.split(',')[0];
    const itemCity = address.city || address.town || address.municipality || address.village || city;
    const itemState = String(address.state_code || address['ISO3166-2-lvl4'] || state).replace('BR-', '');
    if (!district) return [];
    const sameCity = normalizeSearchTerm(itemCity) === normalizeSearchTerm(city);
    const tagValue = sameCity || !itemCity ? district : `${district} (${itemCity})`;
    const key = normalizeSearchTerm(tagValue);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ district, city: itemCity, state: itemState, tagValue, label: `${district}${itemCity ? ` — ${itemCity}` : ''}${itemState ? `, ${itemState}` : ''}` }];
  }).slice(0, 6);
}
