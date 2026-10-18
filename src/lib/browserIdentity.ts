import { PLATFORM_ICON, PLATFORM_TITLE, type StoreIdentity } from './storeIdentity';

export const STORE_IDENTITY_CHANGED = 'store-identity-changed';
export type PageIdentityScope = { slug?: string; admin?: boolean; title: string };

function favicon() {
  const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')];
  const link = links.find((entry) => entry.id === 'page-favicon') || links[0] || document.createElement('link');
  for (const duplicate of links) if (duplicate !== link) duplicate.remove();
  link.id = 'page-favicon';
  link.rel = 'icon';
  if (!link.isConnected) document.head.appendChild(link);
  return link;
}

function setIcon(link: HTMLLinkElement, url: string) {
  if (link.getAttribute('href') !== url) link.setAttribute('href', url);
  if (url === PLATFORM_ICON || url.startsWith('data:image/png;')) link.type = 'image/png';
  else link.removeAttribute('type');
  link.removeAttribute('sizes');
}

/** One owner of tab identity across all routes; never changes sharing/PWA tags. */
export function installPageIdentity(scope: PageIdentityScope) {
  const link = favicon();
  const initial = scope.slug && link.dataset.storeSlug === scope.slug
    ? { name: link.dataset.storeName || PLATFORM_TITLE, iconUrl: link.getAttribute('href') || PLATFORM_ICON }
    : null;
  let disposed = false;
  let request: AbortController | undefined;
  let image: HTMLImageElement | undefined;
  let imageTimer: ReturnType<typeof setTimeout> | undefined;
  let imageSequence = 0;
  let currentLogo = '';
  let refreshSequence = 0;

  const cancelImage = () => {
    imageSequence++;
    clearTimeout(imageTimer);
    if (image) { image.onload = null; image.onerror = null; }
    image = undefined;
  };
  const title = (name: string) => scope.admin ? `Painel — ${name}` : name;
  const reset = () => {
    cancelImage(); currentLogo = '';
    document.title = scope.title;
    setIcon(link, PLATFORM_ICON);
    delete link.dataset.storeSlug; delete link.dataset.storeName;
  };
  const apply = (identity: StoreIdentity) => {
    document.title = title(identity.name);
    link.dataset.storeSlug = scope.slug;
    link.dataset.storeName = identity.name;
    if (currentLogo === identity.iconUrl) return;
    cancelImage(); currentLogo = identity.iconUrl;
    if (identity.iconUrl === PLATFORM_ICON) { setIcon(link, PLATFORM_ICON); return; }
    if (link.getAttribute('href') !== identity.iconUrl) setIcon(link, PLATFORM_ICON);
    const sequence = imageSequence;
    const candidate = new Image();
    image = candidate;
    candidate.crossOrigin = 'anonymous';
    const failed = () => {
      if (disposed || sequence !== imageSequence) return;
      cancelImage(); currentLogo = ''; setIcon(link, PLATFORM_ICON);
    };
    candidate.onerror = failed;
    candidate.onload = () => {
      if (disposed || sequence !== imageSequence) return;
      clearTimeout(imageTimer);
      if (!candidate.naturalWidth || !candidate.naturalHeight) { failed(); return; }
      let url = identity.iconUrl;
      // Normal uploads are square WebP: keep the original URL and its cache.
      // Legacy rectangular logos get transparent padding, never stretching/cropping.
      if (candidate.naturalWidth !== candidate.naturalHeight) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 64;
          const context = canvas.getContext('2d');
          if (!context) { failed(); return; }
          const scale = 64 / Math.max(candidate.naturalWidth, candidate.naturalHeight);
          const width = candidate.naturalWidth * scale;
          const height = candidate.naturalHeight * scale;
          context.drawImage(candidate, (64 - width) / 2, (64 - height) / 2, width, height);
          url = canvas.toDataURL('image/png');
        } catch { failed(); return; }
      }
      setIcon(link, url);
    };
    imageTimer = setTimeout(failed, 8_000);
    candidate.src = identity.iconUrl;
  };

  if (initial) apply(initial);
  else reset();
  if (!scope.slug) return () => { disposed = true; cancelImage(); };

  const refresh = async () => {
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const sequence = ++refreshSequence;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      // This minimal endpoint validates public image URLs on the server. It never
      // uses authenticated settings or browser-supplied identity before login.
      const response = await fetch(`/api/public/stores/${encodeURIComponent(scope.slug!)}/identity`, {
        credentials: 'omit', cache: 'no-store', signal: controller.signal,
      });
      const payload = await response.json();
      if (disposed || sequence !== refreshSequence) return;
      if (!response.ok || !payload.success || typeof payload.identity?.name !== 'string' || typeof payload.identity?.iconUrl !== 'string') { reset(); return; }
      apply(payload.identity);
    } catch {
      // A transient/offline refresh keeps only this scope's already-known public
      // identity. Entering a different scope has reset it before starting I/O.
    } finally { clearTimeout(timeout); }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
  const onChanged = (event: Event) => {
    if ((event as CustomEvent<{ slug: string }>).detail?.slug === scope.slug) void refresh();
  };
  window.addEventListener('focus', onVisible);
  window.addEventListener('pageshow', onVisible);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener(STORE_IDENTITY_CHANGED, onChanged);
  void refresh();
  return () => {
    disposed = true; request?.abort(); cancelImage();
    window.removeEventListener('focus', onVisible);
    window.removeEventListener('pageshow', onVisible);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener(STORE_IDENTITY_CHANGED, onChanged);
  };
}

export function notifyStoreIdentityChanged(slug: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STORE_IDENTITY_CHANGED, { detail: { slug } }));
}
