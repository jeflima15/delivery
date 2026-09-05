export type DeliveryRegionSourceType = 'circle' | 'polygon';
export type GeocodePrecision = 'confirmed' | 'exact' | 'street' | 'postal_code' | 'district';

export type LngLatTuple = [number, number];

export interface DeliveryPolygonGeometry {
  type: 'Polygon';
  coordinates: LngLatTuple[][];
}

export interface StoreLocation {
  latitude: number;
  longitude: number;
  confirmed: boolean;
  addressKey?: string;
}

export interface DeliveryRegionInput {
  notes?: string;
  id?: string;
  name: string;
  sourceType: DeliveryRegionSourceType;
  geometry: DeliveryPolygonGeometry;
  center?: StoreLocation;
  radiusMeters?: number;
  feeCents: number;
  deliveryTimeMin?: number;
  deliveryTimeMax?: number;
  blocked: boolean;
  active: boolean;
  priority: number;
}

export interface DeliveryRegion extends DeliveryRegionInput {
  id: string;
  publicationId: string;
}

export interface DeliveryRegionListResponse {
  success: true;
  publicationId: string | null;
  storeLocation: StoreLocation | null;
  regions: DeliveryRegion[];
}

export interface DeliveryRegionsDraft {
  storeLocation: StoreLocation | null;
  regions: DeliveryRegionInput[];
}

export interface DeliveryRegionQuoteResult {
  estimateMode?: 'total' | 'preparo_deslocamento';
  id: string;
  feeCents: number;
  distanceMeters: number;
  expiresAt: string;
  deliveryTimeMin?: number;
  deliveryTimeMax?: number;
  regionName?: string;
  precision?: GeocodePrecision;
}
