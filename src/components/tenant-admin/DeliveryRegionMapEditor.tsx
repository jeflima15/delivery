import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapMouseEvent, type Marker } from 'maplibre-gl';
import circle from '@turf/circle';
import { ArrowDown, ArrowUp, Ban, Check, Circle, LocateFixed, MapPin, MousePointer2, Pentagon, RotateCcw, Save, Trash2, Undo2, X } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTenantAdminApi } from './TenantAdminContext';
import { useToast } from '../Toast';
import type { DeliveryPolygonGeometry, DeliveryRegionInput, StoreLocation } from '../../types/deliveryRegions';
import { DELIVERY_MAP_STYLE, installMissingMapImageFallback } from '../../lib/deliveryMap';

type Props = {
  address: { postalCode?: string; street: string; number?: string; district?: string; city: string; state?: string };
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
  return address.postalCode?.replace(/\D/g, '').length === 8
    && Boolean(address.street.trim())
    && Boolean(address.number?.trim())
    && Boolean(address.city.trim());
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function locationMessage(precision: string, formattedAddress: string, provider: string) {
  if (precision === 'exact') return `Rua e número encontrados: ${formattedAddress}. Confira o pino antes de confirmar.`;
  const level = precision === 'street' ? 'a rua' : precision === 'district' ? 'o bairro' : 'a região do CEP';
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

export default function DeliveryRegionMapEditor({ address }: Props) {
  const api = useTenantAdminApi();
  const { showToast } = useToast();
  const initialAddressRef = useRef(address);
  const currentAddressRef = useRef(address);
  currentAddressRef.current = address;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const testMarkerRef = useRef<Marker | null>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const postalCodeRequestRef = useRef(0);
  const vertexMarkersRef = useRef<Marker[]>([]);
  const drawingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeLocation, setStoreLocation] = useState<StoreLocation | null>(null);
  const [regions, setRegions] = useState<DeliveryRegionInput[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [testAddress, setTestAddress] = useState({ postalCode: '', street: '', number: '', district: '', city: '', state: '' });
  const [lookingUpPostalCode, setLookingUpPostalCode] = useState(false);
  const [postalCodeFeedback, setPostalCodeFeedback] = useState('');
  const [testResult, setTestResult] = useState<string>('');
  const [locationFeedback, setLocationFeedback] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await api.getDeliveryRegions();
        if (!active) return;
        setRegions((data.regions || []).map((region, index) => ({ ...region, priority: index })));
        const initialAddress = initialAddressRef.current;
        const currentAddressKey = addressKey(initialAddress);
        if (isValidLocation(data.storeLocation) && data.storeLocation.confirmed && data.storeLocation.addressKey === currentAddressKey) {
          setStoreLocation(data.storeLocation);
        } else if (hasCompleteAddress(initialAddress)) {
          const result = await api.geocodeStore(initialAddress);
          if (!active) return;
          setStoreLocation({ ...result.location, confirmed: false, addressKey: currentAddressKey });
          setLocationFeedback(locationMessage(result.precision, result.formattedAddress, result.provider));
          setDirty(true);
          showToast('Localizamos o endereço cadastrado. Confira o pino antes de publicar.', 'info');
        } else {
          setLocationFeedback('Preencha o CEP e o número da loja para localizá-la no mapa.');
        }
      } catch (error) {
        if (active) showToast(error instanceof Error ? error.message : 'Erro ao carregar regiões.', 'error');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [api, showToast]);

  useEffect(() => { drawingRef.current = isDrawing; }, [isDrawing]);

  useEffect(() => {
    if (loading) return;
    const currentAddressKey = addressKey(address);
    if (storeLocation?.addressKey === currentAddressKey) return;
    if (!hasCompleteAddress(address)) {
      setStoreLocation((current) => current?.confirmed ? { ...current, confirmed: false } : current);
      setLocationFeedback('Endereço alterado. Preencha o CEP e o número para buscar a nova posição.');
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.geocodeStore(address);
        setStoreLocation({ ...result.location, confirmed: false, addressKey: currentAddressKey });
        setLocationFeedback(locationMessage(result.precision, result.formattedAddress, result.provider));
        mapRef.current?.flyTo({ center: [result.location.longitude, result.location.latitude], zoom: 16 });
        setDirty(true);
        showToast('Endereço alterado. Confira e confirme a nova posição da loja.', 'info');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Não foi possível atualizar a localização da loja.', 'error');
      }
    }, 700);
    return () => window.clearTimeout(timer);
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
      map.addLayer({ id: 'delivery-region-fill', type: 'fill', source: 'delivery-regions', paint: { 'fill-color': ['case', ['get', 'draft'], '#0ea5e9', ['get', 'selected'], '#059669', ['get', 'blocked'], '#e11d48', '#f59e0b'], 'fill-opacity': 0.22 } });
      map.addLayer({ id: 'delivery-region-line', type: 'line', source: 'delivery-regions', paint: { 'line-color': ['case', ['get', 'draft'], '#0284c7', ['get', 'selected'], '#047857', ['get', 'blocked'], '#be123c', '#d97706'], 'line-width': ['case', ['get', 'selected'], 4, 2] } });
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
    if (!map?.isStyleLoaded()) return;
    const features: any[] = regions.map((region, index) => ({ type: 'Feature', properties: { regionIndex: index, selected: selectedIndex === index, blocked: region.blocked }, geometry: region.geometry }));
    if (drawingPoints.length) {
      const coordinates = drawingPoints.length > 2 ? [...drawingPoints, drawingPoints[0]] : drawingPoints;
      features.push({ type: 'Feature', properties: { draft: true }, geometry: drawingPoints.length > 2 ? { type: 'Polygon', coordinates: [coordinates] } : { type: 'LineString', coordinates } });
    }
    (map.getSource('delivery-regions') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }, [regions, selectedIndex, drawingPoints]);

  useEffect(() => {
    vertexMarkersRef.current.forEach((marker) => marker.remove());
    vertexMarkersRef.current = [];
    const map = mapRef.current;
    if (!map) return;

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
  }, [drawingPoints, isDrawing, regions, selectedIndex]);

  const locateStore = async () => {
    if (!hasCompleteAddress(address)) return showToast('Preencha CEP, rua, número e cidade antes de localizar a loja.', 'error');
    setLoading(true);
    try {
      const result = await api.geocodeStore(address);
      setStoreLocation({ ...result.location, confirmed: false, addressKey: addressKey(address) });
      setLocationFeedback(locationMessage(result.precision, result.formattedAddress, result.provider));
      mapRef.current?.flyTo({ center: [result.location.longitude, result.location.latitude], zoom: 16 });
      setDirty(true);
      showToast(result.precision === 'exact' ? 'Rua e número localizados. Confira o pino.' : 'Encontramos um ponto próximo. Ajuste o pino da loja.', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível localizar a loja.', 'error');
    } finally { setLoading(false); }
  };

  const updateRegion = (index: number, patch: Partial<DeliveryRegionInput>) => {
    setRegions((current) => current.map((region, position) => {
      if (position !== index) return region;
      const next = { ...region, ...patch };
      if (next.sourceType === 'circle' && next.center && next.radiusMeters) next.geometry = makeCircle(next.center, next.radiusMeters);
      return next;
    }));
    setDirty(true);
  };

  const addCircle = () => {
    if (!storeLocation) return;
    setRegions((current) => [...current, blankRegion(storeLocation, current.length)]);
    setSelectedIndex(regions.length);
    setDirty(true);
  };

  const startPolygon = () => {
    setDrawingPoints([]);
    setIsDrawing(true);
    showToast('Toque no mapa para marcar os cantos da região.', 'info');
  };

  const selectRegion = (index: number) => {
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
    setIsDrawing(false);
    setDirty(true);
  };

  const reorder = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= regions.length) return;
    setRegions((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next.map((region, position) => ({ ...region, priority: position })); });
    setSelectedIndex(target);
    setDirty(true);
  };

  const publish = async () => {
    if (!storeLocation || !regions.length) return showToast('Confirme a loja e crie ao menos uma região.', 'error');
    if (storeLocation.addressKey !== addressKey(address)) return showToast('Localize e confirme novamente a loja após alterar o endereço.', 'error');
    if (!storeLocation.confirmed) return showToast('Confirme a posição da loja no mapa antes de publicar.', 'error');
    setSaving(true);
    try {
      const result = await api.saveDeliveryRegions({ storeLocation, regions: regions.map((region, priority) => ({ ...region, priority })) });
      setRegions(result.regions);
      setDirty(false);
      showToast('Regiões publicadas com segurança.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao publicar regiões.', 'error'); }
    finally { setSaving(false); }
  };

  const test = async () => {
    if (!storeLocation || !testAddress.street.trim() || !testAddress.number.trim() || !testAddress.city.trim()) {
      setTestResult('Informe um CEP válido e o número para testar.');
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
          ? ` • ${result.result.deliveryTimeMin}-${result.result.deliveryTimeMax} min`
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
        : `CEP de ${result.address.city} - ${result.address.state}. Complete a rua e o número.`);
      window.setTimeout(() => numberInputRef.current?.focus(), 0);
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
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><strong>Prioridade:</strong> quando áreas se sobrepõem, a primeira da lista é aplicada. Áreas bloqueadas devem ficar no topo.</div>
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><p>O pino verde representa a loja. Confira o endereço no mapa e arraste o pino até a entrada correta antes de publicar as regiões.</p></div>
      {locationFeedback && <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">{locationFeedback}</div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.75fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
          <div ref={containerRef} className="h-[360px] w-full sm:h-[470px]" />
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-3">
            {!storeLocation.confirmed && <button type="button" onClick={() => { setStoreLocation((current) => current ? { ...current, confirmed: true, addressKey: addressKey(address) } : current); setLocationFeedback('Posição confirmada para o endereço atual.'); setDirty(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white"><LocateFixed className="h-4 w-4" /> Confirmar posição da loja</button>}
            <button type="button" onClick={locateStore} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><MapPin className="h-4 w-4" /> Localizar pelo endereço</button>
            <button type="button" onClick={addCircle} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Circle className="h-4 w-4" /> Área circular</button>
            {!isDrawing ? <button type="button" onClick={startPolygon} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Pentagon className="h-4 w-4" /> Desenhar polígono</button> : <>
              <button type="button" onClick={() => setDrawingPoints((points) => points.slice(0, -1))} disabled={!drawingPoints.length} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"><Undo2 className="h-4 w-4" /> Desfazer ponto</button>
              <button type="button" onClick={() => setDrawingPoints([])} disabled={!drawingPoints.length} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"><RotateCcw className="h-4 w-4" /> Reiniciar</button>
              <button type="button" onClick={finishPolygon} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white"><Check className="h-4 w-4" /> Concluir</button>
              <button type="button" onClick={() => { setDrawingPoints([]); setIsDrawing(false); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><X className="h-4 w-4" /> Cancelar</button>
            </>}
            <a href="https://locationiq.com" target="_blank" rel="noreferrer" className="ml-auto text-[10px] font-semibold text-slate-400 underline hover:text-slate-600">Search by LocationIQ.com</a>
          </div>
        </div>

        <div className="space-y-3">
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {regions.map((region, index) => <button key={`${region.id || 'new'}-${index}`} type="button" onClick={() => selectRegion(index)} className={`flex w-full items-center gap-2 rounded-xl border p-3 text-left ${selectedIndex === index ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${region.blocked ? 'bg-rose-600' : 'bg-amber-500'}`}>{index + 1}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-900">{region.name}</span><span className="text-[10px] text-slate-500">{region.blocked ? 'Não entregar' : `R$ ${(region.feeCents / 100).toFixed(2)}`}</span></span>
              <span className="flex"><span onClick={(event) => { event.stopPropagation(); reorder(index, -1); }} className="p-1 text-slate-400"><ArrowUp className="h-3.5 w-3.5" /></span><span onClick={(event) => { event.stopPropagation(); reorder(index, 1); }} className="p-1 text-slate-400"><ArrowDown className="h-3.5 w-3.5" /></span></span>
            </button>)}
            {!regions.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">Crie uma área circular ou desenhe um polígono no mapa.</p>}
          </div>

          {selected && selectedIndex != null && <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2"><input value={selected.name} onChange={(event) => updateRegion(selectedIndex, { name: event.target.value })} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-xs font-bold" /><button type="button" onClick={() => { setRegions((current) => current.filter((_, index) => index !== selectedIndex).map((region, index) => ({ ...region, priority: index }))); setSelectedIndex(null); setDirty(true); }} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div>
            {selected.sourceType === 'circle' && <label className="block text-[11px] font-semibold text-slate-700">Raio (km)<input type="number" min="0.1" max="150" step="0.1" value={(selected.radiusMeters || 0) / 1000} onChange={(event) => updateRegion(selectedIndex, { radiusMeters: Math.max(100, Math.round(Number(event.target.value) * 1000)) })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-xs" /></label>}
            {selected.sourceType === 'polygon' && <div className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900"><MousePointer2 className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Edite direto no mapa:</strong> arraste qualquer ponto azul do contorno. A área é atualizada sem precisar redesenhar.</p></div>}
            <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs font-bold text-slate-800"><span className="flex items-center gap-2"><Ban className="h-4 w-4 text-rose-500" /> Bloquear entregas nesta área</span><input type="checkbox" checked={selected.blocked} onChange={(event) => updateRegion(selectedIndex, { blocked: event.target.checked, feeCents: event.target.checked ? 0 : selected.feeCents })} /></label>
            {!selected.blocked && <div className="grid grid-cols-3 gap-2"><label className="text-[10px] font-semibold text-slate-600">Taxa (R$)<input type="number" min="0" step="0.5" value={selected.feeCents / 100} onChange={(event) => updateRegion(selectedIndex, { feeCents: Math.round(Number(event.target.value) * 100) })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label><label className="text-[10px] font-semibold text-slate-600">Mín. (min)<input type="number" min="0" value={selected.deliveryTimeMin} onChange={(event) => updateRegion(selectedIndex, { deliveryTimeMin: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label><label className="text-[10px] font-semibold text-slate-600">Máx. (min)<input type="number" min="0" value={selected.deliveryTimeMax} onChange={(event) => updateRegion(selectedIndex, { deliveryTimeMax: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label></div>}
          </div>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)_100px_minmax(140px,.7fr)]">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">CEP<input value={testAddress.postalCode} onChange={(event) => void updateTestPostalCode(event.target.value)} inputMode="numeric" autoComplete="postal-code" maxLength={9} placeholder="00000-000" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal" /></label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Rua ou avenida<input value={testAddress.street} onChange={(event) => setTestAddress((current) => ({ ...current, street: event.target.value }))} placeholder={lookingUpPostalCode ? 'Buscando...' : 'Preenchida pelo CEP'} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal" /></label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Número<input ref={numberInputRef} value={testAddress.number} onChange={(event) => setTestAddress((current) => ({ ...current, number: event.target.value }))} placeholder="120" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal" /></label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Bairro<input value={testAddress.district} onChange={(event) => setTestAddress((current) => ({ ...current, district: event.target.value }))} placeholder={lookingUpPostalCode ? 'Buscando...' : 'Preenchido pelo CEP'} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal" /></label>
          </div>
          <button type="button" onClick={test} disabled={lookingUpPostalCode} className="h-10 shrink-0 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 disabled:cursor-wait disabled:opacity-50">{lookingUpPostalCode ? 'Buscando CEP...' : 'Localizar e testar'}</button>
        </div>
        {postalCodeFeedback && <p aria-live="polite" className="mt-2 text-[11px] font-medium text-slate-600">{postalCodeFeedback}</p>}
        <p className="mt-2 text-[11px] text-slate-500">O ponto testado aparece em roxo no mapa. Assim você confere visualmente qual região será aplicada.</p>
        {testResult && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{testResult}</p>}
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-600">{dirty ? 'Há alterações no mapa que ainda não atendem clientes.' : 'As áreas exibidas estão publicadas.'}</p><button type="button" onClick={publish} disabled={saving || !regions.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? 'Publicando...' : 'Publicar regiões'}</button></div>
    </div>
  );
}
