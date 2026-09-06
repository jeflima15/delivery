export const ADMIN_SECTIONS = [
  'dashboard',
  'pedidos',
  'catalogo',
  'loja',
  'clientes',
  'relatorios',
  'equipe',
  'sistema',
] as const;

export const ORDER_TABS = ['active', 'history'] as const;
export const CATALOG_TABS = ['estrutura', 'produtos', 'complementos'] as const;
export const STORE_TABS = ['aparencia', 'home', 'operacao', 'entrega_pagamento', 'promocoes_fidelidade'] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];
export type OrdersTab = (typeof ORDER_TABS)[number];
export type CatalogTab = (typeof CATALOG_TABS)[number];
export type StoreTab = (typeof STORE_TABS)[number];
export type AdminSubTab = OrdersTab | CatalogTab | StoreTab;

export interface AdminLocationState {
  section: AdminSection;
  ordersTab: OrdersTab;
  catalogTab: CatalogTab;
  storeTab: StoreTab;
}

function includesValue<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && values.includes(value as T);
}

export function parseAdminLocation(pathname: string, search: string): AdminLocationState {
  const sectionValue = pathname.split('/').filter(Boolean)[2] || 'dashboard';
  const section = includesValue(ADMIN_SECTIONS, sectionValue) ? sectionValue : 'dashboard';
  const tab = new URLSearchParams(search).get('tab');

  return {
    section,
    ordersTab: section === 'pedidos' && includesValue(ORDER_TABS, tab) ? tab : 'active',
    catalogTab: section === 'catalogo' && includesValue(CATALOG_TABS, tab) ? tab : 'estrutura',
    storeTab: section === 'loja' && includesValue(STORE_TABS, tab) ? tab : 'aparencia',
  };
}

export function buildAdminPath(slug: string, section: AdminSection, subTab?: AdminSubTab): string {
  const defaultTab = section === 'pedidos'
    ? 'active'
    : section === 'catalogo'
      ? 'estrutura'
      : section === 'loja'
        ? 'aparencia'
        : undefined;
  const query = subTab && subTab !== defaultTab ? `?tab=${encodeURIComponent(subTab)}` : '';
  return `/${encodeURIComponent(slug)}/admin/${section}${query}`;
}
