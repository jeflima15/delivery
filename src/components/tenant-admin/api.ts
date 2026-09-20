import { apiFetch, readJson, setCsrfToken } from '../../lib/api';
import type { ListResponse, TenantAdminSession, TenantDashboard, TenantEntity } from './types';
import type { DeliveryRegionInput, DeliveryRegionListResponse, DeliveryRegionsDraft, StoreLocation } from '../../types/deliveryRegions';

type JsonRecord = Record<string, unknown>;
export type CatalogStructureProduct = TenantEntity & {
  id?: string;
  nome?: string;
  imagem?: string;
  preco?: number;
  preco_antigo?: number;
  ativo?: boolean;
  esgotado?: boolean;
  destaque?: boolean;
  ordem?: number;
  ordem_categoria?: number;
  sortableId?: string;
};
export type CatalogStructureCategory = TenantEntity & {
  id?: string;
  nome?: string;
  descricao?: string;
  ordem?: number;
  produtos?: CatalogStructureProduct[];
};

export type AdminHomeBlock = TenantEntity & {
  titulo?: string;
  descricao?: string;
  imagem_desktop?: string;
  imagem_mobile?: string;
  modal_titulo?: string;
  modal_texto_completo?: string;
  modal_imagem?: string;
  link_destino?: string;
  tipo_bloco?: string;
  posicao_exibicao?: string;
  acao_clique?: string;
  ativo?: boolean;
};

export interface CatalogLabAnalysisPrice {
  label: string | null;
  amountCents: number | null;
  prefix: string | null;
  unit: string | null;
  rawText: string;
}

export interface CatalogLabAnalysisProduct {
  name: string;
  sourcePage?: number | null;
  description: string | null;
  prices: CatalogLabAnalysisPrice[];
  warnings: string[];
}

export interface CatalogLabAnalysisCategory {
  name: string | null;
  products: CatalogLabAnalysisProduct[];
}

export interface CatalogLabAnalysisData {
  isMenu: boolean;
  categories: CatalogLabAnalysisCategory[];
  unmappedTexts: string[];
  warnings: string[];
}

export type SectionKind =
  | 'products'
  | 'combos'
  | 'addons'
  | 'options'
  | 'mixed'
  | 'unknown';

export type ItemKind =
  | 'product'
  | 'combo'
  | 'addon'
  | 'option'
  | 'informational'
  | 'unknown';

export type PhotoRelation =
  | 'direct'
  | 'shared'
  | 'ambiguous'
  | 'none';

export type BoundingBox = [number, number, number, number];

export interface VisualSection {
  categoryIndex: number;
  sectionKind: SectionKind;
}

export interface VisualItem {
  itemKey: string;
  kind: ItemKind;
  sourceBox: BoundingBox | null;
  photoBox: BoundingBox | null;
  photoRelation: PhotoRelation;
  photoWarning: string | null;
}

export interface VisualEnrichmentData {
  sections: VisualSection[];
  items: VisualItem[];
  warnings: string[];
}

export interface VisualEnrichmentSuccess {
  status: 'ok';
  model: string;
  executionTimeMs: number;
  data: VisualEnrichmentData;
  rawJson: string;
}

export interface VisualEnrichmentFailure {
  status: 'failed';
  error: {
    code: string;
    message: string;
  };
}

export interface VisualEnrichmentSkipped {
  status: 'skipped';
  reason: 'PDF_VISUAL_ENRICHMENT_NOT_ENABLED';
  message: string;
}

export type VisualEnrichmentResult =
  | VisualEnrichmentSuccess
  | VisualEnrichmentFailure
  | VisualEnrichmentSkipped;

/* ==========================================================================
   ENRIQUECIMENTO SEMÂNTICO DE PDF (CHAMADA #2)
   ========================================================================== */

export type SemanticItemKind =
  | 'product'
  | 'combo'
  | 'option'
  | 'variant'
  | 'addon'
  | 'informational'
  | 'unknown';

export type SemanticPricingModel =
  | 'single'
  | 'quantity_tiers'
  | 'size_variants'
  | 'multiple_prices'
  | 'unknown';

export interface SemanticItemAssignment {
  itemKey: string;
  kind: SemanticItemKind;
  parentItemKey: string | null;
  groupKey: string | null;
  pricingModel: SemanticPricingModel | null;
}

export type SemanticGroupKind =
  | 'option_group'
  | 'variant_group'
  | 'addon_group'
  | 'unknown';

