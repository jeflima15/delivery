import { describe, expect, it } from 'vitest';
import { clampRadius, matchMapRegion, previewMapBulk, radiusBetween } from './deliveryRegionMapHelpers';
import type { DeliveryRegionInput } from '../../types/deliveryRegions';

const region = (patch: Partial<DeliveryRegionInput> = {}): DeliveryRegionInput => ({
  name: 'Area', sourceType: 'polygon', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
  active: true, blocked: false, priority: 0, feeCents: 500, deliveryTimeMin: 20, deliveryTimeMax: 40, ...patch,
});

describe('delivery map draft helpers', () => {
  it('clamps finite and invalid radii to the supported interval', () => {
    expect(clampRadius(0)).toBe(100);
    expect(clampRadius(200000)).toBe(150000);
    expect(clampRadius(NaN)).toBe(100);
    expect(radiusBetween({ longitude: 0, latitude: 0, confirmed: true }, { lng: 0, lat: 1 })).toBeCloseTo(111195, 0);
  });
  it('uses first active priority winner, including blocked regions and boundaries', () => {
    const allowed = region({ priority: 2 });
    const blocked = region({ priority: 1, blocked: true });
    const inactive = region({ priority: 0, active: false });
    const regions = [allowed, inactive, blocked];
    expect(matchMapRegion(regions, [0.5, 0.5])).toBe(blocked);
    expect(matchMapRegion(regions, [0, 0])).toBe(blocked);
    expect(matchMapRegion(regions, [2, 2])).toBeUndefined();
    expect(regions[0]).toBe(allowed);
    expect(matchMapRegion([allowed, region({ priority: 2 })], [0.5, 0.5])).toBe(allowed);
  });
  it('previews immutable changes, preserving blocked fees and unrelated fields', () => {
    const original = [region(), { ...region({ blocked: true, feeCents: 0, active: false }), notes: 'Keep me' }];
    const result = previewMapBulk(original, { feeCents: 900, deliveryTimeMax: 60 });
    expect(original[0].feeCents).toBe(500);
    expect(result[0].feeCents).toBe(900);
    expect(result[1]).toMatchObject({ feeCents: 0, deliveryTimeMin: 20, deliveryTimeMax: 60, notes: 'Keep me', active: false });
  });
  it('rejects invalid fees and inverted or fractional deadlines', () => {
    expect(() => previewMapBulk([region()], { feeCents: -1 })).toThrow();
    expect(() => previewMapBulk([region()], { deliveryTimeMin: 41 })).toThrow();
    expect(() => previewMapBulk([region()], { deliveryTimeMax: 10.5 })).toThrow();
    expect(() => previewMapBulk([region()], { feeCents: Infinity })).toThrow();
  });
  it('preserves the fee of inactive, non-blocked regions', () => {
    const original = region({ active: false, blocked: false, feeCents: 750 });
    expect(previewMapBulk([original], { feeCents: 900, deliveryTimeMax: 60 })[0]).toMatchObject({ feeCents: 750, deliveryTimeMax: 60 });
  });
});
