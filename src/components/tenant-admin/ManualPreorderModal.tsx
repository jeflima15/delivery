import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ImagePlus, Loader2, MessageCircle, X } from 'lucide-react';
import { formatWhatsAppAppLink } from '../../lib/formatters';
import { formatOrderReference } from '../../lib/orderReference';
import { supabase } from '../../lib/supabase';
import { useTenantAdminApi } from './TenantAdminContext';

type StoredImage = { bucket: string; path: string; preview: string };

const localDate = (offsetDays = 1) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const cents = (value: string) => Math.round(Number(value.replace(',', '.')) * 100);
const money = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
  const [form, setForm] = useState({ customerName: '', customerPhone: '', itemName: 'Encomenda personalizada', description: '', date: localDate(), startsAt: '', deliveryType: 'pickup', deliveryAddress: '', itemPrice: '', shipping: '0', paymentMethod: 'pix', received: '0', receivedMethod: 'pix' });
  const [setup, setSetup] = useState<any>(null);
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
    api.getManualOrderSetup(form.date).then((data) => {
      if (!active) return;
      setSetup(data);
      setForm((current) => {
        const fallbackPayment = Object.keys(data.paymentMethods || {}).find((key) => data.paymentMethods[key]) || 'pix';
        return { ...current, startsAt: data.slots.some((slot) => slot.startsAt === current.startsAt) ? current.startsAt : data.slots[0]?.startsAt || '', deliveryType: data.logisticsOptions?.allowPickup !== false ? 'pickup' : 'delivery', paymentMethod: data.paymentMethods?.[current.paymentMethod] ? current.paymentMethod : fallbackPayment, receivedMethod: data.paymentMethods?.[current.receivedMethod] ? current.receivedMethod : fallbackPayment };
      });
    }).catch((caught) => active && setError(caught instanceof Error ? caught.message : 'Não foi possível consultar a agenda.')).finally(() => active && setLoadingSlots(false));
    return () => { active = false; };
  }, [api, form.date, open]);

  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.preview)), []);

  const itemCents = cents(form.itemPrice || '0');
  const shippingCents = form.deliveryType === 'delivery' ? cents(form.shipping || '0') : 0;
  const totalCents = Number.isFinite(itemCents + shippingCents) ? itemCents + shippingCents : 0;
  const depositCents = Math.ceil(totalCents * Number(setup?.depositPercent || 0) / 100);
  const selectedSlot = setup?.slots?.find((slot: any) => slot.startsAt === form.startsAt);
  const enabledPaymentMethods = useMemo(() => Object.entries(setup?.paymentMethods || {}).filter(([, enabled]) => enabled), [setup]);

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
      onCreated(result.order);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar a encomenda.');
    } finally { setSaving(false); }
  };

  const close = () => {
    if (saving) return;
    images.forEach((image) => URL.revokeObjectURL(image.preview));
    setImages([]); setCreated(null); setError(''); setSetup(null); setOperationId(crypto.randomUUID());
    setForm({ customerName: '', customerPhone: '', itemName: 'Encomenda personalizada', description: '', date: localDate(), startsAt: '', deliveryType: 'pickup', deliveryAddress: '', itemPrice: '', shipping: '0', paymentMethod: 'pix', received: '0', receivedMethod: 'pix' });
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
    return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-3"><section role="dialog" aria-modal="true" aria-label="Encomenda criada" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="rounded-xl bg-emerald-50 p-4"><h2 className="font-black text-emerald-900">Encomenda salva e vaga reservada</h2><p className="mt-1 text-sm text-emerald-800">{formatOrderReference(order)} · {remaining > 0 ? `Aguardando ${money(remaining)}` : 'Pagamento registrado'}</p></div><a href={formatWhatsAppAppLink(form.customerPhone, message)} target="_blank" rel="noreferrer" className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-white"><MessageCircle className="h-5 w-5" /> Enviar resumo pelo WhatsApp</a><button type="button" onClick={close} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 text-sm font-bold text-slate-700">Concluir</button></section></div>;
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-2 sm:p-4"><section role="dialog" aria-modal="true" aria-label="Nova encomenda" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="font-black text-slate-900">Nova encomenda</h2><p className="text-xs text-slate-500">Registre o que foi combinado pelo WhatsApp.</p></div><button type="button" onClick={close} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></header><form onSubmit={submit} className="overflow-y-auto p-4"><div className="grid gap-4 sm:grid-cols-2">
    <label className="text-xs font-bold text-slate-700">Nome do cliente<input required minLength={2} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
    <label className="text-xs font-bold text-slate-700">WhatsApp<input required minLength={8} value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" placeholder="(24) 99999-9999" /></label>
    <label className="text-xs font-bold text-slate-700 sm:col-span-2">Nome da encomenda<input required minLength={2} value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
    <label className="text-xs font-bold text-slate-700 sm:col-span-2">O que foi combinado<textarea required minLength={3} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-lg border p-3 text-sm" placeholder="Tema, tamanho, massa, recheio, cores, nome e outros detalhes..." /></label>
    <div className="sm:col-span-2"><p className="text-xs font-bold text-slate-700">Fotos de referência <span className="font-normal text-slate-400">(opcional, até 3)</span></p><div className="mt-2 flex flex-wrap gap-2">{images.map((image, index) => <div key={image.path} className="relative"><img src={image.preview} alt={`Referência ${index + 1}`} className="h-20 w-20 rounded-lg border object-cover" /><button type="button" aria-label="Remover foto" onClick={() => removeImage(index)} className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-1 text-white"><X className="h-3 w-3" /></button></div>)}{images.length < 3 && <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-lg border border-dashed text-slate-500">{uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { void uploadImage(e.target.files?.[0]); e.target.value = ''; }} /></label>}</div></div>
    <label className="text-xs font-bold text-slate-700">Data<input type="date" required value={form.date} min={localDate(0)} onChange={(e) => setForm({ ...form, date: e.target.value, startsAt: '' })} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
    <label className="text-xs font-bold text-slate-700">Horário<select required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="mt-1 h-10 w-full rounded-lg border px-3" disabled={loadingSlots}>{loadingSlots ? <option>Consultando...</option> : setup?.slots?.length ? setup.slots.map((slot: any) => <option key={slot.startsAt} value={slot.startsAt}>{slot.startTime}–{slot.endTime}</option>) : <option value="">Nenhum horário disponível</option>}</select></label>
    <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-slate-700">Como será entregue?</legend><div className="mt-2 flex gap-2">{setup?.logisticsOptions?.allowPickup !== false && <button type="button" onClick={() => setForm({ ...form, deliveryType: 'pickup' })} className={`rounded-lg border px-4 py-2 text-sm font-bold ${form.deliveryType === 'pickup' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : ''}`}>Retirada</button>}{setup?.logisticsOptions?.allowDelivery !== false && <button type="button" onClick={() => setForm({ ...form, deliveryType: 'delivery' })} className={`rounded-lg border px-4 py-2 text-sm font-bold ${form.deliveryType === 'delivery' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : ''}`}>Entrega</button>}</div></fieldset>
    {form.deliveryType === 'delivery' && <><label className="text-xs font-bold text-slate-700 sm:col-span-2">Endereço combinado<textarea required rows={2} value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} className="mt-1 w-full rounded-lg border p-3 text-sm" /></label><label className="text-xs font-bold text-slate-700">Frete (R$)<input required inputMode="decimal" value={form.shipping} onChange={(e) => setForm({ ...form, shipping: e.target.value })} className="mt-1 h-10 w-full rounded-lg border px-3" /></label></>}
    <label className="text-xs font-bold text-slate-700">Valor do produto (R$)<input required inputMode="decimal" value={form.itemPrice} onChange={(e) => setForm({ ...form, itemPrice: e.target.value })} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
    <label className="text-xs font-bold text-slate-700">Forma combinada<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="mt-1 h-10 w-full rounded-lg border px-3">{enabledPaymentMethods.map(([method]) => <option key={method} value={method}>{method === 'pix' ? 'PIX' : method === 'cash' ? 'Dinheiro' : method.includes('card') ? 'Cartão' : method === 'food_voucher' ? 'Vale-alimentação' : 'Vale-refeição'}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-700">Já recebido (R$)<input inputMode="decimal" value={form.received} onChange={(e) => setForm({ ...form, received: e.target.value })} className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
    {cents(form.received || '0') > 0 && <label className="text-xs font-bold text-slate-700">Recebido por<select value={form.receivedMethod} onChange={(e) => setForm({ ...form, receivedMethod: e.target.value })} className="mt-1 h-10 w-full rounded-lg border px-3">{enabledPaymentMethods.map(([method]) => <option key={method} value={method}>{method === 'pix' ? 'PIX' : method === 'cash' ? 'Dinheiro' : method.includes('card') ? 'Cartão' : method === 'food_voucher' ? 'Vale-alimentação' : 'Vale-refeição'}</option>)}</select></label>}
  </div><div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Total</span><strong>{money(totalCents)}</strong></div><div className="mt-1 flex justify-between text-amber-800"><span>Sinal necessário ({setup?.depositPercent || 0}%)</span><strong>{money(depositCents)}</strong></div></div>{error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}<button disabled={saving || uploading || loadingSlots} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarDays className="h-5 w-5" />} Salvar encomenda e reservar vaga</button></form></section></div>;
}
