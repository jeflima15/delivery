import { lazy, Suspense, useSyncExternalStore } from 'react';
import { ToastProvider } from './components/Toast';
import PlatformLanding from './components/landing/PlatformLanding';
import NotFound from './components/RouteNotFound';
import PageIdentity from './components/PageIdentity';
import { landingTitle } from './components/landing/landingContent';

const StorefrontApp = lazy(() => import('./StorefrontApp'));
const CentralMerchantLogin = lazy(() => import('./components/CentralMerchantLogin'));
const AcceptInvitation = lazy(() => import('./components/AcceptInvitation'));
const ResetAdminPassword = lazy(() => import('./components/ResetAdminPassword'));
const CustomerResetPassword = lazy(() => import('./components/CustomerResetPassword'));
const TenantAdminDashboard = lazy(() => import('./components/TenantAdminDashboard'));
const MasterDashboard = lazy(() => import('./components/MasterDashboard'));

const reservedRoutes = new Set(['master', 'admin', 'invite', 'convite', 'api', 'login', 'docs', 'assets']);
const routeFallback = <div role="status" className="grid min-h-screen place-items-center bg-[#f6f7f2] text-sm font-semibold text-gray-500">Carregando...</div>;

const subscribeLocation = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
};

export default function App() {
  const pathname = useSyncExternalStore(subscribeLocation, () => window.location.pathname);
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0] || '';
  const isTenantAdmin = !reservedRoutes.has(first) && segments[1] === 'admin';
  const isStorefront = Boolean(first) && !reservedRoutes.has(first) && segments.length === 1;
  const isCustomerReset = !reservedRoutes.has(first) && segments.length === 3 && segments[1] === 'recuperar-senha';
  const slug = isStorefront || isTenantAdmin || isCustomerReset ? first : undefined;
  const platformTitle = !first ? landingTitle : first === 'master' ? 'Master — Pode Vir'
    : first === 'login' || first === 'admin' && !segments[1] ? 'Acesso do lojista — Pode Vir'
      : first === 'invite' || first === 'convite' ? 'Convite — Pode Vir'
        : first === 'admin' && segments[1] === 'reset-password' ? 'Recuperar senha — Pode Vir' : 'Pode Vir';
  return <>
    <PageIdentity slug={slug} admin={isTenantAdmin} title={isTenantAdmin ? 'Painel — Pode Vir' : platformTitle} />
    <AppRoute key={slug || 'platform'} />
  </>;
}

function AppRoute() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const first = segments[0] || '';

  if (!first) return <PlatformLanding />;
  if (first === 'login' || (first === 'admin' && !segments[1])) return <Suspense fallback={routeFallback}><CentralMerchantLogin /></Suspense>;
  if ((first === 'invite' || first === 'convite') && segments[1]) return <Suspense fallback={routeFallback}><AcceptInvitation token={segments[1]} /></Suspense>;
  if (first === 'admin' && segments[1] === 'reset-password' && segments[2]) return <Suspense fallback={routeFallback}><ResetAdminPassword token={segments[2]} /></Suspense>;
  if (segments.length === 3 && segments[1] === 'recuperar-senha') return <Suspense fallback={routeFallback}><CustomerResetPassword tenantSlug={first} token={segments[2]} /></Suspense>;
  if (first === 'master') return <ToastProvider><Suspense fallback={routeFallback}><MasterDashboard /></Suspense></ToastProvider>;
  if (reservedRoutes.has(first)) return <NotFound />;
  if (segments.length >= 2 && segments[1] === 'admin') return <ToastProvider><Suspense fallback={routeFallback}><TenantAdminDashboard slug={first} /></Suspense></ToastProvider>;
  if (segments.length > 1) return <NotFound />;
  return <Suspense fallback={routeFallback}><StorefrontApp tenantSlug={first} /></Suspense>;
}
