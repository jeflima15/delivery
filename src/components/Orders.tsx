import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  CheckCircle, 
  ChefHat, 
  Bike, 
  PackageX, 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  CreditCard, 
  QrCode, 
  Banknote,
  Calendar,
  ShoppingBag,
  Store,
  Tag,
  Star
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}



export default function Orders({ onTrackingRequest, onReorder }: { onTrackingRequest?: (id: string) => void, onReorder?: (items: any[]) => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const toggleOrder = (id: string) => {
    setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const token = localStorage.getItem('stitch_token');
        const res = await fetch('/api/pedidos/meus', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.sucesso) {
          setOrders(data.pedidos);
        }
      } catch (error) {
        console.error("Erro ao buscar pedidos", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, []);


  const getStatusLabel = (status: string, tipo: string) => {
    if (status === 'Saiu para Entrega') {
      return tipo === 'pickup' ? 'Pronto para Retirada' : 'Saiu para Entrega';
    }
    if (status === 'Entregue') {
      return tipo === 'pickup' ? 'Retirado' : 'Entregue';
    }
    return status;
  };

  const getStatusConfig = (status: string, tipo?: string) => {
    switch (status) {
      case 'Pendente': return { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' };
      case 'Preparando': return { icon: ChefHat, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' };
      case 'Saiu para Entrega': 
        return { 
          icon: tipo === 'pickup' ? Store : Bike, 
          color: 'text-purple-500', 
          bg: 'bg-purple-50', 
          border: 'border-purple-200' 
        };
      case 'Entregue': return { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' };
      case 'Cancelado': return { icon: PackageX, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' };
      default: return { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' };
    }
  };


  const formatPaymentMethod = (method: string) => {
    const m = (method || '').toLowerCase();
    switch (m) {
      case 'pix': return { label: 'PIX (Aprovação Imediata)', icon: QrCode };
      case 'cartao': return { label: 'Cartão (Débito/Crédito)', icon: CreditCard };
      case 'dinheiro': return { label: 'Dinheiro', icon: Banknote };
      default: return { label: method || 'Não informado', icon: CreditCard };
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Data não disponível';
    const date = new Date(dateStr);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(',', ' às');
  };

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {[1, 2, 3].map(i => (
          <div key={`order-skeleton-${i}`} className="h-32 bg-white border border-gray-100 animate-pulse rounded-3xl shadow-sm"></div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400 px-6">
        <div className="bg-gray-100 p-6 rounded-full mb-6">
          <ShoppingBag className="w-16 h-16 opacity-20" />
        </div>
        <p className="text-xl font-bold text-gray-900 mb-2">Nenhum pedido ainda</p>
        <p className="text-gray-500 text-center max-w-xs">
          Parece que você ainda não fez nenhum pedido. Que tal explorar nosso cardápio?
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Meus Pedidos</h2>
        <span className="bg-gray-100 text-gray-600 px-4 py-1.5 rounded-full text-sm font-bold">
          {orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}
        </span>
      </div>
      
      {orders.map((order) => {
        const config = getStatusConfig(order.status, order.tipo_entrega);

        const StatusIcon = config.icon;
        const orderId = order._id || order.id;
        const isExpanded = expandedOrders[orderId];
        
        const payment = formatPaymentMethod(order.metodo_pagamento || order.pagamento);
        const PaymentIcon = payment.icon;

        const address = order.tipo_entrega === 'pickup' 
          ? 'Retirada na Loja' 
          : (order.cliente?.endereco || order.endereco || 'Endereço não informado');

        const totalPedido = order.total || (order.itens || []).reduce((acc: number, item: any) => {
          return acc + (item.subtotal || ((item.preco_unitario || item.preco || 0) * (item.quantidade || 0)));
        }, 0) + (order.frete || 0);
        
        return (
          <div key={orderId} className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
            <div 
              className="p-5 cursor-pointer flex items-center justify-between group"
              onClick={() => toggleOrder(orderId)}
            >
              <div className="flex items-center gap-4">
                <div className={`p-3.5 rounded-2xl ${config.bg} ${config.color} transition-colors`}>
                  <StatusIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">#{orderId.slice(-6).toUpperCase()}</p>
                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                    <p className="text-xs font-medium text-gray-400">{formatDate(order.createdAt || order.data).split(' às ')[0]}</p>
                  </div>
                  <p className={`font-bold text-lg leading-tight ${config.color}`}>
                    {getStatusLabel(order.status, order.tipo_entrega)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {order.status !== 'Entregue' && order.status !== 'Cancelado' && onTrackingRequest && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onTrackingRequest(orderId); }}
                        className="text-[10px] font-black bg-emerald-600/90 text-white px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm active:scale-95"
                      >
                        Rastrear em Tempo Real
                      </button>
                    )}
                    {['Entregue', 'Cancelado'].includes(order.status) && onReorder && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onReorder(order.itens); }}
                        className="text-[10px] font-black bg-emerald-600/90 text-white px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm active:scale-95 flex items-center gap-2"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" /> Refazer Pedido
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-5">
                <div className="text-right hidden sm:block">
                  <p className="text-lg font-bold text-gray-900">R$ {totalPedido.toFixed(2).replace('.', ',')}</p>
                  <p className="text-xs text-gray-400 font-medium">{order.itens?.length || 0} {order.itens?.length === 1 ? 'item' : 'itens'}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-gray-100 transition-colors">
                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="px-5 pb-6 pt-2 border-t border-gray-50 bg-gray-50/30 animate-in slide-in-from-top-2 duration-300">
                <div className="space-y-6">
                  {/* Itens */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-gray-400" />
                      Itens do Pedido
                    </h4>
                    <div className="space-y-2">
                      {order.itens?.map((item: any, idx: number) => {
                        const itemTotal = item.subtotal || ((item.preco_unitario || item.preco || 0) * (item.quantidade || 0));
                        return (
                          <div key={idx} className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex flex-col">
                              <span className="text-gray-900 font-bold text-sm">{item.quantidade || 0}x {item.produtoId?.nome || item.nome || 'Produto'}</span>
                              {item.opcoes_escolhidas?.length > 0 && (
                                <span className="text-xs text-gray-500 mt-1">
                                  {item.opcoes_escolhidas.map((op: any) => op.opcao).join(', ')}
                                </span>
                              )}
                            </div>
                            <span className="text-emerald-600 font-bold text-sm">R$ {itemTotal.toFixed(2).replace('.', ',')}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Detalhes de Entrega e Pagamento */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-emerald-500" />
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Entrega</h4>
                      </div>
                      <p className="text-sm text-gray-900 font-medium leading-relaxed">{address}</p>
                    </div>
                    
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <PaymentIcon className="w-4 h-4 text-emerald-500" />
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pagamento</h4>
                      </div>
                      <p className="text-sm text-gray-900 font-medium">{payment.label}</p>
                    </div>
                  </div>

                  {/* Barra de Progresso do Pedido */}
                  {order.status !== 'Cancelado' && order.status !== 'Entregue' && (
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm overflow-hidden relative">
                      <div className="flex justify-between mb-3 text-[10px] font-extrabold uppercase tracking-widest text-gray-400">
                        <span className={cn(order.status === 'Pendente' ? "text-amber-500" : "text-emerald-500")}>Recebido</span>
                        <span className={cn(order.status === 'Preparando' ? "text-blue-500" : (order.status === 'Saiu para Entrega' ? "text-emerald-500" : ""))}>Preparando</span>
                        <span className={cn(order.status === 'Saiu para Entrega' ? "text-purple-500" : "")}>{order.tipo_entrega === 'pickup' ? 'Pronto' : 'No Caminho'}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all duration-1000",
                            order.status === 'Pendente' ? "w-[20%] bg-amber-500" :
                            order.status === 'Preparando' ? "w-[50%] bg-blue-500" :
                            "w-[100%] bg-emerald-500"
                          )}
                        />
                      </div>
                      <p className="mt-4 text-center text-xs font-bold text-gray-500 animate-pulse">
                        {order.status === 'Pendente' ? 'Aguardando confirmação da loja...' : 
                         order.status === 'Preparando' ? 'Sua delícia está sendo preparada agora!' : 
                         order.tipo_entrega === 'pickup' ? 'Seu pedido já está pronto para retirada!' : 'O entregador está a caminho do seu endereço!'}
                      </p>
                    </div>
                  )}

                  {/* Resumo de Valores */}
                  <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-2">
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Subtotal</span>
                      <span>R$ {(totalPedido - (order.frete || 0) + (order.desconto_cupom || 0) + (order.valor_desconto_pontos || 0)).toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Taxa de Entrega</span>
                      <span>{order.frete > 0 ? `R$ ${order.frete.toFixed(2).replace('.', ',')}` : 'Grátis'}</span>
                    </div>
                    
                    {order.desconto_cupom > 0 && (
                      <div className="flex justify-between text-sm text-emerald-600 font-bold">
                        <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Cupom ({order.cupom_codigo})</span>
                        <span>-R$ {order.desconto_cupom.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}
                    {order.valor_desconto_pontos > 0 && (
                      <div className="flex justify-between text-sm text-emerald-600 font-bold">
                        <span className="flex items-center gap-1"><Star className="w-3 h-3" /> Fidelidade</span>
                        <span>-R$ {order.valor_desconto_pontos.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-50">
                      <span>Total</span>
                      <span>R$ {totalPedido.toFixed(2).replace('.', ',')}</span>
                    </div>
                  </div>


                  {/* Data e Hora */}
                  <div className="flex items-center justify-center gap-2 text-gray-400 py-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-medium">Realizado em {formatDate(order.createdAt || order.data)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
