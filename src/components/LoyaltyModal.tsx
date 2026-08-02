import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Gift, Loader2, X } from 'lucide-react';
import { customerApi } from '../features/customer/api';

interface Props { isOpen: boolean; onClose: () => void; user: any; isLoyaltyActive?: boolean; tenantSlug: string; }

export default function LoyaltyModal({ isOpen, onClose, isLoyaltyActive = false, tenantSlug }: Props) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen || !isLoyaltyActive) return;
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    customerApi(tenantSlug).loyalty().then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : 'Nao foi possivel carregar a fidelidade.'));
    return () => { document.body.style.overflow = previous; };
  }, [isOpen, isLoyaltyActive, tenantSlug]);
  if (!isOpen || !isLoyaltyActive) return null;
  return ReactDOM.createPortal(<div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-[480px] sm:rounded-2xl"><header className="relative flex items-center justify-center border-b border-gray-100 px-6 py-4"><h2 className="text-base font-semibold text-gray-800">Programa de fidelidade</h2><button onClick={onClose} aria-label="Fechar" className="absolute right-5 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button></header><div className="overflow-y-auto p-5">{error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : !data ? <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin store-text-primary" /> : <><div className="flex items-center gap-4 rounded-xl border store-border-soft store-bg-soft p-4"><div className="flex h-11 w-11 items-center justify-center rounded-full store-bg-primary store-text-on-primary"><Gift className="h-5 w-5" /></div><div><p className="text-2xl font-semibold text-gray-900">{data.balance}</p><p className="text-sm text-gray-500">pontos disponiveis</p></div></div><div className="mt-5"><h3 className="text-sm font-semibold text-gray-800">Produtos para resgate</h3>{data.eligibleProducts.length === 0 ? <p className="mt-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Nenhum produto de resgate esta disponivel agora.</p> : <div className="mt-3 space-y-2">{data.eligibleProducts.map((product: any) => <div key={product.id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">{product.image ? <img src={product.image} alt="" className="h-12 w-12 rounded-md object-cover" /> : <div className="h-12 w-12 rounded-md bg-gray-100" />}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-800">{product.name}</p><p className="text-xs text-gray-500">{product.points} pontos</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${product.canRedeem ? 'store-bg-soft store-text-primary' : 'bg-gray-100 text-gray-400'}`}>{product.canRedeem ? 'Disponivel' : 'Saldo insuficiente'}</span></div>)}</div>}</div></>}</div></div></div>, document.body);
}
