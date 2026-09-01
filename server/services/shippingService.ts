import type mongoose from 'mongoose';
import StoreSettings from '../../src/models/StoreSettings.js';
import ShippingQuote from '../models/ShippingQuote.js';
import { reaisToCents } from '../domain/money.js';
import { HttpError } from '../middleware/errors.js';
import { geocodeAddress, hashAddress, distanceMeters, type GeocodableAddress } from './geocodingService.js';
import { resolvePublishedRegion } from './deliveryRegionService.js';

type Address = GeocodableAddress;

function normalizeDistrictName(name: string): string {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchDistrict(targetDistrict: string, targetCity: string | undefined, neighborhoodEntry: string): boolean {
  const normTargetDist = normalizeDistrictName(targetDistrict);
  const normTargetCity = targetCity ? normalizeDistrictName(targetCity) : '';
  const normEntry = normalizeDistrictName(neighborhoodEntry);

  if (normEntry === normTargetDist) return true;

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
  const settings = await StoreSettings.findOne({ tenantId }).select('logisticsOptions tipo_taxa_entrega taxa_entrega_fixa taxas_bairros taxa_bairro_padrao bloquear_bairros_nao_atendidos faixas_entrega cep_loja rua_loja numero_loja bairro_loja cidade_loja estado_loja localizacao_loja delivery_regions_publication').lean();
  if (!settings?.logisticsOptions?.allowDelivery) throw new HttpError(409, 'Entrega indisponivel.', 'DELIVERY_DISABLED');

  const deliveryType = settings.tipo_taxa_entrega || 'km';

  // 1. MODO TAXA FIXA
  if (deliveryType === 'fixa') {
    const feeCents = reaisToCents(Number(settings.taxa_entrega_fixa || 0));
    const quote = await ShippingQuote.create({
      tenantId,
      feeCents,
      normalizedAddressHash: hashAddress(destination),
      provider: 'fixed',
      distanceMeters: 0,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return { id: quote._id, feeCents: quote.feeCents, distanceMeters: 0, expiresAt: quote.expiresAt };
  }

  // 2. MODO POR BAIRRO
  if (deliveryType === 'bairro') {
    const district = destination.district?.trim();
    if (!district) {
      throw new HttpError(422, 'Informe o bairro para calcular a taxa de entrega.', 'DISTRICT_REQUIRED');
    }

    const neighborhoods = Array.isArray(settings.taxas_bairros) ? settings.taxas_bairros : [];
    const matched = neighborhoods.find(
      (n: any) => n.ativo !== false && matchDistrict(district, destination.city, n.nome)
    );

    let feeCents: number;
    if (matched) {
      feeCents = reaisToCents(Number(matched.valor || 0));
    } else {
      const hasDefaultRate = settings.taxa_bairro_padrao != null && Number(settings.taxa_bairro_padrao) >= 0;
      if (settings.bloquear_bairros_nao_atendidos !== false && !hasDefaultRate) {
        throw new HttpError(422, `Desculpe, ainda não realizamos entregas no bairro "${district}".`, 'OUTSIDE_DELIVERY_AREA');
      }
      feeCents = hasDefaultRate ? reaisToCents(Number(settings.taxa_bairro_padrao)) : 0;
    }

    const quote = await ShippingQuote.create({
      tenantId,
      feeCents,
      normalizedAddressHash: hashAddress(destination),
      provider: 'bairro',
      distanceMeters: 0,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return { id: quote._id, feeCents: quote.feeCents, distanceMeters: 0, expiresAt: quote.expiresAt };
  }

  // 3. MODO POR REGIAO DESENHADA NO MAPA
  if (deliveryType === 'regiao') {
    if (!settings.delivery_regions_publication) throw new HttpError(409, 'As regioes de entrega ainda nao foram publicadas.', 'DELIVERY_REGIONS_NOT_PUBLISHED');
    const destinationLocation = await geocodeAddress(destination);
    if (!['confirmed', 'exact'].includes(destinationLocation.precision)) {
      throw new HttpError(409, 'Confirme o ponto de entrega no mapa.', 'LOCATION_CONFIRMATION_REQUIRED', {
        location: { latitude: destinationLocation.latitude, longitude: destinationLocation.longitude },
        precision: destinationLocation.precision,
      });
    }
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
  const [from, to] = await Promise.all([geocodeAddress(origin), geocodeAddress(destination)]);
  const meters = distanceMeters(from, to);
  const bands = [...(settings.faixas_entrega || [])].sort((a, b) => Number(a.km_ate) - Number(b.km_ate));
  const band = bands.find((item) => meters <= Number(item.km_ate) * 1_000);
  if (!band) throw new HttpError(422, 'Endereco fora da area de entrega.', 'OUTSIDE_DELIVERY_AREA');
  const quote = await ShippingQuote.create({ tenantId, feeCents: reaisToCents(Number(band.valor)), normalizedAddressHash: hashAddress(destination), provider: `${from.provider}+${to.provider}`, distanceMeters: meters, expiresAt: new Date(Date.now() + 15 * 60_000) });
  return { id: quote._id, feeCents: quote.feeCents, distanceMeters: meters, expiresAt: quote.expiresAt };
}
