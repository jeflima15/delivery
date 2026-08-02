// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Clock3,
  DollarSign,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  Package,
  Settings2,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
  TicketPercent,
  TrendingUp,
  Users,
  Eye,
  EyeOff,
} from 'lucide-react';
import AdminLayout from './AdminLayout';
import AdminOrders from './AdminOrders';
import AdminProducts from './AdminProducts';
import AdminCategorias from './AdminCategorias';
import AdminConfig from './AdminConfig';
import AdminHomeBlocks from './AdminHomeBlocks';
import AdminClientes from './AdminClientes';
import AdminCoupons from './AdminCoupons';
import AdminLogs from './AdminLogs';
import AdminChangePasswordModal from './AdminChangePasswordModal';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

const PRIMARY_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Metricas, atalhos e alertas.' },
  { id: 'pedidos', label: 'Pedidos', icon: ShoppingBag, description: 'Fila operacional e status.' },
  { id: 'catalogo', label: 'Catalogo', icon: Package, description: 'Produtos e estrutura hierarquica.' },
  { id: 'loja', label: 'Loja', icon: Store, description: 'Aparencia, home e operacao.' },
  { id: 'clientes', label: 'Clientes', icon: Users, description: 'Base, historico e fidelidade.' },
  { id: 'sistema', label: 'Sistema', icon: Settings2, description: 'Logs e itens tecnicos.' },
];

const CATALOG_TABS = [
  { id: 'produtos', label: 'Produtos', description: 'Cadastro completo.', icon: Package },
  { id: 'estrutura', label: 'Estrutura', description: 'Categorias e ordem real da loja.', icon: Tags },
];

const STORE_TABS = [
  { id: 'aparencia', label: 'Aparencia', description: 'Identidade visual da loja.', icon: Store },
  { id: 'home', label: 'Home', description: 'Blocos, banners e cards.', icon: Megaphone },
  { id: 'operacao', label: 'Operacao', description: 'Status, horarios e regras.', icon: Clock3 },
  { id: 'entrega_pagamento', label: 'Entrega e Pagamento', description: 'Logistica e checkout.', icon: DollarSign },
  { id: 'promocoes_fidelidade', label: 'Promocoes e Fidelidade', description: 'Pontos, banners e cupons.', icon: TicketPercent },
];

