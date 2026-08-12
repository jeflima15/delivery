// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
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
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import PodeVirBrand from './brand/PodeVirBrand';
import AdminLayout from './AdminLayout';
import AdminOrders from './AdminOrders';
import AdminProducts from './AdminProducts';
import AdminCategorias from './AdminCategorias';
import AdminConfig from './AdminConfig';
import AdminHomeBlocks from './AdminHomeBlocks';
import AdminClientes from './AdminClientes';
import AdminCoupons from './AdminCoupons';
import AdminLogs from './AdminLogs';
import AdminReports from './AdminReports';
import AdminTeam from './AdminTeam';
import AdminChangePasswordModal from './AdminChangePasswordModal';
import TenantOnboardingModal from './tenant-admin/onboarding/TenantOnboardingModal';
import ActivationChecklist from './tenant-admin/onboarding/ActivationChecklist';
import ShareStoreModal from './tenant-admin/ShareStoreModal';
import OrderHistory from './tenant-admin/OrderHistory';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { Share2 } from 'lucide-react';

const PRIMARY_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Métricas, atalhos e alertas.' },
  { id: 'pedidos', label: 'Pedidos', icon: ShoppingBag, description: 'Fila operacional e status.' },
  { id: 'catalogo', label: 'Catálogo', icon: Package, description: 'Produtos e estrutura hierárquica.' },
  { id: 'loja', label: 'Loja', icon: Store, description: 'Aparência, home e operação.' },
  { id: 'clientes', label: 'Clientes', icon: Users, description: 'Base, histórico e fidelidade.' },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3, description: 'Vendas, ticket e desempenho.' },
  { id: 'equipe', label: 'Equipe', icon: ShieldCheck, description: 'Acessos e permissões.' },
  { id: 'sistema', label: 'Sistema', icon: Settings2, description: 'Logs e itens técnicos.' },
];

const STORE_TABS = [
  { id: 'aparencia', label: 'Aparência & Identidade', description: 'Identidade visual da loja.', icon: Store },
  { id: 'home', label: 'Blocos da Home', description: 'Blocos, banners e cards.', icon: Megaphone },
  { id: 'operacao', label: 'Horários & Operação', description: 'Status, horários e regras.', icon: Clock3 },
  { id: 'entrega_pagamento', label: 'Entrega e Pagamento', description: 'Logística e checkout.', icon: DollarSign },
  { id: 'promocoes_fidelidade', label: 'Promoções e Fidelidade', description: 'Pontos, banners e cupons.', icon: TicketPercent },
];

