import crypto from 'node:crypto';
import type mongoose from 'mongoose';
import StoreSettings from '../../src/models/StoreSettings.js';
import GeocodeCache from '../models/GeocodeCache.js';
import ShippingQuote from '../models/ShippingQuote.js';
import { reaisToCents } from '../domain/money.js';
import { HttpError } from '../middleware/errors.js';

type Address = { postalCode?: string; street: string; number?: string; district?: string; city: string; state?: string };
type Coordinates = { latitude: number; longitude: number; provider: string };

function normalizeAddress(address: Address): string {
  return [address.postalCode?.replace(/\D/g, ''), address.street, address.number, address.district, address.city, address.state]
    .filter(Boolean).join('|').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function hashAddress(address: Address): string {
  return crypto.createHash('sha256').update(normalizeAddress(address)).digest('hex');
}

async function geocode(address: Address): Promise<Coordinates> {
  const addressHash = hashAddress(address);
  const cached = await GeocodeCache.findOne({ addressHash, expiresAt: { $gt: new Date() } }).lean();
  if (cached) return { latitude: cached.latitude, longitude: cached.longitude, provider: cached.provider };

  const postalCode = address.postalCode?.replace(/\D/g, '');
  let coordinates: Coordinates | null = null;
  if (postalCode?.length === 8) {
    const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${postalCode}`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
    if (response?.ok) {
      const data = await response.json();
      const latitude = Number(data?.location?.coordinates?.latitude);
      const longitude = Number(data?.location?.coordinates?.longitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) coordinates = { latitude, longitude, provider: 'brasilapi' };
    }
  }
  if (!coordinates) {
    // Nominatim often knows the street but not individual house numbers. Try
    // progressively broader queries before rejecting an otherwise valid CEP.
    const queries = [
      [address.street, address.number, address.district, address.city, address.state, 'Brasil'],
      [address.street, address.district, address.city, address.state, 'Brasil'],
      [address.street, address.city, address.state, 'Brasil'],
      [address.district, address.city, address.state, 'Brasil'],
    ]
      .map((parts) => parts.filter(Boolean).join(', '))
      .filter((query, index, all) => query && all.indexOf(query) === index);

    for (const query of queries) {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&limit=1&q=${encodeURIComponent(query)}`, {
        headers: { 'user-agent': 'DeliverySaaS/1.0 (geocoding for shipping quotes)' }, signal: AbortSignal.timeout(5_000),
      }).catch(() => null);
      if (!response?.ok) continue;
      const [item] = await response.json();
      const latitude = Number(item?.lat); const longitude = Number(item?.lon);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        coordinates = { latitude, longitude, provider: 'nominatim' };
        break;
      }
    }
  }
  if (!coordinates) throw new HttpError(422, 'Nao foi possivel localizar o endereco.', 'ADDRESS_NOT_FOUND');
  await GeocodeCache.updateOne({ addressHash }, { $set: { addressHash, ...coordinates, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) } }, { upsert: true });
  return coordinates;
}

function distanceMeters(a: Coordinates, b: Coordinates): number {
  const radians = (value: number) => value * Math.PI / 180;
  const earth = 6_371_000;
  const dLat = radians(b.latitude - a.latitude); const dLon = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

export async function createShippingQuote(tenantId: mongoose.Types.ObjectId, destination: Address) {
  const settings = await StoreSettings.findOne({ tenantId }).select('logisticsOptions faixas_entrega cep_loja rua_loja numero_loja bairro_loja cidade_loja estado_loja').lean();
  if (!settings?.logisticsOptions?.allowDelivery) throw new HttpError(409, 'Entrega indisponivel.', 'DELIVERY_DISABLED');
  const origin: Address = { postalCode: settings.cep_loja, street: settings.rua_loja, number: settings.numero_loja, district: settings.bairro_loja, city: settings.cidade_loja, state: settings.estado_loja };
  if (!origin.street || !origin.city) throw new HttpError(409, 'Endereco da loja incompleto.', 'STORE_ADDRESS_INCOMPLETE');
  const [from, to] = await Promise.all([geocode(origin), geocode(destination)]);
  const meters = distanceMeters(from, to);
  const bands = [...(settings.faixas_entrega || [])].sort((a, b) => Number(a.km_ate) - Number(b.km_ate));
  const band = bands.find((item) => meters <= Number(item.km_ate) * 1_000);
  if (!band) throw new HttpError(422, 'Endereco fora da area de entrega.', 'OUTSIDE_DELIVERY_AREA');
  const quote = await ShippingQuote.create({ tenantId, feeCents: reaisToCents(Number(band.valor)), normalizedAddressHash: hashAddress(destination), provider: `${from.provider}+${to.provider}`, distanceMeters: meters, expiresAt: new Date(Date.now() + 15 * 60_000) });
  return { id: quote._id, feeCents: quote.feeCents, distanceMeters: meters, expiresAt: quote.expiresAt };
}
