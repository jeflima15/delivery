import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, MapPin, Truck, Store, Gift, CreditCard, ChevronRight, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from './Toast';
import { customerApi } from '../features/customer/api';
import { ApiError } from '../lib/api';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  cart: any[];
  storeConfig: any;
  isLoyaltyActive?: boolean;
  finalShippingFee: number;
  deliveryMethod: 'delivery' | 'pickup' | null;
  address: string;
  addressData?: any;
  subtotal: number;
  appliedCoupon: any;
  onOrderSuccess: (orderId: string) => void;
  tenantSlug?: string | null;
  shippingQuoteId?: string | null;
}

type Step = 'delivery' | 'loyalty' | 'payment' | 'confirmation' | 'success';

export default function CheckoutModal({ 
  isOpen, 
  onClose, 
  user, 
  cart, 
  storeConfig, 
  isLoyaltyActive = false,
  finalShippingFee, 
  deliveryMethod: initialDeliveryMethod, 
  address: initialAddress,
  addressData,
  subtotal,
  appliedCoupon,
  onOrderSuccess,
  tenantSlug,
  shippingQuoteId,
}: CheckoutModalProps) {
  const { allowPickup = true, allowDelivery = true } = storeConfig?.logisticsOptions || {};
  const loyaltyEnabled = isLoyaltyActive && storeConfig?.fidelidade_ativa === true;

  const defaultDelivery = () => {
    if (initialDeliveryMethod === 'delivery' && allowDelivery) return 'delivery';
    if (initialDeliveryMethod === 'pickup' && allowPickup) return 'pickup';
    return allowDelivery ? 'delivery' : 'pickup';
  };

  const [step, setStep] = useState<Step>('delivery');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup' | 'local'>(defaultDelivery());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [troco, setTroco] = useState('');
  const [cutlery, setCutlery] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotencyKeyRef = React.useRef(globalThis.crypto.randomUUID());
  const { showToast } = useToast();
  const [waMessage, setWaMessage] = useState('');

  useEffect(() => {
    if (storeConfig) {
      if (storeConfig.pagamento_pix) setPaymentMethod('pix');
      else if (storeConfig.pagamento_cartao) setPaymentMethod('cartao');
      else if (storeConfig.pagamento_dinheiro) setPaymentMethod('dinheiro');
    }
  }, [storeConfig]);

  useEffect(() => {
    if (isOpen) {
      setStep('delivery');
      idempotencyKeyRef.current = globalThis.crypto.randomUUID();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!loyaltyEnabled && step === 'loyalty') {
      setStep('payment');
    }
  }, [loyaltyEnabled, step]);

  const couponDiscountValue = appliedCoupon ? (appliedCoupon.tipo === 'fixo' ? appliedCoupon.valor : (subtotal * (appliedCoupon.valor / 100))) : 0;
  const total = Math.max(0, subtotal + finalShippingFee - couponDiscountValue);

  const steps = [
    { id: 'delivery', label: 'Entrega', icon: MapPin },
    ...(loyaltyEnabled ? [{ id: 'loyalty', label: 'Fidelidade', icon: Gift }] : []),
    { id: 'payment', label: 'Pagamento', icon: CreditCard },
    { id: 'confirmation', label: 'Confirmação', icon: CheckCircle },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);

  const handleNext = () => {
    if (step === 'delivery' && deliveryMethod === 'delivery' && !initialAddress) return showToast('Selecione um endereco de entrega.', 'error');
    if (step === 'payment' && !paymentMethod) return showToast('Selecione uma forma de pagamento.', 'error');

    const nextStep = steps[currentStepIndex + 1];
    if (nextStep) {
      setStep(nextStep.id as Step);
    }
  };

  const handleBack = () => {
    const previousStep = steps[currentStepIndex - 1];
    if (previousStep) {
      setStep(previousStep.id as Step);
    }
  };

  const handleFinalize = async () => {
    if (storeConfig?.is_open === false) {
      showToast('O estabelecimento esta fechado no momento.', 'error');
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (!tenantSlug) throw new Error('Loja invalida.');
      const api = customerApi(tenantSlug);
      const addressId = addressData?.id || addressData?._id;
      const changeForCents = paymentMethod === 'dinheiro' && troco ? Math.round(Number(troco.replace(',', '.')) * 100) : undefined;
      if (changeForCents !== undefined && Number.isNaN(changeForCents)) throw new Error('Valor invalido para troco.');
      if (changeForCents && changeForCents < Math.round(total * 100)) throw new Error('O valor para troco deve ser maior ou igual ao total.');
      const secureBody = {
        items: cart.map((item) => ({ productId: item.produtoId, quantity: item.quantidade, redeem: loyaltyEnabled && Boolean(item.is_resgate), options: item.secureOptions || [] })),
        deliveryType: deliveryMethod === 'delivery' ? 'delivery' : 'pickup',
        paymentMethod: paymentMethod === 'cartao' ? 'card' : paymentMethod === 'dinheiro' ? 'cash' : 'pix',
        addressId: deliveryMethod === 'delivery' ? addressId : undefined,
        deliveryAddress: deliveryMethod === 'delivery' && !addressId ? addressData : undefined,
        shippingQuoteId: deliveryMethod === 'delivery' ? shippingQuoteId : undefined,
        couponCode: appliedCoupon?.codigo || undefined,
        notes: observacoes || undefined,
        changeForCents,
        cutlery,
      };
      const data = await api.createOrder(secureBody, idempotencyKeyRef.current);
      
      if (data.success) {
        showToast('✅ Pedido realizado com sucesso!', 'success');
        
        let msg = `*Novo Pedido - ${storeConfig?.nome_loja || 'Loja'}*\n`;
        msg += `ID: ${data.trackingToken || ''}\n\n`;
        msg += `*Itens:*\n`;
        cart.forEach(item => {
          msg += `${item.quantidade}x ${item.nome} - R$ ${item.subtotal.toFixed(2)}\n`;
          const itemNotes = [...(item.opcoes_escolhidas || []).map((op: any) => op?.opcao).filter(Boolean), item.observacao].filter(Boolean).join(', ');
          if (itemNotes) msg += `   ↳ ${itemNotes}\n`;
        });
        msg += `\n*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
        msg += `*Taxa de Entrega:* R$ ${finalShippingFee.toFixed(2)}\n`;
        if (appliedCoupon) {
          const discount = appliedCoupon.tipo === 'fixo' ? appliedCoupon.valor : (subtotal * (appliedCoupon.valor / 100));
          msg += `*Desconto:* - R$ ${discount.toFixed(2)}\n`;
        }
        msg += `*Total:* R$ ${total.toFixed(2)}\n\n`;
        
        msg += `*Entrega:*\n`;
        msg += deliveryMethod === 'delivery' ? `Endereço: ${initialAddress}\n` : `Retirada no estabelecimento\n`;
        if (observacoes) msg += `Obs: ${observacoes}\n`;
        if (cutlery) msg += `Enviar talheres\n`;
        
        msg += `\n*Pagamento:*\n`;
        msg += paymentMethod === 'pix' ? 'PIX' : paymentMethod === 'cartao' ? 'Cartão na entrega' : `Dinheiro${troco ? ` (Troco para R$ ${troco})` : ''}`;
        
        setWaMessage(encodeURIComponent(msg));
        
        setStep('success');
        onOrderSuccess(data.trackingToken);
      } else {
        showToast(data?.error?.message || 'Erro ao processar pedido', 'error');
      }
    } catch (error) {
      if (error instanceof ApiError && ['INVALID_SHIPPING_QUOTE', 'SHIPPING_QUOTE_REQUIRED'].includes(error.code)) {
        setStep('delivery');
        showToast('A cotacao de entrega expirou. Confirme o endereco e calcule novamente.', 'error');
        return;
      }
      showToast(error instanceof Error ? error.message : 'Erro de conexão', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 cursor-default">
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
        {step !== 'success' && (
        <div className="px-6 py-6 bg-gray-50/50 border-b border-gray-100 flex-shrink-0">
            <div className="flex justify-between relative">
               {/* Line Backdrop */}
               <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 -z-10" />
               {steps.map((s, idx) => {
                  const isActive = idx <= currentStepIndex;
                  return (
                    <div key={s.id} className="flex flex-col items-center gap-2 group">
                       <div className={cn(
                         "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300",
                         isActive ? "store-bg-primary store-text-on-primary shadow-lg" : "bg-white border-2 border-gray-200 text-gray-300"
                       )}>
                          {idx + 1}
                       </div>
                       <span className={cn(
                         "text-[9px] font-bold uppercase tracking-widest transition-colors",
                         isActive ? "store-text-primary" : "text-gray-300"
                       )}>
                          {s.label}
                       </span>
                    </div>
                  );
               })}
            </div>
        </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
           <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {step === 'delivery' && (
                <div className="space-y-6">
                   <div className="space-y-3">
                      {allowDelivery && (
                        <button 
                          onClick={() => setDeliveryMethod('delivery')}
                          className={cn(
                            "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                            deliveryMethod === 'delivery' ? "store-border-primary store-bg-soft" : "border-gray-100 hover:border-gray-200"
                          )}
                        >
                           <div className={cn("w-10 h-10 flex items-center justify-center rounded-xl", deliveryMethod === 'delivery' ? "store-bg-primary store-text-on-primary" : "bg-gray-100 text-gray-400")}>
                              <Truck className="w-5 h-5" />
                           </div>
                           <div className="flex-1">
                              <p className="font-bold text-gray-800 text-sm">Receber no seu endereço</p>
                              {deliveryMethod === 'delivery' && (
                                <div className="mt-1 flex items-center justify-between">
                                   <p className="text-[11px] text-gray-500 font-medium truncate max-w-[200px]">{initialAddress}</p>
                                </div>
                              )}
                           </div>
                           <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", deliveryMethod === 'delivery' ? "store-border-primary" : "border-gray-200")}>
                              {deliveryMethod === 'delivery' && <div className="w-2.5 h-2.5 store-bg-primary rounded-full" />}
                           </div>
                        </button>
                      )}

                      {allowPickup && (
                        <button 
                          onClick={() => setDeliveryMethod('pickup')}
                          className={cn(
                            "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                            deliveryMethod === 'pickup' ? "store-border-primary store-bg-soft" : "border-gray-100 hover:border-gray-200"
                          )}
                        >
                           <div className={cn("w-10 h-10 flex items-center justify-center rounded-xl", deliveryMethod === 'pickup' ? "store-bg-primary store-text-on-primary" : "bg-gray-100 text-gray-400")}>
                              <Store className="w-5 h-5" />
                           </div>
                           <div className="flex-1">
                              <p className="font-bold text-gray-800 text-sm">Retirar no estabelecimento</p>
                           </div>
                           <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", deliveryMethod === 'pickup' ? "store-border-primary" : "border-gray-200")}>
                              {deliveryMethod === 'pickup' && <div className="w-2.5 h-2.5 store-bg-primary rounded-full" />}
                           </div>
                        </button>
                      )}
                   </div>
                </div>
              )}

              {step === 'loyalty' && loyaltyEnabled && (
                <div className="space-y-6 py-4">
                    <div className="store-bg-soft border store-border-soft rounded-2xl p-6 text-center space-y-4">
                       <div className="w-16 h-16 store-bg-primary store-text-on-primary rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                          <Gift className="w-8 h-8" />
                       </div>
                       <div>
                          <p className="font-black store-text-primary text-lg uppercase tracking-tight">Fidelidade</p>
                          <p className="text-xs store-text-primary font-bold uppercase tracking-widest mt-1">Você possui {user?.pontos || 0} pontos</p>
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
                        { id: 'pix', label: 'PIX', icon: QrCodeIcon, active: storeConfig?.pagamento_pix },
                        { id: 'cartao', label: 'Cartão na entrega', icon: CreditCard, active: storeConfig?.pagamento_cartao },
                        { id: 'dinheiro', label: 'Dinheiro', icon: BanknoteIcon, active: storeConfig?.pagamento_dinheiro },
                      ].filter(m => m.active).map(method => (
                        <button 
                          key={method.id}
                          onClick={() => setPaymentMethod(method.id)}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                            paymentMethod === method.id ? "store-border-primary store-bg-soft" : "border-gray-100 hover:border-gray-200"
                          )}
                        >
                           <div className={cn("w-10 h-10 flex items-center justify-center rounded-xl", paymentMethod === method.id ? "store-bg-primary store-text-on-primary" : "bg-gray-100 text-gray-400")}>
                              <method.icon className="w-5 h-5" />
                           </div>
                           <p className="flex-1 font-bold text-gray-800 text-sm">{method.label}</p>
                           <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", paymentMethod === method.id ? "store-border-primary" : "border-gray-200")}>
                             {paymentMethod === method.id && <div className="w-2.5 h-2.5 store-bg-primary rounded-full" />}
                           </div>
                        </button>
                      ))}
                   </div>
                   
                   {paymentMethod === 'pix' && storeConfig?.pagamento_pix && (storeConfig?.chave_pix || storeConfig?.instrucoes_pix) && (
                     <div className="store-bg-soft border store-border-soft p-4 rounded-xl mt-4 animate-in slide-in-from-top-2 duration-200">
                       <h4 className="font-bold store-text-primary mb-1 text-sm">Informações do PIX</h4>
                       {storeConfig.chave_pix && <p className="store-text-primary text-xs mb-1"><strong>Chave:</strong> {storeConfig.chave_pix}</p>}
                       {storeConfig.instrucoes_pix && <p className="store-text-primary text-[11px]">{storeConfig.instrucoes_pix}</p>}
                     </div>
                   )}

                   {paymentMethod === 'dinheiro' && (
                     <div className="animate-in slide-in-from-top-2 duration-200">
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Precisa de troco?</label>
                        <input 
                           type="text" 
                           placeholder="Ex: 50,00"
                           value={troco}
                           onChange={e => setTroco(e.target.value)}
                           className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none store-focus transition-colors"
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
                         className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none store-focus transition-colors resize-none"
                      />
                   </div>
                   <label className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-medium text-gray-700"><input type="checkbox" checked={cutlery} onChange={(event) => setCutlery(event.target.checked)} className="h-4 w-4 accent-[var(--store-primary)]" />Enviar talheres e guardanapos</label>
                </div>
              )}

              {step === 'confirmation' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-gray-400">Entrega</p><button type="button" onClick={() => setStep('delivery')} className="text-xs font-semibold store-text-primary">Editar</button></div><p className="mt-1 text-sm font-semibold text-gray-800">{deliveryMethod === 'delivery' ? initialAddress : 'Retirada no estabelecimento'}</p></div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-gray-400">Pagamento</p><button type="button" onClick={() => setStep('payment')} className="text-xs font-semibold store-text-primary">Editar</button></div><p className="mt-1 text-sm font-semibold text-gray-800">{paymentMethod === 'pix' ? 'PIX' : paymentMethod === 'cartao' ? 'Cartao na entrega' : `Dinheiro${troco ? ` · troco para R$ ${troco}` : ''}`}</p></div>
                  <div className="rounded-2xl border store-border-soft store-bg-soft p-4">
                    <p className="text-xs font-bold uppercase tracking-wider store-text-primary mb-3">Itens do Pedido</p>
                    <div className="space-y-3 mb-4 max-h-32 overflow-y-auto pr-2">
                      {cart.map((item, idx) => {
                        const itemNotes = [...(item.opcoes_escolhidas || []).map((op: any) => op?.opcao).filter(Boolean), item.observacao].filter(Boolean).join(', ');
                        return (
                          <div key={idx} className="flex justify-between text-sm text-gray-700">
                            <div className="flex-1 mr-4">
                              <p className="font-medium"><span className="font-bold mr-1">{item.quantidade}x</span>{item.nome}</p>
                              {itemNotes && <p className="text-[11px] text-gray-500 line-clamp-1">{itemNotes}</p>}
                            </div>
                            <span className="font-medium">R$ {item.subtotal.toFixed(2).replace('.', ',')}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="border-t store-border-soft pt-3">
                      <p className="text-xs font-bold uppercase tracking-wider store-text-primary mb-2">Resumo</p>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex justify-between"><span>{cart.reduce((sum, item) => sum + item.quantidade, 0)} itens</span><span>R$ {subtotal.toFixed(2).replace('.', ',')}</span></div>
                        <div className="flex justify-between"><span>Entrega</span><span>R$ {finalShippingFee.toFixed(2).replace('.', ',')}</span></div>
                        {appliedCoupon && <div className="flex justify-between store-text-primary"><span>Desconto</span><span>- R$ {couponDiscountValue.toFixed(2).replace('.', ',')}</span></div>}
                        <div className="flex justify-between border-t store-border-soft pt-2 font-bold text-gray-900"><span>Total</span><span>R$ {total.toFixed(2).replace('.', ',')}</span></div>
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-xs text-gray-500">O pedido so sera enviado ao tocar em Confirmar pedido.</p>
                </div>
              )}

              {step === 'success' && (
                <div className="flex flex-col items-center justify-center space-y-6 py-8 text-center">
                   <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-500">
                     <CheckCircle className="h-10 w-10" />
                   </div>
                   <div>
                     <h3 className="text-xl font-bold text-gray-900">Pedido realizado!</h3>
                     <p className="mt-2 text-sm text-gray-500">Seu pedido foi enviado para o estabelecimento.</p>
                   </div>
                   
                   {storeConfig?.whatsapp && (
                     <a
                       href={`https://wa.me/55${storeConfig.whatsapp.replace(/\D/g, '')}?text=${waMessage}`}
                       target="_blank"
                       rel="noreferrer"
                       className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 font-bold text-white transition-all hover:bg-[#128C7E]"
                     >
                       <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                         <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                       </svg>
                       Enviar pedido no WhatsApp
                     </a>
                   )}
                   <button
                     onClick={onClose}
                     className="w-full rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-700 transition-all hover:bg-gray-200"
                   >
                     Acompanhar pedido
                   </button>
                </div>
              )}

           </div>
        </div>

        {/* Footer */}
        {step !== 'success' && (
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
                   onClick={step === 'confirmation' ? handleFinalize : handleNext}
                   disabled={isSubmitting}
                   className="flex items-center gap-2 store-bg-primary store-bg-primary-hover store-text-on-primary font-black px-8 py-3.5 rounded-xl transition-all active:scale-95 shadow-lg text-xs uppercase tracking-widest"
                 >
                   {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                     <>{step === 'confirmation' ? 'CONFIRMAR PEDIDO' : 'CONTINUAR'} <ChevronRight className="w-4 h-4" /></>
                   )}
                 </button>
              </div>
           </div>
        </div>
        )}

      </div>
    </div>,
    document.body
  );
}

// Icons for payment
function QrCodeIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16h.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg> }
function BanknoteIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg> }
