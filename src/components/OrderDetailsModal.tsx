import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, MapPin, CreditCard, Star, ChevronDown } from 'lucide-react';

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
}

export default function OrderDetailsModal({ isOpen, onClose, order }: OrderDetailsModalProps) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen || !order) return null;

  const orderId = order._id || order.id || '000000';
  const orderNumber = orderId.toString().slice(-6).toUpperCase();
  const addressStr = order.tipo_entrega === 'pickup' ? 'Retirada na Loja' : (order.cliente?.endereco || order.endereco || 'Endereço não informado');
  
  // Try to parse address fields if separated by commas
  const parts = addressStr.split(',').map((s: string) => s?.trim());
  const rua = parts[0] || addressStr;
  const numero = parts.length > 1 ? parts[1].split('-')[0]?.trim() : '';
  const bairro = parts.length > 2 ? parts[2] : '';
  const comp = parts.length > 3 ? parts.slice(3).join(', ') : '';

  const points = Math.floor(order.total || 0);
  const subtotal = (order.total || 0) - (order.frete || 0) + (order.desconto_cupom || 0);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-center bg-black/60 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full sm:max-w-[480px] bg-gray-50 flex flex-col h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-xl animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-300 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shadow-sm flex-shrink-0 z-10">
          <h2 className="text-[17px] font-bold text-[#444] tracking-tight">Detalhes do pedido</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-colors font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4 scrollbar-thin">
           
           <div className="flex items-start gap-4 p-4 border border-gray-100 rounded-xl bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
             <Star className="w-5 h-5 text-gray-300 mt-0.5 fill-gray-200" />
             <div>
                <h4 className="text-[13px] font-bold text-[#444]">Prazo de avaliação finalizado</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">Você tem até 15 dias para avaliar um pedido</p>
             </div>
           </div>

           <div className="border border-gray-100 rounded-xl overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
             <div className="flex items-center justify-between p-4 border-b border-gray-50 bg-white">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                  <span className="text-[13px] font-bold text-[#444]">Pedido {order.status === 'Entregue' ? 'concluído' : order.status}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-[#A37852]" />
             </div>
             
             <div className="p-5 bg-white space-y-4 text-[13px] border-b border-gray-100">
               <h3 className="font-bold text-[#444] text-[15px] tracking-tight">Pedido N° {orderNumber}</h3>
               
               <div className="space-y-3.5 pb-5 border-b border-gray-100 border-dashed">
                 {order.itens?.map((item: any, idx: number) => {
                   const itemSub = item.subtotal || ((item.preco_unitario || item.preco || 0) * (item.quantidade || 0));
                   return (
                     <div key={idx} className="flex justify-between items-start gap-3">
                       <div className="flex gap-2.5 font-medium text-[#555]">
                         <span className="bg-gray-50 text-gray-600 border border-gray-100 px-1.5 py-0.5 rounded text-[11px] font-bold h-fit min-w-[24px] text-center">{item.quantidade}x</span>
                         <div>
                            <span className="text-[13px] text-[#444] max-w-[200px] block leading-tight">{item.produtoId?.nome || item.nome || 'Produto'}</span>
                            {item.opcoes_escolhidas?.length > 0 && (
                              <p className="text-[11px] text-gray-400 font-normal mt-1 max-w-[200px] leading-snug">
                                {item.opcoes_escolhidas.map((o: any) => o.opcao).join(', ')}
                              </p>
                            )}
                         </div>
                       </div>
                       <span className="text-[#555] font-medium whitespace-nowrap">R$ {itemSub.toFixed(2).replace('.', ',')}</span>
                     </div>
                   );
                 })}
               </div>

               <div className="space-y-2.5 pt-2 border-b border-gray-100 border-dashed pb-5">
                 <div className="flex justify-between text-gray-500 font-medium text-[13px]">
                   <span>Subtotal</span>
                   <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                 </div>
                 <div className="flex justify-between text-gray-500 font-medium text-[13px]">
                   <span>Taxa de entrega</span>
                   <span>R$ {(order.frete || 0).toFixed(2).replace('.', ',')}</span>
                 </div>
                 <div className="flex justify-between font-bold text-[#444] text-[15px] pt-1">
                   <span>Total</span>
                   <span>R$ {order.total?.toFixed(2).replace('.', ',')}</span>
                 </div>
               </div>

               <div className="flex justify-between text-emerald-500 font-bold text-[12px] pt-1 pb-1">
                 <span>Pontuação deste pedido</span>
                 <span>{points} pontos</span>
               </div>
             </div>
           </div>

           <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-4">
              <h3 className="font-bold text-[14px] text-[#444]">Informações para entrega</h3>
              <div className="flex gap-3 text-[13px] text-gray-600 font-medium items-center">
                <div className="w-5 flex justify-center"><UserIcon className="w-4 h-4 text-gray-400" /></div>
                <div>
                   <p className="text-[#444] font-bold">{order.cliente?.nome}</p>
                   <p className="text-gray-500 text-[12px] mt-0.5">{order.cliente?.telefone}</p>
                </div>
              </div>
              <div className="flex gap-3 text-[13px] text-gray-600 font-medium mt-2">
                <div className="w-5 flex justify-center mt-0.5"><MapPin className="w-4 h-4 text-gray-400" /></div>
                <div>
                   <p className="leading-relaxed text-[#555]">
                     {rua}{numero ? `, ${numero}` : ''}<br/>
                     {bairro ? <span className="block mt-0.5">{bairro}</span> : null}
                     {comp ? <span className="block mt-0.5 text-gray-400">{comp}</span> : null}
                   </p>
                </div>
              </div>
           </div>
           
           <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-3">
              <h3 className="font-bold text-[14px] text-[#444]">Pagamento</h3>
              <div className="flex items-center gap-3 text-[13px] text-[#555] font-medium">
                <CreditCard className="w-4 h-4 text-gray-400" />
                {order.metodo_pagamento || 'Cartão de crédito'}
              </div>
           </div>
           <div className="h-4"></div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-gray-100 flex-shrink-0">
           <button 
             onClick={() => window.open('https://wa.me/55' + (order.loja_whatsapp || ''), '_blank')}
             className="w-full bg-[#A37852] hover:bg-[#8B6442] active:scale-[0.98] text-white font-bold py-3.5 rounded transition-all text-[12px] tracking-widest uppercase flex items-center justify-center gap-2"
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
