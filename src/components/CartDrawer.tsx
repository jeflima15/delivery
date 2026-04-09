import React, { useState, useEffect } from 'react';
import { X, Minus, Plus, MapPin, CreditCard, Store, CheckCircle, ShoppingBag, QrCode, Banknote, ChevronRight, Map, Loader2, UserPlus, Truck, Ticket, Star, Tag, Gift } from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from './Toast';
import OrderSuccess from './OrderSuccess';
import DeliveryAddressModal from './DeliveryAddressModal';
import { CouponModal } from './CouponModal';

// Formula de Haversine para calcular distancia real em KM
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
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
      return (data && data.sucesso && data.lat) ? { lat: data.lat, lon: data.lon } : null;
    } catch (e) { return null; }
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

export default function CartDrawer({ isOpen, inlineMode = false, onClose, cart, onUpdateQuantity, onToggleRedemption, onClearCart, user, onEditItem, onNavigateToOrders, onStartCheckout }: CartDrawerProps) {
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup' | null>(null);
  const [selectedAddressIndex, setSelectedAddressIndex] = useState<number | 'manual' | ''>('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [shippingFee, setShippingFee] = useState(0);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [troco, setTroco] = useState('');
  const [storeConfig, setStoreConfig] = useState<any>(null);
  const [storeCoords, setStoreCoords] = useState<{ lat: number, lon: number } | null>(null);
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
  const [deliveryInfo, setDeliveryInfo] = useState<{ type: 'delivery' | 'pickup' | null, address: string, data: any }>({ type: null, address: '', data: null });
  const [saveNewAddress, setSaveNewAddress] = useState(false);
  const [addressTitle, setAddressTitle] = useState('Outro');
  const { showToast } = useToast();
  const [isMethodSelectorOpen, setIsMethodSelectorOpen] = useState(false);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);

  const subtotal = cart.reduce((acc, item) => acc + (item.is_resgate ? 0 : item.subtotal), 0);
  const totalPontosNecessarios = cart.reduce((acc, item) => acc + (item.is_resgate ? (item.pontos_resgate || 0) * item.quantidade : 0), 0);
  const isBelowMinOrder = storeConfig?.pedido_minimo > 0 && subtotal < storeConfig.pedido_minimo && subtotal > 0;
  const faltaParaMinimo = isBelowMinOrder ? (storeConfig.pedido_minimo - subtotal) : 0;
  const hasFreeShipping = storeConfig?.frete_gratis_acima_de > 0 && subtotal >= storeConfig.frete_gratis_acima_de && deliveryMethod === 'delivery';
  const finalShippingFee = hasFreeShipping ? 0 : shippingFee;
  const couponDiscountValue = appliedCoupon ? (appliedCoupon.tipo === 'fixo' ? appliedCoupon.valor : (subtotal * (appliedCoupon.valor / 100))) : 0;
  const total = Math.max(0, subtotal + finalShippingFee - couponDiscountValue);
  const saldoAposResgate = (user?.pontos || 0) - totalPontosNecessarios;

  const handleApplyCoupon = async (code: string) => {
    setIsValidatingCoupon(true);
    try {
      const token = localStorage.getItem('stitch_token');
      const res = await fetch('/api/cupons/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ codigo: code.toUpperCase(), subtotal })
      });
      const data = await res.json();
      if (data.sucesso) {
        setAppliedCoupon(data.cupom);
        showToast(`Cupom ${data.cupom.codigo} aplicado!`, 'success');
        return true;
      } else {
        setAppliedCoupon(null);
        return false;
      }
    } catch (e) { return false; }
    finally { setIsValidatingCoupon(false); }
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
    const storeAddr = [storeConfig?.rua_loja, storeConfig?.numero_loja, storeConfig?.bairro_loja].filter(Boolean).join(', ');
    setDeliveryInfo({ type: 'pickup', address: storeAddr || 'Endereco da loja', data: null });
    setDeliveryMethod('pickup');
    setShippingFee(0);
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
      } catch (err) { console.error('Erro ao buscar configs da loja', err); }
    };
    loadStoreData();
  }, []);

  useEffect(() => {
    if (selectedAddressIndex === 'manual' || (!user?.enderecos?.length)) {
      if (logradouro && numero && bairro && cidade) {
        setAddress(`${logradouro}, ${numero}${complemento ? ` - ${complemento}` : ''} - ${bairro}, ${cidade} - ${estado}, CEP: ${cep}`);
      } else { setAddress(''); }
    }
  }, [logradouro, numero, complemento, bairro, cidade, estado, cep, selectedAddressIndex, user]);

  useEffect(() => {
    const updateFee = async () => {
      setGeoError('');
      if (!deliveryMethod || deliveryMethod === 'pickup') { setShippingFee(0); setOutOfRange(false); setCalculatingFee(false); return; }
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
        let finalStoreCoords = storeCoords;
        if (finalStoreCoords && storeConfig) {
          const clientCoords = await fetchCoordinates(targetCep, targetRua, targetCidade);
          if (clientCoords) {
            const distanceKm = calculateDistance(finalStoreCoords.lat, finalStoreCoords.lon, clientCoords.lat, clientCoords.lon);
            if (!storeConfig?.faixas_entrega || storeConfig.faixas_entrega.length === 0) { setShippingFee(0); setOutOfRange(false); }
            else {
              const faixas = [...storeConfig.faixas_entrega].sort((a: any, b: any) => a.km_ate - b.km_ate);
              let fee = -1;
              for (const faixa of faixas) { if (distanceKm <= faixa.km_ate) { fee = faixa.valor; break; } }
              if (fee === -1) { setOutOfRange(true); setShippingFee(0); } else { setOutOfRange(false); setShippingFee(fee); }
            }
          } else { setShippingFee(0); setOutOfRange(false); }
        }
        setCalculatingFee(false);
      }
    };
    const timer = setTimeout(() => { updateFee(); }, 800);
    return () => clearTimeout(timer);
  }, [address, deliveryMethod, selectedAddressIndex, user, storeCoords, storeConfig]);

  const handleCheckout = async () => {
    if (!deliveryMethod) { showToast('Selecione Entrega ou Retirada.', 'error'); return; }
    if (deliveryMethod === 'delivery' && !address) { showToast('Informe o endereco de entrega!', 'error'); return; }
    if (saldoAposResgate < 0) { showToast('Saldo insuficiente!', 'error'); return; }

    onStartCheckout({
      storeConfig,
      finalShippingFee,
      deliveryMethod,
      address,
      subtotal,
      appliedCoupon
    });
  };

  if (!isOpen) return null;

  return (
    <>
      {!inlineMode && <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />}
      <div className={cn(
        inlineMode
          ? 'relative flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.45)]'
          : 'fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden bg-white shadow-2xl animate-in slide-in-from-right duration-200 sm:w-[348px]'
      )}>
        {orderSuccess ? (
          <OrderSuccess orderId={orderId} onTrackOrder={() => { setOrderSuccess(false); onClose(); }} />
        ) : (
          <>
            <div className="sticky top-0 z-30 flex items-start justify-between border-b border-slate-200/70 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="space-y-1">
                <span className="block text-[0.72rem] font-bold uppercase tracking-[0.28em] text-slate-400">Resumo do pedido</span>
                <span className="block text-xl font-extrabold tracking-tight text-slate-900">Sua sacola</span>
              </div>
              <button onClick={onClearCart} className="pt-1 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400 transition-colors hover:text-red-500">
                Limpar
              </button>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden bg-white">
              <div
                onClick={(e) => { e.stopPropagation(); setIsMethodSelectorOpen(!isMethodSelectorOpen); }}
                className="relative flex min-h-[78px] cursor-pointer items-center border-b border-dashed border-slate-200 px-5 py-4 transition-colors hover:bg-slate-50"
              >
                <div className="flex flex-1 items-center space-x-3 truncate">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                    {deliveryMethod === 'pickup' ? <Store className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                  </div>
                  <div className="flex flex-1 flex-col truncate text-slate-700">
                    <span className="text-[14px] font-bold text-slate-800">
                      {deliveryMethod === 'delivery' ? 'Entrega' : (deliveryMethod === 'pickup' ? 'Retirar no local' : 'Calcular taxa e tempo de entrega')}
                    </span>
                    <span className="truncate text-[12px] font-medium text-slate-400">
                      {deliveryMethod === 'delivery'
                        ? (address || 'Onde quer receber?')
                        : (deliveryMethod === 'pickup' ? (storeConfig?.localidade || 'Retirada no local') : 'Escolha como receber')}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-emerald-600" />

                {isMethodSelectorOpen && (
                  <div className="absolute left-3 right-3 top-3 z-50 animate-in zoom-in-95 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl duration-200">
                    <h4 className="mb-4 text-[15px] font-bold text-slate-800">Como voce quer receber o pedido?</h4>
                    <div className="space-y-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsMethodSelectorOpen(false); setIsDeliveryModalOpen(true); }}
                        className="group flex w-full items-center rounded-xl p-2.5 text-left transition-colors hover:bg-slate-50"
                      >
                        <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 transition-colors group-hover:bg-white">
                          <Truck className="h-5 w-5 text-slate-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[14px] font-bold text-slate-800">Entrega</span>
                          <span className="whitespace-nowrap text-[12px] font-medium text-slate-400">A gente leva ate voce</span>
                        </div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeliveryMethod('pickup'); setIsMethodSelectorOpen(false); }}
                        className="group flex w-full items-center rounded-xl p-2.5 text-left transition-colors hover:bg-slate-50"
                      >
                        <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 transition-colors group-hover:bg-white">
                          <Store className="h-5 w-5 text-slate-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[14px] font-bold text-slate-800">Retirada</span>
                          <span className="whitespace-nowrap text-[12px] font-medium text-slate-400">Voce retira no local</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-b border-dashed border-slate-200 px-5 py-3 text-center text-[12px] font-medium text-slate-500">
                {storeConfig?.frete_gratis_acima_de > 0 && subtotal >= storeConfig.frete_gratis_acima_de ? (
                  <span className="font-bold text-emerald-600">Entrega gratis liberada!</span>
                ) : (
                  storeConfig?.frete_gratis_acima_de > 0 ? (
                    <>
                      <span className="font-bold uppercase tracking-tight text-emerald-600">Entrega gratis</span> em pedidos a partir de R$ {storeConfig.frete_gratis_acima_de.toFixed(2).replace('.', ',')}
                    </>
                  ) : (
                    <span className="italic text-slate-400">Consulte taxas de entrega</span>
                  )
                )}
              </div>

              <div className="flex flex-1 flex-col overflow-auto bg-slate-50/70">
                {cart.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center px-8 py-14 text-center">
                    <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_40px_-30px_rgba(15,23,42,0.5)]">
                      <ShoppingBag className="h-12 w-12 text-slate-300" />
                    </div>
                    <p className="text-base font-extrabold tracking-tight text-slate-500">Sacola vazia</p>
                    <p className="mt-2 max-w-[220px] text-[13px] leading-5 text-slate-400">
                      Adicione produtos para ver o resumo do pedido, cupom e total final aqui.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 p-3">
                    {cart.map((item, idx) => (
                      <div key={idx} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_16px_36px_-32px_rgba(15,23,42,0.55)]">
                        <div className="flex gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="shrink-0 text-[13px] font-extrabold text-slate-900">{item.quantidade}x</span>
                                  <span className="truncate text-[14px] font-bold text-slate-800">{item.nome}</span>
                                </div>
                                <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                                  Item do pedido
                                </span>
                              </div>
                              <span className="shrink-0 text-[14px] font-extrabold text-slate-900">
                                R$ {item.subtotal.toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                            {!!item.opcoes_escolhidas?.length && (
                              <div className="mt-2 line-clamp-2 text-[11px] italic text-slate-400">
                                {item.opcoes_escolhidas.map((op, i) => (
                                  <span key={i}>- {op.opcao} </span>
                                ))}
                              </div>
                            )}
                            <div className="mt-4 flex gap-5">
                              <button onClick={() => onEditItem?.(idx)} className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600 transition-opacity hover:opacity-80">
                                Editar
                              </button>
                              <button onClick={() => onUpdateQuantity(idx, -item.quantidade)} className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300 transition-colors hover:text-red-500">
                                Remover
                              </button>
                            </div>
                          </div>
                          {item.imagem && (
                            <div className="h-[74px] w-[74px] shrink-0 overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50 shadow-sm">
                              <img src={item.imagem} alt={item.nome} className="h-full w-full object-cover" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-shrink-0 border-t border-slate-200 bg-white">
                {cart.length > 0 && (
                  <div className="space-y-2 px-5 py-4 text-slate-700">
                    <div className="flex items-center justify-between text-[13px] font-medium text-slate-500">
                      <span>Subtotal</span><span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px] font-medium text-slate-500">
                      <span>Taxa de entrega</span>
                      <span className={finalShippingFee === 0 ? 'font-bold text-emerald-600' : ''}>
                        {deliveryMethod === 'pickup' ? 'Gratis' : (calculatingFee ? '...' : (finalShippingFee === 0 ? 'Gratis' : `R$ ${finalShippingFee.toFixed(2).replace('.', ',')}`))}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3 text-base font-extrabold text-slate-900">
                      <span>Total</span><span>R$ {total.toFixed(2).replace('.', ',')}</span>
                    </div>
                    {isBelowMinOrder && (
                      <p className="text-[12px] font-medium text-amber-600">
                        Faltam R$ {faltaParaMinimo.toFixed(2).replace('.', ',')} para atingir o pedido minimo.
                      </p>
                    )}
                  </div>
                )}

                <div className="w-full border-t border-dashed border-slate-200"></div>
                <div onClick={() => setIsCouponModalOpen(true)} className="cursor-pointer transition-colors hover:bg-slate-50">
                  <div className="flex items-center space-x-4 px-5 py-4">
                    <div className="flex flex-1 items-center space-x-4 truncate">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
                        <Tag className="h-5 w-5 text-slate-500" />
                      </div>
                      <div className="flex flex-col truncate">
                        <div className="flex items-center space-x-2">
                          <span className="truncate text-[14px] font-bold text-slate-800">
                            {appliedCoupon ? `Cupom ${appliedCoupon.codigo} aplicado` : 'Tem um cupom?'}
                          </span>
                          {!appliedCoupon && storeConfig?.cupom_global_ativo && (
                            <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">1</span>
                          )}
                        </div>
                        <span className="truncate text-[12px] font-medium text-slate-400">
                          {appliedCoupon ? 'Cupom aplicado com sucesso' : 'Clique e insira o codigo'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>

                <div className="w-full border-t border-dashed border-slate-200"></div>
                <div className="flex w-full bg-white p-4">
                  <button
                    onClick={handleCheckout}
                    disabled={cart.length === 0 || isCheckingOut || !deliveryMethod || (deliveryMethod === 'delivery' && !address) || isBelowMinOrder}
                    className={cn(
                      'flex h-14 w-full items-center justify-center rounded-2xl text-[15px] font-extrabold tracking-tight transition-all active:scale-[0.98]',
                      (cart.length === 0 || isBelowMinOrder || !deliveryMethod || (deliveryMethod === 'delivery' && !address))
                        ? 'cursor-not-allowed bg-slate-300 text-white'
                        : 'bg-emerald-600 text-white shadow-[0_20px_40px_-22px_rgba(5,150,105,0.75)] hover:opacity-90'
                    )}
                  >
                    {isCheckingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : cart.length === 0 ? 'Sacola vazia' : 'Continuar pedido'}
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
      <CouponModal isOpen={isCouponModalOpen} onClose={() => setIsCouponModalOpen(false)} onApply={handleApplyCoupon} />
    </>
  );
}
