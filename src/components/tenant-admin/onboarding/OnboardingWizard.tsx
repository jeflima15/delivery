import { useEffect, useRef, useState } from 'react';
import { useTenantAdminApi } from '../TenantAdminContext';
import { initialOnboardingDraft, onboardingSettings, onboardingStepError, salesModes, setupSteps, weekLabels, onboardingWeek, selectSalesMode, type OnboardingDraft } from '../../../lib/onboardingSetup';

import WeeklyHoursEditor from '../WeeklyHoursEditor';
import PushSettings from '../PushSettings';

const fieldClass = 'mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const actionClass = 'min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
type Status = Awaited<ReturnType<ReturnType<typeof useTenantAdminApi>['getOnboardingStatus']>>;

export default function OnboardingWizard({ slug, onClose, onComplete, canCreateProduct }: { slug: string; onClose: () => void; onComplete: () => void; canCreateProduct: boolean }) {
  const api = useTenantAdminApi();
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const revision = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const lastSaved = useRef('');
  const stopped = useRef(false);
  const load = async () => {
    try {
      const data = await api.getOnboardingStatus();
      if (data.onboarding.completed) { onComplete(); return; }
      revision.current = data.onboarding.revision || 0;
      const value = data.onboarding.draft || initialOnboardingDraft(data.settings || {});
      const stage = /^setup-[0-5]$/.test(data.onboarding.step) ? Number(data.onboarding.step.slice(-1)) : 0;
      lastSaved.current = JSON.stringify([value, stage]);
      stopped.current = false; setStatus(data); setDraft(value); setStep(stage); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar sua configuração.'); }
  };
  useEffect(() => { void load(); }, [api]);
  const persist = (value: OnboardingDraft, stage: number) => {
    const job = queue.current.catch(() => undefined).then(async () => {
      if (stopped.current) throw new Error('Reabra o assistente para carregar a versão mais recente.');
      const signature = JSON.stringify([value, stage]);
      if (lastSaved.current === signature) return;
      setSaveState('Salvando progresso…');
      try {
        const data = await api.saveOnboardingDraft(value, stage, revision.current);
        revision.current = data.revision; lastSaved.current = signature; setSaveState('Progresso salvo');
      } catch (err) {
        if ((err as { status?: number }).status === 409) stopped.current = true;
        setSaveState('Não foi possível salvar. Tente novamente antes de sair.'); throw err;
      }
    });
    queue.current = job;
    return job;
  };
  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => { void persist(draft, step).catch(() => undefined); }, 700);
    return () => clearTimeout(timer);
  }, [draft, step]);
  const update = (patch: Partial<OnboardingDraft>) => { setDraft((current) => current ? { ...current, ...patch } : current); setApplied(false); setError(''); };
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar. Tente novamente.'); }
    finally { setBusy(false); }
  };
  const leave = () => run(async () => { if (draft) await persist(draft, step); onClose(); });
  const next = () => run(async () => {
    if (!draft) return;
    const message = onboardingStepError(draft, step);
    if (message) throw new Error(message);
    if (step === 4) {
      const current = await api.getOnboardingStatus(); setStatus(current);
      if (!current.readiness.checks.product) throw new Error('Cadastre pelo menos um produto disponível antes de continuar.');
    }
    await persist(draft, step + 1); setStep(step + 1);
  });
  const createProduct = () => run(async () => {
    if (!draft) return;
    const price = Number(draft.productPrice.replace(',', '.'));
    if (!draft.productName.trim() || !draft.productPrice.trim() || !Number.isFinite(price) || price < 0) throw new Error('Informe o nome e um preço válido para o produto.');
    await persist(draft, step);
    const current = await api.getOnboardingStatus();
    if (!current.readiness.checks.product) {
      const categories = await api.listCategories();
      const category = categories.items[0] || (await api.createCategory({ nome: 'Cardápio', ordem: 0 })).category;
      await api.createProduct({ nome: draft.productName.trim(), preco: price, categoriaId: category._id, ativo: true, controlar_estoque: false, preorderDraft: { availability: draft.mode === 'both' ? draft.productMode : 'inherit' } });
    }
    setStatus(await api.getOnboardingStatus());
  });
  const apply = () => run(async () => {
    if (!draft || !status) return;
    for (let index = 0; index < 4; index++) { const message = onboardingStepError(draft, index); if (message) { setStep(index); throw new Error(message); } }
    await persist(draft, step);
    await api.updateSettings(onboardingSettings(draft, status.settings || {}));
    setStatus(await api.getOnboardingStatus()); setApplied(true);
  });
  const complete = () => run(async () => { await queue.current; await api.completeOnboarding(); stopped.current = true; onComplete(); });
  const input = (key: keyof OnboardingDraft, label: string, options: { type?: string; placeholder?: string } = {}) => <label className="block text-sm font-medium text-slate-700">{label}<input className={fieldClass} type={options.type || 'text'} value={String(draft?.[key] ?? '')} placeholder={options.placeholder} onChange={(event) => update({ [key]: event.target.value })} /></label>;
  const hours = (scheduled: boolean) => {
    if (!draft) return null;
    return <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-900">{scheduled ? 'Dias e horários para entregar ou retirar encomendas' : 'Funcionamento dos pedidos para agora'}</h3>
      <p className="text-xs text-slate-500">{scheduled ? 'Escolha quando o cliente pode receber ou buscar. As janelas iniciais são de uma hora.' : 'A loja abrirá e fechará automaticamente nestes horários.'}</p>
      <WeeklyHoursEditor scheduled={scheduled} value={onboardingWeek(draft, scheduled)} onChange={(week) => update(scheduled ? { scheduleWeek: week } : { immediateWeek: week })} />
    </div>;
  };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-2 sm:p-5">
    <section role="dialog" aria-modal="true" aria-label="Configurar minha loja" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <header className="shrink-0 border-b border-slate-100 bg-emerald-50 p-4 sm:p-6"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-emerald-800">Sua loja, do seu jeito · Etapa {step + 1} de 6</p><button disabled={busy} onClick={leave} className="text-xs font-semibold text-slate-600">Salvar e sair</button></div><h2 className="mt-2 text-xl font-bold text-slate-900">{setupSteps[step]}</h2><div className="mt-3 h-1.5 rounded-full bg-emerald-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${(step + 1) / 6 * 100}%` }} /></div></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {!draft ? <p>Carregando sua loja…</p> : <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
          {step === 0 && <><p className="text-sm text-slate-600">Como você trabalha? Essa escolha prepara as próximas etapas. Você poderá mudar depois nas configurações.</p><div className="space-y-2">{salesModes.map((mode) => <label key={mode.value} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${draft.mode === mode.value ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'}`}><input type="radio" name="sales-mode" value={mode.value} checked={draft.mode === mode.value} onChange={() => update(selectSalesMode(draft, mode.value))} /><span><strong className="block text-sm">{mode.label}</strong><span className="text-xs text-slate-600">{mode.description}</span></span></label>)}</div>{input('name', 'Nome da loja')}{input('phone', 'WhatsApp da loja', { type: 'tel' })}</>}
          {step === 1 && <><p className="text-sm text-slate-600">Como seu pedido chega ao cliente?</p><div className="flex flex-wrap gap-4">{[['pickup', 'Retirada'], ['delivery', 'Entrega'], ['both', 'Entrega e retirada']].map(([value, label]) => <label key={value} className="flex gap-2 text-sm"><input type="radio" name="service" checked={draft.service === value} onChange={() => update({ service: value as OnboardingDraft['service'] })} />{label}</label>)}</div><p className="text-xs text-slate-500">{draft.service === 'delivery' ? 'Endereço de saída dos pedidos.' : 'Informe onde o cliente poderá retirar o pedido.'}</p>{input('street', 'Rua') }<div className="grid grid-cols-2 gap-3">{input('number', 'Número')}{input('neighborhood', 'Bairro')}</div><div className="grid grid-cols-2 gap-3">{input('city', 'Cidade')}{input('state', 'UF')}</div>{input('cep', 'CEP')}{draft.service && draft.service !== 'pickup' && <>{input('shipping', 'Taxa fixa de entrega (R$)', { placeholder: '0,00 para entrega gratuita' })}<p className="text-xs text-slate-500">Nesta configuração inicial a taxa vale para todos os endereços aceitos. Para limitar por bairro ou região, configure em Loja → Entrega e Pagamento antes de divulgar.</p></>}</>}
          {step === 2 && <>{draft.mode !== 'scheduled_only' && <>{hours(false)}{input('estimate', 'Previsão para pedidos imediatos', { placeholder: 'Ex.: 40–60 min' })}</>}{draft.mode !== 'immediate_only' && <>{input('leadDays', 'Quantos dias de antecedência você precisa?', { type: 'number', placeholder: 'Ex.: 2 dias (48 horas corridas)' })}{hours(true)}<p className="text-xs text-slate-500">A agenda começa com horizonte de 30 dias. Produtos podem ter prazos próprios. Limites, segundo turno e datas especiais ficam em Loja → Horários & Operação.</p></>}</>}
          {step === 3 && <><p className="text-sm text-slate-600">Quais formas de pagamento você aceita?</p><div className="flex gap-4">{[['pix', 'PIX'], ['cash', 'Dinheiro'], ['card', 'Cartão']].map(([key, label]) => <label key={key} className="flex gap-2 text-sm"><input type="checkbox" checked={Boolean(draft[key as keyof OnboardingDraft])} onChange={(event) => update({ [key]: event.target.checked })} />{label}</label>)}</div>{draft.pix && input('pixKey', 'Chave PIX')}{draft.mode !== 'immediate_only' && <><label className="block text-sm font-medium">Você cobra sinal para começar a produção?<select className={fieldClass} value={draft.deposit} onChange={(event) => update({ deposit: event.target.value as OnboardingDraft['deposit'] })}><option value="">Selecione</option><option value="0">Não exijo sinal</option>{[25, 30, 50, 100].map((value) => <option key={value} value={value}>{value}% antecipado via PIX</option>)}</select></label><p className="text-xs leading-5 text-slate-600">Você confere o PIX no banco e registra o recebimento no pedido. Não há cobrança automática. Sem pagamento, a vaga fica reservada até você cancelar.</p></>}</>}
          {step === 4 && <>{status?.readiness.checks.product ? <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Seu catálogo já tem um produto disponível. Você pode continuar.</p> : <>{input('productName', 'Nome do primeiro produto')}{input('productPrice', 'Preço (R$)')}{draft.mode === 'both' && <label className="block text-sm">Como este produto será vendido?<select className={fieldClass} value={draft.productMode} onChange={(event) => update({ productMode: event.target.value as OnboardingDraft['productMode'] })}><option value="inherit">Pronta entrega e encomenda (padrão da loja)</option><option value="immediate_only">Somente pronta entrega</option><option value="scheduled_only">Somente por encomenda</option></select></label>}<p className="text-xs text-slate-500">O produto seguirá o prazo da loja. Fotos, adicionais e prazo próprio podem ser ajustados em Catálogo → Cadastro de Produtos.</p><button type="button" disabled={!canCreateProduct} onClick={createProduct} className={actionClass}>Cadastrar produto</button>{!canCreateProduct && <p className="text-xs text-amber-800">Peça ao responsável pelo catálogo para cadastrar um produto.</p>}</>}<button type="button" className="block text-sm font-semibold text-emerald-700 underline" onClick={() => run(async () => setStatus(await api.getOnboardingStatus()))}>Atualizar catálogo</button></>}
          {step === 5 && <><p className="text-sm text-slate-600">Confira antes de aplicar. Estas escolhas substituirão o modo de venda, atendimento, horários semanais e pagamentos atuais.</p><dl className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm"><div><dt className="font-semibold">{draft.name}</dt><dd>{salesModes.find((mode) => mode.value === draft.mode)?.label} · WhatsApp {draft.phone}</dd></div><div><dt className="font-semibold">Atendimento</dt><dd>{draft.service === 'both' ? 'Entrega e retirada' : draft.service === 'pickup' ? 'Retirada' : 'Entrega'} · {draft.street}, {draft.number}, {draft.city}</dd>{draft.service !== 'pickup' && <dd>Taxa fixa: R$ {draft.shipping}</dd>}</div>{draft.mode !== 'scheduled_only' && <div><dt className="font-semibold">Pedidos para agora</dt><dd>{onboardingWeek(draft, false).filter((day) => day.intervals.length).map((day) => `${weekLabels[day.weekday]}: ${day.intervals.map((i) => `${i.start}–${i.end}`).join(' / ')}`).join(' · ')} · previsão {draft.estimate}</dd></div>}{draft.mode !== 'immediate_only' && <div><dt className="font-semibold">Encomendas</dt><dd>Antecedência de {draft.leadDays} dia(s) · {onboardingWeek(draft, true).filter((day) => day.intervals.length).map((day) => `${weekLabels[day.weekday]}: ${day.intervals.map((i) => `${i.start}–${i.end}`).join(' / ')}`).join(' · ')}</dd><dd>{Number(draft.deposit) ? `Sinal de ${draft.deposit}% via PIX` : 'Sem sinal obrigatório'}</dd></div>}<div><dt className="font-semibold">Pagamentos</dt><dd>{[draft.pix && 'PIX', draft.cash && 'Dinheiro', draft.card && 'Cartão'].filter(Boolean).join(', ')}</dd></div></dl><button type="button" className={actionClass} onClick={apply}>Confirmar e aplicar configurações</button>{applied && <div className="space-y-3 rounded-xl border border-emerald-200 p-4"><p className="text-sm text-emerald-800">Configurações aplicadas. Confira sua vitrine antes de concluir.</p><a className="block text-sm font-semibold text-emerald-700 underline" href={`/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer">Visualizar minha loja</a>{status?.readiness.ready ? <button type="button" className={actionClass} onClick={complete}>Concluir configuração</button> : <p className="text-sm text-amber-800">Ainda há configurações pendentes. Revise os dados ou consulte o checklist no início do painel.</p>}</div>}</>}
          {step === 5 && <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Opcional: receber avisos neste celular</summary><div className="mt-3"><PushSettings /></div></details>}
        </fieldset>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {stopped.current && <button disabled={busy} onClick={() => run(async () => { await queue.current.catch(() => undefined); await load(); })} className="mt-3 text-sm font-semibold text-emerald-700 underline">Carregar a versão salva e descartar estas alterações locais</button>}
        {!draft && error && <button onClick={load} className="mt-2 text-sm underline">Tentar novamente</button>}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4"><span role="status" className="text-xs text-slate-500">{saveState || 'Seu progresso será salvo automaticamente'}</span><div className="flex gap-3">{step > 0 && <button disabled={busy} onClick={() => setStep(step - 1)} className="text-sm font-semibold text-slate-600">Voltar</button>}{step < 5 && <button disabled={busy || !draft} onClick={next} className={actionClass}>{busy ? 'Salvando…' : 'Continuar'}</button>}</div></footer>
    </section>
  </div>;
}
