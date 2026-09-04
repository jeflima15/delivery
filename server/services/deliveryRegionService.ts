import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import kinks from '@turf/kinks';
import type mongoose from 'mongoose';
import DeliveryRegion from '../../src/models/DeliveryRegion.js';
import type { DeliveryPolygonGeometry, DeliveryRegionInput, StoreLocation } from '../../src/types/deliveryRegions.js';
import { HttpError } from '../middleware/errors.js';
import { distanceMeters } from './geocodingService.js';

function samePoint(a: number[], b: number[]) {
  return a[0] === b[0] && a[1] === b[1];
}

export function validateDeliveryGeometry(geometry: DeliveryPolygonGeometry, storeLocation?: StoreLocation) {
  const rings = geometry?.coordinates;
  if (geometry?.type !== 'Polygon' || !Array.isArray(rings) || rings.length !== 1) throw new HttpError(400, 'A regiao precisa ser um poligono simples.', 'INVALID_DELIVERY_REGION');
  const ring = rings[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 500 || !samePoint(ring[0], ring[ring.length - 1])) throw new HttpError(400, 'O contorno da regiao esta incompleto.', 'INVALID_DELIVERY_REGION');
  for (const coordinate of ring) {
    const [longitude, latitude] = coordinate;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) throw new HttpError(400, 'A regiao possui coordenadas invalidas.', 'INVALID_DELIVERY_REGION');
    if (storeLocation && distanceMeters(storeLocation, { latitude, longitude }) > 150_000) throw new HttpError(400, 'A regiao esta distante demais da loja.', 'INVALID_DELIVERY_REGION');
  }
  const feature = polygon(rings);
  if (kinks(feature).features.length > 0) throw new HttpError(400, 'O contorno da regiao cruza sobre ele mesmo.', 'SELF_INTERSECTING_REGION');
}

export function resolveRegionFromList(regions: DeliveryRegionInput[], latitude: number, longitude: number) {
  return [...regions]
    .filter((region) => region.active !== false)
    .sort((a, b) => a.priority - b.priority)
    .find((region) => booleanPointInPolygon(point([longitude, latitude]), region.geometry));
}

export async function resolvePublishedRegion(tenantId: mongoose.Types.ObjectId, publicationId: string, latitude: number, longitude: number) {
  const regions = await DeliveryRegion.find({ tenantId, publicationId, active: true }).sort({ priority: 1 }).lean();
  return regions.find((region) => booleanPointInPolygon(point([longitude, latitude]), region.geometry));
}

export function deliveryRegionDto(region: Record<string, any>) {
  return {
    id: String(region._id),
    name: region.name,
    notes: region.notes || '',
    sourceType: region.sourceType,
    geometry: region.geometry,
    center: region.center,
    radiusMeters: region.radiusMeters,
    feeCents: region.feeCents,
    deliveryTimeMin: region.deliveryTimeMin,
    deliveryTimeMax: region.deliveryTimeMax,
    blocked: region.blocked,
    active: region.active,
    priority: region.priority,
  };
}
