import { apiFetch, readJson, setCsrfToken } from '../../lib/api';
import type { ListResponse, TenantAdminSession, TenantDashboard, TenantEntity } from './types';

type JsonRecord = Record<string, unknown>;

export class TenantAdminApi {
  readonly slug: string;
  readonly baseUrl: string;

  constructor(slug: string) {
    this.slug = slug;
    this.baseUrl = `/api/tenant/stores/${encodeURIComponent(slug)}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return readJson<T>(await apiFetch(`${this.baseUrl}${path}`, init));
  }

  private json(method: string, body?: unknown): RequestInit {
    return { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
  }

  getSession() { return this.request<TenantAdminSession & { success: true }>('/me'); }
  async login(credentials: { email: string; password: string }) {
    const result = await readJson<{ success: true; csrfToken?: string }>(await apiFetch('/api/platform/auth/admin/login', this.json('POST', { ...credentials, slug: this.slug })));
    setCsrfToken(result.csrfToken, 'admin');
    return result;
  }
  async logout() {
    const result = await readJson<{ success: true }>(await apiFetch('/api/platform/auth/logout', this.json('POST')));
    setCsrfToken(undefined, 'admin');
    return result;
  }
  async changePassword(payload: { email: string; senhaAtual: string; novaSenha: string; confirmarNovaSenha: string }) {
    return readJson<{ success: true; reauthenticationRequired: boolean }>(await apiFetch('/api/platform/auth/admin/me/password', this.json('PUT', {
      email: payload.email,
      currentPassword: payload.senhaAtual,
      newPassword: payload.novaSenha,
      confirmPassword: payload.confirmarNovaSenha,
    })));
  }

  getDashboard() { return this.request<TenantDashboard & { success: true }>('/dashboard'); }
  listOrders(query = '') { return this.request<ListResponse<TenantEntity>>(`/orders?limit=100${query ? `&${query}` : ''}`); }
  updateOrderStatus(id: string, status: string, reason?: string) { return this.request<{ success: true; order: TenantEntity }>(`/orders/${id}/status`, this.json('PATCH', { status, ...(reason ? { reason } : {}) })); }

  listProducts() { return this.request<ListResponse<TenantEntity>>('/products'); }
  createProduct(product: JsonRecord) { return this.request<{ success: true; product: TenantEntity }>('/products', this.json('POST', product)); }
  updateProduct(id: string, product: JsonRecord) { return this.request<{ success: true; product: TenantEntity }>(`/products/${id}`, this.json('PUT', product)); }
  deleteProduct(id: string) { return this.request<{ success: true }>(`/products/${id}`, this.json('DELETE')); }
  toggleProductActive(id: string) { return this.request<{ success: true; product: TenantEntity }>(`/products/${id}/toggle-active`, this.json('PATCH')); }
  toggleProductSoldOut(id: string) { return this.request<{ success: true; product: TenantEntity }>(`/products/${id}/toggle-sold-out`, this.json('PATCH')); }

  listCategories() { return this.request<ListResponse<TenantEntity>>('/categories'); }
  createCategory(category: JsonRecord) { return this.request<{ success: true; category: TenantEntity }>('/categories', this.json('POST', category)); }
  updateCategory(id: string, category: JsonRecord) { return this.request<{ success: true; category: TenantEntity }>(`/categories/${id}`, this.json('PUT', category)); }
  deleteCategory(id: string) { return this.request<{ success: true }>(`/categories/${id}`, this.json('DELETE')); }
  getCatalogStructure() { return this.request<{ success: true; categories: TenantEntity[]; uncategorized: TenantEntity[] }>('/catalog/structure'); }
  saveCatalogStructure(payload: JsonRecord) { return this.request<{ success: true }>('/catalog/structure', this.json('PUT', payload)); }

  getSettings() { return this.request<{ success: true; settings: TenantEntity | null }>('/settings'); }
  updateSettings(settings: JsonRecord) { return this.request<{ success: true; settings: TenantEntity }>('/settings', this.json('PUT', settings)); }
  toggleStoreStatus() { return this.request<{ success: true; is_open: boolean }>('/settings/toggle-status', this.json('PATCH')); }

  listHomeBlocks() { return this.request<ListResponse<TenantEntity>>('/home-blocks'); }
  createHomeBlock(block: JsonRecord) { return this.request<{ success: true; block: TenantEntity }>('/home-blocks', this.json('POST', block)); }
  updateHomeBlock(id: string, block: JsonRecord) { return this.request<{ success: true; block: TenantEntity }>(`/home-blocks/${id}`, this.json('PUT', block)); }
  deleteHomeBlock(id: string) { return this.request<{ success: true }>(`/home-blocks/${id}`, this.json('DELETE')); }
  reorderHomeBlocks(updates: JsonRecord[]) { return this.request<{ success: true }>('/home-blocks/reorder', this.json('PUT', { updates })); }

  listCustomers(search = '') { return this.request<ListResponse<TenantEntity>>(`/customers?limit=200${search ? `&search=${encodeURIComponent(search)}` : ''}`); }
  getCustomer(id: string) { return this.request<{ success: true; customer: TenantEntity; orders: TenantEntity[] }>(`/customers/${id}`); }
  updateCustomerPoints(id: string, pontos: number, reason: string) { return this.request<{ success: true; customer: TenantEntity }>(`/customers/${id}/points`, this.json('PATCH', { pontos, reason })); }
  listCoupons() { return this.request<ListResponse<TenantEntity>>('/coupons'); }
  createCoupon(coupon: JsonRecord) { return this.request<{ success: true; coupon: TenantEntity }>('/coupons', this.json('POST', coupon)); }
  deleteCoupon(id: string) { return this.request<{ success: true }>(`/coupons/${id}`, this.json('DELETE')); }
  listAuditLogs(params: { page?: number; limit?: number; search?: string; action?: string; targetType?: string } = {}) {
    const query = new URLSearchParams();
    query.set('page', String(params.page || 1));
    query.set('limit', String(params.limit || 25));
    if (params.search) query.set('search', params.search);
    if (params.action) query.set('action', params.action);
    if (params.targetType) query.set('targetType', params.targetType);
    return this.request<ListResponse<TenantEntity>>(`/audit?${query.toString()}`);
  }
  getReportSummary(from?: string, to?: string) {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    return this.request<{ success: true; period: JsonRecord; metrics: JsonRecord; byStatus: Record<string, number>; byDay: TenantEntity[] }>(`/reports/summary?${query.toString()}`);
  }
  listTeam() { return this.request<{ success: true; items: TenantEntity[] }>('/team'); }
  inviteTeamMember(email: string, role: string) { return this.request<{ success: true; invitation?: { acceptUrl?: string } }>('/team/invitations', this.json('POST', { email, role })); }
  getBilling() { return this.request<{ success: true; subscription: TenantEntity | null; invoices: TenantEntity[] }>('/billing'); }
  signUpload(payload: { target: 'product' | 'store'; mimeType: 'image/webp'; size: number }) { return this.request<{ success: true; upload: { bucket: string; path: string; token: string; publicUrl: string } }>('/uploads/sign', this.json('POST', payload)); }
}

export function createTenantAdminApi(slug: string) {
  return new TenantAdminApi(slug);
}
