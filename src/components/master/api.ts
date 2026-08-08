import { apiFetch, readJson } from '../../lib/api';

export class MasterApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function masterRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(`/api/master${path}`, init);
  if (response.status === 401) throw new MasterApiError('Sua sessão expirou. Entre novamente.', response.status);
  try { return await readJson<T>(response); }
  catch (error) { throw new MasterApiError(error instanceof Error ? error.message : 'Não foi possível concluir a operação.', response.status); }
}

export function jsonInit(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export function queryString(values: Record<string, string | number | boolean | undefined | null>): string {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') query.set(key, String(value)); });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}
