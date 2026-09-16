import React, { useState, useEffect } from 'react';
import { Package, ChefHat, Bike, CheckCircle, ArrowLeft, MapPin, MessageCircle, Store, UtensilsCrossed } from 'lucide-react';
import { paymentMethodLabel } from '../lib/paymentMethods';
import { customerApi } from '../features/customer/api';
import ComboComposition from './ComboComposition';

import { formatWhatsAppLink } from '../lib/formatters';
import { formatOrderReference } from '../lib/orderReference';
import { getOrderStatusLabel } from '../lib/orderStatus';

interface OrderTrackingProps {
  orderId: string;
  trackingToken: string;
  hasPasswordAssurance: boolean;
  storePhone?: string;
  storeAddress?: string;
  onBack: () => void;
  tenantSlug?: string | null;
}

export default function OrderTracking({
  orderId,
  trackingToken,
  hasPasswordAssurance,
  storePhone,
  storeAddress,
  onBack,
  tenantSlug,
}: OrderTrackingProps) {
  const [pedido, setPedido] = useState<any>(null);
  const [authenticatedOrder, setAuthenticatedOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    let active = true;
    if (!tenantSlug || !trackingToken) {
      setLoading(false);
      return;
    }

    const fetchTracking = async () => {
      try {
        const res = await fetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/tracking/${encodeURIComponent(trackingToken)}`);
        const data = await res.json();
        if (active && data?.success && data?.tracking) {
          setPedido({
            ...data.tracking,
            _id: String(orderId || ''),
            tipo_entrega: data.tracking.deliveryType,
          });
          setLoading(false);
        } else if (active) {
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    };

    fetchTracking();

    if (hasPasswordAssurance && orderId) {
      try {
        const api = customerApi(tenantSlug);
        if (typeof api.order === 'function') {
          api.order(orderId)
            .then((data: any) => {
              if (active && data?.order) setAuthenticatedOrder(data.order);
            })
            .catch(() => {
              if (active) setAuthenticatedOrder(null);
            });
        }
      } catch {
        if (active) setAuthenticatedOrder(null);
      }
    }

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchTracking();
      }
    }, 8000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [hasPasswordAssurance, orderId, tenantSlug, trackingToken]);

  if (loading) return <div className="p-10 text-center font-medium text-gray-500">Carregando rastreio do pedido...</div>;
  if (!pedido) return (
    <div className="p-10 text-center space-y-3">
      <p className="text-gray-600 font-medium">Pedido não encontrado ou link expirado.</p>
      <button onClick={onBack} className="mt-2 inline-flex items-center gap-1.5 store-text-primary font-bold hover:underline">
        <ArrowLeft className="w-4 h-4" /> Voltar ao Cardápio
      </button>
    </div>
  );

  const isDineIn = pedido.tipo_entrega === 'dine_in' || pedido.tipo_entrega === 'local';
  const isPickup = pedido.tipo_entrega === 'pickup' || pedido.tipo_entrega === 'retirada';
  const deliveryEstimate = pedido.deliveryTimeMin == null ? '' : pedido.deliveryTimeMax != null && pedido.deliveryTimeMax !== pedido.deliveryTimeMin
    ? `${pedido.deliveryTimeMin}-${pedido.deliveryTimeMax} min`
    : `${pedido.deliveryTimeMin} min`;

  const getStatusStep = () => {
    const isDelivery = !isDineIn && !isPickup;
    switch (pedido.status) {
      case 'Pendente': return 1;
      case 'Preparando': return 2;
      case 'Pronto': return 3;
      case 'Saiu para Entrega': return isDelivery ? 4 : 3;
      case 'Entregue': return isDelivery ? 5 : 4;
      default: return 1;
    }
  };

  const step = getStatusStep();
  const isCancelled = pedido.status === 'Cancelado';

  const stepsConfig = [
    { id: 1, label: 'Recebido', icon: Package },
    { id: 2, label: 'Em preparo', icon: ChefHat },
    {
      id: 3,
      label: 'Pronto',
      icon: isDineIn ? UtensilsCrossed : Store,
    },
    ...(!isDineIn && !isPickup ? [{ id: 4, label: 'Em Rota', icon: Bike }] : []),
    {
      id: !isDineIn && !isPickup ? 5 : 4,
      label: isDineIn ? 'Servido' : isPickup ? 'Retirado' : 'Entregue',
      icon: CheckCircle,
    },
  ];


  const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const paid = Math.max(0, Number(pedido.paidCents || 0));
  const balance = Math.max(0, Math.round(Number(pedido.total || 0) * 100) - paid);
  const depositMissing = Math.max(0, Number(pedido.preorder?.depositCents || 0) - paid);
  const paymentLabel = isCancelled ? 'Pedido cancelado' : balance === 0 ? 'Pagamento completo' : depositMissing > 0 ? 'Aguardando sinal' : pedido.preorder?.depositCents > 0 ? 'Sinal confirmado' : 'Sem sinal obrigatório';
  const subtotal = (pedido.itens || []).reduce((sum: number, item: any) => sum + Number(item.subtotal || 0), 0);
  const discount = Math.max(0, Math.round((subtotal + Number(pedido.frete || 0) - Number(pedido.total || 0)) * 100) / 100);

  return <main aria-label="Acompanhar pedido" className="mx-auto max-w-xl space-y-4 px-4 py-4 sm:py-6">
    <div className="flex items-center justify-between gap-3">
      <button onClick={onBack} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-600"><ArrowLeft className="h-4 w-4" /> Voltar</button>
      <span className="text-sm text-gray-500">Pedido {formatOrderReference(pedido)}</span>
    </div>
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <section className="space-y-4 p-4">
        <h1 aria-live="polite" className="text-xl font-bold text-gray-900">{pedido.status === 'Pendente' ? 'Pedido recebido' : getOrderStatusLabel(pedido.status, pedido.tipo_entrega)}</h1>
        {isCancelled ? <p className="text-sm text-gray-600">Fale com a loja para esclarecer o cancelamento e eventuais devoluções.</p> :
          <ol aria-label="Progresso do pedido" className="flex">
            {stepsConfig.map((entry) => <li key={entry.id} aria-current={entry.id === step ? 'step' : undefined} className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              <div className={`absolute left-0 right-0 top-3 h-0.5 ${entry.id <= step ? 'store-bg-primary' : 'bg-gray-200'}`} />
              <span className={`relative grid h-6 w-6 place-items-center rounded-full ${entry.id <= step ? 'store-bg-primary store-text-on-primary' : 'bg-gray-100 text-gray-400'}`}><entry.icon className="h-3.5 w-3.5" /></span>
              <span className={`text-[11px] leading-4 ${entry.id === step ? 'font-bold store-text-primary' : 'text-gray-500'}`}>{entry.label}</span>
            </li>)}
          </ol>}
        {pedido.preorder ? <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-sm font-semibold text-gray-900">{isPickup ? 'Retirada' : isDineIn ? 'No local' : 'Entrega'} · {new Date(`${pedido.preorder.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</p>
          <p className="mt-1 text-sm text-gray-600">Das {pedido.preorder.startTime} às {pedido.preorder.endTime}</p>
        </div> : deliveryEstimate && <p className="text-sm text-gray-600">{isPickup || isDineIn ? 'Preparo informado' : 'Previsão informada'}: {deliveryEstimate}</p>}
      </section>

      {pedido.preorder && <section aria-label="Pagamento da encomenda" className="space-y-2 border-t border-gray-100 p-4">
        <p className={`text-sm font-semibold ${isCancelled ? 'text-gray-600' : depositMissing > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>{paymentLabel}</p>
        <p className="text-sm text-gray-600">{isCancelled ? `Valor ainda registrado: ${money(paid / 100)}` : `Pago: ${money(paid / 100)} · Restante: ${money(balance / 100)}`}</p>
        {!isCancelled && depositMissing > 0 && pedido.preorder.pixKey && <details>
          <summary className="cursor-pointer py-2 text-sm font-semibold store-text-primary">Pagar sinal de {money(depositMissing / 100)}</summary>
          <div className="space-y-2 rounded-xl bg-gray-50 p-3 text-sm">
            <p className="break-all select-all">{pedido.preorder.pixKey}</p>
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(pedido.preorder.pixKey); setCopyMessage('Chave copiada.'); } catch { setCopyMessage('Selecione a chave acima para copiar.'); } }} className="min-h-11 rounded-lg store-bg-primary store-text-on-primary px-4 font-semibold">Copiar chave Pix</button>
            {copyMessage && <p role="status">{copyMessage}</p>}
            {pedido.preorder.pixInstructions && <p className="whitespace-pre-wrap text-gray-600">{pedido.preorder.pixInstructions}</p>}
            <p className="text-xs leading-5 text-gray-600">Confira o destinatário no banco. A loja confirma o recebimento; enviar comprovante não altera o pagamento automaticamente.</p>
          </div>
        </details>}
      </section>}

      <section className="space-y-2 border-t border-gray-100 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><MapPin className="h-4 w-4 text-gray-500" />{isPickup ? 'Retirar em' : isDineIn ? 'Atendimento no local' : 'Entregar em'}</h2>
        <p className="text-sm leading-5 text-gray-600">{isPickup || isDineIn ? storeAddress || 'Confirme o local com a loja.' : (hasPasswordAssurance && authenticatedOrder?.address) || (hasPasswordAssurance ? 'Endereço não informado' : 'Confirme sua senha na área de pedidos para ver o endereço.')}</p>
        {(isPickup || isDineIn) && storeAddress && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeAddress)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold store-text-primary">Como chegar</a>}
      </section>

      <section className="space-y-3 border-t border-gray-100 p-4">
        {(pedido.itens || []).map((item: any, index: number) => <div key={index} className="flex justify-between gap-3 text-sm text-gray-800"><p className="min-w-0">{item.quantidade}× {item.nome}</p><span className="shrink-0 font-semibold">{money(Number(item.subtotal || 0))}</span></div>)}
        <details>
          <summary className="cursor-pointer py-2 text-sm font-semibold store-text-primary">Ver detalhes do pedido</summary>
          <div className="space-y-3 pt-2 text-sm text-gray-600">
            {(pedido.itens || []).map((item: any, index: number) => <div key={index} className="space-y-1">
              <p className="font-semibold text-gray-800">{item.quantidade}× {item.nome}</p>
              {item.tipo_item === 'combo' && <ComboComposition stages={item.combo_snapshot?.etapas} items={item.combo_snapshot?.items} />}
              {!!item.opcoes_escolhidas?.length && <p>{item.opcoes_escolhidas.map((op: any) => `${op.quantidade || 1}× ${op.opcao}`).join(', ')}</p>}
              {item.observacao && <p className="whitespace-pre-wrap">{item.observacao}</p>}
              {item.personalizacao?.descricao && item.personalizacao.descricao !== item.observacao && <p className="whitespace-pre-wrap">{item.personalizacao.descricao}</p>}
            </div>)}
            {pedido.notes && <p className="whitespace-pre-wrap">Observações: {pedido.notes}</p>}
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <p className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></p>
              {!isPickup && !isDineIn && <p className="flex justify-between"><span>Entrega</span><span>{money(Number(pedido.frete || 0))}</span></p>}
              {discount > 0 && <p className="flex justify-between"><span>Descontos</span><span>− {money(discount)}</span></p>}
              <p className="flex justify-between font-semibold text-gray-900"><span>Total</span><span>{money(Number(pedido.total || 0))}</span></p>
              {pedido.metodo_pagamento && <p>Pagamento: {paymentMethodLabel(pedido.metodo_pagamento)}</p>}
            </div>
          </div>
        </details>
      </section>
    </div>
    {storePhone && <a href={formatWhatsAppLink(storePhone, `Olá! Gostaria de falar sobre o pedido ${formatOrderReference(pedido)}.`)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl store-bg-primary store-text-on-primary px-4 text-sm font-semibold"><MessageCircle className="h-4 w-4" /> Falar com a loja</a>}
  </main>;
}
