import { useState } from 'react';
import { preorderProductPolicySchema, type PreorderProductPolicy } from '../../lib/preorderScheduling';

const inputClass = 'mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500';

export function productPreorderError(value: unknown): string | null {
  return preorderProductPolicySchema.safeParse(value).success
    ? null : 'Confira as regras de encomenda: use um prazo entre zero e 365 dias, equivalente a minutos inteiros.';
}

export default function ProductPreorderEditor({ value, onChange, disabled = false }: {
  value?: PreorderProductPolicy;
  onChange: (value: PreorderProductPolicy) => void;
  disabled?: boolean;
}) {
  const original = value ?? preorderProductPolicySchema.parse({});
  const policy = { ...original, availability: original.availability === 'inherit' ? 'immediate_only' as const : original.availability };
  const [unit, setUnit] = useState(() => policy.minLeadMinutes != null && policy.minLeadMinutes % 1440 !== 0
    ? policy.minLeadMinutes % 60 === 0 ? 60 : 1 : 1440);
  const update = (patch: Partial<PreorderProductPolicy>) => onChange({ ...policy, ...patch });
  const error = productPreorderError(policy);
  return <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
    <h3 className="text-sm font-semibold text-slate-900">Forma de venda</h3>
    <fieldset disabled={disabled} className="mt-3 space-y-4 disabled:opacity-60">
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Estas regras valem quando a agenda está ativada em Loja → Horários & Operação. Sem ativação, o cardápio continua com atendimento imediato.</p>
      <label className="block text-xs font-semibold text-slate-700">Como este item poderá ser vendido?
        <select className={inputClass} value={policy.availability} onChange={(event) => update({ availability: event.target.value as PreorderProductPolicy['availability'] })}>
          <option value="scheduled_only">Somente por encomenda</option>
          <option value="immediate_only">Pedido para agora</option>
          {policy.availability === 'both' && <option value="both">Agora e agendado (configuração anterior)</option>}
        </select>
      </label>
      <p className="text-xs leading-relaxed text-slate-500">O item respeita o modo permitido pela loja. Combos também respeitam os prazos e restrições dos produtos que os compõem.</p>
      {policy.availability === 'immediate_only' && <p className="text-sm text-slate-600">Disponível durante o funcionamento. Não vira encomenda quando a loja fecha.</p>}
      {policy.availability !== 'immediate_only' && <><label className="flex items-center gap-2 text-xs font-medium text-slate-700">
        <input type="checkbox" checked={policy.minLeadMinutes == null} onChange={(event) => update({ minLeadMinutes: event.target.checked ? null : 2880 })} />Usar o tempo de preparo da loja
      </label>
      {policy.minLeadMinutes != null && <div>
        <label className="block text-xs font-semibold text-slate-700">Tempo de preparo deste item
          <input type="number" min="0" max={525600 / unit} step="any" required className={inputClass} value={Number.isFinite(policy.minLeadMinutes) ? policy.minLeadMinutes / unit : ''} onChange={(event) => update({ minLeadMinutes: event.target.value === '' ? NaN : Number(event.target.value) * unit })} />
        </label>
        <label className="mt-2 block text-xs font-medium text-slate-700">Unidade do prazo do item
          <select className={inputClass} value={unit} onChange={(event) => setUnit(Number(event.target.value))}><option value={1440}>dias</option><option value={60}>horas</option><option value={1}>minutos</option></select>
        </label>
        <p className="mt-2 text-xs text-slate-500">Este prazo substitui o padrão da loja para o item. Um pedido com vários itens respeita o maior prazo necessário.</p>
      </div>}
      </>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <p className="text-xs text-slate-500">Não exige controle de estoque. Use o botão de salvar do cadastro para guardar estas regras.</p>
    </fieldset>
  </section>;
}
