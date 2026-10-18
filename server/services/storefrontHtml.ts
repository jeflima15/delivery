import { RESERVED_SLUGS } from '../domain/slug.js';
import { PLATFORM_ICON, publicImageUrl, publicStoreIdentity } from '../../src/lib/storeIdentity.js';

export function storefrontSlug(pathname: string): string | null {
  const match = /^\/([a-z0-9][a-z0-9_-]{2,62})\/?$/.exec(pathname);
  return match && !RESERVED_SLUGS.has(match[1]) ? match[1] : null;
}

export function publicOrigin(value: string | undefined, development = false): string | null {
  try {
    const url = new URL(value || '');
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(development && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function publicText(value: unknown, fallback: string, length: number) {
  return typeof value === 'string' && value.trim() ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, length) : fallback;
}

export function renderStorefrontHtml(template: string, input: {
  slug: string; origin: string; storageOrigin: string | null;
  name: unknown; description: unknown; cover: unknown; logo: unknown; updatedAt?: unknown;
}) {
  const identity = publicStoreIdentity(input);
  const title = identity.name;
  const description = publicText(input.description, `Conheça o cardápio de ${title} na Pode Vir.`, 240);
  const image = publicImageUrl(input.cover, input.origin, input.storageOrigin) || publicImageUrl(input.logo, input.origin, input.storageOrigin) || `${input.origin}/brand/pode-vir-social.png`;
  const url = `${input.origin}/${encodeURIComponent(input.slug)}`;
  const metadata = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    ...Object.entries({ 'og:title': title, 'og:description': description, 'og:image': image, 'og:url': url, 'og:type': 'website', 'og:site_name': title, 'og:locale': 'pt_BR' })
      .map(([key, value]) => `<meta property="${key}" content="${escapeHtml(value)}" />`),
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  ].join('\n  ');
  if (!template.includes('<!--page-metadata-->') || !template.includes('<!--/page-metadata-->')) throw new Error('PAGE_METADATA_MARKERS_MISSING');
  if (!template.includes('<!--tab-icon-->') || !template.includes('<!--/tab-icon-->')) throw new Error('TAB_ICON_MARKERS_MISSING');
  // Do not declare PNG for an existing WebP/JPEG/SVG logo. The browser reads its format.
  const icon = `<link id="page-favicon" rel="icon"${identity.iconUrl === PLATFORM_ICON ? ' type="image/png"' : ''} href="${escapeHtml(identity.iconUrl)}" data-store-slug="${escapeHtml(input.slug)}" data-store-name="${escapeHtml(title)}" />`;
  return template.replace(/<!--page-metadata-->[\s\S]*?<!--\/page-metadata-->/, () => metadata)
    .replace(/<!--tab-icon-->[\s\S]*?<!--\/tab-icon-->/, () => icon);
}
