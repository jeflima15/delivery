import React, { useEffect, useState } from 'react';
import {
  Bike,
  ChevronDown,
  ChevronRight,
  MapPin,
  PersonStanding,
  ShoppingBag,
  Ticket,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from './Toast';
import DeliveryAddressModal from './DeliveryAddressModal';
import { CouponModal } from './CouponModal';
import { customerApi } from '../features/customer/api';
import ComboComposition from './ComboComposition';
import { getLastAddress, saveLastAddress } from '../lib/customerStorage';

interface CartDrawerProps {
  isOpen: boolean;
  inlineMode?: boolean;
  onClose: () => void;
  cart: any[];
  onUpdateQuantity: (index: number, delta: number) => void;
  onClearCart: () => void;
  user: any;
  onEditItem?: (index: number) => void;
  onStartCheckout: (data: any) => void;
  tenantSlug?: string | null;
  canSaveAddress?: boolean;
}

export default function CartDrawer({
  isOpen,
  inlineMode = false,
  onClose,
  cart,
  onUpdateQuantity,
  onClearCart,
  user,
  onEditItem,
  onStartCheckout,
  tenantSlug,
  canSaveAddress = false,
}: CartDrawerProps) {
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup' | 'dine_in' | null>(null);
  const [selectedAddressIndex, setSelectedAddressIndex] = useState<number | 'manual' | ''>('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [address, setAddress] = useState('');
  const [shippingFee, setShippingFee] = useState(0);
  const [shippingQuoteId, setShippingQuoteId] = useState<string | null>(null);
  const [isLogisticsOpen, setIsLogisticsOpen] = useState(false);
  const [storeConfig, setStoreConfig] = useState<any>(null);
  const [calculatingFee, setCalculatingFee] = useState(false);
  const [outOfRange, setOutOfRange] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState<{
    type: 'delivery' | 'pickup' | 'dine_in' | null;
    address: string;
    data: any;
  }>({
    type: null,
    address: '',
    data: null,
  });
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const { showToast } = useToast();
  const isLoyaltyActive = storeConfig?.fidelidade_ativa === true;

  const subtotal = cart.reduce(
    (acc, item) => acc + (isLoyaltyActive && item.is_resgate ? 0 : item.subtotal),
    0
  );
  const totalPontosNecessarios = isLoyaltyActive
    ? cart.reduce(
        (acc, item) => acc + (item.is_resgate ? (item.pontos_resgate || 0) * item.quantidade : 0),
        0
      )
    : 0;
  const isBelowMinOrder =
    storeConfig?.pedido_minimo > 0 && subtotal < storeConfig.pedido_minimo && subtotal > 0;
  const faltaParaMinimo = isBelowMinOrder ? storeConfig.pedido_minimo - subtotal : 0;
  const hasFreeShipping =
    storeConfig?.frete_gratis_acima_de > 0 &&
    subtotal >= storeConfig.frete_gratis_acima_de &&
    deliveryMethod === 'delivery';
  const finalShippingFee =
    deliveryMethod === 'pickup' || deliveryMethod === 'dine_in' || hasFreeShipping ? 0 : shippingFee;
  const couponDiscountValue = appliedCoupon
    ? appliedCoupon.tipo === 'fixo'
      ? appliedCoupon.valor
      : subtotal * (appliedCoupon.valor / 100)
    : 0;
  const total = Math.max(0, subtotal + finalShippingFee - couponDiscountValue);
  const saldoAposResgate = (user?.pontos || 0) - totalPontosNecessarios;

  const allowPickup = storeConfig?.logisticsOptions?.allowPickup !== false;
  const allowDelivery = storeConfig?.logisticsOptions?.allowDelivery !== false;
  const allowDineIn = Boolean(storeConfig?.logisticsOptions?.allowDineIn);

  const handleApplyCoupon = async (code: string) => {
    try {
      if (!tenantSlug || !user) return { success: false, message: 'Entre na sua conta para aplicar um cupom.' };
      if (totalPontosNecessarios > 0) return { success: false, message: 'Não é possível usar cupom junto com resgate de pontos.' };
      const data = await customerApi(tenantSlug).coupon(code.toUpperCase(), Math.round(subtotal * 100));
      const coupon = {
        codigo: data.coupon.code,
        tipo: data.coupon.type === 'porcentagem' ? 'porcentagem' : 'fixo',
        valor: data.coupon.value,
        discountCents: data.coupon.discountCents,
      };
      setAppliedCoupon(coupon);
      showToast(`Cupom ${coupon.codigo} aplicado!`, 'success');
      return { success: true };
    } catch (error: any) {
      setAppliedCoupon(null);
      return { success: false, message: error?.message || 'Não foi possível validar este cupom.' };
    }
  };

  const handleDeliveryConfirm = (addressData: any) => {
    const saved = saveLastAddress(tenantSlug, addressData);
    const fullAddr =
      saved.enderecoCompleto ||
      `${saved.logradouro}, ${saved.numero}${saved.complemento ? ` - ${saved.complemento}` : ''} - ${saved.bairro}, ${saved.cidade}/${saved.estado}`;

    setDeliveryInfo({ type: 'delivery', address: fullAddr, data: saved });
    setDeliveryMethod('delivery');
    setCep(saved.cep || '');
    setLogradouro(saved.logradouro || '');
    setNumero(saved.numero || '');
    setBairro(saved.bairro || '');
    setComplemento(saved.complemento || '');
    setCidade(saved.cidade || '');
    setEstado(saved.estado || '');
    setAddress(fullAddr);
    setSelectedAddressIndex('manual');
  };

  const handlePickupConfirm = () => {
    const storeAddr = [storeConfig?.rua_loja, storeConfig?.numero_loja, storeConfig?.bairro_loja]
      .filter(Boolean)
      .join(', ');
    setDeliveryInfo({ type: 'pickup', address: storeAddr || 'Retirar na loja', data: null });
    setDeliveryMethod('pickup');
    setShippingFee(0);
    setOutOfRange(false);
    setGeoError('');
  };

  const handleDineInConfirm = () => {
    setDeliveryInfo({ type: 'dine_in', address: 'Comer no local (Mesa / Balcão)', data: null });
    setDeliveryMethod('dine_in');
    setShippingFee(0);
    setOutOfRange(false);
    setGeoError('');
  };

  // Carrega configs da loja
  useEffect(() => {
    const loadStoreData = async () => {
      try {
        if (!tenantSlug) return;
        const res = await fetch(`/api/public/stores/${encodeURIComponent(tenantSlug)}/store`);
        const data = await res.json();
        const resolvedConfig = data.settings;

        if (data.success && resolvedConfig) {
          setStoreConfig(resolvedConfig);
        }
      } catch (err) {
        console.error('Erro ao buscar configs da loja', err);
      }
    };

    loadStoreData();
  }, [tenantSlug]);

  // Carrega automaticamente o último endereço do cliente (localStorage ou conta)
  useEffect(() => {
    if (!tenantSlug) return;
    if (deliveryInfo.address) return;

    if (user?.enderecos?.length) {
      const padrao = user.enderecos.find((a: any) => a.padrao) || user.enderecos[0];
      if (padrao) {
        handleDeliveryConfirm(padrao);
        return;
      }
    }

    const last = getLastAddress(tenantSlug);
    if (last && last.logradouro && last.numero && allowDelivery) {
      handleDeliveryConfirm(last);
    }
  }, [tenantSlug, user, allowDelivery]);

  // Validação dos métodos disponíveis
  useEffect(() => {
    if (!storeConfig) return;

    if (deliveryMethod === 'pickup' && !allowPickup) {
      setDeliveryMethod(allowDelivery ? 'delivery' : allowDineIn ? 'dine_in' : null);
    }

    if (deliveryMethod === 'delivery' && !allowDelivery) {
      setDeliveryMethod(allowPickup ? 'pickup' : allowDineIn ? 'dine_in' : null);
    }

    if (deliveryMethod === 'dine_in' && !allowDineIn) {
      setDeliveryMethod(allowDelivery ? 'delivery' : allowPickup ? 'pickup' : null);
    }

    if (!deliveryMethod) {
      if (allowDelivery) {
        setDeliveryMethod('delivery');
      } else if (allowPickup) {
        setDeliveryMethod('pickup');
      } else if (allowDineIn) {
        setDeliveryMethod('dine_in');
      }
    }
  }, [allowDelivery, allowPickup, allowDineIn, deliveryMethod, storeConfig]);

  useEffect(() => {
    if (deliveryMethod === 'pickup') {
      handlePickupConfirm();
    } else if (deliveryMethod === 'dine_in') {
      handleDineInConfirm();
    }
  }, [deliveryMethod]);

  useEffect(() => {
    if (selectedAddressIndex === 'manual' || !user?.enderecos?.length) {
      if (logradouro && numero && bairro && cidade) {
        setAddress(
          `${logradouro}, ${numero}${complemento ? ` - ${complemento}` : ''} - ${bairro}, ${cidade} - ${estado}, CEP: ${cep}`
        );
      } else {
        setAddress('');
      }
    }
  }, [logradouro, numero, complemento, bairro, cidade, estado, cep, selectedAddressIndex, user]);

  useEffect(() => {
    const updateFee = async () => {
      setGeoError('');

      if (!deliveryMethod || deliveryMethod === 'pickup' || deliveryMethod === 'dine_in') {
        setShippingFee(0);
        setShippingQuoteId(null);
        setOutOfRange(false);
        setCalculatingFee(false);
        return;
      }

      let targetCep = cep;
      let targetRua = logradouro;
      let targetCidade = cidade;

      if (user?.enderecos?.length > 0 && selectedAddressIndex !== '' && selectedAddressIndex !== 'manual') {
        const end = user.enderecos[selectedAddressIndex as number];
        targetCep = end.cep;
        targetRua = end.logradouro;
        targetCidade = end.cidade;
      }

      if ((targetCep || targetRua) && targetCidade) {
        setCalculatingFee(true);
        if (!tenantSlug) {
          setCalculatingFee(false);
          setGeoError('Loja não informada.');
          return;
        }
        try {
          const selected =
            user?.enderecos?.length > 0 && selectedAddressIndex !== '' && selectedAddressIndex !== 'manual'
              ? user.enderecos[selectedAddressIndex as number]
              : { cep: targetCep, logradouro: targetRua, numero, bairro, cidade: targetCidade, estado };
          const response = await fetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/shipping/quote`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              postalCode: selected.cep,
              street: selected.logradouro,
              number: selected.numero,
              district: selected.bairro,
              city: selected.cidade,
              state: selected.estado,
            }),
          });
          const payload = await response.json();
          if (!response.ok || !payload.success)
            throw new Error(payload?.error?.message || 'Não foi possível calcular a entrega.');
          setShippingFee(payload.quote.feeCents / 100);
          setShippingQuoteId(payload.quote.id);
          setOutOfRange(false);
          setGeoError('');
        } catch (error) {
          setShippingFee(0);
          setShippingQuoteId(null);
          setOutOfRange(true);
          setGeoError(error instanceof Error ? error.message : 'Não foi possível calcular a entrega.');
        } finally {
          setCalculatingFee(false);
        }
      }
    };

    const timer = setTimeout(() => {
      updateFee();
    }, 800);

    return () => clearTimeout(timer);
  }, [
    address,
    deliveryMethod,
    selectedAddressIndex,
    user,
    storeConfig,
    cep,
    logradouro,
    numero,
    bairro,
    cidade,
    estado,
    tenantSlug,
  ]);

  const handleCheckout = async () => {
    if (!deliveryMethod) {
      showToast('Selecione como deseja receber o pedido.', 'error');
      return;
    }

    if (deliveryMethod === 'delivery' && !address) {
      showToast('Informe o endereço de entrega!', 'error');
      return;
    }

    if (saldoAposResgate < 0) {
      showToast('Saldo insuficiente!', 'error');
      return;
    }

    if (totalPontosNecessarios > 0 && appliedCoupon) {
      showToast('Remova o cupom ou os itens de fidelidade para finalizar.', 'error');
      return;
    }

    onStartCheckout({
      storeConfig,
      finalShippingFee,
      deliveryMethod,
      address,
      addressData: deliveryMethod === 'delivery' ? deliveryInfo.data : null,
      subtotal,
      appliedCoupon,
      shippingQuoteId: deliveryMethod === 'delivery' ? shippingQuoteId : null,
    });
  };

  if (!isOpen) return null;

  const canCheckout =
    storeConfig?.is_open !== false &&
    cart.length > 0 &&
    !!deliveryMethod &&
    !(deliveryMethod === 'delivery' && !address) &&
    !(tenantSlug && deliveryMethod === 'delivery' && !shippingQuoteId) &&
    !isBelowMinOrder;

  const storeAddressLine = [storeConfig?.rua_loja, storeConfig?.numero_loja].filter(Boolean).join(', ');
  const logisticsSubtitle =
    deliveryMethod === 'dine_in'
      ? 'Comer no local (Mesa / Balcão)'
      : deliveryMethod === 'pickup'
        ? storeAddressLine || 'Você retira no balcão'
        : address || 'Informe seu endereço para calcular a entrega';

  const deliveryFeeLabel =
    deliveryMethod === 'pickup' || deliveryMethod === 'dine_in'
      ? 'Grátis'
      : !address
        ? 'A definir'
        : calculatingFee
          ? 'Calculando...'
          : finalShippingFee === 0
            ? 'Grátis'
            : `R$ ${finalShippingFee.toFixed(2).replace('.', ',')}`;

  const checkoutLabel =
    storeConfig?.is_open === false
      ? 'Estabelecimento fechado'
      : cart.length === 0
        ? 'Sacola vazia'
        : isBelowMinOrder
          ? `Pedido mínimo R$ ${storeConfig?.pedido_minimo?.toFixed(2).replace('.', ',')}`
          : 'Continuar pedido';

  const storeTitle = storeConfig?.nome_loja || 'Sua sacola';
  const checkoutAction = (
    <button
      onClick={handleCheckout}
      disabled={!canCheckout}
      className={cn(
        'flex h-12 w-full items-center justify-center rounded-xl text-[16px] font-semibold transition-colors',
        canCheckout
          ? 'cursor-pointer store-bg-primary store-bg-primary-hover store-text-on-primary shadow-sm active:scale-[0.99]'
          : 'cursor-not-allowed bg-gray-200 text-gray-500 opacity-70'
      )}
    >
      {checkoutLabel}
    </button>
  );

  return (
    <>
      <div
        className={cn(
          inlineMode
            ? 'relative flex h-full w-full flex-col'
            : 'fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-white lg:hidden'
        )}
      >
        {!inlineMode && (
          <div className="shrink-0 bg-white px-4 pb-2 pt-3 border-b border-gray-100">
            <div className="flex min-h-[42px] items-center justify-between gap-3">
              <h2 className="min-w-0 truncate text-[16px] font-bold text-gray-800">
                {storeTitle}
              </h2>
              <button
                onClick={onClose}
                className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200"
                aria-label="Fechar sacola"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className={cn(inlineMode ? 'flex-1 overflow-visible' : 'min-h-0 flex-1 overflow-y-auto bg-[#f8fafc]')}>
          <div
            className={cn(
              'flex flex-col overflow-hidden bg-white',
              inlineMode
                ? 'w-full rounded-2xl border border-gray-200/80 shadow-sm'
                : 'min-h-full w-full rounded-none border-0 shadow-none'
            )}
          >
            {/* Opções de Atendimento / Logística */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsLogisticsOpen(!isLogisticsOpen)}
                className="flex h-14 w-full items-center justify-between px-4 text-left transition-colors hover:bg-gray-50/80"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full store-bg-soft store-text-primary">
                    {deliveryMethod === 'dine_in' ? (
                      <UtensilsCrossed className="h-4 w-4" />
                    ) : deliveryMethod === 'pickup' ? (
                      <PersonStanding className="h-4 w-4" />
                    ) : (
                      <Bike className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-5 text-gray-800">
                      {deliveryMethod === 'dine_in'
                        ? 'Comer no local'
                        : deliveryMethod === 'pickup'
                          ? 'Retirada no balcão'
                          : 'Entrega em domicílio'}
                    </p>
                    <p className="truncate text-[11px] leading-4 text-gray-500">
                      {outOfRange && deliveryMethod === 'delivery'
                        ? 'Endereço fora da área de entrega'
                        : logisticsSubtitle}
                    </p>
                  </div>
                </div>
                {isLogisticsOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 store-text-primary" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                )}
              </button>

              {geoError && deliveryMethod === 'delivery' && (
                <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-[11px] leading-4 text-red-600">
                  {geoError}
                </p>
              )}

              {isLogisticsOpen && (
                <div className="absolute inset-x-3 top-[calc(100%-4px)] z-20 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150">
                  <div className="p-3">
                    <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Como você deseja o seu pedido?
                    </p>

                    <div className="space-y-1">
                      {allowDelivery && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsLogisticsOpen(false);
                            setIsDeliveryModalOpen(true);
                          }}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors',
                            deliveryMethod === 'delivery' ? 'bg-emerald-50/60 text-emerald-950' : 'hover:bg-gray-50'
                          )}
                        >
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700">
                            <Bike className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-gray-800">Entrega</p>
                            <p className="mt-0.5 text-[11px] text-gray-500">Receba no seu endereço</p>
                          </div>
                        </button>
                      )}

                      {allowPickup && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsLogisticsOpen(false);
                            handlePickupConfirm();
                          }}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors',
                            deliveryMethod === 'pickup' ? 'bg-blue-50/60 text-blue-950' : 'hover:bg-gray-50'
                          )}
                        >
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100/80 text-blue-700">
                            <PersonStanding className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-gray-800">Retirada</p>
                            <p className="mt-0.5 text-[11px] text-gray-500">Retire direto no balcão</p>
                          </div>
                        </button>
                      )}

                      {allowDineIn && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsLogisticsOpen(false);
                            handleDineInConfirm();
                          }}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors',
                            deliveryMethod === 'dine_in' ? 'bg-purple-50/60 text-purple-950' : 'hover:bg-gray-50'
                          )}
                        >
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100/80 text-purple-700">
                            <UtensilsCrossed className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-gray-800">Comer no local</p>
                            <p className="mt-0.5 text-[11px] text-gray-500">Peça antes e encontre pronto no salão</p>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100" />

            {cart.length === 0 ? (
              <>
                <div className="bg-gray-50/50 py-10">
                  <div className="flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                      <ShoppingBag className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-gray-700">Sua sacola está vazia</p>
                      <p className="text-xs text-gray-500 mt-0.5">Adicione itens deliciosos do cardápio!</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100" />
              </>
            ) : (
              <>
                <div className="bg-gray-50/50">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[14px] font-bold text-gray-800">Itens pedidos ({cart.length})</span>
                    <button
                      type="button"
                      onClick={onClearCart}
                      className="text-[12px] font-medium text-red-500 hover:text-red-700 transition-colors"
                    >
                      Limpar sacola
                    </button>
                  </div>

                  <div className={cn('space-y-2.5 px-3 pb-3', inlineMode && 'max-h-[360px] overflow-y-auto')}>
                    {cart.map((item, idx) => {
                      const itemNotes = [
                        ...(item.opcoes_escolhidas || []).map((op: any) => op?.opcao).filter(Boolean),
                        item.observacao,
                      ]
                        .filter(Boolean)
                        .join(', ');

                      return (
                        <div
                          key={idx}
                          className="relative overflow-hidden rounded-xl border border-gray-200/70 bg-white p-3 shadow-sm"
                        >
                          <div className="pr-14">
                            <div className="flex items-start justify-between gap-3">
                              <p className="min-w-0 truncate text-[13px] font-semibold text-gray-900">
                                <span className="store-text-primary font-bold">{item.quantidade}x</span> {item.nome}
                              </p>
                              <span className="shrink-0 text-[13px] font-bold text-gray-900">
                                R$ {item.subtotal.toFixed(2).replace('.', ',')}
                              </span>
                            </div>

                            {item.itemType === 'combo' && <ComboComposition stages={item.comboDisplay} className="mt-2" />}
                            {itemNotes && (
                              <p className="mt-1.5 line-clamp-2 text-[11px] leading-[1.45] text-gray-500">
                                {itemNotes}
                              </p>
                            )}

                            <div className="mt-3 flex items-center gap-4">
                              <button
                                type="button"
                                onClick={() => onEditItem?.(idx)}
                                className="text-[11px] font-semibold store-text-primary hover:underline"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => onUpdateQuantity(idx, -item.quantidade)}
                                className="text-[11px] font-medium text-gray-400 hover:text-red-600 transition-colors"
                              >
                                Remover
                              </button>
                            </div>
                          </div>

                          {item.imagem && (
                            <div className="absolute bottom-3 right-3 h-11 w-11 overflow-hidden rounded-lg bg-gray-100">
                              <img
                                src={item.imagem}
                                alt={item.nome}
                                className="h-full w-full object-cover object-center"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                <div className="px-4 py-3">
                  <div className="space-y-2 text-[13px] text-gray-500">
                    <div className="flex items-center justify-between">
                      <span>Subtotal</span>
                      <span className="font-semibold text-gray-800">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Taxa de entrega</span>
                      <span className="font-semibold text-gray-800">{deliveryFeeLabel}</span>
                    </div>
                    {appliedCoupon && (
                      <div className="flex items-center justify-between store-text-primary">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Desconto cupom</span>
                          <button
                            type="button"
                            onClick={() => setAppliedCoupon(null)}
                            className="text-[11px] font-medium text-red-500 hover:text-red-600 transition-colors"
                          >
                            (Remover)
                          </button>
                        </div>
                        <span className="font-bold">- R$ {couponDiscountValue.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-[15px] font-bold text-gray-900">
                      <span>Total</span>
                      <span>R$ {total.toFixed(2).replace('.', ',')}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100" />
              </>
            )}

            <button
              type="button"
              onClick={() => setIsCouponModalOpen(true)}
              className="flex h-[56px] w-full items-center justify-between px-4 text-left transition-colors hover:bg-gray-50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Ticket className="h-5 w-5 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-700">
                    {appliedCoupon ? `Cupom ${appliedCoupon.codigo} aplicado` : 'Tem um cupom?'}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-gray-500">
                    {appliedCoupon ? 'Clique para revisar ou trocar' : 'Clique e insira o código'}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 store-text-primary" />
            </button>

            <div className="border-t border-gray-100" />

            {inlineMode && (
              <div className="p-3">
                {checkoutAction}

                {cart.length > 0 && isBelowMinOrder && (
                  <p className="mt-2 text-center text-[11px] font-medium text-red-500">
                    Faltam R$ {faltaParaMinimo.toFixed(2).replace('.', ',')} para o pedido mínimo
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {!inlineMode && (
          <div className="shrink-0 border-t border-gray-200 bg-white p-3 shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
            {checkoutAction}

            {cart.length > 0 && isBelowMinOrder && (
              <p className="mt-2 text-center text-[11px] font-medium text-red-500">
                Faltam R$ {faltaParaMinimo.toFixed(2).replace('.', ',')} para o pedido mínimo
              </p>
            )}
          </div>
        )}
      </div>

      <DeliveryAddressModal
        isOpen={isDeliveryModalOpen}
        onClose={() => setIsDeliveryModalOpen(false)}
        onConfirmDelivery={handleDeliveryConfirm}
        user={user}
        tenantSlug={tenantSlug}
        canSaveAddress={canSaveAddress}
      />

      <CouponModal
        isOpen={isCouponModalOpen}
        onClose={() => setIsCouponModalOpen(false)}
        onApply={handleApplyCoupon}
      />
    </>
  );
}
