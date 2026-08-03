import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Download, RefreshCw, ShoppingBag, TrendingUp, WalletCards } from 'lucide-react';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

const money = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AdminReports() {
  const api = useTenantAdminApi();
  const today = new Date().toISOString().slice(0, 10);
  const initialFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [period, setPeriod] = useState({ from: initialFrom, to: today });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try { setData(await api.getReportSummary(period.from, period.to)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Nao foi possivel carregar o relatorio.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  const maxRevenue = useMemo(() => Math.max(1, ...(data?.byDay || []).map((day: any) => Number(day.revenue || 0))), [data]);

  const exportCsv = () => {
    if (!data?.byDay?.length) return;
    const rows = ['Data,Pedidos,Faturamento', ...data.byDay.map((day: any) => `${day.date},${day.orders},${Number(day.revenue || 0).toFixed(2)}`)];
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `relatorio-${period.from}-${period.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Desempenho</p><h2 className="mt-1 text-2xl font-black text-gray-900">Relatorios da operacao</h2><p className="mt-1 text-sm text-gray-500">Acompanhe vendas e volume de pedidos no periodo.</p></div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
            <label className="text-xs font-semibold text-gray-600">De<input type="date" value={period.from} onChange={(e) => setPeriod((current) => ({ ...current, from: e.target.value }))} className="mt-1 block h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>
            <label className="text-xs font-semibold text-gray-600">Ate<input type="date" value={period.to} onChange={(e) => setPeriod((current) => ({ ...current, to: e.target.value }))} className="mt-1 block h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>
            <button onClick={load} className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" />Atualizar</button>
            <button onClick={exportCsv} disabled={!data?.byDay?.length} className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-bold text-gray-700 disabled:opacity-40"><Download className="h-4 w-4" />CSV</button>
          </div>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {loading ? <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">Carregando indicadores...</div> : data && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [WalletCards, 'Faturamento', money(data.metrics.revenue)],
            [ShoppingBag, 'Pedidos validos', data.metrics.validOrders],
            [TrendingUp, 'Ticket medio', money(data.metrics.averageOrder)],
            [CalendarDays, 'Cancelados', data.metrics.cancelled],
          ].map(([Icon, label, value]: any) => <div key={label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Icon className="h-5 w-5 text-emerald-600" /><p className="mt-4 text-sm text-gray-500">{label}</p><p className="mt-1 text-2xl font-black text-gray-900">{value}</p></div>)}
        </div>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-emerald-600" /><h3 className="font-bold text-gray-900">Faturamento por dia</h3></div>
          {data.byDay.length ? <div className="mt-6 flex h-56 items-end gap-2 overflow-x-auto pb-2">{data.byDay.map((day: any) => <div key={day.date} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-semibold text-gray-500">{money(day.revenue)}</span><div className="w-full max-w-12 rounded-t-lg bg-emerald-500" style={{ height: `${Math.max(6, (Number(day.revenue || 0) / maxRevenue) * 150)}px` }} /><span className="text-[10px] text-gray-400">{day.date.slice(5).split('-').reverse().join('/')}</span></div>)}</div> : <p className="mt-8 text-center text-sm text-gray-500">Nenhuma venda no periodo selecionado.</p>}
        </section>
      </>}
    </div>
  );
}
