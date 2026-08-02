function readCookie(name: string): string | undefined {
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie.split('; ').find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCookie('delivery_csrf');
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
