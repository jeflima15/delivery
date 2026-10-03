import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import CartItemSummary from './CartItemSummary';
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
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
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from './Toast';
import { customerApi } from '../features/customer/api';
import { ApiError } from '../lib/api';
import { benefitBrandLabels, paymentMethodLabel } from '../lib/paymentMethods';
import { formatWhatsAppLink } from '../lib/formatters';
import { getOrderDisplayNumber } from '../lib/orderReference';
import { accountAddressIdForCheckout } from '../lib/customerStorage';
import DeliveryAddressModal from './DeliveryAddressModal';
import CheckoutSchedule, { type CheckoutScheduleValue } from './CheckoutSchedule';
import PreorderSummary from './PreorderSummary';
import { LocationConfirmationRequiredError, requestShippingQuote, shippingEstimateLabel, shippingQuoteNeedsConfirmation, ShippingQuoteRequestGuard, type ShippingQuoteResult } from '../lib/shippingQuote';
import { getPreparationEstimateLabel } from '../lib/deliveryEstimates';
import { useDialogFocus } from '../hooks/useDialogFocus';

const AddressPinConfirmModal = React.lazy(() => import('./AddressPinConfirmModal'));

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEditItem?: (index: number) => void;
  editingItem?: boolean;
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
  initialShippingQuote?: ShippingQuoteResult | null;
  initialCutlery?: boolean;
  passwordVerified?: boolean;
  onRequirePassword?: () => void;
  onAvailabilityError?: (details: unknown) => Promise<{ removedItems: number; removedOptions: number }>;
}

type Step = 'delivery' | 'payment' | 'confirmation' | 'success';
const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;
const moneyInputToCents = (value: string): number | undefined => {
  const compact = value.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!compact) return undefined;
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(compact)
      ? compact.replace(/\./g, '')
      : compact;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : Number.NaN;
};

