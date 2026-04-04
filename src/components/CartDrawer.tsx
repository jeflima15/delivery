import React, { useState, useEffect } from 'react';
import { X, Minus, Plus, MapPin, CreditCard, Store, CheckCircle, ShoppingBag, QrCode, Banknote, ChevronRight, Map, Loader2, UserPlus, Truck, Ticket, Star, Tag, Gift } from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from './Toast';
import OrderSuccess from './OrderSuccess';
import DeliveryAddressModal from './DeliveryAddressModal';
import { CouponModal } from './CouponModal';

// Fórmula de Haversine para calcular distância real em KM
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
}

export default function CartDrawer({ isOpen, inlineMode = false, onClose, cart, onUpdateQuantity, onToggleRedemption, onClearCart, user, onEditItem, onNavigateToOrders }: CartDrawerProps) {
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
  const [addressTitle, setAddressTitle] = useState('🏠 Outro');
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
    setDeliveryInfo({ type: 'pickup', address: storeAddr || 'Endereço da loja', data: null });
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
    if (!deliveryMethod) { showToast("Selecione Entrega ou Retirada.", "error"); return; }
    if (deliveryMethod === 'delivery' && !address) { showToast("Informe o endereço de entrega!", "error"); return; }
    if (!user) { showToast("Faça login para finalizar o pedido!", "error"); return; }
    if (saldoAposResgate < 0) { showToast(`Saldo insuficiente!`, "error"); return; }
    
    setIsCheckingOut(true);
    try {
      const token = localStorage.getItem('stitch_token') || '';
      const body = {
        cliente: { nome: user.nome, telefone: user.telefone, endereco: deliveryMethod === 'delivery' ? address : 'Retirada na Loja' },
        itens: cart.map(i => ({ ...i, preco_final: i.is_resgate ? 0 : i.preco_unitario, is_resgate: i.is_resgate || false })),
        metodo_pagamento: paymentMethod, 
        frete: finalShippingFee, 
        tipo_entrega: deliveryMethod, 
        observacoes: observacoes,
        troco_para: paymentMethod === 'dinheiro' && troco ? parseFloat(troco.toString().replace(',','.')) || 0 : 0,
        cupom_codigo: appliedCoupon?.codigo || '', 
        pontos_resgate_total: totalPontosNecessarios
      };
      const res = await fetch('/api/pedidos', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.sucesso) {
        showToast('✅ Pedido realizado com sucesso!', 'success');
        setOrderId(data.pedidoId || 'SUCCESS');
        setOrderSuccess(true);
        onClearCart();
      } else { showToast(data.erro || 'Erro ao processar pedido', 'error'); }
    } catch (error) { showToast('Erro de conexão', 'error'); } 
    finally { setIsCheckingOut(false); }
  };

  if (!isOpen) return null;

  return (
    <>
      {!inlineMode && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity" onClick={onClose} />}
      <div className={cn(
        inlineMode ? "w-full h-full flex flex-col relative" : "fixed inset-y-0 right-0 w-full sm:w-[320px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200"
      )}>
        {orderSuccess ? (
          <OrderSuccess orderId={orderId} onTrackOrder={() => { setOrderSuccess(false); onClose(); }} />
        ) : (
          <>
            <div className="z-30 flex items-center justify-between flex-shrink-0 px-4 py-3 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-800 sticky top-0">
               <span className="font-medium text-gray-700 dark:text-slate-200">Sua sacola</span>
               <button onClick={onClearCart} className="text-xs font-medium text-gray-500 hover:text-red-500 uppercase tracking-widest transition-colors">Limpar</button>
            </div>

            <div className="flex flex-col flex-1 bg-white dark:bg-slate-900 overflow-hidden">
               {/* CALCULAR TAXA ROW */}
               <div onClick={(e) => { e.stopPropagation(); setIsMethodSelectorOpen(!isMethodSelectorOpen); }} className="relative flex items-center p-3 space-x-2 min-h-14 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 border-b border-dashed border-gray-200 dark:border-slate-700">
                  <div className="flex items-center flex-1 space-x-3 truncate">
                     {deliveryMethod === 'pickup' ? <Store className="w-6 h-6 text-gray-400" /> : <MapPin className="w-6 h-6 text-gray-400" />}
                     <div className="flex flex-col flex-1 text-gray-700 dark:text-slate-300 truncate">
                        <span className="font-bold text-gray-700 dark:text-white text-[14px]">
                           {deliveryMethod === 'delivery' ? 'Entrega' : (deliveryMethod === 'pickup' ? 'Retirar no local' : 'Calcular taxa e tempo de entrega')}
                        </span>
                        <span className="text-[11px] text-gray-400 truncate font-medium">
                           {deliveryMethod === 'delivery' ? (address || 'Onde quer receber?') : (deliveryMethod === 'pickup' ? (storeConfig?.localidade || 'Retirada no local') : 'Escolha como receber')}
                        </span>
                     </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#A37852]" />

                  {isMethodSelectorOpen && (
                     <div className="absolute top-2 left-2 right-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl z-50 p-4 border border-gray-100 dark:border-slate-700 animate-in zoom-in-95 duration-200">
                        <h4 className="font-bold text-gray-700 dark:text-white text-[15px] mb-4">Como você quer receber o pedido?</h4>
                        <div className="space-y-4">
                           <button onClick={(e) => { e.stopPropagation(); setIsMethodSelectorOpen(false); setIsDeliveryModalOpen(true); }} className="flex items-center w-full p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors group text-left">
                              <div className="w-10 h-10 flex items-center justify-center bg-gray-50 dark:bg-slate-900 rounded-full mr-3 group-hover:bg-white transition-colors">
                                 <Truck className="w-6 h-6 text-gray-400" />
                              </div>
                              <div className="flex flex-col">
                                 <span className="font-bold text-gray-700 dark:text-white text-[14px]">Entrega</span>
                                 <span className="text-[12px] text-gray-400 font-medium whitespace-nowrap">A gente leva até você</span>
                              </div>
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); setDeliveryMethod('pickup'); setIsMethodSelectorOpen(false); }} className="flex items-center w-full p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors group text-left">
                              <div className="w-10 h-10 flex items-center justify-center bg-gray-50 dark:bg-slate-900 rounded-full mr-3 group-hover:bg-white transition-colors">
                                 <Store className="w-6 h-6 text-gray-400" />
                              </div>
                              <div className="flex flex-col">
                                 <span className="font-bold text-gray-700 dark:text-white text-[14px]">Retirada</span>
                                 <span className="text-[12px] text-gray-400 font-medium whitespace-nowrap">Você retira no local</span>
                              </div>
                           </button>
                        </div>
                     </div>
                  )}
               </div>

               {/* FRETE GRÁTIS BANNER */}
               <div className="py-2.5 text-[12px] font-medium text-center text-gray-500 dark:text-slate-400 border-b border-dashed border-gray-200 dark:border-slate-700">
                  {storeConfig?.frete_gratis_acima_de > 0 && subtotal >= storeConfig.frete_gratis_acima_de ? (
                     <span className="font-bold text-[#A37852]">Entrega grátis liberada!</span>
                  ) : (
                     storeConfig?.frete_gratis_acima_de > 0 ? (
                        <>
                           <span className="font-bold text-[#A37852] uppercase tracking-tighter">Entrega grátis</span> em pedidos a partir de R$ {storeConfig.frete_gratis_acima_de.toFixed(2).replace('.', ',')}
                        </>
                     ) : (
                        <span className="font-medium text-gray-400 italic">Consulte taxas de entrega</span>
                     )
                  )}
               </div>

               {/* LISTAGEM OU ESTADO VAZIO */}
               <div className="flex flex-col flex-1 overflow-auto bg-gray-50/50 dark:bg-slate-900/50">
                  {cart.length === 0 ? (
                     <div className="flex flex-col items-center justify-center flex-1 p-12 text-center">
                        <ShoppingBag className="w-16 h-16 text-gray-200 mb-4" />
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest italic">Sacola vazia</p>
                     </div>
                  ) : (
                     <div className="divide-y divide-dashed divide-gray-200 dark:divide-slate-800">
                        {cart.map((item, idx) => (
                           <div key={idx} className="bg-white dark:bg-slate-800 p-4 border-b border-gray-50 dark:border-slate-800">
                              <div className="flex gap-3">
                                 <div className="flex-1 flex flex-col min-w-0">
                                    <div className="flex justify-between items-start">
                                       <div className="flex gap-1.5 items-baseline min-w-0">
                                          <span className="font-bold text-gray-950 dark:text-white shrink-0 text-[13px]">{item.quantidade}x</span>
                                          <span className="font-bold text-gray-800 dark:text-slate-100 truncate text-[13px]">{item.nome}</span>
                                       </div>
                                       <span className="font-bold text-gray-900 dark:text-white shrink-0 text-[13px] ml-2">
                                          R$ {item.subtotal.toFixed(2).replace('.', ',')}
                                       </span>
                                    </div>
                                    <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 line-clamp-1 italic font-medium">
                                       {item.opcoes_escolhidas?.map((op, i) => (
                                          <span key={i}>• {op.opcao} </span>
                                       ))}
                                    </div>
                                    <div className="flex gap-5 mt-3">
                                       <button onClick={() => onEditItem?.(idx)} className="text-[#A37852] font-black text-[11px] uppercase tracking-wider hover:opacity-80 transition-opacity">Editar</button>
                                       <button onClick={() => onUpdateQuantity(idx, -item.quantidade)} className="text-gray-300 dark:text-slate-600 font-bold text-[11px] uppercase tracking-wider hover:text-red-500 transition-colors">Remover</button>
                                    </div>
                                 </div>
                                 {item.imagem && (
                                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-gray-100 dark:border-slate-700 shadow-sm">
                                       <img src={item.imagem} alt={item.nome} className="w-full h-full object-cover" />
                                    </div>
                                 )}
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>

               {/* FOOTER & BUTTON */}
               <div className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-800 flex-shrink-0">
                  {cart.length > 0 && (
                     <div className="flex flex-col space-y-1.5 text-gray-700 dark:text-slate-300 px-4 py-3">
                        <div className="flex items-center justify-between font-light text-[13px]">
                           <span>Subtotal</span><span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div className="flex items-center justify-between font-light text-[13px]">
                           <span>Taxa de entrega</span>
                           <span className={finalShippingFee === 0 ? "text-[#A37852] font-medium" : ""}>
                              {deliveryMethod === 'pickup' ? 'Grátis' : (calculatingFee ? '...' : (finalShippingFee === 0 ? 'Grátis' : `R$ ${finalShippingFee.toFixed(2).replace('.', ',')}`))}
                           </span>
                        </div>
                        <div className="flex items-center justify-between font-bold text-base text-gray-900 dark:text-white pt-2 border-t border-gray-50 dark:border-slate-700 mt-1">
                           <span>Total</span><span>R$ {total.toFixed(2).replace('.', ',')}</span>
                        </div>
                     </div>
                  )}

                  <div className="w-full border-t border-gray-100 dark:border-slate-800 border-dashed"></div>
                  <div onClick={() => setIsCouponModalOpen(true)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                     <div className="flex items-center space-x-4 px-4 py-3">
                        <div className="flex items-center flex-1 space-x-4 truncate">
                           <Tag className="w-7 h-7 text-gray-400" />
                           <div className="flex flex-col truncate">
                              <div className="flex items-center space-x-2">
                                 <span className="font-bold text-gray-700 dark:text-slate-200 truncate text-[14px]">
                                    {appliedCoupon ? `Cupom ${appliedCoupon.codigo} aplicado` : 'Tem um cupom?'}
                                 </span>
                                 {!appliedCoupon && (
                                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">1</span>
                                 )}
                              </div>
                              <span className="font-medium text-gray-400 truncate text-[12px]">
                                 {appliedCoupon ? 'Cupom aplicado com sucesso' : 'Clique e insira o código'}
                              </span>
                           </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[#A37852]" />
                     </div>
                  </div>

                  <div className="w-full border-t border-gray-100 dark:border-slate-800 border-dashed"></div>
                  <div className="flex w-full p-3 bg-white dark:bg-slate-800">
                     <button
                        onClick={handleCheckout}
                        disabled={cart.length === 0 || isCheckingOut || !deliveryMethod || (deliveryMethod === 'delivery' && !address) || isBelowMinOrder}
                        className={cn(
                           "flex items-center justify-center w-full h-12 rounded-lg font-bold text-[15px] transition-all active:scale-[0.98]",
                           (cart.length === 0 || isBelowMinOrder || !deliveryMethod || (deliveryMethod === 'delivery' && !address)) 
                              ? "bg-[#D2B59D]/50 text-white cursor-not-allowed" 
                              : "bg-[#A37852] hover:opacity-90 shadow-md shadow-tan-900/10 text-white"
                        )}
                     >
                        {isCheckingOut ? <Loader2 className="w-5 h-5 animate-spin" /> : cart.length === 0 ? "Sacola vazia" : "Continuar pedido"}
                     </button>
                  </div>
               </div>
            </div>
          </>
        )}
      </div>

      <DeliveryAddressModal isOpen={isDeliveryModalOpen} onClose={() => setIsDeliveryModalOpen(false)} storeInfo={storeConfig} onConfirmDelivery={handleDeliveryConfirm} onConfirmPickup={handlePickupConfirm} user={user} />
      <CouponModal isOpen={isCouponModalOpen} onClose={() => setIsCouponModalOpen(false)} onApply={handleApplyCoupon} />
    </>
  );
}