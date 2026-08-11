import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { customerApi } from '../features/customer/api';

type Props = { isOpen: boolean; onClose: () => void; onConfirmDelivery: (address: any) => void; user: any; tenantSlug?: string | null; canSaveAddress?: boolean };
const empty = { cep: '', logradouro: '', numero: '', complemento: '', referencia: '', bairro: '', cidade: '', estado: '' };

export default function DeliveryAddressModal({ isOpen, onClose, onConfirmDelivery, user, tenantSlug, canSaveAddress = false }: Props) {
  const [mode, setMode] = useState<'choose' | 'form'>('choose');
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveAddress, setSaveAddress] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; setMode('choose'); setError('');
    return () => { document.body.style.overflow = previous; };
  }, [isOpen]);
  if (!isOpen) return null;
  const select = (address: any) => { onConfirmDelivery({ ...address, enderecoCompleto: `${address.logradouro}, ${address.numero} - ${address.bairro}, ${address.cidade}/${address.estado}` }); onClose(); };
  const searchCep = async () => {
    const cep = form.cep.replace(/\D/g, '');
    if (!tenantSlug || cep.length !== 8) return setError('Informe um CEP valido com 8 numeros.');
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/cep/${cep}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'CEP nao encontrado.');
      setForm((value) => ({ ...value, ...data.address, cep: data.address.cep || cep }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Nao foi possivel consultar o CEP.'); }
    finally { setLoading(false); }
  };
  const confirm = async () => {
    if (!form.logradouro || !form.numero || !form.bairro || !form.cidade || !form.estado || form.cep.replace(/\D/g, '').length !== 8) return setError('Preencha os campos obrigatorios do endereco.');
    setLoading(true); setError('');
    try {
      let address: any = { ...form, titulo: 'Endereco de entrega', cep: form.cep.replace(/\D/g, '') };
      if (saveAddress && canSaveAddress && user && tenantSlug) {
        const saved = await customerApi(tenantSlug).createAddress({ ...address, padrao: !(user.enderecos || []).length });
        address = saved.user.enderecos[saved.user.enderecos.length - 1];
      }
      select(address);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Nao foi possivel salvar o endereco.'); }
    finally { setLoading(false); }
  };
  const field = 'h-11 w-full rounded-md border border-gray-300 px-3 text-sm outline-none store-focus';
  return ReactDOM.createPortal(<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl"><header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4"><h2 className="font-semibold text-gray-800">Endereco de entrega</h2><button onClick={onClose} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button></header><div className="space-y-4 p-5 pb-[max(20px,env(safe-area-inset-bottom))]">{mode === 'choose' ? <>
    <div className="overflow-hidden rounded-xl border border-gray-200">{(user?.enderecos || []).map((address: any) => <button key={address.id || address._id} onClick={() => select(address)} className="flex w-full items-center gap-3 border-b border-gray-100 p-4 text-left last:border-0 hover:bg-gray-50"><MapPin className="h-4 w-4 text-gray-400" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-800">{address.titulo || 'Endereco'}</p><p className="truncate text-xs text-gray-500">{address.logradouro}, {address.numero} · {address.bairro}</p></div>{address.padrao && <span className="rounded-full store-bg-soft px-2 py-1 text-[10px] font-semibold store-text-primary">Padrao</span>}</button>)}<button onClick={() => setMode('form')} className="w-full px-4 py-3 text-left text-sm font-semibold store-text-primary">+ Adicionar endereco</button></div>
  </> : <><button onClick={() => setMode('choose')} className="text-sm font-medium store-text-primary">Voltar aos enderecos</button><div><label className="text-xs font-medium text-gray-600">CEP</label><div className="mt-1 flex gap-2"><input value={form.cep} onChange={(event) => setForm({ ...form, cep: event.target.value.replace(/\D/g, '').slice(0, 8) })} className={field} inputMode="numeric" placeholder="00000000" /><button onClick={searchCep} disabled={loading} className="flex h-11 w-12 shrink-0 items-center justify-center rounded-md store-bg-primary store-text-on-primary">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</button></div></div><label className="block text-xs font-medium text-gray-600">Rua<input value={form.logradouro} onChange={(event) => setForm({ ...form, logradouro: event.target.value })} className={`${field} mt-1`} /></label><div className="grid grid-cols-[110px_1fr] gap-3"><label className="block text-xs font-medium text-gray-600">Numero<input value={form.numero} onChange={(event) => setForm({ ...form, numero: event.target.value })} className={`${field} mt-1`} /></label><label className="block text-xs font-medium text-gray-600">Complemento<input value={form.complemento} onChange={(event) => setForm({ ...form, complemento: event.target.value })} className={`${field} mt-1`} /></label></div><label className="block text-xs font-medium text-gray-600">Referencia<input value={form.referencia} onChange={(event) => setForm({ ...form, referencia: event.target.value })} className={`${field} mt-1`} placeholder="Ex.: portao azul" /></label><label className="block text-xs font-medium text-gray-600">Bairro<input value={form.bairro} onChange={(event) => setForm({ ...form, bairro: event.target.value })} className={`${field} mt-1`} /></label><div className="grid grid-cols-[1fr_80px] gap-3"><label className="block text-xs font-medium text-gray-600">Cidade<input value={form.cidade} onChange={(event) => setForm({ ...form, cidade: event.target.value })} className={`${field} mt-1`} /></label><label className="block text-xs font-medium text-gray-600">UF<input value={form.estado} onChange={(event) => setForm({ ...form, estado: event.target.value.toUpperCase().slice(0, 2) })} className={`${field} mt-1`} /></label></div>{user && canSaveAddress && <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} className="h-4 w-4 accent-[var(--store-primary)]" />Salvar este endereco na minha conta</label>}{error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button onClick={confirm} disabled={loading} className="h-12 w-full rounded-md store-bg-primary store-text-on-primary text-sm font-semibold disabled:opacity-60">{loading ? 'Salvando...' : 'Usar este endereco'}</button></>}</div></div></div>, document.body);
}
