import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, History, Search, ShieldCheck, Terminal, X } from 'lucide-react';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { AdminEmptyState, AdminSectionIntro, AdminSurface } from './tenant-admin/AdminUi';

const actionLabels: Record<string, string> = {
  ORDER_STATUS_CHANGED: 'Status do pedido alterado',
  PRODUCT_CREATED: 'Produto criado',
  PRODUCT_UPDATED: 'Produto atualizado',
  PRODUCT_DELETED: 'Produto excluído',
  PRODUCT_ACTIVE_TOGGLED: 'Visibilidade do produto alterada',
  PRODUCT_SOLD_OUT_TOGGLED: 'Disponibilidade do produto alterada',
  CATEGORY_CREATED: 'Categoria criada',
  CATEGORY_UPDATED: 'Categoria atualizada',
  CATEGORY_DELETED: 'Categoria excluída',
  CATALOG_STRUCTURE_UPDATED: 'Estrutura do catálogo atualizada',
  SETTINGS_UPDATED: 'Configurações atualizadas',
  HOME_BLOCK_CREATED: 'Bloco da home criado',
  HOME_BLOCK_UPDATED: 'Bloco da home atualizado',
  HOME_BLOCK_DELETED: 'Bloco da home excluído',
  HOME_BLOCKS_REORDERED: 'Blocos da home reordenados',
  CUSTOMER_POINTS_UPDATED: 'Pontos do cliente ajustados',
  COUPON_CREATED: 'Cupom criado',
  COUPON_DELETED: 'Cupom excluído',
  TEAM_INVITATION_CREATED: 'Convite de equipe enviado',
  ADMIN_PASSWORD_CHANGED: 'Senha administrativa alterada',
  CUSTOMER_PASSWORD_RECOVERY_APPROVED: 'Link de recuperação de cliente gerado',
};

const targetLabels: Record<string, string> = {
  Order: 'Pedidos',
  Product: 'Produtos',
  Category: 'Categorias',
  Catalog: 'Catálogo',
  StoreSettings: 'Loja',
  HomeBlock: 'Blocos da home',
  User: 'Clientes',
  Coupon: 'Cupons',
  AdminInvitation: 'Equipe',
};

function actionLabel(log: any) {
  return actionLabels[log.acao] || String(log.acao || 'Atividade').replaceAll('_', ' ').toLowerCase();
}

function areaLabel(log: any) {
  return targetLabels[log.targetType] || targetLabels[log.tabela] || log.tabela || 'Sistema';
}