export default function AdminDashboardWrapper({ slug }: { slug: string }) {
  const api = useTenantAdminApi();
  const [token, setToken] = useState<string | null>(null);
  const [adminInfo, setAdminInfo] = useState<any>(null);
  const [loginData, setLoginData] = useState({ email: '', senha: '' });
  const [permissions, setPermissions] = useState<string[]>([]);
  const [storeName, setStoreName] = useState(slug);
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [catalogTab, setCatalogTab] = useState('estrutura');
  const [storeTab, setStoreTab] = useState('aparencia');
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    api.getSession().then((data) => {
      if (data.success) {
        setToken('cookie-session');
        setAdminInfo(data.account);
        setPermissions(data.permissions || []);
        setStoreName(data.tenant?.name || slug);
      }
    }).catch(() => undefined).finally(() => setAuthLoading(false));
  }, [api, slug]);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    setToken(null);
    setAdminInfo(null);
    setPermissions([]);
    setIsChangePasswordOpen(false);
    showToast('Sessao encerrada ou expirada', 'info');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      await api.login({ email: loginData.email, password: loginData.senha });
      const data = await api.getSession();
      setToken('cookie-session');
      setAdminInfo(data.account);
      setPermissions(data.permissions || []);
      setStoreName(data.tenant?.name || slug);
      showToast(`Bem-vindo, ${data.account.name}!`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao conectar com o servidor', 'error');
    } finally { setLoginLoading(false); }
  };

  const can = (permission: string) => permissions.includes(permission);
  const visibleSections = PRIMARY_SECTIONS.filter((section) => ({
    dashboard: can('orders:read'), pedidos: can('orders:read'), catalogo: can('catalog:read'),
    loja: can('settings:read'), clientes: can('customers:read'), sistema: can('audit:read'),
  }[section.id]));

  const navigateTo = (target: string) => {
    if (['dashboard', 'pedidos', 'catalogo', 'loja', 'clientes', 'sistema'].includes(target)) return setActiveSection(target);
    if (['produtos', 'estrutura'].includes(target)) { setActiveSection('catalogo'); return setCatalogTab(target); }
    if (['aparencia', 'home', 'operacao', 'entrega_pagamento', 'promocoes_fidelidade'].includes(target)) { setActiveSection('loja'); return setStoreTab(target); }
    if (target === 'cupons') { setActiveSection('loja'); return setStoreTab('promocoes_fidelidade'); }
    if (target === 'logs') setActiveSection('sistema');
  };

  const header = useMemo(() => ({
    dashboard: ['Dashboard', 'Central operacional da loja com metricas, atalhos e alertas.'],
    pedidos: ['Pedidos', 'Acompanhamento operacional da fila de pedidos.'],
    catalogo: ['Catalogo', 'Produtos e estrutura do cardapio em um fluxo hierarquico e claro.'],
    loja: ['Loja', 'Configuracao da operacao e da aparencia da loja.'],
    clientes: ['Clientes', 'Base de clientes, historico resumido e fidelidade.'],
    sistema: ['Sistema', 'Itens tecnicos e logs com menos peso na navegacao.'],
  }[activeSection] || ['Dashboard', '']), [activeSection]);

  const secondaryNav = activeSection === 'catalogo'
    ? <SectionTabs title="Areas do catalogo" items={CATALOG_TABS} activeId={catalogTab} onChange={setCatalogTab} />
    : activeSection === 'loja'
      ? <SectionTabs title="Configuracoes da loja" items={STORE_TABS} activeId={storeTab} onChange={setStoreTab} />
      : null;

  const headerActions = token ? (
    <button
      type="button"
      onClick={() => setIsChangePasswordOpen(true)}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700 transition-colors hover:bg-emerald-100 sm:w-auto"
    >
      <KeyRound className="h-4 w-4" />
      Alterar senha
    </button>
  ) : null;

  if (authLoading) return <div className="grid min-h-screen place-items-center bg-gray-50 text-sm font-medium text-gray-500">Validando sessao da loja...</div>;

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-[2.5rem] border border-gray-100 bg-white p-10 shadow-2xl text-center">
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50"><Settings2 className="w-10 h-10 text-emerald-600" /></div>
          <h1 className="text-3xl font-black text-gray-900">Painel da loja</h1>
          <p className="mt-2 text-sm font-bold text-emerald-600">{storeName}</p>
          <p className="mb-10 mt-2 text-gray-500 font-medium">Entre para gerenciar a operacao da loja.</p>
          {
            <form onSubmit={handleLogin} className="space-y-5">
              <input aria-label="E-mail" type="email" autoComplete="email" placeholder="admin@exemplo.com" value={loginData.email} onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 font-medium outline-none focus:border-emerald-500" required />
              <div className="relative"><input aria-label="Senha" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Senha" value={loginData.senha} onChange={(e) => setLoginData({ ...loginData, senha: e.target.value })} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 pr-14 font-medium outline-none focus:border-emerald-500" required /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((value) => !value)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div>
              <button disabled={loginLoading} type="submit" className="w-full rounded-2xl bg-emerald-600 py-5 font-bold text-white shadow-xl shadow-emerald-900/10 disabled:opacity-60">{loginLoading ? 'Entrando...' : 'Entrar no sistema'}</button>
              <a href={`/${encodeURIComponent(slug)}`} className="block text-xs font-bold text-emerald-600 hover:underline">Voltar para a vitrine</a>
            </form>
          }
        </div>
      </div>
    );
  }

  return (
    <>
      <AdminLayout
        sections={visibleSections}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onLogout={logout}
        headerTitle={header[0]}
        headerDescription={header[1]}
        secondaryNav={secondaryNav}
        headerActions={headerActions}
        storeName={storeName}
      >
      {activeSection === 'dashboard' && <DashboardContent navigateTo={navigateTo} />}
      {activeSection === 'pedidos' && <AdminOrders token={token} onUnauthorized={logout} />}
      {activeSection === 'catalogo' && <>{catalogTab === 'produtos' && <AdminProducts token={token} onUnauthorized={logout} />}{catalogTab === 'estrutura' && <AdminCategorias token={token} onUnauthorized={logout} onNavigateToProducts={() => setCatalogTab('produtos')} />}</>}
      {activeSection === 'loja' && (
        <div className="space-y-6">
          {storeTab === 'aparencia' && <AdminConfig token={token} onUnauthorized={logout} focusSection="aparencia" />}
          {storeTab === 'home' && <AdminHomeBlocks token={token} onUnauthorized={logout} />}
          {storeTab === 'operacao' && <AdminConfig token={token} onUnauthorized={logout} focusSection="operacao" />}
          {storeTab === 'entrega_pagamento' && <AdminConfig token={token} onUnauthorized={logout} focusSection="entrega_pagamento" />}
          {storeTab === 'promocoes_fidelidade' && <div className="space-y-6"><AdminConfig token={token} onUnauthorized={logout} focusSection="promocoes_fidelidade" /><div className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">Cupons</p><p className="mt-2 text-sm text-gray-500">Os cupons continuam com a mesma logica, agora agrupados junto de promocoes e fidelidade.</p><div className="mt-6"><AdminCoupons token={token} onUnauthorized={logout} /></div></div></div>}
        </div>
      )}
      {activeSection === 'clientes' && <AdminClientes token={token} onUnauthorized={logout} />}
      {activeSection === 'sistema' && <AdminLogs token={token} onUnauthorized={logout} />}
      </AdminLayout>

      {token && (
        <AdminChangePasswordModal
          isOpen={isChangePasswordOpen}
          onClose={() => setIsChangePasswordOpen(false)}
          token={token}
          currentAdminEmail={adminInfo?.email || loginData.email}
          onUnauthorized={logout}
        />
      )}
    </>
  );
}

