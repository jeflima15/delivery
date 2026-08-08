import React, { useState, useEffect } from 'react';
import { Search, Filter, Eye, X, MapPin, CreditCard, Clock, CheckCircle, ChefHat, Bike, PackageX, CheckCheck, MessageCircle, Phone, Store, RefreshCw, Printer, Volume2, LayoutGrid, List, ShoppingBag } from 'lucide-react';
import PrintOrder from './PrintOrder';
import { formatWhatsAppLink } from '../lib/phone';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

export default function AdminOrders({ token, onUnauthorized, novosPedidosCount, setNovosPedidosCount, soundEnabled, setSoundEnabled, playBeep, audioUnlocked }: { token: string, onUnauthorized: () => void, novosPedidosCount: number, setNovosPedidosCount: (n: number) => void, soundEnabled: boolean, setSoundEnabled: (b: boolean) => void, playBeep: () => void, audioUnlocked: boolean }) {
  const api = useTenantAdminApi();
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kds'>('list');
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const { showToast } = useToast();



  const fetchPedidos = async () => {
    try {
      const data = await api.listActiveOrders();
      if (data.success) {
        setPedidos(data.items);
        setLastFetchTime(new Date());
        setFetchError(false);
      }
    } catch (error: any) {
      setFetchError(true);
      if (error?.status === 401) {
        onUnauthorized();
        return;
      }
      showToast('Erro ao buscar pedidos', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPedidos();
    
    const handleDashboardUpdate = (e: any) => {
      setPedidos(e.detail);
      setLastFetchTime(new Date());
      setFetchError(false);
      setLoading(false);
    };
    window.addEventListener('dashboardOrdersUpdated', handleDashboardUpdate);
    
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') fetchPedidos(); };

    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('dashboardOrdersUpdated', handleDashboardUpdate);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [token]);

  const getStatusLabel = (status: string, tipo: string) => {
    if (status === 'Saiu para Entrega') {
      return tipo === 'pickup' ? 'Pronto para Retirada' : 'Saiu para Entrega';
    }
    if (status === 'Entregue') {
      return tipo === 'pickup' ? 'Retirado' : 'Entregue';
    }
    return status;
  };

  const updateOrderStatus = async (id: string, status: string, reason?: string) => {

    try {
      const data = await api.updateOrderStatus(id, status, reason);
      if (data.success) {
        showToast(`Status atualizado para ${status}`, 'success');
        fetchPedidos();
        if (selectedOrder && selectedOrder._id === id) {
          setSelectedOrder({ ...selectedOrder, status });
        }
      }
    } catch (error) {
      showToast('Erro ao atualizar pedido', 'error');
    }
  };

  const handleCancelConfirm = () => {
    if (cancelReason.length < 3) {
      showToast('Por favor, informe um motivo válido (min 3 caracteres)', 'error');
      return;
    }
    updateOrderStatus(selectedOrder._id, 'Cancelado', cancelReason);
    setIsCancelModalOpen(false);
  };

  const handleStatusAdvance = async (e: React.MouseEvent, pedido: any, novoStatus: string) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const data = await api.updateOrderStatus(pedido._id, novoStatus);

      if (data.success) {
        showToast(`Status atualizado para ${novoStatus}`, 'success');
        fetchPedidos();
        if (selectedOrder && selectedOrder._id === pedido._id) {
          setSelectedOrder({ ...selectedOrder, status: novoStatus });
        }
      }
    } catch (error: any) {
      showToast(error.message || 'Erro ao atualizar pedido', 'error');
    }
  };

  const toggleOrderSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBatchAdvance = async (novoStatus: string) => {
    if (selectedOrderIds.length === 0) return;
    setBatchActionLoading(true);
    let successCount = 0;
    try {
      await Promise.all(
        selectedOrderIds.map(async (id) => {
          const res = await api.updateOrderStatus(id, novoStatus);
          if (res.success) successCount++;
        })
      );
      showToast(`${successCount} pedidos atualizados para ${novoStatus}`, 'success');
      setSelectedOrderIds([]);
      fetchPedidos();
    } catch (error) {
      showToast('Erro ao atualizar pedidos em lote', 'error');
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleNotifyClient = (pedido: any) => {
    if (!pedido.cliente?.telefone) {
      showToast('Cliente não possui telefone cadastrado.', 'error');
      return;
    }

    const telefoneFormatado = pedido.cliente.telefone.replace(/\D/g, '');
    if (!telefoneFormatado) {
      showToast('Telefone inválido.', 'error');
      return;
    }

    const nome = pedido.cliente.nome || 'Cliente';
    const id_curto = pedido._id.slice(-6).toUpperCase();
    let mensagem = '';

    if (pedido.status === 'Preparando') {
      mensagem = `Olá ${nome}! Recebemos o seu pedido #${id_curto} e ele já está na cozinha! 👨‍🍳`;
    } else if (pedido.status === 'Saiu para Entrega') {
      mensagem = pedido.tipo_entrega === 'pickup'
        ? `Boas notícias, ${nome}! Seu pedido #${id_curto} já está pronto para retirada! 🛍️✨`
        : `Boas notícias, ${nome}! Seu pedido #${id_curto} acabou de sair para entrega! 🛵💨`;
    } else {
      mensagem = `Olá ${nome}! O status do seu pedido #${id_curto} foi atualizado para: ${getStatusLabel(pedido.status, pedido.tipo_entrega)}.`;
    }


    window.open(formatWhatsAppLink(telefoneFormatado, mensagem), '_blank');
  };

  const filteredPedidos = pedidos.filter(p => {
    const matchStatus = statusFilter === 'Todos' || p.status === statusFilter;
    const matchSearch = (p.cliente?.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p._id || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pendente': return 'bg-amber-100 text-amber-700';
      case 'Preparando': return 'bg-blue-100 text-blue-700';
      case 'Saiu para Entrega': return 'bg-purple-100 text-purple-700';
      case 'Entregue': return 'bg-emerald-100 text-emerald-700';
      case 'Cancelado': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatarData = (dataString: string) => {
    if (!dataString) return '-';
    return new Date(dataString).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    }).replace(',', ' às ');
  };

  const getStatusTime = (status: string) => {
    if (!selectedOrder) return null;
    if (selectedOrder.historico_status && selectedOrder.historico_status.length > 0) {
      const record = selectedOrder.historico_status.find((h: any) => h.status === status);
      if (record && record.data) {
        return new Date(record.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
    }
    if (status === 'Pendente' && selectedOrder.createdAt) return new Date(selectedOrder.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (status === selectedOrder.status && selectedOrder.updatedAt) return new Date(selectedOrder.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return null;
  };

  const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {!audioUnlocked && soundEnabled && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <Volume2 className="h-5 w-5 text-blue-600" />
            <div>
              <p className="font-bold text-sm">Ative o som de novos pedidos</p>
              <p className="text-xs text-blue-700 mt-0.5">O navegador bloqueia o áudio até você interagir com a página.</p>
            </div>
          </div>
          <button 
            onClick={() => {
              playBeep();
              showToast('Som ativado e testado!', 'success');
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            Ativar Som
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="cursor-pointer flex-1" onClick={() => setNovosPedidosCount(0)}>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            Gestão de Pedidos
            {novosPedidosCount > 0 && (
              <span className="flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full animate-bounce">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                {novosPedidosCount} {novosPedidosCount === 1 ? 'novo pedido' : 'novos'}
              </span>
            )}
            {lastFetchTime && !fetchError && (
              <span className="text-xs font-normal text-gray-500 flex items-center gap-1 ml-2">
                <RefreshCw className="w-3 h-3 text-gray-400" />
                Atualizado às {lastFetchTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            {fetchError && (
              <span className="text-xs font-bold text-red-500 flex items-center gap-1 ml-2 bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Sem conexão
              </span>
            )}
          </h2>
          <p className="text-gray-500 mt-1">Acompanhe e atualize o status das entregas.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
        <div className="flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm"><button aria-label="Visualizar lista" onClick={() => setViewMode('list')} className={cn('grid h-9 w-9 place-items-center rounded-lg', viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-400')}><List className="h-4 w-4" /></button><button aria-label="Visualizar painel de producao" onClick={() => setViewMode('kds')} className={cn('grid h-9 w-9 place-items-center rounded-lg', viewMode === 'kds' ? 'bg-gray-900 text-white' : 'text-gray-400')}><LayoutGrid className="h-4 w-4" /></button></div>
        <button
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            if (next) {
              playBeep();
              showToast('Som de novos pedidos ativado', 'success');
            }
          }}
          className={cn(
            "p-3 rounded-2xl border transition-all flex items-center gap-2 font-bold text-[10px] uppercase tracking-widest bg-white shadow-sm hover:border-emerald-500 shrink-0",
            soundEnabled ? "text-emerald-600 border-emerald-100" : "text-gray-400 border-gray-100"
          )}
        >
          {soundEnabled ? (
            <><span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping shrink-0" /> Som Ativo</>
          ) : (
            <><X className="w-3 h-3" /> Mudo</>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            playBeep();
            showToast('Teste de alerta reproduzido', 'info');
          }}
          className="flex shrink-0 items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3 text-[10px] font-bold uppercase tracking-widest text-gray-500 shadow-sm transition-all hover:border-emerald-500 hover:text-emerald-600"
        >
          <Volume2 className="h-4 w-4" />
          Testar alerta
        </button>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente ou ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
          />
        </div>
        <div className="relative min-w-[200px]">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none appearance-none font-medium text-gray-700"
          >
            <option value="Todos">Todos os Status</option>
            <option value="Pendente">Pendente</option>
            <option value="Preparando">Preparando</option>
            <option value="Saiu para Entrega">Pronto / Em Rota</option>
            <option value="Entregue">Finalizado / Retirado</option>

            <option value="Cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      {viewMode === 'kds' ? <div className="grid gap-4 xl:grid-cols-3">{[
        ['Pendente', 'Novos pedidos', 'border-amber-200 bg-amber-50/40'],
        ['Preparando', 'Em preparo', 'border-blue-200 bg-blue-50/40'],
        ['Saiu para Entrega', 'Prontos / em rota', 'border-purple-200 bg-purple-50/40'],
      ].map(([status, title, tone]) => {
        const columnOrders = filteredPedidos.filter((order) => order.status === status);
        const allSelected = columnOrders.length > 0 && columnOrders.every(o => selectedOrderIds.includes(o._id));
        const handleSelectAll = () => {
          if (allSelected) {
            setSelectedOrderIds(prev => prev.filter(id => !columnOrders.some(o => o._id === id)));
          } else {
            const newIds = columnOrders.map(o => o._id).filter(id => !selectedOrderIds.includes(id));
            setSelectedOrderIds(prev => [...prev, ...newIds]);
          }
        };
        return (
          <section key={status} className={cn('min-h-52 rounded-2xl border p-3', tone)}>
            <header className="flex items-center justify-between px-1 pb-3">
              <div className="flex items-center gap-2">
                {columnOrders.length > 0 && (
                  <input type="checkbox" checked={allSelected} onChange={handleSelectAll} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                )}
                <h3 className="font-black text-gray-900">{title}</h3>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-gray-600">{columnOrders.length}</span>
            </header>
            <div className="space-y-3">
              {columnOrders.map((order) => (
                <article key={order._id} className={cn("rounded-xl border bg-white p-4 shadow-sm transition-all relative overflow-hidden", selectedOrderIds.includes(order._id) ? "border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/20" : "border-gray-200")}>
                  {selectedOrderIds.includes(order._id) && <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500 rounded-bl-2xl flex items-center justify-center"><CheckCheck className="w-4 h-4 text-white" /></div>}
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selectedOrderIds.includes(order._id)} onChange={(e) => toggleOrderSelection(order._id)} className="mt-1 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0" />
                    <button onClick={() => setSelectedOrder(order)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-black text-gray-900">#{order.orderNumber || order._id.slice(-6).toUpperCase()}</p>
                          <p className="mt-1 text-sm font-semibold text-gray-700">{order.cliente?.nome || 'Cliente nao informado'}</p>
                        </div>
                        <strong className="text-sm text-emerald-600">R$ {(order.total || 0).toFixed(2).replace('.', ',')}</strong>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">{order.itens?.length || 0} item(ns) · {formatarData(order.createdAt)}</p>
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2 pl-7">
                    <button onClick={() => setSelectedOrder(order)} className="h-9 flex-1 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50">Detalhes</button>
                    {status === 'Pendente' && <button onClick={(event) => handleStatusAdvance(event, order, 'Preparando')} className="h-9 flex-1 rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700">Aceitar</button>}
                    {status === 'Preparando' && <button onClick={(event) => handleStatusAdvance(event, order, 'Saiu para Entrega')} className="h-9 flex-1 rounded-lg bg-blue-600 text-xs font-bold text-white hover:bg-blue-700">Pronto</button>}
                    {status === 'Saiu para Entrega' && <button onClick={(event) => handleStatusAdvance(event, order, 'Entregue')} className="h-9 flex-1 rounded-lg bg-gray-900 text-xs font-bold text-white hover:bg-black">Concluir</button>}
                  </div>
                </article>
              ))}
              {columnOrders.length === 0 && <p className="rounded-xl border border-dashed border-gray-200 bg-white/70 p-6 text-center text-xs text-gray-400">Nenhum pedido nesta etapa.</p>}
            </div>
          </section>
        );
      })}</div> : <>
      <div className="grid gap-3 md:hidden">{loading ? <div className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">Carregando pedidos...</div> : filteredPedidos.map((pedido) => <article key={pedido._id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><button onClick={() => setSelectedOrder(pedido)} className="w-full text-left"><div className="flex items-start justify-between gap-2"><div><p className="font-black text-gray-900">#{pedido.orderNumber || pedido._id.slice(-6).toUpperCase()}</p><p className="mt-1 text-sm font-semibold text-gray-700">{pedido.cliente?.nome || 'Cliente nao informado'}</p></div><span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold', getStatusColor(pedido.status))}>{getStatusLabel(pedido.status, pedido.tipo_entrega)}</span></div><div className="mt-3 flex items-end justify-between"><div><p className="text-xs text-gray-500">{formatarData(pedido.createdAt)}</p><p className="mt-1 text-xs uppercase text-gray-400">{pedido.metodo_pagamento || 'Nao informado'}</p></div><strong className="text-lg text-emerald-600">R$ {(pedido.total || 0).toFixed(2).replace('.', ',')}</strong></div></button><div className="mt-3 flex gap-2"><button onClick={() => setSelectedOrder(pedido)} className="h-10 flex-1 rounded-xl border border-gray-200 text-xs font-bold text-gray-600">Ver pedido</button>{pedido.status === 'Pendente' && <button onClick={(event) => handleStatusAdvance(event, pedido, 'Preparando')} className="h-10 flex-1 rounded-xl bg-emerald-600 text-xs font-bold text-white">Aceitar</button>}{pedido.status === 'Preparando' && <button onClick={(event) => handleStatusAdvance(event, pedido, 'Saiu para Entrega')} className="h-10 flex-1 rounded-xl bg-blue-600 text-xs font-bold text-white">Marcar pronto</button>}{pedido.status === 'Saiu para Entrega' && <button onClick={(event) => handleStatusAdvance(event, pedido, 'Entregue')} className="h-10 flex-1 rounded-xl bg-gray-900 text-xs font-bold text-white">Concluir</button>}</div></article>)}</div>
      {/* Tabela de Dados */}
      <div className="hidden bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider font-semibold">
                <th className="p-5 w-12">
                  <input type="checkbox" onChange={(e) => {
                    const viewOrders = filteredPedidos.filter(p => ['Pendente', 'Preparando', 'Saiu para Entrega'].includes(p.status));
                    if (e.target.checked) setSelectedOrderIds(viewOrders.map(o => o._id));
                    else setSelectedOrderIds([]);
                  }} checked={filteredPedidos.length > 0 && filteredPedidos.filter(p => ['Pendente', 'Preparando', 'Saiu para Entrega'].includes(p.status)).every(o => selectedOrderIds.includes(o._id))} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                </th>
                <th className="p-5">ID / Data</th>
                <th className="p-5">Cliente</th>
                <th className="p-5">Total</th>
                <th className="p-5">Status</th>
                <th className="p-5 text-right w-auto">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">Carregando pedidos...</td>
                </tr>
              ) : filteredPedidos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500">
                    <ShoppingBag className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
                    <p className="font-black text-gray-900 text-base">Seus pedidos aparecerão aqui</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Quando seus clientes começarem a pedir pela sua loja, você acompanhará e gerenciará tudo nesta tela.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPedidos.map(pedido => (
                  <tr key={pedido._id} className={cn("hover:bg-gray-50/50 transition-colors cursor-pointer", selectedOrderIds.includes(pedido._id) && "bg-emerald-50/30 hover:bg-emerald-50/50")} onClick={() => toggleOrderSelection(pedido._id)}>
                    <td className="p-5" onClick={(e) => e.stopPropagation()}>
                      {['Pendente', 'Preparando', 'Saiu para Entrega'].includes(pedido.status) ? (
                        <input type="checkbox" checked={selectedOrderIds.includes(pedido._id)} onChange={() => toggleOrderSelection(pedido._id)} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                      ) : (
                        <div className="w-4 h-4" />
                      )}
                    </td>
                    <td className="p-5" onClick={(e) => { e.stopPropagation(); setSelectedOrder(pedido); }}>
                      <p className="font-bold text-gray-900">#{pedido._id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatarData(pedido.createdAt)}</p>
                    </td>
                    <td className="p-5" onClick={(e) => { e.stopPropagation(); setSelectedOrder(pedido); }}>
                      <p className="font-bold text-gray-900">{pedido.cliente?.nome || 'Cliente não informado'}</p>
                      <p className="text-xs text-gray-500 mt-1">{pedido.cliente?.telefone || '-'}</p>
                    </td>
                    <td className="p-5" onClick={(e) => { e.stopPropagation(); setSelectedOrder(pedido); }}>
                      <p className="font-bold text-emerald-600">R$ {(pedido.total || 0).toFixed(2).replace('.', ',')}</p>
                      <p className="text-xs text-gray-500 mt-1 uppercase">{pedido.metodo_pagamento || 'Não informado'}</p>
                    </td>
                    <td className="p-5" onClick={(e) => { e.stopPropagation(); setSelectedOrder(pedido); }}>
                      <span className={cn("px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap", getStatusColor(pedido.status))}>
                        {getStatusLabel(pedido.status, pedido.tipo_entrega)}
                      </span>

                    </td>
                    <td className="p-5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedOrder(pedido)}
                          className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl transition-colors font-medium text-sm"
                        >
                          <Eye className="w-4 h-4" /> Detalhes
                        </button>

                        {/* Botão Notificar WhatsApp */}
                        {pedido.status !== 'Cancelado' && pedido.status !== 'Entregue' && (
                          <button
                            onClick={() => handleNotifyClient(pedido)}
                            className="inline-flex items-center gap-2 bg-green-100 hover:bg-green-200 text-green-700 px-4 py-2 rounded-xl transition-colors font-medium text-sm"
                          >
                            <MessageCircle className="w-4 h-4" /> Notificar
                          </button>
                        )}

                        {/* Ações Rápidas (One-Click) */}
                        {pedido.status === 'Pendente' && (
                          <button
                            onClick={(e) => handleStatusAdvance(e, pedido, 'Preparando')}
                            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl transition-colors font-bold text-sm shadow-sm shadow-emerald-600/20"
                          >
                            👨‍🍳 Aceitar e Enviar p/ Cozinha
                          </button>
                        )}
                        {pedido.status === 'Preparando' && (
                          <button
                            onClick={(e) => handleStatusAdvance(e, pedido, 'Saiu para Entrega')}
                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors font-bold text-sm shadow-sm shadow-blue-600/20"
                          >
                            {pedido.tipo_entrega === 'pickup' ? (
                              <><Store className="w-4 h-4" /> 🛍️ Separar p/ Retirada</>
                            ) : (
                              <><Bike className="w-4 h-4" /> 🛵 Enviar para Entrega</>
                            )}
                          </button>
                        )}
                        {pedido.status === 'Saiu para Entrega' && (
                          <button
                            onClick={(e) => handleStatusAdvance(e, pedido, 'Entregue')}
                            className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-xl transition-colors font-bold text-sm shadow-sm shadow-gray-800/20"
                          >
                            <CheckCheck className="w-4 h-4" /> Concluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>}

      {/* Floating Action Bar */}
      {selectedOrderIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-4 rounded-full shadow-2xl z-40 flex items-center gap-6 animate-in slide-in-from-bottom-8">
          <span className="font-bold whitespace-nowrap"><span className="text-emerald-400">{selectedOrderIds.length}</span> pedidos selecionados</span>
          <div className="h-6 w-[1px] bg-gray-700"></div>
          <div className="flex gap-2">
            <button onClick={() => handleBatchAdvance('Preparando')} disabled={batchActionLoading} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold rounded-full transition-colors whitespace-nowrap">Aceitar / Preparar</button>
            <button onClick={() => handleBatchAdvance('Saiu para Entrega')} disabled={batchActionLoading} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-bold rounded-full transition-colors whitespace-nowrap">Marcar Prontos</button>
            <button onClick={() => handleBatchAdvance('Entregue')} disabled={batchActionLoading} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-xs font-bold rounded-full transition-colors whitespace-nowrap">Concluir</button>
            <button onClick={() => setSelectedOrderIds([])} className="p-2 text-gray-400 hover:text-white rounded-full transition-colors"><X className="w-5 h-5" /></button>
          </div>
        </div>
      )}

      {/* Modal de Detalhes Completo */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-0 backdrop-blur-sm animate-in fade-in duration-200 sm:p-4">
          <div className="flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl animate-in zoom-in-95 duration-200 sm:h-auto sm:max-h-[95vh] sm:rounded-3xl">
            {/* Modal Header */}
            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 p-4 md:p-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900 md:text-2xl">Pedido #{selectedOrder._id.slice(-6).toUpperCase()}</h3>
                <p className="text-sm text-gray-500 mt-1">{formatarData(selectedOrder.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => handleNotifyClient(selectedOrder)}
                  className="hidden items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1DA851] sm:flex"
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </button>
                <button
                  onClick={() => setSelectedOrder(null)}
                  aria-label="Fechar detalhes do pedido"
                  className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-xl transition-colors bg-white border border-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 flex flex-col md:flex-row bg-gray-50/50">
              {/* Esquerda: Timeline e Cliente */}
              <div className="flex-1 space-y-6 p-5 md:p-6 border-r border-gray-100">

                {/* Timeline do Pedido */}
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-900 mb-5 uppercase tracking-wider flex items-center gap-2"><Clock className="w-4 h-4 text-emerald-500" /> Linha do Tempo</h4>
                  <div className="relative pl-5 border-l-2 border-emerald-100 space-y-5 ml-2">
                    <div className="relative">
                      <div className={cn("absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-[3px]", ['Pendente', 'Preparando', 'Saiu para Entrega', 'Entregue'].includes(selectedOrder.status) ? "bg-emerald-500 border-white" : "bg-gray-200 border-white")} />
                      <p className={cn("text-sm font-bold flex items-center gap-2", ['Pendente', 'Preparando', 'Saiu para Entrega', 'Entregue'].includes(selectedOrder.status) ? "text-gray-900" : "text-gray-400")}>
                        Recebido
                        {getStatusTime('Pendente') && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">{getStatusTime('Pendente')}</span>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">O cliente fez o pedido e o sistema registrou.</p>
                    </div>
                    <div className="relative">
                      <div className={cn("absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-[3px]", ['Preparando', 'Saiu para Entrega', 'Entregue'].includes(selectedOrder.status) ? "bg-emerald-500 border-white" : "bg-gray-200 border-white")} />
                      <p className={cn("text-sm font-bold flex items-center gap-2", ['Preparando', 'Saiu para Entrega', 'Entregue'].includes(selectedOrder.status) ? "text-gray-900" : "text-gray-400")}>
                        Em Preparo
                        {getStatusTime('Preparando') && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-600">{getStatusTime('Preparando')}</span>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">O pedido foi confirmado pela loja e está sendo montado.</p>
                    </div>
                    <div className="relative">
                      <div className={cn("absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-[3px]", ['Saiu para Entrega', 'Entregue'].includes(selectedOrder.status) ? "bg-emerald-500 border-white" : "bg-gray-200 border-white")} />
                      <p className={cn("text-sm font-bold flex items-center gap-2", ['Saiu para Entrega', 'Entregue'].includes(selectedOrder.status) ? "text-gray-900" : "text-gray-400")}>
                        {selectedOrder.tipo_entrega === 'pickup' ? 'Disponível para Retirada' : 'Saiu para Entrega'}
                        {getStatusTime('Saiu para Entrega') && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-purple-50 text-purple-600">{getStatusTime('Saiu para Entrega')}</span>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{selectedOrder.tipo_entrega === 'pickup' ? 'Aguardando o cliente na loja.' : 'A caminho do endereço do cliente.'}</p>
                    </div>
                    <div className="relative">
                      <div className={cn("absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-[3px]", ['Entregue'].includes(selectedOrder.status) ? "bg-emerald-500 border-white" : "bg-gray-200 border-white")} />
                      <p className={cn("text-sm font-bold flex items-center gap-2", ['Entregue'].includes(selectedOrder.status) ? "text-gray-900" : "text-gray-400")}>
                        Finalizado
                        {getStatusTime('Entregue') && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600">{getStatusTime('Entregue')}</span>}
                      </p>
                    </div>
                    {selectedOrder.status === 'Cancelado' && (
                      <div className="relative pt-4">
                        <div className="absolute -left-[27px] top-5 w-3.5 h-3.5 rounded-full border-[3px] bg-red-500 border-white" />
                        <p className="text-sm font-bold text-red-600 flex items-center gap-2">
                          Pedido Cancelado
                          {getStatusTime('Cancelado') && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-red-50 text-red-600">{getStatusTime('Cancelado')}</span>}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cliente */}
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider flex items-center gap-2"><MapPin className="w-4 h-4 text-emerald-500" /> Detalhes do Cliente</h4>
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <p className="font-bold text-gray-900 text-lg">{selectedOrder.cliente?.nome}</p>
                    <p className="text-sm text-gray-500 font-medium mb-3 flex items-center gap-1"><Phone className="w-3 h-3" /> {selectedOrder.cliente?.telefone}</p>
                    <hr className="border-gray-200 my-3" />
                    <span className="text-xs font-bold text-gray-400 uppercase mb-1 block">Endereço de Entrega</span>
                    <p className="text-sm text-gray-800 leading-relaxed font-medium">{selectedOrder.tipo_entrega === 'pickup' ? 'Retirada na Loja (Balcão)' : (selectedOrder.cliente?.endereco || 'Endereço não informado')}</p>
                  </div>
                </div>

              </div>

              {/* Direita: Itens, Finanças e Observações */}
              <div className="flex-1 space-y-6 p-5 md:p-6 bg-white shrink-0 md:min-w-[400px]">

                {/* Observações Destacadas */}
                {selectedOrder.observacoes && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-sm">
                    <h4 className="text-sm font-bold text-amber-900 mb-1 flex items-center gap-2">⚠️ Observação do Cliente</h4>
                    <p className="text-sm text-amber-800 leading-relaxed font-medium">{selectedOrder.observacoes}</p>
                  </div>
                )}

                {/* Itens */}
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider flex items-center gap-2"><ChefHat className="w-4 h-4 text-emerald-500" /> Carrinho</h4>
                  <div className="space-y-3">
                    {selectedOrder.itens?.map((item: any, idx: number) => (
                      <div key={idx} className="bg-gray-50 p-3 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex justify-between font-bold text-gray-900">
                          <span>{item.quantidade}x {item.nome}</span>
                          <span className="text-gray-900">R$ {(item.subtotal || (item.preco_unitario * item.quantidade) || 0).toFixed(2).replace('.', ',')}</span>
                        </div>
                        {item.opcoes_escolhidas && item.opcoes_escolhidas.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-200/60">
                            <ul className="text-sm text-gray-600 space-y-1">
                              {item.opcoes_escolhidas.map((op: any, i: number) => (
                                <li key={i} className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                                  {op.quantidade}x {op.opcao}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pagamento */}
                <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 shadow-sm">
                  <h4 className="text-sm font-bold text-emerald-900 mb-3 uppercase tracking-wider flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-600" /> Finanças</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-emerald-800">
                      <span>Subtotal dos itens</span>
                      <span>R$ {selectedOrder.itens?.reduce((acc: number, item: any) => acc + (item.subtotal || 0), 0).toFixed(2).replace('.', ',')}</span>
                    </div>
                    {selectedOrder.desconto_cupom > 0 && (
                      <div className="flex justify-between text-red-600 font-medium">
                        <span>Cupom de Desconto ({selectedOrder.cupom_codigo})</span>
                        <span>- R$ {selectedOrder.desconto_cupom.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}
                    {selectedOrder.valor_desconto_pontos > 0 && (
                      <div className="flex justify-between text-blue-600 font-medium">
                        <span>Fidelidade ({selectedOrder.pontos_utilizados} pts)</span>
                        <span>- R$ {selectedOrder.valor_desconto_pontos.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-emerald-800">
                      <span>Taxa de Entrega</span>
                      <span>R$ {(selectedOrder.frete || 0).toFixed(2).replace('.', ',')}</span>
                    </div>

                    <div className="flex justify-between text-emerald-900 bg-emerald-100/50 p-2 rounded-lg mt-1 font-semibold border border-emerald-100">
                      <span>Método de Pagamento</span>
                      <span className="uppercase">{selectedOrder.metodo_pagamento || 'NÃO INFORMADO'}</span>
                    </div>

                    {selectedOrder.metodo_pagamento === 'dinheiro' && selectedOrder.troco_para > 0 && (
                      <div className="flex flex-col gap-1 text-amber-800 bg-amber-100/80 border border-amber-200 p-3 rounded-lg mt-2">
                        <div className="flex justify-between font-bold"><span>Troco para:</span><span>R$ {selectedOrder.troco_para.toFixed(2).replace('.', ',')}</span></div>
                        <div className="flex justify-between text-xs font-semibold"><span>Levar de troco:</span><span>R$ {(selectedOrder.troco_para - selectedOrder.total).toFixed(2).replace('.', ',')}</span></div>
                      </div>
                    )}

                    <div className="flex justify-between text-lg font-bold text-emerald-900 pt-3 border-t border-emerald-200 mt-2"><span>Total a Pagar</span><span>R$ {(selectedOrder.total || 0).toFixed(2).replace('.', ',')}</span></div>
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Footer - Status Actions */}
            <div className="flex-shrink-0 border-t border-gray-100 bg-gray-50 p-3 md:p-6">
              <h4 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider text-center">Ações Rápidas - Mudar Status</h4>
              <div className="flex flex-wrap justify-center gap-2 md:gap-3">
                <div className="hidden w-44 md:block">
                  <PrintOrder order={selectedOrder} />
                </div>
                <button
                  disabled
                  onClick={() => updateOrderStatus(selectedOrder._id, 'Pendente')}
                  className="hidden"
                >
                  Pendente
                </button>
                <button
                  disabled={selectedOrder.status !== 'Pendente'}
                  onClick={() => updateOrderStatus(selectedOrder._id, 'Preparando')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-3 text-xs font-bold text-white shadow-sm disabled:hidden md:px-4 md:text-sm"
                >
                  <ChefHat className="w-4 h-4 hidden sm:block" /> Preparar
                </button>
                <button
                  disabled={selectedOrder.status !== 'Preparando'}
                  onClick={() => updateOrderStatus(selectedOrder._id, 'Saiu para Entrega')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-3 text-xs font-bold text-white shadow-sm disabled:hidden md:px-4 md:text-sm"
                >
                  {selectedOrder.tipo_entrega === 'pickup' ? (
                    <><Store className="w-4 h-4 hidden sm:block" /> Pronto</>
                  ) : (
                    <><Bike className="w-4 h-4 hidden sm:block" /> Despachar</>
                  )}
                </button>
                <button
                  disabled={selectedOrder.status !== 'Saiu para Entrega'}
                  onClick={() => updateOrderStatus(selectedOrder._id, 'Entregue')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3 py-3 text-xs font-bold text-white shadow-sm disabled:hidden md:px-4 md:text-sm"
                >
                  <CheckCheck className="w-4 h-4 hidden sm:block" /> {selectedOrder.tipo_entrega === 'pickup' ? 'Coletado' : 'Finalizado'}
                </button>
                <button
                  disabled={['Entregue', 'Cancelado'].includes(selectedOrder.status)}
                  onClick={() => {
                    setCancelReason('');
                    setIsCancelModalOpen(true);
                  }}
                  className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-xs font-bold text-red-600 shadow-sm disabled:hidden md:px-4 md:text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CANCELAMENTO */}
      {isCancelModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Cancelar Pedido #{selectedOrder._id.slice(-6).toUpperCase()}</h3>
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600">Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita e o cliente poderá ser notificado.</p>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Motivo do cancelamento (Obrigatório)</label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ex: Falta de insumo, cliente pediu para cancelar..."
                  className="w-full rounded-xl border-gray-200 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm h-24 resize-none"
                  minLength={3}
                />
              </div>
            </div>

            <div className="p-4 bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleCancelConfirm}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-colors"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