function actionBadgeStyle(action: string) {
  const normalized = String(action || '').toUpperCase();
  if (normalized.includes('DELETE') || normalized.includes('REMOVED')) return 'border-red-200 bg-red-50 text-red-700';
  if (normalized.includes('CREATE') || normalized.includes('APPROVED')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized.includes('UPDATE') || normalized.includes('CHANGED') || normalized.includes('TOGGLED')) return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function formatDate(value: string, short = false) {
  return new Date(value).toLocaleString('pt-BR', short
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminLogs({ token }: { token: string; onUnauthorized: () => void }) {
  const api = useTenantAdminApi();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [targetType, setTargetType] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listAuditLogs({ page, limit: 25, search, targetType });
      setLogs(data.items || []);
      setPagination(data.pagination || { page, pages: 1, total: data.items?.length || 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as atividades.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [token, page, search, targetType]);

  return (
    <div className="space-y-5">
      <AdminSectionIntro title="Logs e auditoria" description="Histórico administrativo da loja, com responsável, contexto e horário." icon={ShieldCheck} />

      <AdminSurface className="p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
          <label className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-3 focus-within:border-emerald-500 focus-within:bg-white">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={search}
              onChange={(event) => { setPage(1); setSearch(event.target.value); }}
              placeholder="Buscar ação, detalhe ou motivo"
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-900 outline-none placeholder:text-slate-400"
            />
            {search && <button type="button" aria-label="Limpar busca" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
          </label>
          <label className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
            <Filter className="h-4 w-4 shrink-0 text-slate-400" />
            <select value={targetType} onChange={(event) => { setPage(1); setTargetType(event.target.value); }} className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-800 outline-none">
              <option value="">Todas as áreas</option>
              {Object.entries(targetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </AdminSurface>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700">{error}</div>}

      <AdminSurface className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Carregando registros de auditoria...</div>
        ) : logs.length === 0 ? (
          <AdminEmptyState title="Nenhuma atividade encontrada" description="Ajuste a busca ou o filtro para consultar outros registros." icon={History} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead><tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5">Data e hora</th><th className="px-4 py-2.5">Responsável</th><th className="px-4 py-2.5">Ação</th><th className="px-4 py-2.5">Área</th><th className="px-4 py-2.5">Detalhes</th><th className="px-4 py-2.5 text-right">Ação</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {logs.map((log) => <tr key={log._id} onClick={() => setSelectedLog(log)} className="cursor-pointer transition-colors hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-500">{formatDate(log.createdAt, true)}</td>
                    <td className="px-4 py-3"><p className="max-w-[150px] truncate font-semibold text-slate-900">{log.actorName || log.adminId || 'Sistema'}</p>{log.actorRole && <span className="text-[10px] text-slate-400">{log.actorRole}</span>}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${actionBadgeStyle(log.acao)}`}>{actionLabel(log)}</span></td>
                    <td className="px-4 py-3"><span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{areaLabel(log)}</span></td>
                    <td className="px-4 py-3"><p className="max-w-[260px] truncate text-slate-600">{log.detalhes || log.reason || 'Sem detalhes informados'}</p></td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedLog(log); }} className="font-bold text-emerald-600 hover:underline">Ver detalhe</button></td>
                  </tr>)}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {logs.map((log) => <button key={log._id} type="button" onClick={() => setSelectedLog(log)} className="block w-full space-y-2 p-3.5 text-left transition-colors hover:bg-slate-50">
                <div className="flex items-start justify-between gap-2"><span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${actionBadgeStyle(log.acao)}`}>{actionLabel(log)}</span><span className="whitespace-nowrap font-mono text-[10px] text-slate-400">{formatDate(log.createdAt, true)}</span></div>
                <p className="line-clamp-2 text-xs leading-relaxed text-slate-700">{log.detalhes || log.reason || 'Ação realizada no sistema'}</p>
                <div className="flex items-center justify-between border-t border-slate-50 pt-1 text-[10px] text-slate-500"><span className="truncate">Responsável: <strong className="text-slate-700">{log.actorName || log.adminId || 'Sistema'}</strong></span><span className="ml-2 shrink-0 rounded bg-slate-100 px-1.5 py-0.5">{areaLabel(log)}</span></div>
              </button>)}
            </div>
          </>
        )}

        <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2.5">
          <p className="text-[11px] font-medium text-slate-500">{pagination.total} atividade(s) · Página {pagination.page} de {Math.max(1, pagination.pages)}</p>
          <div className="flex gap-1.5"><button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button><button type="button" aria-label="Próxima página" disabled={page >= pagination.pages} onClick={() => setPage((current) => current + 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button></div>
        </footer>
      </AdminSurface>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white/95 p-4 backdrop-blur">
              <div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Terminal className="h-4 w-4" /></div><div><h3 id="audit-detail-title" className="text-sm font-bold text-slate-900">Detalhes da atividade</h3><p className="text-[10px] text-slate-400">Registro de auditoria</p></div></div>
              <button type="button" aria-label="Fechar detalhes" onClick={() => setSelectedLog(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 p-5 text-xs">
              <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
                <div><span className="block text-[10px] font-bold uppercase text-slate-400">Data e hora</span><span className="font-mono font-semibold text-slate-800">{formatDate(selectedLog.createdAt)}</span></div>
                <div><span className="block text-[10px] font-bold uppercase text-slate-400">Responsável</span><span className="font-semibold text-slate-800">{selectedLog.actorName || selectedLog.adminId || 'Sistema'}</span>{selectedLog.actorRole && <span className="ml-1 text-slate-400">({selectedLog.actorRole})</span>}</div>
                <div><span className="block text-[10px] font-bold uppercase text-slate-400">Ação</span><span className="font-semibold text-slate-800">{actionLabel(selectedLog)}</span></div>
                <div><span className="block text-[10px] font-bold uppercase text-slate-400">Área</span><span className="font-semibold text-slate-800">{areaLabel(selectedLog)}</span></div>
              </div>
              <div><span className="mb-1 block text-[11px] font-bold text-slate-700">Descrição</span><p className="rounded-xl border border-slate-200 p-3 leading-relaxed text-slate-700">{selectedLog.detalhes || 'Sem descrição cadastrada.'}</p></div>
              {selectedLog.reason && <div><span className="mb-1 block text-[11px] font-bold text-slate-700">Motivo</span><p className="rounded-xl border border-amber-200 bg-amber-50 p-3 leading-relaxed text-amber-900">{selectedLog.reason}</p></div>}
              {(selectedLog.documentoId || selectedLog.targetId || selectedLog.ip) && <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[10px] text-slate-500">{(selectedLog.documentoId || selectedLog.targetId) && <span>Referência: <code className="text-slate-700">{selectedLog.documentoId || selectedLog.targetId}</code></span>}{selectedLog.ip && <span>IP: <code className="text-slate-700">{selectedLog.ip}</code></span>}</div>}
              {(selectedLog.before || selectedLog.after) && <div className="space-y-2 border-t border-slate-100 pt-3"><span className="block text-[11px] font-bold text-slate-700">Alterações registradas</span><div className="grid gap-2 sm:grid-cols-2">{selectedLog.before && <div className="overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-[10px] text-slate-200"><span className="mb-1 block font-bold text-red-400">Antes</span><pre>{JSON.stringify(selectedLog.before, null, 2)}</pre></div>}{selectedLog.after && <div className="overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-[10px] text-slate-200"><span className="mb-1 block font-bold text-emerald-400">Depois</span><pre>{JSON.stringify(selectedLog.after, null, 2)}</pre></div>}</div></div>}
              <div className="flex justify-end border-t border-slate-100 pt-3"><button type="button" onClick={() => setSelectedLog(null)} className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800">Fechar</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
