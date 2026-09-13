import { useEffect, useState } from 'react';
import { useTenantAdminApi } from './TenantAdminContext';

export default function RescheduleOrder({ order, onSaved }: { order: any; onSaved: (order: any) => void }) {
  const api = useTenantAdminApi();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(order.preorder.date);
  const [slots, setSlots] = useState<Array<{ startsAt: string; startTime: string; endTime: string }>>([]);
  const [startsAt, setStartsAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !date) return;
    let active = true;
    setSlots([]); setStartsAt(''); setBusy(true); setError('');
    api.preorderSlots(order._id, date).then((result) => { if (active) setSlots(result.slots); })
      .catch((error) => { if (active) setError(error.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [api, order._id, order.updatedAt, date, open]);
  const save = async () => {
    if (busy || !startsAt || reason.trim().length < 3) return;
    setBusy(true); setError('');
    try {
      const result = await api.rescheduleOrder(order._id, { date, startsAt, expectedUpdatedAt: order.updatedAt, reason });
      onSaved(result.order); setOpen(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível reagendar.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border border-slate-200 p-3 text-xs">
    <button type="button" className="font-bold text-emerald-700 underline" onClick={() => setOpen(!open)}>Reagendar encomenda</button>
    {open && <>
      <p>Combine a nova data com o cliente. O preço e o sinal já combinados não mudam.</p>
      <label className="block">Nova data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border px-2" /></label>
      <label className="block">Novo horário<select value={startsAt} onChange={(event) => setStartsAt(event.target.value)} disabled={busy} className="mt-1 block min-h-10 w-full rounded-lg border px-2"><option value="">Selecione</option>{slots.map((slot) => <option key={slot.startsAt} value={slot.startsAt}>{slot.startTime} às {slot.endTime}</option>)}</select></label>
      {!busy && !slots.length && <p>Sem horários disponíveis nesta data.</p>}
      <label className="block">Motivo / combinado com o cliente<input maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border px-2" /></label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button type="button" disabled={busy || !startsAt || reason.trim().length < 3} onClick={save} className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-50">{busy ? 'Aguarde…' : 'Confirmar nova data'}</button>
    </>}
  </section>;
}
