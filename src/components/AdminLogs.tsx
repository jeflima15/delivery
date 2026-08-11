import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, History, Search, ShieldCheck } from 'lucide-react';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

const actionLabels: Record<string, string> = {
  ORDER_STATUS_CHANGED: 'Status do pedido alterado', PRODUCT_CREATED: 'Produto criado', PRODUCT_UPDATED: 'Produto atualizado', PRODUCT_DELETED: 'Produto excluido',
  PRODUCT_ACTIVE_TOGGLED: 'Publicacao do produto alterada', PRODUCT_SOLD_OUT_TOGGLED: 'Disponibilidade do produto alterada', CATEGORY_CREATED: 'Categoria criada', CATEGORY_UPDATED: 'Categoria atualizada',
  CATEGORY_DELETED: 'Categoria excluida', CATALOG_STRUCTURE_UPDATED: 'Estrutura do catalogo atualizada', SETTINGS_UPDATED: 'Configuracoes atualizadas', HOME_BLOCK_CREATED: 'Bloco da home criado',
  HOME_BLOCK_UPDATED: 'Bloco da home atualizado', HOME_BLOCK_DELETED: 'Bloco da home excluido', HOME_BLOCKS_REORDERED: 'Blocos da home reordenados', CUSTOMER_POINTS_UPDATED: 'Pontos do cliente ajustados',
  COUPON_CREATED: 'Cupom criado', COUPON_DELETED: 'Cupom excluido', TEAM_INVITATION_CREATED: 'Convite de equipe enviado', ADMIN_PASSWORD_CHANGED: 'Senha administrativa alterada',
  CUSTOMER_PASSWORD_RECOVERY_APPROVED: 'Link de recuperacao de cliente gerado',
};
const targetLabels: Record<string, string> = { Order: 'Pedido', Product: 'Produto', Category: 'Categoria', Catalog: 'Catalogo', StoreSettings: 'Loja', HomeBlock: 'Home', User: 'Cliente', Coupon: 'Cupom', AdminInvitation: 'Equipe' };

export default function AdminLogs({ token }: { token: string; onUnauthorized: () => void }) {
  const api = useTenantAdminApi();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [targetType, setTargetType] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { const data = await api.listAuditLogs({ page, limit: 25, search, targetType }); setLogs(data.items || []); setPagination(data.pagination || { page, pages: 1, total: data.items?.length || 0 }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Nao foi possivel carregar as atividades.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), search ? 350 : 0); return () => window.clearTimeout(timer); }, [token, page, search, targetType]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="text-xl font-black text-gray-900">Atividades e seguranca</h2><p className="mt-1 text-sm text-gray-500">Historico administrativo da loja, com ator, contexto e horario.</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_220px]"><label className="flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3"><Search className="h-4 w-4 text-gray-400" /><input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Buscar acao, detalhe ou motivo" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><label className="flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3"><Filter className="h-4 w-4 text-gray-400" /><select value={targetType} onChange={(e) => { setPage(1); setTargetType(e.target.value); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none"><option value="">Todas as areas</option>{Object.entries(targetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></section>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="divide-y divide-gray-100">{loading ? <div className="p-12 text-center text-sm text-gray-500">Carregando atividades...</div> : logs.length === 0 ? <div className="p-12 text-center text-sm text-gray-500">Nenhuma atividade encontrada.</div> : logs.map((log) => <article key={log._id} className="flex gap-3 p-4 sm:p-5"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100"><History className="h-4 w-4 text-emerald-600" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-gray-900">{actionLabels[log.acao] || String(log.acao || 'Atividade').replaceAll('_', ' ').toLowerCase()}</h3><span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">{targetLabels[log.targetType] || log.tabela || 'Sistema'}</span></div>{log.detalhes && <p className="mt-1 text-sm text-gray-500">{log.detalhes}</p>}{log.reason && <p className="mt-1 text-xs text-gray-500"><strong>Motivo:</strong> {log.reason}</p>}<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400"><span>{new Date(log.createdAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}</span><span>Responsavel: {log.actorRole || log.adminId || 'Sistema'}</span>{log.documentoId || log.targetId ? <span>Ref. {String(log.documentoId || log.targetId).slice(-8)}</span> : null}</div></div></article>)}</div><footer className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3"><p className="text-xs text-gray-500">{pagination.total} atividade(s) · Pagina {pagination.page} de {Math.max(1, pagination.pages)}</p><div className="flex gap-2"><button aria-label="Pagina anterior" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-white disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><button aria-label="Proxima pagina" disabled={page >= pagination.pages} onClick={() => setPage((current) => current + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-white disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></footer></section>
    </div>
  );
}
