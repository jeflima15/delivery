import { apiFetch, readJson } from '../../lib/api';

export type CustomerIntent = 'checkout' | 'orders' | 'profile' | 'loyalty' | null;

export function customerApi(slug: string) {
  const base = `/api/customer/stores/${encodeURIComponent(slug)}`;
  const json = (method: string, body?: unknown, headers?: HeadersInit): RequestInit => ({ method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const request = async <T = any>(path: string, init?: RequestInit) => readJson<T>(await apiFetch(`${base}${path}`, init));
  return {
    session: () => request('/auth/session'), identify: (phone: string) => request('/auth/identify', json('POST', { phone })),
    login: (body: unknown) => request('/auth/login', json('POST', body)), register: (body: unknown) => request('/auth/register', json('POST', body)), logout: () => request('/auth/logout', json('POST')),
    requestPassword: (phone: string) => request('/auth/password/request', json('POST', { phone })), confirmPassword: (body: unknown) => request('/auth/password/confirm', json('POST', body)), profile: (body: unknown) => request('/auth/profile', json('PUT', body)),
    addresses: () => request('/me/addresses'), createAddress: (body: unknown) => request('/me/addresses', json('POST', body)), updateAddress: (id: string, body: unknown) => request(`/me/addresses/${encodeURIComponent(id)}`, json('PUT', body)), deleteAddress: (id: string) => request(`/me/addresses/${encodeURIComponent(id)}`, json('DELETE')), setDefaultAddress: (id: string) => request(`/me/addresses/${encodeURIComponent(id)}/default`, json('PATCH')),
    cep: (cep: string) => request(`/cep/${encodeURIComponent(cep.replace(/\D/g, ''))}`), orders: (state = 'all', page = 1) => request(`/me/orders?state=${state}&page=${page}&limit=10`), order: (id: string) => request(`/me/orders/${encodeURIComponent(id)}`), loyalty: () => request('/me/loyalty'),
    coupon: (code: string, subtotalCents: number) => request('/coupon/preview', json('POST', { code, subtotalCents })), shippingQuote: (body: unknown) => request('/shipping/quote', json('POST', body)), createOrder: (body: unknown, idempotencyKey: string) => request('/orders', json('POST', body, { 'idempotency-key': idempotencyKey })),
  };
}
