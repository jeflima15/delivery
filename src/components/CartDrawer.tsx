import React, { useEffect, useState } from 'react';
import {
  Bike,
  ChevronDown,
  ChevronRight,
  Loader2,
  MapPin,
  PersonStanding,
  ShoppingBag,
  Ticket,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from './Toast';
import OrderSuccess from './OrderSuccess';
import DeliveryAddressModal from './DeliveryAddressModal';
import { CouponModal } from './CouponModal';

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const fetchCoordinates = async (cepStr: string, ruaStr: string, cidadeStr: string) => {
  const cleanCep = cepStr ? cepStr.replace(/\D/g, '') : '';

  const searchAddress = async (q: string, cep?: string) => {
    try {
      const url = `/api/geolocalizacao?q=${encodeURIComponent(q)}&cep=${cep || ''}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.sucesso && data.lat ? { lat: data.lat, lon: data.lon } : null;
    } catch (e) {
      return null;
    }
  };

  if (cleanCep.length === 8) {
    const res = await searchAddress(cleanCep, cleanCep);
    if (res) return res;
  }

  if (ruaStr && cidadeStr) {
    const rLimpa = ruaStr.split(',')[0].split('-')[0].trim();
    const res = await searchAddress(`${rLimpa}, ${cidadeStr}`);
    if (res) return res;
  }

  if (ruaStr && cidadeStr) {
    const res = await searchAddress(`${ruaStr}, ${cidadeStr}`);
    if (res) return res;
  }

  if (cidadeStr) {
    const res = await searchAddress(cidadeStr);
    if (res) return res;
  }

  return null;
};

interface CartDrawerProps {
  isOpen: boolean;
  inlineMode?: boolean;
  onClose: () => void;
  cart: any[];
  onUpdateQuantity: (index: number, delta: number) => void;
  onToggleRedemption?: (index: number) => void;
  onClearCart: () => void;
  user: any;
  onEditItem?: (index: number) => void;
  onNavigateToOrders?: () => void;
  onStartCheckout: (data: any) => void;
}

export default function CartDrawer({
  isOpen,
  inlineMode = false,
  onClose,
  cart,
  onUpdateQuantity,
  onToggleRedemption,
  onClearCart,
  user,
  onEditItem,
  onNavigateToOrders,
  onStartCheckout,
}: CartDrawerProps) {
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup' | null>(null);
  const [selectedAddressIndex, setSelectedAddressIndex] = useState<number | 'manual' | ''>('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [address, setAddress] = useState('');
  const [shippingFee, setShippingFee] = useState(0);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isLogisticsOpen, setIsLogisticsOpen] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [storeConfig, setStoreConfig] = useState<any>(null);
  const [storeCoords, setStoreCoords] = useState<{ lat: number; lon: number } | null>(null);
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
  const [deliveryInfo, setDeliveryInfo] = useState<{ type: 'delivery' | 'pickup' | null; address: string; data: any }>(
    {
      type: null,
      address: '',
      data: null,
    }
  );
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
  const finalShippingFee = hasFreeShipping ? 0 : shippingFee;
  const couponDiscountValue = appliedCoupon
    ? appliedCoupon.tipo === 'fixo'
      ? appliedCoupon.valor
      : subtotal * (appliedCoupon.valor / 100)
    : 0;
  const total = Math.max(0, subtotal + finalShippingFee - couponDiscountValue);
  const saldoAposResgate = (user?.pontos || 0) - totalPontosNecessarios;

  const allowPickup = storeConfig?.logisticsOptions?.allowPickup !== false;
  const allowDelivery = storeConfig?.logisticsOptions?.allowDelivery !== false;

  const handleApplyCoupon = async (code: string) => {
    setIsValidatingCoupon(true);
    try {
      const res = await fetch('/api/cupons/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: code.toUpperCase(), subtotal }),
      });
      const data = await res.json();

      if (data.sucesso) {
        setAppliedCoupon(data.cupom);
        showToast(`Cupom ${data.cupom.codigo} aplicado!`, 'success');
        return { success: true };
      }

      setAppliedCoupon(null);
      return { success: false, message: data?.erro || 'Nao foi possivel validar este cupom.' };
    } catch (e) {
      setAppliedCoupon(null);
      return { success: false, message: 'Erro ao validar cupom. Tente novamente.' };
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleDeliveryConfirm = (addressData: any) => {
    setDeliveryInfo({ type: 'delivery', address: addressData.enderecoCompleto, data: addressData });
    setDeliveryMethod('delivery');
    setCep(addressData.cep);
    setLogradouro(addressData.logradouro);
    setNumero(addressData.numero);
    setBairro(addressData.bairro);
    setComplemento(addressData.complemento || '');
    setCidade(addressData.cidade);
    setEstado(addressData.estado);
    setAddress(addressData.enderecoCompleto);
    setSelectedAddressIndex('manual');
  };

  const handlePickupConfirm = () => {
    const storeAddr = [storeConfig?.rua_loja, storeConfig?.numero_loja, storeConfig?.bairro_loja]
      .filter(Boolean)
      .join(', ');
    setDeliveryInfo({ type: 'pickup', address: storeAddr || 'Endereco da loja', data: null });
    setDeliveryMethod('pickup');
    setShippingFee(0);
    setOutOfRange(false);
    setGeoError('');
  };

  useEffect(() => {
    const loadStoreData = async () => {
      try {
        const res = await fetch('/api/configuracoes/publica');
        const data = await res.json();

        if (data.sucesso) {
          setStoreConfig(data);

          if (data.cep_loja || data.cidade_loja) {
            let coords = await fetchCoordinates(data.cep_loja, data.rua_loja, data.cidade_loja);
            if (!coords && data.rua_loja) coords = await fetchCoordinates('', data.rua_loja, data.cidade_loja);
            if (!coords) coords = await fetchCoordinates('', '', data.cidade_loja);
            if (coords) setStoreCoords(coords);
          }
        }
      } catch (err) {
        console.error('Erro ao buscar configs da loja', err);
      }
    };

    loadStoreData();
  }, []);

  useEffect(() => {
    if (!storeConfig) return;

    if (deliveryMethod === 'pickup' && !allowPickup) {
      setDeliveryMethod(allowDelivery ? 'delivery' : null);
    }

    if (deliveryMethod === 'delivery' && !allowDelivery) {
      setDeliveryMethod(allowPickup ? 'pickup' : null);
    }

    if (!deliveryMethod) {
      if (allowDelivery) {
        setDeliveryMethod('delivery');
      } else if (allowPickup) {
        setDeliveryMethod('pickup');
      }
    }
  }, [allowDelivery, allowPickup, deliveryMethod, storeConfig]);

  useEffect(() => {
    if (deliveryMethod === 'pickup') {
      handlePickupConfirm();
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

      if (!deliveryMethod || deliveryMethod === 'pickup') {
        setShippingFee(0);
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
        const finalStoreCoords = storeCoords;

        if (finalStoreCoords && storeConfig) {
          const clientCoords = await fetchCoordinates(targetCep, targetRua, targetCidade);

          if (clientCoords) {
            const distanceKm = calculateDistance(
              finalStoreCoords.lat,
              finalStoreCoords.lon,
              clientCoords.lat,
              clientCoords.lon
            );

            if (!storeConfig?.faixas_entrega || storeConfig.faixas_entrega.length === 0) {
              setShippingFee(0);
              setOutOfRange(false);
            } else {
              const faixas = [...storeConfig.faixas_entrega].sort((a: any, b: any) => a.km_ate - b.km_ate);
              let fee = -1;

              for (const faixa of faixas) {
                if (distanceKm <= faixa.km_ate) {
                  fee = faixa.valor;
                  break;
                }
              }

              if (fee === -1) {
                setOutOfRange(true);
                setShippingFee(0);
                setGeoError('Este endereco esta fora da area de entrega.');
              } else {
                setOutOfRange(false);
                setShippingFee(fee);
                setGeoError('');
              }
            }
          } else {
            setShippingFee(0);
            setOutOfRange(false);
          }
        }

        setCalculatingFee(false);
      }
    };

    const timer = setTimeout(() => {
      updateFee();
    }, 800);

    return () => clearTimeout(timer);
  }, [address, deliveryMethod, selectedAddressIndex, user, storeCoords, storeConfig, cep, logradouro, cidade]);

  const handleCheckout = async () => {
    if (!deliveryMethod) {
      showToast('Selecione Entrega ou Retirada.', 'error');
      return;
    }

    if (deliveryMethod === 'delivery' && !address) {
      showToast('Informe o endereco de entrega!', 'error');
      return;
    }

    if (saldoAposResgate < 0) {
      showToast('Saldo insuficiente!', 'error');
      return;
    }

    onStartCheckout({
      storeConfig,
      finalShippingFee,
      deliveryMethod,
      address,
      subtotal,
      appliedCoupon,
    });
  };

  if (!isOpen) return null;

  const canCheckout =
    cart.length > 0 &&
    !isCheckingOut &&
    !!deliveryMethod &&
    !(deliveryMethod === 'delivery' && !address) &&
    !isBelowMinOrder;

  const totalItems = cart.reduce((acc, item) => acc + item.quantidade, 0);
  const storeAddressLine = [storeConfig?.rua_loja, storeConfig?.numero_loja].filter(Boolean).join(', ');
  const logisticsSubtitle =
    deliveryMethod === 'pickup'
      ? storeAddressLine || 'Voce retira no local'
      : address || 'Informe seu endereco para calcular a entrega';
  const deliveryFeeLabel =
    deliveryMethod === 'pickup'
      ? 'Gratis'
      : !address
        ? 'A definir'
        : calculatingFee
          ? 'Calculando...'
          : finalShippingFee === 0
            ? 'Gratis'
            : `R$ ${finalShippingFee.toFixed(2).replace('.', ',')}`;
  const checkoutLabel = isCheckingOut
    ? ''
    : storeConfig?.is_open === false
      ? 'Estabelecimento fechado'
      : cart.length === 0
        ? 'Sacola vazia'
        : isBelowMinOrder
          ? `Pedido minimo R$ ${storeConfig?.pedido_minimo?.toFixed(2).replace('.', ',')}`
          : 'Continuar pedido';

  return (
    <>
      {!inlineMode && <div className="fixed inset-0 z-50 bg-black/40 cursor-default" onClick={onClose} />}

      <div
        className={cn(
          inlineMode
            ? 'relative flex h-full w-full flex-col'
            : 'fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#f3f4f6] shadow-2xl animate-in slide-in-from-right duration-200 sm:w-[380px]'
        )}
      >
        {orderSuccess ? (
          <OrderSuccess
            orderId={orderId}
            onTrackOrder={() => {
              setOrderSuccess(false);
              onClose();
            }}
          />
        ) : (
          <>
            {!inlineMode && (
              <div className="flex items-center justify-end px-4 pb-2 pt-4">
                <button
                  onClick={onClose}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm transition-colors hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}

            <div className={cn(inlineMode ? 'flex-1 overflow-visible' : 'flex-1 overflow-auto px-4 pb-4')}>
              <div
                className={cn(
                  'flex flex-col overflow-hidden bg-white',
                  inlineMode
                    ? 'w-full rounded-lg border border-black/10 shadow-sm'
                    : 'rounded-2xl border border-gray-100 shadow-sm'
                )}
              >
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsLogisticsOpen(!isLogisticsOpen)}
                    className="flex h-14 w-full items-center justify-between px-4 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <MapPin className="h-5 w-5 shrink-0 text-gray-400" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold leading-5 text-gray-800">
                          Calcular taxa e tempo de entrega
                        </p>
                        <p className="mt-0.5 truncate text-[11px] leading-4 text-gray-500">
                          {deliveryMethod === 'pickup'
                            ? logisticsSubtitle
                            : outOfRange
                              ? 'Endereco fora da area de entrega'
                              : logisticsSubtitle}
                        </p>
                      </div>
                    </div>
                    {isLogisticsOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-emerald-600" />
                    )}
                  </button>

                  {isLogisticsOpen && (
                    <div className="absolute inset-x-3 top-[calc(100%-4px)] z-20 overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-4 py-3">
                        <p className="mb-3 text-[12px] font-semibold text-gray-700">
                          Como voce quer receber o pedido?
                        </p>

                        <div className="space-y-2">
                          {allowDelivery && (
                            <button
                              onClick={() => {
                                setIsLogisticsOpen(false);
                                setIsDeliveryModalOpen(true);
                              }}
                              className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-50"
                            >
                              <Bike className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                              <div>
                                <p className="text-[13px] font-medium text-gray-800">Entrega</p>
                                <p className="mt-0.5 text-[11px] text-gray-500">A gente leva ate voce</p>
                              </div>
                            </button>
                          )}

                          {allowPickup && (
                            <button
                              onClick={() => {
                                setIsLogisticsOpen(false);
                                handlePickupConfirm();
                              }}
                              className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-50"
                            >
                              <PersonStanding className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                              <div>
                                <p className="text-[13px] font-medium text-gray-800">Retirada</p>
                                <p className="mt-0.5 text-[11px] text-gray-500">Voce retira no local</p>
                              </div>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-dashed border-gray-300/80" />

                {cart.length === 0 ? (
                  <>
                    <div className="bg-gray-50 pt-3">
                      <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 px-6 text-center">
                        <ShoppingBag className="h-16 w-16 text-gray-300" strokeWidth={1.6} />
                        <p className="text-[15px] font-medium text-gray-400">Sacola vazia</p>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-gray-300/80" />
                  </>
                ) : (
                  <>
                    <div className="bg-gray-50">
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-[15px] font-medium text-gray-800">Sua sacola</span>
                        <button
                          type="button"
                          onClick={onClearCart}
                          className="text-[12px] font-medium text-gray-500 transition-colors hover:text-gray-700"
                        >
                          Limpar
                        </button>
                      </div>

                      <div className="max-h-[360px] space-y-2.5 overflow-y-auto pb-3">
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
                              className="relative mx-3 min-h-[108px] overflow-hidden rounded-lg border border-gray-100 bg-white p-[10px] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                            >
                              <div className="pr-[62px]">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="min-w-0 truncate text-[13px] font-medium text-gray-900">
                                    <span className="font-semibold">{item.quantidade}x</span> {item.nome}
                                  </p>
                                  <span className="shrink-0 text-[13px] font-medium text-gray-900">
                                    R$ {item.subtotal.toFixed(2).replace('.', ',')}
                                  </span>
                                </div>

                                {itemNotes && (
                                  <p className="mt-2 line-clamp-2 text-[11px] leading-[1.45] text-gray-500">
                                    {itemNotes}
                                  </p>
                                )}

                                <div className="mt-3 flex items-center gap-4">
                                  <button
                                    type="button"
                                    onClick={() => onEditItem?.(idx)}
                                    className="text-[11px] font-medium text-emerald-600 transition-colors hover:text-emerald-700"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onUpdateQuantity(idx, -item.quantidade)}
                                    className="text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-700"
                                  >
                                    Remover
                                  </button>
                                </div>
                              </div>

                              {item.imagem && (
                                <div className="absolute bottom-[10px] right-[10px] h-12 w-12 overflow-hidden rounded-md bg-gray-100">
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

                    <div className="border-t border-dashed border-gray-300/80" />

                    <div className="px-4 py-3">
                      <div className="space-y-2 text-[13px] text-gray-500">
                        <div className="flex items-center justify-between">
                          <span>Subtotal</span>
                          <span className="font-medium text-gray-700">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Taxa de entrega</span>
                          <span className="font-medium text-gray-700">{deliveryFeeLabel}</span>
                        </div>
                        {appliedCoupon && (
                          <div className="flex items-center justify-between text-emerald-600">
                            <span>Desconto</span>
                            <span className="font-medium">- R$ {couponDiscountValue.toFixed(2).replace('.', ',')}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[14px] font-medium text-gray-900">Total</span>
                          <span className="text-[14px] font-medium text-gray-900">R$ {total.toFixed(2).replace('.', ',')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-gray-300/80" />
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setIsCouponModalOpen(true)}
                  className="flex h-[63px] w-full items-center justify-between px-4 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Ticket className="h-5 w-5 shrink-0 text-gray-400" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-gray-700">
                        {appliedCoupon ? `Cupom ${appliedCoupon.codigo} aplicado` : 'Tem um cupom?'}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-gray-500">
                        {appliedCoupon ? 'Clique para revisar o codigo' : 'Clique e insira o codigo'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-emerald-600" />
                </button>

                <div className="border-t border-dashed border-gray-300/80" />

                <div className="p-[13px]">
                  <button
                    onClick={handleCheckout}
                    disabled={!canCheckout}
                    className={cn(
                      'flex h-12 w-full items-center justify-center rounded-md text-[16px] font-medium transition-colors',
                      canCheckout
                        ? 'cursor-pointer bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                        : 'cursor-not-allowed bg-gray-200 text-gray-500 opacity-70'
                    )}
                  >
                    {isCheckingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : checkoutLabel}
                  </button>

                  {cart.length > 0 && isBelowMinOrder && (
                    <p className="mt-2 text-center text-[11px] font-medium text-red-500">
                      Faltam R$ {faltaParaMinimo.toFixed(2).replace('.', ',')} para o pedido minimo
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <DeliveryAddressModal
        isOpen={isDeliveryModalOpen}
        onClose={() => setIsDeliveryModalOpen(false)}
        storeInfo={storeConfig}
        onConfirmDelivery={handleDeliveryConfirm}
        onConfirmPickup={handlePickupConfirm}
        user={user}
      />

      <CouponModal
        isOpen={isCouponModalOpen}
        onClose={() => setIsCouponModalOpen(false)}
        onApply={handleApplyCoupon}
      />
    </>
  );
}
