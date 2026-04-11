import React, { useEffect, useState } from 'react';
import {
  ChevronRight,
  Gift,
  Loader2,
  MapPin,
  ShoppingBag,
  Store,
  Tag,
  Truck,
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

  const subtotal = cart.reduce((acc, item) => acc + (item.is_resgate ? 0 : item.subtotal), 0);
  const totalPontosNecessarios = cart.reduce(
    (acc, item) => acc + (item.is_resgate ? (item.pontos_resgate || 0) * item.quantidade : 0),
    0
  );
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

  const logisticsTabClass = (active: boolean) =>
    cn(
      'flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-all',
      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    );

  const canCheckout =
    cart.length > 0 &&
    !isCheckingOut &&
    !!deliveryMethod &&
    !(deliveryMethod === 'delivery' && !address) &&
    !isBelowMinOrder;

  return (
    <>
      {!inlineMode && <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />}

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

            <div className="flex-1 overflow-auto px-4 pb-4">
              {!inlineMode && storeConfig?.fidelidade_ativa !== false && (
                <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#a66a2b] text-white">
                      <Gift className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-lg font-black tracking-tight text-gray-950">Programa de fidelidade</p>
                      <p className="mt-2 text-sm leading-6 text-gray-500">
                        A cada R$ 1,00 em compras voce ganha {storeConfig?.pontos_por_real || 1} ponto
                        {(storeConfig?.pontos_por_real || 1) > 1 ? 's' : ''} que pode trocar por beneficios.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-4">
                  <p className="text-lg font-black tracking-tight text-gray-950">Logistica</p>
                  <p className="text-sm text-gray-500">Escolha como voce quer receber o pedido.</p>
                </div>

                <div className="rounded-2xl bg-gray-100 p-1">
                  <div className="flex gap-1">
                    {allowPickup && (
                      <button
                        type="button"
                        onClick={() => setDeliveryMethod('pickup')}
                        className={logisticsTabClass(deliveryMethod === 'pickup')}
                      >
                        Retirar no local
                      </button>
                    )}
                    {allowDelivery && (
                      <button
                        type="button"
                        onClick={() => setDeliveryMethod('delivery')}
                        className={logisticsTabClass(deliveryMethod === 'delivery')}
                      >
                        Entrega
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  {deliveryMethod === 'pickup' ? (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-full bg-white p-2 text-gray-500">
                          <Store className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-gray-900">Retirar no local</p>
                          <p className="mt-1 text-sm text-gray-500">
                            {[storeConfig?.rua_loja, storeConfig?.numero_loja, storeConfig?.bairro_loja]
                              .filter(Boolean)
                              .join(', ') || 'Endereco da loja'}
                          </p>
                          <button
                            type="button"
                            onClick={handlePickupConfirm}
                            className="mt-3 inline-flex rounded-xl bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm"
                          >
                            Confirmar retirada
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setIsDeliveryModalOpen(true)}
                        className="flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left transition-colors hover:bg-gray-100/80"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-full bg-white p-2 text-gray-500">
                            <MapPin className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-gray-900">Calcular taxa e tempo de entrega</p>
                            <p className="mt-1 text-sm text-gray-500">
                              {address || 'Escolha o endereco para calcular a entrega'}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-[#a66a2b]" />
                      </button>

                      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <div className="space-y-2 text-sm text-gray-600">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Taxa</span>
                            <span className={finalShippingFee === 0 ? 'font-bold text-emerald-600' : 'font-bold text-gray-900'}>
                              {calculatingFee
                                ? 'Calculando...'
                                : finalShippingFee === 0
                                ? 'Gratis'
                                : `R$ ${finalShippingFee.toFixed(2).replace('.', ',')}`}
                            </span>
                          </div>
                          {storeConfig?.frete_gratis_acima_de > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Frete gratis</span>
                              <span className="font-bold text-gray-900">
                                a partir de R$ {storeConfig.frete_gratis_acima_de.toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                          )}
                          {outOfRange && <p className="pt-1 text-xs font-bold text-red-500">{geoError}</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-black tracking-tight text-gray-950">Sua sacola</p>
                    <p className="text-sm text-gray-500">
                      {cart.length > 0
                        ? `${cart.reduce((acc, item) => acc + item.quantidade, 0)} item(ns) no pedido`
                        : 'Nenhum item adicionado ainda'}
                    </p>
                  </div>
                  <button
                    onClick={onClearCart}
                    className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-500 transition-colors hover:text-red-500"
                  >
                    Limpar
                  </button>
                </div>

                {cart.length === 0 ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl bg-gray-50 px-6 text-center">
                    <ShoppingBag className="mb-4 h-16 w-16 text-gray-300" />
                    <p className="text-3xl font-medium tracking-tight text-gray-400">Sacola vazia</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {cart.map((item, idx) => (
                        <div key={idx} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                          <div className="flex gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="shrink-0 text-[13px] font-bold text-gray-900">{item.quantidade}x</span>
                                    <span className="truncate text-[13px] font-bold text-gray-800">{item.nome}</span>
                                  </div>
                                  <div className="mt-1 text-[10px] font-medium italic text-gray-400 line-clamp-2">
                                    {item.opcoes_escolhidas?.map((op: any, i: number) => (
                                      <span key={i}>{op.opcao} </span>
                                    ))}
                                  </div>
                                </div>
                                <span className="shrink-0 text-[13px] font-bold text-gray-900">
                                  R$ {item.subtotal.toFixed(2).replace('.', ',')}
                                </span>
                              </div>

                              <div className="mt-3 flex gap-5">
                                <button
                                  onClick={() => onEditItem?.(idx)}
                                  className="text-[11px] font-black uppercase tracking-wider text-emerald-600 transition-opacity hover:opacity-80"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => onUpdateQuantity(idx, -item.quantidade)}
                                  className="text-[11px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:text-red-500"
                                >
                                  Remover
                                </button>
                              </div>
                            </div>

                            {item.imagem && (
                              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                                <img src={item.imagem} alt={item.nome} className="h-full w-full object-cover" />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsCouponModalOpen(true)}
                      className="mt-4 flex w-full items-center justify-between rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-100/80"
                    >
                      <div className="flex items-center gap-3">
                        <Tag className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-black text-gray-900">
                            {appliedCoupon ? `Cupom ${appliedCoupon.codigo} aplicado` : 'Tem um cupom?'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {appliedCoupon ? 'Cupom aplicado com sucesso' : 'Clique e insira o codigo'}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-[#a66a2b]" />
                    </button>

                    <div className="mt-4 rounded-2xl bg-gray-50 p-4">
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center justify-between">
                          <span>Subtotal</span>
                          <span className="font-bold text-gray-900">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Taxa de entrega</span>
                          <span className="font-bold text-gray-900">
                            {deliveryMethod === 'pickup'
                              ? 'Gratis'
                              : calculatingFee
                              ? 'Calculando...'
                              : finalShippingFee === 0
                              ? 'Gratis'
                              : `R$ ${finalShippingFee.toFixed(2).replace('.', ',')}`}
                          </span>
                        </div>
                        {appliedCoupon && (
                          <div className="flex items-center justify-between text-emerald-600">
                            <span>Desconto</span>
                            <span className="font-bold">- R$ {couponDiscountValue.toFixed(2).replace('.', ',')}</span>
                          </div>
                        )}
                        <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3 text-base font-black text-gray-950">
                          <span>Total</span>
                          <span>R$ {total.toFixed(2).replace('.', ',')}</span>
                        </div>
                      </div>

                      {isBelowMinOrder && (
                        <p className="mt-3 text-xs font-bold text-red-500">
                          Faltam R$ {faltaParaMinimo.toFixed(2).replace('.', ',')} para atingir o pedido minimo.
                        </p>
                      )}
                    </div>
                  </>
                )}

                <div className="mt-4">
                  <button
                    onClick={handleCheckout}
                    disabled={!canCheckout}
                    className={cn(
                      'flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-bold transition-all active:scale-[0.98]',
                      canCheckout
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10 hover:opacity-90'
                        : 'cursor-not-allowed bg-gray-300 text-white'
                    )}
                  >
                    {isCheckingOut ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
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
