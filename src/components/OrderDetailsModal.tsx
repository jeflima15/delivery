import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, MapPin, CreditCard, Star, ChevronDown, CheckCircle, Package, ChefHat, Bike, Store, Info, Check, Receipt } from 'lucide-react';
import { cn } from '../lib/utils';
import { paymentMethodLabel } from '../lib/paymentMethods';

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
      case 'Pendente': return Receipt;
      case 'Preparando': return Package;
      case 'Saiu para Entrega': return order.tipo_entrega === 'pickup' ? Store : Bike;
      case 'Entregue': return Check;
      case 'Cancelado': return Info;
      default: return CheckCircle;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'Pendente': return 'Aguardando aprovação';
      case 'Preparando': return 'Pedido em preparação';
      case 'Saiu para Entrega': return order.tipo_entrega === 'pickup' ? 'Disponível para retirada' : 'Pedido em rota de entrega';
      case 'Entregue': return 'Pedido entregue';
      case 'Cancelado': return 'Pedido cancelado';
      default: return status;
    }
  };

  const history = order.historico_status || [];

  const handleWhatsAppClick = () => {
    const nome = (order.customer?.name || order.cliente?.nome || '').toUpperCase();
    const numeroPedido = orderNumber;
    const dataObj = new Date(order.createdAt || order.data);
    
    // Segunda 02/06
    const diaSemana = dataObj.toLocaleDateString('pt-BR', { weekday: 'long' });
    const diaMes = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const hora = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    const saudacao = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
    const mensagem = encodeURIComponent(`Olá, meu nome é *${nome}* e gostaria de saber informações sobre meu pedido de número *${numeroPedido}* feito ${saudacao} ${diaMes} às ${hora}`);
    
    let zap = (order.loja_whatsapp || '').replace(/\D/g, '');
    if (zap && !zap.startsWith('55')) {
      zap = '55' + zap;
    }
    
    if (!zap) {
      alert('Número do estabelecimento não configurado no painel administrativo.');
      return;
    }
    
    window.open(`https://wa.me/${zap}?text=${mensagem}`, '_blank');
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-center bg-black/60 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full sm:max-w-[500px] bg-white flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-xl animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-300 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-[18px] border-b border-gray-100 bg-white flex-shrink-0 z-10">
          <h2 className="text-[17px] font-bold text-[#444] tracking-tight">Detalhes do pedido</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-full transition-colors font-bold"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-5 sm:p-6 pb-24 sm:pb-6 scrollbar-none content-area bg-white">
           
           <div className="flex items-start gap-3 p-4 border border-gray-100 rounded-xl mb-6 shadow-sm">
             <Star className="w-5 h-5 text-gray-300 fill-gray-200 shrink-0" />
             <div>
                <h4 className="text-[14px] font-bold text-[#444]">Prazo de avaliação finalizado</h4>
                <p className="text-[12px] text-gray-500 mt-[2px]">Você tem até 15 dias para avaliar um pedido</p>
             </div>
           </div>

           {/* Timeline Accordion */}
           <div className="mb-6">
             <button 
               onClick={() => setShowHistory(!showHistory)}
               className="w-full flex items-center justify-between py-2 transition-colors group"
             >
                 <div className="flex items-center gap-3">
                   <div className={cn(
                     "w-2.5 h-2.5 rounded-full flex-shrink-0",
                     order.status === 'Entregue' ? 'bg-emerald-500' : 'bg-gray-400'
                   )} />
                   <span className="text-[14px] font-bold text-[#444]">
                     {order.status === 'Entregue' ? 'Pedido concluído' : `Pedido ${order.status?.toLowerCase() || ''}`}
                   </span>
                 </div>
                 <ChevronDown className={cn("w-[18px] h-[18px] store-text-primary transition-transform duration-300", showHistory && "rotate-180")} strokeWidth={3} />
             </button>

             {showHistory && (
               <div className="pt-5 pb-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="relative space-y-7 ml-[13px]">
                    <div className="absolute left-[-8px] top-4 bottom-4 w-[2px] border-l-[2px] border-dashed store-border-primary" />
                    
                    {(history.length > 0 ? history : [{ status: order.status || 'Pendente', data: order.createdAt || order.data }]).map((h: any, idx: number) => {
                       const Icon = getStatusIcon(h.status);
                       
                       return (
                         <div key={idx} className="relative flex items-start gap-4">
                            <div className="relative z-10 w-9 h-9 -ml-[21px] rounded-full flex items-center justify-center bg-white border-[2px] store-border-primary store-text-primary">
                               <Icon className="w-[18px] h-[18px]" strokeWidth={2.5} />
                            </div>
                            <div className="flex-1 -mt-[2px]">
                               <p className="text-[14px] font-bold text-[#444]">
                                 {getStatusLabel(h.status)}
                               </p>
                               <p className="text-[12px] text-gray-500 font-medium tracking-tight mt-[1px]">
                                 {formatDateShort(h.data)}, {formatTime(h.data)}
                               </p>
                            </div>
                         </div>
                       );
                    })}

                    {/* Final Concluído Item (Static in B3X timeline if Delivered) */}
                    {order.status === 'Entregue' && (
                       <div className="relative flex items-start gap-4">
                            <div className="relative z-10 w-9 h-9 -ml-[21px] rounded-full flex items-center justify-center bg-white border-[2px] store-border-primary store-text-primary">
                               <CheckCircle className="w-[18px] h-[18px]" strokeWidth={2.5} />
                            </div>
                            <div className="flex-1 -mt-[2px]">
                               <p className="text-[14px] font-bold text-[#444]">Pedido concluído</p>
                               <p className="text-[12px] text-gray-500 font-medium tracking-tight mt-[1px]">
                                 {formatDateShort(history[history.length-1]?.data)}, {formatTime(history[history.length-1]?.data)}
                               </p>
                            </div>
                       </div>
                    )}
                  </div>
               </div>
             )}
           </div>

           <div className="w-full border-t border-dashed border-gray-200 mb-6"></div>

           {/* Pedido Details */}
           <div className="mb-6">
             <h3 className="font-bold text-[#444] text-[15px] mb-4">Pedido N° {orderNumber}</h3>
             
             <div className="space-y-4">
               {order.itens?.map((item: any, idx: number) => (
                 <div key={idx} className="flex justify-between items-start gap-3">
                   <div className="flex gap-3">
                     <span className="border border-gray-200 text-gray-600 px-[6px] py-[2px] rounded text-[12px] font-bold h-fit min-w-[28px] text-center">{item.quantidade}x</span>
                     <div className="mt-[-1px]">
                       <span className="text-[14px] text-gray-700 font-bold block leading-snug">{item.produtoId?.nome || item.nome || 'Produto'}</span>
                       {item.opcoes_escolhidas?.length > 0 && (
                         <p className="text-[12px] text-gray-500 mt-[2px] leading-relaxed">
                           {item.opcoes_escolhidas.map((o: any) => o.opcao).join(', ')}
                         </p>
                       )}
                     </div>
                   </div>
                   <span className="text-gray-700 font-medium text-[14px] whitespace-nowrap mt-[-1px]">R$ {(item.subtotal || 0).toFixed(2).replace('.', ',')}</span>
                 </div>
               ))}
             </div>
           </div>

           <div className="w-full border-t border-dashed border-gray-200 mb-4"></div>

           {/* Financials */}
           <div className="space-y-[10px] mb-4">
             <div className="flex justify-between text-gray-500 text-[13px]">
               <span>Subtotal</span>
               <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
             </div>
             <div className="flex justify-between text-gray-500 text-[13px]">
               <span>Taxa de entrega</span>
               <span>R$ {(order.frete || 0).toFixed(2).replace('.', ',')}</span>
             </div>
             {order.desconto_cupom > 0 && (
               <div className="flex justify-between text-emerald-600 text-[13px]">
                 <span>Desconto Cupom</span>
                 <span>- R$ {order.desconto_cupom.toFixed(2).replace('.', ',')}</span>
               </div>
             )}
             <div className="flex justify-between font-bold text-[#444] text-[16px] pt-1">
               <span>Total</span>
               <span>R$ {order.total?.toFixed(2).replace('.', ',')}</span>
             </div>
           </div>

           <div className="w-full border-t border-dashed border-gray-200 mb-4"></div>

           <div className="flex justify-between store-text-primary text-[13px] mb-4">
             <span>Pontuação deste pedido</span>
             <span className="font-bold">{points} pontos</span>
           </div>

           <div className="w-full border-t border-dashed border-gray-200 mb-6"></div>

           {/* Entrega Info */}
           <div className="space-y-4 mb-6">
              <h3 className="font-bold text-[15px] text-[#444]">Informações para entrega</h3>
              <div className="flex gap-[14px] items-start mt-4">
                <div className="pt-1"><UserIcon className="w-5 h-5 text-gray-400" /></div>
                <div>
                   <p className="text-[#444] text-[14px] mb-[2px] uppercase">{order.customer?.name || order.cliente?.nome}</p>
                   <p className="text-gray-500 text-[13px]">{order.customer?.phone || order.cliente?.telefone}</p>
                </div>
              </div>
              <div className="flex gap-[14px] items-start mt-4">
                <div className="pt-1"><MapPin className="w-5 h-5 text-gray-400" /></div>
                <div>
                   <p className="text-[14px] text-[#444] leading-relaxed uppercase">
                     {rua}{numero ? `, ${numero}` : ''}<br/>
                     {bairro ? <span className="block text-gray-500 text-[13px] mt-[2px]">{bairro}</span> : null}
                   </p>
                </div>
              </div>
           </div>
           
           <div className="w-full border-t border-dashed border-gray-200 mb-6"></div>

           {/* Pagamento */}
           <div className="mb-2">
              <h3 className="font-bold text-[15px] text-[#444] mb-4">Pagamento</h3>
              <div className="flex gap-[14px] items-start">
                <div className="pt-0.5"><CreditCard className="w-5 h-5 text-gray-400" /></div>
                <div className="text-[14px] text-[#444] font-bold uppercase">
                  {paymentMethodLabel(order.metodo_pagamento)}
                </div>
              </div>
           </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-gray-100 flex-shrink-0">
           <button 
             onClick={handleWhatsAppClick}
             className="w-full store-bg-primary store-bg-primary-hover store-bg-primary-active store-text-on-primary font-bold py-[14px] rounded-lg transition-all text-[13px] uppercase flex items-center justify-center gap-2 shadow-sm"
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