export type GroupPricingBehavior =
  | 'inherits_parent'
  | 'own_price_per_item'
  | 'mixed'
  | 'no_price'
  | 'unknown';

export interface SemanticGroup {
  groupKey: string;
  name: string;
  kind: SemanticGroupKind;
  parentItemKey: string | null;
  itemKeys: string[];
  pricingBehavior: GroupPricingBehavior;
}

export type BusinessRuleType =
  | 'minimum_order'
  | 'advance_notice'
  | 'serving_guidance'
  | 'packaging'
  | 'customer_supplied_material'
  | 'product_specification'
  | 'ordering_instruction'
  | 'other';

export interface SemanticBusinessRule {
  type: BusinessRuleType;
  sourceTextKey: string | null;
  rawText: string;
  sourcePage: number | null;
  relatedItemKey: string | null;
  relatedGroupKey: string | null;
}

export type IgnoredTextReason =
  | 'placeholder'
  | 'marketing'
  | 'contact'
  | 'decorative'
  | 'duplicate'
  | 'irrelevant'
  | 'other';

export interface SemanticIgnoredText {
  sourceTextKey: string | null;
  rawText: string;
  sourcePage: number | null;
  reason: IgnoredTextReason;
}

export interface PdfSemanticEnrichmentData {
  items: SemanticItemAssignment[];
  groups: SemanticGroup[];
  businessRules: SemanticBusinessRule[];
  ignoredTexts: SemanticIgnoredText[];
  warnings: string[];
}

export interface PdfSemanticEnrichmentSuccess {
  status: 'ok';
  model: string;
  executionTimeMs: number;
  data: PdfSemanticEnrichmentData;
  rawJson: string;
}

export interface PdfSemanticEnrichmentFailure {
  status: 'failed';
  error: {
    code: string;
    message: string;
  };
}

export type PdfSemanticEnrichmentResult =
  | PdfSemanticEnrichmentSuccess
  | PdfSemanticEnrichmentFailure;

export interface PdfPhotoItem {
  itemKey: string;
  pageNumber: number | null;
  photoBox: [number, number, number, number] | null;
  photoRelation: 'direct' | 'shared' | 'ambiguous' | 'none';
  photoWarning: string | null;
}

export interface PdfPhotoEnrichmentData {
  items: PdfPhotoItem[];
  warnings: string[];
}

export interface PdfPhotoEnrichmentSuccess {
  status: 'ok';
  model: string;
  executionTimeMs: number;
  data: PdfPhotoEnrichmentData;
  rawJson: string;
}

export interface PdfPhotoEnrichmentFailure {
  status: 'failed';
  error: {
    code: string;
    message: string;
  };
}

export type PdfPhotoEnrichmentResult =
  | PdfPhotoEnrichmentSuccess
  | PdfPhotoEnrichmentFailure;

