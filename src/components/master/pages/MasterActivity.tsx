import { Download, Eye, Search } from 'lucide-react';
import { useState } from 'react';
import { masterRequest, queryString } from '../api';
import { useDebounced, useRemote } from '../hooks';
import type { Activity, ListResponse } from '../types';
import { date, downloadCsv } from '../utils';
import { Card, EmptyState, ErrorState, LoadingState, Modal, PageHeader, PaginationBar, TableShell, buttonSecondary, fieldClass } from '../components/MasterUI';

export default function MasterActivity() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [targetType, setTargetType] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Activity | null>(null);
  const remote = useRemote(
    () => masterRequest<ListResponse<Activity>>(`/activity${queryString({ search: debounced, targetType, action, from, to, page, limit: 25 })}`),
    [debounced, targetType, action, from, to, page],
  );
  const items = remote.data?.items || [];
  const resetPage = () => setPage(1);

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Trilha auditável"
      title="Atividades"
      description="Ações administrativas globais e por loja, apresentadas em linguagem operacional."
      actions={<button className={buttonSecondary} disabled={!items.length} onClick={() => downloadCsv('atividades.csv', items.map((item) => ({ Data: date(item.createdAt, true), Acao: item.action, Entidade: item.targetType || '', Loja: item.tenant?.displayName || '', Motivo: item.reason || '' })))}><Download className="h-4 w-4"/>Exportar CSV</button>}
    />
    <Card className="p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="relative md:col-span-2 xl:col-span-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500"/><input className={`${fieldClass} pl-10`} value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Ação, entidade, ator, loja ou motivo"/></label>
        <input className={fieldClass} value={action} onChange={(event) => { setAction(event.target.value); resetPage(); }} placeholder="Código da ação"/>
        <select className={fieldClass} value={targetType} onChange={(event) => { setTargetType(event.target.value); resetPage(); }}><option value="">Todas as entidades</option><option value="Tenant">Loja</option><option value="Plan">Plano</option><option value="Subscription">Assinatura</option><option value="Invoice">Fatura</option><option value="Membership">Acesso</option></select>
        <label className="text-xs text-slate-500">De<input type="date" className={`${fieldClass} mt-1`} value={from} onChange={(event) => { setFrom(event.target.value); resetPage(); }}/></label>
        <label className="text-xs text-slate-500">Até<input type="date" className={`${fieldClass} mt-1`} value={to} onChange={(event) => { setTo(event.target.value); resetPage(); }}/></label>
      </div>
    </Card>
    {remote.loading && !remote.data ? <LoadingState rows={8}/> : remote.error ? <ErrorState message={remote.error} retry={remote.refresh}/> : <TableShell>
      <table className="min-w-[900px] w-full text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Ação</th><th className="px-4 py-3">Entidade</th><th className="px-4 py-3">Loja / ator</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3 text-right">Detalhe</th></tr></thead><tbody className="divide-y divide-slate-800">{items.map((item) => <tr key={item._id}><td className="px-4 py-3 text-slate-400">{date(item.createdAt, true)}</td><td className="px-4 py-3"><strong className="text-slate-200">{item.action.replaceAll('_', ' ')}</strong><p className="mt-1 font-mono text-[10px] text-slate-600">{item.action}</p></td><td className="px-4 py-3 text-slate-400">{item.targetType || 'Plataforma'}</td><td className="px-4 py-3"><p className="text-slate-300">{item.tenant?.displayName || 'Global'}</p><p className="text-xs text-slate-500">{item.actor?.email || item.actorType || 'Sistema'}</p></td><td className="max-w-56 truncate px-4 py-3 text-slate-400">{item.reason || '—'}</td><td className="px-4 py-3 text-right"><button className={buttonSecondary} onClick={() => setDetail(item)} aria-label="Abrir detalhe"><Eye className="h-4 w-4"/></button></td></tr>)}</tbody></table>
      {!items.length && <EmptyState title="Nenhuma atividade encontrada"/>}
      {remote.data && <PaginationBar pagination={remote.data.pagination} onPage={setPage}/>}
    </TableShell>}
    <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.action.replaceAll('_', ' ') || 'Detalhe'} description={detail ? date(detail.createdAt, true) : undefined}>{detail && <div className="space-y-4"><ActivityField label="Entidade" value={`${detail.targetType || 'Plataforma'} ${detail.targetId || ''}`}/><ActivityField label="Motivo" value={detail.reason || 'Não informado'}/><Change title="Antes" value={detail.before}/><Change title="Depois" value={detail.after}/></div>}</Modal>
  </div>;
}

function ActivityField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm text-slate-200">{value}</p></div>;
}

function Change({ title, value }: { title: string; value: unknown }) {
  if (!value) return null;
  return <details className="rounded-xl border border-slate-800"><summary className="px-4 py-3 text-sm font-medium text-slate-300">{title}</summary><pre className="max-h-64 overflow-auto border-t border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">{JSON.stringify(value, null, 2)}</pre></details>;
}
