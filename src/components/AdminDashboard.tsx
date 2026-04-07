import React, { useState, useEffect } from 'react';
import { Lock, TrendingUp, ShoppingBag, DollarSign, Users, Package, Settings, ChevronRight, Clock } from 'lucide-react';
import AdminLayout from './AdminLayout';
import AdminOrders from './AdminOrders';
import AdminProducts from './AdminProducts';
import AdminCategorias from './AdminCategorias';
import AdminConfig from './AdminConfig';
import AdminVitrine from './AdminVitrine';
import AdminHomeBlocks from './AdminHomeBlocks';
import AdminClientes from './AdminClientes';
import AdminCoupons from './AdminCoupons';
import AdminLogs from './AdminLogs';
import { useToast } from './Toast';


export default function AdminDashboardWrapper() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
  const [loginData, setLoginData] = useState({ email: '', senha: '' });
  const [setupData, setSetupData] = useState({ nome: '', email: '', senha: '' });
  const [needsSetup, setNeedsSetup] = useState(false);
  const [viewSetup, setViewSetup] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const { showToast } = useToast();

  useEffect(() => {
    fetch('/api/admin/check-setup')
      .then(res => res.json())
      .then(data => {
        if (data.needsSetup) {
          setNeedsSetup(true);
          setViewSetup(true);
        }
      });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });
      const data = await res.json();
      if (data.sucesso) {
        localStorage.setItem('admin_token', data.token);
        localStorage.setItem('admin_info', JSON.stringify(data.admin));
        setToken(data.token);
        showToast(`Bem-vindo, ${data.admin.nome}!`, 'success');
      } else {
        showToast(data.erro || 'Credenciais inválidas', 'error');
      }
    } catch (error) {
      showToast('Erro ao conectar com o servidor', 'error');
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupData)
      });
      const data = await res.json();
      if (data.sucesso) {
        showToast('Admin Master criado! Agora faça login.', 'success');
        setNeedsSetup(false);
        setViewSetup(false);
        setLoginData({ email: setupData.email, senha: '' });
      } else {
        showToast(data.erro || 'Erro no setup', 'error');
      }
    } catch (e) {
      showToast('Erro ao criar admin', 'error');
    }
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_info');
    setToken(null);
    showToast('Sessão encerrada ou expirada', 'info');
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md text-center border border-gray-100">
          <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <Lock className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
            {viewSetup ? 'Configurar Master' : 'Painel Admin'}
          </h1>
          <p className="text-gray-500 mb-10 font-medium">
            {viewSetup ? 'Defina as credenciais do primeiro administrador' : 'Faça login para gerenciar sua loja'}
          </p>
          
          {viewSetup ? (
            <form onSubmit={handleSetup} className="space-y-5">
              <div className="text-left">
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">Seu Nome</label>
                <input
                  type="text"
                  placeholder="Seu Nome Completo"
                  value={setupData.nome}
                  onChange={(e) => setSetupData({...setupData, nome: e.target.value})}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium"
                  required
                />
              </div>
              <div className="text-left">
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">E-mail Administrativo</label>
                <input
                  type="email"
                  placeholder="admin@exemplo.com"
                  value={setupData.email}
                  onChange={(e) => setSetupData({...setupData, email: e.target.value})}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium"
                  required
                />
              </div>
              <div className="text-left">
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">Senha mestra</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={setupData.senha}
                  onChange={(e) => setSetupData({...setupData, senha: e.target.value})}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium"
                  required
                />
              </div>
              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-5 rounded-2xl transition-all shadow-xl shadow-emerald-900/10 active:scale-[0.98] mt-4">
                Criar Acesso Master
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="text-left">
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">E-mail Administrativo</label>
                <input
                  type="email"
                  placeholder="admin@exemplo.com"
                  value={loginData.email}
                  onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium"
                  required
                />
              </div>
              <div className="text-left">
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">Senha</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={loginData.senha}
                  onChange={(e) => setLoginData({...loginData, senha: e.target.value})}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium"
                  required
                />
              </div>
              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-5 rounded-2xl transition-all shadow-xl shadow-emerald-900/10 active:scale-[0.98] mt-4">
                Entrar no Sistema
              </button>
              {needsSetup && (
                <button 
                  type="button" 
                  onClick={() => setViewSetup(true)}
                  className="mt-4 text-xs font-bold text-emerald-600 hover:underline"
                >
                  Voltar para tela de setup
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <AdminLayout activeTab={activeTab} setActiveTab={setActiveTab} onLogout={logout}>
      {activeTab === 'dashboard' && <DashboardContent token={token} setActiveTab={setActiveTab} onUnauthorized={logout} />}
      {activeTab === 'pedidos' && <AdminOrders token={token} onUnauthorized={logout} />}
      {activeTab === 'produtos' && <AdminProducts token={token} onUnauthorized={logout} />}
      {activeTab === 'categorias' && <AdminCategorias token={token} onUnauthorized={logout} />}
      {activeTab === 'vitrine' && <AdminVitrine token={token} onUnauthorized={logout} />}
      {activeTab === 'home_blocks' && <AdminHomeBlocks token={token} onUnauthorized={logout} />}
      {activeTab === 'clientes' && <AdminClientes token={token} onUnauthorized={logout} />}
      {activeTab === 'cupons' && <AdminCoupons token={token} onUnauthorized={logout} />}
      {activeTab === 'config' && <AdminConfig token={token} onUnauthorized={logout} />}
      {activeTab === 'logs' && <AdminLogs token={token} onUnauthorized={logout} />}
    </AdminLayout>
  );
}

function DashboardContent({ token, setActiveTab, onUnauthorized }: { token: string, setActiveTab: (tab: string) => void, onUnauthorized: () => void }) {
  const [stats, setStats] = useState({
    vendasHoje: 0,
    pedidosHoje: 0,
    ticketMedio: 0,
    clientesAtivos: 0,
    vendasSemana: 0,
    weeklyData: [] as { dia: string, total: number }[]
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/pedidos', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.status === 401 || res.status === 403) {
           onUnauthorized();
           return;
        }

        const data = await res.json();
        if (data.sucesso) {
          const hoje = new Date().setHours(0,0,0,0);
          const pedidosHoje = data.pedidos.filter((p: any) => new Date(p.createdAt).setHours(0,0,0,0) === hoje);
          
          const vendasHoje = pedidosHoje.reduce((acc: number, p: any) => acc + (p.total || 0), 0);
          const ticketMedio = pedidosHoje.length > 0 ? vendasHoje / pedidosHoje.length : 0;

          // Dados da Semana
          const semanaValida = new Date();
          semanaValida.setDate(semanaValida.getDate() - 7);
          const pedidosSemana = data.pedidos.filter((p: any) => new Date(p.createdAt) >= semanaValida);
          const vendasSemana = pedidosSemana.reduce((acc: number, p: any) => acc + (p.total || 0), 0);

          // Agrupar p/ Gráfico
          const last7Days = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            d.setHours(0,0,0,0);
            return d;
          });

          const weeklyData = last7Days.map(dia => {
            const total = data.pedidos
              .filter((p: any) => new Date(p.createdAt).toDateString() === dia.toDateString())
              .reduce((acc: number, p: any) => acc + (p.total || 0), 0);
            return {
              dia: dia.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
              total
            };
          });

          setStats({
            vendasHoje,
            pedidosHoje: pedidosHoje.length,
            ticketMedio,
            clientesAtivos: new Set(data.pedidos.map((p: any) => p.cliente?.nome)).size,
            vendasSemana,
            weeklyData
          });

          setRecentOrders([...data.pedidos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5));
        }
      } catch (error) { console.error(error); } finally { setLoading(false); }
    };
    fetchStats();
  }, [token]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>;

  const maxWeekly = Math.max(...stats.weeklyData.map(d => d.total), 1);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Análise Geral</h2>
          <p className="text-gray-500 mt-1 font-medium">Veja o faturamento e crescimento da sua operação.</p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs font-bold bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm text-gray-400 uppercase tracking-widest">
           <Clock className="w-3 h-3 text-emerald-500" /> Atualizado: {new Date().toLocaleTimeString()}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:border-emerald-200 transition-all">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all">
            <DollarSign className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Vendas Hoje</p>
            <p className="text-2xl font-black text-gray-900">R$ {stats.vendasHoje.toFixed(2).replace('.', ',')}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:border-blue-200 transition-all">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pedidos Hoje</p>
            <p className="text-2xl font-black text-gray-900">{stats.pedidosHoje}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:border-purple-200 transition-all">
          <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-all">
            <TrendingUp className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Faturamento Semanal</p>
            <p className="text-2xl font-black text-gray-900">R$ {stats.vendasSemana.toFixed(2).replace('.', ',')}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:border-orange-200 transition-all">
          <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-all">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Recorrência Clientes</p>
            <p className="text-2xl font-black text-gray-900">{stats.clientesAtivos}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de Vendas Semanal */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-8 flex flex-col">
          <h3 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-2 uppercase tracking-tight">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            Desempenho da Semana
          </h3>
          <div className="flex-1 flex items-end justify-between gap-2 sm:gap-4 h-64 min-h-[250px]">
            {stats.weeklyData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-4 group">
                <div className="relative w-full h-full flex flex-col justify-end">
                   <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded-lg font-bold whitespace-nowrap z-10">
                     R$ {d.total.toFixed(0)}
                   </div>
                   <div 
                     className="w-full bg-emerald-50 max-w-[50px] mx-auto rounded-xl transition-all duration-700 ease-out border border-transparent group-hover:bg-emerald-500 group-hover:border-emerald-600"
                     style={{ height: `${(d.total / maxWeekly) * 100}%` }}
                   />
                </div>
                <span className="text-[10px] sm:text-xs font-black text-gray-400 group-hover:text-gray-900 uppercase tracking-widest">{d.dia}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Últimos Pedidos Simples */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-8 border-b border-gray-50 flex justify-between items-center">
            <h3 className="text-xl font-bold text-gray-900 uppercase tracking-tight">Pedidos Recentes</h3>
            <button onClick={() => setActiveTab('pedidos')} className="text-xs font-black text-emerald-600 hover:underline uppercase tracking-widest">Ver Todos</button>
          </div>
          <div className="divide-y divide-gray-50 flex-1">
            {recentOrders.map(p => (
              <div key={p._id} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center font-black text-gray-400 text-xs">#{p._id.slice(-3).toUpperCase()}</div>
                   <div>
                     <p className="text-sm font-bold text-gray-900 leading-none mb-1">{p.cliente?.nome || 'Cliente'}</p>
                     <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">{new Date(p.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                   </div>
                 </div>
                 <span className="text-sm font-black text-emerald-600">R$ {(p.total || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