export interface CatalogLabResponse {
  success: true;
  model: string;
  executionTimeMs: number; // Tempo total da operação
  extractionExecutionTimeMs: number; // Tempo da chamada #1
  semanticExecutionTimeMs?: number; // Tempo da chamada #2 (PDF)
  photoExecutionTimeMs?: number; // Tempo da chamada #3 (Fotos PDF)
  data: CatalogLabAnalysisData;
  rawJson: string;
  enrichment?: VisualEnrichmentResult;
  pdfSemanticEnrichment?: PdfSemanticEnrichmentResult;
  pdfPhotoEnrichment?: PdfPhotoEnrichmentResult;
}

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
  getPushSettings() { return this.request<{ publicKey: string | null; pending: number; devices: Array<{ _id: string; name: string; endpointHash: string; enabled: boolean; lastError?: string }> }>('/push'); }
  savePushDevice(subscription: PushSubscriptionJSON, name: string) { return this.request<{ id: string }>('/push', this.json('POST', { subscription, name })); }
  removePushDevice(id: string) { return this.request(`/push/${encodeURIComponent(id)}`, this.json('DELETE')); }
  testPushDevice(id: string) { return this.request(`/push/${encodeURIComponent(id)}/test`, this.json('POST')); }
  getOrder(id: string) { return this.request<{ order: TenantEntity }>(`/orders/${encodeURIComponent(id)}`); }
  getManualOrderSetup(date: string) { return this.request<{ success: true; slots: Array<{ date: string; startsAt: string; startTime: string; endTime: string }>; availabilityMessage: string; nextAvailable: { date: string; startsAt: string; startTime: string; endTime: string } | null; depositPercent: number; maxAdvanceDays: number; logisticsOptions: Record<string, boolean>; paymentMethods: Record<string, boolean> }>(`/orders/manual/setup?date=${encodeURIComponent(date)}`); }
  lookupManualOrderPostalCode(cep: string) { return this.request<{ success: true; address: { postalCode: string; street: string; complement: string; district: string; city: string; state: string; scope: 'street' | 'district' | 'city' } }>(`/orders/manual/cep/${encodeURIComponent(cep)}`); }
  createManualOrder(payload: JsonRecord) { return this.request<{ success: true; order: TenantEntity; trackingToken: string; depositCents: number; totalCents: number }>('/orders/manual', this.json('POST', payload)); }

  getOnboardingStatus() {
    return this.request<{
      success: true;
      onboarding: { completed: boolean; step: string; draft?: import('../../lib/onboardingSetup').OnboardingDraft; revision?: number };
      hasProducts: boolean;
      productsCount: number;
      hasSettings: boolean;
      storeName: string;
      settings: Record<string, any> | null;
      readiness: { ready: boolean; checks: { identity: boolean; service: boolean; delivery: boolean; address: boolean; hours: boolean; product: boolean; payments: boolean }; buyableProducts: number };
    }>('/onboarding/status');
  }

  updateOnboardingProgress(data: { step?: string; completed?: boolean }) {
    return this.request<{ success: true; onboarding: { completed: boolean; step: string } }>('/onboarding/progress', this.json('PATCH', data));
  }

  saveOnboardingDraft(draft: import('../../lib/onboardingSetup').OnboardingDraft, step: number, revision: number) {
    return this.request<{ success: true; revision: number }>('/onboarding/draft', this.json('PUT', { draft, step, revision }));
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
  preorderSlots(id: string, date: string) { return this.request<{ success: true; slots: Array<{ startsAt: string; startTime: string; endTime: string }> }>(`/orders/${encodeURIComponent(id)}/preorder-slots?date=${encodeURIComponent(date)}`); }
  rescheduleOrder(id: string, payload: { date: string; startsAt: string; expectedUpdatedAt: string; reason: string }) { return this.request<{ success: true; order: TenantEntity }>(`/orders/${encodeURIComponent(id)}/reschedule`, this.json('POST', payload)); }
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
  updateOrderStatus(id: string, status: string, reason?: string, stock?: { stockDisposition?: 'return' | 'loss' | 'mixed' | 'not_applicable'; stockReturns?: Array<{ productId: string; returnQuantity: number }> }) { return this.request<{ success: true; order: TenantEntity }>(`/orders/${id}/status`, this.json('PATCH', { status, ...(reason ? { reason } : {}), ...stock })); }
  registerOrderPrint(id: string) { return this.request<{ success: true; kind: 'first_print' | 'reprint'; printCount: number }>(`/orders/${id}/print-events`, this.json('POST')); }
  recordOrderPayment(id: string, payload: { type: 'payment' | 'refund'; amountCents: number; method: string; note?: string; operationId?: string }) { return this.request<{ success: true; order: TenantEntity }>(`/orders/${id}/payments`, this.json('POST', payload)); }
  getCurrentCash() { return this.request<{ success: true; cash: TenantEntity | null; expectedByMethod: Record<string, number> }>('/cash/current'); }
  openCash(openingBalanceCents: number) { return this.request<{ success: true; cash: TenantEntity; expectedByMethod: Record<string, number> }>('/cash/open', this.json('POST', { openingBalanceCents })); }
  addCashMovement(payload: { type: 'supply' | 'withdrawal'; amountCents: number; note: string }) { return this.request<{ success: true; cash: TenantEntity; expectedByMethod: Record<string, number> }>('/cash/movements', this.json('POST', payload)); }
  closeCash(countedByMethod: Record<string, number>, note: string) { return this.request<{ success: true; cash: TenantEntity }>('/cash/close', this.json('POST', { countedByMethod, note })); }

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
  getCatalogStructure() {
    return this.request<{
      success: true;
      categories: CatalogStructureCategory[];
      uncategorized: CatalogStructureProduct[];
    }>('/catalog/structure');
  }
  saveCatalogStructure(payload: JsonRecord) { return this.request<{ success: true }>('/catalog/structure', this.json('PUT', payload)); }
  testCatalogImportAi() { return this.request<{ success: true; model: string; response: string }>('/catalog/import/test-ai', this.json('POST')); }
  async analyzeMenuImageLab(file: File): Promise<CatalogLabResponse> {
    return this.request<CatalogLabResponse>('/catalog/import/analyze-lab', {
      method: 'POST',
      headers: { 'content-type': file.type },
      body: file,
    });
  }

  getSettings() { return this.request<{ success: true; settings: TenantEntity | null }>('/settings'); }
  getOperationalStatus() { return this.request<{ success: true; is_open: boolean; abertura_automatica: boolean; pausado_manualmente: boolean; pausado_ate: string | null; aberto_manualmente_ate: string | null; serverTime: string }>('/settings/operational-status'); }
  updateSettings(settings: JsonRecord & { deliveryRegions?: DeliveryRegionsDraft }) { return this.request<{ success: true; settings: TenantEntity }>('/settings', this.json('PATCH', settings)); }
  toggleStoreStatus() { return this.request<{ success: true; is_open: boolean; abertura_automatica: boolean; pausado_manualmente: boolean; pausado_ate: string | null; aberto_manualmente_ate: string | null }>('/settings/toggle-status', this.json('PATCH')); }
  setStorePause(minutes: number | null) { return this.request<{ success: true; is_open: boolean; pausado_manualmente: boolean; pausado_ate: string | null }>('/settings/pause', this.json('PATCH', { minutes })); }
  getDeliveryRegions() { return this.request<DeliveryRegionListResponse & { success: true }>('/delivery-regions'); }
  lookupDeliveryPostalCode(cep: string) { return this.request<{ success: true; address: { postalCode: string; street: string; complement: string; district: string; city: string; state: string; scope: 'street' | 'district' | 'city' } }>(`/delivery-regions/cep/${encodeURIComponent(cep)}`); }
  geocodeStore(address: { postalCode?: string; street: string; number?: string; district?: string; city: string; state?: string }) { return this.request<{ success: true; location: StoreLocation; provider: string; precision: string; formattedAddress: string }>('/delivery-regions/geocode-store', this.json('POST', address)); }
  testDeliveryRegions(payload: { storeLocation: StoreLocation; regions: DeliveryRegionInput[]; address?: Record<string, string>; location?: StoreLocation }) { return this.request<{ success: true; precision: string; location: { latitude: number; longitude: number }; result: { matched: boolean; blocked?: boolean; regionName?: string; feeCents?: number; deliveryTimeMin?: number; deliveryTimeMax?: number } }>('/delivery-regions/test', this.json('POST', payload)); }
  searchNeighborhoods(query: string, city = '', state = '') { const params = new URLSearchParams({ q: query, city, state }); return this.request<{ success: true; items: Array<{ district: string; city: string; state: string; tagValue: string; label: string }> }>(`/neighborhoods/search?${params}`); }

  listHomeBlocks() { return this.request<ListResponse<AdminHomeBlock>>('/home-blocks'); }
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
  signUpload(payload: { target: 'product' | 'store' | 'orderReference'; mimeType: 'image/webp'; size: number }) { return this.request<{ success: true; upload: { bucket: string; path: string; token: string; publicUrl: string } }>('/uploads/sign', this.json('POST', payload)); }
  listComplementGroups() { return this.request<ListResponse<TenantEntity>>('/complement-groups'); }
  createComplementGroup(payload: JsonRecord) { return this.request<{ success: true; group: TenantEntity }>('/complement-groups', this.json('POST', payload)); }
  updateComplementGroup(id: string, payload: JsonRecord) { return this.request<{ success: true; group: TenantEntity }>(`/complement-groups/${id}`, this.json('PUT', payload)); }
  setComplementItemStatus(groupId: string, itemId: string, ativo: boolean) { return this.request<{ success: true; item: { _id: string; ativo: boolean } }>(`/complement-groups/${groupId}/items/${itemId}/status`, this.json('PATCH', { ativo })); }
  deleteComplementGroup(id: string) { return this.request<{ success: true }>(`/complement-groups/${id}`, this.json('DELETE')); }
  toggleComplementGroup(id: string) { return this.request<{ success: true; group: TenantEntity }>(`/complement-groups/${id}/toggle-active`, this.json('PATCH', {})); }
}

export function createTenantAdminApi(slug: string) {
  return new TenantAdminApi(slug);
}
