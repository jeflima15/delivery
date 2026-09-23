import { useState } from 'react';
import { BulkHours } from './WeeklyHoursEditor';
import { preorderSettingsSchema, type PreorderSettings } from '../../lib/preorderScheduling';

const DAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const inputClass = 'mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500';
const buttonClass = 'min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
type Interval = PreorderSettings['weeklySchedule'][number]['intervals'][number];

export function preorderDraftError(value: unknown): string | null {
  const parsed = preorderSettingsSchema.safeParse(value);
  if (parsed.success) return null;
  const field = parsed.error.issues[0]?.path[0];
  if (field === 'weeklySchedule' || field === 'dateOverrides') return 'Confira a agenda: datas e dias não podem se repetir. Cada faixa precisa ter início antes do fim, sem sobrepor outra faixa.';
  if (field === 'minLeadMinutes') return 'Informe uma antecedência válida, em minutos inteiros, de zero até 365 dias.';
  if (field === 'maxAdvanceDays') return 'Informe de 1 a 365 dias para o prazo máximo.';
  if (field === 'slotMinutes') return 'O intervalo dos horários deve ter de 5 a 1.440 minutos inteiros.';
  if (field === 'maxOrdersPerDay' || field === 'maxOrdersPerSlot') return 'Os limites devem ser números inteiros maiores que zero. Deixe vazio para não limitar.';
  return 'Confira as regras: a antecedência mínima não pode ser maior que o prazo máximo para encomendar.';
}

