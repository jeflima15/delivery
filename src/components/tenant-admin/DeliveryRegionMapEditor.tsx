import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapMouseEvent, type Marker } from 'maplibre-gl';
import circle from '@turf/circle';
import { ArrowDown, ArrowUp, Ban, Check, Circle, LocateFixed, MapPin, MousePointer2, Pentagon, RotateCcw, Trash2, Undo2, X } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTenantAdminApi } from './TenantAdminContext';
import { useToast } from '../Toast';
import type { DeliveryPolygonGeometry, DeliveryRegionInput, DeliveryRegionsDraft, StoreLocation } from '../../types/deliveryRegions';
import { DELIVERY_MAP_STYLE, installMissingMapImageFallback } from '../../lib/deliveryMap';
import { clampRadius, matchMapRegion, previewMapBulk, radiusBetween } from './deliveryRegionMapHelpers';

type MapRegion = DeliveryRegionInput & { notes?: string };

type Props = {
  value: DeliveryRegionsDraft;
  onChange: Dispatch<SetStateAction<DeliveryRegionsDraft | null>>;
  onValidationChange: (error: string) => void;
  resetKey: number;
  visible: boolean;
  address: { postalCode?: string; street: string; number?: string; district?: string; city: string; state?: string };
  estimateMode?: 'total' | 'preparo_deslocamento';
};

function isValidLocation(location: StoreLocation | null | undefined): location is StoreLocation {
  return Boolean(location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude));
}

