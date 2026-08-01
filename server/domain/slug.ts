export const RESERVED_SLUGS = new Set([
  'api', 'admin', 'master', 'login', 'logout', 'cadastro', 'register', 'app',
  'assets', 'static', 'suporte', 'health', 'ready', 'status', 'docs',
  'favicon.ico', 'robots.txt',
]);

export function normalizeSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 63);
}

export function assertAvailableSlug(value: string): string {
  const slug = normalizeSlug(value);
  if (slug.length < 3) throw new Error('Slug deve ter entre 3 e 63 caracteres.');
  if (RESERVED_SLUGS.has(slug)) throw new Error('Slug reservado pela plataforma.');
  return slug;
}
