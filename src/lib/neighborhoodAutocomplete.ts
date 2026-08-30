export interface NeighborhoodSuggestion {
  district: string;
  city: string;
  state: string;
  tagValue: string;
  label: string;
}

const memoryCache = new Map<string, NeighborhoodSuggestion[]>();

export async function searchNeighborhoods(
  rawQuery: string,
  options: { cidade?: string; estado?: string } = {}
): Promise<NeighborhoodSuggestion[]> {
  const query = rawQuery.trim();
  if (!query || query.length < 2) return [];

  const cidade = (options.cidade || '').trim();
  const estado = (options.estado || '').trim();
  const cacheKey = `${query.toLowerCase()}__${cidade.toLowerCase()}__${estado.toLowerCase()}`;

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  const commaQuery = query.replace(/\s+/g, ', ');
  const candidates: string[] = [];

  // 1. Se informou mais de uma palavra (ex: "Centro Itatiaia" ou "Vila Nova Barra Mansa")
  if (query.includes(' ') || query.includes(',')) {
    candidates.push(`${commaQuery}, Brasil`);
    if (estado && !query.toLowerCase().includes(estado.toLowerCase())) {
      candidates.push(`${commaQuery}, ${estado}, Brasil`);
    }
  } else {
    // 2. Palavra única (ex: "Centro", "Manejo", "Jardim")
    if (cidade && estado) {
      candidates.push(`${query}, ${cidade}, ${estado}, Brasil`);
    }
    if (cidade) {
      candidates.push(`${query}, ${cidade}, Brasil`);
    }
    if (estado) {
      candidates.push(`${query}, ${estado}, Brasil`);
    }
    candidates.push(`${query}, Brasil`);
  }

  const uniqueCandidates = Array.from(new Set(candidates)).slice(0, 2);

  try {
    const fetchPromises = uniqueCandidates.map((c) =>
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&addressdetails=1&limit=5&q=${encodeURIComponent(
          c
        )}`,
        {
          headers: { 'user-agent': 'DeliverySaaS/1.0 (neighborhood autocomplete)' },
          signal: AbortSignal.timeout(4000),
        }
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
    );

    const responses = await Promise.all(fetchPromises);
    const allItems = responses.flat();

    const results: NeighborhoodSuggestion[] = [];
    const seen = new Set<string>();

    for (const item of allItems) {
      const addr = item.address || {};
      const district =
        addr.neighbourhood ||
        addr.suburb ||
        addr.quarter ||
        addr.residential ||
        addr.city_district ||
        item.name;

      const itemCity =
        addr.city ||
        addr.town ||
        addr.municipality ||
        addr.village ||
        addr.county ||
        cidade ||
        '';

      const itemState =
        (addr['ISO3166-2-lvl4'] || '').replace('BR-', '') ||
        addr.state ||
        estado ||
        '';

      if (!district || district.length < 2) continue;

      const isSameCity = Boolean(
        cidade &&
          itemCity &&
          itemCity.toLowerCase().trim() === cidade.toLowerCase().trim()
      );

      // Se for de outra cidade, adiciona a anotação da cidade entre pazênteses
      const tagValue =
        isSameCity || !itemCity
          ? district
          : `${district} (${itemCity})`;

      const key = tagValue.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          district,
          city: itemCity,
          state: itemState,
          tagValue,
          label: `${district}${itemCity ? ' — ' + itemCity : ''}${
            itemState ? ', ' + itemState : ''
          }`,
        });
      }
    }

    const finalResults = results.slice(0, 6);
    memoryCache.set(cacheKey, finalResults);
    return finalResults;
  } catch (error) {
    console.warn('Falha no autocomplete de bairros:', error);
    return [];
  }
}
