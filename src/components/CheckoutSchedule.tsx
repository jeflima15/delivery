import { useEffect, useRef, useState } from 'react';
import { customerApi } from '../features/customer/api';
import { formatWhatsAppAppLink } from '../lib/formatters';

export type CheckoutScheduleValue = { ready: boolean; mode: 'immediate' | 'scheduled'; date: string; startsAt: string; endTime?: string; startTime?: string; depositPercent: number };
export default function CheckoutSchedule({ slug, cart, config, deliveryType, totalCents, revision = 0, onChange }: { slug: string; cart: any[]; config: any; deliveryType: string; totalCents: number; revision?: number; onChange: (value: CheckoutScheduleValue) => void }) {
  const timezone = config.preorders.timezone || 'America/Sao_Paulo';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<'immediate' | 'scheduled'>(config.preorders.salesMode === 'scheduled_only' || cart.some((item) => item.preorder?.immediateAllowed === false) || config.is_open === false ? 'scheduled' : 'immediate');
  const [startsAt, setStartsAt] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState('');
  const [loadedKey, setLoadedKey] = useState('');
  const [refresh, setRefresh] = useState(0);
  const change = useRef(onChange);
  change.current = onChange;
  const key = JSON.stringify({ date, items: cart.map((item) => ({ productId: item.produtoId, comboSelections: (item.comboSelections || []).map((selection: any) => ({ stageId: selection.stageId, selectedProductId: selection.selectedProductId })) })) });
  useEffect(() => {
    let active = true;
    setLoadedKey(''); setError('');
    customerApi(slug).preorderAvailability(JSON.parse(key)).then((data) => {
      if (!active) return;
      if (!data.slots.length && data.availableDates?.length) {
        setResponse(data); setStartsAt(''); setDate(data.availableDates[0]);
        return;
      }
      setResponse(data); setLoadedKey(key);
      setStartsAt((current) => data.slots.some((slot: any) => slot.startsAt === current) ? current : '');
      if (!data.policy.immediateAllowed || config.is_open === false) setMode('scheduled');
      else if (!data.policy.scheduledAllowed) setMode('immediate');
    }).catch((error) => { if (active) { setError(error instanceof Error ? error.message : 'Não foi possível consultar a agenda.'); setResponse(null); } });
    return () => { active = false; };
  }, [slug, key, refresh, revision, config.is_open]);
  const immediateAllowed = response?.policy.immediateAllowed && config.is_open !== false;
  const scheduledAllowed = response?.policy.scheduledAllowed && ['pickup', 'delivery'].includes(deliveryType);
  const slot = response?.slots.find((entry: any) => entry.startsAt === startsAt);
  const ready = loadedKey === key && !error && (mode === 'immediate' ? Boolean(immediateAllowed) : Boolean(scheduledAllowed && slot));
  useEffect(() => {
    change.current({ ready, mode, date, startsAt, startTime: slot?.startTime, endTime: slot?.endTime, depositPercent: response?.depositPercent || 0 });
  }, [ready, mode, date, startsAt, slot?.startTime, slot?.endTime, response?.depositPercent]);
  return <section aria-label="Agendamento do pedido" className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
    <h3 className="text-sm font-bold text-slate-900">{deliveryType === 'delivery' ? 'Quando deseja receber?' : 'Quando deseja retirar?'}</h3>
    {immediateAllowed && scheduledAllowed ? <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!immediateAllowed} aria-pressed={mode === 'immediate'} onClick={() => setMode('immediate')} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Agora</button>
      <button type="button" disabled={!scheduledAllowed} aria-pressed={mode === 'scheduled'} onClick={() => setMode('scheduled')} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Agendar</button>
    </div> : mode === 'scheduled' && <p className="text-sm text-slate-600">Este pedido é feito por encomenda.</p>}
    {mode === 'scheduled' && <>
      {!!response?.availableDates?.length && <>
        <div className="flex flex-wrap gap-2">{response.availableDates.slice(0, 3).map((day: string, index: number) => <button key={day} type="button" aria-pressed={date === day} onClick={() => { setDate(day); setStartsAt(''); }} className={`min-h-12 rounded-xl border px-3 py-2 text-sm ${date === day ? 'store-bg-primary store-text-on-primary' : 'bg-white text-slate-700'}`}>
          {new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}{index === 0 && <span className="block text-xs">Mais próxima</span>}
        </button>)}</div>
        <label className="block text-sm font-semibold">Data da encomenda<select value={date} onChange={(event) => { setDate(event.target.value); setStartsAt(''); }} className="mt-1 min-h-11 w-full rounded-xl border bg-white px-3 text-sm">{response.availableDates.map((day: string) => <option key={day} value={day}>{new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</option>)}</select></label>
      </>}
      {loadedKey === key && !!response?.slots.length && <fieldset><legend className="mb-2 text-sm font-semibold">{deliveryType === 'delivery' ? 'Horário da entrega' : 'Horário da retirada'}</legend><div className="flex flex-wrap gap-2">{response.slots.map((entry: any) => <button type="button" key={entry.startsAt} aria-pressed={startsAt === entry.startsAt} onClick={() => setStartsAt(entry.startsAt)} className={`min-h-11 rounded-xl border px-3 text-sm ${startsAt === entry.startsAt ? 'store-bg-primary store-text-on-primary' : 'bg-white text-slate-700'}`}>{entry.startTime}–{entry.endTime}</button>)}</div></fieldset>}
      {loadedKey === key && !response?.slots.length && <div role="status" className="text-sm text-amber-900"><p>Sem datas disponíveis no momento.</p>{config.whatsapp && <a className="mt-2 inline-block font-semibold underline" target="_blank" rel="noreferrer" href={formatWhatsAppAppLink(config.whatsapp, 'Olá! Gostaria de consultar uma data para minha encomenda.')}>Falar com a loja</a>}</div>}
      {response?.depositPercent > 0 && <p className="text-sm">Sinal de {(Math.ceil(totalCents * response.depositPercent / 100) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} via Pix para iniciar a produção. Após finalizar, você receberá as instruções; a loja confirma o pagamento.</p>}
      <p className="text-xs text-slate-600">A vaga será reservada ao finalizar.</p>
    </>}
    {loadedKey === key && !immediateAllowed && !scheduledAllowed && <p role="alert" className="text-sm text-red-700">Estes itens não podem ser pedidos juntos nesta modalidade. Separe os itens de pronta entrega dos de encomenda ou escolha entrega/retirada.</p>}
    {loadedKey !== key && !error && <p role="status" className="text-xs">Consultando disponibilidade…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="button" onClick={() => setRefresh((value) => value + 1)} className="text-xs font-semibold underline">Atualizar horários</button>
  </section>;
}
