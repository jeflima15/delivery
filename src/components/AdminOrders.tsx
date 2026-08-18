import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  X,
  MapPin,
  Clock,
  ChefHat,
  Bike,
  MessageCircle,
  Phone,
  RefreshCw,
  Volume2,
  LayoutGrid,
  List,
  ShoppingBag,
  AlertTriangle,
  ArrowRight,
  Printer,
  Check,
  Loader2,
} from 'lucide-react';
import PrintOrder from './PrintOrder';
import { formatWhatsAppLink } from '../lib/phone';
import { useToast } from './Toast';
import { paymentMethodLabel } from '../lib/paymentMethods';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import ComboComposition from './ComboComposition';
import {
  ThermalPaperWidth,
  getThermalPaperWidth,
  setThermalPaperWidth,
  createDummyTestOrder,
} from '../lib/thermalPrint';

interface AdminOrdersProps {
  token: string;
  storeName?: string;
  slug?: string;
  onUnauthorized: () => void;
  novosPedidosCount: number;
  setNovosPedidosCount: (n: number) => void;
  soundEnabled: boolean;
  setSoundEnabled: (b: boolean) => void;
  playBeep: () => void;
  audioUnlocked: boolean;
}

export default function AdminOrders({
  token,
  storeName,
  slug,
  onUnauthorized,
  novosPedidosCount,
  setNovosPedidosCount,
  soundEnabled,
  setSoundEnabled,
  playBeep,
  audioUnlocked
}: AdminOrdersProps) {
  const api = useTenantAdminApi();
  const effectiveSlug = slug || api.slug;
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
  const [now, setNow] = useState(Date.now());
  const [paperWidth, setPaperWidth] = useState<ThermalPaperWidth>(() => getThermalPaperWidth(effectiveSlug));
  const [isPrintConfigOpen, setIsPrintConfigOpen] = useState(false);
  const [orderToPrint, setOrderToPrint] = useState<any | null>(null);
  const [acceptAndPrintLoadingId, setAcceptAndPrintLoadingId] = useState<string | null>(null);
  const { showToast } = useToast();

  // Real-time wait time ticker
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

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

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') fetchPedidos();
    };

    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('dashboardOrdersUpdated', handleDashboardUpdate);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [token]);

  const getStatusLabel = (status: string, tipo: string) => {
    const isDineIn = tipo === 'dine_in' || tipo === 'local';
    const isPickup = tipo === 'pickup' || tipo === 'retirada';
    if (status === 'Saiu para Entrega') {
      if (isDineIn) return 'Pronto (Servir/Mesa)';
      if (isPickup) return 'Pronto (Retirada)';
      return 'Saiu p/ Entrega';
    }
    if (status === 'Entregue' || status === 'Concluído') {
      if (isDineIn) return 'Consumido';
      if (isPickup) return 'Retirado';
      return 'Entregue';
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
    } catch {
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

  const handleSavePaperWidth = (newWidth: ThermalPaperWidth) => {
    setPaperWidth(newWidth);
    setThermalPaperWidth(effectiveSlug, newWidth);
    showToast(`Largura de impressão configurada para ${newWidth}`, 'success');
  };

  const handlePrintOrder = (order: any) => {
    setOrderToPrint(order);
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const handlePrintTest = () => {
    const testOrder = createDummyTestOrder(storeName || 'PodeVir Delivery');
    setOrderToPrint(testOrder);
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const handleAcceptAndPrint = async (order: any, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      setAcceptAndPrintLoadingId(order._id);
      const data = await api.updateOrderStatus(order._id, 'Preparando');
      if (data.success) {
        showToast('Pedido aceito com sucesso!', 'success');
        fetchPedidos();
        if (selectedOrder && selectedOrder._id === order._id) {
          setSelectedOrder({ ...selectedOrder, status: 'Preparando' });
        }
        handlePrintOrder(order);
      } else {
        showToast('Não foi possível atualizar o status do pedido.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao aceitar pedido. Impressão cancelada.', 'error');
    } finally {
      setAcceptAndPrintLoadingId(null);
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
    } catch {
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
    let mensagem: string;

    if (pedido.status === 'Preparando') {
      mensagem = `Olá ${nome}! Recebemos o seu pedido #${id_curto} e ele já está na cozinha! 👨‍🍳`;
    } else if (pedido.status === 'Saiu para Entrega') {
      if (pedido.tipo_entrega === 'dine_in' || pedido.tipo_entrega === 'local') {
        mensagem = `Boas notícias, ${nome}! Seu pedido #${id_curto} para comer no local já está pronto na mesa/balcão! 🍽️✨`;
      } else if (pedido.tipo_entrega === 'pickup' || pedido.tipo_entrega === 'retirada') {
        mensagem = `Boas notícias, ${nome}! Seu pedido #${id_curto} já está pronto para retirada! 🛍️✨`;
      } else {
        mensagem = `Boas notícias, ${nome}! Seu pedido #${id_curto} acabou de sair para entrega! 🛵💨`;
      }
    } else {
      mensagem = `Olá ${nome}! O status do seu pedido #${id_curto} foi atualizado para: ${getStatusLabel(pedido.status, pedido.tipo_entrega)}.`;
    }

    window.open(formatWhatsAppLink(telefoneFormatado, mensagem), '_blank');
  };

  const isPendente = (status: string) => status === 'Pendente';
  const isEmPreparo = (status: string) => status === 'Preparando';
  const isSaiuParaEntrega = (status: string) => status === 'Saiu para Entrega';
  const isEntregue = (status: string) => status === 'Entregue';
  const isCancelado = (status: string) => status === 'Cancelado';

  const getPaymentLabel = (pedido: any) => {
    const method = pedido.metodo_pagamento || pedido.forma_pagamento || pedido.paymentMethod;
    if (!method && pedido.pagamento_detalhes) return pedido.pagamento_detalhes;

    if (method === 'cartao_credito' || method === 'card' || method === 'cartao') return 'Cartão de Crédito';
    if (method === 'cartao_debito') return 'Cartão de Débito';
    if (method === 'pix' || method === 'PIX') return 'PIX';
    if (method === 'dinheiro' || method === 'cash') return 'Dinheiro';
    if (method === 'vale_refeicao' || method === 'meal_voucher' || method === 'vr') return 'Vale-refeição';
    if (method === 'vale_alimentacao' || method === 'food_voucher') return 'Vale-alimentação';

    return paymentMethodLabel(method);
  };

  const filteredPedidos = pedidos.filter(p => {
    let matchStatus = statusFilter === 'Todos';
    if (!matchStatus) {
      if (statusFilter === 'Pendente') matchStatus = isPendente(p.status);
      else if (statusFilter === 'Preparando') matchStatus = isEmPreparo(p.status);
      else if (statusFilter === 'Saiu para Entrega') matchStatus = isSaiuParaEntrega(p.status);
      else if (statusFilter === 'Entregue') matchStatus = isEntregue(p.status);
      else if (statusFilter === 'Cancelado') matchStatus = p.status === 'Cancelado';
    }
    const matchSearch =
      (p.cliente?.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.cliente?.telefone || '').includes(searchTerm) ||
      (p.orderNumber || p.codigo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p._id || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const getWaitTimeMinutes = (createdAtStr: string) => {
    if (!createdAtStr) return 0;
    const created = new Date(createdAtStr).getTime();
    if (isNaN(created)) return 0;
    return Math.floor(Math.max(0, now - created) / 60000);
  };

  const formatWaitTime = (createdAtStr: string) => {
    const mins = getWaitTimeMinutes(createdAtStr);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  };

  const getStatusStyle = (status: string, tipo?: string) => {
    if (isPendente(status)) {
      return {
        label: 'Pendente',
        badge: 'bg-amber-50 text-amber-800 border-amber-200/80',
        dot: 'bg-amber-500'
      };
    }
    if (isEmPreparo(status)) {
      return {
        label: 'Em preparo',
        badge: 'bg-blue-50 text-blue-800 border-blue-200/80',
        dot: 'bg-blue-500'
      };
    }
    if (isSaiuParaEntrega(status)) {
      const isDineIn = tipo === 'dine_in' || tipo === 'local';
      const isPickup = tipo === 'pickup' || tipo === 'retirada';
      return {
        label: isDineIn ? 'Pronto (Local)' : isPickup ? 'Pronto (Retirada)' : 'Saiu p/ Entrega',
        badge: isDineIn ? 'bg-indigo-50 text-indigo-800 border-indigo-200/80' : 'bg-purple-50 text-purple-800 border-purple-200/80',
        dot: isDineIn ? 'bg-indigo-500' : 'bg-purple-500'
      };
    }
    if (isEntregue(status)) {
      const isDineIn = tipo === 'dine_in' || tipo === 'local';
      const isPickup = tipo === 'pickup' || tipo === 'retirada';
      return {
        label: isDineIn ? 'Consumido' : isPickup ? 'Retirado' : 'Entregue',
        badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
        dot: 'bg-emerald-500'
      };
    }
    if (status === 'Cancelado') {
      return {
        label: 'Cancelado',
        badge: 'bg-rose-50 text-rose-800 border-rose-200/80',
        dot: 'bg-rose-500'
      };
    }
    return {
      label: status,
      badge: 'bg-slate-50 text-slate-700 border-slate-200',
      dot: 'bg-slate-400'
    };
  };

  const formatarDataHora = (dataString: string) => {
    if (!dataString) return '-';
    return new Date(dataString).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusTime = (status: string) => {
    if (!selectedOrder) return null;
    if (selectedOrder.historico_status && selectedOrder.historico_status.length > 0) {
      const record = selectedOrder.historico_status.find((h: any) => h.status === status);
      if (record && record.data) {
        return new Date(record.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
    }
    if (isPendente(status) && selectedOrder.createdAt)
      return new Date(selectedOrder.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (status === selectedOrder.status && selectedOrder.updatedAt)
      return new Date(selectedOrder.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return null;
  };

  const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

  // Summary counts
  const pendentesCount = pedidos.filter(p => isPendente(p.status)).length;
  const preparandoCount = pedidos.filter(p => isEmPreparo(p.status)).length;
  const prontosCount = pedidos.filter(p => isSaiuParaEntrega(p.status)).length;

  return (
    <div className="space-y-3.5">
      {/* Alerta de som desativado */}
      {!audioUnlocked && soundEnabled && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200/80 bg-blue-50/80 p-2.5 text-xs text-blue-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-blue-600 shrink-0" />
            <div>
              <p className="font-semibold text-xs">Ative o aviso sonoro de novos pedidos</p>
              <p className="text-[11px] text-blue-700">O navegador exige interação para reproduzir alertas sonoros.</p>
            </div>
          </div>
          <button
            onClick={() => {
              playBeep();
              showToast('Som ativado com sucesso!', 'success');
            }}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-2xs"
          >
            Ativar som
          </button>
        </div>
      )}

      {/* KPI Counters & Bar Operacional Compacta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Ativos</p>
            <p className="text-base font-bold text-slate-900">{pedidos.length}</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <ShoppingBag className="h-4 w-4" />
          </div>
        </div>

        <div className={cn(
          "rounded-xl border p-2.5 shadow-2xs flex items-center justify-between transition-colors",
          pendentesCount > 0 ? "border-amber-300 bg-amber-50/50" : "border-slate-200/80 bg-white"
        )}>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider">Pendentes</p>
              {pendentesCount > 0 && (
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <p className="text-base font-bold text-amber-950">{pendentesCount}</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100/80 text-amber-800">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Em Preparo</p>
            <p className="text-base font-bold text-slate-900">{preparandoCount}</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
            <ChefHat className="h-4 w-4" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Prontos / Rota</p>
            <p className="text-base font-bold text-slate-900">{prontosCount}</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-700 border border-purple-100">
            <Bike className="h-4 w-4" />
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <span>Não foi possível atualizar os pedidos.</span>
          <button
            type="button"
            onClick={fetchPedidos}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 font-semibold hover:bg-rose-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar novamente
          </button>
        </div>
      )}

      {/* Cabeçalho Operacional e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setNovosPedidosCount(0)}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <ShoppingBag className="h-4 w-4 text-slate-800" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Fila de Pedidos</h2>
              {novosPedidosCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-600"></span>
                  {novosPedidosCount} novo{novosPedidosCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {filteredPedidos.length} exibidos
              {lastFetchTime && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 ml-2">
                  <RefreshCw className="h-3 w-3" />
                  {lastFetchTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Controles de Som e Alternância de Visão */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) {
                playBeep();
                showToast('Som ativado', 'success');
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all shadow-2xs",
              soundEnabled ? "border-emerald-200 bg-emerald-50/80 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500"
            )}
          >
            <Volume2 className="h-3.5 w-3.5" />
            {soundEnabled ? 'Som ligado' : 'Mudo'}
          </button>

          <button
            type="button"
            onClick={() => {
              playBeep();
              showToast('Sinal sonoro disparado', 'info');
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
            title="Testar sinal sonoro"
          >
            Testar áudio
          </button>

          <button
            type="button"
            onClick={() => setIsPrintConfigOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            title="Configuração de Impressão Térmica"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            <span>Impressão</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold leading-none">
              {paperWidth}
            </span>
          </button>

          <div className="h-4 w-[1px] bg-slate-200/80 hidden sm:block" />

          {/* Alternância Lista / KDS */}
          <div className="inline-flex rounded-lg border border-slate-200/80 bg-slate-100/80 p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                viewMode === 'list'
                  ? "bg-white text-slate-900 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
            <button
              onClick={() => setViewMode('kds')}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                viewMode === 'kds'
                  ? "bg-white text-slate-900 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              KDS (Cozinha)
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca Compacta */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, ID (#123) ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/50 pl-8 pr-3 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="relative min-w-[160px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/50 pl-8 pr-3 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:bg-white transition-all appearance-none cursor-pointer"
          >
            <option value="Todos">Todos os status</option>
            <option value="Pendente">Pendentes</option>
            <option value="Preparando">Em preparo</option>
            <option value="Saiu para Entrega">Prontos / Em rota</option>
            <option value="Entregue">Finalizados</option>
            <option value="Cancelado">Cancelados</option>
          </select>
        </div>
      </div>

      {/* MODO KDS */}
      {viewMode === 'kds' ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            ['Pendente', 'Novos pedidos', 'border-amber-200/80 bg-amber-50/20'],
            ['Preparando', 'Em preparo', 'border-blue-200/80 bg-blue-50/20'],
            ['Saiu para Entrega', 'Prontos / Em rota', 'border-purple-200/80 bg-purple-50/20'],
          ].map(([status, title, tone]) => {
            const columnOrders = filteredPedidos.filter((order) => {
              if (status === 'Pendente') return isPendente(order.status);
              if (status === 'Preparando') return isEmPreparo(order.status);
              if (status === 'Saiu para Entrega') return isSaiuParaEntrega(order.status);
              return false;
            });

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
              <section key={status} className={cn('rounded-xl border p-2.5 sm:p-3 min-h-[340px] flex flex-col', tone)}>
                <header className="flex items-center justify-between px-1 pb-2 mb-2 border-b border-slate-200/60 shrink-0">
                  <div className="flex items-center gap-2">
                    {columnOrders.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={handleSelectAll}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    )}
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{title}</h3>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-800 border border-slate-200/80 shadow-2xs">
                    {columnOrders.length}
                  </span>
                </header>

                <div className="space-y-2.5 flex-1">
                  {columnOrders.map((order) => {
                    const waitMins = getWaitTimeMinutes(order.createdAt);
                    const isLate = waitMins >= 20 && !isEntregue(order.status);
                    const isDineIn = order.tipo_entrega === 'dine_in' || order.tipo_entrega === 'local';
                    const isPickup = order.tipo_entrega === 'pickup' || order.tipo_entrega === 'retirada' || order.tipo_atendimento === 'retirada';

                    return (
                      <article
                        key={order._id}
                        className={cn(
                          "rounded-xl border bg-white p-3 shadow-2xs transition-all relative flex flex-col justify-between gap-2.5",
                          selectedOrderIds.includes(order._id)
                            ? "border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/10"
                            : "border-slate-200/80 hover:border-slate-300"
                        )}
                      >
                        <div>
                          {/* Header do Card KDS */}
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selectedOrderIds.includes(order._id)}
                                onChange={() => toggleOrderSelection(order._id)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                              <button
                                onClick={() => setSelectedOrder(order)}
                                className="font-extrabold text-slate-900 text-sm hover:text-emerald-700 transition-colors"
                              >
                                #{order.orderNumber || order.codigo || order._id.slice(-6).toUpperCase()}
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                                  isDineIn
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : isPickup
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-slate-100 text-slate-700 border-slate-200/80"
                                )}
                              >
                                {isDineIn ? 'Comer no Local' : isPickup ? 'Retirada' : 'Entrega'}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border",
                                  isLate
                                    ? "bg-rose-50 text-rose-800 border-rose-200 animate-pulse"
                                    : "bg-slate-100 text-slate-700 border-slate-200/80"
                                )}
                              >
                                <Clock className="h-3 w-3 text-slate-500" />
                                {formatWaitTime(order.createdAt)}
                              </span>
                            </div>
                          </div>

                          {/* Dados do Cliente e Pagamento */}
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                            <span className="font-semibold text-slate-900 truncate max-w-[170px]">
                              {order.cliente?.nome || 'Cliente não informado'}
                            </span>
                            <span className="text-[10px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                              {getPaymentLabel(order)}
                            </span>
                          </div>

                          {/* Lista de Itens do Pedido (Alta escaneabilidade) */}
                          <div className="mt-2 text-xs bg-slate-50/90 rounded-lg p-2 border border-slate-200/60 space-y-1.5">
                            {order.itens?.map((item: any, idx: number) => (
                              <div key={idx} className="space-y-0.5">
                                <div className="flex items-start justify-between text-slate-900 text-xs">
                                  <div className="flex items-start gap-1.5">
                                    <span className="inline-flex items-center justify-center bg-slate-900 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shrink-0">
                                      {item.quantidade}x
                                    </span>
                                    <span className="font-bold text-slate-900 leading-snug">
                                      {item.nome}
                                    </span>
                                  </div>
                                </div>
                                {item.tipo_item === 'combo' && <ComboComposition stages={item.combo_snapshot?.etapas} className="pl-6" />}
                                {item.opcoes_escolhidas?.length > 0 && (
                                  <div className="pl-6 text-[11px] text-slate-600 space-y-0.5">
                                    {item.opcoes_escolhidas.map((o: any, oIdx: number) => (
                                      <p key={oIdx} className="leading-tight">• {o.opcao || o.nome}</p>
                                    ))}
                                  </div>
                                )}
                                {item.observacoes && (
                                  <p className="pl-6 text-[10px] font-semibold text-amber-800">
                                    Obs: {item.observacoes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Observações Gerais Destacadas */}
                          {order.observacoes && (
                            <div className="mt-2 bg-amber-50/90 border border-amber-300/80 text-amber-900 text-[11px] font-semibold p-2 rounded-lg leading-snug flex items-start gap-1.5 shadow-2xs">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-extrabold text-amber-950 uppercase tracking-wide text-[10px]">Atenção:</span> {order.observacoes}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Rodapé do Card - Total e Ação Operacional Prominente */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="text-xs font-bold text-slate-900">
                            R$ {(order.total || 0).toFixed(2).replace('.', ',')}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(order)}
                              className="h-8 px-2.5 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 transition-colors"
                              title="Ver detalhes"
                            >
                              Ver
                            </button>

                            <button
                              type="button"
                              onClick={() => handleNotifyClient(order)}
                              className="h-8 px-2 rounded-lg border border-green-200/80 bg-green-50 text-green-700 hover:bg-green-100 text-xs font-semibold transition-colors"
                              title="WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </button>

                            {isPendente(order.status) && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => handleAcceptAndPrint(order, e)}
                                  disabled={acceptAndPrintLoadingId === order._id}
                                  className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-2xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="Aceitar pedido e imprimir comanda"
                                >
                                  {acceptAndPrintLoadingId === order._id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Printer className="h-3 w-3" />
                                  )}
                                  <span>Aceitar e imprimir</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleStatusAdvance(e, order, 'Preparando')}
                                  className="h-8 px-2 rounded-lg border border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold transition-colors cursor-pointer"
                                  title="Aceitar sem imprimir"
                                >
                                  Aceitar
                                </button>
                              </div>
                            )}

                            {isEmPreparo(order.status) && (
                              <button
                                type="button"
                                onClick={(e) => handleStatusAdvance(e, order, 'Saiu para Entrega')}
                                className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-colors flex items-center gap-1"
                              >
                                {isDineIn ? 'Pronto p/ Servir' : isPickup ? 'Pronto p/ Retirada' : 'Despachar'} <ArrowRight className="h-3 w-3" />
                              </button>
                            )}

                            {isSaiuParaEntrega(order.status) && (
                              <button
                                type="button"
                                onClick={(e) => handleStatusAdvance(e, order, 'Entregue')}
                                className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-2xs transition-colors flex items-center gap-1"
                              >
                                {isDineIn ? 'Servido ✓' : isPickup ? 'Retirado ✓' : 'Concluir ✓'}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}

                  {columnOrders.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200/80 bg-white/40 p-8 text-center text-xs text-slate-400">
                      Nenhum pedido nesta etapa
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        /* MODO LISTA - TABELA SAAS OPERACIONAL */
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
          {/* Mobile View */}
          <div className="divide-y divide-slate-100 md:hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Carregando pedidos...</div>
            ) : filteredPedidos.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">Nenhum pedido encontrado</div>
            ) : (
              filteredPedidos.map((pedido) => {
                const statusInfo = getStatusStyle(pedido.status, pedido.tipo_entrega);
                const waitMins = getWaitTimeMinutes(pedido.createdAt);
                const isLate = waitMins >= 20 && !isEntregue(pedido.status) && !isCancelado(pedido.status);
                const isDineIn = pedido.tipo_entrega === 'dine_in' || pedido.tipo_entrega === 'local';
                const isPickup = pedido.tipo_entrega === 'pickup' || pedido.tipo_entrega === 'retirada' || pedido.tipo_atendimento === 'retirada';

                return (
                  <article key={pedido._id} className="p-3 space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.includes(pedido._id)}
                          onChange={() => toggleOrderSelection(pedido._id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <button onClick={() => setSelectedOrder(pedido)} className="font-bold text-slate-900 text-sm">
                            #{pedido.orderNumber || pedido.codigo || pedido._id.slice(-6).toUpperCase()}
                          </button>
                          <p className="text-xs font-medium text-slate-700">{pedido.cliente?.nome || 'Cliente não informado'}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border", statusInfo.badge)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", statusInfo.dot)} />
                          {statusInfo.label}
                        </span>
                        <span className={cn("text-[10px] font-bold", isLate ? "text-rose-600" : "text-slate-500")}>
                          ⏱️ {formatWaitTime(pedido.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                      <span>{isDineIn ? 'Comer no local' : isPickup ? 'Retirada' : 'Entrega'} · <strong className="text-slate-800">{getPaymentLabel(pedido)}</strong></span>
                      <strong className="text-sm font-bold text-slate-900">R$ {(pedido.total || 0).toFixed(2).replace('.', ',')}</strong>
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      <button
                        onClick={() => setSelectedOrder(pedido)}
                        className="h-8 flex-1 rounded-lg border border-slate-200/80 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        Detalhes
                      </button>

                      {isPendente(pedido.status) && (
                        <div className="flex-1 flex items-center gap-1">
                          <button
                            onClick={(e) => handleAcceptAndPrint(pedido, e)}
                            disabled={acceptAndPrintLoadingId === pedido._id}
                            className="h-8 flex-1 rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-2xs flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                            title="Aceitar pedido e imprimir comanda"
                          >
                            {acceptAndPrintLoadingId === pedido._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Printer className="h-3.5 w-3.5" />
                            )}
                            <span>Aceitar e imprimir</span>
                          </button>
                          <button
                            onClick={(e) => handleStatusAdvance(e, pedido, 'Preparando')}
                            className="h-8 px-2 rounded-lg border border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold transition-colors cursor-pointer"
                            title="Aceitar sem imprimir"
                          >
                            Aceitar
                          </button>
                        </div>
                      )}
                      {isEmPreparo(pedido.status) && (
                        <button
                          onClick={(e) => handleStatusAdvance(e, pedido, 'Saiu para Entrega')}
                          className="h-8 flex-1 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-2xs"
                        >
                          {isDineIn ? 'Pronto p/ Servir' : isPickup ? 'Pronto p/ Retirada' : 'Despachar'}
                        </button>
                      )}
                      {isSaiuParaEntrega(pedido.status) && (
                        <button
                          onClick={(e) => handleStatusAdvance(e, pedido, 'Entregue')}
                          className="h-8 flex-1 rounded-lg bg-slate-900 text-xs font-semibold text-white hover:bg-black transition-colors shadow-2xs"
                        >
                          {isDineIn ? 'Servido ✓' : isPickup ? 'Retirado ✓' : 'Entregue ✓'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3.5 w-10">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        const viewOrders = filteredPedidos.filter(p => isPendente(p.status) || isEmPreparo(p.status) || isSaiuParaEntrega(p.status));
                        if (e.target.checked) setSelectedOrderIds(viewOrders.map(o => o._id));
                        else setSelectedOrderIds([]);
                      }}
                      checked={
                        filteredPedidos.length > 0 &&
                        filteredPedidos.filter(p => isPendente(p.status) || isEmPreparo(p.status) || isSaiuParaEntrega(p.status)).every(o => selectedOrderIds.includes(o._id))
                      }
                      className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-3">Pedido / Tempo</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Modalidade / Pgto</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Total</th>
                  <th className="py-2.5 px-3.5 text-right">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">Carregando fila de pedidos...</td>
                  </tr>
                ) : filteredPedidos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <ShoppingBag className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-bold text-slate-900 text-sm">Nenhum pedido nesta visão</p>
                      <p className="text-xs text-slate-500 mt-0.5">Ajuste os filtros ou aguarde novos pedidos dos seus clientes.</p>
                    </td>
                  </tr>
                ) : (
                  filteredPedidos.map((pedido) => {
                    const statusInfo = getStatusStyle(pedido.status, pedido.tipo_entrega);
                    const waitMins = getWaitTimeMinutes(pedido.createdAt);
                    const isLate = waitMins >= 20 && !isEntregue(pedido.status) && !isCancelado(pedido.status);
                    const isDineIn = pedido.tipo_entrega === 'dine_in' || pedido.tipo_entrega === 'local';
                    const isPickup = pedido.tipo_entrega === 'pickup' || pedido.tipo_entrega === 'retirada' || pedido.tipo_atendimento === 'retirada';

                    return (
                      <tr
                        key={pedido._id}
                        onClick={() => setSelectedOrder(pedido)}
                        className={cn(
                          "hover:bg-slate-50/80 transition-colors cursor-pointer group",
                          selectedOrderIds.includes(pedido._id) && "bg-emerald-50/40 hover:bg-emerald-50/60"
                        )}
                      >
                        <td className="py-2.5 px-3.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.includes(pedido._id)}
                            onChange={() => toggleOrderSelection(pedido._id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </td>

                        {/* ID e Tempo */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs group-hover:text-emerald-700 transition-colors">
                              #{pedido.orderNumber || pedido.codigo || pedido._id.slice(-6).toUpperCase()}
                            </span>
                            {!isEntregue(pedido.status) && !isCancelado(pedido.status) && (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border",
                                  isLate
                                    ? "bg-rose-50 text-rose-800 border-rose-200"
                                    : "bg-slate-100 text-slate-700 border-slate-200/80"
                                )}
                              >
                                <Clock className="h-3 w-3 text-slate-400" />
                                {formatWaitTime(pedido.createdAt)}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{formatarDataHora(pedido.createdAt)}</p>
                        </td>

                        {/* Cliente */}
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-slate-900 truncate max-w-[180px]">
                            {pedido.cliente?.nome || 'Cliente não informado'}
                          </p>
                          <p className="text-[11px] text-slate-500">{pedido.cliente?.telefone || '-'}</p>
                        </td>

                        {/* Entrega e Pagamento */}
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-slate-800">
                            {isDineIn ? 'Comer no local' : isPickup ? 'Retirada' : 'Entrega'}
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {getPaymentLabel(pedido)}
                          </p>
                        </td>

                        {/* Status Badge */}
                        <td className="py-2.5 px-3">
                          <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap", statusInfo.badge)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", statusInfo.dot)} />
                            {statusInfo.label}
                          </span>
                        </td>

                        {/* Total */}
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          R$ {(pedido.total || 0).toFixed(2).replace('.', ',')}
                        </td>

                        {/* Ações Rápidas */}
                        <td className="py-2.5 px-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedOrder(pedido)}
                              className="h-8 px-2.5 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                              title="Ver detalhes"
                            >
                              Ver
                            </button>

                            {!isCancelado(pedido.status) && !isEntregue(pedido.status) && (
                              <button
                                onClick={() => handleNotifyClient(pedido)}
                                className="h-8 px-2 rounded-lg border border-green-200/80 bg-green-50 text-green-700 hover:bg-green-100 text-xs font-semibold transition-colors"
                                title="Notificar via WhatsApp"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {isPendente(pedido.status) && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => handleAcceptAndPrint(pedido, e)}
                                  disabled={acceptAndPrintLoadingId === pedido._id}
                                  className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-2xs transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50 cursor-pointer"
                                  title="Aceitar pedido e imprimir comanda"
                                >
                                  {acceptAndPrintLoadingId === pedido._id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Printer className="h-3.5 w-3.5" />
                                  )}
                                  <span>Aceitar e imprimir</span>
                                </button>
                                <button
                                  onClick={(e) => handleStatusAdvance(e, pedido, 'Preparando')}
                                  className="h-8 px-2 rounded-lg border border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                                  title="Aceitar sem imprimir"
                                >
                                  Aceitar
                                </button>
                              </div>
                            )}

                            {isEmPreparo(pedido.status) && (
                              <button
                                onClick={(e) => handleStatusAdvance(e, pedido, 'Saiu para Entrega')}
                                className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition-colors whitespace-nowrap"
                              >
                                {isDineIn ? 'Pronto p/ Servir' : isPickup ? 'Pronto p/ Retirada' : 'Despachar'}
                              </button>
                            )}

                            {isSaiuParaEntrega(pedido.status) && (
                              <button
                                onClick={(e) => handleStatusAdvance(e, pedido, 'Entregue')}
                                className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-black text-white text-xs font-semibold shadow-2xs transition-colors whitespace-nowrap"
                              >
                                {isDineIn ? 'Servido ✓' : isPickup ? 'Retirado ✓' : 'Concluir ✓'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Barra Flutuante de Ações em Lote */}
      {selectedOrderIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-full shadow-xl z-40 flex items-center gap-4 animate-in slide-in-from-bottom-5 border border-slate-700">
          <span className="text-xs font-medium whitespace-nowrap">
            <strong className="text-emerald-400 font-bold">{selectedOrderIds.length}</strong> selecionados
          </span>
          <div className="h-4 w-[1px] bg-slate-700" />
          <div className="flex gap-1.5">
            <button
              onClick={() => handleBatchAdvance('Preparando')}
              disabled={batchActionLoading}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold rounded-full transition-colors whitespace-nowrap"
            >
              Aceitar
            </button>
            <button
              onClick={() => handleBatchAdvance('Saiu para Entrega')}
              disabled={batchActionLoading}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold rounded-full transition-colors whitespace-nowrap"
            >
              Prontos
            </button>
            <button
              onClick={() => handleBatchAdvance('Entregue')}
              disabled={batchActionLoading}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-xs font-semibold rounded-full transition-colors whitespace-nowrap"
            >
              Concluir
            </button>
            <button
              onClick={() => setSelectedOrderIds([])}
              className="p-1 text-slate-400 hover:text-white rounded-full transition-colors ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Detalhes Completo Repaginado */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white shadow-xl rounded-xl sm:h-auto sm:max-h-[90vh] border border-slate-200/80">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Pedido #{selectedOrder.orderNumber || selectedOrder._id.slice(-6).toUpperCase()}
                  </h3>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold border", getStatusStyle(selectedOrder.status, selectedOrder.tipo_entrega).badge)}>
                    {getStatusStyle(selectedOrder.status, selectedOrder.tipo_entrega).label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{formatarDataHora(selectedOrder.createdAt)}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleNotifyClient(selectedOrder)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#1DA851] transition-colors"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </button>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100 text-xs">
              {/* Timeline & Cliente */}
              <div className="flex-1 space-y-4 p-4">
                {/* Linha do tempo */}
                <div className="bg-slate-50/60 p-3 rounded-xl border border-slate-200/60 space-y-3">
                  <h4 className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-emerald-600" /> Histórico de Status
                  </h4>
                  <div className="pl-3 border-l border-slate-200 space-y-2.5 ml-1">
                    <div className="relative">
                      <div className={cn("absolute -left-[17px] top-1 h-2 w-2 rounded-full", ['Pendente', 'Preparando', 'Saiu para Entrega', 'Entregue'].includes(selectedOrder.status) ? "bg-emerald-500" : "bg-slate-300")} />
                      <p className="font-medium text-slate-800 flex justify-between">
                        <span>Recebido</span>
                        <span className="text-slate-400 font-normal">{getStatusTime('Pendente') || '-'}</span>
                      </p>
                    </div>
                    <div className="relative">
                      <div className={cn("absolute -left-[17px] top-1 h-2 w-2 rounded-full", ['Preparando', 'Saiu para Entrega', 'Entregue'].includes(selectedOrder.status) ? "bg-emerald-500" : "bg-slate-300")} />
                      <p className="font-medium text-slate-800 flex justify-between">
                        <span>Em preparo</span>
                        <span className="text-slate-400 font-normal">{getStatusTime('Preparando') || '-'}</span>
                      </p>
                    </div>
                    <div className="relative">
                      <div className={cn("absolute -left-[17px] top-1 h-2 w-2 rounded-full", ['Saiu para Entrega', 'Entregue'].includes(selectedOrder.status) ? "bg-emerald-500" : "bg-slate-300")} />
                      <p className="font-medium text-slate-800 flex justify-between">
                        <span>{selectedOrder.tipo_entrega === 'dine_in' || selectedOrder.tipo_entrega === 'local' ? 'Pronto para Servir' : (selectedOrder.tipo_entrega === 'pickup' ? 'Pronto para Retirada' : 'Saiu para Entrega')}</span>
                        <span className="text-slate-400 font-normal">{getStatusTime('Saiu para Entrega') || '-'}</span>
                      </p>
                    </div>
                    <div className="relative">
                      <div className={cn("absolute -left-[17px] top-1 h-2 w-2 rounded-full", ['Entregue'].includes(selectedOrder.status) ? "bg-emerald-500" : "bg-slate-300")} />
                      <p className="font-medium text-slate-800 flex justify-between">
                        <span>Finalizado</span>
                        <span className="text-slate-400 font-normal">{getStatusTime('Entregue') || '-'}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cliente */}
                <div className="bg-slate-50/60 p-3 rounded-xl border border-slate-200/60 space-y-1.5">
                  <h4 className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-emerald-600" /> Cliente & Atendimento
                  </h4>
                  <p className="font-bold text-slate-900">{selectedOrder.cliente?.nome}</p>
                  <p className="text-slate-600 flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400" /> {selectedOrder.cliente?.telefone || 'Telefone não informado'}
                  </p>
                  <hr className="border-slate-200/60 my-2" />
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Endereço / Local</p>
                  <p className="text-slate-800 font-medium leading-relaxed">
                    {selectedOrder.tipo_entrega === 'dine_in' || selectedOrder.tipo_entrega === 'local'
                      ? 'Comer no Local (Mesa / Salão)'
                      : selectedOrder.tipo_entrega === 'pickup'
                        ? 'Retirada na Loja (Balcão)'
                        : (selectedOrder.cliente?.endereco || 'Endereço não informado')}
                  </p>
                </div>
              </div>

              {/* Itens & Financeiro */}
              <div className="flex-1 space-y-4 p-4 bg-white">
                {/* Observações */}
                {selectedOrder.observacoes && (
                  <div className="bg-amber-50 border border-amber-200/80 p-2.5 rounded-xl text-amber-900">
                    <p className="font-bold text-[11px] mb-0.5">⚠️ Observação do Cliente</p>
                    <p className="text-xs">{selectedOrder.observacoes}</p>
                  </div>
                )}

                {/* Carrinho */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-900 text-xs">Itens do Pedido</h4>
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                    {selectedOrder.itens?.map((item: any, idx: number) => (
                      <div key={idx} className="bg-slate-50/80 p-2 rounded-lg border border-slate-100 flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-slate-900">{item.quantidade}x {item.nome}</p>
                          {item.tipo_item === 'combo' && <ComboComposition stages={item.combo_snapshot?.etapas} className="mt-1" />}
                          {item.opcoes_escolhidas?.length > 0 && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {item.opcoes_escolhidas.map((op: any) => `${op.quantidade}x ${op.opcao}`).join(', ')}
                            </p>
                          )}
                        </div>
                        <span className="font-semibold text-slate-900">
                          R$ {(item.subtotal || (item.preco_unitario * item.quantidade) || 0).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financeiro */}
                <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/60 space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>R$ {selectedOrder.itens?.reduce((acc: number, item: any) => acc + (item.subtotal || 0), 0).toFixed(2).replace('.', ',')}</span>
                  </div>
                  {selectedOrder.desconto_cupom > 0 && (
                    <div className="flex justify-between text-rose-600 font-medium">
                      <span>Cupom ({selectedOrder.cupom_codigo})</span>
                      <span>- R$ {selectedOrder.desconto_cupom.toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}
                  {selectedOrder.valor_desconto_pontos > 0 && (
                    <div className="flex justify-between text-blue-600 font-medium">
                      <span>Fidelidade</span>
                      <span>- R$ {selectedOrder.valor_desconto_pontos.toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Taxa de Entrega</span>
                    <span>R$ {(selectedOrder.frete || 0).toFixed(2).replace('.', ',')}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-medium pt-1 border-t border-slate-200/60">
                    <span>Método</span>
                    <span className="uppercase">{paymentMethodLabel(selectedOrder.metodo_pagamento)}</span>
                  </div>
                  {(selectedOrder.metodo_pagamento === 'dinheiro' || selectedOrder.metodo_pagamento === 'cash') && (selectedOrder.troco_para > 0 || selectedOrder.troco > 0) && (
                    <div className="text-[11px] text-amber-800 bg-amber-50 p-1.5 rounded-lg border border-amber-200/80 flex justify-between">
                      <span>Troco para R$ {Number(selectedOrder.troco_para || selectedOrder.troco || 0).toFixed(2).replace('.', ',')}</span>
                      <span className="font-bold">Levar R$ {(Number(selectedOrder.troco_para || selectedOrder.troco || 0) - selectedOrder.total).toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>Total</span>
                    <span className="text-emerald-700">R$ {(selectedOrder.total || 0).toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer - Status Actions */}
            <div className="border-t border-slate-100 bg-slate-50/80 p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <PrintOrder
                  order={selectedOrder}
                  storeName={storeName}
                  paperWidth={paperWidth}
                  buttonLabel="Imprimir comanda"
                  onBeforePrint={() => setOrderToPrint(selectedOrder)}
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  disabled={['Entregue', 'Cancelado'].includes(selectedOrder.status)}
                  onClick={() => {
                    setCancelReason('');
                    setIsCancelModalOpen(true);
                  }}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:hidden transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                {selectedOrder.status === 'Pendente' && (
                  <>
                    <button
                      onClick={(e) => handleAcceptAndPrint(selectedOrder, e)}
                      disabled={acceptAndPrintLoadingId === selectedOrder._id}
                      className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 active:bg-emerald-800 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {acceptAndPrintLoadingId === selectedOrder._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Printer className="h-3.5 w-3.5" />
                      )}
                      <span>Aceitar e Imprimir</span>
                    </button>

                    <button
                      onClick={() => updateOrderStatus(selectedOrder._id, 'Preparando')}
                      className="rounded-lg border border-emerald-600 text-emerald-700 bg-emerald-50 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
                    >
                      Aceitar e Preparar
                    </button>
                  </>
                )}

                {selectedOrder.status === 'Preparando' && (
                  <button
                    onClick={() => updateOrderStatus(selectedOrder._id, 'Saiu para Entrega')}
                    className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors"
                  >
                    {selectedOrder.tipo_entrega === 'dine_in' || selectedOrder.tipo_entrega === 'local'
                      ? 'Pronto para Servir'
                      : selectedOrder.tipo_entrega === 'pickup'
                        ? 'Pronto para Retirada'
                        : 'Enviar para Entrega'}
                  </button>
                )}

                {selectedOrder.status === 'Saiu para Entrega' && (
                  <button
                    onClick={() => updateOrderStatus(selectedOrder._id, 'Entregue')}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-black transition-colors"
                  >
                    {selectedOrder.tipo_entrega === 'dine_in' || selectedOrder.tipo_entrega === 'local'
                      ? 'Concluir / Servido'
                      : selectedOrder.tipo_entrega === 'pickup'
                        ? 'Confirmar Retirada'
                        : 'Concluir Entrega'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CANCELAMENTO */}
      {isCancelModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200/80">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-bold text-slate-900 text-sm">
                Cancelar Pedido #{selectedOrder.orderNumber || selectedOrder._id.slice(-6).toUpperCase()}
              </h3>
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-600">
                Tem certeza que deseja cancelar este pedido? Esta ação alterará o status e o cliente poderá ser notificado.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motivo do cancelamento (Obrigatório)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ex: Falta de ingrediente, desistência do cliente..."
                  className="w-full rounded-lg border border-slate-200 shadow-2xs focus:border-rose-500 text-xs p-2.5 h-20 resize-none outline-none"
                  minLength={3}
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50/80 flex gap-2 justify-end border-t border-slate-100">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleCancelConfirm}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÃO DE IMPRESSÃO TÉRMICA */}
      {isPrintConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200/80 animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-100 text-slate-800">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Configuração de Impressão Térmica</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Ajuste a largura do papel para sua impressora</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintConfigOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Largura do Papel / Bobina:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSavePaperWidth('80mm')}
                    className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      paperWidth === '80mm'
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-600/10'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-slate-900">80 mm</span>
                      {paperWidth === '80mm' && <Check className="h-4 w-4 text-emerald-600 font-bold" />}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium leading-tight">
                      Padrão de mercado (Bobina Larga)
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSavePaperWidth('58mm')}
                    className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      paperWidth === '58mm'
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-600/10'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-slate-900">58 mm</span>
                      {paperWidth === '58mm' && <Check className="h-4 w-4 text-emerald-600 font-bold" />}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium leading-tight">
                      Impressora Compacta / Mini
                    </p>
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1.5">
                <p className="font-semibold text-slate-800">💡 Como funciona no navegador (Windows/Chrome):</p>
                <p className="text-[11px] leading-relaxed">
                  Ao imprimir, a caixa de diálogo do Windows/Chrome será aberta. Escolha sua impressora térmica e, nas opções de impressão, desmarque <em>"Cabeçalhos e rodapés"</em> para um cupom 100% limpo.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handlePrintTest}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-4 text-xs transition-colors shadow-xs cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  <span>Imprimir teste</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPrintConfigOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold py-2.5 px-4 text-xs transition-colors cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ÁREA DE IMPRESSÃO GLOBAL OCULTA NA TELA (IMPRIME AUTOMATICAMENTE NO WINDOW.PRINT) */}
      <PrintOrder
        order={orderToPrint || selectedOrder}
        storeName={storeName}
        paperWidth={paperWidth}
        hideButton
      />
    </div>
  );
}
