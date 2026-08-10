import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, History, Search } from 'lucide-react';
import OrderDetailsModal from '../OrderDetailsModal';
import { paymentMethodLabel } from '../../lib/paymentMethods';
import { useTenantAdminApi } from './TenantAdminContext';

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const money = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function OrderHistory() {
  const api = useTenantAdminApi();
  const today = localDate(new Date());
  const start = new Date(); start.setDate(start.getDate() - 29);
  const [filters, setFilters] = useState({ search: '', status: 'Todos', from: localDate(start), to: today });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>({ items: [], pagination: { page: 1, pages: 1, total: 0 } });
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true; setLoading(true); setError('');
    api.listOrderHistory({ ...applied, page, limit: 20 }).then((response) => active && setData(response)).catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Nao foi possivel carregar o historico.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [api, applied, page]);

  const applyFilters = (event: React.FormEvent) => { event.preventDefault(); setPage(1); setApplied(filters); };
  const exportCsv = async () => {
    setExporting(true); setError('');
    try {
      const blob = await api.exportOrderHistory(applied);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `pedidos-${applied.from}-${applied.to}.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Nao foi possivel exportar os pedidos.'); }
    finally { setExporting(false); }
  };

  return <div className="space-y-5">
    <form onSubmit={applyFilters} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_150px_150px_auto]">
        <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Pedido, cliente ou telefone" className="h-11 w-full rounded-xl border border-gray-200 pl-10 pr-3 text-sm outline-none focus:border-emerald-400" /></label>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="h-11 rounded-xl border border-gray-200 px-3 text-sm"><option>Todos</option><option>Entregue</option><option>Cancelado</option></select>
        <label className="text-[11px] font-bold text-gray-500">De<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="mt-1 h-8 w-full rounded-lg border border-gray-200 px-2 text-sm font-normal" /></label>
        <label className="text-[11px] font-bold text-gray-500">Ate<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="mt-1 h-8 w-full rounded-lg border border-gray-200 px-2 text-sm font-normal" /></label>
        <button className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white">Filtrar</button>
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-gray-500"><strong className="text-gray-900">{data.pagination?.total || 0}</strong> pedido(s) no resultado</p><button type="button" onClick={exportCsv} disabled={exporting || !data.pagination?.total} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-bold text-gray-700 disabled:opacity-40"><Download className="h-4 w-4" />{exporting ? 'Gerando...' : 'Exportar CSV completo'}</button></div>
    </form>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {loading ? <div className="p-12 text-center text-sm text-gray-500">Carregando historico...</div> : !data.items?.length ? <div className="p-12 text-center"><History className="mx-auto h-10 w-10 text-gray-300" /><h3 className="mt-3 font-bold text-gray-900">Nenhum pedido encontrado</h3><p className="mt-1 text-sm text-gray-500">Ajuste o periodo ou os filtros para consultar outros pedidos.</p></div> : <>
        <div className="grid gap-3 p-3 md:hidden">{data.items.map((order: any) => <button key={order._id} onClick={() => setSelectedOrder(order)} className="rounded-xl border border-gray-200 p-4 text-left"><div className="flex items-start justify-between"><div><p className="font-black text-gray-900">#{order.orderNumber || String(order._id).slice(-6).toUpperCase()}</p><p className="mt-1 text-sm font-semibold text-gray-700">{order.cliente?.nome}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${order.status === 'Cancelado' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{order.status}</span></div><div className="mt-3 flex justify-between text-xs text-gray-500"><span>{new Date(order.createdAt).toLocaleString('pt-BR')}</span><strong className="text-gray-900">{money(order.total)}</strong></div></button>)}</div>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500"><tr><th className="p-4">Pedido</th><th className="p-4">Data</th><th className="p-4">Cliente</th><th className="p-4">Entrega</th><th className="p-4">Pagamento</th><th className="p-4">Status</th><th className="p-4 text-right">Total</th><th className="p-4" /></tr></thead><tbody className="divide-y divide-gray-100">{data.items.map((order: any) => <tr key={order._id} className="hover:bg-gray-50"><td className="p-4 font-black">#{order.orderNumber || String(order._id).slice(-6).toUpperCase()}</td><td className="p-4 text-gray-500">{new Date(order.createdAt).toLocaleString('pt-BR')}</td><td className="p-4"><p className="font-semibold">{order.cliente?.nome}</p><p className="text-xs text-gray-400">{order.cliente?.telefone}</p></td><td className="p-4 text-gray-600">{order.tipo_entrega === 'pickup' ? 'Retirada' : 'Entrega'}</td><td className="p-4 text-gray-600">{paymentMethodLabel(order.metodo_pagamento)}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${order.status === 'Cancelado' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{order.status}</span></td><td className="p-4 text-right font-black">{money(order.total)}</td><td className="p-4"><button onClick={() => setSelectedOrder(order)} aria-label="Abrir detalhes" className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-500"><Eye className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
      </>}
      <div className="flex items-center justify-between border-t border-gray-100 p-4"><p className="text-xs text-gray-500">Pagina {data.pagination?.page || 1} de {data.pagination?.pages || 1}</p><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><button disabled={page >= (data.pagination?.pages || 1)} onClick={() => setPage((value) => value + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div></div>
    </section>
    <OrderDetailsModal isOpen={Boolean(selectedOrder)} onClose={() => setSelectedOrder(null)} order={selectedOrder} perspective="admin" />
  </div>;
}
