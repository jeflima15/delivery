import { RESERVED_SLUGS } from '../domain/slug.js';

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

function publicImage(value: unknown, origin: string, storageOrigin: string | null): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value, origin);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.origin === origin && url.pathname.startsWith('/brand/')) return url.href;
    if (url.protocol === 'https:' && url.origin === storageOrigin && /^\/storage\/v1\/object\/public\/(produtos|loja)\//.test(url.pathname)) return url.href;
  } catch { /* Invalid or private/signed images use the neutral public fallback. */ }
  return null;
}

export function renderStorefrontHtml(template: string, input: {
  slug: string; origin: string; storageOrigin: string | null;
  name: unknown; description: unknown; cover: unknown; logo: unknown;
}) {
  const title = publicText(input.name, 'Loja na Pode Vir', 120);
  const description = publicText(input.description, `Conheça o cardápio de ${title} na Pode Vir.`, 240);
  const image = publicImage(input.cover, input.origin, input.storageOrigin) || publicImage(input.logo, input.origin, input.storageOrigin) || `${input.origin}/brand/pode-vir-social.png`;
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
  return template.replace(/<!--page-metadata-->[\s\S]*?<!--\/page-metadata-->/, () => metadata);
}
