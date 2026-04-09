import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, MapPin, CreditCard, Star, ChevronDown, Clock, CheckCircle, Package, ChefHat, Bike, Store, Info } from 'lucide-react';
import { cn } from '../lib/utils';

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
}

export default function OrderDetailsModal({ isOpen, onClose, order }: OrderDetailsModalProps) {
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else {
        document.body.style.overflow = '';
        setShowHistory(false);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen || !order) return null;

  const orderId = order._id || order.id || '000000';
  const orderNumber = orderId.toString().slice(-6).toUpperCase();
  const addressStr = order.tipo_entrega === 'pickup' ? 'Retirada na Loja' : (order.cliente?.endereco || order.endereco || 'Endereço não informado');
  
  const parts = addressStr.split(',').map((s: string) => s?.trim());
  const rua = parts[0] || addressStr;
  const numero = parts.length > 1 ? parts[1].split('-')[0]?.trim() : '';
  const bairro = parts.length > 2 ? parts[2] : '';
  const comp = parts.length > 3 ? parts.slice(3).join(', ') : '';

  const points = Math.floor(order.total || 0);
  const subtotal = (order.total || 0) - (order.frete || 0) + (order.desconto_cupom || 0);

  const formatTime = (date: any) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateShort = (date: any) => {
    if (!date) return '';
    const d = new Date(date);
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Pendente': return Package;
      case 'Preparando': return ChefHat;
      case 'Saiu para Entrega': return order.tipo_entrega === 'pickup' ? Store : Bike;
      case 'Entregue': return CheckCircle;
      case 'Cancelado': return Info;
      default: return Clock;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'Pendente': return 'Aguardando aprovação';
      case 'Preparando': return 'Pedido em preparação';
      case 'Saiu para Entrega': return order.tipo_entrega === 'pickup' ? 'Pronto para retirada' : 'Pedido em rota de entrega';
      case 'Entregue': return 'Pedido entregue';
      case 'Cancelado': return 'Pedido cancelado';
      default: return status;
    }
  };

  const history = order.historico_status || [];
  const currentStatusData = history.find((h: any) => h.status === order.status) || history[history.length - 1];

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-center bg-black/60 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full sm:max-w-[480px] bg-gray-50 flex flex-col h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-xl animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-300 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shadow-sm flex-shrink-0 z-10 transition-colors">
          <h2 className="text-[17px] font-bold text-[#444] tracking-tight">Detalhes do pedido</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-colors font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4 scrollbar-none pb-20 sm:pb-5">
           
           <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm bg-white">
             <button 
               onClick={() => setShowHistory(!showHistory)}
               className="w-full h-[60px] flex items-center justify-between px-5 transition-colors hover:bg-gray-50/50"
             >
                 <div className="flex items-center gap-3">
                   <div className={cn(
                     "w-2.5 h-2.5 rounded-full",
                     order.status === 'Entregue' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                   )} />
                   <span className="text-[13px] font-bold text-[#444] uppercase tracking-wider">
                     {order.status === 'Entregue' ? 'Pedido concluído' : `Pedido ${order.status?.toLowerCase() || ''}`}
                   </span>
                 </div>
                 <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform duration-300", showHistory && "rotate-180")} />
             </button>

             {showHistory && (
               <div className="px-5 pb-6 pt-2 border-t border-gray-50 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="relative space-y-5 px-3">
                    {/* Vertical line through timeline items */}
                    <div 
                      className="absolute left-[13px] top-1 bottom-1 w-[1.5px] bg-gray-100" 
                    />
                    
                    {(history.length > 0 ? [...history].reverse() : [{ status: order.status || 'Pendente', data: order.createdAt || order.data }]).map((h: any, idx: number) => {
                       const Icon = getStatusIcon(h.status);
                       const isCurrent = idx === 0;
                       
                       return (
                         <div key={idx} className="relative flex items-start gap-4">
                            <div className={cn(
                              "relative z-10 w-7 h-7 rounded-full flex items-center justify-center border transition-all duration-300",
                              isCurrent ? "bg-emerald-500 border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]" : "bg-white border-gray-100 text-gray-300"
                            )}>
                               <Icon className="w-3.5 h-3.5" strokeWidth={isCurrent ? 3 : 2} />
                            </div>
                            <div className="flex-1 -mt-0.5">
                               <p className={cn("text-[13px] font-bold transition-colors", isCurrent ? "text-gray-900" : "text-gray-400")}>
                                 {getStatusLabel(h.status)}
                               </p>
                               <p className="text-[10px] text-gray-400 font-medium tracking-tight mt-0.5">
                                 {formatDateShort(h.data)} {formatTime(h.data)}
                               </p>
                            </div>
                         </div>
                       );
                    })}
                  </div>
               </div>
             )}
           </div>

           {/* Pedido Info */}
           <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
             <h3 className="font-bold text-[#444] text-[15px] mb-5 tracking-tight border-b border-gray-50 pb-3 -mx-5 px-5">Pedido N° {orderNumber}</h3>
             
             <div className="space-y-4">
               {order.itens?.map((item: any, idx: number) => (
                 <div key={idx} className="flex justify-between items-start gap-3">
                   <div className="flex gap-3">
                     <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[11px] font-bold h-fit min-w-[26px] text-center">{item.quantidade}x</span>
                     <div>
                       <span className="text-[13px] text-gray-700 font-bold block leading-tight">{item.produtoId?.nome || item.nome || 'Produto'}</span>
                       {item.opcoes_escolhidas?.length > 0 && (
                         <p className="text-[11px] text-gray-400 font-medium mt-1 leading-relaxed">
                           {item.opcoes_escolhidas.map((o: any) => o.opcao).join(', ')}
                         </p>
                       )}
                     </div>
                   </div>
                   <span className="text-gray-700 font-bold text-[13px] whitespace-nowrap">R$ {(item.subtotal || 0).toFixed(2).replace('.', ',')}</span>
                 </div>
               ))}
             </div>

             <div className="mt-6 pt-5 border-t border-gray-50 space-y-2.5">
               <div className="flex justify-between text-gray-400 font-bold text-[12px] uppercase">
                 <span>Subtotal</span>
                 <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
               </div>
               <div className="flex justify-between text-gray-400 font-bold text-[12px] uppercase">
                 <span>Taxa de entrega</span>
                 <span>R$ {(order.frete || 0).toFixed(2).replace('.', ',')}</span>
               </div>
               {order.desconto_cupom > 0 && (
                 <div className="flex justify-between text-emerald-600 font-bold text-[12px] uppercase">
                   <span>Desconto Cupom</span>
                   <span>- R$ {order.desconto_cupom.toFixed(2).replace('.', ',')}</span>
                 </div>
               )}
               <div className="flex justify-between font-black text-[#444] text-[16px] pt-1">
                 <span>TOTAL</span>
                 <span>R$ {order.total?.toFixed(2).replace('.', ',')}</span>
               </div>
               <div className="flex justify-between text-emerald-600 font-bold text-[11px] pt-1 uppercase tracking-widest">
                 <span>PONTOS GANHOS</span>
                 <span>{points} pts</span>
               </div>
             </div>
           </div>

           {/* Entrega Info */}
           <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <h3 className="font-bold text-[14px] text-[#444] uppercase tracking-widest text-[11px]">Entrega</h3>
              <div className="flex gap-3 items-center">
                <div className="w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center text-gray-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div>
                   <p className="text-[#444] font-bold text-[13px]">{order.customer?.name || order.cliente?.nome}</p>
                   <p className="text-gray-400 text-[12px] font-medium">{order.customer?.phone || order.cliente?.telefone}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="pt-1">
                   <p className="text-[13px] font-medium text-gray-600 leading-relaxed uppercase tracking-tight">
                     {rua}{numero ? `, ${numero}` : ''}<br/>
                     {bairro ? <span className="block text-gray-400 text-[12px]">{bairro}</span> : null}
                   </p>
                </div>
              </div>
           </div>
           
           {/* Pagamento */}
           <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[11px] text-gray-400 uppercase tracking-widest mb-1">Pagamento</h3>
                <div className="flex items-center gap-2 text-[13px] text-[#444] font-bold uppercase">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  {order.metodo_pagamento || 'Cartão'}
                </div>
              </div>
           </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-gray-100 flex-shrink-0">
           <button 
             onClick={() => window.open('https://wa.me/55' + (order.loja_whatsapp || '').replace(/\D/g, ''), '_blank')}
             className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl transition-all text-[12px] tracking-widest uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10"
           >
              FALAR COM O ESTABELECIMENTO
           </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const UserIcon = (props: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
