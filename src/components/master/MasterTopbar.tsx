import { useEffect, useRef, useState } from 'react';
import { Bell, Building2, CreditCard, LogOut, Menu, Search, Settings, UserRound, X, AlertTriangle, CalendarClock, Store, CheckCheck, ChevronRight } from 'lucide-react';
import { masterRequest, queryString, jsonInit } from './api';
import { useDebounced } from './hooks';
import { fieldClass } from './components/MasterUI';
import type { Invoice, Plan, SessionResponse, Tenant } from './types';

interface SearchGroups { tenants: Tenant[]; accounts: Array<{ _id: string; name: string; email: string }>; invoices: Invoice[]; plans: Plan[] }
interface Props { path: string; account: SessionResponse['account']; attention: number; navigate: (path: string) => void; openMenu: () => void; logout: () => void }

interface NotificationItem {
  id: string;
  type: 'invoice' | 'trial' | 'onboarding';
  title: string;
  subtitle: string;
  target: string;
  icon: React.ReactNode;
  action?: (e: React.MouseEvent) => void;
  actionLabel?: string;
}

const titles: Record<string, string> = { dashboard: 'Visão geral', lojas: 'Lojas', planos: 'Planos', assinaturas: 'Assinaturas', financeiro: 'Financeiro', acessos: 'Acessos', relatorios: 'Relatórios', atividades: 'Atividades', infraestrutura: 'Infraestrutura', configuracoes: 'Configurações' };

