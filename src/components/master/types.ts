export type TenantStatus = 'onboarding' | 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled' | 'archived';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
export type InvoiceStatus = 'pending' | 'paid' | 'failed' | 'overdue' | 'cancelled' | 'refunded' | 'chargeback';

export interface Pagination { page: number; limit: number; total: number; pages: number }
export interface Owner { name: string; email: string; phone?: string }
export interface Plan {
  _id: string; name: string; code: string; active: boolean; priceCents: number;
  interval: 'monthly' | 'yearly'; trialDays: number; limits: Record<string, number>;
  features: Record<string, boolean>; activeSubscriptions?: number; createdAt?: string; updatedAt?: string;
}
export interface Tenant {
  _id: string; legalName: string; displayName: string; slug: string; owner: Owner;
  timezone: string; status: TenantStatus; planId?: string | Plan | null; subscriptionId?: string | null;
  plan?: Plan | null; subscription?: Subscription | null; latestInvoice?: Invoice | null;
  metrics?: { orders: number; gmvCents: number }; saasRevenue?: { cents: number }; onboarding?: { completed?: boolean; steps?: Record<string, boolean> };
  createdAt: string; updatedAt?: string; lastActivityAt?: string; activatedAt?: string;
}
export interface Subscription {
  _id: string; tenantId: string; planId: string; tenant?: Tenant; plan?: Plan;
  status: SubscriptionStatus; provider: 'manual'; currentPeriodStart?: string; currentPeriodEnd?: string;
  trialEndsAt?: string; graceEndsAt?: string; cancelledAt?: string; createdAt: string; updatedAt?: string;
}
export interface InvoiceHistory { status: InvoiceStatus; at: string; reason?: string; actorId?: string }
export interface Invoice {
  _id: string; tenantId: string | Tenant; subscriptionId: string | Subscription; tenant?: Tenant;
  subscription?: Subscription; plan?: Plan; status: InvoiceStatus; amountCents: number; dueAt: string;
  paidAt?: string; receiptReference?: string; history?: InvoiceHistory[]; createdAt: string; updatedAt?: string;
}
export interface Activity {
  _id: string; tenantId?: string; actorId?: string; actorType?: string; action: string;
  targetType?: string; targetId?: string; reason?: string; before?: unknown; after?: unknown;
  requestId?: string; createdAt: string; tenant?: Tenant; actor?: { name: string; email: string };
}
export interface Membership {
  _id: string; tenantId: Tenant; accountId: { _id: string; name: string; email: string; active: boolean; lastLoginAt?: string; createdAt?: string };
  role: string; active: boolean; createdAt: string;
}
export interface Invitation {
  _id: string; tenantId: Tenant; email: string; role: string; acceptedAt?: string; revokedAt?: string;
  expiresAt: string; createdAt: string;
}
export interface SeriesPoint { date: string; orders?: number; gmvCents?: number; cents?: number; paidCents?: number; pendingCents?: number; status?: string }
export interface DashboardResponse {
  success: true; period: { from: string; to: string };
  kpis: Record<string, number>; orderSeries: SeriesPoint[]; revenueSeries: SeriesPoint[];
  tenantStatusDistribution: Array<{ status: TenantStatus; count: number }>;
  planDistribution: Array<{ name: string; count: number }>;
  topStores: Array<{ tenantId: string; displayName: string; slug: string; orders: number; gmvCents: number }>;
  attention: { overdueInvoices: Invoice[]; endingTrials: Subscription[]; stalledOnboarding: Tenant[] };
  recentActivity: Activity[];
}
export interface ListResponse<T> { success: true; items: T[]; pagination: Pagination; summaries?: Record<string, number | { cents: number; count: number }> }
export interface TenantDetailResponse {
  success: true; tenant: Tenant; subscription: Subscription | null; invoices: Invoice[];
  memberships: Membership[]; invitations: Invitation[];
  metrics: { orders: number; gmvCents: number; averageOrderCents: number; customers: number; products: number };
  orderSeries: SeriesPoint[]; activities: Activity[];
}
export interface SessionResponse { success: true; account: { _id: string; name: string; email: string; platformRole: string; lastLoginAt?: string } }
export interface SettingsResponse {
  success: true; settings: { _id?: string; platformName: string; timezone: string; currency: 'BRL'; defaultPeriod: PeriodKey; defaultPageSize: number; featureLabels: Record<string, string>; limitLabels: Record<string, string> };
  billing: { provider: 'manual' }; build: string;
}
export type PeriodKey = 'today' | '7d' | '30d' | 'current_month' | 'previous_month' | 'current_year';
export interface MasterRoute { path: string; params: Record<string, string> }
export interface ToastMessage { id: number; tone: 'success' | 'error' | 'info'; message: string }
