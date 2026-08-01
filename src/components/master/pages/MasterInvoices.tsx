import { Download, Eye, Plus, ReceiptText, Search } from 'lucide-react';
import { useState } from 'react';
import { jsonInit, masterRequest, queryString } from '../api';
import { useDebounced, useRemote } from '../hooks';
import type { Invoice, InvoiceStatus, ListResponse, Subscription } from '../types';
import { date, downloadCsv, money } from '../utils';
import {
  Card,
  ConfirmReasonModal,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingState,
  Modal,
  PageHeader,
  PaginationBar,
  StatusBadge,
  TableShell,
  buttonPrimary,
  buttonSecondary,
  fieldClass,
} from '../components/MasterUI';

type InvoiceAction = { invoice: Invoice; kind: 'mark-paid' | 'cancel' | 'refund' };

export default function MasterInvoices({ navigate, notify }: { navigate: (path: string) => void; notify: (tone: 'success' | 'error' | 'info', message: string) => void }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [action, setAction] = useState<InvoiceAction | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const remote = useRemote(
    () => masterRequest<ListResponse<Invoice>>(`/invoices${queryString({ search: debounced, status, page, limit: 25 })}`),
    [debounced, status, page],
  );
  const subscriptions = useRemote(
    () => masterRequest<ListResponse<Subscription>>('/subscriptions?limit=100'),
    [],
  );
  const items = remote.data?.items || [];
  const summary = remote.data?.summaries || {};
  const summaryCents = (key: InvoiceStatus) => {
    const value = summary[key];
    return typeof value === 'object' ? value.cents : 0;
  };

  const runReasonAction = async (reason: string) => {
    if (!action || action.kind === 'mark-paid' || reason.length < 5) return;
    setBusy(true);
    try {
      await masterRequest(`/invoices/${action.invoice._id}/${action.kind}`, jsonInit('POST', { reason }));
      notify('success', action.kind === 'refund' ? 'Estorno registrado.' : 'Fatura cancelada.');
      setAction(null);
      remote.refresh();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Falha ao atualizar fatura.');
    } finally {
      setBusy(false);
    }
  };

  const exportInvoices = () => downloadCsv('faturas.csv', items.map((item) => ({
    Fatura: item._id,
    Loja: item.tenant?.displayName || '',
    Responsavel: item.tenant?.owner?.email || '',
    Valor: money(item.amountCents),
    Status: item.status,
    Vencimento: date(item.dueAt),
    Pagamento: date(item.paidAt),
    Referencia: item.receiptReference || '',
  })));

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Billing manual"
      title="Financeiro"
      description="Receita da plataforma, situação das faturas e histórico de pagamentos. Valores sempre persistidos em centavos."
      actions={<>
        <button className={buttonSecondary} onClick={exportInvoices}><Download className="h-4 w-4"/>Exportar CSV</button>
        <button className={buttonPrimary} onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4"/>Nova fatura</button>
      </>}
    />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Recebido" value={money(summaryCents('paid'))} icon={<ReceiptText className="h-5 w-5"/>}/>
      <KpiCard label="Pendente" value={money(summaryCents('pending'))}/>
      <KpiCard label="Vencido / falhou" value={money(summaryCents('overdue') + summaryCents('failed'))}/>
      <KpiCard label="Estornado" value={money(summaryCents('refunded'))}/>
    </section>
    <Card className="p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <label className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500"/>
          <input className={`${fieldClass} pl-10`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Loja, responsável ou referência"/>
        </label>
        <select className={fieldClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Todos os status</option><option value="pending">Pendente</option><option value="paid">Paga</option><option value="failed">Falhou</option><option value="overdue">Vencida</option><option value="cancelled">Cancelada</option><option value="refunded">Estornada</option><option value="chargeback">Chargeback</option>
        </select>
      </div>
    </Card>
    {remote.loading && !remote.data ? <LoadingState rows={7}/> : remote.error ? <ErrorState message={remote.error} retry={remote.refresh}/> : <TableShell>
      <table className="min-w-[1150px] w-full text-left text-sm">
        <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Fatura</th><th className="px-4 py-3">Loja</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3">Pagamento</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead>
        <tbody className="divide-y divide-slate-800">{items.map((invoice) => <tr key={invoice._id} className="hover:bg-slate-800/30">
          <td className="px-4 py-3 font-mono text-xs text-slate-400">#{invoice._id.slice(-8)}<p className="mt-1 text-[10px] text-slate-600">{invoice.receiptReference || 'Sem referência'}</p></td>
          <td className="px-4 py-3"><button onClick={() => invoice.tenant && navigate(`/master/lojas/${invoice.tenant._id}`)} className="text-left"><strong className="block text-slate-200">{invoice.tenant?.displayName || 'Loja'}</strong><small className="text-slate-500">{invoice.tenant?.owner?.email}</small></button></td>
          <td className="px-4 py-3 text-slate-300">{invoice.plan?.name || '—'}</td>
          <td className="px-4 py-3 text-right font-semibold tabular-nums text-white">{money(invoice.amountCents)}</td>
          <td className="px-4 py-3 text-slate-400">{date(invoice.dueAt)}</td><td className="px-4 py-3 text-slate-400">{date(invoice.paidAt)}</td><td className="px-4 py-3"><StatusBadge status={invoice.status}/></td>
          <td className="px-4 py-3"><div className="flex justify-end gap-1"><button className={buttonSecondary} onClick={() => setDetail(invoice)} title="Detalhes"><Eye className="h-4 w-4"/></button>{['pending', 'overdue', 'failed'].includes(invoice.status) && <><button className={buttonSecondary} onClick={() => setAction({ invoice, kind: 'mark-paid' })}>Marcar paga</button><button className={buttonSecondary} onClick={() => setAction({ invoice, kind: 'cancel' })}>Cancelar</button></>}{invoice.status === 'paid' && <button className={buttonSecondary} onClick={() => setAction({ invoice, kind: 'refund' })}>Estornar</button>}</div></td>
        </tr>)}</tbody>
      </table>
      {!items.length && <EmptyState title="Nenhuma fatura encontrada"/>}
      {remote.data && <PaginationBar pagination={remote.data.pagination} onPage={setPage}/>}
    </TableShell>}
    <InvoiceDetail invoice={detail} onClose={() => setDetail(null)}/>
    <CreateInvoiceModal
      key={createOpen ? 'open' : 'closed'}
      open={createOpen}
      subscriptions={subscriptions.data?.items || []}
      loading={subscriptions.loading}
      onClose={() => setCreateOpen(false)}
      onCreated={() => { setCreateOpen(false); notify('success', 'Fatura manual criada.'); remote.refresh(); }}
    />
    <PaymentModal
      key={action?.invoice._id || 'payment-closed'}
      action={action?.kind === 'mark-paid' ? action : null}
      busy={busy}
      onClose={() => setAction(null)}
      onPaid={() => { setAction(null); notify('success', 'Pagamento registrado.'); remote.refresh(); }}
      onBusy={setBusy}
      notify={notify}
    />
    <ConfirmReasonModal open={Boolean(action && action.kind !== 'mark-paid')} busy={busy} title={action?.kind === 'refund' ? 'Estornar fatura' : 'Cancelar fatura'} description={`${action?.invoice.tenant?.displayName || 'Loja'} · ${money(action?.invoice.amountCents || 0)}. Esta ação será auditada.`} confirmLabel="Confirmar ação" onClose={() => setAction(null)} onConfirm={runReasonAction}/>
  </div>;
}

function CreateInvoiceModal({ open, subscriptions, loading, onClose, onCreated }: { open: boolean; subscriptions: Subscription[]; loading: boolean; onClose: () => void; onCreated: () => void }) {
  const [subscriptionId, setSubscriptionId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueAt, setDueAt] = useState(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = subscriptions.find((item) => item._id === subscriptionId);
  const selectSubscription = (value: string) => {
    setSubscriptionId(value);
    const next = subscriptions.find((item) => item._id === value);
    setAmount(next?.plan ? String(next.plan.priceCents / 100).replace('.', ',') : '');
  };
  const save = async () => {
    if (!selected) { setError('Selecione uma assinatura.'); return; }
    const amountCents = Math.round(Number(amount.replace(',', '.')) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 0 || !dueAt) { setError('Revise o valor e o vencimento.'); return; }
    setBusy(true); setError('');
    try {
      await masterRequest('/invoices', jsonInit('POST', { tenantId: selected.tenant?._id || selected.tenantId, subscriptionId: selected._id, amountCents, dueAt: `${dueAt}T12:00:00` }));
      onCreated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao criar fatura.'); }
    finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title="Nova fatura manual" description="O valor do plano é sugerido, mas a fatura preserva o valor confirmado." footer={<><button className={buttonSecondary} onClick={onClose}>Cancelar</button><button className={buttonPrimary} disabled={busy || loading} onClick={save}>{busy ? 'Criando...' : 'Criar fatura'}</button></>}>
    <div className="space-y-4">
      <label className="text-sm text-slate-300">Assinatura<select className={`${fieldClass} mt-2`} disabled={loading} value={subscriptionId} onChange={(event) => selectSubscription(event.target.value)}><option value="">{loading ? 'Carregando...' : 'Selecione a loja e o plano'}</option>{subscriptions.map((item) => <option key={item._id} value={item._id}>{item.tenant?.displayName || 'Loja'} · {item.plan?.name || 'Plano'} · {money(item.plan?.priceCents || 0)}</option>)}</select></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Valor em R$<input className={`${fieldClass} mt-2`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)}/></label><label className="text-sm text-slate-300">Vencimento<input className={`${fieldClass} mt-2`} type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)}/></label></div>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  </Modal>;
}

function PaymentModal({ action, busy, onClose, onPaid, onBusy, notify }: { action: InvoiceAction | null; busy: boolean; onClose: () => void; onPaid: () => void; onBusy: (busy: boolean) => void; notify: (tone: 'success' | 'error' | 'info', message: string) => void }) {
  const [reason, setReason] = useState('Pagamento manual confirmado');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const save = async () => {
    if (!action || reason.trim().length < 5) return;
    onBusy(true);
    try {
      await masterRequest(`/invoices/${action.invoice._id}/mark-paid`, jsonInit('POST', { reason, receiptReference: reference.trim() || undefined, paidAt: `${paidAt}T12:00:00` }));
      onPaid();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao registrar pagamento.'); }
    finally { onBusy(false); }
  };
  return <Modal open={Boolean(action)} onClose={onClose} title="Registrar pagamento" description={`${action?.invoice.tenant?.displayName || 'Loja'} · ${money(action?.invoice.amountCents || 0)}. O registro ficará no histórico.`} footer={<><button className={buttonSecondary} onClick={onClose}>Voltar</button><button className={buttonPrimary} disabled={busy || reason.trim().length < 5 || !paidAt} onClick={save}>{busy ? 'Registrando...' : 'Confirmar pagamento'}</button></>}>
    <div className="space-y-4"><label className="text-sm text-slate-300">Data do pagamento<input className={`${fieldClass} mt-2`} type="date" max={new Date().toISOString().slice(0, 10)} value={paidAt} onChange={(event) => setPaidAt(event.target.value)}/></label><label className="text-sm text-slate-300">Referência do comprovante<input className={`${fieldClass} mt-2`} value={reference} maxLength={200} onChange={(event) => setReference(event.target.value)} placeholder="PIX, transferência ou referência interna"/></label><label className="text-sm text-slate-300">Motivo<input className={`${fieldClass} mt-2`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={5}/></label></div>
  </Modal>;
}

function InvoiceDetail({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  return <Modal open={Boolean(invoice)} onClose={onClose} title={`Fatura #${invoice?._id.slice(-8) || ''}`} description={invoice?.tenant?.displayName}>{invoice && <div className="space-y-5"><div className="flex items-center justify-between rounded-xl bg-slate-950 p-4"><span><p className="text-xs text-slate-500">Valor</p><strong className="mt-1 block text-2xl text-white">{money(invoice.amountCents)}</strong></span><StatusBadge status={invoice.status}/></div><dl className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="Criada" value={date(invoice.createdAt, true)}/><Detail label="Vencimento" value={date(invoice.dueAt)}/><Detail label="Pagamento" value={date(invoice.paidAt, true)}/><Detail label="Referência" value={invoice.receiptReference || '—'}/></dl><div><h3 className="text-sm font-semibold text-white">Histórico</h3><div className="mt-3 space-y-3">{invoice.history?.map((entry, index) => <div key={`${entry.at}-${index}`} className="border-l border-slate-700 pl-4"><div className="flex items-center gap-2"><StatusBadge status={entry.status}/><span className="text-xs text-slate-500">{date(entry.at, true)}</span></div>{entry.reason && <p className="mt-2 text-sm text-slate-400">{entry.reason}</p>}</div>) || <p className="text-sm text-slate-500">Sem histórico detalhado.</p>}</div></div></div>}</Modal>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-slate-800 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-slate-200">{value}</dd></div>; }
