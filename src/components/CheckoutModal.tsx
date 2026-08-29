import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  MapPin,
  Truck,
  Store,
  Gift,
  CreditCard,
  ChevronRight,
  CheckCircle,
  Loader2,
  UtensilsCrossed,
  QrCode as QrCodeIcon,
  Banknote as BanknoteIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from './Toast';
import { customerApi } from '../features/customer/api';
import { ApiError } from '../lib/api';
import { benefitBrandLabels, paymentMethodLabel } from '../lib/paymentMethods';
import { formatWhatsAppLink } from '../lib/formatters';
import { getOrderDisplayNumber } from '../lib/orderReference';
import DeliveryAddressModal from './DeliveryAddressModal';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  cart: any[];
  storeConfig: any;
  isLoyaltyActive?: boolean;
  finalShippingFee: number;
  deliveryMethod: 'delivery' | 'pickup' | 'dine_in' | null;
  address: string;
  addressData?: any;
  subtotal: number;
  appliedCoupon: any;
  onOrderSuccess: (order: { orderId: string; orderNumber?: number; dailyOrderNumber?: number; operationalDate?: string; trackingToken: string }) => void;
  tenantSlug?: string | null;
  shippingQuoteId?: string | null;
  initialCutlery?: boolean;
}

type Step = 'delivery' | 'payment' | 'confirmation' | 'success';

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
  initialCutlery = false,
}: CheckoutModalProps) {
  const loyaltyEnabled = isLoyaltyActive && storeConfig?.fidelidade_ativa === true;
  const allowDelivery = storeConfig?.logisticsOptions?.allowDelivery !== false;
  const allowPickup = storeConfig?.logisticsOptions?.allowPickup !== false;
  const allowDineIn = Boolean(storeConfig?.logisticsOptions?.allowDineIn);

  const [step, setStep] = useState<Step>('delivery');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup' | 'dine_in'>(initialDeliveryMethod || 'pickup');
  const [checkoutAddress, setCheckoutAddress] = useState(initialAddress || '');
  const [checkoutAddressData, setCheckoutAddressData] = useState(addressData);
  const [checkoutShippingFee, setCheckoutShippingFee] = useState(finalShippingFee || 0);
  const [checkoutQuoteId, setCheckoutQuoteId] = useState<string | null>(shippingQuoteId || null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [troco, setTroco] = useState('');
  const [cutlery, setCutlery] = useState(initialCutlery || false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotencyKeyRef = React.useRef(globalThis.crypto.randomUUID());
  const { showToast } = useToast();
  const [waMessage, setWaMessage] = useState('');
  const legacyCardEnabled = Boolean(storeConfig) && storeConfig.pagamento_cartao !== false;
  const creditCardEnabled = typeof storeConfig?.pagamento_cartao_credito === 'boolean'
    ? storeConfig.pagamento_cartao_credito
    : legacyCardEnabled;
  const debitCardEnabled = typeof storeConfig?.pagamento_cartao_debito === 'boolean'
    ? storeConfig.pagamento_cartao_debito
    : legacyCardEnabled;

  const paymentOptions = [
    { id: 'pix', label: 'PIX', icon: QrCodeIcon, active: storeConfig?.pagamento_pix },
    { id: 'cartao_credito', label: 'Cartão de crédito', description: 'Pagamento na maquininha', icon: CreditCard, active: creditCardEnabled },
    { id: 'cartao_debito', label: 'Cartão de débito', description: 'Pagamento na maquininha', icon: CreditCard, active: debitCardEnabled },
    { id: 'dinheiro', label: 'Dinheiro', icon: BanknoteIcon, active: storeConfig?.pagamento_dinheiro },
    {
      id: 'vale_alimentacao',
      label: 'Vale-alimentação',
      icon: Gift,
      active: storeConfig?.pagamento_vale_alimentacao,
      brands: benefitBrandLabels(storeConfig?.bandeiras_vale_alimentacao),
    },
    {
      id: 'vale_refeicao',
      label: 'Vale-refeição',
      icon: Gift,
      active: storeConfig?.pagamento_vale_refeicao,
      brands: benefitBrandLabels(storeConfig?.bandeiras_vale_refeicao),
    },
  ];

  const toOrderPaymentMethod = (method: string) =>
    ({
      cartao_credito: 'credit_card',
      cartao_debito: 'debit_card',
      dinheiro: 'cash',
      vale_alimentacao: 'food_voucher',
      vale_refeicao: 'meal_voucher',
    }[method] || 'pix');

  const selectedPaymentLabel = (method = paymentMethod) => paymentMethodLabel(toOrderPaymentMethod(method));

  useEffect(() => {
    if (storeConfig) {
      if (storeConfig.pagamento_pix) setPaymentMethod('pix');
      else if (creditCardEnabled) setPaymentMethod('cartao_credito');
      else if (debitCardEnabled) setPaymentMethod('cartao_debito');
      else if (storeConfig.pagamento_dinheiro) setPaymentMethod('dinheiro');
      else if (storeConfig.pagamento_vale_alimentacao) setPaymentMethod('vale_alimentacao');
      else if (storeConfig.pagamento_vale_refeicao) setPaymentMethod('vale_refeicao');
      else setPaymentMethod('');
    }
  }, [storeConfig]);

  useEffect(() => {
    if (isOpen) {
      setStep('delivery');
      setDeliveryMethod(initialDeliveryMethod || (allowDelivery ? 'delivery' : allowPickup ? 'pickup' : 'dine_in'));
      setCheckoutAddress(initialAddress || '');
      setCheckoutAddressData(addressData);
      setCheckoutShippingFee(finalShippingFee || 0);
      setCheckoutQuoteId(shippingQuoteId || null);
      setCutlery(initialCutlery || false);
      idempotencyKeyRef.current = globalThis.crypto.randomUUID();
    }
  }, [isOpen, initialDeliveryMethod, initialAddress, addressData, finalShippingFee, shippingQuoteId, allowDelivery, allowPickup, initialCutlery]);

  const calculateShipping = async (selectedAddress: any) => {
    if (!tenantSlug) return;
    setIsCalculatingShipping(true);
    try {
      const response = await fetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/shipping/quote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          postalCode: selectedAddress.cep,
          street: selectedAddress.logradouro,
          number: selectedAddress.numero,
          district: selectedAddress.bairro,
          city: selectedAddress.cidade,
          state: selectedAddress.estado,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload?.error?.message || 'Não foi possível calcular a entrega.');
      const quotedFee = payload.quote.feeCents / 100;
      const freeShipping = Number(storeConfig?.frete_gratis_acima_de || 0) > 0 && subtotal >= Number(storeConfig.frete_gratis_acima_de);
      setCheckoutShippingFee(freeShipping ? 0 : quotedFee);
      setCheckoutQuoteId(payload.quote.id);
    } catch (error) {
      setCheckoutShippingFee(0);
      setCheckoutQuoteId(null);
      showToast(error instanceof Error ? error.message : 'Não foi possível calcular a entrega.', 'error');
    } finally {
      setIsCalculatingShipping(false);
    }
  };

  const selectDeliveryMethod = (method: 'delivery' | 'pickup' | 'dine_in') => {
    setDeliveryMethod(method);
    if (method === 'delivery') {
      if (!checkoutAddressData || !checkoutQuoteId) setIsAddressModalOpen(true);
      return;
    }
    setCheckoutShippingFee(0);
    setCheckoutQuoteId(null);
  };

  const confirmDeliveryAddress = (selectedAddress: any) => {
    const fullAddress = selectedAddress.enderecoCompleto || `${selectedAddress.logradouro}, ${selectedAddress.numero} - ${selectedAddress.bairro}, ${selectedAddress.cidade}/${selectedAddress.estado}`;
    setCheckoutAddress(fullAddress);
    setCheckoutAddressData(selectedAddress);
    setDeliveryMethod('delivery');
    void calculateShipping(selectedAddress);
  };

  const effectiveShippingFee = deliveryMethod === 'delivery' ? checkoutShippingFee : 0;
  const cutleryAvailable = Boolean(storeConfig?.talheres_ativo) && cart.some((item) => item.permite_talheres);
  const configuredCutleryFee = Number(storeConfig?.talheres_valor || 0);
  const cutleryFee = cutlery && cutleryAvailable ? configuredCutleryFee : 0;
  const couponDiscountValue = appliedCoupon
    ? appliedCoupon.tipo === 'fixo'
      ? appliedCoupon.valor
      : subtotal * (appliedCoupon.valor / 100)
    : 0;
  const total = Math.max(0, subtotal + effectiveShippingFee + cutleryFee - couponDiscountValue);

  const steps = [
    { id: 'delivery', label: 'Entrega', icon: Truck },
    { id: 'payment', label: 'Pagamento', icon: CreditCard },
    { id: 'confirmation', label: 'Confirmação', icon: CheckCircle },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  const handleNext = () => {
    if (step === 'delivery' && deliveryMethod === 'delivery' && (!checkoutAddress || !checkoutQuoteId || isCalculatingShipping))
      return showToast('Confirme o endereço e aguarde o cálculo da entrega.', 'error');
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
      showToast('O estabelecimento está fechado no momento.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!tenantSlug) throw new Error('Loja inválida.');
      const api = customerApi(tenantSlug);
      const addressId = checkoutAddressData?.id || checkoutAddressData?._id;
      const changeForCents =
        paymentMethod === 'dinheiro' && troco ? Math.round(Number(troco.replace(',', '.')) * 100) : undefined;
      if (changeForCents !== undefined && Number.isNaN(changeForCents))
        throw new Error('Valor inválido para troco.');
      if (changeForCents && changeForCents < Math.round(total * 100))
        throw new Error('O valor para troco deve ser maior ou igual ao total.');

      const secureBody = {
        items: cart.map((item) => ({
          productId: item.produtoId,
          quantity: item.quantidade,
          redeem: loyaltyEnabled && Boolean(item.is_resgate),
          options: item.secureOptions || [],
          comboSelections: item.itemType === 'combo' ? item.comboSelections || [] : undefined,
        })),
        deliveryType: deliveryMethod === 'delivery' ? 'delivery' : deliveryMethod === 'dine_in' ? 'dine_in' : 'pickup',
        paymentMethod: toOrderPaymentMethod(paymentMethod),
        addressId: deliveryMethod === 'delivery' ? addressId : undefined,
        deliveryAddress: deliveryMethod === 'delivery' && !addressId ? checkoutAddressData : undefined,
        shippingQuoteId: deliveryMethod === 'delivery' ? checkoutQuoteId : undefined,
        couponCode: appliedCoupon?.codigo || undefined,
        notes: observacoes || undefined,
        changeForCents,
        cutlery,
      };
      const data = await api.createOrder(secureBody, idempotencyKeyRef.current);

      if (data.success) {
        showToast('✅ Pedido realizado com sucesso!', 'success');

        let msg = `*Novo Pedido - ${storeConfig?.nome_loja || 'Loja'}*\n`;
        msg += `Pedido #${getOrderDisplayNumber(data)}\n\n`;
        msg += `*Itens:*\n`;
        cart.forEach((item) => {
          msg += `${item.quantidade}x ${item.nome} - R$ ${item.subtotal.toFixed(2)}\n`;
          (item.comboDisplay || []).forEach((stage: any) => {
            msg += `   ${stage.name}: ${stage.selectedProductName}\n`;
            (stage.options || []).forEach((option: any) => {
              msg += `      - ${option.quantity || 1}x ${option.itemName}\n`;
            });
          });
          const itemNotes = [
            ...(item.opcoes_escolhidas || []).map((op: any) => op?.opcao).filter(Boolean),
            item.observacao,
          ]
            .filter(Boolean)
            .join(', ');
          if (itemNotes) msg += `   ↳ ${itemNotes}\n`;
        });
        msg += `\n*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
        if (deliveryMethod === 'delivery') {
          msg += `*Taxa de Entrega:* R$ ${effectiveShippingFee.toFixed(2)}\n`;
        }
        if (appliedCoupon) {
          const discount =
            appliedCoupon.tipo === 'fixo' ? appliedCoupon.valor : subtotal * (appliedCoupon.valor / 100);
          msg += `*Desconto:* - R$ ${discount.toFixed(2)}\n`;
        }
        msg += `*Total:* R$ ${total.toFixed(2)}\n\n`;

        msg += `*Forma de Atendimento:*\n`;
        if (deliveryMethod === 'delivery') {
          msg += `Entrega em domicílio\nEndereço: ${checkoutAddress}\n`;
        } else if (deliveryMethod === 'dine_in') {
          msg += `Comer no local (Mesa / Balcão)\n`;
        } else {
          msg += `Retirada no estabelecimento\n`;
        }

        if (observacoes) msg += `Obs: ${observacoes}\n`;
        if (cutlery) msg += `Enviar talheres: Sim\n`;

        msg += `\n*Pagamento:*\n`;
        msg += `${selectedPaymentLabel()}${paymentMethod === 'dinheiro' && troco ? ` (Troco para R$ ${troco})` : ''}`;

        setWaMessage(msg);

        setStep('success');
        onOrderSuccess({
          orderId: String(data.orderId),
          trackingToken: data.trackingToken,
        });
      } else {
        showToast(data?.error?.message || 'Erro ao processar pedido', 'error');
      }
    } catch (error) {
      if (error instanceof ApiError && ['INVALID_SHIPPING_QUOTE', 'SHIPPING_QUOTE_REQUIRED'].includes(error.code)) {
        onClose();
        showToast('A cotação de entrega expirou. Confirme o endereço e calcule novamente.', 'error');
        return;
      }
      showToast(error instanceof Error ? error.message : 'Erro de conexão', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-end bg-black/45 animate-in fade-in duration-200 cursor-default sm:items-center sm:justify-center sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-[445px] flex-col overflow-hidden bg-white shadow-2xl animate-in slide-in-from-bottom duration-300 sm:h-auto sm:min-h-[640px] sm:max-h-[90vh] sm:rounded-xl sm:zoom-in-95">
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
          <div className="w-10" />
          <h2 className="text-base font-semibold text-gray-700">Checkout</h2>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stepper */}
        {step !== 'success' && (
          <div className="border-b border-gray-100 bg-gray-50/40 px-5 py-3.5 flex-shrink-0">
            <div className="flex items-center justify-between relative max-w-xs mx-auto">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 -translate-y-1/2 -z-0" />
              <div
                className="absolute top-1/2 left-0 h-0.5 store-bg-primary -translate-y-1/2 transition-all duration-300 -z-0"
                style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
              />

              {steps.map((s, idx) => {
                const isActive = idx <= currentStepIndex;
                return (
                  <div key={s.id} className="flex flex-col items-center gap-2 group">
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all duration-300',
                        isActive
                          ? 'store-bg-primary store-text-on-primary'
                          : 'bg-gray-100 border border-gray-200 text-gray-400'
                      )}
                    >
                      {idx + 1}
                    </div>
                    <span
                      className={cn(
                        'text-[9px] font-medium transition-colors',
                        isActive ? 'store-text-primary' : 'text-gray-300'
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {step === 'delivery' && (
              <div className="space-y-5">
                <div className="space-y-3">
                  {[
                    { id: 'delivery', enabled: allowDelivery, title: 'Receber no seu endereço', icon: Truck },
                    { id: 'pickup', enabled: allowPickup, title: 'Retirar no estabelecimento', icon: Store },
                    { id: 'dine_in', enabled: allowDineIn, title: 'Comer no local', icon: UtensilsCrossed },
                  ].filter((option) => option.enabled).map((option) => {
                    const selected = deliveryMethod === option.id;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => selectDeliveryMethod(option.id as 'delivery' | 'pickup' | 'dine_in')}
                        className={cn(
                          'w-full rounded-lg border bg-white px-3.5 py-3 text-left transition-colors',
                          selected ? 'border-gray-400' : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={cn('h-5 w-5 shrink-0', selected ? 'store-text-primary' : 'text-gray-400')} />
                          <span className="flex-1 text-[13px] font-semibold text-gray-700">{option.title}</span>
                          <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border-2', selected ? 'store-border-primary' : 'border-gray-300')}>
                            {selected && <span className="h-2.5 w-2.5 rounded-full store-bg-primary" />}
                          </span>
                        </div>
                        {selected && (
                          <div className="ml-8 mt-3 space-y-2 border-t border-gray-100 pt-3">
                            <div className="flex items-start gap-2 text-[11px] text-gray-500">
                              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                              <span>{deliveryMethod === 'delivery' ? (checkoutAddress || 'Clique para informar o endereço') : [storeConfig?.rua_loja, storeConfig?.numero_loja, storeConfig?.bairro_loja, storeConfig?.cidade_loja].filter(Boolean).join(', ') || (deliveryMethod === 'dine_in' ? 'Atendimento no estabelecimento' : 'Endereço do estabelecimento')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-gray-500">
                              <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                              <span>{deliveryMethod === 'delivery' && isCalculatingShipping ? 'Calculando taxa de entrega...' : deliveryMethod === 'delivery' ? `Entrega estimada em ${storeConfig?.tempo_entrega || '45-60 min'}` : deliveryMethod === 'pickup' ? `Disponível para retirada em ${storeConfig?.tempo_entrega || '45-60 min'}` : `Preparo estimado em ${storeConfig?.tempo_entrega || '45-60 min'}`}</span>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {deliveryMethod === 'delivery' && (
                    <button type="button" onClick={() => setIsAddressModalOpen(true)} className="w-full text-center text-[11px] font-semibold store-text-primary hover:underline">
                      Alterar endereço de entrega
                    </button>
                  )}
                </div>

                <div className="border-t border-dashed border-gray-200 pt-5">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Quando?</p>
                  <div className="flex items-center gap-3 rounded-lg border border-gray-300 bg-white px-3.5 py-3">
                    <Clock className="h-5 w-5 store-text-primary" />
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-gray-700">Pedido para agora</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">{storeConfig?.tempo_entrega || '45-60 min'}</p>
                    </div>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 store-border-primary"><span className="h-2.5 w-2.5 rounded-full store-bg-primary" /></span>
                  </div>
                </div>
              </div>
            )}

            {false && step === 'delivery' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  {deliveryMethod === 'delivery' && (
                    <button
                      type="button"
                      onClick={onClose}
                      className={cn(
                        'w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left',
                        deliveryMethod === 'delivery'
                          ? 'store-border-primary store-bg-soft'
                          : 'border-gray-100 hover:border-gray-200'
                      )}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 flex items-center justify-center rounded-xl',
                          deliveryMethod === 'delivery'
                            ? 'store-bg-primary store-text-on-primary'
                            : 'bg-gray-100 text-gray-400'
                        )}
                      >
                        <Truck className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-sm">Receber no seu endereço</p>
                        {deliveryMethod === 'delivery' && (
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-[11px] text-gray-500 font-medium truncate max-w-[220px]">
                              {initialAddress || 'Informe seu endereço'}
                            </p>
                          </div>
                        )}
                      </div>
                      <div
                        className={cn(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                          deliveryMethod === 'delivery' ? 'store-border-primary' : 'border-gray-200'
                        )}
                      >
                        {deliveryMethod === 'delivery' && (
                          <div className="w-2.5 h-2.5 store-bg-primary rounded-full" />
                        )}
                      </div>
                    </button>
                  )}

                  {deliveryMethod === 'pickup' && (
                    <button
                      type="button"
                      onClick={onClose}
                      className={cn(
                        'w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left',
                        deliveryMethod === 'pickup'
                          ? 'store-border-primary store-bg-soft'
                          : 'border-gray-100 hover:border-gray-200'
                      )}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 flex items-center justify-center rounded-xl',
                          deliveryMethod === 'pickup'
                            ? 'store-bg-primary store-text-on-primary'
                            : 'bg-gray-100 text-gray-400'
                        )}
                      >
                        <Store className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-800 text-sm">Retirar no estabelecimento</p>
                        <p className="text-[11px] text-gray-500 font-medium">Você retira no balcão da loja</p>
                      </div>
                      <div
                        className={cn(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                          deliveryMethod === 'pickup' ? 'store-border-primary' : 'border-gray-200'
                        )}
                      >
                        {deliveryMethod === 'pickup' && (
                          <div className="w-2.5 h-2.5 store-bg-primary rounded-full" />
                        )}
                      </div>
                    </button>
                  )}

                  {deliveryMethod === 'dine_in' && (
                    <button
                      type="button"
                      onClick={onClose}
                      className={cn(
                        'w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left',
                        deliveryMethod === 'dine_in'
                          ? 'store-border-primary store-bg-soft'
                          : 'border-gray-100 hover:border-gray-200'
                      )}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 flex items-center justify-center rounded-xl',
                          deliveryMethod === 'dine_in'
                            ? 'store-bg-primary store-text-on-primary'
                            : 'bg-gray-100 text-gray-400'
                        )}
                      >
                        <UtensilsCrossed className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-800 text-sm">Comer no local</p>
                        <p className="text-[11px] text-gray-500 font-medium">
                          Peça agora e encontre pronto na mesa/balcão
                        </p>
                      </div>
                      <div
                        className={cn(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                          deliveryMethod === 'dine_in' ? 'store-border-primary' : 'border-gray-200'
                        )}
                      >
                        {deliveryMethod === 'dine_in' && (
                          <div className="w-2.5 h-2.5 store-bg-primary rounded-full" />
                        )}
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === 'payment' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-3">
                  {paymentOptions
                    .filter((m) => m.active)
                    .map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setPaymentMethod(method.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3.5 rounded-lg border transition-all text-left',
                          paymentMethod === method.id
                            ? 'store-border-primary store-bg-soft'
                            : 'border-gray-100 hover:border-gray-200'
                        )}
                      >
                        <div
                          className={cn(
                            'w-9 h-9 flex items-center justify-center rounded-lg',
                            paymentMethod === method.id
                              ? 'store-bg-primary store-text-on-primary'
                              : 'bg-gray-100 text-gray-400'
                          )}
                        >
                          <method.icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-800 text-sm">{method.label}</p>
                          {method.description && (
                            <p className="mt-0.5 text-[10px] text-gray-500">{method.description}</p>
                          )}
                          {method.brands && (
                            <p className="text-[10px] text-gray-500 mt-0.5">{method.brands}</p>
                          )}
                        </div>
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                            paymentMethod === method.id ? 'store-border-primary' : 'border-gray-200'
                          )}
                        >
                          {paymentMethod === method.id && (
                            <div className="w-2.5 h-2.5 store-bg-primary rounded-full" />
                          )}
                        </div>
                      </button>
                    ))}
                </div>

                {paymentMethod === 'dinheiro' && (
                  <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/50 p-4">
                    <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider">
                      Precisa de troco para quanto?
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={troco}
                      onChange={(e) => setTroco(e.target.value)}
                      placeholder="Ex: 50,00 (Deixe em branco se não precisar)"
                      className="w-full h-11 bg-white border border-amber-200 rounded-xl px-4 text-sm font-semibold text-gray-800 outline-none focus:border-amber-400"
                    />
                  </div>
                )}
              </div>
            )}

            {step === 'confirmation' && (
              <div className="space-y-6">
                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-4">
                  <div className="flex justify-between text-xs font-semibold text-gray-600">
                    <span>Subtotal</span>
                    <span>R$ {subtotal.toFixed(2)}</span>
                  </div>
                  {deliveryMethod === 'delivery' && (
                    <div className="flex justify-between text-xs font-semibold text-gray-600">
                      <span>Taxa de entrega</span>
                      <span>R$ {effectiveShippingFee.toFixed(2)}</span>
                    </div>
                  )}
                  {appliedCoupon && (
                    <div className="flex justify-between text-xs font-semibold text-emerald-600">
                      <span>Cupom ({appliedCoupon.codigo})</span>
                      <span>- R$ {couponDiscountValue.toFixed(2)}</span>
                    </div>
                  )}
                  {cutleryFee > 0 && (
                    <div className="flex justify-between text-xs font-semibold text-gray-600">
                      <span>Talheres descartáveis</span>
                      <span>R$ {cutleryFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-3 flex justify-between text-base font-bold text-gray-900">
                    <span>Total do Pedido</span>
                    <span>R$ {total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {cutleryAvailable && <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white p-3.5 transition-colors hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={cutlery}
                      onChange={(e) => setCutlery(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-semibold text-gray-700">Adicionar talheres descartáveis {configuredCutleryFee > 0 ? `(+ R$ ${configuredCutleryFee.toFixed(2)})` : '(grátis)'}</span>
                  </label>}

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Observações para o estabelecimento
                    </label>
                    <textarea
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      placeholder="Ex: Sem cebola, caprichar no molho..."
                      rows={2}
                      className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs font-medium text-gray-800 outline-none transition-all focus:border-gray-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 'success' && (
              <div className="text-center py-6 space-y-6">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg animate-bounce">
                  <CheckCircle className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-gray-900 tracking-tight">Pedido Realizado!</h3>
                  <p className="text-xs font-medium text-gray-500 max-w-xs mx-auto">
                    {deliveryMethod === 'dine_in'
                      ? 'Seu pedido foi enviado para a cozinha e estará pronto te esperando no local.'
                      : deliveryMethod === 'pickup'
                        ? 'Seu pedido foi enviado e você receberá atualizações quando estiver pronto para retirada.'
                        : 'Seu pedido foi recebido e logo começará a ser preparado.'}
                  </p>
                </div>

                {storeConfig?.whatsapp && (
                  <a
                    href={formatWhatsAppLink(storeConfig.whatsapp, waMessage)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    <span>Enviar pedido no WhatsApp</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        {step !== 'success' && (
          <div className="flex flex-shrink-0 items-center gap-3 border-t border-gray-100 bg-white p-4">
            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="h-11 rounded-lg border border-gray-200 px-5 text-xs font-bold uppercase tracking-wide text-gray-600 transition-all hover:bg-gray-50"
              >
                Voltar
              </button>
            )}

            {step === 'confirmation' ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinalize}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg store-bg-primary text-xs font-bold uppercase tracking-wide store-text-on-primary transition-all hover:opacity-95 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <span>Finalizar Pedido • R$ {total.toFixed(2)}</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 h-11 store-bg-primary store-text-on-primary rounded-lg font-bold text-xs uppercase tracking-wide hover:opacity-95 transition-all flex items-center justify-center gap-2"
              >
                <span>Avançar</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
      <DeliveryAddressModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        onConfirmDelivery={confirmDeliveryAddress}
        user={user}
        tenantSlug={tenantSlug}
        canSaveAddress={Boolean(user)}
      />
    </div>
  );
}
