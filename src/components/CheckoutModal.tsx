import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, MapPin, Truck, Store, Gift, CreditCard, ChevronRight, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from './Toast';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  cart: any[];
  storeConfig: any;
  finalShippingFee: number;
  deliveryMethod: 'delivery' | 'pickup' | null;
  address: string;
  subtotal: number;
  appliedCoupon: any;
  onOrderSuccess: (orderId: string) => void;
}

type Step = 'delivery' | 'loyalty' | 'payment' | 'confirmation';

export default function CheckoutModal({ 
  isOpen, 
  onClose, 
  user, 
  cart, 
  storeConfig, 
  finalShippingFee, 
  deliveryMethod: initialDeliveryMethod, 
  address: initialAddress,
  subtotal,
  appliedCoupon,
  onOrderSuccess
}: CheckoutModalProps) {
  const [step, setStep] = useState<Step>('delivery');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup' | 'local'>(initialDeliveryMethod || 'delivery');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [observacoes, setObservacoes] = useState('');
  const [troco, setTroco] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  const couponDiscountValue = appliedCoupon ? (appliedCoupon.tipo === 'fixo' ? appliedCoupon.valor : (subtotal * (appliedCoupon.valor / 100))) : 0;
  const total = Math.max(0, subtotal + finalShippingFee - couponDiscountValue);

  const steps = [
    { id: 'delivery', label: 'Entrega', icon: MapPin },
    { id: 'loyalty', label: 'Fidelidade', icon: Gift },
    { id: 'payment', label: 'Pagamento', icon: CreditCard },
    { id: 'confirmation', label: 'Confirmação', icon: CheckCircle },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);

  const handleNext = () => {
    if (step === 'delivery') setStep('loyalty');
    else if (step === 'loyalty') setStep('payment');
    else if (step === 'payment') handleFinalize();
  };

  const handleBack = () => {
    if (step === 'loyalty') setStep('delivery');
    else if (step === 'payment') setStep('loyalty');
    else if (step === 'confirmation') setStep('payment');
  };

  const handleFinalize = async () => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('stitch_token') || '';
      const body = {
        cliente: { 
          nome: user?.nome, 
          telefone: user?.telefone, 
          endereco: deliveryMethod === 'delivery' ? initialAddress : (deliveryMethod === 'pickup' ? 'Retirada na Loja' : 'Consumir no local') 
        },
        itens: cart.map(i => ({ ...i, preco_final: i.is_resgate ? 0 : i.preco_unitario, is_resgate: i.is_resgate || false })),
        metodo_pagamento: paymentMethod, 
        frete: deliveryMethod === 'delivery' ? finalShippingFee : 0, 
        tipo_entrega: deliveryMethod, 
        observacoes: observacoes,
        troco_para: paymentMethod === 'dinheiro' && troco ? parseFloat(troco.toString().replace(',','.')) || 0 : 0,
        cupom_codigo: appliedCoupon?.codigo || '',
        pontos_resgate_total: cart.reduce((acc, item) => acc + (item.is_resgate ? (item.pontos_resgate || 0) * item.quantidade : 0), 0)
      };

      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      if (data.sucesso) {
        showToast('✅ Pedido realizado com sucesso!', 'success');
        onOrderSuccess(data.pedidoId);
        onClose();
      } else {
        showToast(data.erro || 'Erro ao processar pedido', 'error');
      }
    } catch (error) {
      showToast('Erro de conexão', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-white h-screen sm:h-auto sm:max-h-[90vh] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
          <div className="flex-1" />
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em] text-center">Checkout</h2>
          <div className="flex-1 flex justify-end">
             <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-full transition-all">
               <X className="w-5 h-5" />
             </button>
          </div>
        </div>

        {/* Stepper */}
        <div className="px-6 py-6 bg-gray-50/50 border-b border-gray-100 flex-shrink-0">
            <div className="flex justify-between relative">
               {/* Line Backdrop */}
               <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 -z-10" />
               {steps.map((s, idx) => {
                  const isActive = idx <= currentStepIndex;
                  const isCurrent = s.id === step;
                  return (
                    <div key={s.id} className="flex flex-col items-center gap-2 group">
                       <div className={cn(
                         "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300",
                         isActive ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "bg-white border-2 border-gray-200 text-gray-300"
                       )}>
                          {idx + 1}
                       </div>
                       <span className={cn(
                         "text-[9px] font-bold uppercase tracking-widest transition-colors",
                         isActive ? "text-emerald-600" : "text-gray-300"
                       )}>
                          {s.label}
                       </span>
                    </div>
                  );
               })}
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
           <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {step === 'delivery' && (
                <div className="space-y-6">
                   <div className="space-y-3">
                      <button 
                        onClick={() => setDeliveryMethod('delivery')}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                          deliveryMethod === 'delivery' ? "border-emerald-600 bg-emerald-50/30" : "border-gray-100 hover:border-gray-200"
                        )}
                      >
                         <div className={cn("w-10 h-10 flex items-center justify-center rounded-xl", deliveryMethod === 'delivery' ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-400")}>
                            <Truck className="w-5 h-5" />
                         </div>
                         <div className="flex-1">
                            <p className="font-bold text-gray-800 text-sm">Receber no seu endereço</p>
                            {deliveryMethod === 'delivery' && (
                              <div className="mt-1 flex items-center justify-between">
                                 <p className="text-[11px] text-gray-500 font-medium truncate max-w-[200px]">{initialAddress}</p>
                                 {/* <button className="text-[11px] font-black text-emerald-600 hover:underline">EDITAR</button> */}
                              </div>
                            )}
                         </div>
                         <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", deliveryMethod === 'delivery' ? "border-emerald-600" : "border-gray-200")}>
                            {deliveryMethod === 'delivery' && <div className="w-2.5 h-2.5 bg-emerald-600 rounded-full" />}
                         </div>
                      </button>

                      <button 
                        onClick={() => setDeliveryMethod('pickup')}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                          deliveryMethod === 'pickup' ? "border-emerald-600 bg-emerald-50/30" : "border-gray-100 hover:border-gray-200"
                        )}
                      >
                         <div className={cn("w-10 h-10 flex items-center justify-center rounded-xl", deliveryMethod === 'pickup' ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-400")}>
                            <Store className="w-5 h-5" />
                         </div>
                         <div className="flex-1">
                            <p className="font-bold text-gray-800 text-sm">Retirar no estabelecimento</p>
                         </div>
                         <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", deliveryMethod === 'pickup' ? "border-emerald-600" : "border-gray-200")}>
                            {deliveryMethod === 'pickup' && <div className="w-2.5 h-2.5 bg-emerald-600 rounded-full" />}
                         </div>
                      </button>

                      <button 
                        onClick={() => setDeliveryMethod('local')}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                          deliveryMethod === 'local' ? "border-emerald-600 bg-emerald-50/30" : "border-gray-100 hover:border-gray-200"
                        )}
                      >
                         <div className={cn("w-10 h-10 flex items-center justify-center rounded-xl", deliveryMethod === 'local' ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-400")}>
                            <CheckCircle className="w-5 h-5" />
                         </div>
                         <div className="flex-1">
                            <p className="font-bold text-gray-800 text-sm">Consumir no local</p>
                         </div>
                         <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", deliveryMethod === 'local' ? "border-emerald-600" : "border-gray-200")}>
                            {deliveryMethod === 'local' && <div className="w-2.5 h-2.5 bg-emerald-600 rounded-full" />}
                         </div>
                      </button>
                   </div>
                </div>
              )}

              {step === 'loyalty' && (
                <div className="space-y-6 py-4">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center space-y-4">
                       <div className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/20">
                          <Gift className="w-8 h-8" />
                       </div>
                       <div>
                          <p className="font-black text-emerald-800 text-lg uppercase tracking-tight">Fidelidade</p>
                          <p className="text-xs text-emerald-600 font-bold uppercase tracking-widest mt-1">Você possui {user?.pontos || 0} pontos</p>
                       </div>
                    </div>
                    <p className="text-[11px] text-gray-400 text-center font-bold uppercase tracking-widest px-8 leading-relaxed">
                       A cada R$ 1,00 em compras você ganha 1 ponto que pode ser trocado por produtos exclusivos.
                    </p>
                </div>
              )}

              {step === 'payment' && (
                <div className="space-y-6">
                   <div className="grid grid-cols-1 gap-3">
                      {[
                        { id: 'pix', label: 'PIX (Pagamento Online)', icon: QrCodeIcon },
                        { id: 'cartao', label: 'Cartão (Na entrega)', icon: CreditCard },
                        { id: 'dinheiro', label: 'Dinheiro', icon: BanknoteIcon },
                      ].map(method => (
                        <button 
                          key={method.id}
                          onClick={() => setPaymentMethod(method.id)}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                            paymentMethod === method.id ? "border-emerald-600 bg-emerald-50/30" : "border-gray-100 hover:border-gray-200"
                          )}
                        >
                           <div className={cn("w-10 h-10 flex items-center justify-center rounded-xl", paymentMethod === method.id ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-400")}>
                              <method.icon className="w-5 h-5" />
                           </div>
                           <p className="flex-1 font-bold text-gray-800 text-sm">{method.label}</p>
                           <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", paymentMethod === method.id ? "border-emerald-600" : "border-gray-200")}>
                             {paymentMethod === method.id && <div className="w-2.5 h-2.5 bg-emerald-600 rounded-full" />}
                           </div>
                        </button>
                      ))}
                   </div>

                   {paymentMethod === 'dinheiro' && (
                     <div className="animate-in slide-in-from-top-2 duration-200">
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Precisa de troco?</label>
                        <input 
                           type="text" 
                           placeholder="Ex: 50,00"
                           value={troco}
                           onChange={e => setTroco(e.target.value)}
                           className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500 transition-colors"
                        />
                     </div>
                   )}

                   <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Observações do pedido</label>
                      <textarea 
                         rows={2}
                         value={observacoes}
                         onChange={e => setObservacoes(e.target.value)}
                         placeholder="Ex: Retirar cebola, caprichar no molho..."
                         className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500 transition-colors resize-none"
                      />
                   </div>
                </div>
              )}

           </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-white flex-shrink-0">
           <div className="flex items-center justify-between mb-4">
              <div className="text-left">
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Total</p>
                 <p className="text-xl font-black text-gray-900 leading-none mt-0.5">R$ {total.toFixed(2).replace('.', ',')}</p>
              </div>
              <div className="flex items-center gap-2">
                 {step !== 'delivery' && (
                   <button 
                     onClick={handleBack}
                     className="px-4 py-3 text-[11px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors"
                   >
                     VOLTAR
                   </button>
                 )}
                 <button 
                   onClick={handleNext}
                   disabled={isSubmitting}
                   className="flex items-center gap-2 bg-emerald-600 text-white font-black px-8 py-3.5 rounded-xl hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-600/20 text-xs uppercase tracking-widest"
                 >
                   {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                     <>{step === 'payment' ? 'FINALIZAR' : 'CONTINUAR'} <ChevronRight className="w-4 h-4" /></>
                   )}
                 </button>
              </div>
           </div>
        </div>

      </div>
    </div>,
    document.body
  );
}

// Icons for payment
function QrCodeIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16h.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg> }
function BanknoteIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg> }
