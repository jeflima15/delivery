import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, refreshAdminSessionIfAvailable } from '../../lib/api';
import { MasterApiError, masterRequest } from './api';
import MasterLayout from './MasterLayout';
import MasterLogin from './MasterLogin';
import { ErrorState, LoadingState, Toasts } from './components/MasterUI';
import type { PeriodKey, SessionResponse, ToastMessage } from './types';

const MasterOverview = lazy(() => import('./pages/MasterOverview'));
const MasterTenants = lazy(() => import('./pages/MasterTenants'));
const MasterTenantDetail = lazy(() => import('./pages/MasterTenantDetail'));
const MasterPlans = lazy(() => import('./pages/MasterPlans'));
const MasterSubscriptions = lazy(() => import('./pages/MasterSubscriptions'));
const MasterInvoices = lazy(() => import('./pages/MasterInvoices'));
const MasterAccesses = lazy(() => import('./pages/MasterAccesses'));
const MasterReports = lazy(() => import('./pages/MasterReports'));
const MasterActivity = lazy(() => import('./pages/MasterActivity'));
const MasterSettings = lazy(() => import('./pages/MasterSettings'));

function normalizePath(path: string) {
  if (path === '/master' || path === '/master/') return '/master/dashboard';
  const allowed = ['/master/login', '/master/dashboard', '/master/lojas', '/master/planos', '/master/assinaturas', '/master/financeiro', '/master/acessos', '/master/relatorios', '/master/atividades', '/master/configuracoes'];
  if (allowed.includes(path) || /^\/master\/lojas\/[a-f\d]{24}$/i.test(path)) return path;
  return '/master/dashboard';
}
export default function MasterApp() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname)); const [session, setSession] = useState<SessionResponse['account'] | null>(null); const [checking, setChecking] = useState(true); const [sessionError, setSessionError] = useState(''); const [expired, setExpired] = useState(false); const [platformName, setPlatformName] = useState('Delivery Platform'); const [attention, setAttention] = useState(0); const [period, setPeriodState] = useState<PeriodKey>(() => (localStorage.getItem('master_period') as PeriodKey | null) || '30d'); const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const requestedPath = useMemo(() => path === '/master/login' ? '/master/dashboard' : path, []);
  const navigate = useCallback((target: string, replace = false) => { const normalized = normalizePath(target); window.history[replace ? 'replaceState' : 'pushState']({}, '', normalized); setPath(normalized); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const notify = useCallback((tone: ToastMessage['tone'], message: string) => { const id = Date.now() + Math.floor(Math.random() * 1000); setToasts((items) => [...items, { id, tone, message }]); window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4000); }, []);
  const checkSession = useCallback(async () => { setChecking(true); setSessionError(''); try { await refreshAdminSessionIfAvailable(); const response = await masterRequest<SessionResponse>('/session'); setSession(response.account); if (window.location.pathname === '/master' || window.location.pathname === '/master/' || window.location.pathname === '/master/login') navigate(requestedPath, true); } catch (error) { if (error instanceof MasterApiError && (error.status === 401 || error.status === 403)) { setSession(null); setExpired(Boolean(session)); if (window.location.pathname !== '/master/login') { window.history.replaceState({}, '', '/master/login'); setPath('/master/login'); } } else setSessionError(error instanceof Error ? error.message : 'Falha ao validar a sessão.'); } finally { setChecking(false); } }, [navigate, requestedPath, session]);
  useEffect(() => { const pop = () => setPath(normalizePath(window.location.pathname)); window.addEventListener('popstate', pop); checkSession(); return () => window.removeEventListener('popstate', pop); }, []);
  useEffect(() => { if (!session) return; masterRequest<{ success: true; settings: { platformName?: string; defaultPeriod?: PeriodKey } }>('/settings').then((response) => { if (response.settings.platformName) setPlatformName(response.settings.platformName); }).catch(() => undefined); }, [session]);
  const setPeriod = (value: PeriodKey) => { localStorage.setItem('master_period', value); setPeriodState(value); };
  const logout = async () => { await apiFetch('/api/platform/auth/logout', { method: 'POST' }).catch(() => undefined); setSession(null); setExpired(false); navigate('/master/login', true); };
  if (checking) return <main className="min-h-[100dvh] bg-slate-950 p-6 text-slate-200"><div className="mx-auto max-w-5xl pt-[18vh]"><p className="mb-5 text-center text-sm text-slate-500">Validando sessão protegida...</p><LoadingState rows={4}/></div></main>;
  if (sessionError && !session) return <main className="grid min-h-[100dvh] place-items-center bg-slate-950 p-4"><div className="w-full max-w-lg"><ErrorState message={sessionError} retry={checkSession}/></div></main>;
  if (!session) return <><MasterLogin expired={expired} onSuccess={checkSession}/><Toasts items={toasts}/></>;
  const tenantMatch = path.match(/^\/master\/lojas\/([a-f\d]{24})$/i);
  let page: React.ReactNode;
  if (tenantMatch) page = <MasterTenantDetail tenantId={tenantMatch[1]} navigate={navigate} notify={notify}/>;
  else if (path === '/master/lojas') page = <MasterTenants navigate={navigate} notify={notify}/>;
  else if (path === '/master/planos') page = <MasterPlans notify={notify}/>;
  else if (path === '/master/assinaturas') page = <MasterSubscriptions navigate={navigate} notify={notify}/>;
  else if (path === '/master/financeiro') page = <MasterInvoices navigate={navigate} notify={notify}/>;
  else if (path === '/master/acessos') page = <MasterAccesses navigate={navigate} notify={notify}/>;
  else if (path === '/master/relatorios') page = <MasterReports period={period} setPeriod={setPeriod}/>;
  else if (path === '/master/atividades') page = <MasterActivity/>;
  else if (path === '/master/configuracoes') page = <MasterSettings notify={notify} onPlatformName={setPlatformName}/>;
  else page = <MasterOverview period={period} setPeriod={setPeriod} navigate={navigate} onAttention={setAttention}/>;
  return <><MasterLayout path={path} account={session} platformName={platformName} attention={attention} navigate={navigate} logout={logout}><Suspense fallback={<LoadingState rows={8}/>}>{page}</Suspense></MasterLayout><Toasts items={toasts}/></>;
}
