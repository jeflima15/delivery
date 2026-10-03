import { useRef, useState } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { cashEntryCents } from '../../lib/cashEntry';
import { paymentMethodLabel } from '../../lib/paymentMethods';
import { useTenantAdminApi } from './TenantAdminContext';

export default function CashSessionDialog({ current, expected, onClose, onSaved }: { current: any; expected: Record<string, number>; onClose: () => void; onSaved: () => void }) {
  const api = useTenantAdminApi();
  const [action, setAction] = useState(current ? 'close' : 'open');
  const [amount, setAmount] = useState(current ? '' : '0,00');
  const [note, setNote] = useState('');
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef, () => { if (!busy) onClose(); });
  const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const hasDifference = Object.entries(expected).some(([method, value]) => cashEntryCents(counted[method] || '') !== value);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setError('');
    const cents = cashEntryCents(amount);
    const values = Object.fromEntries(Object.keys(expected).map(method => [method, cashEntryCents(counted[method] || '')]));
    if (action === 'close' && Object.values(values).some(value => value === null)) { setError('Informe o valor contado de cada forma de pagamento.'); return; }
    if (action !== 'close' && (cents === null || (action !== 'open' && cents <= 0))) { setError('Informe um valor válido.'); return; }
    if (((action === 'close' && hasDifference) || action === 'supply' || action === 'withdrawal') && note.trim().length < 3) { setError('Informe um motivo com pelo menos 3 caracteres.'); return; }
    setBusy(true);
    try {
      if (action === 'open') await api.openCash(cents!);
      else if (action === 'close') await api.closeCash(values as Record<string, number>, note.trim());
      else await api.addCashMovement({ type: action as 'supply' | 'withdrawal', amountCents: cents!, note: note.trim() });
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="cash-session-title" tabIndex={-1} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
      <h2 id="cash-session-title" className="text-lg font-semibold text-slate-900">{current ? 'Conferir e operar o caixa' : 'Abrir caixa'}</h2>
      <form onSubmit={submit} className="mt-4 space-y-4"><fieldset disabled={busy} className="space-y-4">
        {current && <label className="block text-sm font-medium">Operação<select value={action} onChange={event => { setAction(event.target.value); setError(''); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="close">Conferir e fechar</option><option value="supply">Entrada de dinheiro</option><option value="withdrawal">Retirada de dinheiro</option></select></label>}
        {action === 'close' ? <div className="space-y-3">{Object.entries(expected).map(([method, expectedCents]) => {
          const value = cashEntryCents(counted[method] || '');
          return <label key={method} className="block rounded-lg border p-3 text-sm"><span className="font-medium">{paymentMethodLabel(method)}</span><span className="float-right text-slate-500">Esperado: {money(expectedCents)}</span><input aria-label={'Valor contado em ' + paymentMethodLabel(method)} inputMode="decimal" value={counted[method] || ''} onChange={event => setCounted(values => ({ ...values, [method]: event.target.value }))} placeholder="Valor contado (R$)" required className="mt-2 min-h-11 w-full rounded-lg border px-3" />{value !== null && <span className={'mt-2 block text-xs ' + (value === expectedCents ? 'text-emerald-700' : 'text-amber-800')}>Diferença: {money(value - expectedCents)}</span>}</label>;
        })}</div> : <label className="block text-sm font-medium">{action === 'open' ? 'Saldo inicial em dinheiro (R$)' : 'Valor (R$)'}<input data-dialog-autofocus inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>}
        {action !== 'open' && <label className="block text-sm font-medium">{action === 'close' ? 'Observação / justificativa da diferença' : 'Motivo'}<textarea required={action !== 'close' || hasDifference} value={note} onChange={event => setNote(event.target.value)} minLength={3} maxLength={500} className="mt-1 w-full rounded-lg border p-3" /></label>}
      </fieldset>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border px-4 text-sm">Cancelar</button><button disabled={busy} className="min-h-11 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white">{busy ? 'Salvando…' : action === 'close' ? 'Confirmar fechamento' : 'Confirmar'}</button></div></form>
    </div>
  </div>;
}

