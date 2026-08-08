function readCookie(name: string): string | undefined {
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie.split('; ').find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

const csrfTokensInMemory: Partial<Record<'admin' | 'customer', string>> = {};
let adminRefreshPromise: Promise<boolean> | null = null;
let fetchCsrfPromise: Promise<string | undefined> | null = null;

export function setCsrfToken(token: unknown, scope: 'admin' | 'customer' = 'customer'): void {
  const normalized = typeof token === 'string' && token.length > 0 ? token : undefined;
  if (normalized) csrfTokensInMemory[scope] = normalized;
  else delete csrfTokensInMemory[scope];
}

export async function fetchFreshCsrfToken(scope: 'admin' | 'customer' = 'admin'): Promise<string | undefined> {
  const cookieName = scope === 'customer' ? 'delivery_csrf_customer' : 'delivery_csrf';
  let token = csrfTokensInMemory[scope] || readCookie(cookieName);
  if (token) return token;

  if (fetchCsrfPromise) return fetchCsrfPromise;
  fetchCsrfPromise = (async () => {
    try {
      const res = await fetch('/api/platform/auth/csrf', { credentials: 'include' });
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
  })().finally(() => { fetchCsrfPromise = null; });

  return fetchCsrfPromise;
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

async function refreshAdminSession(): Promise<boolean> {
  if (adminRefreshPromise) return adminRefreshPromise;
  const refresh = async () => {
    let csrf = csrfTokensInMemory.admin || readCookie('delivery_csrf');
    if (!csrf) {
      csrf = await fetchFreshCsrfToken('admin');
    }
    if (!csrf) return false;
    const response = await fetch('/api/platform/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    }).catch(() => null);
    if (!response?.ok) return false;
    const payload = await response.json().catch(() => null);
    setCsrfToken(payload?.csrfToken || readCookie('delivery_csrf'), 'admin');
    return true;
  };
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  adminRefreshPromise = (locks
    ? locks.request('delivery-admin-session-refresh', { mode: 'exclusive' }, refresh)
    : refresh()
  ).finally(() => { adminRefreshPromise = null; });
  return adminRefreshPromise;
}

export async function refreshAdminSessionIfAvailable(): Promise<boolean> {
  const csrf = csrfTokensInMemory.admin || readCookie('delivery_csrf') || await fetchFreshCsrfToken('admin');
  if (!csrf) return false;
  return refreshAdminSession();
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const path = requestPath(input);
  const scope = path.includes('/api/customer/') ? 'customer' : 'admin';
  const csrfCookie = scope === 'customer' ? 'delivery_csrf_customer' : 'delivery_csrf';

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    let csrf = csrfTokensInMemory[scope] || readCookie(csrfCookie);
    if (!csrf) {
      csrf = await fetchFreshCsrfToken(scope);
    }
    if (csrf) headers.set('x-csrf-token', decodeURIComponent(csrf));
  }

  const retryInput = input instanceof Request ? input.clone() : input;
  const requestInit = { ...init, headers, credentials: 'include' as const };
  const response = await fetch(input, requestInit);

  // Se retornar 401 ou 403 em rota renovável, tenta refresh de sessão / CSRF e re-tenta uma vez
  if ((response.status === 401 || response.status === 403) && isRefreshableAdminRequest(path)) {
    const refreshed = await refreshAdminSession();
    if (refreshed) {
      const retryHeaders = new Headers(init.headers);
      let newCsrf = csrfTokensInMemory[scope] || readCookie(csrfCookie);
      if (!newCsrf) newCsrf = await fetchFreshCsrfToken(scope);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && newCsrf) {
        retryHeaders.set('x-csrf-token', decodeURIComponent(newCsrf));
      }
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
