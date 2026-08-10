import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Clock3, Package, RefreshCw, ShoppingBag, Tags, TrendingUp, WalletCards } from 'lucide-react';
import { paymentMethodLabel } from '../lib/paymentMethods';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

const money = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function presetDates(id: string) {
  const to = new Date(); const from = new Date(to);
  if (id === 'yesterday') { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); }
  if (id === '7days') from.setDate(from.getDate() - 6);
  if (id === '30days') from.setDate(from.getDate() - 29);
  if (id === 'month') from.setDate(1);
  return { from: localDate(from), to: localDate(to) };
}

const metricCard = (Icon: any, label: string, value: React.ReactNode, helper?: string) => <div key={label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><Icon className="h-5 w-5 text-emerald-600" /><p className="mt-4 text-sm text-gray-500">{label}</p><p className="mt-1 text-2xl font-black text-gray-900">{value}</p>{helper && <p className="mt-1 text-xs text-gray-400">{helper}</p>}</div>;

export default function AdminReports() {
  const api = useTenantAdminApi();
  const [tab, setTab] = useState<'overview' | 'products' | 'operation'>('overview');
  const [preset, setPreset] = useState('30days');
  const [period, setPeriod] = useState(presetDates('30days'));
  const [data, setData] = useState<any>({ summary: null, products: null, operation: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [summary, products, operation] = await Promise.all([api.getReportSummary(period.from, period.to), api.getProductReport(period.from, period.to), api.getOperationReport(period.from, period.to)]);
      setData({ summary, products, operation });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Nao foi possivel carregar os relatorios.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const setPresetPeriod = (id: string) => { setPreset(id); setPeriod(presetDates(id)); };
  const maxRevenue = useMemo(() => Math.max(1, ...(data.summary?.byDay || []).map((day: any) => Number(day.revenue || 0))), [data.summary]);
  const maxHour = useMemo(() => Math.max(1, ...(data.operation?.byHour || []).map((hour: any) => Number(hour.orders || 0))), [data.operation]);

  return <div className="space-y-5">
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Fechamento operacional</p><h2 className="mt-1 text-2xl font-black text-gray-900">Quanto vendi e como recebi?</h2><p className="mt-1 text-sm text-gray-500">Vendas, produtos e tempos reais da operacao no mesmo periodo.</p></div><div className="flex flex-wrap gap-2">{[['today','Hoje'],['yesterday','Ontem'],['7days','7 dias'],['30days','30 dias'],['month','Este mes']].map(([id,label]) => <button key={id} onClick={() => setPresetPeriod(id)} className={`h-9 rounded-lg px-3 text-xs font-bold ${preset === id ? 'bg-emerald-600 text-white' : 'border border-gray-200 text-gray-600'}`}>{label}</button>)}</div></div>
      <div className="mt-5 grid gap-3 border-t border-gray-100 pt-5 sm:grid-cols-[160px_160px_auto]"><label className="text-xs font-semibold text-gray-600">De<input type="date" value={period.from} onChange={(e) => { setPreset('custom'); setPeriod({ ...period, from: e.target.value }); }} className="mt-1 block h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label><label className="text-xs font-semibold text-gray-600">Ate<input type="date" value={period.to} onChange={(e) => { setPreset('custom'); setPeriod({ ...period, to: e.target.value }); }} className="mt-1 block h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label><button onClick={load} className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg bg-gray-900 px-4 text-sm font-bold text-white sm:w-fit"><RefreshCw className="h-4 w-4" />Atualizar</button></div>
    </section>
    <div className="flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 shadow-sm">{[['overview','Visao geral',WalletCards],['products','Produtos',Package],['operation','Operacao',Clock3]].map(([id,label,Icon]: any) => <button key={id} onClick={() => setTab(id)} className={`inline-flex min-w-36 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${tab === id ? 'bg-emerald-600 text-white' : 'text-gray-600'}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading ? <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">Calculando indicadores...</div> : <>
      {tab === 'overview' && data.summary && <Overview data={data.summary} maxRevenue={maxRevenue} />}
      {tab === 'products' && data.products && <ProductsReport data={data.products} />}
      {tab === 'operation' && data.operation && <OperationReport data={data.operation} maxHour={maxHour} />}
    </>}
  </div>;
}

function Overview({ data, maxRevenue }: any) {
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCard(WalletCards, 'Faturamento', money(data.metrics.revenue))}{metricCard(ShoppingBag, 'Pedidos validos', data.metrics.validOrders)}{metricCard(TrendingUp, 'Ticket medio', money(data.metrics.averageOrder))}{metricCard(BarChart3, 'Cancelamentos', data.metrics.cancelled, `${data.metrics.orders ? (data.metrics.cancelled / data.metrics.orders * 100).toFixed(1) : '0,0'}% dos pedidos`)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]"><section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-gray-900">Faturamento por dia</h3>{data.byDay.length ? <div className="mt-6 flex h-56 items-end gap-2 overflow-x-auto pb-2">{data.byDay.map((day: any) => <div key={day.date} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-semibold text-gray-500">{money(day.revenue)}</span><div className="w-full max-w-12 rounded-t-lg bg-emerald-500" style={{ height: `${Math.max(6, Number(day.revenue || 0) / maxRevenue * 150)}px` }} /><span className="text-[10px] text-gray-400">{day.date.slice(5).split('-').reverse().join('/')}</span></div>)}</div> : <p className="mt-10 text-center text-sm text-gray-500">Nenhuma venda valida no periodo.</p>}</section>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-gray-900">Como recebeu</h3><div className="mt-4 space-y-3">{!data.payments.length && <p className="text-sm text-gray-500">Sem recebimentos no periodo.</p>}{data.payments.map((item: any) => <div key={item.method} className="flex items-center justify-between rounded-xl bg-gray-50 p-3"><div><p className="text-sm font-bold text-gray-800">{paymentMethodLabel(item.method)}</p><p className="text-xs text-gray-400">{item.orders} pedido(s)</p></div><strong>{money(item.total)}</strong></div>)}</div><div className="mt-5 space-y-2 border-t border-gray-100 pt-4 text-sm"><div className="flex justify-between"><span className="text-gray-500">Descontos concedidos</span><strong>{money(data.metrics.discounts)}</strong></div><div className="flex justify-between"><span className="text-gray-500">Taxas de entrega cobradas</span><strong>{money(data.metrics.deliveryFees)}</strong></div></div></section></div></div>;
}

function ProductsReport({ data }: any) {
  return <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]"><section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="p-5"><h3 className="font-bold text-gray-900">Ranking de produtos</h3><p className="mt-1 text-xs text-gray-500">Valores historicos gravados nos pedidos.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="p-4">#</th><th className="p-4">Produto</th><th className="p-4">Categoria</th><th className="p-4 text-right">Unidades</th><th className="p-4 text-right">Faturamento</th></tr></thead><tbody className="divide-y divide-gray-100">{data.products.map((item: any, index: number) => <tr key={`${item.productId}-${item.name}`}><td className="p-4 font-black text-gray-400">{index + 1}</td><td className="p-4 font-bold">{item.name}</td><td className="p-4 text-gray-500">{item.category || 'Sem categoria historica'}</td><td className="p-4 text-right">{item.units}</td><td className="p-4 text-right font-black">{money(item.revenue)}</td></tr>)}</tbody></table></div>{!data.products.length && <p className="p-10 text-center text-sm text-gray-500">Nenhum produto vendido no periodo.</p>}</section>
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Tags className="h-5 w-5 text-emerald-600" /><h3 className="font-bold">Categorias</h3></div><div className="mt-5 space-y-4">{data.categories.map((item: any) => <div key={item.category}><div className="flex justify-between gap-3 text-sm"><div><p className="font-bold">{item.category || 'Sem categoria historica'}</p><p className="text-xs text-gray-400">{item.units} item(ns)</p></div><div className="text-right"><strong>{money(item.revenue)}</strong><p className="text-xs text-gray-400">{Number(item.share).toFixed(1)}%</p></div></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Number(item.share))}%` }} /></div></div>)}</div></section></div>;
}

function OperationReport({ data, maxHour }: any) {
  const value = (minutes: unknown, samples: number) => samples >= 2 && minutes != null ? `${minutes} min` : 'Dados insuficientes';
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCard(Clock3, 'Ate iniciar preparo', value(data.metrics.averageToPrepareMinutes, data.metrics.samples.start), `${data.metrics.samples.start} amostra(s)`)}{metricCard(Clock3, 'Tempo de preparo', value(data.metrics.averagePreparationMinutes, data.metrics.samples.preparation), `${data.metrics.samples.preparation} amostra(s)`)}{metricCard(TrendingUp, 'Tempo total do pedido', value(data.metrics.averageTotalMinutes, data.metrics.samples.total), `${data.metrics.samples.total} amostra(s)`)}{metricCard(ShoppingBag, 'Taxa de cancelamento', data.metrics.cancellationRate == null ? 'Dados insuficientes' : `${Number(data.metrics.cancellationRate).toFixed(1)}%`)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]"><section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="font-bold">Pedidos por horario</h3>{data.byHour.length ? <div className="mt-6 flex h-56 items-end gap-2 overflow-x-auto pb-2">{data.byHour.map((item: any) => <div key={item.hour} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2"><span className="text-xs font-bold">{item.orders}</span><div className="w-full max-w-12 rounded-t-lg bg-blue-500" style={{ height: `${Math.max(6, Number(item.orders) / maxHour * 150)}px` }} /><span className="text-[10px] text-gray-400">{item.hour}</span></div>)}</div> : <p className="mt-10 text-center text-sm text-gray-500">Dados insuficientes.</p>}</section><section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="font-bold">Maior movimento</h3><div className="mt-5 space-y-3">{data.peakHours.map((item: any, index: number) => <div key={item.hour} className="flex items-center justify-between rounded-xl bg-gray-50 p-4"><div><p className="text-xs font-bold text-gray-400">{index + 1}o horario</p><p className="text-lg font-black">{item.hour}</p></div><strong>{item.orders} pedido(s)</strong></div>)}{!data.peakHours.length && <p className="text-sm text-gray-500">Dados insuficientes.</p>}</div></section></div></div>;
}
