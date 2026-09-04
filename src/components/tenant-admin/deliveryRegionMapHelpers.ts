import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { DeliveryRegionInput, StoreLocation } from '../../types/deliveryRegions';

export const clampRadius = (meters: number) => Math.min(150_000, Math.max(100, Number.isFinite(meters) ? Math.round(meters) : 100));

export function radiusBetween(a: StoreLocation, b: { lng: number; lat: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.longitude) * rad / 2) ** 2;
  return clampRadius(6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h))));
}

export function matchMapRegion(regions: DeliveryRegionInput[], point: [number, number]) {
  return regions.filter((region) => region.active !== false)
    .sort((a, b) => a.priority - b.priority)
    .find((region) => booleanPointInPolygon(point, region.geometry));
}

export type MapBulkPatch = { feeCents?: number; deliveryTimeMin?: number; deliveryTimeMax?: number };
export function previewMapBulk<T extends DeliveryRegionInput>(regions: T[], patch: MapBulkPatch): T[] {
  if (Object.values(patch).some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error('Informe valores inteiros e não negativos.');
  return regions.map((region) => {
    const next = { ...region, ...patch, feeCents: region.blocked || region.active === false ? region.feeCents : patch.feeCents ?? region.feeCents };
    if (next.deliveryTimeMin > next.deliveryTimeMax) throw new Error('O prazo mínimo não pode superar o máximo.');
    return next;
  });
}
