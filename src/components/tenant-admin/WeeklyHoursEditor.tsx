import { useState } from 'react';
import { applyHoursToDays, weekdayNames, type WeekHours } from '../../lib/weeklyHours';

const input = 'min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900';
const button = 'min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50';

export function BulkHours({ value, onChange, scheduled = false }: { value: WeekHours; onChange: (value: WeekHours) => void; scheduled?: boolean }) {
  const [days, setDays] = useState([1, 2, 3, 4, 5, 6]);
  const [start, setStart] = useState(scheduled ? '09:00' : '18:00');
  const [end, setEnd] = useState(scheduled ? '18:00' : '23:00');
  const [confirm, setConfirm] = useState(false);
  const normalizedEnd = scheduled && end === '00:00' ? '24:00' : end;
  const valid = days.length > 0 && start && end && start !== normalizedEnd && (!scheduled || start < normalizedEnd);
  const apply = () => { onChange(applyHoursToDays(value, days, start, normalizedEnd)); setConfirm(false); };
  return <div className="my-3 space-y-3 rounded-xl bg-emerald-50 p-3" onChange={() => setConfirm(false)}>
    <p className="text-sm font-semibold text-emerald-900">Preencher vários dias de uma vez</p>
    <p className="text-xs text-slate-600">Modelo sugerido. Ajuste antes de aplicar; dias não selecionados serão preservados.</p>
    <div className="flex flex-wrap gap-3">{weekdayNames.map((name, day) => <label key={day} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={days.includes(day)} onChange={(event) => setDays(event.target.checked ? [...days, day].sort() : days.filter((item) => item !== day))} />{name}</label>)}</div>
    <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs">Das<input aria-label="Horário em lote: início" type="time" className={input} value={start} onChange={(event) => setStart(event.target.value)} /></label><label className="grid gap-1 text-xs">Até<input aria-label="Horário em lote: fim" type="time" className={input} value={end} onChange={(event) => setEnd(event.target.value)} /></label>
      <button type="button" className={button} disabled={!valid} onClick={() => value.some((day) => days.includes(day.weekday) && day.intervals.length) ? setConfirm(true) : apply()}>Aplicar aos dias selecionados</button></div>
    {scheduled && start >= normalizedEnd && <p className="text-xs text-amber-900">Na agenda, use uma faixa no dia seguinte para continuar após a meia-noite.</p>}
    {confirm && <div role="alert" className="space-y-2 text-sm text-amber-900"><p>Substituir todos os turnos de {days.map((day) => weekdayNames[day]).join(', ')}? As exceções desses dias serão substituídas. Datas especiais não mudam.</p><button type="button" className={button} onClick={apply}>Confirmar substituição</button> <button type="button" className={button} onClick={() => setConfirm(false)}>Cancelar</button></div>}
  </div>;
}

export default function WeeklyHoursEditor({ value, onChange, scheduled = false }: { value: WeekHours; onChange: (value: WeekHours) => void; scheduled?: boolean }) {
  const updateDay = (weekday: number, intervals: WeekHours[number]['intervals']) => onChange([...value.filter((day) => day.weekday !== weekday), { weekday, intervals }].sort((a, b) => a.weekday - b.weekday));
  const defaultInterval = { start: scheduled ? '09:00' : '18:00', end: scheduled ? '18:00' : '23:00' };
  return <><BulkHours value={value} onChange={onChange} scheduled={scheduled} />
    <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Personalizar por dia</summary>
      {weekdayNames.map((name, weekday) => {
        const intervals = value.find((day) => day.weekday === weekday)?.intervals || [];
        return <div key={weekday} className="space-y-2 border-b border-slate-100 py-3"><label className="flex gap-2 text-sm font-semibold"><input type="checkbox" checked={!!intervals.length} onChange={(event) => updateDay(weekday, event.target.checked ? [{ ...defaultInterval }] : [])} />{name}</label>
          {!intervals.length && <p className="text-xs text-slate-500">Sem atendimento</p>}
          {intervals.map((interval, index) => <div key={index} className="flex flex-wrap items-center gap-2">{(['start', 'end'] as const).map((key) => <label key={key} className="grid gap-1 text-xs">{key === 'start' ? 'Das' : 'Até'}<input type="time" aria-label={`${name}: ${key === 'start' ? 'início' : 'fim'} ${index + 1}`} className={input} value={interval[key] === '24:00' ? '00:00' : interval[key]} onChange={(event) => updateDay(weekday, intervals.map((item, i) => i === index ? { ...item, [key]: scheduled && key === 'end' && event.target.value === '00:00' ? '24:00' : event.target.value } : item))} /></label>)}<button type="button" className={button} aria-label={`${name}: remover turno ${index + 1}`} onClick={() => updateDay(weekday, intervals.filter((_, i) => i !== index))}>Remover</button>{!scheduled && interval.end < interval.start && <span className="text-xs text-amber-800">Termina no dia seguinte</span>}</div>)}
          {!!intervals.length && intervals.length < (scheduled ? 24 : 2) && <button type="button" className={button} onClick={() => updateDay(weekday, [...intervals, { start: '11:00', end: '14:00' }])}>Adicionar turno</button>}
        </div>;
      })}
    </details>
    <p className="mt-3 text-xs text-slate-600">{value.filter((day) => day.intervals.length).sort((a, b) => a.weekday - b.weekday).map((day) => `${weekdayNames[day.weekday]}: ${day.intervals.map((i) => `${i.start}–${i.end}`).join(' / ')}`).join(' · ') || 'Nenhum horário definido.'}</p>
  </>;
}
