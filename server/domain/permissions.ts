export const permissions = [
  'catalog:read', 'catalog:write', 'orders:read', 'orders:write',
  'customers:read', 'customers:write', 'coupons:write', 'settings:read', 'settings:write',
  'team:read', 'team:write', 'billing:read', 'audit:read',
  'platform:read', 'platform:write',
] as const;

export type Permission = typeof permissions[number];
export type TenantRole = 'tenant_owner' | 'tenant_admin' | 'tenant_manager' | 'tenant_operator';

export const rolePermissions: Record<TenantRole, readonly Permission[]> = {
  tenant_owner: permissions.filter((permission) => !permission.startsWith('platform:')),
  tenant_admin: ['catalog:read', 'catalog:write', 'orders:read', 'orders:write', 'customers:read', 'customers:write', 'coupons:write', 'settings:read', 'settings:write', 'team:read', 'audit:read'],
  tenant_manager: ['catalog:read', 'catalog:write', 'orders:read', 'orders:write', 'customers:read', 'coupons:write', 'settings:read'],
  tenant_operator: ['catalog:read', 'orders:read', 'orders:write'],
};

export function hasPermission(role: TenantRole, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}
