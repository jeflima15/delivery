import { apiFetch, readJson, setCsrfToken } from '../../lib/api';
import type { ListResponse, TenantAdminSession, TenantDashboard, TenantEntity } from './types';
import type { DeliveryRegionInput, DeliveryRegionListResponse, StoreLocation } from '../../types/deliveryRegions';

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
    setCsrfToken(result.csrfToken, 'tenant');
    return result;
  }
  async logout() {
    const result = await readJson<{ success: true }>(await apiFetch('/api/platform/auth/logout', this.json('POST')));
    setCsrfToken(undefined, 'tenant');
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

  getOnboardingStatus() {
    return this.request<{
      success: true;
      onboarding: { completed: boolean; step: string };
      hasProducts: boolean;
      productsCount: number;
      hasSettings: boolean;
      storeName: string;
      settings: Record<string, any> | null;
    }>('/onboarding/status');
  }

  updateOnboardingProgress(data: { step?: string; completed?: boolean }) {
    return this.request<{ success: true; onboarding: { completed: boolean; step: string } }>('/onboarding/progress', this.json('PATCH', data));
  }

  completeOnboarding() {
    return this.request<{ success: true; onboarding: { completed: true; step: 'complete' } }>('/onboarding/complete', this.json('POST'));
  }

  updateOnboardingStoreName(name: string, phone?: string) {
    return this.request<{ success: true; name: string; phone?: string }>('/onboarding/store-name', this.json('PATCH', { name, phone }));
  }

  updateOnboardingServiceOptions(options: { allowDelivery: boolean; allowPickup: boolean }) {
    return this.request<{ success: true; logisticsOptions: { allowDelivery: boolean; allowPickup: boolean } }>('/onboarding/service-options', this.json('PATCH', options));
  }
  listOrders(query = '') { return this.request<ListResponse<TenantEntity>>(`/orders?limit=100${query ? `&${query}` : ''}`); }
  listActiveOrders() { return this.request<{ success: true; items: TenantEntity[] }>(`/orders/active`); }
  listOrderHistory(params: { page?: number; limit?: number; search?: string; status?: string; from?: string; to?: string } = {}) {
    const query = new URLSearchParams();
    query.set('page', String(params.page || 1)); query.set('limit', String(params.limit || 20));
    if (params.search) query.set('search', params.search); if (params.status && params.status !== 'Todos') query.set('status', params.status);
    if (params.from) query.set('from', params.from); if (params.to) query.set('to', params.to);
    return this.request<ListResponse<TenantEntity> & { period: JsonRecord }>(`/orders/history?${query.toString()}`);
  }
  async exportOrderHistory(params: { search?: string; status?: string; from?: string; to?: string } = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search); if (params.status && params.status !== 'Todos') query.set('status', params.status);
    if (params.from) query.set('from', params.from); if (params.to) query.set('to', params.to);
    const response = await apiFetch(`${this.baseUrl}/orders/history/export.csv?${query.toString()}`);
    if (!response.ok) await readJson(response);
    return response.blob();
  }
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
  getDeliveryRegions() { return this.request<DeliveryRegionListResponse & { success: true }>('/delivery-regions'); }
  geocodeStore(address: { postalCode?: string; street: string; number?: string; district?: string; city: string; state?: string }) { return this.request<{ success: true; location: StoreLocation; provider: string; precision: string; formattedAddress: string }>('/delivery-regions/geocode-store', this.json('POST', address)); }
  saveDeliveryRegions(payload: { storeLocation: StoreLocation; regions: DeliveryRegionInput[] }) { return this.request<DeliveryRegionListResponse & { success: true }>('/delivery-regions', this.json('PUT', payload)); }
  testDeliveryRegions(payload: { storeLocation: StoreLocation; regions: DeliveryRegionInput[]; address?: Record<string, string>; location?: StoreLocation }) { return this.request<{ success: true; precision: string; location: { latitude: number; longitude: number }; result: { matched: boolean; blocked?: boolean; regionName?: string; feeCents?: number; deliveryTimeMin?: number; deliveryTimeMax?: number } }>('/delivery-regions/test', this.json('POST', payload)); }
  searchNeighborhoods(query: string, city = '', state = '') { const params = new URLSearchParams({ q: query, city, state }); return this.request<{ success: true; items: Array<{ district: string; city: string; state: string; tagValue: string; label: string }> }>(`/neighborhoods/search?${params}`); }

  listHomeBlocks() { return this.request<ListResponse<TenantEntity>>('/home-blocks'); }
  createHomeBlock(block: JsonRecord) { return this.request<{ success: true; block: TenantEntity }>('/home-blocks', this.json('POST', block)); }
  updateHomeBlock(id: string, block: JsonRecord) { return this.request<{ success: true; block: TenantEntity }>(`/home-blocks/${id}`, this.json('PUT', block)); }
  deleteHomeBlock(id: string) { return this.request<{ success: true }>(`/home-blocks/${id}`, this.json('DELETE')); }
  reorderHomeBlocks(updates: JsonRecord[]) { return this.request<{ success: true }>('/home-blocks/reorder', this.json('PUT', { updates })); }

  listCustomers(params: { page?: number; limit?: number; search?: string; segment?: string; from?: string; to?: string } = {}) {
    const query = new URLSearchParams();
    query.set('page', String(params.page || 1)); query.set('limit', String(params.limit || 25));
    if (params.search) query.set('search', params.search); if (params.segment) query.set('segment', params.segment);
    if (params.from) query.set('from', params.from); if (params.to) query.set('to', params.to);
    return this.request<ListResponse<TenantEntity> & { summary: JsonRecord; period: JsonRecord }>(`/customers?${query.toString()}`);
  }
  getCustomer(id: string) { return this.request<{ success: true; customer: TenantEntity; orders: TenantEntity[]; metrics: JsonRecord }>(`/customers/${id}`); }
  updateCustomerPoints(id: string, pontos: number, reason: string) { return this.request<{ success: true; customer: TenantEntity }>(`/customers/${id}/points`, this.json('PATCH', { pontos, reason })); }
  listPasswordRecoveries() { return this.request<{ success: true; items: TenantEntity[] }>('/customers/password-recoveries'); }
  approvePasswordRecovery(id: string) { return this.request<{ success: true; recovery: TenantEntity }>(`/customers/password-recoveries/${id}/approve`, this.json('POST', {})); }
  async exportCustomers(params: { search?: string; segment?: string; from?: string; to?: string } = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search); if (params.segment) query.set('segment', params.segment);
    if (params.from) query.set('from', params.from); if (params.to) query.set('to', params.to);
    const response = await apiFetch(`${this.baseUrl}/customers/export.csv?${query.toString()}`); if (!response.ok) await readJson(response); return response.blob();
  }
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
    return this.request<{ success: true; period: JsonRecord; metrics: JsonRecord; byStatus: Record<string, number>; payments: TenantEntity[]; byDay: TenantEntity[] }>(`/reports/summary?${query.toString()}`);
  }
  getProductReport(from?: string, to?: string) {
    const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to);
    return this.request<{ success: true; period: JsonRecord; products: TenantEntity[]; categories: TenantEntity[] }>(`/reports/products?${query.toString()}`);
  }
  getOperationReport(from?: string, to?: string) {
    const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to);
    return this.request<{ success: true; period: JsonRecord; metrics: JsonRecord; byHour: TenantEntity[]; peakHours: TenantEntity[] }>(`/reports/operation?${query.toString()}`);
  }
  getMarketingReport(from?: string, to?: string) {
    const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to);
    return this.request<{ success: true; period: JsonRecord; coupons: TenantEntity[]; loyalty: JsonRecord }>(`/reports/marketing?${query.toString()}`);
  }
  async exportReport(kind: 'summary' | 'products' | 'categories' | 'marketing', from?: string, to?: string) {
    const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to);
    const path = kind === 'marketing' ? '/reports/marketing/export.csv' : kind === 'summary' ? '/reports/summary/export.csv' : '/reports/products/export.csv';
    if (kind === 'categories') query.set('kind', 'categories');
    const response = await apiFetch(`${this.baseUrl}${path}?${query.toString()}`); if (!response.ok) await readJson(response); return response.blob();
  }
  listTeam() { return this.request<{ success: true; items: TenantEntity[] }>('/team'); }
  inviteTeamMember(email: string, role: string) { return this.request<{ success: true; invitation?: { acceptUrl?: string } }>('/team/invitations', this.json('POST', { email, role })); }
  removeTeamMember(memberId: string) { return this.request<{ success: true }>(`/team/${memberId}`, this.json('DELETE', {})); }
  getBilling() { return this.request<{ success: true; subscription: TenantEntity | null; invoices: TenantEntity[] }>('/billing'); }
  signUpload(payload: { target: 'product' | 'store'; mimeType: 'image/webp'; size: number }) { return this.request<{ success: true; upload: { bucket: string; path: string; token: string; publicUrl: string } }>('/uploads/sign', this.json('POST', payload)); }
  listComplementGroups() { return this.request<ListResponse<TenantEntity>>('/complement-groups'); }
  createComplementGroup(payload: JsonRecord) { return this.request<{ success: true; group: TenantEntity }>('/complement-groups', this.json('POST', payload)); }
  updateComplementGroup(id: string, payload: JsonRecord) { return this.request<{ success: true; group: TenantEntity }>(`/complement-groups/${id}`, this.json('PUT', payload)); }
  deleteComplementGroup(id: string) { return this.request<{ success: true }>(`/complement-groups/${id}`, this.json('DELETE')); }
  toggleComplementGroup(id: string) { return this.request<{ success: true; group: TenantEntity }>(`/complement-groups/${id}/toggle-active`, this.json('PATCH', {})); }
}

export function createTenantAdminApi(slug: string) {
  return new TenantAdminApi(slug);
}
