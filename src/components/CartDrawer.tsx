import React, { useEffect, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Gift,
  Loader2,
  MapPin,
  ShoppingBag,
  Ticket,
  Truck,
  Bike,
  Store,
  PersonStanding,
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
  const [deliveryInfo, setDeliveryInfo] = useState<{ type: 'delivery' | 'pickup' | null; address: string; data: any }>({
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
  const isBelowMinOrder = storeConfig?.pedido_minimo > 0 && subtotal < storeConfig.pedido_minimo && subtotal > 0;
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
      const token = localStorage.getItem('stitch_token');
      const res = await fetch('/api/cupons/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ codigo: code.toUpperCase(), subtotal }),
      });
      const data = await res.json();

      if (data.sucesso) {
        setAppliedCoupon(data.cupom);
        showToast(`Cupom ${data.cupom.codigo} aplicado!`, 'success');
        return true;
      }

      setAppliedCoupon(null);
      return false;
    } catch (e) {
      return false;
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

  return (
    <>
      {!inlineMode && <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />}

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

            <div className={cn(inlineMode ? "flex-1 overflow-visible" : "flex-1 overflow-auto px-4 pb-4 top-2")}>
              <div
                className={cn(
                  "bg-white",
                  inlineMode
                    ? "overflow-hidden rounded-[22px] border border-[#e1e7db] shadow-[0_18px_38px_rgba(15,23,42,0.07)]"
                    : "rounded-2xl border border-gray-100 shadow-sm"
                )}
              >

                <button
                  type="button"
                  onClick={() => setIsLogisticsOpen(!isLogisticsOpen)}
                  className="flex w-full items-center justify-between border-b border-dashed border-gray-200 px-4 py-4 text-left transition-colors hover:bg-[#f8faf7]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f4faf5] text-emerald-600">
                      {deliveryMethod === 'pickup' ? (
                        <PersonStanding className="h-4 w-4" />
                      ) : (
                        <MapPin className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {deliveryMethod === 'pickup' ? 'Retirar no local' : 'Calcular taxa e tempo de entrega'}
                      </p>
                      {(deliveryMethod === 'pickup' || address) && (
                        <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                          {deliveryMethod === 'pickup'
                            ? `${storeConfig?.rua_loja || 'Rua'}, ${storeConfig?.numero_loja || 'S/N'} - ${storeConfig?.bairro_loja || 'Bairro'}`
                            : address}
                        </p>
                      )}
                    </div>
                  </div>
                  {isLogisticsOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                  )}
                </button>

                <div className="relative">
                  {isLogisticsOpen && (
                    <div className="absolute left-4 right-4 top-0 z-20 overflow-hidden rounded-[18px] border border-[#e4e8de] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)] animate-in fade-in zoom-in-95 duration-200">
                      <p className="mb-4 text-[12px] font-bold text-gray-800">Como voc{'\u00EA'} quer receber o pedido?</p>
                      
                      <div className="space-y-5">
                        <button
                          onClick={() => {
                            setIsLogisticsOpen(false);
                            setIsDeliveryModalOpen(true);
                          }}
                          className="flex w-full items-start gap-3 transition-opacity hover:opacity-70 group"
                        >
                          <Bike className="mt-0.5 h-6 w-6 text-gray-400 group-hover:text-emerald-600" />
                          <div className="text-left">
                            <p className="text-[13px] font-bold text-gray-800">Entrega</p>
                            <p className="mt-0.5 text-[11px] text-gray-400 font-medium">A gente leva at{'\u00E9'} voc{'\u00EA'}</p>
                          </div>
                        </button>

                        <button
                          onClick={() => {
                            setIsLogisticsOpen(false);
                            handlePickupConfirm();
                          }}
                          className="flex w-full items-start gap-3 transition-opacity hover:opacity-70 group"
                        >
                          <PersonStanding className="mt-0.5 h-6 w-6 text-gray-400 group-hover:text-emerald-600" />
                          <div className="text-left">
                            <p className="text-[13px] font-bold text-gray-800">Retirada</p>
                            <p className="mt-0.5 text-[11px] text-gray-400 font-medium">Voc{'\u00EA'} retira no local</p>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sacola — {'\u00E1'}rea principal */}
                <div className="px-4 py-4">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#f6faf6]">
                        <ShoppingBag className="h-8 w-8 text-gray-300" />
                      </div>
                      <p className="text-sm font-semibold text-gray-500">Sacola vazia</p>
                      <p className="mt-1 max-w-[210px] text-xs leading-5 text-gray-400">
                        Adicione itens do cardapio para continuar o pedido.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map((item, idx) => (
                        <div key={idx} className="flex gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="shrink-0 text-[13px] font-bold text-gray-900">{item.quantidade}x</span>
                                  <span className="truncate text-[13px] font-bold text-gray-800">{item.nome}</span>
                                </div>
                                <div className="mt-0.5 text-[10px] font-medium italic text-gray-400 line-clamp-1">
                                  {item.opcoes_escolhidas?.map((op: any, i: number) => (
                                    <span key={i}>{op.opcao} </span>
                                  ))}
                                </div>
                              </div>
                              <span className="shrink-0 text-[13px] font-bold text-gray-900">
                                R$ {item.subtotal.toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                            <div className="mt-2 flex gap-4">
                              <button
                                onClick={() => onEditItem?.(idx)}
                                className="text-[10px] font-black uppercase tracking-wider text-emerald-600 transition-opacity hover:opacity-80"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => onUpdateQuantity(idx, -item.quantidade)}
                                className="text-[10px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:text-red-500"
                              >
                                Remover
                              </button>
                            </div>
                          </div>

                          {item.imagem && (
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-white">
                              <img src={item.imagem} alt={item.nome} className="h-full w-full object-cover" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cupom — linha simples no fundo */}
                <button
                  type="button"
                  onClick={() => setIsCouponModalOpen(true)}
                  className="flex w-full items-center justify-between border-t border-dashed border-gray-200 px-4 py-3 text-left transition-colors hover:bg-[#f8faf7]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f8faf7] text-emerald-600">
                      <Ticket className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {appliedCoupon ? `Cupom ${appliedCoupon.codigo} aplicado` : 'Tem um cupom?'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {appliedCoupon ? 'Cupom aplicado com sucesso' : 'Clique e insira o c\u00F3digo'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                </button>

                {/* Resumo financeiro (s{'\u00F3'} com itens) */}
                {cart.length > 0 && (
                  <div className="border-t border-gray-100 px-4 py-3.5">
                    <div className="space-y-1.5 text-sm text-gray-600">
                      <div className="flex items-center justify-between">
                        <span>Subtotal</span>
                        <span className="font-bold text-gray-900">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Taxa de entrega</span>
                        <span className="font-bold text-gray-900">
                          {deliveryMethod === 'pickup'
                            ? 'Gr\u00E1tis'
                            : calculatingFee
                              ? 'Calculando...'
                              : finalShippingFee === 0
                                ? 'Gr\u00E1tis'
                                : `R$ ${finalShippingFee.toFixed(2).replace('.', ',')}`}
                        </span>
                      </div>
                      {appliedCoupon && (
                        <div className="flex items-center justify-between text-emerald-600">
                          <span>Desconto</span>
                          <span className="font-bold">- R$ {couponDiscountValue.toFixed(2).replace('.', ',')}</span>
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-base font-black text-gray-950">
                        <span>Total</span>
                        <span>R$ {total.toFixed(2).replace('.', ',')}</span>
                      </div>
                    </div>

                    {isBelowMinOrder && (
                      <p className="mt-2 text-xs font-bold text-red-500">
                        Faltam R$ {faltaParaMinimo.toFixed(2).replace('.', ',')} para atingir o pedido m{'\u00ED'}nimo.
                      </p>
                    )}
                  </div>
                )}

                {/* Bot{'\u00E3'}o CTA */}
                <div className="px-4 pb-4 pt-1">
                  <button
                    onClick={handleCheckout}
                    disabled={!canCheckout}
                    className={cn(
                      'flex h-[48px] w-full items-center justify-center rounded-[12px] text-sm font-bold transition-all active:scale-[0.98]',
                      canCheckout
                        ? 'bg-emerald-600 text-white shadow-md hover:opacity-90'
                        : 'cursor-not-allowed bg-gray-200 text-gray-400'
                    )}
                  >
                    {isCheckingOut ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : storeConfig?.is_open === false ? (
                      'Estabelecimento fechado'
                    ) : cart.length === 0 ? (
                      'Sacola vazia'
                    ) : (
                      'Continuar pedido'
                    )}
                  </button>
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
