import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ImagePlus, Loader2, MessageCircle, Trash2, Truck, UserRound, WalletCards, X } from 'lucide-react';
import { formatWhatsAppAppLink } from '../../lib/formatters';
import { formatOrderReference } from '../../lib/orderReference';
import { paymentMethodLabel } from '../../lib/paymentMethods';
import { supabase } from '../../lib/supabase';
import { useTenantAdminApi } from './TenantAdminContext';

type StoredImage = { bucket: string; path: string; preview: string };
type ManualOrderForm = { customerName: string; customerPhone: string; itemName: string; description: string; date: string; startsAt: string; deliveryType: 'pickup' | 'delivery'; deliveryAddress: string; itemPrice: string; shipping: string; paymentMethod: string; received: string; receivedMethod: string };

const localDate = (offsetDays = 1) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
const defaultForm = (): ManualOrderForm => ({ customerName: '', customerPhone: '', itemName: 'Encomenda personalizada', description: '', date: localDate(), startsAt: '', deliveryType: 'pickup', deliveryAddress: '', itemPrice: '', shipping: '0,00', paymentMethod: 'pix', received: '0,00', receivedMethod: 'pix' });
const cents = (value: string) => {
  const clean = String(value || '').replace(/R\$/gi, '').replace(/\s/g, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  return Math.round(Number(normalized) * 100);
};
const money = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const moneyInput = (value: number) => (Math.max(0, value) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const availablePaymentMethods = (methods: Record<string, boolean> = {}) => Object.entries(methods)
  .filter(([method, enabled]) => enabled && !(method === 'card' && (methods.credit_card || methods.debit_card)));

async function toWebp(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem válida.');
  if (file.size > 8 * 1024 * 1024) throw new Error('A imagem original deve ter no máximo 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Não foi possível ler a imagem.')); });
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível processar a imagem.')), 'image/webp', 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ManualPreorderModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (order: any) => void }) {
  const api = useTenantAdminApi();
  const draftKey = `podevir_manual_preorder_draft_${api.slug}`;
  const [form, setForm] = useState<ManualOrderForm>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      return saved ? { ...defaultForm(), ...JSON.parse(saved), startsAt: '' } : defaultForm();
    } catch { return defaultForm(); }
  });
  const [setup, setSetup] = useState<any>(null);
  const [nextAvailable, setNextAvailable] = useState<{ date: string; startTime: string; endTime: string } | null>(null);
  const [images, setImages] = useState<StoredImage[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<any>(null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const imagesRef = useRef<StoredImage[]>([]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingSlots(true); setError('');
    setNextAvailable(null);
    void (async () => {
      try {
        const data = await api.getManualOrderSetup(form.date);
        if (!active) return;
        setSetup(data);
        setNextAvailable(data.nextAvailable);
        setForm((current) => {
          const methods = availablePaymentMethods(data.paymentMethods);
          const availableIds = new Set(methods.map(([method]) => method));
          const fallbackPayment = methods[0]?.[0] || 'pix';
          const pickupAllowed = data.logisticsOptions?.allowPickup !== false;
          const deliveryAllowed = data.logisticsOptions?.allowDelivery !== false;
          const deliveryType = (current.deliveryType === 'pickup' && pickupAllowed) || (current.deliveryType === 'delivery' && deliveryAllowed)
            ? current.deliveryType : pickupAllowed ? 'pickup' : 'delivery';
          return { ...current, startsAt: data.slots.some((slot) => slot.startsAt === current.startsAt) ? current.startsAt : data.slots[0]?.startsAt || '', deliveryType, paymentMethod: availableIds.has(current.paymentMethod) ? current.paymentMethod : fallbackPayment, receivedMethod: availableIds.has(current.receivedMethod) ? current.receivedMethod : fallbackPayment };
        });
        setLoadingSlots(false);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível consultar a agenda.');
      } finally { if (active) setLoadingSlots(false); }
    })();
    return () => { active = false; };
  }, [api, form.date, open]);

  useEffect(() => {
    try { localStorage.setItem(draftKey, JSON.stringify(form)); } catch { /* armazenamento pode estar bloqueado */ }
  }, [draftKey, form]);

  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.preview)), []);

  const itemCents = cents(form.itemPrice || '0');
  const shippingCents = form.deliveryType === 'delivery' ? cents(form.shipping || '0') : 0;
  const totalCents = Number.isFinite(itemCents + shippingCents) ? itemCents + shippingCents : 0;
  const depositCents = Math.ceil(totalCents * Number(setup?.depositPercent || 0) / 100);
  const selectedSlot = setup?.slots?.find((slot: any) => slot.startsAt === form.startsAt);
  const enabledPaymentMethods = useMemo(() => availablePaymentMethods(setup?.paymentMethods), [setup]);

  const uploadImage = async (file?: File) => {
    if (!file || images.length >= 3) return;
    setUploading(true); setError('');
    try {
      if (!supabase) throw new Error('O armazenamento de imagens não está configurado.');
      const blob = await toWebp(file);
      const signed = await api.signUpload({ target: 'orderReference', mimeType: 'image/webp', size: blob.size });
      const { error: uploadError } = await supabase.storage.from(signed.upload.bucket).uploadToSignedUrl(signed.upload.path, signed.upload.token, blob, { contentType: 'image/webp', cacheControl: '3600' });
      if (uploadError) throw uploadError;
      setImages((current) => [...current, { bucket: signed.upload.bucket, path: signed.upload.path, preview: URL.createObjectURL(blob) }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível enviar a imagem.');
    } finally { setUploading(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const receivedCents = cents(form.received || '0');
    if (!form.startsAt) return setError('Escolha uma data com horário disponível.');
    if (!Number.isInteger(itemCents) || itemCents <= 0) return setError('Informe o valor do produto.');
    if (!Number.isInteger(shippingCents) || shippingCents < 0) return setError('Informe um frete válido.');
    if (!Number.isInteger(receivedCents) || receivedCents < 0 || receivedCents > totalCents) return setError('Confira o valor já recebido.');
    try {
      setSaving(true);
      const result = await api.createManualOrder({ operationId, customerName: form.customerName, customerPhone: form.customerPhone, itemName: form.itemName, description: form.description, referenceImages: images.map(({ bucket, path }) => ({ bucket, path })), preorder: { date: form.date, startsAt: form.startsAt }, deliveryType: form.deliveryType, ...(form.deliveryType === 'delivery' ? { deliveryAddress: form.deliveryAddress, shippingCents } : { shippingCents: 0 }), itemPriceCents: itemCents, paymentMethod: form.paymentMethod, receivedCents, receivedMethod: form.receivedMethod });
      setCreated({ ...result, receivedCents });
      try { localStorage.removeItem(draftKey); } catch { /* armazenamento pode estar bloqueado */ }
      onCreated(result.order);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar a encomenda.');
    } finally { setSaving(false); }
  };

  const close = () => {
    if (saving) return;
    onClose();
  };

  const discardDraft = () => {
    images.forEach((image) => URL.revokeObjectURL(image.preview));
    setImages([]); setCreated(null); setError(''); setSetup(null); setNextAvailable(null); setOperationId(crypto.randomUUID());
    setForm(defaultForm());
    try { localStorage.removeItem(draftKey); } catch { /* armazenamento pode estar bloqueado */ }
  };

  const finish = () => {
    discardDraft();
    onClose();
  };

  const removeImage = (index: number) => {
    setImages((current) => {
      const image = current[index];
      if (image) URL.revokeObjectURL(image.preview);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  if (!open) return null;
  if (created) {
    const order = created.order;
    const remaining = Math.max(0, created.totalCents - created.receivedCents);
    const message = `*Resumo da sua encomenda*\n\n${order.itens?.[0]?.nome || 'Encomenda personalizada'}\n${form.description}\n\nData: ${new Date(`${form.date}T12:00:00`).toLocaleDateString('pt-BR')}\nHorário: ${selectedSlot?.startTime || ''}–${selectedSlot?.endTime || ''}\n${form.deliveryType === 'delivery' ? `Entrega: ${form.deliveryAddress}\nFrete: ${money(shippingCents)}\n` : 'Retirada na loja\n'}Total: ${money(created.totalCents)}\nSinal necessário: ${money(created.depositCents)}\n${remaining > 0 ? `Recebido: ${money(created.receivedCents)}\nSaldo pendente: ${money(remaining)}` : 'Pagamento registrado integralmente'}\n\nPedido ${formatOrderReference(order)} - Pode Vir`;
    return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-3"><section role="dialog" aria-modal="true" aria-label="Encomenda criada" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h2 className="font-black text-emerald-950">Encomenda salva e vaga reservada</h2><p className="mt-1 text-sm text-emerald-800">{formatOrderReference(order)} · {remaining > 0 ? `Saldo restante: ${money(remaining)}` : 'Pagamento completo'}</p></div><p className="mt-4 text-sm leading-6 text-slate-600">A encomenda já está na agenda. Envie o resumo para o cliente confirmar os dados combinados.</p><a href={formatWhatsAppAppLink(form.customerPhone, message)} target="_blank" rel="noreferrer" className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-white"><MessageCircle className="h-5 w-5" /> Enviar resumo pelo WhatsApp</a><button type="button" onClick={finish} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 text-sm font-bold text-slate-700">Concluir</button></section></div>;
  }

  const inputClass = 'mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-0 sm:p-4"><section role="dialog" aria-modal="true" aria-label="Nova encomenda" className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-slate-50 shadow-2xl sm:max-h-[94dvh] sm:h-auto sm:rounded-2xl">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5"><div><h2 className="text-lg font-black text-slate-950">Nova encomenda</h2><p className="text-xs text-slate-500">Registre o que foi combinado pelo WhatsApp.</p></div><div className="flex items-center gap-2"><span className="hidden text-[11px] font-medium text-emerald-700 sm:inline">Rascunho salvo neste dispositivo</span><button type="button" onClick={close} aria-label="Fechar e continuar depois" className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"><X className="h-5 w-5" /></button></div></header>
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-4 overflow-y-auto p-3 sm:p-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><UserRound className="h-4 w-4" /></div><div><h3 className="text-sm font-black text-slate-900">Cliente e combinado</h3><p className="text-xs text-slate-500">Identifique a encomenda e registre todos os detalhes.</p></div></div><div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Nome do cliente<input required minLength={2} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold text-slate-700">WhatsApp<input required minLength={8} value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} className={inputClass} placeholder="(24) 99999-9999" /></label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Nome da encomenda<input required minLength={2} value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">O que foi combinado<textarea required minLength={3} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" placeholder="Tema, tamanho, massa, recheio, cores, nome e outros detalhes..." /></label>
          <div className="sm:col-span-2"><p className="text-sm font-semibold text-slate-700">Fotos de referência <span className="font-normal text-slate-400">(opcional, até 3)</span></p><div className="mt-2 flex flex-wrap gap-2">{images.map((image, index) => <div key={image.path} className="group relative"><a href={image.preview} target="_blank" rel="noreferrer"><img src={image.preview} alt={`Referência ${index + 1}`} className="h-24 w-24 rounded-xl border border-slate-200 object-cover shadow-sm" /></a><button type="button" aria-label="Remover foto" onClick={() => removeImage(index)} className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900 p-1.5 text-white shadow"><X className="h-3 w-3" /></button></div>)}{images.length < 3 && <label className="flex h-24 min-w-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-center text-xs font-semibold text-slate-600 hover:border-emerald-400 hover:bg-emerald-50">{uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}Adicionar foto<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { void uploadImage(e.target.files?.[0]); e.target.value = ''; }} /></label>}</div></div>
        </div></section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700"><Truck className="h-4 w-4" /></div><div><h3 className="text-sm font-black text-slate-900">Entrega ou retirada</h3><p className="text-xs text-slate-500">Escolha quando e como o cliente receberá.</p></div></div><div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Data<input type="date" required value={form.date} min={localDate(0)} onChange={(e) => setForm({ ...form, date: e.target.value, startsAt: '' })} className={inputClass} /></label>
          <label className="text-sm font-semibold text-slate-700">Horário<select required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={inputClass} disabled={loadingSlots}>{loadingSlots ? <option>Consultando agenda...</option> : setup?.slots?.length ? setup.slots.map((slot: any) => <option key={slot.startsAt} value={slot.startsAt}>{slot.startTime} às {slot.endTime}</option>) : <option value="">Nenhum horário disponível</option>}</select></label>
          {!loadingSlots && setup && !setup.slots?.length && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 sm:col-span-2"><p>{setup.availabilityMessage || 'Não há horários disponíveis nesta data.'}</p>{nextAvailable && <button type="button" onClick={() => setForm({ ...form, date: nextAvailable.date, startsAt: '' })} className="mt-2 block font-bold text-amber-950 underline">Próxima disponibilidade: {dateLabel(nextAvailable.date)}, {nextAvailable.startTime} às {nextAvailable.endTime}</button>}</div>}
          <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-slate-700">Como será entregue?</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:flex">{setup?.logisticsOptions?.allowPickup !== false && <button type="button" onClick={() => setForm({ ...form, deliveryType: 'pickup' })} className={`min-h-11 rounded-xl border px-5 text-sm font-bold ${form.deliveryType === 'pickup' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600' : 'border-slate-200 bg-white text-slate-600'}`}>Retirada na loja</button>}{setup?.logisticsOptions?.allowDelivery !== false && <button type="button" onClick={() => setForm({ ...form, deliveryType: 'delivery' })} className={`min-h-11 rounded-xl border px-5 text-sm font-bold ${form.deliveryType === 'delivery' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600' : 'border-slate-200 bg-white text-slate-600'}`}>Entrega no endereço</button>}</div></fieldset>
          {form.deliveryType === 'delivery' && <><label className="text-sm font-semibold text-slate-700 sm:col-span-2">Endereço combinado<textarea required rows={2} value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label><label className="text-sm font-semibold text-slate-700">Frete (R$)<input required inputMode="decimal" value={form.shipping} onChange={(e) => setForm({ ...form, shipping: e.target.value })} onBlur={() => Number.isFinite(shippingCents) && setForm((current) => ({ ...current, shipping: moneyInput(shippingCents) }))} className={inputClass} /></label></>}
        </div></section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-700"><WalletCards className="h-4 w-4" /></div><div><h3 className="text-sm font-black text-slate-900">Valores e pagamento</h3><p className="text-xs text-slate-500">Informe o preço fechado e o que já foi recebido.</p></div></div><div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Valor do produto (R$)<input required inputMode="decimal" value={form.itemPrice} onChange={(e) => setForm({ ...form, itemPrice: e.target.value })} onBlur={() => Number.isFinite(itemCents) && setForm((current) => ({ ...current, itemPrice: moneyInput(itemCents) }))} className={inputClass} placeholder="0,00" /></label>
          <label className="text-sm font-semibold text-slate-700">Forma de pagamento combinada<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className={inputClass}>{enabledPaymentMethods.map(([method]) => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}</select></label>
          <div className="sm:col-span-2"><p className="text-sm font-semibold text-slate-700">Quanto já foi recebido?</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setForm({ ...form, received: '0,00' })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Ainda não recebi</button><button type="button" onClick={() => setForm({ ...form, received: moneyInput(depositCents) })} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Recebi o sinal</button><button type="button" onClick={() => setForm({ ...form, received: moneyInput(totalCents) })} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Recebi tudo</button></div></div>
          <label className="text-sm font-semibold text-slate-700">Valor recebido (R$)<input inputMode="decimal" value={form.received} onChange={(e) => setForm({ ...form, received: e.target.value })} onBlur={() => { const value = cents(form.received); if (Number.isFinite(value)) setForm((current) => ({ ...current, received: moneyInput(value) })); }} className={inputClass} /></label>
          {cents(form.received || '0') > 0 && <label className="text-sm font-semibold text-slate-700">Recebido por<select value={form.receivedMethod} onChange={(e) => setForm({ ...form, receivedMethod: e.target.value })} className={inputClass}>{enabledPaymentMethods.map(([method]) => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}</select></label>}
        </div></section>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      </div>
      <footer className="sticky bottom-0 border-t border-slate-200 bg-white p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] sm:px-5"><div className="mb-3 flex items-end justify-between gap-4"><div><p className="text-xs text-slate-500">Total da encomenda</p><p className="text-xl font-black text-slate-950">{money(totalCents)}</p></div><div className="text-right"><p className="text-xs text-slate-500">Sinal necessário ({setup?.depositPercent || 0}%)</p><p className="text-sm font-bold text-amber-800">{money(depositCents)}</p></div></div><button disabled={saving || uploading || loadingSlots || !form.startsAt} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarDays className="h-5 w-5" />} Salvar encomenda</button><p className="mt-2 text-center text-[11px] text-slate-500">Ao salvar, este horário fica reservado na agenda.</p><button type="button" onClick={() => { if (window.confirm('Descartar todos os dados preenchidos desta encomenda?')) discardDraft(); }} className="mx-auto mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-red-600"><Trash2 className="h-3 w-3" /> Descartar rascunho</button></footer>
    </form>
  </section></div>;
}