export default function CheckoutModal({
  isOpen,
  onClose,
  onEditItem,
  editingItem = false,
  user,
  cart,
  storeConfig,
  isLoyaltyActive = false,
  finalShippingFee,
  deliveryMethod: initialDeliveryMethod,
  address: initialAddress,
  addressData,
  subtotal: _initialSubtotal,
  appliedCoupon: initialCoupon,
  onOrderSuccess,
  tenantSlug,
  shippingQuoteId,
  initialShippingQuote,
  initialCutlery = false,
  passwordVerified = false,
  onRequirePassword,
  onAvailabilityError,
}: CheckoutModalProps) {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.is_resgate ? 0 : item.subtotal || 0), 0);
  const [appliedCoupon, setAppliedCoupon] = useState(initialCoupon);
  const [revalidating, setRevalidating] = useState(false);
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
  const [checkoutQuote, setCheckoutQuote] = useState<ShippingQuoteResult | null>(initialShippingQuote || null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingPinAddress, setPendingPinAddress] = useState<any>(null);
  const [pendingConfirmationToken, setPendingConfirmationToken] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [troco, setTroco] = useState('');
  const [needsChange, setNeedsChange] = useState(false);
  const [trocoError, setTrocoError] = useState('');
  const [cutlery, setCutlery] = useState(initialCutlery || false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotencyKeyRef = React.useRef(globalThis.crypto.randomUUID());
  const lastRequest = React.useRef<any>(null);
  const [uncertainRequest, setUncertainRequest] = useState(false);
  useUnsavedChanges(uncertainRequest);
  const cartSignature = JSON.stringify(cart.map(item => [item.configurationKey, item.produtoId, item.quantidade, item.subtotal, item.secureOptions, item.comboSelections, item.observacao]));
  const previousCart = React.useRef(cartSignature);
  const completedRequest = React.useRef(false);
  useEffect(() => {
    if (previousCart.current === cartSignature) return;
    previousCart.current = cartSignature;
    if (uncertainRequest || completedRequest.current) return;
    idempotencyKeyRef.current = globalThis.crypto.randomUUID();
    lastRequest.current = null;
    setSchedule(value => ({ ...value, ready: false }));
    setScheduleRevision(value => value + 1);
    setStep(storeConfig?.preorders?.enabled ? 'delivery' : 'confirmation');
    if (!initialCoupon?.codigo || !tenantSlug) return;
    let cancelled = false; setRevalidating(true); setAppliedCoupon(null);
    void customerApi(tenantSlug).coupon(initialCoupon.codigo, Math.round(subtotal * 100)).then(result => {
      if (!cancelled) setAppliedCoupon({ codigo: result.coupon.code, tipo: result.coupon.type, valor: result.coupon.value, discountCents: result.coupon.discountCents });
    }).catch(() => { if (!cancelled) setAppliedCoupon(null); }).finally(() => { if (!cancelled) setRevalidating(false); });
    return () => { cancelled = true; };
  }, [cartSignature, tenantSlug, subtotal, initialCoupon, storeConfig?.preorders?.enabled, uncertainRequest]);
  const quoteRequests = React.useRef(new ShippingQuoteRequestGuard());
  const submittingRef = React.useRef(false);
  const { showToast } = useToast();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const [waMessage, setWaMessage] = useState('');
  const [pixCopied, setPixCopied] = useState(false);
  const [schedule, setSchedule] = useState<CheckoutScheduleValue>({ ready: false, mode: 'immediate', date: '', startsAt: '', depositPercent: 0 });
  const [createdPreorder, setCreatedPreorder] = useState<any>(null);
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const [createdTotal, setCreatedTotal] = useState(0);
  const scheduled = storeConfig?.preorders?.enabled && schedule.mode === 'scheduled';
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
    quoteRequests.current.cancel();
    setIsCalculatingShipping(false);
    setPendingPin(null);
    setPendingPinAddress(null);
    setIsAddressModalOpen(false);
    if (isOpen) {
      const needsDeliveryReview = Boolean(storeConfig?.preorders?.enabled)
        || !initialDeliveryMethod
        || (initialDeliveryMethod === 'delivery' && (!initialAddress || !shippingQuoteId));
      setStep(needsDeliveryReview ? 'delivery' : 'payment');
      setDeliveryMethod(initialDeliveryMethod || (allowDelivery ? 'delivery' : allowPickup ? 'pickup' : 'dine_in'));
      setCheckoutAddress(initialAddress || '');
      setCheckoutAddressData(addressData);
      setCheckoutShippingFee(finalShippingFee || 0);
      setCheckoutQuoteId(shippingQuoteId || null);
      setCheckoutQuote(initialShippingQuote || null);
      setCutlery(initialCutlery || false);
      setNeedsChange(false);
      setTroco('');
      setTrocoError('');
      idempotencyKeyRef.current = globalThis.crypto.randomUUID();
    }
    return () => quoteRequests.current.cancel();
  // This mounted component represents one checkout session; editing an item does not reinitialize logistics.
  }, [tenantSlug]);

  const invalidateShipping = () => {
    quoteRequests.current.cancel();
    setCheckoutQuoteId(null);
    setCheckoutQuote(null);
    setCheckoutShippingFee(0);
    setIsCalculatingShipping(false);
    setPendingPin(null);
    setPendingPinAddress(null);
    setPendingConfirmationToken('');
  };

  const closeCheckout = () => {
    if (isSubmitting || uncertainRequest) return;
    invalidateShipping();
    onClose();
  };

  useDialogFocus(isOpen && !editingItem, dialogRef, closeCheckout);

  const calculateShipping = async (selectedAddress: any): Promise<ShippingQuoteResult | 'confirmation-required' | 'stale' | null> => {
    invalidateShipping();
    if (!tenantSlug || !isOpen) return null;
    const signal = quoteRequests.current.start();
    setIsCalculatingShipping(true);
    try {
      const quote = await requestShippingQuote(tenantSlug, selectedAddress, signal);
      if (!quoteRequests.current.isCurrent(signal)) return 'stale';
      const quotedFee = quote.feeCents / 100;
      const freeShipping = Number(storeConfig?.frete_gratis_acima_de || 0) > 0 && subtotal >= Number(storeConfig.frete_gratis_acima_de);
      setCheckoutShippingFee(freeShipping ? 0 : quotedFee);
      setCheckoutQuoteId(quote.id);
      setCheckoutQuote(quote);
      return quote;
    } catch (error) {
      if (!quoteRequests.current.isCurrent(signal)) return 'stale';
      if (error instanceof LocationConfirmationRequiredError) {
        setPendingPin(error.location);
        setPendingPinAddress(selectedAddress);
        setPendingConfirmationToken(error.confirmationToken);
        return 'confirmation-required';
      }
      setCheckoutShippingFee(0);
      setCheckoutQuoteId(null);
      setCheckoutQuote(null);
      showToast(error instanceof Error ? error.message : 'Não foi possível calcular a entrega.', 'error');
      return null;
    } finally {
      if (quoteRequests.current.isCurrent(signal)) setIsCalculatingShipping(false);
    }
  };

  const selectDeliveryMethod = (method: 'delivery' | 'pickup' | 'dine_in') => {
    if (method !== deliveryMethod) invalidateShipping();
    setDeliveryMethod(method);
    if (method === 'delivery') {
      if (!checkoutAddressData || !checkoutQuoteId) setIsAddressModalOpen(true);
      return;
    }
    setCheckoutShippingFee(0);
    setCheckoutQuoteId(null);
    setCheckoutQuote(null);
  };

  const confirmDeliveryAddress = (selectedAddress: any) => {
    const fullAddress = selectedAddress.enderecoCompleto || `${selectedAddress.logradouro}, ${selectedAddress.numero} - ${selectedAddress.bairro}, ${selectedAddress.cidade}/${selectedAddress.estado}`;
    setCheckoutAddress(fullAddress);
    setCheckoutAddressData(selectedAddress);
    setDeliveryMethod('delivery');
    void calculateShipping(selectedAddress);
  };

  const effectiveShippingFee = deliveryMethod === 'delivery' ? (Number(storeConfig?.frete_gratis_acima_de || 0) > 0 && subtotal >= Number(storeConfig.frete_gratis_acima_de) ? 0 : Number(checkoutQuote?.feeCents ?? Math.round(checkoutShippingFee * 100)) / 100) : 0;
  const legacyEstimate = storeConfig?.tempo_entrega || '45-60 min';
  const preparationEstimate = getPreparationEstimateLabel(storeConfig) || legacyEstimate;
  const deliveryEstimate = isCalculatingShipping ? 'Calculando...' : shippingEstimateLabel(checkoutQuote)
    || (storeConfig?.prazo_entrega_modo === 'preparo_deslocamento' ? 'A confirmar' : legacyEstimate);
  const cutleryAvailable = Boolean(storeConfig?.talheres_ativo) && cart.some((item) => item.permite_talheres);
  const configuredCutleryFee = Number(storeConfig?.talheres_valor || 0);
  const cutleryFee = cutlery && cutleryAvailable ? configuredCutleryFee : 0;
  const couponDiscountValue = typeof appliedCoupon?.discountCents === "number" ? appliedCoupon.discountCents / 100 : appliedCoupon
    ? appliedCoupon.tipo === 'fixo'
      ? appliedCoupon.valor
      : subtotal * (appliedCoupon.valor / 100)
    : 0;
  const total = Math.max(0, subtotal + effectiveShippingFee + cutleryFee - couponDiscountValue);

  const canOfferScheduling = Boolean(
    storeConfig?.preorders?.enabled
    && storeConfig.preorders.acceptingPreorders
    && cart.every((item) => item.preorder?.scheduledAllowed === true),
  );
  const steps = [
    { id: 'delivery', label: canOfferScheduling ? 'Entrega e data' : 'Entrega', icon: Truck },
    { id: 'payment', label: 'Pagamento', icon: CreditCard },
    { id: 'confirmation', label: 'Conferir', icon: CheckCircle },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  const handleNext = () => {
    if (!uncertainRequest && storeConfig?.preorders?.enabled && !schedule.ready) return showToast('Escolha uma modalidade e um horário disponível antes de continuar.', 'error');
    if (step === 'delivery' && deliveryMethod === 'delivery' && (!checkoutAddress || !checkoutQuoteId || isCalculatingShipping))
      return showToast('Confirme o endereço e aguarde o cálculo da entrega.', 'error');
    if (step === 'payment' && !paymentMethod) return showToast('Selecione uma forma de pagamento.', 'error');
    if (step === 'payment' && paymentMethod === 'dinheiro' && needsChange) {
      const changeForCents = moneyInputToCents(troco);
      if (!Number.isFinite(changeForCents) || changeForCents < Math.round(total * 100)) {
        setTrocoError(`Informe um valor igual ou maior que ${money(total)}.`);
        return;
      }
    }

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
    if (submittingRef.current || isCalculatingShipping || revalidating) return;
    if (!uncertainRequest && storeConfig?.preorders?.enabled && !schedule.ready) { setStep('delivery'); showToast('Confira a data e o horário do pedido.', 'error'); return; }
    if (!uncertainRequest && storeConfig?.is_open === false && !scheduled) {
      showToast('O estabelecimento está fechado no momento.', 'error');
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (!tenantSlug) throw new Error('Loja inválida.');
      const api = customerApi(tenantSlug);
      const addressId = accountAddressIdForCheckout(checkoutAddressData, user?.enderecos || []);
      const changeForCents = paymentMethod === 'dinheiro' && needsChange ? moneyInputToCents(troco) : undefined;
      if (changeForCents !== undefined && !Number.isFinite(changeForCents))
        throw new Error('Valor inválido para troco.');
      if (changeForCents && changeForCents < Math.round(total * 100))
        throw new Error('O valor para troco deve ser maior ou igual ao total.');

      let currentQuoteId = checkoutQuoteId;
      if (!uncertainRequest && deliveryMethod === 'delivery' && (!checkoutAddressData || !checkoutQuoteId)) {
        setStep('delivery');
        throw new Error('Confirme o endereço e calcule a entrega novamente.');
      }
      if (!uncertainRequest && deliveryMethod === 'delivery' && checkoutAddressData && (!checkoutQuote?.expiresAt || !Number.isFinite(Date.parse(checkoutQuote.expiresAt)) || Date.parse(checkoutQuote.expiresAt) <= Date.now() + 10_000)) {
        const refreshedQuote = await calculateShipping(checkoutAddressData);
        if (refreshedQuote === 'stale') return;
        if (refreshedQuote === 'confirmation-required') { setStep('delivery'); return; }
        if (!refreshedQuote) {
          setStep('delivery');
          throw new Error('Não foi possível renovar a cotação de entrega.');
        }
        currentQuoteId = refreshedQuote.id;
        const freeShipping = Number(storeConfig?.frete_gratis_acima_de || 0) > 0 && subtotal >= Number(storeConfig.frete_gratis_acima_de);
        if (shippingQuoteNeedsConfirmation(checkoutQuote, refreshedQuote, Math.round(effectiveShippingFee * 100), freeShipping ? 0 : refreshedQuote.feeCents)) {
          showToast('O valor ou o prazo da entrega mudou. Revise o resumo e confirme novamente.', 'info');
          return;
        }
      }

      const hasRedeemItems = loyaltyEnabled && cart.some((item) => Boolean(item.is_resgate));
      if (!uncertainRequest && hasRedeemItems && !passwordVerified) {
        showToast('Confirme sua senha para utilizar seus pontos de fidelidade.', 'info');
        if (onRequirePassword) {
          onRequirePassword();
        }
        return;
      }

      const secureBody = {
        ...(scheduled ? { preorder: { date: schedule.date, startsAt: schedule.startsAt } } : {}),
        items: cart.map((item) => ({
          productId: item.produtoId,
          quantity: item.quantidade,
          redeem: loyaltyEnabled && Boolean(item.is_resgate),
          options: item.secureOptions || [],
          comboSelections: item.itemType === 'combo' ? item.comboSelections || [] : undefined,
          notes: item.observacao?.trim() || undefined,
        })),
        deliveryType: deliveryMethod === 'delivery' ? 'delivery' : deliveryMethod === 'dine_in' ? 'dine_in' : 'pickup',
        paymentMethod: toOrderPaymentMethod(paymentMethod),
        addressId: deliveryMethod === 'delivery' ? addressId : undefined,
        // Keep the typed snapshot as a fallback if the saved ID no longer resolves.
        // The server still prefers and validates a current account address.
        deliveryAddress: deliveryMethod === 'delivery' ? checkoutAddressData : undefined,
        shippingQuoteId: deliveryMethod === 'delivery' ? currentQuoteId : undefined,
        couponCode: appliedCoupon?.codigo || undefined,
        notes: observacoes || undefined,
        changeForCents,
        cutlery,
      };
      if (!uncertainRequest) lastRequest.current = secureBody;
      const data = await api.createOrder(lastRequest.current || secureBody, idempotencyKeyRef.current);
      setUncertainRequest(false); lastRequest.current = null;

      if (data.success) {
        completedRequest.current = true;
        setCreatedPreorder(data.preorder || null); setCreatedTotal(data.totalCents);
        showToast('✅ Pedido realizado com sucesso!', 'success');

        let msg = `*Resumo do pedido já registrado - ${storeConfig?.nome_loja || 'Loja'}*\n`;
        msg += `Pedido #${getOrderDisplayNumber(data)}\n\n`;
        if (data.preorder) msg += `*Agendado:* ${String(data.preorder.date).split('-').reverse().join('/')} ${data.preorder.startTime} - ${data.preorder.endTime}\n*Sinal:* R$ ${(data.preorder.depositCents / 100).toFixed(2).replace('.', ',')} (conferência manual)\n\n`;
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
        msg += `*Total:* R$ ${(data.totalCents / 100).toFixed(2)}\n\n`;

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
        msg += `${selectedPaymentLabel()}${paymentMethod === 'dinheiro' ? needsChange && troco ? ` (Troco para R$ ${troco})` : ' (Sem troco)' : ''}`;

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
      if (lastRequest.current && (!(error instanceof ApiError) || error.status >= 500 || error.status === 0)) {
        setUncertainRequest(true);
        showToast('Ainda não confirmamos o resultado. Confirme novamente para consultar a mesma tentativa.', 'info');
        return;
      }
      lastRequest.current = null; setUncertainRequest(false);
      idempotencyKeyRef.current = globalThis.crypto.randomUUID();
      if (error instanceof ApiError && ['PREORDER_SLOT_UNAVAILABLE', 'PREORDER_DISABLED', 'PREORDER_REQUIRED'].includes(error.code)) {
        setStep('delivery'); setSchedule((value) => ({ ...value, ready: false }));
        setScheduleRevision((value) => value + 1);
        showToast(`${error.message} Confira os horários atualizados.`, 'error'); return;
      }
      if (error instanceof ApiError && error.code === 'PASSWORD_REQUIRED_FOR_REDEMPTION') {
        showToast(error.message, 'info');
        if (onRequirePassword) {
          onRequirePassword();
        }
        return;
      }
      if (error instanceof ApiError && ['INVALID_SHIPPING_QUOTE', 'SHIPPING_QUOTE_REQUIRED'].includes(error.code)) {
        invalidateShipping();
        setStep('delivery');
        showToast('A cotação de entrega expirou. Confirme o endereço e calcule novamente.', 'error');
        return;
      }
      if (error instanceof ApiError && ['OPTION_UNAVAILABLE', 'INVALID_OPTIONS'].includes(error.code) && onAvailabilityError) {
        try {
          const result = await onAvailabilityError(error.details);
          const message = result.removedItems > 0
            ? 'Um item mudou e foi retirado da sacola. Revise o pedido antes de continuar.'
            : 'Uma opcao indisponivel foi removida. Revise o pedido antes de continuar.';
          onClose();
          showToast(message, 'info');
        } catch {
          showToast('O cardapio mudou. Feche o checkout e revise a sacola.', 'error');
        }
        return;
      }
      showToast(error instanceof Error ? error.message : 'Erro de conexão', 'error');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal((
    <div style={editingItem ? { display: "none" } : undefined} className="fixed inset-0 z-[100] flex items-stretch justify-end bg-black/45 animate-in fade-in duration-200 cursor-default sm:items-center sm:justify-center sm:p-4">
      <div
        hidden={editingItem}
      style={editingItem ? { display: "none" } : undefined}
      ref={dialogRef}
        className="flex h-[100dvh] w-full max-w-[445px] flex-col overflow-hidden bg-white shadow-2xl animate-in slide-in-from-bottom duration-300 sm:h-auto sm:min-h-[640px] sm:max-h-[90vh] sm:max-w-[540px] sm:rounded-xl sm:zoom-in-95"
        role={editingItem ? undefined : "dialog"}
        aria-modal={editingItem ? undefined : true}
        aria-labelledby="checkout-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
          <div className="w-10" />
          <h2 id="checkout-title" className="text-base font-semibold text-gray-700">{scheduled ? 'Finalizar encomenda' : 'Finalizar pedido'}</h2>
          <div className="flex justify-end">
            <button
              disabled={isSubmitting || uncertainRequest} onClick={closeCheckout}
              aria-label="Fechar checkout"
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
                        'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300',
                        isActive
                          ? 'store-bg-primary store-text-on-primary'
                          : 'bg-gray-100 border border-gray-200 text-gray-400'
                      )}
                    >
                      {idx + 1}
                    </div>
                    <span
                      className={cn(
                        'text-[11px] font-semibold transition-colors',
                        isActive ? 'store-text-primary' : 'text-gray-500'
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
        <div inert={uncertainRequest || isSubmitting} className="flex-1 overflow-y-auto p-5 [scroll-padding-bottom:7rem]">
          {storeConfig?.preorders?.enabled && tenantSlug && <div className={step === 'delivery' ? 'mb-5' : 'hidden'}><CheckoutSchedule slug={tenantSlug} cart={cart} config={storeConfig} deliveryType={deliveryMethod} totalCents={Math.round(total * 100)} revision={scheduleRevision} onChange={setSchedule} /></div>}
          {scheduled && step !== 'delivery' && step !== 'success' && <div className="mb-4"><PreorderSummary preorder={{ date: schedule.date, startTime: schedule.startTime, endTime: schedule.endTime, timezone: storeConfig.preorders.timezone, depositCents: Math.ceil(total * 100 * schedule.depositPercent / 100) }} totalCents={Math.round(total * 100)} /></div>}
          {step === 'success' && createdPreorder && <div className="mb-4"><PreorderSummary preorder={createdPreorder} totalCents={createdTotal} /></div>}
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
                              <span>{scheduled ? 'Entrega ou retirada na data e janela escolhidas acima.' : deliveryMethod === 'delivery' && isCalculatingShipping ? 'Calculando taxa de entrega...' : deliveryMethod === 'delivery' ? `Entrega estimada em ${deliveryEstimate}` : deliveryMethod === 'pickup' ? `Disponível para retirada em ${preparationEstimate}` : `Preparo estimado em ${preparationEstimate}`}</span>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {deliveryMethod === 'delivery' && (
                    <button type="button" onClick={() => { invalidateShipping(); setIsAddressModalOpen(true); }} className="w-full text-center text-[11px] font-semibold store-text-primary hover:underline">
                      Alterar endereço de entrega
                    </button>
                  )}
                </div>

              </div>
            )}

            {step === 'payment' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Escolha como pagar</p>
                  {paymentOptions
                    .filter((m) => m.active)
                    .map((method, index, methods) => (
                      <React.Fragment key={method.id}>
                      {method.id.startsWith('vale_') && !methods[index - 1]?.id.startsWith('vale_') && (
                        <div className="mt-2 flex items-center gap-3" aria-hidden="true">
                          <span className="h-px flex-1 bg-gray-200" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Benefícios</span>
                          <span className="h-px flex-1 bg-gray-200" />
                        </div>
                      )}
                      <button
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
                            <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-gray-500">{method.brands.join(' · ')}</p>
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
                      </React.Fragment>
                    ))}
                </div>

                {paymentMethod === 'dinheiro' && (
                  <div className="space-y-3 rounded-lg border border-amber-100 bg-amber-50/50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-900">Você precisa de troco?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setNeedsChange(false); setTroco(''); setTrocoError(''); }} className={cn('h-10 rounded-lg border text-xs font-semibold', !needsChange ? 'border-amber-500 bg-white text-amber-900' : 'border-amber-200 text-amber-800')}>Não preciso</button>
                      <button type="button" onClick={() => { setNeedsChange(true); setTrocoError(''); }} className={cn('h-10 rounded-lg border text-xs font-semibold', needsChange ? 'border-amber-500 bg-white text-amber-900' : 'border-amber-200 text-amber-800')}>Preciso de troco</button>
                    </div>
                    {needsChange && <label htmlFor="checkout-change-for" className="block text-xs font-semibold text-amber-900">
                      Troco para quanto?
                      <input
                        id="checkout-change-for"
                        type="text"
                        inputMode="decimal"
                        value={troco}
                        onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                        onChange={(e) => { setTroco(e.target.value); setTrocoError(''); }}
                        placeholder="Ex: 50,00"
                        className="mt-1.5 h-11 w-full rounded-xl border border-amber-200 bg-white px-4 text-sm font-semibold text-gray-800 outline-none focus:border-amber-400"
                      />
                    </label>}
                    {trocoError && <p role="alert" className="text-xs font-semibold text-red-700">{trocoError}</p>}
                  </div>
                )}
              </div>
            )}

            {step === 'confirmation' && (
              <div className="space-y-6">
                <section className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-600">
                  <div className="flex items-center justify-between gap-3"><span className="font-semibold text-gray-800">{deliveryMethod === 'delivery' ? 'Entrega' : deliveryMethod === 'pickup' ? 'Retirada' : 'Comer no local'}</span><button type="button" onClick={() => setStep('delivery')} className="store-text-primary font-semibold hover:underline">Alterar</button></div>
                  <p>{deliveryMethod === 'delivery' ? checkoutAddress : deliveryMethod === 'pickup' ? 'Retirar no estabelecimento' : 'Atendimento no estabelecimento'}</p>
                  <p>{scheduled ? `${schedule.date.split('-').reverse().join('/')} · ${schedule.startTime}–${schedule.endTime}` : deliveryMethod === 'delivery' ? `Entrega em ${deliveryEstimate}` : `Preparo em ${preparationEstimate}`}</p>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-2"><span>Pagamento: {selectedPaymentLabel()}</span><button type="button" onClick={() => setStep('payment')} className="store-text-primary font-semibold hover:underline">Alterar</button></div>
                  {paymentMethod === 'dinheiro' && (
                    <p>{needsChange && moneyInputToCents(troco) !== undefined ? `Troco para ${money((moneyInputToCents(troco) || 0) / 100)}` : 'Sem troco'}</p>
                  )}
                </section>
                <section className="rounded-lg border border-gray-200 bg-white p-4">
                  <p className="mb-2 text-xs font-bold text-gray-700">Itens do pedido</p>
                  <div className="space-y-3">{cart.map((item: any, index: number) => <div key={`${item.produtoId}-${index}`} className="border-b border-gray-100 pb-3 text-sm text-gray-700"><div className="flex justify-between gap-3"><span className="font-medium">{item.quantidade}× {item.nome}</span><span className="shrink-0">{money(item.subtotal)}</span></div><CartItemSummary item={item} />{onEditItem && <button type="button" disabled={isSubmitting || uncertainRequest} onClick={() => onEditItem(index)} className="mt-1 min-h-11 text-sm font-semibold store-text-primary disabled:opacity-40">Editar item</button>}</div>)}</div>
                </section>
                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-4">
                  <div className="flex justify-between text-xs font-semibold text-gray-600">
                    <span>Subtotal</span>
                    <span>{money(subtotal)}</span>
                  </div>
                  {deliveryMethod === 'delivery' && (
                    <>
                      <div className="flex justify-between text-xs font-semibold text-gray-600">
                        <span>Taxa de entrega</span>
                        <span>{isCalculatingShipping ? 'Calculando...' : money(effectiveShippingFee)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold text-gray-600">
                        <span>{scheduled ? 'Entrega agendada' : 'Previsão de entrega'}</span>
                        <span>{scheduled ? `${schedule.startTime}–${schedule.endTime}` : deliveryEstimate}</span>
                      </div>
                    </>
                  )}
                  {!scheduled && deliveryMethod !== 'delivery' && (
                    <div className="flex justify-between text-xs font-semibold text-gray-600">
                      <span>Previsão de preparo</span>
                      <span>{preparationEstimate}</span>
                    </div>
                  )}
                  {appliedCoupon && (
                    <div className="flex justify-between text-xs font-semibold text-emerald-600">
                      <span>Cupom ({appliedCoupon.codigo})</span>
                      <span>- {money(couponDiscountValue)}</span>
                    </div>
                  )}
                  {cutleryFee > 0 && (
                    <div className="flex justify-between text-xs font-semibold text-gray-600">
                      <span>Talheres descartáveis</span>
                      <span>{money(cutleryFee)}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-3 flex justify-between text-base font-bold text-gray-900">
                    <span>Total do Pedido</span>
                    <span>{money(total)}</span>
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
                      maxLength={1000}
                      onChange={(e) => setObservacoes(e.target.value)}
                      placeholder={scheduled ? 'Ex: Nome e idade no bolo, cores, recheio e personalização combinada...' : 'Ex: Sem cebola, caprichar no molho...'}
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
                    {createdPreorder
                      ? 'Sua encomenda foi registrada para a data escolhida. Confira abaixo o sinal e aguarde a confirmação da loja.'
                      : deliveryMethod === 'dine_in'
                      ? 'Seu pedido foi enviado para a cozinha e estará pronto te esperando no local.'
                      : deliveryMethod === 'pickup'
                        ? 'Seu pedido foi enviado e você receberá atualizações quando estiver pronto para retirada.'
                        : 'Seu pedido foi recebido e logo começará a ser preparado.'}
                  </p>
                </div>

                {!createdPreorder && toOrderPaymentMethod(paymentMethod) === 'pix' && storeConfig?.chave_pix && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-left">
                    <div className="flex items-start gap-3">
                      <QrCodeIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Pague com PIX</p>
                        <p className="mt-1 break-all text-sm font-semibold text-slate-900">{storeConfig.chave_pix}</p>
                        {storeConfig.instrucoes_pix && (
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{storeConfig.instrucoes_pix}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(String(storeConfig.chave_pix));
                          setPixCopied(true);
                          showToast('Chave PIX copiada.', 'success');
                          window.setTimeout(() => setPixCopied(false), 2_000);
                        } catch {
                          showToast('Não foi possível copiar. Selecione a chave acima.', 'error');
                        }
                      }}
                      className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-xs font-bold text-white transition-colors hover:bg-emerald-800"
                    >
                      {pixCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {pixCopied ? 'Chave copiada' : 'Copiar chave PIX'}
                    </button>
                  </div>
                )}

                {storeConfig?.whatsapp && <div className="space-y-1 text-left">
                  <h4 className="text-base font-bold text-slate-900">Opcional: avise a loja pelo WhatsApp</h4>
                  <p className="text-sm leading-relaxed text-slate-600">{createdPreorder
                    ? 'Sua encomenda já está registrada. Envie os detalhes para conversar com a loja e alinhar o combinado.'
                    : 'Seu pedido já está registrado. Envie os detalhes para facilitar o atendimento e falar com a loja.'}</p>
                </div>}
                {storeConfig?.whatsapp && (
                  <a
                    href={formatWhatsAppLink(storeConfig.whatsapp, waMessage)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <span>Avisar a loja pelo WhatsApp</span>
                  </a>
                )}
                {storeConfig?.whatsapp && <p className="text-xs leading-relaxed text-slate-500">A mensagem vai pronta. No WhatsApp, toque em Enviar.</p>}
                <button type="button" onClick={onClose} className="min-h-12 w-full rounded-xl store-bg-primary px-4 text-sm font-semibold store-text-on-primary">Acompanhar pedido</button>
              </div>
            )}
          </div>
        </div>

        {uncertainRequest && <p role="alert" className="bg-amber-50 px-5 py-3 text-sm text-amber-900">A resposta do pedido não chegou. Confirme novamente para consultar a mesma tentativa, sem criar outro pedido.</p>}
        {/* Footer Actions */}
        {step !== 'success' && (
          <div className="flex flex-shrink-0 items-center gap-3 border-t border-gray-100 bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {currentStepIndex > 0 && (
              <button
                type="button"
                disabled={isSubmitting || uncertainRequest} onClick={handleBack}
                className="h-11 rounded-lg border border-gray-200 px-5 text-xs font-bold uppercase tracking-wide text-gray-600 transition-all hover:bg-gray-50"
              >
                Voltar
              </button>
            )}

            {step === 'confirmation' ? (
              <button
                type="button"
                disabled={isSubmitting || revalidating}
                onClick={handleFinalize}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg store-bg-primary text-xs font-bold uppercase tracking-wide store-text-on-primary transition-all hover:opacity-95 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <span>Finalizar Pedido • {money(total)}</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                disabled={Boolean(storeConfig?.preorders?.enabled && !schedule.ready)}
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
        storeSettings={storeConfig}
      />
      <React.Suspense fallback={null}>
        <AddressPinConfirmModal
          isOpen={Boolean(pendingPin)}
          initialLocation={pendingPin}
          addressLabel={checkoutAddress}
          onClose={() => { setPendingPin(null); setPendingPinAddress(null); }}
          onConfirm={(location) => {
            const confirmed = { ...pendingPinAddress, ...location, locationConfirmed: true, locationConfirmationToken: pendingConfirmationToken };
            setPendingPin(null);
            setPendingPinAddress(null);
            setPendingConfirmationToken('');
            setCheckoutAddressData(confirmed);
            void calculateShipping(confirmed);
          }}
        />
      </React.Suspense>
    </div>
  ), document.body);
}
