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
};

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  provider: string;
  precision: GeocodePrecision;
  formattedAddress: string;
};

function stripAccents(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeAddress(address: GeocodableAddress): string {
  return [address.postalCode?.replace(/\D/g, ''), address.street, address.number, address.district, address.city, address.state]
    .filter(Boolean).join('|').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function hashAddress(address: GeocodableAddress): string {
  return crypto.createHash('sha256').update(normalizeAddress(address)).digest('hex');
}

function precisionFromLocationIq(item: Record<string, any>): GeocodePrecision {
  const type = String(item.type || item.addresstype || '').toLowerCase();
  if (['house', 'building', 'residential', 'apartments'].includes(type) || item.address?.house_number) return 'exact';
  if (['road', 'street', 'pedestrian'].includes(type)) return 'street';
  if (['suburb', 'neighbourhood', 'quarter'].includes(type)) return 'district';
  return 'postal_code';
}

async function locationIq(address: GeocodableAddress): Promise<GeocodeResult | null> {
  const token = getEnv().LOCATIONIQ_TOKEN;
  if (!token) return null;
  const query = [address.street, address.number, address.district, address.city, address.state, address.postalCode, 'Brasil'].filter(Boolean).join(', ');
  const params = new URLSearchParams({ key: token, q: query, format: 'json', limit: '1', countrycodes: 'br', addressdetails: '1', normalizecity: '1' });
  const response = await fetch(`https://api.locationiq.com/v1/search?${params}`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
  if (!response?.ok) return null;
  const [item] = await response.json() as Record<string, any>[];
  const latitude = Number(item?.lat);
  const longitude = Number(item?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, provider: 'locationiq', precision: precisionFromLocationIq(item), formattedAddress: String(item.display_name || query) };
}

async function brasilApi(address: GeocodableAddress): Promise<GeocodeResult | null> {
  const postalCode = address.postalCode?.replace(/\D/g, '');
  if (postalCode?.length !== 8) return null;
  const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${postalCode}`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
  if (!response?.ok) return null;
  const data = await response.json();
  const latitude = Number(data?.location?.coordinates?.latitude);
  const longitude = Number(data?.location?.coordinates?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
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
  const ttl = result.provider === 'locationiq' ? 48 * 60 * 60_000 : 30 * 24 * 60 * 60_000;
  await GeocodeCache.updateOne({ addressHash }, { $set: { addressHash, ...result, expiresAt: new Date(Date.now() + ttl) } }, { upsert: true });
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