export default function MasterTopbar({ path, account, attention: rawAttention, navigate, openMenu, logout }: Props) {
  const segment = path.split('/')[2] || 'dashboard';
  const [openSearch, setOpenSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchGroups | null>(null);
  const debounced = useDebounced(query);
  const inputRef = useRef<HTMLInputElement>(null);

  const [openNotifications, setOpenNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [isCleared, setIsCleared] = useState(() => localStorage.getItem('master_notifications_cleared') === 'true');
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpenSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (openSearch) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [openSearch]);

  useEffect(() => {
    if (debounced.trim().length < 2) { setResults(null); return; }
    masterRequest<{ success: true; groups: SearchGroups }>(`/search${queryString({ q: debounced })}`).then((response) => setResults(response.groups)).catch(() => setResults(null));
  }, [debounced]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setOpenNotifications(false);
      }
    };
    if (openNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openNotifications]);

  const loadNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const res = await masterRequest<{
        success: true;
        attention?: {
          overdueInvoices?: Array<{ _id: string; amountCents: number; tenantId?: { displayName?: string } }>;
          endingTrials?: Array<{ _id: string; tenant?: { displayName?: string } }>;
          stalledOnboarding?: Array<{ _id: string; displayName: string }>;
        };
      }>('/dashboard');

      const items: NotificationItem[] = [];
      const att = res.attention;
      if (att) {
        (att.overdueInvoices || []).forEach((inv) => {
          items.push({
            id: `inv-${inv._id}`,
            type: 'invoice',
            title: 'Fatura Vencida',
            subtitle: `${inv.tenantId?.displayName || 'Loja'} - R$ ${(inv.amountCents / 100).toFixed(2).replace('.', ',')}`,
            target: '/master/financeiro',
            icon: <AlertTriangle className="h-4 w-4 text-red-400" />,
          });
        });
        (att.endingTrials || []).forEach((sub) => {
          items.push({
            id: `trial-${sub._id}`,
            type: 'trial',
            title: 'Trial terminando',
            subtitle: `${sub.tenant?.displayName || 'Loja em trial'} finalizando período de teste`,
            target: '/master/assinaturas',
            icon: <CalendarClock className="h-4 w-4 text-cyan-400" />,
            action: async (e) => {
              e.stopPropagation();
              try {
                await masterRequest(`/subscriptions/${sub._id}/extend-trial`, jsonInit('POST', {}));
                setNotifications(prev => prev.filter(n => n.id !== `trial-${sub._id}`));
              } catch {
                // Ignore error on toast notice
              }

            },
            actionLabel: '+7 Dias',
          });
        });
        (att.stalledOnboarding || []).forEach((tenant) => {
          items.push({
            id: `onb-${tenant._id}`,
            type: 'onboarding',
            title: 'Onboarding pendente',
            subtitle: `${tenant.displayName} aguardando configuração final`,
            target: '/master/lojas',
            icon: <Store className="h-4 w-4 text-amber-400" />,
          });
        });
      }
      setNotifications(items);
    } catch {
      setNotifications([]);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const toggleNotifications = () => {
    if (!openNotifications) {
      loadNotifications();
    }
    setOpenNotifications((prev) => !prev);
  };

  const markAllAsRead = () => {
    setIsCleared(true);
    localStorage.setItem('master_notifications_cleared', 'true');
  };

  const effectiveAttention = isCleared ? 0 : rawAttention;

  const go = (target: string) => { setOpenSearch(false); setQuery(''); navigate(target); };

  return (
    <>
      <header className="sticky top-0 z-40 flex h-[72px] items-center gap-3 border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur-xl md:px-6">
        <button onClick={openMenu} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:text-white lg:hidden" aria-label="Abrir menu">
          <Menu className="h-5 w-5"/>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-slate-500">Master / {titles[segment] || 'Detalhe'}</p>
          <h2 className="truncate text-base font-semibold text-white">{titles[segment] || 'Detalhe da loja'}</h2>
        </div>
        <button onClick={() => setOpenSearch(true)} className="hidden h-10 w-full max-w-sm items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3 text-left text-sm text-slate-500 hover:border-slate-700 md:flex">
          <Search className="h-4 w-4"/>
          <span className="flex-1">Buscar lojas, faturas, acessos...</span>
          <kbd className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
        </button>

        {/* Botão de Notificações com Dropdown Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={toggleNotifications}
            className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white transition-colors"
            title="Central de notificações"
          >
            <Bell className="h-5 w-5"/>
            {effectiveAttention > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-amber-400 px-1 text-center text-[10px] font-bold leading-5 text-slate-950 shadow-md animate-pulse">
                {effectiveAttention}
              </span>
            )}
          </button>

          {openNotifications && (
            <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-950/60">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">Central de Notificações</span>
                  {notifications.length > 0 && !isCleared && (
                    <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      {notifications.length}
                    </span>
                  )}
                </div>
                {notifications.length > 0 && !isCleared && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-[var(--pv-accent)] transition-colors"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Marcar como lidas
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto p-2">
                {loadingNotifications ? (
                  <p className="p-6 text-center text-xs text-slate-500">Carregando pendências...</p>
                ) : isCleared || notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--pv-primary)]/15 text-[var(--pv-accent)]">
                      <CheckCheck className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-slate-200">Tudo sob controle!</p>
                    <p className="mt-1 text-xs text-slate-500">Nenhuma notificação crítica pendente.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {notifications.map((item) => (
                      <div key={item.id} className="relative">
                        <button
                          onClick={() => {
                            setOpenNotifications(false);
                            navigate(item.target);
                          }}
                          className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-slate-800/80 transition-colors group"
                        >
                          <span className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-300 group-hover:bg-slate-700">
                            {item.icon}
                          </span>
                          <div className="flex-1 min-w-0 pr-16">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-slate-200 group-hover:text-white">{item.title}</p>
                              {!item.action && <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-300 transition-colors" />}
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-400 group-hover:text-slate-300 truncate">{item.subtitle}</p>
                          </div>
                        </button>
                        {item.action && item.actionLabel && (
                          <button
                            onClick={item.action}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-400/20 z-10"
                          >
                            {item.actionLabel}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 bg-slate-950/40 p-2 text-center">
                <button
                  onClick={() => {
                    setOpenNotifications(false);
                    navigate('/master/dashboard');
                  }}
                  className="w-full rounded-lg py-1.5 text-xs font-semibold text-[var(--pv-accent)] hover:bg-[color:var(--pv-primary)]/15 transition-colors"
                >
                  Ver Visão geral completa
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile Menu */}
        <details className="relative">
          <summary className="flex h-10 list-none items-center gap-2 rounded-xl border border-slate-800 px-2 text-slate-300 hover:border-slate-700 cursor-pointer">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-800">
              <UserRound className="h-4 w-4"/>
            </span>
            <span className="hidden max-w-28 truncate text-xs sm:block">{account.name}</span>
          </summary>
          <div className="absolute right-0 top-12 w-56 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="border-b border-slate-800 p-3">
              <p className="truncate text-sm font-medium text-white">{account.name}</p>
              <p className="truncate text-xs text-slate-500">{account.email}</p>
            </div>
            <button onClick={() => navigate('/master/configuracoes')} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800">
              <Settings className="h-4 w-4"/>Configurações
            </button>
            <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-300 hover:bg-red-500/10">
              <LogOut className="h-4 w-4"/>Sair
            </button>
          </div>
        </details>
      </header>

      {/* Busca global Ctrl K */}
      {openSearch && (
        <div className="fixed inset-0 z-[90] bg-slate-950/80 p-3 pt-[8vh] backdrop-blur-sm" onClick={() => setOpenSearch(false)}>
          <section className="mx-auto max-h-[78vh] max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-slate-800 p-4">
              <Search className="h-5 w-5 text-[var(--pv-accent)]"/>
              <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} className={`${fieldClass} border-0 bg-transparent px-0 focus:ring-0`} placeholder="Digite pelo menos 2 caracteres..."/>
              <button onClick={() => setOpenSearch(false)} className="text-slate-500 hover:text-white">
                <X className="h-5 w-5"/>
              </button>
            </div>
            <div className="max-h-[62vh] overflow-y-auto p-3">
              {!results && <p className="p-6 text-center text-sm text-slate-500">Busque por loja, responsável, fatura ou plano.</p>}
              {results && (
                <div className="space-y-4">
                  {results.tenants.length > 0 && <SearchGroup title="Lojas" icon={<Building2 className="h-4 w-4"/>}>{results.tenants.map((item) => <SearchItem key={item._id} title={item.displayName} detail={`/${item.slug}`} onClick={() => go(`/master/lojas/${item._id}`)}/>)}</SearchGroup>}
                  {results.accounts.length > 0 && <SearchGroup title="Acessos" icon={<UserRound className="h-4 w-4"/>}>{results.accounts.map((item) => <SearchItem key={item._id} title={item.name} detail={item.email} onClick={() => go('/master/acessos')}/>)}</SearchGroup>}
                  {results.invoices.length > 0 && <SearchGroup title="Faturas" icon={<CreditCard className="h-4 w-4"/>}>{results.invoices.map((item) => <SearchItem key={item._id} title={item.receiptReference || item._id.slice(-8)} detail={item.status} onClick={() => go('/master/financeiro')}/>)}</SearchGroup>}
                  {results.plans.length > 0 && <SearchGroup title="Planos" icon={<CreditCard className="h-4 w-4"/>}>{results.plans.map((item) => <SearchItem key={item._id} title={item.name} detail={item.code} onClick={() => go('/master/planos')}/>)}</SearchGroup>}
                  {Object.values(results).every((items) => items.length === 0) && <p className="p-6 text-center text-sm text-slate-500">Nenhum resultado encontrado.</p>}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function SearchGroup({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {icon}{title}
      </p>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

function SearchItem({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-slate-800">
      <span className="text-sm font-medium text-slate-200">{title}</span>
      <span className="text-xs text-slate-500">{detail}</span>
    </button>
  );
}
