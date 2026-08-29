function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp('(?:^|; )' + encodeURIComponent(name).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

type SessionScope = 'master' | 'tenant' | 'customer';

const csrfTokensInMemory: Partial<Record<SessionScope, string>> = {};
const refreshPromises: Partial<Record<'master' | 'tenant', Promise<boolean>>> = {};
const csrfPromises: Partial<Record<SessionScope, Promise<string | undefined>>> = {};

function cookieName(scope: SessionScope): string {
  return scope === 'master' ? 'delivery_csrf_master' : scope === 'customer' ? 'delivery_csrf_customer' : 'delivery_csrf';
}

function scopeForPath(path: string): SessionScope {
  if (path.includes('/api/customer/')) return 'customer';
  if (path.includes('/api/master')) return 'master';
  return 'tenant';
}

export function setCsrfToken(token: unknown, scope: SessionScope = 'customer'): void {
  const normalized = typeof token === 'string' && token.length > 0 ? token : undefined;
  if (normalized) csrfTokensInMemory[scope] = normalized;
  else delete csrfTokensInMemory[scope];
}

export async function fetchFreshCsrfToken(scope: SessionScope = 'tenant'): Promise<string | undefined> {
  const token = readCookie(cookieName(scope)) || csrfTokensInMemory[scope];
  if (token) return token;

  if (csrfPromises[scope]) return csrfPromises[scope];
  csrfPromises[scope] = (async () => {
    try {
      const res = await fetch(`/api/platform/auth/csrf?scope=${scope}`, { credentials: 'include', headers: { 'x-session-scope': scope } });
      if (res.ok) {
        const data = await res.json();
        if (data?.csrfToken) {
          setCsrfToken(data.csrfToken, scope);
          return data.csrfToken;
        }
      }
    } catch {
      // ignore
    }
    return undefined;
  })().finally(() => { delete csrfPromises[scope]; });

  return csrfPromises[scope];
}

function requestPath(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.pathname;
  return input.url;
}

function isRefreshableAdminRequest(path: string): boolean {
  if (path.includes('/api/customer/') || path.includes('/api/platform/auth/refresh')) return false;
  return path.includes('/api/tenant/') || path.includes('/api/master') || path.includes('/api/platform/auth/session');
}

async function refreshAdminSession(scope: 'master' | 'tenant' = 'tenant'): Promise<boolean> {
  if (refreshPromises[scope]) return refreshPromises[scope];
  const refresh = async () => {
    let csrf = readCookie(cookieName(scope)) || csrfTokensInMemory[scope] || await fetchFreshCsrfToken(scope);
    const headers: Record<string, string> = { 'x-session-scope': scope };
    if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);
    const response = await fetch(`/api/platform/auth/refresh?scope=${scope}`, {
      method: 'POST',
      credentials: 'include',
      headers,
    }).catch(() => null);
    if (!response?.ok) return false;
    const payload = await response.json().catch(() => null);
    setCsrfToken(payload?.csrfToken || readCookie(cookieName(scope)), scope);
    return true;
  };
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  refreshPromises[scope] = (locks
    ? locks.request(`delivery-${scope}-session-refresh`, { mode: 'exclusive' }, refresh)
    : refresh()
  ).finally(() => { delete refreshPromises[scope]; });
  return refreshPromises[scope];
}

export async function refreshAdminSessionIfAvailable(scope: 'master' | 'tenant' = 'tenant'): Promise<boolean> {
  const csrf = readCookie(cookieName(scope)) || csrfTokensInMemory[scope] || await fetchFreshCsrfToken(scope);
  if (!csrf) return false;
  return refreshAdminSession(scope);
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const path = requestPath(input);
  const scope = scopeForPath(path);
  const csrfCookie = cookieName(scope);

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    let csrf = readCookie(csrfCookie) || csrfTokensInMemory[scope];
    if (!csrf) {
      csrf = await fetchFreshCsrfToken(scope);
    }
    if (csrf) headers.set('x-csrf-token', decodeURIComponent(csrf));
  }

  const retryInput = input instanceof Request ? input.clone() : input;
  if (scope !== 'customer') headers.set('x-session-scope', scope);
  const requestInit = { ...init, headers, credentials: 'include' as const };
  const response = await fetch(input, requestInit);

  // Se retornar 401 ou 403 em rota renovável, tenta refresh de sessão / CSRF e re-tenta uma vez
  if ((response.status === 401 || response.status === 403) && isRefreshableAdminRequest(path)) {
    const adminScope = scope === 'master' ? 'master' : 'tenant';
    const refreshed = await refreshAdminSession(adminScope);
    if (refreshed) {
      const retryHeaders = new Headers(init.headers);
      let newCsrf = csrfTokensInMemory[scope] || readCookie(csrfCookie);
      if (!newCsrf) newCsrf = await fetchFreshCsrfToken(scope);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && newCsrf) {
        retryHeaders.set('x-csrf-token', decodeURIComponent(newCsrf));
      }
      if (scope !== 'customer') retryHeaders.set('x-session-scope', scope);
      return fetch(retryInput, { ...init, headers: retryHeaders, credentials: 'include' });
    }
  }

  return response;
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
