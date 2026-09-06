import type { AdminSection, CatalogTab, OrdersTab, StoreTab } from '../../lib/adminNavigation';
import { lazyWithPreload } from './lazyWithPreload';

export const LazyAdminOrders = lazyWithPreload(() => import('../AdminOrders'));
export const LazyOrderHistory = lazyWithPreload(() => import('./OrderHistory'));
export const LazyAdminCategorias = lazyWithPreload(() => import('../AdminCategorias'));
export const LazyAdminProducts = lazyWithPreload(() => import('../AdminProducts'));
export const LazyAdminComplementGroups = lazyWithPreload(() => import('../AdminComplementGroups'));
export const LazyAdminConfig = lazyWithPreload(() => import('../AdminConfig'));
export const LazyAdminHomeBlocks = lazyWithPreload(() => import('../AdminHomeBlocks'));
export const LazyAdminCoupons = lazyWithPreload(() => import('../AdminCoupons'));
export const LazyAdminClientes = lazyWithPreload(() => import('../AdminClientes'));
export const LazyAdminReports = lazyWithPreload(() => import('../AdminReports'));
export const LazyAdminTeam = lazyWithPreload(() => import('../AdminTeam'));
export const LazyAdminLogs = lazyWithPreload(() => import('../AdminLogs'));
export const LazyAdminChangePasswordModal = lazyWithPreload(() => import('../AdminChangePasswordModal'));
export const LazyShareStoreModal = lazyWithPreload(() => import('./ShareStoreModal'));

type Preloadable = { preload: () => Promise<unknown> };

function preload(...components: Preloadable[]) {
  for (const component of components) void component.preload().catch(() => undefined);
}

export function preloadAdminSection(
  section: AdminSection,
  subTab?: OrdersTab | CatalogTab | StoreTab,
) {
  if (section === 'pedidos') {
    preload(subTab === 'history' ? LazyOrderHistory : LazyAdminOrders);
    return;
  }
  if (section === 'catalogo') {
    if (subTab === 'produtos') preload(LazyAdminProducts);
    else if (subTab === 'complementos') preload(LazyAdminComplementGroups);
    else preload(LazyAdminCategorias);
    return;
  }
  if (section === 'loja') {
    if (subTab === 'home') preload(LazyAdminHomeBlocks);
    else if (subTab === 'promocoes_fidelidade') preload(LazyAdminConfig, LazyAdminCoupons);
    else preload(LazyAdminConfig);
    return;
  }
  if (section === 'clientes') preload(LazyAdminClientes);
  if (section === 'relatorios') preload(LazyAdminReports);
  if (section === 'equipe') preload(LazyAdminTeam);
  if (section === 'sistema') preload(LazyAdminLogs);
}

export function preloadAdminModal(modal: 'password' | 'share') {
  preload(modal === 'password' ? LazyAdminChangePasswordModal : LazyShareStoreModal);
}