function addressKey(address: Props['address']) {
  return [address.postalCode?.replace(/\D/g, ''), address.street, address.number, address.district, address.city, address.state]
    .filter(Boolean)
    .join('|')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasCompleteAddress(address: Props['address']) {
  return Boolean(address.street.trim())
    && Boolean(address.number?.trim())
    && Boolean(address.city.trim());
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function locationMessage(precision: string, formattedAddress: string, provider: string) {
  if (precision === 'exact') return `Rua e número encontrados: ${formattedAddress}. Confira o pino antes de confirmar.`;
  const level = precision === 'street' ? 'a rua' : precision === 'district' ? 'o bairro' : precision === 'city' ? 'a cidade' : 'a região do CEP';
  const providerHint = provider === 'brasilapi' ? ' A busca detalhada não respondeu ou não encontrou esse endereço.' : '';
  return `O número não foi localizado. Posicionamos o pino próximo, usando ${level}: ${formattedAddress}.${providerHint} Arraste-o até a entrada correta.`;
}

function polygonVertices(geometry: DeliveryPolygonGeometry): [number, number][] {
  const ring = geometry.coordinates[0] || [];
  if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) return ring.slice(0, -1);
  return ring;
}

function polygonFromVertices(vertices: [number, number][]): DeliveryPolygonGeometry {
  return { type: 'Polygon', coordinates: [[...vertices, vertices[0]]] };
}

function makeCircle(center: StoreLocation, radiusMeters: number): DeliveryPolygonGeometry {
  return circle([center.longitude, center.latitude], radiusMeters / 1_000, { steps: 72, units: 'kilometers' }).geometry as DeliveryPolygonGeometry;
}

function blankRegion(center: StoreLocation, index: number): DeliveryRegionInput {
  return {
    name: `Região ${index + 1}`,
    sourceType: 'circle',
    geometry: makeCircle(center, 3_000),
    center,
    radiusMeters: 3_000,
    feeCents: 500,
    deliveryTimeMin: 30,
    deliveryTimeMax: 50,
    blocked: false,
    active: true,
    priority: index,
  };
}

export default function DeliveryRegionMapEditor({ address, estimateMode = 'total', value, onChange, onValidationChange, resetKey, visible }: Props) {
  const timeLabel = estimateMode === 'preparo_deslocamento' ? 'Deslocamento' : 'Prazo total';
  const timeLabelRef = useRef(timeLabel);
  timeLabelRef.current = timeLabel;
  const api = useTenantAdminApi();
  const { showToast } = useToast();
  const geocodeRequestRef = useRef(0);
  useEffect(() => () => { geocodeRequestRef.current++; }, []);
  const currentAddressRef = useRef(address);
  currentAddressRef.current = address;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const testMarkerRef = useRef<Marker | null>(null);
  const streetInputRef = useRef<HTMLInputElement>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const postalCodeRequestRef = useRef(0);
  const vertexMarkersRef = useRef<Marker[]>([]);
  const drawingRef = useRef(false);
  const ignoreMapClickUntilRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const storeLocation = value.storeLocation;
  const setStoreLocation = (update: SetStateAction<StoreLocation | null>) => onChange((current) => current ? { ...current, storeLocation: typeof update === 'function' ? update(current.storeLocation) : update } : current);
  const storeLocationRef = useRef(storeLocation);
  storeLocationRef.current = storeLocation;
  const regions = value.regions;
  const setRegions = (update: SetStateAction<MapRegion[]>) => onChange((current) => current ? { ...current, regions: typeof update === 'function' ? update(current.regions) : update } : current);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [mode, setMode] = useState<'select' | 'polygon' | 'circle' | 'inspect'>('select');
  const isDrawing = mode === 'polygon';
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const regionsRef = useRef(regions);
  regionsRef.current = regions;
  const [circleDraft, setCircleDraft] = useState<MapRegion | null>(null);
  const circleHandlesRef = useRef<Marker[]>([]);
  const handleDraggingRef = useRef<number | null>(null);
  const [bulk, setBulk] = useState({ fee: '', min: '', max: '' });
  const [bulkPreview, setBulkPreview] = useState<{ source: MapRegion[]; next: MapRegion[] } | null>(null);
  const [testAddress, setTestAddress] = useState({ postalCode: '', street: '', number: '', district: '', city: '', state: '' });
  const [lookingUpPostalCode, setLookingUpPostalCode] = useState(false);
  const [postalCodeFeedback, setPostalCodeFeedback] = useState('');
  const [testResult, setTestResult] = useState<string>('');
  const [locationFeedback, setLocationFeedback] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDirty(false);
    setMode('select');
    setDrawingPoints([]);
    setCircleDraft(null);
    setBulkPreview(null);
  }, [resetKey]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => mapRef.current?.resize());
  }, [visible]);

  useEffect(() => {
    const error = mode === 'polygon' || mode === 'circle'
      ? 'Conclua ou cancele o desenho no mapa antes de salvar.'
      : regions.some((region) => region.active) && (!isValidLocation(storeLocation) || !storeLocation.confirmed || storeLocation.addressKey !== addressKey(address))
        ? 'Localize e confirme a posição da loja no mapa antes de salvar.'
        : regions.some((region) => !region.name.trim() || !Number.isInteger(region.feeCents) || region.feeCents < 0 ||
            ((region.deliveryTimeMin != null || region.deliveryTimeMax != null) &&
              (!Number.isInteger(region.deliveryTimeMin) || !Number.isInteger(region.deliveryTimeMax) ||
                region.deliveryTimeMin! < 0 || region.deliveryTimeMax! < region.deliveryTimeMin!)))
          ? 'Revise nomes, taxas e prazos das regiões.' : '';
    onValidationChange(error);
  }, [mode, regions, storeLocation, address, onValidationChange]);

  useEffect(() => { drawingRef.current = isDrawing; }, [isDrawing]);

  useEffect(() => {
    if (loading) return;
    const currentAddressKey = addressKey(address);
    if (storeLocation?.addressKey === currentAddressKey) return;
    if (isValidLocation(storeLocation) && !storeLocation.addressKey) {
      setLocationFeedback('Posição salva preservada. Confirme o pino para associá-lo ao endereço atual ou use Localizar pelo endereço.');
      return;
    }
    if (!hasCompleteAddress(address)) {
      setStoreLocation((current) => current?.confirmed ? { ...current, confirmed: false } : current);
      setLocationFeedback('Endereço alterado. Preencha rua, número e cidade para buscar a nova posição.');
      return;
    }
    let active = true;
    const requestId = ++geocodeRequestRef.current;
    const isCurrent = () => active && requestId === geocodeRequestRef.current && currentAddressKey === addressKey(currentAddressRef.current);
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.geocodeStore(address);
        if (!isCurrent()) return;
        setStoreLocation({ ...result.location, confirmed: false, addressKey: currentAddressKey });
        setLocationFeedback(locationMessage(result.precision, result.formattedAddress, result.provider));
        mapRef.current?.flyTo({ center: [result.location.longitude, result.location.latitude], zoom: 16 });
        setDirty(true);
        showToast('Endereço alterado. Confira e confirme a nova posição da loja.', 'info');
      } catch (error) {
        if (!isCurrent()) return;
        showToast(error instanceof Error ? error.message : 'Não foi possível atualizar a localização da loja.', 'error');
      }
    }, 700);
    return () => { active = false; window.clearTimeout(timer); };
  }, [address.postalCode, address.street, address.number, address.district, address.city, address.state, api, loading, showToast, storeLocation?.addressKey]);

  const hasStoreLocation = isValidLocation(storeLocation);

  useEffect(() => {
    if (!hasStoreLocation || !storeLocation || !containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: DELIVERY_MAP_STYLE, center: [storeLocation.longitude, storeLocation.latitude], zoom: 12.5, attributionControl: { compact: true } });
    installMissingMapImageFallback(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const marker = new maplibregl.Marker({ color: '#059669', draggable: true }).setLngLat([storeLocation.longitude, storeLocation.latitude]).addTo(map);
    marker.on('dragend', () => {
      const point = marker.getLngLat();
      setStoreLocation((current) => current ? { ...current, latitude: point.lat, longitude: point.lng, confirmed: true, addressKey: addressKey(currentAddressRef.current) } : current);
      setLocationFeedback('Posição ajustada manualmente e confirmada para o endereço atual.');
      setDirty(true);
    });
    markerRef.current = marker;
    const handleClick = (event: MapMouseEvent) => {
      // The click synthesized after a completed drag must not select an older area.
      if (performance.now() < ignoreMapClickUntilRef.current) return;
      if ((event.originalEvent.target as Element | null)?.closest('.maplibregl-marker')) return;
      if (modeRef.current === 'circle') return;
      if (modeRef.current === 'inspect') {
        const region = matchMapRegion(regionsRef.current, [event.lngLat.lng, event.lngLat.lat]);
        testMarkerRef.current?.remove();
        testMarkerRef.current = new maplibregl.Marker({ color: '#7c3aed' }).setLngLat(event.lngLat).addTo(map);
        setTestResult(!region ? 'Fora das áreas ativas do rascunho.' : region.blocked ? `Bloqueado por “${region.name}”.` : `Atendido por “${region.name}”: R$ ${(region.feeCents / 100).toFixed(2)} • ${timeLabelRef.current}: ${region.deliveryTimeMin}-${region.deliveryTimeMax} min (rascunho).`);
        return;
      }
      if (drawingRef.current) {
        setDrawingPoints((points) => [...points, [event.lngLat.lng, event.lngLat.lat]]);
        return;
      }
      if (!map.getLayer('delivery-region-fill')) return;
      const [feature] = map.queryRenderedFeatures(event.point, { layers: ['delivery-region-fill'] });
      if (feature?.properties?.regionIndex != null) setSelectedIndex(Number(feature.properties.regionIndex));
    };
    map.on('click', handleClick);
    map.on('load', () => {
      map.addSource('delivery-regions', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'delivery-region-fill', type: 'fill', source: 'delivery-regions', paint: { 'fill-color': ['case', ['boolean', ['get', 'draft'], false], '#0ea5e9', ['boolean', ['get', 'inactive'], false], '#94a3b8', ['boolean', ['get', 'blocked'], false], '#e11d48', '#f59e0b'], 'fill-opacity': ['case', ['boolean', ['get', 'inactive'], false], 0.06, 0.22] } });
      map.addLayer({ id: 'delivery-region-line', type: 'line', source: 'delivery-regions', paint: { 'line-color': ['case', ['boolean', ['get', 'draft'], false], '#0284c7', ['boolean', ['get', 'selected'], false], '#047857', ['boolean', ['get', 'blocked'], false], '#be123c', '#d97706'], 'line-width': ['case', ['boolean', ['get', 'selected'], false], 4, 2] } });
      setRegions((current) => [...current]);
    });
    mapRef.current = map;
    return () => {
      vertexMarkersRef.current.forEach((item) => item.remove());
      vertexMarkersRef.current = [];
      testMarkerRef.current?.remove();
      testMarkerRef.current = null;
      map.remove(); mapRef.current = null; markerRef.current = null;
    };
  }, [hasStoreLocation]);

  useEffect(() => {
    if (!isValidLocation(storeLocation) || !markerRef.current) return;
    markerRef.current.setLngLat([storeLocation.longitude, storeLocation.latitude]);
  }, [storeLocation?.latitude, storeLocation?.longitude]);

  useEffect(() => {
    const map = mapRef.current;
    // Source updates can still be processing when the final drag event arrives.
    // Queue the newest geometry instead of leaving the previous draft visible.
    const source = map?.getSource('delivery-regions') as GeoJSONSource | undefined;
    if (!source) return;
    const features: any[] = regions.map((region, index) => ({ type: 'Feature', properties: { regionIndex: index, selected: selectedIndex === index, blocked: region.blocked, inactive: !region.active }, geometry: region.geometry })).reverse();
    if (circleDraft) features.push({ type: 'Feature', properties: { draft: true }, geometry: circleDraft.geometry });
    if (drawingPoints.length) {
      const coordinates = drawingPoints.length > 2 ? [...drawingPoints, drawingPoints[0]] : drawingPoints;
      features.push({ type: 'Feature', properties: { draft: true }, geometry: drawingPoints.length > 2 ? { type: 'Polygon', coordinates: [coordinates] } : { type: 'LineString', coordinates } });
    }
    source.setData({ type: 'FeatureCollection', features });
  }, [regions, selectedIndex, drawingPoints, circleDraft]);

  useEffect(() => {
    vertexMarkersRef.current.forEach((marker) => marker.remove());
    vertexMarkersRef.current = [];
    const map = mapRef.current;
    if (!map || (mode !== 'select' && mode !== 'polygon')) return;

    const selected = selectedIndex == null ? null : regions[selectedIndex];
    const points = isDrawing
      ? drawingPoints
      : selected?.sourceType === 'polygon'
        ? polygonVertices(selected.geometry)
        : [];

    vertexMarkersRef.current = points.map((point, pointIndex) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.title = 'Arraste para ajustar este ponto';
      element.setAttribute('aria-label', `Ponto ${pointIndex + 1}. Arraste para ajustar.`);
      element.className = 'delivery-map-vertex';
      Object.assign(element.style, {
        width: '22px', height: '22px', borderRadius: '999px', border: '3px solid white',
        background: isDrawing ? '#0284c7' : '#059669', boxShadow: '0 1px 6px rgba(15,23,42,.45)',
        cursor: 'grab',
      });
      const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat(point).addTo(map);
    marker.on('dragend', () => {
        const nextPoint = marker.getLngLat();
        if (isDrawing) {
          setDrawingPoints((current) => current.map((item, index) => index === pointIndex ? [nextPoint.lng, nextPoint.lat] : item));
          return;
        }
        if (selectedIndex == null) return;
        setRegions((current) => current.map((region, regionIndex) => {
          if (regionIndex !== selectedIndex || region.sourceType !== 'polygon') return region;
          const vertices = polygonVertices(region.geometry).map((item, index) => index === pointIndex ? [nextPoint.lng, nextPoint.lat] as [number, number] : item);
          return { ...region, geometry: polygonFromVertices(vertices) };
        }));
        setDirty(true);
      });
      return marker;
    });

    return () => {
      vertexMarkersRef.current.forEach((marker) => marker.remove());
      vertexMarkersRef.current = [];
    };
  }, [drawingPoints, isDrawing, regions, selectedIndex, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    const storeMarker = markerRef.current;
    const storeMarkerElement = storeMarker?.getElement();
    const previousPointerEvents = storeMarkerElement?.style.pointerEvents ?? '';
    const previousDraggable = storeMarker?.isDraggable() ?? true;
    canvas.style.cursor = mode === 'select' ? '' : 'crosshair';
    storeMarker?.setDraggable(mode === 'select');
    // A non-draggable marker still intercepts presses above the canvas.
    if (storeMarkerElement) storeMarkerElement.style.pointerEvents = mode === 'select' ? previousPointerEvents : 'none';
    const restoreStoreMarker = () => {
      if (storeMarkerElement) storeMarkerElement.style.pointerEvents = previousPointerEvents;
      storeMarker?.setDraggable(previousDraggable);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMode('select'); setDrawingPoints([]); setCircleDraft(null); } };
    window.addEventListener('keydown', escape);
    if (mode !== 'circle') return () => { canvas.style.cursor = previousCursor; restoreStoreMarker(); window.removeEventListener('keydown', escape); };
    const handlers = [map.dragPan, map.touchZoomRotate, map.doubleClickZoom, map.boxZoom, map.dragRotate, map.scrollZoom, map.keyboard];
    const enabled = handlers.map((handler) => handler.isEnabled());
    handlers.forEach((handler) => handler.disable());
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    let pointer: number | null = null;
    let draft: MapRegion | null = null;
    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
    };
    const down = (event: PointerEvent) => {
      if (pointer !== null || !event.isPrimary || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      pointer = event.pointerId;
      canvas.setPointerCapture(pointer);
      const p = point(event);
      const center = { longitude: p.lng, latitude: p.lat, confirmed: true };
      draft = { ...blankRegion(center, regionsRef.current.length), radiusMeters: 100, geometry: makeCircle(center, 100) };
      setCircleDraft(draft);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer || !draft?.center) return;
      event.preventDefault(); event.stopPropagation();
      const radiusMeters = radiusBetween(draft.center, point(event));
      draft = { ...draft, radiusMeters, geometry: makeCircle(draft.center, radiusMeters) };
      setCircleDraft(draft);
    };
    const release = () => {
      const captured = pointer;
      pointer = null;
      if (captured !== null && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer || !draft) return;
      move(event);
      const finished = draft;
      ignoreMapClickUntilRef.current = performance.now() + 300;
      release();
      setRegions((current) => [...current, { ...finished, priority: current.length }]);
      setSelectedIndex(regionsRef.current.length);
      setDirty(true); setCircleDraft(null); setMode('select');
    };
    const cancel = () => { release(); draft = null; setCircleDraft(null); setMode('select'); };
    const lostCapture = (event: PointerEvent) => {
      // Intentional release clears pointer first; only unexpected loss cancels.
      if (event.pointerId === pointer) cancel();
    };
    canvas.addEventListener('pointerdown', down, true);
    canvas.addEventListener('pointermove', move, true);
    canvas.addEventListener('pointerup', up, true);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('lostpointercapture', lostCapture);
    window.addEventListener('blur', cancel);
    return () => {
      canvas.removeEventListener('lostpointercapture', lostCapture);
      release();
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape);
      handlers.forEach((handler, index) => { if (enabled[index]) handler.enable(); });
      canvas.style.touchAction = previousTouchAction;
      canvas.style.cursor = previousCursor;
      restoreStoreMarker();
    };
  }, [mode, hasStoreLocation]);

  useEffect(() => {
    const map = mapRef.current;
    const selected = selectedIndex == null ? null : regionsRef.current[selectedIndex];
    if (!map || mode !== 'select' || selected?.sourceType !== 'circle' || !selected.center) return;
    const handles = ['Centro da região: arraste para mover', 'Raio da região: arraste para redimensionar'].map((label, handleIndex) => {
      const element = document.createElement('button');
      element.type = 'button'; element.title = label; element.setAttribute('aria-label', label);
      Object.assign(element.style, { width: '32px', height: '32px', border: '3px solid white', borderRadius: handleIndex ? '6px' : '50%', background: '#0284c7', boxShadow: '0 1px 6px #334155', touchAction: 'none', cursor: 'grab' });
      const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat(handleIndex ? selected.geometry.coordinates[0][0] : [selected.center!.longitude, selected.center!.latitude]).addTo(map);
      marker.on('dragstart', () => { handleDraggingRef.current = handleIndex; });
      const update = () => {
        const p = marker.getLngLat();
        setRegions((current) => current.map((region, index) => {
          if (index !== selectedIndex || !region.center) return region;
          const center = handleIndex === 0 ? { ...region.center, longitude: p.lng, latitude: p.lat } : region.center;
          const radiusMeters = handleIndex === 1 ? radiusBetween(center, p) : clampRadius(region.radiusMeters || 100);
          return { ...region, center, radiusMeters, geometry: makeCircle(center, radiusMeters) };
        }));
        setDirty(true);
      };
      marker.on('drag', update);
      marker.on('dragend', () => { handleDraggingRef.current = null; update(); });
      return marker;
    });
    circleHandlesRef.current = handles;
    return () => { handles.forEach((marker) => marker.remove()); circleHandlesRef.current = []; handleDraggingRef.current = null; };
  }, [selectedIndex, mode, hasStoreLocation, regions[selectedIndex ?? -1]?.sourceType]);

  useEffect(() => {
    const selected = selectedIndex == null ? null : regions[selectedIndex];
    if (!selected?.center) return;
    if (handleDraggingRef.current !== 0) circleHandlesRef.current[0]?.setLngLat([selected.center.longitude, selected.center.latitude]);
    if (handleDraggingRef.current !== 1) circleHandlesRef.current[1]?.setLngLat(selected.geometry.coordinates[0][0]);
  }, [regions, selectedIndex]);

  const locateStore = async () => {
    if (!hasCompleteAddress(address)) return showToast('Preencha rua, número e cidade antes de localizar a loja.', 'error');
    const requestId = ++geocodeRequestRef.current;
    const requestedAddressKey = addressKey(address);
    const isCurrent = () => requestId === geocodeRequestRef.current && requestedAddressKey === addressKey(currentAddressRef.current);
    setLoading(true);
    try {
      const result = await api.geocodeStore(address);
      if (!isCurrent()) return;
      setStoreLocation({ ...result.location, confirmed: false, addressKey: requestedAddressKey });
      setLocationFeedback(locationMessage(result.precision, result.formattedAddress, result.provider));
      mapRef.current?.flyTo({ center: [result.location.longitude, result.location.latitude], zoom: 16 });
      setDirty(true);
      showToast(result.precision === 'exact' ? 'Rua e número localizados. Confira o pino.' : 'Encontramos um ponto próximo. Ajuste o pino da loja.', 'info');
    } catch (error) {
      if (!isCurrent()) return;
      showToast(error instanceof Error ? error.message : 'Não foi possível localizar a loja.', 'error');
    } finally { if (requestId === geocodeRequestRef.current) setLoading(false); }
  };

  const updateRegion = (index: number, patch: Partial<MapRegion>) => {
    setRegions((current) => current.map((region, position) => {
      if (position !== index) return region;
      const next = { ...region, ...patch };
      if (next.sourceType === 'circle' && next.center && next.radiusMeters) next.geometry = makeCircle(next.center, next.radiusMeters);
      return next;
    }));
    setDirty(true);
  };

  const addCircle = () => {
    setDrawingPoints([]); setCircleDraft(null); setMode('circle');
  };

  const startPolygon = () => {
    setDrawingPoints([]);
    setCircleDraft(null); setMode('polygon');
    showToast('Toque no mapa para marcar os cantos da região.', 'info');
  };

  const selectRegion = (index: number) => {
    setMode('select'); setDrawingPoints([]); setCircleDraft(null);
    setSelectedIndex(index);
    const region = regions[index];
    const map = mapRef.current;
    if (!map || !region) return;
    const points = polygonVertices(region.geometry);
    if (!points.length) return;
    const bounds = points.reduce((current, point) => current.extend(point), new maplibregl.LngLatBounds(points[0], points[0]));
    map.fitBounds(bounds, { padding: 55, maxZoom: 16, duration: 450 });
  };

  const finishPolygon = () => {
    if (drawingPoints.length < 3) return showToast('Marque pelo menos 3 pontos no mapa.', 'error');
    const geometry: DeliveryPolygonGeometry = { type: 'Polygon', coordinates: [[...drawingPoints, drawingPoints[0]]] };
    const region: DeliveryRegionInput = { name: `Região ${regions.length + 1}`, sourceType: 'polygon', geometry, feeCents: 500, deliveryTimeMin: 30, deliveryTimeMax: 50, blocked: false, active: true, priority: regions.length };
    setRegions((current) => [...current, region]);
    setSelectedIndex(regions.length);
    setDrawingPoints([]);
    setMode('select');
    setDirty(true);
  };

  const reorder = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= regions.length) return;
    setRegions((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next.map((region, position) => ({ ...region, priority: position })); });
    setSelectedIndex((selected) => selected === index ? target : selected === target ? index : selected);
    setDirty(true);
  };

  const test = async () => {
    if (!storeLocation || !testAddress.street.trim() || !testAddress.number.trim() || !testAddress.city.trim()) {
      setTestResult('Informe rua, número e cidade para testar. O CEP pode ser geral da cidade.');
      return;
    }
    try {
      const result = await api.testDeliveryRegions({ storeLocation, regions, address: testAddress });
      testMarkerRef.current?.remove();
      if (mapRef.current) {
        testMarkerRef.current = new maplibregl.Marker({ color: '#7c3aed' })
          .setLngLat([result.location.longitude, result.location.latitude])
          .addTo(mapRef.current);
      }
      mapRef.current?.flyTo({ center: [result.location.longitude, result.location.latitude], zoom: 16 });
      const precisionLabel = ['confirmed', 'exact'].includes(result.precision) ? '' : 'Localização aproximada. ';
      if (!result.result.matched) {
        setTestResult(`${precisionLabel}Este endereço está fora das áreas cadastradas.`);
      } else if (result.result.blocked) {
        setTestResult(`${precisionLabel}Entrega bloqueada pela região “${result.result.regionName}”.`);
      } else {
        const fee = `R$ ${((result.result.feeCents || 0) / 100).toFixed(2).replace('.', ',')}`;
        const time = result.result.deliveryTimeMin != null && result.result.deliveryTimeMax != null
          ? ` • ${timeLabel}: ${result.result.deliveryTimeMin}-${result.result.deliveryTimeMax} min`
          : '';
        setTestResult(`${precisionLabel}Atendido por “${result.result.regionName}” • ${fee}${time}`);
      }
    } catch (error) { setTestResult(error instanceof Error ? error.message : 'Falha no teste'); }
  };

  const updateTestPostalCode = async (value: string) => {
    const postalCode = formatPostalCode(value);
    const digits = postalCode.replace(/\D/g, '');
    const requestId = ++postalCodeRequestRef.current;
    setTestAddress((current) => ({ ...current, postalCode, street: '', number: '', district: '', city: '', state: '' }));
    setPostalCodeFeedback('');
    setTestResult('');
    if (digits.length !== 8) {
      setLookingUpPostalCode(false);
      return;
    }

    setLookingUpPostalCode(true);
    setPostalCodeFeedback('Buscando endereço...');
    try {
      const result = await api.lookupDeliveryPostalCode(digits);
      if (requestId !== postalCodeRequestRef.current) return;
      setTestAddress((current) => ({
        ...current,
        postalCode: result.address.postalCode,
        street: result.address.street,
        district: result.address.district,
        city: result.address.city,
        state: result.address.state,
      }));
      setPostalCodeFeedback(result.address.street
        ? `${result.address.city} - ${result.address.state}. Agora informe somente o número.`
        : result.address.scope === 'district'
          ? `Este CEP abrange o bairro ${result.address.district}. Digite a rua e o número.`
          : `Este é um CEP geral de ${result.address.city} - ${result.address.state}. Digite rua, bairro e número.`);
      window.setTimeout(() => (result.address.street ? numberInputRef : streetInputRef).current?.focus(), 0);
    } catch (error) {
      if (requestId !== postalCodeRequestRef.current) return;
      setPostalCodeFeedback(error instanceof Error ? error.message : 'Não foi possível consultar o CEP.');
    } finally {
      if (requestId === postalCodeRequestRef.current) setLookingUpPostalCode(false);
    }
  };

  if (loading && !storeLocation) return <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Carregando configuração do mapa...</div>;
  if (!storeLocation) return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 text-center">
      <MapPin className="mx-auto h-8 w-8 text-emerald-600" />
      <h4 className="mt-2 text-sm font-bold text-slate-900">Primeiro, confirme onde fica sua loja</h4>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">Usaremos o endereço preenchido acima. Depois você poderá ajustar o pino antes de desenhar as áreas.</p>
      <button type="button" onClick={locateStore} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"><LocateFixed className="h-4 w-4" /> Localizar no mapa</button>
    </div>
  );

  const selected = selectedIndex == null ? null : regions[selectedIndex];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><strong>Prioridade:</strong> vence a primeira região ativa da lista que contém o ponto. Vermelho: bloqueada; amarelo: entrega; cinza: inativa; contorno verde: selecionada. Coloque bloqueios acima das áreas que devem bloquear.</div>
      {mode !== 'select' && <div role="status" className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">{mode === 'circle' ? `Pressione no centro desejado, arraste e solte. Raio: ${((circleDraft?.radiusMeters || 100) / 1000).toFixed(2)} km (0,1 a 150 km).` : mode === 'inspect' ? 'Toque em um ponto para consultar as regras do rascunho, sem mudar a seleção.' : 'Toque para adicionar vértices. Conclua com pelo menos três pontos.'}<button type="button" onClick={() => { setMode('select'); setDrawingPoints([]); setCircleDraft(null); }} className="ml-3 min-h-11 underline">Cancelar / sair (Esc)</button></div>}
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><p>O pino verde representa a loja. Confira o endereço no mapa e arraste o pino até a entrada correta antes de publicar as regiões.</p></div>
      {locationFeedback && <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">{locationFeedback}</div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.75fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
          <div ref={containerRef} className="h-[360px] w-full sm:h-[470px]" />
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-3">
            {(!storeLocation.confirmed || storeLocation.addressKey !== addressKey(address)) && <button type="button" onClick={() => { setStoreLocation((current) => current ? { ...current, confirmed: true, addressKey: addressKey(address) } : current); setLocationFeedback('Posição confirmada para o endereço atual.'); setDirty(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white"><LocateFixed className="h-4 w-4" /> Confirmar posição da loja</button>}
            <button type="button" onClick={locateStore} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><MapPin className="h-4 w-4" /> Localizar pelo endereço</button>
            <button type="button" onClick={addCircle} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Circle className="h-4 w-4" /> Área circular</button>
            {!isDrawing ? <button type="button" onClick={startPolygon} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Pentagon className="h-4 w-4" /> Desenhar polígono</button> : <>
              <button type="button" onClick={() => setDrawingPoints((points) => points.slice(0, -1))} disabled={!drawingPoints.length} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"><Undo2 className="h-4 w-4" /> Desfazer ponto</button>
              <button type="button" onClick={() => setDrawingPoints([])} disabled={!drawingPoints.length} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"><RotateCcw className="h-4 w-4" /> Reiniciar</button>
              <button type="button" onClick={finishPolygon} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white"><Check className="h-4 w-4" /> Concluir</button>
              <button type="button" onClick={() => { setDrawingPoints([]); setMode('select'); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><X className="h-4 w-4" /> Cancelar</button>
            </>}
            <button type="button" onClick={() => { setMode('inspect'); setDrawingPoints([]); setCircleDraft(null); }} className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-bold">Consultar ponto</button>
            <a href="https://locationiq.com" target="_blank" rel="noreferrer" className="ml-auto text-[10px] font-semibold text-slate-400 underline hover:text-slate-600">Search by LocationIQ.com</a>
          </div>
        </div>

        <div className="space-y-3">
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {regions.map((region, index) => <div key={`${region.id || 'new'}-${index}`} className={`flex w-full items-center gap-2 rounded-xl border p-2 text-left ${selectedIndex === index ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
              <button type="button" onClick={() => selectRegion(index)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${region.blocked ? 'bg-rose-600' : 'bg-amber-500'}`}>{index + 1}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-900">{region.name}</span><span className="text-[10px] text-slate-500">{!region.active ? 'Inativa • ' : ''}{region.blocked ? 'Não entregar' : `R$ ${(region.feeCents / 100).toFixed(2)}`}</span></span>
              </button>
              <button type="button" aria-label={`Aumentar prioridade de ${region.name}`} disabled={index === 0} onClick={() => reorder(index, -1)} className="flex h-11 w-11 items-center justify-center text-slate-600 disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label={`Diminuir prioridade de ${region.name}`} disabled={index === regions.length - 1} onClick={() => reorder(index, 1)} className="flex h-11 w-11 items-center justify-center text-slate-600 disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
            </div>)}
            {!regions.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">Crie uma área circular ou desenhe um polígono no mapa.</p>}
          </div>

          {selected && selectedIndex != null && <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2"><input value={selected.name} onChange={(event) => updateRegion(selectedIndex, { name: event.target.value })} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-xs font-bold" /><button type="button" onClick={() => { setRegions((current) => current.filter((_, index) => index !== selectedIndex).map((region, index) => ({ ...region, priority: index }))); setSelectedIndex(null); setDirty(true); }} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div>
            {selected.sourceType === 'circle' && <label className="block text-[11px] font-semibold text-slate-700">Raio (km)<input type="number" min="0.1" max="150" step="0.1" value={(selected.radiusMeters || 0) / 1000} onChange={(event) => updateRegion(selectedIndex, { radiusMeters: clampRadius(Number(event.target.value) * 1000) })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-xs" /><span className="mt-2 block">Arraste a alça azul redonda para mover o centro e a quadrada para ajustar o raio. O pino verde da loja não muda.</span></label>}
            <label className="flex min-h-11 items-center justify-between text-xs font-bold">Região ativa<input type="checkbox" checked={selected.active} onChange={(event) => updateRegion(selectedIndex, { active: event.target.checked })} /></label>
            <label className="block text-xs font-semibold">Observações (até 500 caracteres)<textarea maxLength={500} value={selected.notes || ''} onChange={(event) => updateRegion(selectedIndex, { notes: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" rows={3} /></label>
            <p className="text-xs font-semibold text-slate-700">{timeLabel} da região (mínimo e máximo em minutos; ambos vazios usam o prazo global){estimateMode === 'preparo_deslocamento' ? '. O preparo é somado separadamente.' : '.'}</p>
            {selected.sourceType === 'polygon' && <div className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900"><MousePointer2 className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Edite direto no mapa:</strong> arraste qualquer ponto azul do contorno. A área é atualizada sem precisar redesenhar.</p></div>}
            <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs font-bold text-slate-800"><span className="flex items-center gap-2"><Ban className="h-4 w-4 text-rose-500" /> Bloquear entregas nesta área</span><input type="checkbox" checked={selected.blocked} onChange={(event) => updateRegion(selectedIndex, { blocked: event.target.checked, feeCents: event.target.checked ? 0 : selected.feeCents })} /></label>
            {!selected.blocked && <div className="grid grid-cols-3 gap-2"><label className="text-[10px] font-semibold text-slate-600">Taxa (R$)<input type="number" min="0" step="0.5" value={selected.feeCents / 100} onChange={(event) => updateRegion(selectedIndex, { feeCents: Math.round(Number(event.target.value) * 100) })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label><label className="text-[10px] font-semibold text-slate-600">Mín. (min)<input type="number" min="0" value={selected.deliveryTimeMin ?? ''} onChange={(event) => updateRegion(selectedIndex, { deliveryTimeMin: event.target.value === '' ? undefined : Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label><label className="text-[10px] font-semibold text-slate-600">Máx. (min)<input type="number" min="0" value={selected.deliveryTimeMax ?? ''} onChange={(event) => updateRegion(selectedIndex, { deliveryTimeMax: event.target.value === '' ? undefined : Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label></div>}
          </div>}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className="text-sm font-bold">Taxas e {timeLabel.toLowerCase()} em todas as regiões</h4>
        <p className="text-xs text-slate-600">Campos vazios mantêm o valor atual. Taxas de áreas bloqueadas ou inativas não são alteradas. Os tempos incluem inativas. Nada é publicado nesta etapa.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{([['fee', 'Taxa (R$)'], ['min', `${timeLabel} mínimo (min)`], ['max', `${timeLabel} máximo (min)`]] as const).map(([key, label]) => <label key={key} className="text-xs">{label}<input type="number" min="0" step={key === 'fee' ? '0.01' : '1'} value={bulk[key]} onChange={(event) => { setBulk({ ...bulk, [key]: event.target.value }); setBulkPreview(null); }} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>)}</div>
        <button type="button" disabled={!regions.length || !Object.values(bulk).some((value) => value !== '')} onClick={() => {
          try {
            const patch = { ...(bulk.fee !== '' ? { feeCents: Math.round(Number(bulk.fee) * 100) } : {}), ...(bulk.min !== '' ? { deliveryTimeMin: Number(bulk.min) } : {}), ...(bulk.max !== '' ? { deliveryTimeMax: Number(bulk.max) } : {}) };
            setBulkPreview({ source: regions, next: previewMapBulk(regions, patch) });
          } catch (error) { showToast(error instanceof Error ? error.message : 'Valores inválidos.', 'error'); }
        }} className="min-h-11 rounded-lg border px-3 text-xs font-bold disabled:opacity-50">Ver prévia</button>
        {bulkPreview && <div className="space-y-2 rounded-xl bg-amber-50 p-3">
          <div className="max-h-52 overflow-auto">{bulkPreview.next.map((region, index) => <p key={index} className="py-1 text-xs">{region.name}: {region.blocked || !region.active ? 'bloqueada/inativa, taxa preservada' : `R$ ${(bulkPreview.source[index].feeCents / 100).toFixed(2)} → R$ ${(region.feeCents / 100).toFixed(2)}`} • {timeLabel}: {bulkPreview.source[index].deliveryTimeMin}-{bulkPreview.source[index].deliveryTimeMax} → {region.deliveryTimeMin}-{region.deliveryTimeMax} min</p>)}</div>
          {bulkPreview.source !== regions && <p role="alert" className="text-xs">O rascunho mudou. Gere outra prévia.</p>}
          <button type="button" disabled={bulkPreview.source !== regions} onClick={() => { setRegions(bulkPreview.next); setDirty(true); setBulkPreview(null); }} className="min-h-11 rounded-lg bg-amber-700 px-3 text-xs font-bold text-white disabled:opacity-50">Confirmar no rascunho</button>
          <button type="button" onClick={() => setBulkPreview(null)} className="ml-2 min-h-11 px-3 text-xs">Cancelar</button>
        </div>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)_100px_minmax(140px,.7fr)]">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">CEP<input value={testAddress.postalCode} onChange={(event) => void updateTestPostalCode(event.target.value)} inputMode="numeric" autoComplete="postal-code" maxLength={9} placeholder="00000-000" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal" /></label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Rua ou avenida<input ref={streetInputRef} value={testAddress.street} onChange={(event) => setTestAddress((current) => ({ ...current, street: event.target.value }))} placeholder={lookingUpPostalCode ? 'Buscando...' : 'Preenchida pelo CEP ou digitada manualmente'} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal" /></label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Número<input ref={numberInputRef} value={testAddress.number} onChange={(event) => setTestAddress((current) => ({ ...current, number: event.target.value }))} placeholder="120" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal" /></label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Bairro<input value={testAddress.district} onChange={(event) => setTestAddress((current) => ({ ...current, district: event.target.value }))} placeholder={lookingUpPostalCode ? 'Buscando...' : 'Preenchido pelo CEP'} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal" /></label>
          </div>
          <button type="button" onClick={test} disabled={lookingUpPostalCode} className="h-10 shrink-0 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 disabled:cursor-wait disabled:opacity-50">{lookingUpPostalCode ? 'Buscando CEP...' : 'Teste do mapa'}</button>
        </div>
        {postalCodeFeedback && <p aria-live="polite" className="mt-2 text-[11px] font-medium text-slate-600">{postalCodeFeedback}</p>}
        <p className="mt-2 text-[11px] text-slate-500">Teste somente das regiões do mapa, sem considerar a prioridade dos bairros. O ponto testado aparece em roxo no mapa. Assim você confere visualmente qual região será aplicada.</p>
        {testResult && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{testResult}</p>}
      </div>
      <p role="status" className="text-xs text-slate-600">{dirty ? 'Rascunho do mapa alterado. Use Salvar alterações para aplicar junto com a loja.' : 'O mapa é salvo junto com as configurações da loja.'}</p>
    </div>
  );
}