export default function AdminDashboardWrapper({ slug }: { slug: string }) {
  const api = useTenantAdminApi();
  const { showToast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [adminInfo, setAdminInfo] = useState<any>(null);
  const [loginData, setLoginData] = useState({ email: '', senha: '' });
  const [permissions, setPermissions] = useState<string[]>([]);
  const [storeName, setStoreName] = useState(slug);
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeSection, setActiveSection] = useState(() => {
    const segments = window.location.pathname.split('/').filter(Boolean);
    return segments[2] || 'dashboard';
  });
  const [ordersTab, setOrdersTab] = useState<'active' | 'history'>('active');
  const [catalogTab, setCatalogTab] = useState('estrutura');
  const [storeTab, setStoreTab] = useState('aparencia');
  const [storeOpen, setStoreOpen] = useState(true);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState('welcome');
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [storeNotFound, setStoreNotFound] = useState(false);
  const [isShareStoreModalOpen, setIsShareStoreModalOpen] = useState(false);
  
  // Audio Polling State
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [novosPedidosCount, setNovosPedidosCount] = useState(0);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const lastOrderIdRef = React.useRef<string | null>(null);
  const initialOrdersLoadedRef = React.useRef(true);
  const soundEnabledRef = React.useRef(soundEnabled);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextCtor) {
        audioCtxRef.current = new AudioContextCtor();
      }
    }
    return audioCtxRef.current;
  };

  const playBeep = async () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume();
        setAudioUnlocked(true);
      } else {
        setAudioUnlocked(true);
      }

      const now = ctx.currentTime + 0.03;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 8;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      compressor.connect(ctx.destination);

      const playTone = (freq: number, start: number, duration: number, volume = 0.72) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + 0.025);
        gain.gain.setValueAtTime(volume, start + Math.max(0.03, duration - 0.08));
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(compressor);
        osc.start(start);
        osc.stop(start + duration);
      };

      [0, 1.05].forEach((offset) => {
        playTone(740, now + offset, 0.28);
        playTone(988, now + offset + 0.31, 0.28);
        playTone(1318, now + offset + 0.62, 0.36, 0.82);
      });
    } catch (e) { console.error('Beep Error:', e) }
  };

  useEffect(() => {
    if (!token) return;
    
    let isCancelled = false;
    const fetchPedidos = async () => {
      try {
        const data = await api.listActiveOrders();
        if (data.success && !isCancelled) {
          window.dispatchEvent(new CustomEvent('dashboardOrdersUpdated', { detail: data.items }));
          
          const pendingOrders = data.items.filter((p: any) => p.status === 'Pendente');
          
          if (initialOrdersLoadedRef.current) {
            initialOrdersLoadedRef.current = false;
            lastOrderIdRef.current = pendingOrders.length > 0 ? pendingOrders[0]._id : null;
          } else {
            if (pendingOrders.length > 0) {
              const latestId = pendingOrders[0]._id;
              if (lastOrderIdRef.current !== latestId) {
                // If it's a new ID that we haven't seen as latest, beep
                // This correctly handles 1 new order. If multiple come, it beeps once.
                setNovosPedidosCount(prev => prev + 1);
                if (soundEnabledRef.current) playBeep();
              }
              lastOrderIdRef.current = latestId;
            }
          }
        }
      } catch (e) {}
    };

    fetchPedidos();
    const interval = setInterval(fetchPedidos, 15000);
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') fetchPedidos(); };

    const unlockAudio = async () => {
      try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          await ctx.resume();
        }
      } catch (e) { }
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };

    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [token, api]);

  useEffect(() => {
    api.getSession().then((data) => {
      if (data.success) {
        setToken('cookie-session');
        setAdminInfo(data.account);
        setPermissions(data.permissions || []);
        setStoreName(data.tenant?.name || slug);
        setStoreOpen(!!data.tenant?.isOpen);

        const isOwnerOrAdmin = ['tenant_owner', 'tenant_admin'].includes(data.membership?.role);
        const ob = data.tenant?.onboarding;
        if (isOwnerOrAdmin && ob && !ob.completed) {
          setOnboardingCompleted(false);
          setOnboardingStep(ob.step || 'welcome');
          setIsOnboardingModalOpen(true);
        } else {
          setOnboardingCompleted(true);
        }
      }
    }).catch((err) => {
      if (err?.status === 404 || err?.message?.includes('nao encontrada')) {
        setStoreNotFound(true);
      }
    }).finally(() => setAuthLoading(false));
  }, [api, slug]);

  const toggleStoreOpen = async () => {
    try {
      const data = await api.toggleStoreStatus();
      if (data.success) {
        setStoreOpen(data.is_open);
        showToast(`Loja ${data.is_open ? 'aberta' : 'fechada'} com sucesso!`, 'success');
      }
    } catch (error) {
      showToast('Erro ao alterar status da loja', 'error');
    }
  };

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
      setStoreOpen(!!data.tenant?.isOpen);

      const isOwnerOrAdmin = ['tenant_owner', 'tenant_admin'].includes(data.membership?.role);
      const ob = data.tenant?.onboarding;
      if (isOwnerOrAdmin && ob && !ob.completed) {
        setOnboardingCompleted(false);
        setOnboardingStep(ob.step || 'welcome');
        setIsOnboardingModalOpen(true);
      } else {
        setOnboardingCompleted(true);
      }

      showToast(`Bem-vindo, ${data.account.name}!`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao conectar com o servidor', 'error');
    } finally { setLoginLoading(false); }
  };

  const can = (permission: string) => permissions.includes(permission);
  const visibleSections = PRIMARY_SECTIONS.filter((section) => ({
    dashboard: can('orders:read'), pedidos: can('orders:read'), catalogo: can('catalog:read'),
    loja: can('settings:read'), clientes: can('customers:read'), relatorios: can('orders:read'), equipe: can('team:read'), sistema: can('audit:read'),
  }[section.id])).map(section => {
    if (section.id === 'catalogo') return { ...section, subItems: [{ id: 'estrutura', label: 'Categorias e Itens' }, { id: 'produtos', label: 'Cadastro de Produtos' }] };
    if (section.id === 'loja') return { ...section, subItems: [{ id: 'aparencia', label: 'Identidade e Link' }, { id: 'home', label: 'Blocos da Home' }, { id: 'operacao', label: 'Horários e Operação' }, { id: 'entrega_pagamento', label: 'Entrega e Pagamento' }, { id: 'promocoes_fidelidade', label: 'Promoções e Fidelidade' }] };
    return section;
  });

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    window.history.pushState({}, '', `/${slug}/admin/${section}`);
  };

  useEffect(() => {
    const handlePopState = () => {
      const segments = window.location.pathname.split('/').filter(Boolean);
      setActiveSection(segments[2] || 'dashboard');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (target: string) => {
    if (['dashboard', 'pedidos', 'catalogo', 'loja', 'clientes', 'relatorios', 'equipe', 'sistema'].includes(target)) return handleSectionChange(target);
    if (['produtos', 'estrutura'].includes(target)) { handleSectionChange('catalogo'); return setCatalogTab(target); }
    if (['aparencia', 'home', 'operacao', 'entrega_pagamento', 'promocoes_fidelidade'].includes(target)) { handleSectionChange('loja'); return setStoreTab(target); }
    if (target === 'cupons') { handleSectionChange('loja'); return setStoreTab('promocoes_fidelidade'); }
    if (target === 'logs') handleSectionChange('sistema');
  };

  const header = useMemo(() => ({
    dashboard: ['Dashboard', 'Central operacional da loja com métricas, atalhos e alertas.'],
    pedidos: ['Pedidos', 'Acompanhamento operacional da fila de pedidos.'],
    catalogo: ['Catálogo', 'Produtos e estrutura do cardápio em um fluxo hierárquico e claro.'],
    loja: ['Loja', 'Configuração da operação e da aparência da loja.'],
    clientes: ['Clientes', 'Base de clientes, histórico resumido e fidelidade.'],
    relatorios: ['Relatórios', 'Indicadores comerciais e desempenho da operação.'],
    equipe: ['Equipe', 'Acessos individuais e permissões da loja.'],
    sistema: ['Sistema', 'Itens técnicos e logs com menos peso na navegação.'],
  }[activeSection] || ['Dashboard', '']), [activeSection]);

  const secondaryNav = null;

  const headerActions = token ? (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <a
        href={`/${encodeURIComponent(slug)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:flex-none sm:py-1.5"
      >
        <Eye className="h-3.5 w-3.5 text-emerald-600" />
        Visualizar loja
      </a>
      {!onboardingCompleted && (
        <button
          type="button"
          onClick={() => setIsOnboardingModalOpen(true)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 sm:flex-none sm:py-1.5"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-600" />
          Onboarding
        </button>
      )}
      <button
        type="button"
        onClick={() => setIsShareStoreModalOpen(true)}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:flex-none sm:py-1.5"
      >
        <Share2 className="h-3.5 w-3.5 text-slate-500" />
        Divulgar
      </button>
      <button
        type="button"
        onClick={() => setIsChangePasswordOpen(true)}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:flex-none sm:py-1.5"
      >
        <KeyRound className="h-3.5 w-3.5 text-slate-500" />
        Alterar senha
      </button>
    </div>
  ) : null;

  if (authLoading) return <div className="grid min-h-screen place-items-center bg-gray-50 text-sm font-medium text-gray-500">Validando sessao da loja...</div>;

  if (storeNotFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-[2.5rem] border border-gray-100 bg-white p-10 shadow-2xl text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-50 text-red-500">
            <Store className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Loja não encontrada</h1>
          <p className="mt-3 text-sm font-medium text-gray-500">
            A loja <strong className="text-gray-900 font-mono">/{slug}</strong> não existe ou foi excluída permanentemente pelo Admin Master.
          </p>
          <a
            href="/"
            className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 py-4 font-bold text-white shadow-xl shadow-emerald-900/10 hover:bg-emerald-700 transition-colors"
          >
            Voltar para o início
          </a>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-[2.5rem] border border-gray-100 bg-white p-10 shadow-2xl text-center">
          <div className="mx-auto mb-6 flex justify-center">
            <PodeVirBrand size="lg" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Painel da sua loja</h1>
          <p className="mt-1 text-sm font-bold text-emerald-600">{storeName}</p>
          <p className="mb-8 mt-2 text-gray-500 font-medium text-xs">Entre para gerenciar sua operação.</p>
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
        setActiveSection={handleSectionChange}
        activeSubItem={activeSection === 'catalogo' ? catalogTab : activeSection === 'loja' ? storeTab : undefined}
        onSubItemClick={(subId) => {
          if (activeSection === 'catalogo') setCatalogTab(subId);
          if (activeSection === 'loja') setStoreTab(subId);
        }}
        onLogout={logout}
        headerTitle={header[0]}
        headerDescription={header[1]}
        secondaryNav={secondaryNav}
        headerActions={headerActions}
        storeName={storeName}
        storeOpen={storeOpen}
        onToggleStoreOpen={toggleStoreOpen}
        impersonatedBy={adminInfo?.impersonatedBy}
      >
      {activeSection === 'dashboard' && (
        <DashboardContent
          navigateTo={navigateTo}
          onOpenWizard={() => setIsOnboardingModalOpen(true)}
          onboardingCompleted={onboardingCompleted}
          onOpenShare={() => setIsShareStoreModalOpen(true)}
        />
      )}
      {activeSection === 'pedidos' && <div className="space-y-5">
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          <button onClick={() => setOrdersTab('active')} className={`rounded-lg px-4 py-2.5 text-sm font-bold ${ordersTab === 'active' ? 'bg-emerald-600 text-white' : 'text-gray-600'}`}>Em andamento</button>
          <button onClick={() => setOrdersTab('history')} className={`rounded-lg px-4 py-2.5 text-sm font-bold ${ordersTab === 'history' ? 'bg-emerald-600 text-white' : 'text-gray-600'}`}>Historico</button>
        </div>
        {ordersTab === 'active' ? <AdminOrders
          token={token} 
          onUnauthorized={logout} 
          novosPedidosCount={novosPedidosCount}
          setNovosPedidosCount={setNovosPedidosCount}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
          playBeep={playBeep}
          audioUnlocked={audioUnlocked}
        /> : <OrderHistory />}
      </div>}
      {activeSection === 'catalogo' && <>{catalogTab === 'produtos' && <AdminProducts token={token} onUnauthorized={logout} />}{catalogTab === 'estrutura' && <AdminCategorias token={token} onUnauthorized={logout} onNavigateToProducts={() => setCatalogTab('produtos')} />}</>}
      {activeSection === 'loja' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
            <div className="inline-flex flex-wrap rounded-lg border border-slate-200/80 bg-slate-100/80 p-0.5 text-xs font-medium">
              {STORE_TABS.map((tab) => {
                const Icon = tab.icon;
                const selected = storeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStoreTab(tab.id)}
                    aria-current={selected ? 'page' : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 transition-all ${
                      selected
                        ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 text-emerald-600" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          {storeTab === 'aparencia' && <AdminConfig token={token} onUnauthorized={logout} focusSection="aparencia" />}
          {storeTab === 'home' && <AdminHomeBlocks token={token} onUnauthorized={logout} />}
          {storeTab === 'operacao' && <AdminConfig token={token} onUnauthorized={logout} focusSection="operacao" />}
          {storeTab === 'entrega_pagamento' && <AdminConfig token={token} onUnauthorized={logout} focusSection="entrega_pagamento" />}
          {storeTab === 'promocoes_fidelidade' && (
            <div className="space-y-6">
              <AdminConfig token={token} onUnauthorized={logout} focusSection="promocoes_fidelidade" />
              <AdminCoupons token={token} onUnauthorized={logout} />
            </div>
          )}
        </div>
      )}
      {activeSection === 'clientes' && <AdminClientes token={token} onUnauthorized={logout} />}
      {activeSection === 'relatorios' && <AdminReports />}
      {activeSection === 'equipe' && <AdminTeam canInvite={can('team:write')} currentAdminEmail={adminInfo?.email || loginData.email} />}
      {activeSection === 'sistema' && <AdminLogs token={token} onUnauthorized={logout} />}
      {token && (
        <AdminChangePasswordModal
          isOpen={isChangePasswordOpen}
          onClose={() => setIsChangePasswordOpen(false)}
          token={token}
          currentAdminEmail={adminInfo?.email || loginData.email}
          onUnauthorized={logout}
        />
      )}
      {token && (
        <TenantOnboardingModal
          isOpen={isOnboardingModalOpen}
          onClose={() => setIsOnboardingModalOpen(false)}
          api={api}
          slug={slug}
          initialStoreName={storeName}
          initialStep={onboardingStep}
          onOnboardingComplete={() => setOnboardingCompleted(true)}
          onStoreNameUpdated={(newName) => setStoreName(newName)}
        />
      )}
      {token && (
        <ShareStoreModal
          isOpen={isShareStoreModalOpen}
          onClose={() => setIsShareStoreModalOpen(false)}
          storeUrl={`${window.location.origin}/${slug}`}
        />
      )}
      </AdminLayout>
    </>
  );
}

function DashboardContent({ navigateTo, onOpenWizard, onboardingCompleted, onOpenShare }: any) {
  const api = useTenantAdminApi();
  const [state, setState] = useState({ loading: true, rawPayload: null, faturamentoHoje: 0, pedidosHoje: 0, ticketMedio: 0, emAndamento: 0, faturamentoSemana: 0, weeklyData: [], recentOrders: [], alerts: [] });

  useEffect(() => {
    let cancelled = false;
    api.getDashboard().then((payload) => {
      if (cancelled) return;
      const settings = payload.settings || {};
      const alerts = [];
      if (!settings?.is_open) alerts.push({ id: 'closed', tone: 'amber', title: 'Loja fechada', text: 'Revise Loja > Operação caso isso não tenha sido planejado.', target: 'operacao', label: 'Abrir operação' });
      if (!payload.metrics.products) alerts.push({ id: 'produtos', tone: 'red', title: 'Sem produtos cadastrados', text: 'Cadastre itens em Catálogo para a loja operar normalmente.', target: 'produtos', label: 'Cadastrar produtos' });
      if (!payload.metrics.categories) alerts.push({ id: 'categorias', tone: 'red', title: 'Sem categorias criadas', text: 'As categorias ajudam o cliente a encontrar o cardápio com menos esforço.', target: 'estrutura', label: 'Organizar catálogo' });
      if (payload.inventory?.lowStockCount) {
        const names = payload.inventory.lowStockProducts.slice(0, 3).map((product: any) => product.nome).join(', ');
        alerts.push({ id: 'estoque', tone: 'amber', title: `${payload.inventory.lowStockCount} produto(s) com estoque baixo`, text: names ? `${names}${payload.inventory.lowStockCount > 3 ? ' e outros.' : '.'}` : 'Revise os níveis de estoque do catálogo.', target: 'produtos', label: 'Ver catálogo' });
      }
      if (!payload.activeHomeBlocks) alerts.push({ id: 'home', tone: 'blue', title: 'Home sem blocos ativos', text: 'Use a Home para comunicar promoção, institucional e informativos.', target: 'home', label: 'Editar home' });
      if (settings?.logisticsOptions && !settings.logisticsOptions.allowPickup && !settings.logisticsOptions.allowDelivery) alerts.push({ id: 'logistica', tone: 'red', title: 'Nenhuma modalidade ativa', text: 'Retirada e entrega estão desativadas ao mesmo tempo.', target: 'entrega_pagamento', label: 'Revisar logística' });
      setState({
        loading: false,
        rawPayload: payload,
        faturamentoHoje: payload.metrics.revenueToday,
        pedidosHoje: payload.metrics.ordersToday,
        ticketMedio: payload.metrics.averageOrderToday,
        emAndamento: payload.metrics.pendingOrders,
        faturamentoSemana: payload.metrics.revenueWeek,
        weeklyData: payload.weekly.map((day: any) => ({ dia: day.label, total: day.total })),
        recentOrders: payload.recentOrders,
        alerts,
      });
    }).catch(() => !cancelled && setState((prev: any) => ({ ...prev, loading: false })));
    return () => { cancelled = true; };
  }, [api]);

  if (state.loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const maxWeekly = Math.max(...state.weeklyData.map((item: any) => item.total), 1);
  const quickActions = [
    { id: 'pedidos', title: 'Operar pedidos', icon: ShoppingBag },
    { id: 'produtos', title: 'Cadastrar produto', icon: Package },
    { id: 'estrutura', title: 'Organizar catálogo', icon: Tags },
    { id: 'home', title: 'Editar home', icon: Megaphone },
    { id: 'divulgar_loja', title: 'Divulgar loja', icon: Share2, action: onOpenShare },
    { id: 'promocoes_fidelidade', title: 'Promoções e cupons', icon: TicketPercent },
  ];
  const metrics = [
    { title: 'Faturamento de hoje', value: `R$ ${state.faturamentoHoje.toFixed(2).replace('.', ',')}`, icon: DollarSign, tone: 'bg-emerald-50 text-emerald-600' },
    { title: 'Pedidos de hoje', value: String(state.pedidosHoje), icon: ShoppingBag, tone: 'bg-blue-50 text-blue-600' },
    { title: 'Ticket médio de hoje', value: `R$ ${state.ticketMedio.toFixed(2).replace('.', ',')}`, icon: TrendingUp, tone: 'bg-purple-50 text-purple-600' },
    { title: 'Pedidos em andamento', value: String(state.emAndamento), icon: Clock3, tone: 'bg-amber-50 text-amber-600' },
  ];

  const lowStockProducts = state.rawPayload?.inventory?.lowStockProducts || [];

  const statusTone = (status: string) => {
    const normalized = (status || '').toLowerCase();
    if (normalized.includes('pendent')) return 'border-amber-200 bg-amber-50 text-amber-700';
    if (normalized.includes('prepar') || normalized.includes('aceito')) return 'border-blue-200 bg-blue-50 text-blue-700';
    if (normalized.includes('pronto') || normalized.includes('rota')) return 'border-purple-200 bg-purple-50 text-purple-700';
    if (normalized.includes('entreg') || normalized.includes('conclu')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (normalized.includes('cancel')) return 'border-rose-200 bg-rose-50 text-rose-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
  };

  return (
    <div className="space-y-4">
      {!onboardingCompleted && (
        <ActivationChecklist payload={state.rawPayload} navigateTo={navigateTo} onOpenWizard={onOpenWizard} />
      )}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.title} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-slate-500">{metric.title}</p>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${metric.tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">{metric.value}</p>
            </article>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7 xl:col-span-8">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Desempenho semanal</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Total da semana: <strong className="font-semibold text-slate-800">R$ {state.faturamentoSemana.toFixed(2).replace('.', ',')}</strong>
                </p>
              </div>
              <span className="text-xs font-medium text-slate-400">Ultimos 7 dias</span>
            </div>

            {state.weeklyData.length ? (
              <div className="flex h-36 items-end justify-between gap-2 pt-3">
                {state.weeklyData.map((item: any) => {
                  const height = Math.max((item.total / maxWeekly) * 100, 6);
                  return (
                    <div key={item.dia} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                      <span className="max-w-full truncate text-[10px] font-medium text-slate-500">
                        R$ {item.total >= 1000 ? `${(item.total / 1000).toFixed(1)}k` : item.total.toFixed(0)}
                      </span>
                      <div className="flex h-full w-full max-w-8 items-end overflow-hidden rounded-t-sm bg-slate-100">
                        <div className="w-full rounded-t-sm bg-emerald-600/80 transition-colors hover:bg-emerald-600" style={{ height: `${height}%` }} />
                      </div>
                      <span className="truncate text-[11px] font-medium text-slate-600">{item.dia}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid h-36 place-items-center text-xs text-slate-500">Ainda nao ha dados para o periodo.</div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h2 className="text-sm font-semibold text-slate-900">Pedidos recentes</h2>
              <button type="button" onClick={() => navigateTo('pedidos')} className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline">
                Ver fila completa
              </button>
            </div>

            <div className="mt-1 divide-y divide-slate-100">
              {!state.recentOrders.length ? (
                <div className="py-6 text-center text-xs text-slate-500">Ainda nao existem pedidos recentes.</div>
              ) : (
                state.recentOrders.slice(0, 5).map((order: any) => (
                  <div key={order._id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="w-12 shrink-0 text-xs font-semibold text-slate-900">#{String(order._id || '').slice(-4).toUpperCase()}</span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-800">{order.cliente?.nome || 'Cliente sem nome'}</p>
                        <p className="text-[11px] text-slate-400">{new Date(order.createdAt).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusTone(order.status)}`}>{order.status || 'Sem status'}</span>
                      <span className="w-20 text-right text-xs font-semibold text-slate-900">R$ {(order.total || 0).toFixed(2).replace('.', ',')}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-4 lg:col-span-5 xl:col-span-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-900">Acoes necessarias</h2>
            </div>
            <div className="mt-2.5 space-y-2">
              {!state.alerts.length ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  Tudo certo. Nenhuma pendencia detectada.
                </div>
              ) : (
                state.alerts.map((alert: any) => (
                  <div key={alert.id} className={`flex items-start justify-between gap-2.5 rounded-lg border p-2.5 text-xs ${alert.tone === 'red' ? 'border-rose-200 bg-rose-50 text-rose-900' : alert.tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
                    <div className="min-w-0">
                      <p className="font-semibold">{alert.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] opacity-75">{alert.text}</p>
                    </div>
                    <button type="button" onClick={() => navigateTo(alert.target)} className="shrink-0 pt-0.5 text-xs font-semibold text-emerald-700 hover:underline">
                      {alert.label}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {lowStockProducts.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-amber-600" />
                  <h2 className="text-sm font-semibold text-slate-900">Estoque baixo</h2>
                </div>
                <button type="button" onClick={() => navigateTo('produtos')} className="text-xs font-medium text-emerald-700 hover:underline">Ver catalogo</button>
              </div>
              <div className="mt-2 divide-y divide-slate-100">
                {lowStockProducts.slice(0, 4).map((product: any) => (
                  <div key={product._id || product.nome} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <span className="truncate font-medium text-slate-800">{product.nome}</span>
                    <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Abaixo do minimo</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2.5 text-sm font-semibold text-slate-900">Atalhos rapidos</h2>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.id} type="button" onClick={() => action.action ? action.action() : navigateTo(action.id)} className="group flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-100">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-emerald-600" />
                    <span className="truncate text-xs font-medium text-slate-800">{action.title}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

