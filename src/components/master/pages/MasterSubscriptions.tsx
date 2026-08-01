import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { jsonInit, masterRequest, queryString } from '../api';
import { useDebounced, useRemote } from '../hooks';
import type { ListResponse, Plan, Subscription, SubscriptionStatus, Tenant } from '../types';
import { date, money } from '../utils';
import { ConfirmReasonModal, EmptyState, ErrorState, LoadingState, Modal, PageHeader, PaginationBar, StatusBadge, TableShell, buttonPrimary, buttonSecondary, fieldClass } from '../components/MasterUI';

export default function MasterSubscriptions({ navigate, notify }: { navigate: (path: string) => void; notify: (tone: 'success' | 'error' | 'info', message: string) => void }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [status, setStatus] = useState('');
  const [planId, setPlanId] = useState('');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<{ item: Subscription; status: SubscriptionStatus } | null>(null);
  const [editing, setEditing] = useState<Subscription | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const remote = useRemote(
    () => masterRequest<ListResponse<Subscription>>(`/subscriptions${queryString({ search: debounced, status, planId, page, limit: 25 })}`),
    [debounced, status, planId, page],
  );
  const plans = useRemote(() => masterRequest<ListResponse<Plan>>('/plans?limit=100&active=true'), []);
  const tenants = useRemote(() => masterRequest<ListResponse<Tenant>>('/tenants?limit=100&sort=name'), []);

  const updateStatus = async (reason: string) => {
    if (!action || reason.length < 5) return;
    setBusy(true);
    try {
      await masterRequest(`/subscriptions/${action.item._id}`, jsonInit('PATCH', { status: action.status, reason }));
      notify('success', 'Assinatura atualizada.'); setAction(null); remote.refresh();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao atualizar.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <PageHeader eyebrow="Ciclo comercial" title="Assinaturas" description="Acompanhe trial, renovação e situação contratual sem simular cobrança automática." actions={<button className={buttonPrimary} onClick={() => setEditing('new')}><Plus className="h-4 w-4"/>Atribuir assinatura</button>}/>
    <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-[1fr_180px_220px]">
      <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500"/><input className={`${fieldClass} pl-10`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Loja ou responsável"/></label>
      <select className={fieldClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option><option value="trial">Trial</option><option value="active">Ativa</option><option value="past_due">Inadimplente</option><option value="suspended">Suspensa</option><option value="cancelled">Cancelada</option></select>
      <select className={fieldClass} value={planId} onChange={(event) => { setPlanId(event.target.value); setPage(1); }}><option value="">Todos os planos</option>{plans.data?.items.map((plan) => <option key={plan._id} value={plan._id}>{plan.name}</option>)}</select>
    </div>
    {remote.loading && !remote.data ? <LoadingState rows={7}/> : remote.error ? <ErrorState message={remote.error} retry={remote.refresh}/> : <TableShell>
      <table className="min-w-[1120px] w-full text-left text-sm"><thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Loja</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Período</th><th className="px-4 py-3">Fim do trial</th><th className="px-4 py-3 text-right">Recorrência</th><th className="px-4 py-3 text-right">Ações</th></tr></thead>
        <tbody className="divide-y divide-slate-800">{remote.data?.items.map((item) => <tr key={item._id} className="hover:bg-slate-800/30"><td className="px-4 py-3"><button onClick={() => navigate(`/master/lojas/${item.tenant?._id || item.tenantId}`)} className="text-left"><strong className="block text-slate-200">{item.tenant?.displayName || 'Loja'}</strong><small className="text-slate-500">{item.tenant?.owner?.email}</small></button></td><td className="px-4 py-3 text-slate-300">{item.plan?.name || '—'}<p className="text-xs text-slate-500">{item.plan?.interval === 'yearly' ? 'Anual' : 'Mensal'}</p></td><td className="px-4 py-3"><StatusBadge status={item.status}/></td><td className="px-4 py-3 text-slate-400">{date(item.currentPeriodStart)} a {date(item.currentPeriodEnd)}</td><td className="px-4 py-3 text-slate-400">{date(item.trialEndsAt)}</td><td className="px-4 py-3 text-right tabular-nums text-white">{money(item.plan?.priceCents || 0)}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button className={buttonSecondary} onClick={() => setEditing(item)}>Trocar plano</button>{item.status !== 'active' && <button className={buttonSecondary} onClick={() => setAction({ item, status: 'active' })}>Reativar</button>}{item.status === 'active' && <button className={buttonSecondary} onClick={() => setAction({ item, status: 'suspended' })}>Suspender</button>}{item.status !== 'cancelled' && <button className={buttonSecondary} onClick={() => setAction({ item, status: 'cancelled' })}>Cancelar</button>}</div></td></tr>)}</tbody>
      </table>
      {!remote.data?.items.length && <EmptyState title="Nenhuma assinatura encontrada"/>}
      {remote.data && <PaginationBar pagination={remote.data.pagination} onPage={setPage}/>}
    </TableShell>}
    <SubscriptionModal
      key={editing === 'new' ? 'new' : editing?._id || 'closed'}
      open={editing !== null}
      subscription={editing === 'new' ? null : editing}
      plans={plans.data?.items || []}
      tenants={(tenants.data?.items || []).filter((tenant) => !tenant.subscription)}
      onClose={() => setEditing(null)}
      onSaved={() => { setEditing(null); notify('success', editing === 'new' ? 'Assinatura atribuída.' : 'Plano da assinatura atualizado.'); remote.refresh(); tenants.refresh(); }}
    />
    <ConfirmReasonModal open={Boolean(action)} busy={busy} title="Alterar assinatura" description={`A assinatura será alterada para ${action?.status || ''}. O estado da loja será mantido coerente.`} confirmLabel="Confirmar" onClose={() => setAction(null)} onConfirm={updateStatus}/>
  </div>;
}

function SubscriptionModal({ open, subscription, plans, tenants, onClose, onSaved }: { open: boolean; subscription: Subscription | null; plans: Plan[]; tenants: Tenant[]; onClose: () => void; onSaved: () => void }) {
  const [tenantId, setTenantId] = useState(subscription?.tenant?._id || '');
  const [planId, setPlanId] = useState(subscription?.plan?._id || '');
  const [status, setStatus] = useState<'trial' | 'active'>(subscription?.status === 'trial' ? 'trial' : 'active');
  const [reason, setReason] = useState('Alteração comercial autorizada pelo Admin Master');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedPlan = plans.find((plan) => plan._id === planId);
  const save = async () => {
    if ((!subscription && !tenantId) || !planId || (subscription && reason.trim().length < 5)) { setError('Preencha os campos obrigatórios.'); return; }
    setBusy(true); setError('');
    try {
      if (subscription) await masterRequest(`/subscriptions/${subscription._id}`, jsonInit('PATCH', { planId, reason }));
      else await masterRequest('/subscriptions', jsonInit('POST', { tenantId, planId, status }));
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar assinatura.'); }
    finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title={subscription ? 'Trocar plano' : 'Atribuir assinatura'} description="Operação manual. Nenhuma cobrança automática será iniciada." footer={<><button className={buttonSecondary} onClick={onClose}>Cancelar</button><button className={buttonPrimary} disabled={busy} onClick={save}>{busy ? 'Salvando...' : 'Confirmar'}</button></>}>
    <div className="space-y-4">
      {subscription ? <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">Loja</p><strong className="mt-1 block text-slate-100">{subscription.tenant?.displayName || 'Loja vinculada'}</strong></div> : <label className="text-sm text-slate-300">Loja sem assinatura<select className={`${fieldClass} mt-2`} value={tenantId} onChange={(event) => setTenantId(event.target.value)}><option value="">Selecione a loja</option>{tenants.map((tenant) => <option key={tenant._id} value={tenant._id}>{tenant.displayName} · /{tenant.slug}</option>)}</select></label>}
      <label className="text-sm text-slate-300">Plano<select className={`${fieldClass} mt-2`} value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="">Selecione o plano</option>{plans.map((plan) => <option key={plan._id} value={plan._id}>{plan.name} · {money(plan.priceCents)}/{plan.interval === 'yearly' ? 'ano' : 'mês'}</option>)}</select></label>
      {!subscription && <label className="text-sm text-slate-300">Entrada<select className={`${fieldClass} mt-2`} value={status} onChange={(event) => setStatus(event.target.value as 'trial' | 'active')}><option value="trial">Iniciar trial{selectedPlan ? ` de ${selectedPlan.trialDays} dias` : ''}</option><option value="active">Ativar imediatamente</option></select></label>}
      {subscription && <label className="text-sm text-slate-300">Motivo<input className={`${fieldClass} mt-2`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={5}/></label>}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  </Modal>;
}