function SectionTabs({ title, items, activeId, onChange }: any) {
  return (
    <section className="rounded-[2rem] border border-gray-100 bg-white px-4 py-4 shadow-sm sm:px-6">
      <p className="mb-4 text-xs font-black uppercase tracking-[0.24em] text-emerald-600">{title}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item: any) => {
          const Icon = item.icon;
          const isActive = item.id === activeId;
          return (
            <button key={item.id} onClick={() => onChange(item.id)} className={`rounded-3xl border px-4 py-4 text-left transition-all ${isActive ? 'border-emerald-200 bg-emerald-50 shadow-sm' : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white'}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isActive ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500'}`}><Icon className="w-5 h-5" /></div>
                <div><p className="text-sm font-black uppercase tracking-wide text-gray-900">{item.label}</p><p className="mt-1 text-xs leading-relaxed text-gray-500">{item.description}</p></div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DashboardContent({ navigateTo }: any) {
  const api = useTenantAdminApi();
  const [state, setState] = useState({ loading: true, faturamentoHoje: 0, pedidosHoje: 0, ticketMedio: 0, emAndamento: 0, faturamentoSemana: 0, weeklyData: [], recentOrders: [], alerts: [] });

  useEffect(() => {
    let cancelled = false;
    api.getDashboard().then((payload) => {
      if (cancelled) return;
      const settings = payload.settings || {};
      const alerts = [];
      if (!settings?.is_open) alerts.push({ id: 'closed', tone: 'amber', title: 'Loja fechada', text: 'Revise Loja > Operacao caso isso nao tenha sido planejado.', target: 'operacao', label: 'Abrir operacao' });
      if (!payload.metrics.products) alerts.push({ id: 'produtos', tone: 'red', title: 'Sem produtos cadastrados', text: 'Cadastre itens em Catalogo para a loja operar normalmente.', target: 'produtos', label: 'Cadastrar produtos' });
      if (!payload.metrics.categories) alerts.push({ id: 'categorias', tone: 'red', title: 'Sem categorias criadas', text: 'As categorias ajudam o cliente a encontrar o cardapio com menos esforco.', target: 'estrutura', label: 'Organizar catalogo' });
      if (!payload.activeHomeBlocks) alerts.push({ id: 'home', tone: 'blue', title: 'Home sem blocos ativos', text: 'Use a Home para comunicar promocao, institucional e informativos.', target: 'home', label: 'Editar home' });
      if (settings?.logisticsOptions && !settings.logisticsOptions.allowPickup && !settings.logisticsOptions.allowDelivery) alerts.push({ id: 'logistica', tone: 'red', title: 'Nenhuma modalidade ativa', text: 'Retirada e entrega estao desativadas ao mesmo tempo.', target: 'entrega_pagamento', label: 'Revisar logistica' });
      setState({
        loading: false,
        faturamentoHoje: payload.metrics.revenueToday,
        pedidosHoje: payload.metrics.ordersToday,
        ticketMedio: payload.metrics.averageOrderToday,
        emAndamento: payload.metrics.pendingOrders,
        faturamentoSemana: payload.metrics.revenueWeek,
        weeklyData: payload.weekly.map((day) => ({ dia: day.label, total: day.total })),
        recentOrders: payload.recentOrders,
        alerts,
      });
    }).catch(() => !cancelled && setState((prev: any) => ({ ...prev, loading: false })));
    return () => { cancelled = true; };
  }, [api]);

  if (state.loading) return <div className="flex h-64 items-center justify-center rounded-[2rem] border border-gray-100 bg-white shadow-sm"><div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" /></div>;

  const maxWeekly = Math.max(...state.weeklyData.map((item: any) => item.total), 1);
  const quickActions = [
    { id: 'pedidos', title: 'Operar pedidos', description: 'Abrir fila, filtros e status.', icon: ShoppingBag },
    { id: 'produtos', title: 'Cadastrar produto', description: 'Adicionar ou revisar itens.', icon: Package },
    { id: 'estrutura', title: 'Estrutura do catalogo', description: 'Ordenar categorias e produtos.', icon: Sparkles },
    { id: 'home', title: 'Editar home', description: 'Atualizar blocos e banners.', icon: Megaphone },
    { id: 'promocoes_fidelidade', title: 'Promocoes e fidelidade', description: 'Pontos, banners e cupons.', icon: TicketPercent },
  ];
  const metrics = [
    { title: 'Faturamento de hoje', value: `R$ ${state.faturamentoHoje.toFixed(2).replace('.', ',')}`, icon: DollarSign, tone: 'bg-emerald-50 text-emerald-600' },
    { title: 'Pedidos de hoje', value: String(state.pedidosHoje), icon: ShoppingBag, tone: 'bg-blue-50 text-blue-600' },
    { title: 'Ticket medio de hoje', value: `R$ ${state.ticketMedio.toFixed(2).replace('.', ',')}`, icon: TrendingUp, tone: 'bg-purple-50 text-purple-600' },
    { title: 'Pedidos em andamento', value: String(state.emAndamento), icon: ClipboardList, tone: 'bg-amber-50 text-amber-600' },
  ];

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_1fr]">
        <div className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm sm:p-8"><p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">Visao de desempenho</p><h3 className="mt-2 text-2xl font-black tracking-tight text-gray-900">O que merece atencao agora</h3><div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">{metrics.map((metric) => { const Icon = metric.icon; return <div key={metric.title} className="rounded-3xl border border-gray-100 bg-gray-50 p-5"><div className="flex items-start gap-4"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${metric.tone}`}><Icon className="w-5 h-5" /></div><div><p className="text-xs font-black uppercase tracking-[0.24em] text-gray-400">{metric.title}</p><p className="mt-2 text-2xl font-black tracking-tight text-gray-900">{metric.value}</p></div></div></div>; })}</div></div>
        <div className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-700"><BarChart3 className="w-5 h-5" /></div><div><p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">Desempenho semanal</p><h3 className="mt-2 text-xl font-black tracking-tight text-gray-900">Faturamento da semana</h3><p className="mt-2 text-sm text-gray-500">R$ {state.faturamentoSemana.toFixed(2).replace('.', ',')}</p></div></div><div className="mt-8 flex h-64 items-end justify-between gap-3">{state.weeklyData.map((item: any) => <div key={item.dia} className="flex flex-1 flex-col items-center gap-3"><div className="flex h-full w-full flex-col justify-end"><div className="mx-auto w-full max-w-[54px] rounded-2xl bg-emerald-100" style={{ height: `${(item.total / maxWeekly) * 100}%` }} /></div><div className="text-center"><p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">{item.dia}</p><p className="mt-1 text-xs font-bold text-gray-500">R$ {item.total.toFixed(0)}</p></div></div>)}</div></div>
      </section>
      <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm sm:p-8"><p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">Atalhos rapidos</p><h3 className="mt-2 text-2xl font-black tracking-tight text-gray-900">Tarefas mais comuns da operacao</h3><div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">{quickActions.map((action) => { const Icon = action.icon; return <button key={action.id} onClick={() => navigateTo(action.id)} className="rounded-3xl border border-gray-100 bg-gray-50 p-5 text-left transition-all hover:border-emerald-200 hover:bg-emerald-50"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-700"><Icon className="w-5 h-5" /></div><p className="mt-5 text-sm font-black uppercase tracking-wide text-gray-900">{action.title}</p><p className="mt-2 text-sm leading-relaxed text-gray-500">{action.description}</p></button>; })}</div></section>
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">Pedidos recentes</p><h3 className="mt-2 text-2xl font-black tracking-tight text-gray-900">Fila recente</h3></div><button onClick={() => navigateTo('pedidos')} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs font-black uppercase tracking-[0.22em] text-gray-600">Ver pedidos</button></div><div className="mt-8 space-y-3">{!state.recentOrders.length && <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">Ainda nao existem pedidos recentes.</div>}{state.recentOrders.map((order: any) => <div key={order._id} className="flex flex-col gap-4 rounded-3xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xs font-black text-gray-500">#{String(order._id || '').slice(-4).toUpperCase()}</div><div><p className="text-sm font-black uppercase tracking-wide text-gray-900">{order.cliente?.nome || 'Cliente sem nome'}</p><p className="mt-1 text-sm text-gray-500">{new Date(order.createdAt).toLocaleString('pt-BR')}</p></div></div><div className="flex items-center justify-between gap-4 sm:justify-end"><span className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-gray-600">{order.status || 'Sem status'}</span><span className="text-base font-black text-emerald-600">R$ {(order.total || 0).toFixed(2).replace('.', ',')}</span></div></div>)}</div></div>
        <div className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><AlertTriangle className="w-5 h-5" /></div><div><p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">Alertas operacionais</p><h3 className="mt-2 text-2xl font-black tracking-tight text-gray-900">O que revisar</h3></div></div><div className="mt-8 space-y-4">{!state.alerts.length && <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5"><p className="text-sm font-black uppercase tracking-[0.16em] text-emerald-700">Sem alertas criticos</p><p className="mt-2 text-sm text-emerald-700/80">O painel nao encontrou pendencias evidentes agora.</p></div>}{state.alerts.map((alert: any) => <div key={alert.id} className={`rounded-3xl border p-5 ${alert.tone === 'red' ? 'border-red-100 bg-red-50 text-red-700' : alert.tone === 'amber' ? 'border-amber-100 bg-amber-50 text-amber-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}><p className="text-sm font-black uppercase tracking-[0.16em]">{alert.title}</p><p className="mt-2 text-sm opacity-90">{alert.text}</p><button onClick={() => navigateTo(alert.target)} className="mt-4 rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.18em]">{alert.label}</button></div>)}</div></div>
      </section>
    </div>
  );
}
