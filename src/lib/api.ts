function readCookie(name: string): string | undefined {
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie.split('; ').find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

const csrfTokensInMemory: Partial<Record<'admin' | 'customer', string>> = {};

export function setCsrfToken(token: unknown, scope: 'admin' | 'customer' = 'customer'): void {
  const normalized = typeof token === 'string' && token.length > 0 ? token : undefined;
  if (normalized) csrfTokensInMemory[scope] = normalized;
  else delete csrfTokensInMemory[scope];
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const scope = requestUrl.includes('/api/customer/') ? 'customer' : 'admin';
    const csrfCookie = scope === 'customer' ? 'delivery_csrf_customer' : 'delivery_csrf';
    const csrf = csrfTokensInMemory[scope] || readCookie(csrfCookie);
    if (csrf) headers.set('x-csrf-token', decodeURIComponent(csrf));
  }
  return fetch(input, { ...init, headers, credentials: 'include' });
}

export class ApiError extends Error {
  constructor(message: string, public code = 'REQUEST_FAILED', public fieldErrors: Record<string, string[]> = {}, public status = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new ApiError(data?.error?.message || data?.erro || 'Nao foi possivel concluir a operacao.', data?.error?.code, data?.error?.fieldErrors, response.status);
  return data as T;
}
