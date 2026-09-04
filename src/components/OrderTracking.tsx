import React, { useState, useEffect } from 'react';
import { Package, ChefHat, Bike, CheckCircle, ArrowLeft, Clock, MapPin, Phone, Store, UtensilsCrossed } from 'lucide-react';
import { paymentMethodLabel } from '../lib/paymentMethods';
import { customerApi } from '../features/customer/api';
import ComboComposition from './ComboComposition';
import { formatWhatsAppLink } from '../lib/formatters';
import { formatOrderReference } from '../lib/orderReference';

interface OrderTrackingProps {
  orderId: string;
  trackingToken: string;
  hasPasswordAssurance: boolean;
  storePhone?: string;
  onBack: () => void;
  tenantSlug?: string | null;
}

export default function OrderTracking({
  orderId,
  trackingToken,
  hasPasswordAssurance,
  storePhone,
  onBack,
  tenantSlug,
}: OrderTrackingProps) {
  const [pedido, setPedido] = useState<any>(null);
  const [authenticatedOrder, setAuthenticatedOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!tenantSlug || !trackingToken) {
      setLoading(false);
      return;
    }

    const fetchTracking = async () => {
      try {
        const res = await fetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/tracking/${encodeURIComponent(trackingToken)}`);
        const data = await res.json();
        if (active && data?.success && data?.tracking) {
          setPedido({
            ...data.tracking,
            _id: String(orderId || ''),
            tipo_entrega: data.tracking.deliveryType,
          });
          setLoading(false);
        } else if (active) {
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    };

    fetchTracking();

    if (hasPasswordAssurance && orderId) {
      try {
        const api = customerApi(tenantSlug);
        if (typeof api.order === 'function') {
          api.order(orderId)
            .then((data: any) => {
              if (active && data?.order) setAuthenticatedOrder(data.order);
            })
            .catch(() => {
              if (active) setAuthenticatedOrder(null);
            });
        }
      } catch {
        if (active) setAuthenticatedOrder(null);
      }
    }

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchTracking();
      }
    }, 8000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [hasPasswordAssurance, orderId, tenantSlug, trackingToken]);

  if (loading) return <div className="p-10 text-center font-medium text-gray-500">Carregando rastreio do pedido...</div>;
  if (!pedido) return (
    <div className="p-10 text-center space-y-3">
      <p className="text-gray-600 font-medium">Pedido não encontrado ou link expirado.</p>
      <button onClick={onBack} className="mt-2 inline-flex items-center gap-1.5 store-text-primary font-bold hover:underline">
        <ArrowLeft className="w-4 h-4" /> Voltar ao Cardápio
      </button>
    </div>
  );

  const isDineIn = pedido.tipo_entrega === 'dine_in' || pedido.tipo_entrega === 'local';
  const isPickup = pedido.tipo_entrega === 'pickup' || pedido.tipo_entrega === 'retirada';
  const deliveryEstimate = pedido.deliveryTimeMin == null ? '' : pedido.deliveryTimeMax != null && pedido.deliveryTimeMax !== pedido.deliveryTimeMin
    ? `${pedido.deliveryTimeMin}-${pedido.deliveryTimeMax} min`
    : `${pedido.deliveryTimeMin} min`;

  const getStatusLabel = (status: string) => {
    if (status === 'Pendente') return 'Aguardando confirmação';
    if (status === 'Preparando') return isDineIn ? 'Em preparo na cozinha' : 'Em preparação';
    if (status === 'Saiu para Entrega') {
      if (isDineIn) return 'Pronto para Servir';
      if (isPickup) return 'Pronto para Retirada';
      return 'Saiu para Entrega (A caminho)';
    }
    if (status === 'Entregue') {
      if (isDineIn) return 'Servido / Finalizado';
      if (isPickup) return 'Retirado / Finalizado';
      return 'Entregue com sucesso';
    }
    if (status === 'Cancelado') return 'Pedido Cancelado';
    return status;
  };

  const getStatusStep = () => {
    switch (pedido.status) {
      case 'Pendente': return 1;
      case 'Preparando': return 2;
      case 'Saiu para Entrega': return 3;
      case 'Entregue': return 4;
      default: return 1;
    }
  };

  const step = getStatusStep();
  const isCancelled = pedido.status === 'Cancelado';

  const stepsConfig = [
    { id: 1, label: 'Pendente', icon: Package },
    { id: 2, label: 'Preparo', icon: ChefHat },
    {
      id: 3,
      label: isDineIn ? 'Pronto' : isPickup ? 'Pronto' : 'Em Rota',
      icon: isDineIn ? UtensilsCrossed : isPickup ? Store : Bike,
    },
    {
      id: 4,
      label: isDineIn ? 'Servido' : isPickup ? 'Retirado' : 'Entregue',
      icon: CheckCircle,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-500">
      <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:store-text-primary transition-colors font-semibold">
        <ArrowLeft className="w-5 h-5" /> Voltar ao Início
      </button>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
        {/* Header do Rastreio */}
        <div className="store-bg-primary p-8 store-text-on-primary">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white/75 text-xs font-bold uppercase tracking-widest">
                  {isDineIn ? '🍽️ Comer no Local' : isPickup ? '🛍️ Retirada no Balcão' : '🛵 Entrega em Domicílio'}
                </span>
              </div>
              <h2 className="text-3xl font-black">{formatOrderReference(pedido)}</h2>
            </div>
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3 bg-white/10 p-4 rounded-2xl backdrop-blur-sm border border-white/10 text-sm font-medium">
             <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse shrink-0" />
             <span>Status: <strong className="font-bold underline">{getStatusLabel(pedido.status)}</strong></span>
          </div>
          {deliveryEstimate && <p className="mt-3 text-xs font-semibold text-white/85">{isPickup || isDineIn ? 'Preparo informado no pedido' : 'Previsão informada no pedido'}: {deliveryEstimate}</p>}
        </div>

        {/* Barra de Progresso Visual */}
        <div className="p-8">
          {isCancelled ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              Este pedido foi cancelado. Se tiver dúvidas, entre em contato diretamente com a loja.
            </div>
          ) : (
            <div className="relative flex justify-between">
              {/* Linha de fundo */}
              <div className="absolute top-6 left-0 w-full h-1 bg-gray-100 rounded-full -z-0" />
              {/* Linha de progresso */}
              <div 
                className="absolute top-6 left-0 h-1 store-bg-primary rounded-full -z-0 transition-all duration-1000 ease-out" 
                style={{ width: `${((step - 1) / 3) * 100}%` }} 
              />

              {stepsConfig.map((s) => (
                <div key={s.id} className="relative z-10 flex flex-col items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm ${
                    step >= s.id ? 'store-bg-primary store-text-on-primary scale-110' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <s.icon className="w-6 h-6" />
                  </div>
                  <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-tight ${
                    step >= s.id ? 'store-text-primary' : 'text-gray-400'
                  }`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          <hr className="my-10 border-gray-100" />

          {/* Detalhes Adicionais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-xl">
                  {isDineIn ? (
                    <UtensilsCrossed className="w-5 h-5 text-purple-600" />
                  ) : isPickup ? (
                    <Store className="w-5 h-5 text-blue-600" />
                  ) : (
                    <MapPin className="w-5 h-5 text-emerald-600" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">
                    {isDineIn ? 'Atendimento no Local' : isPickup ? 'Retirada no Balcão' : 'Endereço de Entrega'}
                  </p>
                  <p className="text-sm font-bold text-gray-800 leading-tight mt-0.5">
                    {isDineIn
                      ? 'Consumo no Estabelecimento (Salão / Mesa)'
                      : isPickup
                        ? 'Retirada no Balcão da Loja'
                        : (hasPasswordAssurance && authenticatedOrder?.address) || (hasPasswordAssurance
                          ? 'Não informado'
                          : 'Confirme sua senha para ver o endereço')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-50 rounded-xl">
                  <Phone className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Contato do Estabelecimento</p>
                  <a 
                    href={formatWhatsAppLink(storePhone || '')}
                    target="_blank" 
                    rel="noreferrer"
                    className="text-sm font-bold store-text-primary hover:underline leading-tight mt-0.5 block"
                  >
                    {storePhone || '(Não configurado)'}
                  </a>
                </div>
              </div>
              
              {pedido.metodo_pagamento && (
                <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Forma de Pagamento</p>
                  <p className="text-sm font-bold text-gray-800">
                    {paymentMethodLabel(pedido.metodo_pagamento)}
                  </p>
                </div>
              )}
            </div>

            <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
               <h4 className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-widest">Itens do Pedido</h4>
               <div className="space-y-3 max-h-48 overflow-y-auto pr-2 mb-4">
                 {(pedido.itens || []).map((item: any, idx: number) => {
                   const itemNotes = (item.opcoes_escolhidas || []).map((op: any) => op?.opcao).join(', ');
                   return (
                     <div key={idx} className="flex justify-between text-sm text-gray-700">
                       <div className="flex-1 mr-4">
                         <p className="font-medium"><span className="font-bold mr-1">{item.quantidade}x</span>{item.nome}</p>
                         {item.tipo_item === 'combo' && <ComboComposition stages={item.combo_snapshot?.etapas} className="mt-1" />}
                         {itemNotes && <p className="text-[11px] text-gray-500 line-clamp-1">{itemNotes}</p>}
                       </div>
                       <span className="font-medium">R$ {(item.subtotal || 0).toFixed(2).replace('.', ',')}</span>
                     </div>
                   );
                 })}
               </div>
               
               <h4 className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-widest pt-4 border-t border-gray-200">Resumo Financeiro</h4>
               <div className="space-y-2">
                 <div className="flex justify-between text-sm text-gray-600">
                   <span>Subtotal</span>
                   <span className="font-bold">R$ {((pedido.total || 0) - (pedido.frete || 0)).toFixed(2).replace('.', ',')}</span>
                 </div>
                 <div className="flex justify-between text-sm text-gray-600">
                   <span>Taxa de Entrega</span>
                   <span className="font-bold">R$ {(pedido.frete || 0).toFixed(2).replace('.', ',')}</span>
                 </div>
                 <div className="flex justify-between text-lg store-text-primary font-black pt-3 border-t border-gray-200 mt-2">
                   <span>Total</span>
                   <span>R$ {(pedido.total || 0).toFixed(2).replace('.', ',')}</span>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* Footer do Rastreio com Mensagens Contextualizadas */}
        <div className="bg-gray-50/80 p-6 border-t border-gray-100 mt-4 text-center">
          <p className="text-xs text-gray-600 font-medium leading-relaxed">
            {step === 1 && "Estamos aguardando a confirmação da cozinha..."}
            {step === 2 && (
              isDineIn
                ? "Seu pedido está sendo preparado para você comer aqui no estabelecimento! 👨‍🍳"
                : "Eba! Seu pedido está sendo preparado com muito carinho na cozinha. 👨‍🍳"
            )}
            {step === 3 && (
              isDineIn
                ? "Seu pedido já está quentinho e pronto para servir na mesa/balcão! 🍽️✨"
                : isPickup
                  ? "Seu pedido já está pronto no balcão da loja te esperando! 🛍️✨"
                  : "O entregador já está roncando o motor a caminho de você! 🛵💨"
            )}
            {step === 4 && (
              isDineIn
                ? "Pedido servido! Tenha uma excelente refeição e volte sempre! 😋"
                : isPickup
                  ? "Pedido retirado com sucesso! Muito obrigado e volte sempre! 😋"
                  : "Pedido entregue com sucesso! Bom apetite! 😋"
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
