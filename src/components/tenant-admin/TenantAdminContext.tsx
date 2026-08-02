import { createContext, useContext } from 'react';
import type { TenantAdminApi } from './api';

const TenantAdminContext = createContext<TenantAdminApi | null>(null);

export function TenantAdminProvider({ api, children }: { api: TenantAdminApi; children: React.ReactNode }) {
  return <TenantAdminContext.Provider value={api}>{children}</TenantAdminContext.Provider>;
}

export function useTenantAdminApi() {
  const api = useContext(TenantAdminContext);
  if (!api) throw new Error('TenantAdminProvider ausente.');
  return api;
}

export function useOptionalTenantAdminApi() {
  return useContext(TenantAdminContext);
}
