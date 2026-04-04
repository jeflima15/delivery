import React, { useState, useEffect } from 'react';
import { Search, Filter, Eye, X, MapPin, CreditCard, Clock, CheckCircle, ChefHat, Bike, PackageX, CheckCheck, MessageCircle, Phone, Store, RefreshCw, Printer } from 'lucide-react';
import PrintOrder from './PrintOrder';

import { useToast } from './Toast';

export default function AdminOrders({ token, onUnauthorized }: { token: string, onUnauthorized: () => void }) {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [novosPedidosCount, setNovosPedidosCount] = useState(0);
  const lastOrderIdRef = React.useRef<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const prevCountRef = React.useRef(0);
  const { showToast } = useToast();

  const audioCtxRef = React.useRef<AudioContext | null>(null);

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
      if (ctx.state === 'suspended') await ctx.resume();

      const now = ctx.currentTime;
      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.5, start + 0.1);
        gain.gain.linearRampToValueAtTime(0, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      // Sequência de Alerta Chamativa (3 bips rápidos e agudos)
      playTone(880, now, 0.3);
      playTone(1108.73, now + 0.4, 0.3);
      playTone(1318.51, now + 0.8, 0.5);

    } catch (e) { console.error('Beep Error:', e) }
  };

  const fetchPedidos = async () => {
    try {
      const res = await fetch('/api/admin/pedidos', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.sucesso) {
        setPedidos(data.pedidos);

        if (data.pedidos.length > 0) {
          const latestId = data.pedidos[0]._id;

          if (lastOrderIdRef.current && lastOrderIdRef.current !== latestId) {
            const newIndex = data.pedidos.findIndex((p: any) => p._id === lastOrderIdRef.current);
            const count = newIndex > 0 ? newIndex : 1;
            setNovosPedidosCount(prev => prev + count);
            if (soundEnabled) playBeep();
          }
          lastOrderIdRef.current = latestId;
        }
      }
    } catch (error) {
      showToast('Erro ao buscar pedidos', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPedidos();
    const interval = setInterval(fetchPedidos, 15000);

    // Destranca o AudioContext no primeiro clique (política do Chrome/Safari)
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



    return () => {
      clearInterval(interval);
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
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

  const updateOrderStatus = async (id: string, status: string) => {

    try {
      const res = await fetch(`/api/admin/pedidos/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.sucesso) {
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

  const handleStatusAdvance = async (e: React.MouseEvent, pedido: any, novoStatus: string) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const res = await fetch(`/api/admin/pedidos/${pedido._id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: novoStatus })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.erro || 'Erro na resposta do servidor');
      }

      const data = await res.json();

      if (data.sucesso) {
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


    window.open(`https://wa.me/55${telefoneFormatado}?text=${encodeURIComponent(mensagem)}`, '_blank');
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
          </h2>
          <p className="text-gray-500 mt-1">Acompanhe e atualize o status das entregas.</p>
        </div>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
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

      {/* Tabela de Dados */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider font-semibold">
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
                  <td colSpan={5} className="p-8 text-center text-gray-500">Nenhum pedido encontrado.</td>
                </tr>
              ) : (
                filteredPedidos.map(pedido => (
                  <tr key={pedido._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-5">
                      <p className="font-bold text-gray-900">#{pedido._id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatarData(pedido.createdAt)}</p>
                    </td>
                    <td className="p-5">
                      <p className="font-bold text-gray-900">{pedido.cliente?.nome || 'Cliente não informado'}</p>
                      <p className="text-xs text-gray-500 mt-1">{pedido.cliente?.telefone || '-'}</p>
                    </td>
                    <td className="p-5">
                      <p className="font-bold text-emerald-600">R$ {(pedido.total || 0).toFixed(2).replace('.', ',')}</p>
                      <p className="text-xs text-gray-500 mt-1 uppercase">{pedido.metodo_pagamento || 'Não informado'}</p>
                    </td>
                    <td className="p-5">
                      <span className={cn("px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap", getStatusColor(pedido.status))}>
                        {getStatusLabel(pedido.status, pedido.tipo_entrega)}
                      </span>

                    </td>
                    <td className="p-5 text-right">
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
                            <CheckCircle className="w-4 h-4" /> Aprovar
                          </button>
                        )}
                        {pedido.status === 'Preparando' && (
                          <button
                            onClick={(e) => handleStatusAdvance(e, pedido, 'Saiu para Entrega')}
                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors font-bold text-sm shadow-sm shadow-blue-600/20"
                          >
                            {pedido.tipo_entrega === 'pickup' ? (
                              <><Store className="w-4 h-4" /> Pronto p/ Retirada</>
                            ) : (
                              <><Bike className="w-4 h-4" /> Despachar</>
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

      {/* Modal de Detalhes Completo */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 md:p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50 flex-shrink-0 gap-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Pedido #{selectedOrder._id.slice(-6).toUpperCase()}</h3>
                <p className="text-sm text-gray-500 mt-1">{formatarData(selectedOrder.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 self-end md:self-auto">
                <button
                  onClick={() => handleNotifyClient(selectedOrder)}
                  className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1DA851] text-white px-5 py-2.5 rounded-xl transition-colors font-bold shadow-sm text-sm"
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </button>
                <button
                  onClick={() => setSelectedOrder(null)}
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
            <div className="p-4 md:p-6 border-t border-gray-100 bg-gray-50 flex-shrink-0">
              <h4 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider text-center">Ações Rápidas - Mudar Status</h4>
              <div className="flex flex-wrap gap-2 md:gap-3 justify-center">
                <button
                  onClick={() => updateOrderStatus(selectedOrder._id, 'Pendente')}
                  className={cn("flex-1 py-3 px-2 md:px-4 rounded-xl text-xs md:text-sm font-bold transition-all shadow-sm border", selectedOrder.status === 'Pendente' ? 'bg-amber-100 text-amber-700 border-amber-300 ring-2 ring-amber-500' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')}
                >
                  Pendente
                </button>
                <button
                  onClick={() => updateOrderStatus(selectedOrder._id, 'Preparando')}
                  className={cn("flex-1 py-3 px-2 md:px-4 rounded-xl text-xs md:text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 border", selectedOrder.status === 'Preparando' ? 'bg-blue-100 text-blue-700 border-blue-300 ring-2 ring-blue-500' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')}
                >
                  <ChefHat className="w-4 h-4 hidden sm:block" /> Preparar
                </button>
                <button
                  onClick={() => updateOrderStatus(selectedOrder._id, 'Saiu para Entrega')}
                  className={cn("flex-1 py-3 px-2 md:px-4 rounded-xl text-xs md:text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 border", selectedOrder.status === 'Saiu para Entrega' ? 'bg-purple-100 text-purple-700 border-purple-300 ring-2 ring-purple-500' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')}
                >
                  {selectedOrder.tipo_entrega === 'pickup' ? (
                    <><Store className="w-4 h-4 hidden sm:block" /> Pronto</>
                  ) : (
                    <><Bike className="w-4 h-4 hidden sm:block" /> Despachar</>
                  )}
                </button>
                <button
                  onClick={() => updateOrderStatus(selectedOrder._id, 'Entregue')}
                  className={cn("flex-1 py-3 px-2 md:px-4 rounded-xl text-xs md:text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 border", selectedOrder.status === 'Entregue' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-emerald-500' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')}
                >
                  <CheckCheck className="w-4 h-4 hidden sm:block" /> {selectedOrder.tipo_entrega === 'pickup' ? 'Coletado' : 'Finalizado'}
                </button>
                <button
                  onClick={() => updateOrderStatus(selectedOrder._id, 'Cancelado')}
                  className={cn("py-3 px-3 md:px-4 rounded-xl text-xs md:text-sm font-bold transition-all shadow-sm border", selectedOrder.status === 'Cancelado' ? 'bg-red-100 text-red-700 border-red-300 ring-2 ring-red-500' : 'bg-red-50 border-red-100 text-red-600 hover:bg-red-100')}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
