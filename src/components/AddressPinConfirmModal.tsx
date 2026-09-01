import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map, type Marker } from 'maplibre-gl';
import { MapPin, X } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DELIVERY_MAP_STYLE, installMissingMapImageFallback } from '../lib/deliveryMap';

type Location = { latitude: number; longitude: number };

export default function AddressPinConfirmModal({ isOpen, initialLocation, addressLabel, onClose, onConfirm }: { isOpen: boolean; initialLocation: Location | null; addressLabel?: string; onClose: () => void; onConfirm: (location: Location) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [location, setLocation] = useState<Location | null>(initialLocation);

  useEffect(() => { setLocation(initialLocation); }, [initialLocation]);
  useEffect(() => {
    if (!isOpen || !initialLocation || !containerRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: DELIVERY_MAP_STYLE, center: [initialLocation.longitude, initialLocation.latitude], zoom: 16, attributionControl: { compact: true } });
    installMissingMapImageFallback(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const marker = new maplibregl.Marker({ color: 'var(--store-primary, #059669)', draggable: true }).setLngLat([initialLocation.longitude, initialLocation.latitude]).addTo(map);
    marker.on('dragend', () => { const point = marker.getLngLat(); setLocation({ latitude: point.lat, longitude: point.lng }); });
    map.on('click', (event) => { marker.setLngLat(event.lngLat); setLocation({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }); });
    mapRef.current = map; markerRef.current = marker;
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [isOpen, initialLocation?.latitude, initialLocation?.longitude]);

  if (!isOpen || !initialLocation) return null;
  return <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Confirmar local de entrega">
    <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4"><div><h2 className="text-base font-bold text-slate-900">Confirme o local da entrega</h2><p className="mt-0.5 text-xs text-slate-500">O mapa fez uma aproximação. Arraste o pino até a entrada correta do imóvel.</p>{addressLabel && <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-700">{addressLabel}</p>}</div><button type="button" onClick={onClose} className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-600"><X className="h-4 w-4" /></button></div>
      <div ref={containerRef} className="h-[52dvh] min-h-80 w-full sm:h-96" />
      <div className="border-t border-slate-100 bg-white p-4"><p className="mb-3 flex items-center gap-2 text-xs text-slate-600"><MapPin className="h-4 w-4 store-text-primary" /> O frete será calculado usando este ponto.</p><button type="button" onClick={() => location && onConfirm(location)} className="h-12 w-full rounded-xl store-bg-primary text-sm font-bold store-text-on-primary">Confirmar este local</button></div>
    </div>
  </div>;
}
