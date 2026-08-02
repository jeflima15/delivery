import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Check, Loader2, MapPin, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { customerApi } from '../features/customer/api';

type Props = { isOpen: boolean; onClose: () => void; tenantSlug: string; user: any; onUpdateUser: (user: any) => void };
const emptyAddress = { titulo: '', cep: '', logradouro: '', numero: '', complemento: '', referencia: '', bairro: '', cidade: '', estado: '', padrao: false };
const inputClass = 'mt-1 h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none store-focus';

export default function AddressBookModal({ isOpen, onClose, tenantSlug, user, onUpdateUser }: Props) {
  const [form, setForm] = useState<any>(emptyAddress);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    triggerRef.current = document.activeElement as HTMLElement;
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); triggerRef.current?.focus(); };
  }, [isOpen]);

  if (!isOpen) return null;
  const addresses = user?.enderecos || [];
  const idOf = (address: any) => String(address.id || address._id);
  const api = customerApi(tenantSlug);
  const startCreate = () => { setEditingId(null); setForm({ ...emptyAddress, padrao: addresses.length === 0 }); setError(''); setShowForm(true); };
  const startEdit = (address: any) => { setEditingId(idOf(address)); setForm({ ...emptyAddress, ...address }); setError(''); setShowForm(true); };
  const update = (field: string, value: any) => setForm((current: any) => ({ ...current, [field]: value }));

  const searchCep = async () => {
    setLoading(true); setError('');
    try {
      const data: any = await api.cep(form.cep);
      setForm((current: any) => ({ ...current, ...data.address, estado: data.address.estado || data.address.uf || '' }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Nao foi possivel consultar o CEP.'); }
    finally { setLoading(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const payload = { ...form, cep: String(form.cep).replace(/\D/g, ''), estado: String(form.estado).toUpperCase() };
      const data: any = editingId ? await api.updateAddress(editingId, payload) : await api.createAddress(payload);
      onUpdateUser(data.user); setShowForm(false); setEditingId(null); setForm(emptyAddress);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Nao foi possivel salvar o endereco.'); }
    finally { setLoading(false); }
  };

  const action = async (callback: () => Promise<any>) => {
    setLoading(true); setError('');
    try { const data = await callback(); onUpdateUser(data.user); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Nao foi possivel atualizar o endereco.'); }
    finally { setLoading(false); }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/55 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="address-book-title" className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div><h2 id="address-book-title" className="text-lg font-semibold text-gray-800">Meus enderecos</h2><p className="text-xs text-gray-500">Gerencie os locais usados nas suas entregas.</p></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!showForm ? <div className="space-y-3">
            {addresses.length === 0 && <div className="rounded-xl border border-dashed border-gray-300 px-5 py-10 text-center"><MapPin className="mx-auto h-7 w-7 text-gray-300" /><p className="mt-3 text-sm font-medium text-gray-700">Nenhum endereco salvo</p><p className="mt-1 text-xs text-gray-500">Adicione um endereco para agilizar seus proximos pedidos.</p></div>}
            {addresses.map((address: any) => <article key={idOf(address)} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full store-bg-soft store-text-primary"><MapPin className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-800">{address.titulo || 'Endereco'}</h3>{address.padrao && <span className="rounded-full store-bg-soft px-2 py-0.5 text-[10px] font-semibold store-text-primary">Padrao</span>}</div><p className="mt-1 text-sm text-gray-600">{address.logradouro}, {address.numero}{address.complemento ? ` - ${address.complemento}` : ''}</p><p className="text-xs text-gray-500">{address.bairro} · {address.cidade}/{address.estado} · CEP {address.cep}</p></div></div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3"><button type="button" onClick={() => startEdit(address)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"><Pencil className="h-3.5 w-3.5" />Editar</button>{!address.padrao && <button type="button" disabled={loading} onClick={() => action(() => api.setDefaultAddress(idOf(address)))} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold store-text-primary hover:store-bg-soft"><Check className="h-3.5 w-3.5" />Tornar padrao</button>}<button type="button" disabled={loading} onClick={() => { if (window.confirm('Remover este endereco?')) action(() => api.deleteAddress(idOf(address))); }} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Remover</button></div>
            </article>)}
            {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button type="button" onClick={startCreate} className="flex h-11 w-full items-center justify-center gap-2 rounded-md store-bg-primary store-bg-primary-hover text-sm font-semibold store-text-on-primary"><Plus className="h-4 w-4" />Adicionar endereco</button>
          </div> : <form onSubmit={save} className="space-y-4">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-semibold store-text-primary">Voltar para meus enderecos</button>
            <label className="block text-xs font-medium text-gray-600">Nome do endereco<input value={form.titulo} onChange={(event) => update('titulo', event.target.value)} className={inputClass} placeholder="Ex.: Casa" /></label>
            <label className="block text-xs font-medium text-gray-600">CEP<div className="mt-1 flex gap-2"><input required value={form.cep} onChange={(event) => update('cep', event.target.value.replace(/\D/g, '').slice(0, 8))} className={`${inputClass} mt-0`} inputMode="numeric" placeholder="00000000" /><button type="button" onClick={searchCep} disabled={loading} aria-label="Buscar CEP" className="flex h-11 w-12 shrink-0 items-center justify-center rounded-md store-bg-primary store-text-on-primary disabled:opacity-60"><Search className="h-4 w-4" /></button></div></label>
            <label className="block text-xs font-medium text-gray-600">Rua<input required value={form.logradouro} onChange={(event) => update('logradouro', event.target.value)} className={inputClass} /></label>
            <div className="grid grid-cols-[110px_1fr] gap-3"><label className="block text-xs font-medium text-gray-600">Numero<input required value={form.numero} onChange={(event) => update('numero', event.target.value)} className={inputClass} /></label><label className="block text-xs font-medium text-gray-600">Complemento<input value={form.complemento} onChange={(event) => update('complemento', event.target.value)} className={inputClass} /></label></div>
            <label className="block text-xs font-medium text-gray-600">Referencia<input value={form.referencia} onChange={(event) => update('referencia', event.target.value)} className={inputClass} placeholder="Ex.: portao azul" /></label>
            <label className="block text-xs font-medium text-gray-600">Bairro<input required value={form.bairro} onChange={(event) => update('bairro', event.target.value)} className={inputClass} /></label>
            <div className="grid grid-cols-[1fr_80px] gap-3"><label className="block text-xs font-medium text-gray-600">Cidade<input required value={form.cidade} onChange={(event) => update('cidade', event.target.value)} className={inputClass} /></label><label className="block text-xs font-medium text-gray-600">UF<input required value={form.estado} onChange={(event) => update('estado', event.target.value.toUpperCase().slice(0, 2))} className={inputClass} /></label></div>
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={form.padrao} onChange={(event) => update('padrao', event.target.checked)} className="h-4 w-4 accent-[var(--store-primary)]" />Usar como endereco padrao</label>
            {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-md store-bg-primary store-bg-primary-hover text-sm font-semibold store-text-on-primary disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{editingId ? 'Salvar alteracoes' : 'Salvar endereco'}</button>
          </form>}
        </div>
      </section>
    </div>, document.body,
  );
}
