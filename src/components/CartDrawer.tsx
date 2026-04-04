// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { X, Minus, Plus, MapPin, CreditCard, Store, CheckCircle, ShoppingBag, QrCode, Banknote, ChevronRight, Map, Loader2, UserPlus, Truck, Ticket, Star, Tag, Gift } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useToast } from './Toast';
import OrderSuccess from './OrderSuccess';
import DeliveryAddressModal from './DeliveryAddressModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  onNavigateToOrders?: () => void;
}

export default function CartDrawer({ isOpen, inlineMode = false, onClose, cart, onUpdateQuantity, onToggleRedemption, onClearCart, user, onNavigateToOrders }: CartDrawerProps) {
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup' | null>(null);
  const [isAddressListOpen, setIsAddressListOpen] = useState(false);
  const [selectedAddressIndex, setSelectedAddressIndex] = useState<number | 'manual' | ''>('');
  const [couponCode, setCouponCode] = useState('');
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
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [isDeliveryDropdownOpen, setIsDeliveryDropdownOpen] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState<{ type: 'delivery' | 'pickup' | null, address: string, data: any }>({ type: null, address: '', data: null });
  const [saveNewAddress, setSaveNewAddress] = useState(false);
  const [addressTitle, setAddressTitle] = useState('🏠 Outro');
  const { showToast } = useToast();

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

  const handleApplyCoupon = async () => {
    if (!couponCode) return;
    setIsValidatingCoupon(true);
    try {
      const token = localStorage.getItem('stitch_token');
      const res = await fetch('/api/cupons/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ codigo: couponCode.toUpperCase(), subtotal })
      });
      const data = await res.json();
      if (data.sucesso) {
        setAppliedCoupon(data.cupom);
        showToast(`Cupom ${data.cupom.codigo} aplicado!`, 'success');
      } else {
        showToast(data.erro || 'Cupom inválido', 'error');
        setAppliedCoupon(null);
      }
    } catch (e) { showToast('Erro ao validar cupom', 'error'); } 
    finally { setIsValidatingCoupon(false); }
  };

  // ========== CÁLCULOS FINANCEIROS ==========
  const subtotal = cart.reduce((acc, item) => acc + (item.is_resgate ? 0 : item.subtotal), 0);
  const totalPontosNecessarios = cart.reduce((acc, item) => acc + (item.is_resgate ? (item.pontos_resgate || 0) * item.quantidade : 0), 0);
  
  const isBelowMinOrder = storeConfig?.pedido_minimo > 0 && subtotal < storeConfig.pedido_minimo && subtotal > 0;
  const faltaParaMinimo = isBelowMinOrder ? (storeConfig.pedido_minimo - subtotal) : 0;
  const hasFreeShipping = storeConfig?.frete_gratis_acima_de > 0 && subtotal >= storeConfig.frete_gratis_acima_de && deliveryMethod === 'delivery';
  const finalShippingFee = hasFreeShipping ? 0 : shippingFee;
  const couponDiscountValue = appliedCoupon ? (appliedCoupon.tipo === 'fixo' ? appliedCoupon.valor : (subtotal * (appliedCoupon.valor / 100))) : 0;
  const total = Math.max(0, subtotal + finalShippingFee - couponDiscountValue);
  const saldoAposResgate = (user?.pontos || 0) - totalPontosNecessarios;

  useEffect(() => {
    if (storeConfig) {
      if (storeConfig.pagamento_pix === false && paymentMethod === 'pix') {
         if (storeConfig.pagamento_cartao !== false) setPaymentMethod('cartao');
         else if (storeConfig.pagamento_dinheiro !== false) setPaymentMethod('dinheiro');
      }
    }
  }, [storeConfig, paymentMethod]);

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
      let currentAddress = address;
      let targetCep = cep;
      let targetRua = logradouro;
      let targetCidade = cidade;
      if (user && user.enderecos && user.enderecos.length > 0 && selectedAddressIndex !== '' && selectedAddressIndex !== 'manual') {
        const end = user.enderecos[selectedAddressIndex as number];
        currentAddress = `${end.logradouro}, ${end.numero} - ${end.bairro}, ${end.cidade}`;
        targetCep = end.cep;
        targetRua = end.logradouro;
        targetCidade = end.cidade;
      }
      if (currentAddress.length > 5) {
        setCalculatingFee(true);
        let finalStoreCoords = storeCoords;
        if (!finalStoreCoords && storeConfig) {
           const coords = await fetchCoordinates(storeConfig.cep_loja, storeConfig.rua_loja, storeConfig.cidade_loja);
           if (coords) { setStoreCoords(coords); finalStoreCoords = coords; }
        }
        if (!finalStoreCoords) { setGeoError('Erro: Mapa da loja ainda não carregou.'); setShippingFee(0); setCalculatingFee(false); return; }
        const clientCoords = await fetchCoordinates(targetCep, targetRua, targetCidade);
        if (clientCoords && finalStoreCoords) {
          const distanceKm = calculateDistance(finalStoreCoords.lat, finalStoreCoords.lon, clientCoords.lat, clientCoords.lon);
          if (!storeConfig?.faixas_entrega || storeConfig.faixas_entrega.length === 0) { setShippingFee(0); setOutOfRange(false); } 
          else {
            const faixas = [...storeConfig.faixas_entrega].sort((a: any, b: any) => a.km_ate - b.km_ate);
            let fee = -1;
            for (const faixa of faixas) { if (distanceKm <= faixa.km_ate) { fee = faixa.valor; break; } }
            if (fee === -1) { setOutOfRange(true); setShippingFee(0); } else { setOutOfRange(false); setShippingFee(fee); }
          }
        } else { setGeoError('Endereço não localizado no mapa.'); setShippingFee(0); setOutOfRange(false); }
        if (deliveryMethod === 'delivery' && !deliveryInfo.type && currentAddress) { setDeliveryInfo({ type: 'delivery', address: currentAddress, data: null }); }
        setCalculatingFee(false);
      } else { setShippingFee(0); setOutOfRange(false); setCalculatingFee(false); }
    };
    const timer = setTimeout(() => { updateFee(); }, 800);
    return () => clearTimeout(timer);
  }, [address, deliveryMethod, selectedAddressIndex, user, storeCoords, storeConfig, cep, logradouro, cidade]);

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 8) val = val.slice(0, 8);
    let formattedCep = val;
    if (val.length > 5) formattedCep = val.slice(0, 5) + '-' + val.slice(5);
    setCep(formattedCep);
    if (val.length === 8) {
      setIsLoadingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${val}/json/`);
        const data = await res.json();
        if (!data.erro) { setLogradouro(data.logradouro); setBairro(data.bairro); setCidade(data.localidade); setEstado(data.uf); } 
        else { showToast('CEP não encontrado', 'error'); }
      } catch (error) { showToast('Erro ao buscar CEP', 'error'); } 
      finally { setIsLoadingCep(false); }
    }
  };

  const handleCheckout = async () => {
    if (!deliveryMethod) { showToast("Selecione Entrega ou Retirada.", "error"); return; }
    if (deliveryMethod === 'delivery' && !address) { showToast("Informe o endereço de entrega!", "error"); return; }
    if (!user) { showToast("Faça login para finalizar o pedido!", "error"); return; }
    if (saldoAposResgate < 0) { showToast(`Saldo insuficiente! Você precisa de ${totalPontosNecessarios} pontos, mas tem apenas ${user.pontos}.`, "error"); return; }
    
    let finalAddress = deliveryMethod === 'delivery' ? address : 'Retirada na Loja';
    if (deliveryMethod === 'delivery' && (outOfRange || geoError !== '' || calculatingFee)) { showToast(geoError || "Fora da região de entrega.", "error"); return; }
    
    setIsCheckingOut(true);
    try {
      const token = localStorage.getItem('stitch_token') || '';
      const body = {
        cliente: { nome: user.nome, telefone: user.telefone, endereco: finalAddress },
        itens: cart.map(i => ({
          ...i,
          preco_final: i.is_resgate ? 0 : i.preco_unitario,
          is_resgate: i.is_resgate || false
        })),
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
        if (saveNewAddress && deliveryMethod === 'delivery' && selectedAddressIndex === 'manual') {
          try {
            await fetch('/api/auth/enderecos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ titulo: addressTitle, logradouro, numero, complemento, bairro, cidade, estado, cep })
            });
          } catch (e) {}
        }
        showToast('✅ Pedido realizado com sucesso!', 'success');
        setOrderId(data.pedidoId || 'SUCCESS');
        setOrderSuccess(true);
        onClearCart();
      } else { showToast(data.erro || 'Erro ao processar pedido', 'error'); }
    } catch (error) { showToast('Erro de conexão', 'error'); } 
    finally { setIsCheckingOut(false); }
  };

  if (!isOpen) return null;

  const renderSelectedAddress = () => {
    if (selectedAddressIndex === 'manual' || !user?.enderecos?.length) {
      return (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-full text-emerald-600 dark:text-emerald-400"><Map className="w-5 h-5" /></div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 dark:text-slate-100">Endereço Informado</p>
            <p className="text-sm text-gray-500 dark:text-slate-400 truncate">{address || 'Preencha abaixo...'}</p>
          </div>
        </div>
      );
    }
    const end = user.enderecos[selectedAddressIndex as number];
    return end ? (
      <div className="flex items-center gap-3">
        <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-full text-emerald-600 dark:text-emerald-400"><MapPin className="w-5 h-5" /></div>
        <div className="flex-1">
          <p className="font-bold text-gray-900 dark:text-slate-100">{end.titulo || 'Endereço'}</p>
          <p className="text-sm text-gray-500 dark:text-slate-400 truncate">{end.logradouro}, {end.numero}</p>
        </div>
      </div>
    ) : null;
  };

  return (
    <>
      {!inlineMode && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity" onClick={onClose} />}
      <div className={cn(
        inlineMode ? "w-full h-full flex flex-col relative" : "fixed inset-y-0 right-0 w-full sm:w-[400px] md:w-[360px] bg-gray-50 dark:bg-slate-900 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300"
      )}>
        {orderSuccess ? (
          <OrderSuccess orderId={orderId} onTrackOrder={() => { setOrderSuccess(false); onClose(); }} />
        ) : (
          <>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-800 sticky top-0 z-10 transition-colors">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tighter italic">Minha Sacola</h2>
              {!inlineMode && <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500"><X className="w-5 h-5" /></button>}
            </div>

            <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-5">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 rounded-[2rem] border border-gray-100 dark:border-slate-700 shadow-sm transition-colors">
                  <ShoppingBag className="w-16 h-16 mb-4 text-gray-200 dark:text-slate-700" />
                  <p className="text-gray-500 dark:text-slate-400 font-bold uppercase text-xs tracking-widest italic">Sua sacola está vazia</p>
                </div>
              ) : (
                <>
                  <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden transition-colors">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50">
                      <h3 className="font-black text-gray-900 dark:text-slate-100 uppercase text-[11px] tracking-widest italic">Itens do Pedido</h3>
                      <button onClick={onClearCart} className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest transition-colors">Limpar Tudo</button>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
                      {cart.map((item, idx) => (
                        <div key={idx} className="p-6 group hover:bg-gray-50/30 dark:hover:bg-slate-700/20 transition-all duration-300">
                          <div className="flex justify-between items-start gap-4 mb-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-black text-gray-900 dark:text-slate-100 text-sm truncate uppercase tracking-tight italic">{item.nome}</h4>
                              <div className="space-y-1 mt-1">
                                {item.opcoes_escolhidas?.map((op: any, i: number) => (
                                  <p key={i} className="text-[10px] text-gray-500 dark:text-slate-500 font-bold italic">• {op.quantidade}x {op.opcao}</p>
                                ))}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              {item.is_resgate ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest italic mb-1">Resgatado</span>
                                  <p className="font-black text-purple-600 text-sm italic">{item.pontos_resgate * item.quantidade} pts</p>
                                </div>
                              ) : (
                                <p className="font-black text-gray-900 dark:text-slate-100 text-sm italic">R$ {item.subtotal.toFixed(2).replace('.', ',')}</p>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                             {/* Quantidade */}
                             <div className="flex items-center bg-gray-100 dark:bg-slate-900/50 p-1 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-inner">
                               <button onClick={() => onUpdateQuantity(idx, -1)} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-red-500 transition-colors"><Minus className="w-4 h-4" /></button>
                               <span className="w-8 text-center font-black text-gray-900 dark:text-white text-sm">{item.quantidade}</span>
                               <button onClick={() => onUpdateQuantity(idx, 1)} className="w-8 h-8 flex items-center justify-center text-emerald-600 hover:scale-125 transition-transform"><Plus className="w-4 h-4" /></button>
                             </div>

                             {/* Botões de Ação */}
                             <div className="flex items-center gap-3">
                                {item.pode_resgatar && onToggleRedemption && (
                                   <button 
                                     onClick={() => onToggleRedemption(idx)}
                                     className={cn(
                                       "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                       item.is_resgate 
                                          ? "bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-600/20" 
                                          : "bg-purple-50 border-purple-100 text-purple-600 dark:bg-purple-900/20 dark:border-purple-800"
                                     )}
                                   >
                                      <Gift className={cn("w-3.5 h-3.5", item.is_resgate ? "fill-white" : "fill-purple-600")} />
                                      {item.is_resgate ? 'Remover Resgate' : 'Resgatar Itens'}
                                   </button>
                                )}
                                <button onClick={() => onUpdateQuantity(idx, -item.quantidade)} className="text-[10px] font-black text-red-300 hover:text-red-500 uppercase tracking-widest transition-colors">Remover</button>
                             </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ALERTA DE PONTOS (Caso selecione resgate) */}
                  {totalPontosNecessarios > 0 && (
                     <div className={cn(
                       "p-5 rounded-[2rem] border-2 transition-all animate-in slide-in-from-bottom-2 duration-500",
                       saldoAposResgate >= 0 ? "bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800" : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"
                     )}>
                        <div className="flex items-center justify-between mb-2">
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-purple-600 text-white rounded-xl shadow-lg">
                                 <Gift className="w-5 h-5 fill-current" />
                              </div>
                              <h4 className="text-xs font-black text-purple-900 dark:text-purple-400 uppercase tracking-widest italic">Confirmação de Resgate</h4>
                           </div>
                           <div className="text-right">
                              <p className="text-[10px] font-black text-purple-600 uppercase tracking-tighter">Custo Total</p>
                              <p className="font-black text-purple-950 dark:text-white text-lg italic">{totalPontosNecessarios} PTS</p>
                           </div>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-purple-100 dark:border-purple-900/50">
                           <span className="text-[10px] font-bold text-purple-800/60 dark:text-purple-400/60 uppercase tracking-widest">Saldo após pedido:</span>
                           <span className={cn("font-black italic text-sm", saldoAposResgate < 0 ? "text-red-600" : "text-purple-600")}>
                             {saldoAposResgate < 0 ? "Saldo Insuficiente!" : `${saldoAposResgate} pts`}
                           </span>
                        </div>
                     </div>
                  )}

                  {/* BARRA DE PROGRESSO FRETE GRÁTIS */}
                  {storeConfig?.frete_gratis_acima_de > 0 && deliveryMethod === 'delivery' && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 p-6 rounded-[2rem] border border-emerald-100 dark:border-emerald-500/20 space-y-4 shadow-sm">
                       <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                           <div className="bg-emerald-500 p-2 rounded-full text-white shadow-lg"><Truck className="w-4 h-4" /></div>
                           <p className="text-[11px] font-black text-emerald-900 dark:text-emerald-400 uppercase tracking-widest italic leading-tight">
                             {subtotal >= storeConfig.frete_gratis_acima_de ? 'Frete Grátis Liberado!' : `Faltam R$ ${(storeConfig.frete_gratis_acima_de - subtotal).toFixed(2).replace('.', ',')} para Frete Grátis`}
                           </p>
                         </div>
                       </div>
                       <div className="h-2.5 w-full bg-emerald-200 dark:bg-emerald-900/50 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                            style={{ width: `${Math.min(100, (subtotal / storeConfig.frete_gratis_acima_de) * 100)}%` }}
                          />
                       </div>
                    </div>
                  )}

                  {/* ENDEREÇO / RETIRADA */}
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
                    <h3 className="font-black text-gray-900 dark:text-slate-100 mb-5 text-[11px] uppercase tracking-[0.15em] italic">Método de Entrega</h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <button onClick={() => setDeliveryMethod('delivery')} className={cn("flex flex-col items-center justify-center p-5 rounded-[2rem] border-2 transition-all duration-300 group", deliveryMethod === 'delivery' ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 shadow-lg" : "border-gray-50 dark:border-slate-700 text-gray-400 opacity-60")}>
                         <Truck className="w-7 h-7 mb-2" />
                         <span className="font-black text-[10px] uppercase tracking-widest italic">Entrega</span>
                      </button>
                      <button onClick={() => setDeliveryMethod('pickup')} className={cn("flex flex-col items-center justify-center p-5 rounded-[2rem] border-2 transition-all duration-300 group", deliveryMethod === 'pickup' ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 shadow-lg" : "border-gray-50 dark:border-slate-700 text-gray-400 opacity-60")}>
                         <Store className="w-7 h-7 mb-2" />
                         <span className="font-black text-[10px] uppercase tracking-widest italic">Retirada</span>
                      </button>
                    </div>
                    
                    {deliveryMethod === 'delivery' && (
                       <div className="border border-gray-50 dark:border-slate-700 rounded-2xl p-4 transition-colors">
                          <div className="flex items-center justify-between gap-3">
                             {renderSelectedAddress()}
                             {user?.enderecos?.length > 0 && <button onClick={() => setIsAddressListOpen(!isAddressListOpen)} className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 rounded-xl">Mudar</button>}
                          </div>
                          {isAddressListOpen && (
                             <div className="mt-4 pt-4 border-t border-gray-50 dark:border-slate-700 space-y-2 animate-in fade-in duration-300">
                                {user.enderecos.map((end: any, idx: number) => (
                                  <button key={idx} onClick={() => { setSelectedAddressIndex(idx); setIsAddressListOpen(false); }} className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-100 dark:border-slate-700 text-left hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"><div className="text-xs font-bold text-gray-900 dark:text-slate-100">{end.titulo}</div>{selectedAddressIndex === idx && <CheckCircle className="w-4 h-4 text-emerald-500" />}</button>
                                ))}
                                <button onClick={() => { setSelectedAddressIndex('manual'); setIsAddressListOpen(false); }} className="w-full p-4 rounded-xl border border-dashed border-gray-200 dark:border-slate-700 text-left text-xs font-bold text-gray-400 hover:text-emerald-600 transition-colors">Usar outro endereço...</button>
                             </div>
                          )}
                       </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-slate-700">
                    <h3 className="font-black text-gray-900 dark:text-slate-100 mb-5 text-[11px] uppercase tracking-[0.15em] italic">Pagamento</h3>
                    <div className="grid grid-cols-2 gap-3">
                       <button onClick={() => setPaymentMethod('pix')} className={cn("flex items-center gap-3 p-4 rounded-2xl border-2 transition-all", paymentMethod === 'pix' ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700" : "border-gray-50 dark:border-slate-700 text-gray-400")}>
                          <QrCode className="w-5 h-5 flex-shrink-0" /><span className="font-black text-[10px] uppercase tracking-widest italic">PIX</span>
                       </button>
                       <button onClick={() => setPaymentMethod('cartao')} className={cn("flex items-center gap-3 p-4 rounded-2xl border-2 transition-all", paymentMethod === 'cartao' ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700" : "border-gray-50 dark:border-slate-700 text-gray-400")}>
                          <CreditCard className="w-5 h-5 flex-shrink-0" /><span className="font-black text-[10px] uppercase tracking-widest italic">Cartão</span>
                       </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-8 bg-white dark:bg-slate-800 border-t border-gray-50 dark:border-slate-800 shadow-[0_-10px_40px_rgba(0,0,0,0.06)] relative z-20 transition-colors">
                <div className="space-y-3 mb-8">
                  <div className="flex justify-between items-center text-[11px] font-black text-gray-400 uppercase tracking-widest italic opacity-60"><span>Subtotal (Itens Pagos)</span><span>R$ {subtotal.toFixed(2).replace('.', ',')}</span></div>
                  
                  {appliedCoupon && (
                    <div className="flex justify-between text-[11px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 p-4 rounded-2xl items-center border border-emerald-100 dark:border-emerald-500/20">
                      <span className="flex items-center gap-2 uppercase tracking-widest italic"><Tag className="w-3.5 h-3.5" /> Cupom {appliedCoupon.codigo}</span>
                      <span>- R$ {couponDiscountValue.toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}

                  {totalPontosNecessarios > 0 && (
                    <div className="flex justify-between text-[11px] font-black text-purple-600 bg-purple-50 dark:bg-purple-950/20 p-4 rounded-2xl items-center border border-purple-100 dark:border-purple-800/30">
                      <span className="flex items-center gap-2 uppercase tracking-widest italic"><Gift className="w-3.5 h-3.5 fill-current" /> Itens Resgatados</span>
                      <span>{totalPontosNecessarios} PTS</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[11px] font-black text-gray-400 uppercase tracking-widest italic opacity-60">
                    <span>Taxa de Entrega</span>
                    <span className="text-gray-900 dark:text-white">{deliveryMethod === 'pickup' ? 'GRÁTIS' : (calculatingFee ? '...' : (finalShippingFee === 0 ? 'GRÁTIS' : `R$ ${finalShippingFee.toFixed(2).replace('.', ',')}`))}</span>
                  </div>

                  <div className="flex justify-between items-center text-[26px] font-black text-gray-900 dark:text-white pt-6 border-t border-gray-50 dark:border-slate-800 transition-all mt-4">
                    <span className="uppercase tracking-tighter italic">Total</span>
                    <span className="text-emerald-600 dark:text-emerald-400 drop-shadow-sm">R$ {total.toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handleCheckout}
                    disabled={isCheckingOut || !deliveryMethod || (deliveryMethod === 'delivery' && (!address || outOfRange || geoError !== '')) || isBelowMinOrder || saldoAposResgate < 0}
                    className={cn(
                      "w-full font-black py-6 rounded-[2.2rem] shadow-xl transition-all active:scale-[0.97] uppercase tracking-widest text-sm flex items-center justify-center gap-3",
                      (isBelowMinOrder || saldoAposResgate < 0 || !deliveryMethod || (deliveryMethod === 'delivery' && !address)) 
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed" 
                        : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 hover:shadow-emerald-600/40"
                    )}
                  >
                    {isCheckingOut ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Processando Sabores...</span>
                      </>
                    ) : !deliveryMethod ? (
                      "Selecione o Método"
                    ) : (deliveryMethod === 'delivery' && !address) ? (
                      "Informe o Endereço"
                    ) : isBelowMinOrder ? (
                      `Mínimo R$ ${storeConfig?.pedido_minimo?.toFixed(2)}`
                    ) : saldoAposResgate < 0 ? (
                      "Pontos Insuficientes"
                    ) : (
                      <>
                        <ShoppingBag className="w-5 h-5" />
                        <span>Finalizar & Pedir!</span>
                      </>
                    )}
                  </button>
                  
                  {isBelowMinOrder && (
                     <p className="text-[9px] text-center font-black text-red-500 uppercase tracking-widest animate-pulse italic">
                        Adicione mais R$ {faltaParaMinimo.toFixed(2).replace('.', ',')} para pedidos
                     </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <DeliveryAddressModal isOpen={isDeliveryModalOpen} onClose={() => setIsDeliveryModalOpen(false)} storeInfo={storeConfig} onConfirmDelivery={handleDeliveryConfirm} onConfirmPickup={handlePickupConfirm} user={user} />
    </>
  );
}