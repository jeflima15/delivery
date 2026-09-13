import { useEffect, useRef, useState } from 'react';
import { customerApi } from '../features/customer/api';

export type CheckoutScheduleValue = { ready: boolean; mode: 'immediate' | 'scheduled'; date: string; startsAt: string; endTime?: string; startTime?: string; depositPercent: number };
export default function CheckoutSchedule({ slug, cart, config, deliveryType, onChange }: { slug: string; cart: any[]; config: any; deliveryType: string; onChange: (value: CheckoutScheduleValue) => void }) {
  const timezone = config.preorders.timezone || 'America/Sao_Paulo';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const addDays = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const [date, setDate] = useState(addDays(Math.ceil((config.preorders.minLeadMinutes || 0) / 1440)));
  const [mode, setMode] = useState<'immediate' | 'scheduled'>(config.preorders.salesMode === 'scheduled_only' || config.is_open === false ? 'scheduled' : 'immediate');
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
      setResponse(data); setLoadedKey(key);
      setStartsAt((current) => data.slots.some((slot: any) => slot.startsAt === current) ? current : '');
      if (!data.policy.immediateAllowed || config.is_open === false) setMode('scheduled');
      else if (!data.policy.scheduledAllowed) setMode('immediate');
    }).catch((error) => { if (active) { setError(error instanceof Error ? error.message : 'Não foi possível consultar a agenda.'); setResponse(null); } });
    return () => { active = false; };
  }, [slug, key, refresh, config.is_open]);
  const immediateAllowed = response?.policy.immediateAllowed && config.is_open !== false;
  const scheduledAllowed = response?.policy.scheduledAllowed && ['pickup', 'delivery'].includes(deliveryType);
  const slot = response?.slots.find((entry: any) => entry.startsAt === startsAt);
  const ready = loadedKey === key && !error && (mode === 'immediate' ? Boolean(immediateAllowed) : Boolean(scheduledAllowed && slot));
  useEffect(() => {
    change.current({ ready, mode, date, startsAt, startTime: slot?.startTime, endTime: slot?.endTime, depositPercent: response?.depositPercent || 0 });
  }, [ready, mode, date, startsAt, slot?.startTime, slot?.endTime, response?.depositPercent]);
  return <section aria-label="Agendamento do pedido" className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
    <h3 className="text-sm font-bold text-slate-900">Quando você quer receber ou retirar?</h3>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!immediateAllowed} aria-pressed={mode === 'immediate'} onClick={() => setMode('immediate')} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Agora</button>
      <button type="button" disabled={!scheduledAllowed} aria-pressed={mode === 'scheduled'} onClick={() => setMode('scheduled')} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Agendar</button>
    </div>
    {mode === 'scheduled' && <>
      <label className="block text-xs font-semibold">Data desejada
        <input type="date" min={today} max={addDays(config.preorders.maxAdvanceDays || 30)} value={date} onChange={(event) => { setDate(event.target.value); setStartsAt(''); }} className="mt-1 block min-h-11 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="block text-xs font-semibold">Horário ({timezone})
        <select value={startsAt} onChange={(event) => setStartsAt(event.target.value)} disabled={loadedKey !== key} className="mt-1 block min-h-11 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="">Selecione um horário</option>
          {(response?.slots || []).map((slot: any) => <option key={slot.startsAt} value={slot.startsAt}>{slot.startTime} às {slot.endTime}</option>)}
        </select>
      </label>
      {loadedKey === key && !response?.slots.length && <p className="text-xs text-amber-900">Sem horários nesta data. Escolha outro dia, respeitando o prazo de preparo.</p>}
      {response?.depositPercent > 0 && <p className="text-xs">Sinal de {response.depositPercent}% via PIX após enviar o pedido. A loja precisa conferir o recebimento antes de iniciar a produção.</p>}
      <p className="text-xs text-slate-600">A vaga só é reservada ao finalizar. Para alterar ou cancelar depois, fale com a loja.</p>
    </>}
    {loadedKey === key && !immediateAllowed && !scheduledAllowed && <p role="alert" className="text-sm text-red-700">Estes itens não podem ser pedidos juntos nesta modalidade. Separe os itens de pronta entrega dos de encomenda ou escolha entrega/retirada.</p>}
    {loadedKey !== key && !error && <p role="status" className="text-xs">Consultando disponibilidade…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="button" onClick={() => setRefresh((value) => value + 1)} className="text-xs font-semibold underline">Atualizar horários</button>
  </section>;
}