function IntervalsEditor({ value, onChange, label }: { value: Interval[]; onChange: (value: Interval[]) => void; label: string }) {
  return <div className="space-y-2">
    {value.map((interval, index) => <div key={index} className="flex flex-wrap items-end gap-2">
      <label className="min-w-28 flex-1 text-xs text-slate-600">Das
        <input aria-label={`${label}: início ${index + 1}`} type="time" className={inputClass} value={interval.start} onChange={(event) => onChange(value.map((item, i) => i === index ? { ...item, start: event.target.value } : item))} />
      </label>
      <label className="min-w-28 flex-1 text-xs text-slate-600">Até
        <input aria-label={`${label}: fim ${index + 1}`} type="time" className={inputClass} value={interval.end === '24:00' ? '00:00' : interval.end} onChange={(event) => onChange(value.map((item, i) => i === index ? { ...item, end: event.target.value === '00:00' ? '24:00' : event.target.value } : item))} />
      </label>
      <button type="button" className={buttonClass} aria-label={`${label}: remover faixa ${index + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}>Remover</button>
    </div>)}
    <button type="button" className={buttonClass} disabled={value.length >= 24} onClick={() => onChange([...value, { start: '09:00', end: '18:00' }])}>Adicionar faixa</button>
  </div>;
}

export default function PreorderSettingsEditor({ value, onChange, disabled = false, enabled = false, onEnabledChange }: {
  value?: PreorderSettings; onChange: (value: PreorderSettings) => void; disabled?: boolean; enabled?: boolean; onEnabledChange?: (enabled: boolean) => void;
}) {
  const settings = { ...preorderSettingsSchema.parse({}), ...value };
  const [leadUnit, setLeadUnit] = useState(1_440);
  const error = preorderDraftError(settings);
  const activationWarning = enabled && settings.salesMode === 'immediate_only'
    ? 'Escolha “Somente por encomenda” ou “Pronta entrega e encomendas” antes de salvar a ativação.'
    : enabled && !settings.weeklySchedule.some((day) => day.intervals.length) && !settings.dateOverrides.some((day) => day.intervals.length)
      ? 'Defina pelo menos um dia ou uma data especial com horário antes de salvar a ativação.'
      : null;
  const update = (patch: Partial<PreorderSettings>) => onChange({ ...settings, ...patch });
  const updateDay = (weekday: number, intervals: Interval[]) => update({ weeklySchedule: [
    ...settings.weeklySchedule.filter((day) => day.weekday !== weekday), { weekday, intervals },
  ].sort((a, b) => a.weekday - b.weekday) });
  const activeDays = settings.weeklySchedule.filter((day) => day.intervals.length).length;
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="preorder-heading">
    <h3 id="preorder-heading" className="text-sm font-semibold text-slate-900">Encomendas: regras para datas futuras</h3>
    <p className="mt-1 text-xs leading-relaxed text-slate-600">Esta agenda é independente da abertura para pedidos imediatos. Configure as opções e salve para publicar.</p>
    <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900">
      {enabled ? 'No rascunho, as encomendas estão ativas. Depois de salvar, estas regras passam a valer para novos pedidos; pedidos existentes mantêm a data e o sinal combinados.' : 'No rascunho, as encomendas estão desativadas. Configure a agenda e ative-a antes de salvar para receber pedidos agendados.'}
    </p>
    <fieldset disabled={disabled} className="mt-5 space-y-5 disabled:opacity-60">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange?.(event.target.checked)} />Publicar encomendas no cardápio</label>
      <p className="text-xs text-slate-500">Desativar a agenda impede novas encomendas após salvar, sem mudar a abertura de pedidos para agora. Para pausar novas encomendas mantendo as regras, use “Aceitar novas encomendas”.</p>
      <label className="block text-xs font-semibold text-slate-700">Como você pretende vender?
        <select className={inputClass} value={settings.salesMode} onChange={(event) => update({ salesMode: event.target.value as PreorderSettings['salesMode'] })}>
          <option value="immediate_only">Somente pronta entrega</option>
          <option value="scheduled_only">Somente por encomenda</option>
          <option value="both">Pronta entrega e encomendas</option>
        </select>
      </label>
      {activationWarning && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{activationWarning}</p>}
      {settings.salesMode !== 'immediate_only' && <>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={settings.acceptingPreorders} onChange={(event) => update({ acceptingPreorders: event.target.checked })} />Aceitar novas encomendas</label>
        <p className="text-xs text-slate-500">Funciona mesmo quando os pedidos para agora estão fechados. Desmarcar pausa apenas novas encomendas, depois de salvar.</p>
        <label className="block text-xs font-semibold text-slate-700">Sinal para iniciar a produção
          <select className={inputClass} value={settings.depositPercent || 0} onChange={(event) => update({ depositPercent: Number(event.target.value) })}>
            {[0, 25, 30, 50, 100, ...(![0, 25, 30, 50, 100].includes(settings.depositPercent) ? [settings.depositPercent] : [])].map((value) => <option key={value} value={value}>{value === 0 ? 'Sem sinal obrigatório' : `${value}% via PIX, conferido manualmente`}</option>)}
          </select>
        </label>
        <p className="text-xs text-slate-500">A vaga fica reservada ao enviar o pedido. Sem pagamento, ela permanece ocupada até você cancelar. Confira o PIX no banco antes de registrar o sinal; não há confirmação automática. O saldo deve ser registrado antes de concluir a entrega.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="text-xs font-semibold text-slate-700" htmlFor="preorder-lead">Quanto tempo precisa para preparar?</label>
            <div className="flex gap-2">
              <input id="preorder-lead" type="number" min="0" step="any" className={inputClass} value={Number.isFinite(settings.minLeadMinutes) ? settings.minLeadMinutes / leadUnit : ''} onChange={(event) => update({ minLeadMinutes: event.target.value === '' ? NaN : Number(event.target.value) * leadUnit })} />
              <select aria-label="Unidade da antecedência" className={inputClass} value={leadUnit} onChange={(event) => setLeadUnit(Number(event.target.value))}><option value={1440}>dias</option><option value={60}>horas</option><option value={1}>minutos</option></select>
            </div>
          </div>
          <label className="text-xs font-semibold text-slate-700">Até quantos dias à frente o cliente pode agendar?
            <input className={inputClass} type="number" min="1" max="365" step="1" value={Number.isFinite(settings.maxAdvanceDays) ? settings.maxAdvanceDays : ''} onChange={(event) => update({ maxAdvanceDays: event.target.value === '' ? NaN : Number(event.target.value) })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={settings.allowSameDay} onChange={(event) => update({ allowSameDay: event.target.checked })} />Permitir encomendas para hoje, respeitando o tempo de preparo</label>
        <details className="rounded-xl border border-slate-200 p-3 sm:p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Intervalos e limites de pedidos</summary>
          <p className="mt-2 text-xs text-slate-500">Ajuste se precisar controlar o tamanho dos horários e quantos pedidos cabem em cada um.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="text-xs font-semibold text-slate-700">Intervalo dos horários (minutos)
            <input className={inputClass} type="number" min="5" max="1440" step="1" value={Number.isFinite(settings.slotMinutes) ? settings.slotMinutes : ''} onChange={(event) => update({ slotMinutes: event.target.value === '' ? NaN : Number(event.target.value) })} />
          </label>
          {(['maxOrdersPerDay', 'maxOrdersPerSlot'] as const).map((key) => <label key={key} className="text-xs font-semibold text-slate-700">{key === 'maxOrdersPerDay' ? 'Máximo de pedidos por dia' : 'Máximo de pedidos por horário'}
            <input className={inputClass} type="number" min="1" step="1" placeholder="Sem limite" value={settings[key] ?? ''} onChange={(event) => update({ [key]: event.target.value === '' ? null : Number(event.target.value) })} />
          </label>)}
        </div>
        <p className="text-xs leading-relaxed text-slate-500">Exemplo: das 9h às 12h, com intervalo de 60 minutos, oferece 9h–10h, 10h–11h e 11h–12h. Sobras menores que o intervalo não são oferecidas. Os limites contam pedidos, não produtos nem capacidade de produção.</p>
        </details>
        <details className="rounded-xl border border-slate-200 p-3 sm:p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Dias e horários para entrega ou retirada <span className="font-normal text-slate-500">({activeDays} dias)</span></summary>
          <p className="mt-3 text-xs text-slate-500">Esta agenda é separada dos horários de pedidos para agora. Para terminar à meia-noite, use 00:00 no campo Até. Para continuar depois, crie uma faixa no dia seguinte.</p>
          <div className="mt-3 divide-y divide-slate-100">
            <BulkHours scheduled value={settings.weeklySchedule} onChange={(weeklySchedule) => update({ weeklySchedule })} />
            {DAYS.map((day, weekday) => {
              const intervals = settings.weeklySchedule.find((entry) => entry.weekday === weekday)?.intervals ?? [];
              return <div key={weekday} className="grid gap-3 py-3 sm:grid-cols-[140px_1fr]">
                <label className="flex items-center gap-2 self-start pt-3 text-xs font-semibold text-slate-700"><input type="checkbox" checked={intervals.length > 0} onChange={(event) => updateDay(weekday, event.target.checked ? [{ start: '09:00', end: '18:00' }] : [])} />{day}</label>
                {intervals.length > 0 ? <IntervalsEditor label={day} value={intervals} onChange={(next) => updateDay(weekday, next)} /> : <p className="pt-3 text-xs text-slate-400">Sem entregas ou retiradas</p>}
              </div>;
            })}
          </div>
          {!settings.weeklySchedule.some((day) => day.intervals.length) && !settings.dateOverrides.some((day) => day.intervals.length) && <p className="text-xs text-amber-800">Nenhum horário definido. Escolha ao menos um dia para ter horários disponíveis no futuro.</p>}
        </details>
        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Datas especiais e folgas ({settings.dateOverrides.length})</summary>
          <p className="my-3 text-xs text-slate-500">A data especial substitui todos os horários daquele dia. Sem faixas, o dia fica bloqueado.</p>
          <div className="space-y-4">{settings.dateOverrides.map((override, index) => <div key={index} className="space-y-2 rounded-lg bg-slate-50 p-3">
            <label className="block text-xs font-semibold text-slate-700">Data especial {index + 1}<input type="date" className={inputClass} value={override.date} onChange={(event) => update({ dateOverrides: settings.dateOverrides.map((item, i) => i === index ? { ...item, date: event.target.value } : item) })} /></label>
            {!override.intervals.length && <p className="text-xs text-amber-800">Dia bloqueado para entrega e retirada.</p>}
            <IntervalsEditor label={`Data especial ${index + 1}`} value={override.intervals} onChange={(intervals) => update({ dateOverrides: settings.dateOverrides.map((item, i) => i === index ? { ...item, intervals } : item) })} />
            <button type="button" className={buttonClass} onClick={() => update({ dateOverrides: settings.dateOverrides.filter((_, i) => i !== index) })}>Excluir data especial {index + 1}</button>
          </div>)}</div>
          <button type="button" className={`${buttonClass} mt-3`} disabled={settings.dateOverrides.length >= 366} onClick={() => update({ dateOverrides: [...settings.dateOverrides, { date: '', intervals: [] }] })}>Adicionar data especial</button>
        </details>
      </>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-slate-500">Para publicar encomendas, escolha um modo com encomendas e pelo menos um horário. Sinal obrigatório exige PIX e chave configurados em Entrega e Pagamento. Depois, use “Salvar alterações”.</p>
    </fieldset>
  </section>;
}
