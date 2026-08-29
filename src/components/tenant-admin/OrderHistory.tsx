import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, History, Search, Filter } from 'lucide-react';
import OrderDetailsModal from '../OrderDetailsModal';
import { paymentMethodLabel } from '../../lib/paymentMethods';
import { useTenantAdminApi } from './TenantAdminContext';
import { formatOrderReference } from '../../lib/orderReference';

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const money = (value: unknown) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function OrderHistory() {
  const api = useTenantAdminApi();
  const today = localDate(new Date());
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const [filters, setFilters] = useState({ search: '', status: 'Todos', from: localDate(start), to: today });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>({ items: [], pagination: { page: 1, pages: 1, total: 0 } });
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api
      .listOrderHistory({ ...applied, page, limit: 20 })
      .then((response) => active && setData(response))
      .catch((reason) =>
        active && setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o histórico.')
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, applied, page]);

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied(filters);
  };

  const exportCsv = async () => {
    setExporting(true);
    setError('');
    try {
      const blob = await api.exportOrderHistory(applied);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `pedidos-${applied.from}-${applied.to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível exportar os pedidos.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Filtros e Busca de Histórico */}
      <form onSubmit={applyFilters} className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs space-y-3">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1fr)_160px_140px_140px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Nº pedido, cliente ou telefone..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-8 pr-3 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-all"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/50 pl-8 pr-3 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:bg-white transition-all appearance-none cursor-pointer"
            >
              <option value="Todos">Todos os status</option>
              <option value="Entregue">Entregue / Retirado</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">De</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Até</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="h-9 w-full sm:w-auto rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-2xs"
            >
              Filtrar
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
          <p>
            Encontrado<strong className="text-slate-900 mx-1">{data.pagination?.total || 0}</strong> pedido(s) no histórico
          </p>
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || !data.pagination?.total}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            {exporting ? 'Gerando CSV...' : 'Exportar CSV'}
          </button>
        </div>
      </form>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}

      {/* Tabela de Histórico */}
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">Carregando histórico de pedidos...</div>
        ) : !data.items?.length ? (
          <div className="p-10 text-center">
            <History className="mx-auto h-8 w-8 text-slate-300" />
            <h3 className="mt-2 font-semibold text-slate-900 text-sm">Nenhum pedido encontrado</h3>
            <p className="mt-0.5 text-xs text-slate-500">Ajuste os filtros de período ou busca para consultar outros registros.</p>
          </div>
        ) : (
          <>
            {/* Mobile View */}
            <div className="divide-y divide-slate-100 md:hidden">
              {data.items.map((order: any) => (
                <button
                  key={order._id}
                  onClick={() => setSelectedOrder(order)}
                  className="w-full text-left p-3 space-y-1.5 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">
                      {formatOrderReference(order)}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        order.status === 'Cancelado'
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-800">{order.cliente?.nome || 'Cliente'}</p>
                  <div className="flex justify-between items-center text-[11px] text-slate-500">
                    <span>{new Date(order.createdAt).toLocaleString('pt-BR')}</span>
                    <strong className="text-slate-900 font-bold">{money(order.total)}</strong>
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3.5">Pedido</th>
                    <th className="py-2.5 px-3">Data/Hora</th>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3">Modalidade</th>
                    <th className="py-2.5 px-3">Pagamento</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((order: any) => (
                    <tr
                      key={order._id}
                      onClick={() => setSelectedOrder(order)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="py-2.5 px-3.5 font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {formatOrderReference(order)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {new Date(order.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-slate-900">{order.cliente?.nome || 'Cliente'}</p>
                        <p className="text-[11px] text-slate-400">{order.cliente?.telefone || '-'}</p>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {order.tipo_entrega === 'dine_in' || order.tipo_entrega === 'local'
                          ? 'Comer no local'
                          : order.tipo_entrega === 'pickup'
                            ? 'Retirada'
                            : 'Entrega'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 uppercase text-[11px]">
                        {paymentMethodLabel(order.metodo_pagamento)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            order.status === 'Cancelado'
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${order.status === 'Cancelado' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                          {order.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {money(order.total)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="h-7 px-2.5 rounded border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors"
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Paginação */}
        <div className="flex items-center justify-between border-t border-slate-100 p-2.5 bg-slate-50/50 text-xs text-slate-500">
          <p>
            Página <strong className="text-slate-900">{data.pagination?.page || 1}</strong> de{' '}
            <strong className="text-slate-900">{data.pagination?.pages || 1}</strong>
          </p>
          <div className="flex gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white disabled:opacity-30 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-slate-600" />
            </button>
            <button
              disabled={page >= (data.pagination?.pages || 1)}
              onClick={() => setPage((value) => value + 1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white disabled:opacity-30 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
            </button>
          </div>
        </div>
      </section>

      <OrderDetailsModal
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
        perspective="admin"
      />
    </div>
  );
}
