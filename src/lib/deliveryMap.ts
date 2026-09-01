import type { Map as MapLibreMap } from 'maplibre-gl';

export const DELIVERY_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

export function installMissingMapImageFallback(map: MapLibreMap) {
  map.on('styleimagemissing', (event) => {
    if (map.hasImage(event.id)) return;
    map.addImage(event.id, { width: 1, height: 1, data: new Uint8Array(4) });
  });
}
