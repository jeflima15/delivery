export const PLATFORM_TITLE = 'Pode Vir';
export const PLATFORM_ICON = '/brand/pode-vir-mark-small.png';

export type StoreIdentity = { name: string; iconUrl: string };

export function publicStoreName(value: unknown, fallback = 'Loja na Pode Vir') {
  const name = typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, 120) : '';
  return name || fallback;
}

/** Same allowlist for sharing and tab identity. Never fetch an arbitrary URL. */
export function publicImageUrl(value: unknown, origin: string, storageOrigin: string | null): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value, origin);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.origin === origin && url.pathname.startsWith('/brand/')) return url.href;
    if (url.protocol === 'https:' && url.origin === storageOrigin && /^\/storage\/v1\/object\/public\/(produtos|loja)\//.test(url.pathname)) return url.href;
  } catch { /* Private, signed and invalid images use the platform fallback. */ }
  return null;
}

export function publicStoreIdentity(input: {
  name: unknown; logo: unknown; origin: string | null; storageOrigin: string | null; updatedAt?: unknown;
}): StoreIdentity {
  const name = publicStoreName(input.name);
  const logo = input.origin ? publicImageUrl(input.logo, input.origin, input.storageOrigin) : null;
  if (!logo) return { name, iconUrl: PLATFORM_ICON };
  const url = new URL(logo);
  // Uploads already use a new UUID. This also refreshes legacy same-path logos
  // after settings are saved, without cache-busting on every request.
  const version = input.updatedAt instanceof Date ? input.updatedAt.getTime()
    : typeof input.updatedAt === 'string' ? Date.parse(input.updatedAt) : NaN;
  if (Number.isFinite(version)) url.searchParams.set('v', String(version));
  return { name, iconUrl: url.href };
}
