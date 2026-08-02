import { useMemo } from 'react';
import AdminDashboard from './AdminDashboard';
import { createTenantAdminApi } from './tenant-admin/api';
import { TenantAdminProvider } from './tenant-admin/TenantAdminContext';

type Props = { slug: string };

export default function TenantAdminDashboard({ slug }: Props) {
  const api = useMemo(() => createTenantAdminApi(slug), [slug]);

  return (
    <TenantAdminProvider api={api}>
      <AdminDashboard slug={slug} />
    </TenantAdminProvider>
  );
}
