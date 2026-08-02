export type TenantAdminSession = {
  account: { id: string; name: string; email: string; lastLoginAt?: string };
  tenant: { id: string; slug: string; name: string };
  membership: { role: string; acceptedAt?: string };
  permissions: string[];
};

export type Pagination = { page: number; limit: number; total: number; pages: number };
export type ListResponse<T> = { success: true; items: T[]; pagination: Pagination };
export type TenantEntity = { _id: string; [key: string]: unknown };

export type TenantDashboard = {
  metrics: {
    products: number;
    categories: number;
    orders: number;
    pendingOrders: number;
    ordersToday: number;
    revenueToday: number;
    averageOrderToday: number;
    revenueWeek: number;
  };
  weekly: Array<{ date: string; label: string; total: number }>;
  recentOrders: TenantEntity[];
  settings: TenantEntity | null;
  activeHomeBlocks: number;
};
