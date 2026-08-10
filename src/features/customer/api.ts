import { apiFetch, readJson, setCsrfToken } from '../../lib/api';

export type CustomerIntent = 'checkout' | 'orders' | 'profile' | 'loyalty' | null;

export function customerApi(slug: string) {
  const base = `/api/customer/stores/${encodeURIComponent(slug)}`;
  const json = (method: string, body?: unknown, headers?: HeadersInit): RequestInit => ({ method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const request = async <T = any>(path: string, init?: RequestInit) => {
    const data = await readJson<T>(await apiFetch(`${base}${path}`, init));
    if (data && typeof data === 'object' && 'csrfToken' in data) setCsrfToken((data as Record<string, unknown>).csrfToken);
    return data;
  };
  return {
    session: () => request('/auth/session'), identify: (phone: string) => request('/auth/identify', json('POST', { phone })),
    login: (body: unknown) => request('/auth/login', json('POST', body)), register: (body: unknown) => request('/auth/register', json('POST', body)), logout: async () => { const result = await request('/auth/logout', json('POST')); setCsrfToken(undefined); return result; },
    requestPassword: (phone: string) => request('/auth/password/request', json('POST', { phone })), confirmPassword: (body: unknown) => request('/auth/password/confirm', json('POST', body)), profile: (body: unknown) => request('/auth/profile', json('PUT', body)),
    addresses: () => request('/me/addresses'), createAddress: (body: unknown) => request('/me/addresses', json('POST', body)), updateAddress: (id: string, body: unknown) => request(`/me/addresses/${encodeURIComponent(id)}`, json('PUT', body)), deleteAddress: (id: string) => request(`/me/addresses/${encodeURIComponent(id)}`, json('DELETE')), setDefaultAddress: (id: string) => request(`/me/addresses/${encodeURIComponent(id)}/default`, json('PATCH')),
    cep: (cep: string) => request(`/cep/${encodeURIComponent(cep.replace(/\D/g, ''))}`), orders: (state = 'all', page = 1) => request(`/me/orders?state=${state}&page=${page}&limit=10`), order: (id: string) => request(`/me/orders/${encodeURIComponent(id)}`), reviewOrder: (id: string, body: { score: number; comment: string }) => request(`/me/orders/${encodeURIComponent(id)}/review`, json('POST', body)), loyalty: () => request('/me/loyalty'),
    coupon: (code: string, subtotalCents: number) => request('/coupon/preview', json('POST', { code, subtotalCents })), shippingQuote: (body: unknown) => request('/shipping/quote', json('POST', body)), createOrder: (body: unknown, idempotencyKey: string) => request('/orders', json('POST', body, { 'idempotency-key': idempotencyKey })),
  };
}
