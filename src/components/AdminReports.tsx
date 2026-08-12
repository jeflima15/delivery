import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Clock3,
  CreditCard,
  DollarSign,
  Download,
  Minus,
  Package,
  Printer,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Tags,
  TrendingUp,
  UtensilsCrossed,
  WalletCards,
  Banknote,
  Percent,
} from 'lucide-react';
import { paymentMethodLabel } from '../lib/paymentMethods';
import { downloadBlob } from '../lib/download';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { useToast } from './Toast';

const money = (value: unknown) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

function presetDates(id: string) {
  const to = new Date();
  const from = new Date(to);
  if (id === 'today') {
    // mesmo dia
  } else if (id === 'yesterday') {
    from.setDate(from.getDate() - 1);
    to.setDate(to.getDate() - 1);
  } else if (id === '7days') {
    from.setDate(from.getDate() - 6);
  } else if (id === '30days') {
    from.setDate(from.getDate() - 29);
  } else if (id === 'month') {
    from.setDate(1);
  }
  return { from: localDate(from), to: localDate(to) };
}

function formatDatePtBR(isoDateStr: string) {
  if (!isoDateStr) return '';
  const parts = isoDateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDateStr;
}

export default function AdminReports() {
  const api = useTenantAdminApi();
  const { showToast } = useToast();
  const [tab, setTab] = useState<'overview' | 'products' | 'operation'>('overview');
  const [preset, setPreset] = useState('30days');
  const [period, setPeriod] = useState(presetDates('30days'));
  const [data, setData] = useState<any>({
    summary: null,
    products: null,
    operation: null,
    settings: null,
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, productsRes, operationRes, settingsRes] = await Promise.all([
        api.getReportSummary(period.from, period.to),
        api.getProductReport(period.from, period.to),
        api.getOperationReport(period.from, period.to),
        api.getSettings(),
      ]);

      setData({
        summary: summaryRes,
        products: productsRes,
        operation: operationRes,
        settings: settingsRes?.settings || null,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os relatórios.');
      setData({
        summary: null,
        products: null,
        operation: null,
        settings: null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [period.from, period.to]);

  const setPresetPeriod = (id: string) => {
    setPreset(id);
    setPeriod(presetDates(id));
  };

  const maxRevenue = useMemo(() => {
    const items = data.summary?.byDay || [];
    if (!items.length) return 1;
    return Math.max(1, ...items.map((day: any) => Number(day.revenue || 0)));
  }, [data.summary]);

  const maxHourOrders = useMemo(() => {
    const items = data.operation?.byHour || [];
    if (!items.length) return 1;
    return Math.max(1, ...items.map((hour: any) => Number(hour.orders || 0)));
  }, [data.operation]);

  const exportCsv = async (kind: 'summary' | 'products' | 'categories') => {
    setExporting(kind);
    try {
      const blob = await api.exportReport(kind, period.from, period.to);
      downloadBlob(blob, `${kind}-${period.from}-a-${period.to}.csv`);
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : 'Erro ao exportar relatório.',
        'error'
      );
    } finally {
      setExporting('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls Panel */}
      <section className="admin-no-print rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
                Inteligência Operacional
              </span>
            </div>
            <h2 className="mt-1.5 text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">
              Relatórios & Fechamento
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Análise clara de faturamento, recebimentos por forma de pagamento, vendas por produto e ritmo operacional.
            </p>
          </div>

          {/* Quick Period Selectors */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/80 p-1.5">
            {[
              ['today', 'Hoje'],
              ['yesterday', 'Ontem'],
              ['7days', '7 dias'],
              ['30days', '30 dias'],
              ['month', 'Este mês'],
            ].map(([id, label]) => {
              const active = preset === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPresetPeriod(id)}
                  className={`h-8 rounded-lg px-3 text-xs font-bold transition-all ${
                    active
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-gray-600 hover:bg-white hover:text-gray-900'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date Inputs & Action Buttons Row */}
        <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-2xs">
              <Calendar className="h-4 w-4 text-emerald-600" />
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                De
                <input
                  type="date"
                  value={period.from}
                  onChange={(e) => {
                    setPreset('custom');
                    setPeriod({ ...period, from: e.target.value });
                  }}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-bold text-gray-900 focus:border-emerald-500 focus:outline-none"
                />
              </label>
              <span className="text-gray-300">|</span>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                Até
                <input
                  type="date"
                  value={period.to}
                  onChange={(e) => {
                    setPreset('custom');
                    setPeriod({ ...period, to: e.target.value });
                  }}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-bold text-gray-900 focus:border-emerald-500 focus:outline-none"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3.5 text-xs font-bold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>

          {/* Export Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportCsv(tab === 'products' ? 'products' : 'summary')
              }
              disabled={Boolean(exporting)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700 shadow-2xs transition-all hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5 text-gray-500" />
              {exporting
                ? 'Exportando...'
                : tab === 'products'
                ? 'Exportar Produtos (CSV)'
                : 'Exportar Fechamento (CSV)'}
            </button>

            {tab === 'products' && (
              <button
                type="button"
                onClick={() => exportCsv('categories')}
                disabled={Boolean(exporting)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700 shadow-2xs transition-all hover:bg-gray-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5 text-gray-500" />
                Categorias (CSV)
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-2xs transition-all hover:bg-emerald-700"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir / PDF
            </button>
          </div>
        </div>
      </section>

      {/* Tabs Navigation */}
      <div className="admin-no-print flex items-center gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xs">
        {[
          ['overview', 'Visão geral', WalletCards],
          ['products', 'Produtos & Categorias', Package],
          ['operation', 'Desempenho Operacional', Clock3],
        ].map(([id, label, Icon]: any) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex min-w-40 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                active
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="admin-no-print rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Main Content Area */}
      <div className="admin-no-print">
        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 text-center shadow-2xs">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
            <p className="mt-3 text-xs font-bold text-gray-700">Calculando indicadores do período...</p>
            <p className="mt-1 text-xs text-gray-400">Compilando vendas, recebimentos e métricas operacionais.</p>
          </div>
        ) : (
          <>
            {tab === 'overview' && data.summary && (
              <Overview
                data={data.summary}
                maxRevenue={maxRevenue}
                periodFrom={period.from}
                periodTo={period.to}
              />
            )}
            {tab === 'products' && data.products && (
              <ProductsReport data={data.products} />
            )}
            {tab === 'operation' && data.operation && (
              <OperationReport data={data.operation} maxHourOrders={maxHourOrders} />
            )}
          </>
        )}
      </div>

      {/* Printable Report Component */}
      {!loading && data.summary && (
        <SalesPrintReport
          summary={data.summary}
          products={data.products}
          settings={data.settings}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   METRIC CARD & COMPARISON BADGE
   ========================================================================== */

function MetricCard({
  Icon,
  label,
  value,
  comparison,
  lowerIsBetter = false,
  helper,
}: any) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs transition-all hover:border-gray-300">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-600/10">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-black tracking-tight text-gray-900">{value}</p>
      {comparison && <Comparison value={comparison} lowerIsBetter={lowerIsBetter} />}
      {helper && <p className="mt-1.5 text-[11px] font-medium text-gray-400">{helper}</p>}
    </div>
  );
}

function Comparison({
  value,
  lowerIsBetter = false,
}: {
  value: any;
  lowerIsBetter?: boolean;
}) {
  if (!value || value.state === 'unavailable' || value.percent == null) {
    return (
      <p className="mt-2 text-[11px] font-medium text-gray-400">
        Sem comparativo anterior
      </p>
    );
  }

  const percent = Number(value.percent || 0);
  const isZero = Math.abs(percent) < 0.05;

  let isFavorable = value.favorable;
  if (lowerIsBetter) {
    isFavorable = percent < 0;
  }

  const Icon = percent > 0 ? ArrowUpRight : percent < 0 ? ArrowDownRight : Minus;

  const colorClasses = isZero
    ? 'text-gray-500 bg-gray-50 border-gray-200'
    : isFavorable
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : 'text-red-700 bg-red-50 border-red-200';

  return (
    <div className="mt-2.5 flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${colorClasses}`}
      >
        <Icon className="h-3 w-3" />
        {Math.abs(percent).toFixed(1).replace('.', ',')}%
      </span>
      <span className="text-[11px] font-medium text-gray-500">vs. período anterior</span>
    </div>
  );
}

/* ==========================================================================
   TAB 1: VISÃO GERAL
   ========================================================================== */

function Overview({
  data,
  maxRevenue,
  periodFrom,
  periodTo,
}: {
  data: any;
  maxRevenue: number;
  periodFrom: string;
  periodTo: string;
}) {
  const [hoveredDay, setHoveredDay] = useState<any>(null);

  const totalPaymentRevenue = useMemo(() => {
    return (data.payments || []).reduce((acc: number, p: any) => acc + Number(p.total || 0), 0);
  }, [data.payments]);

  return (
    <div className="space-y-6">
      {/* Top 5 Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          Icon={WalletCards}
          label="Faturamento Total"
          value={money(data.metrics?.revenue)}
          comparison={data.comparisons?.revenue}
          helper="Receita líquida total"
        />
        <MetricCard
          Icon={ShoppingBag}
          label="Pedidos Válidos"
          value={data.metrics?.validOrders || 0}
          comparison={data.comparisons?.validOrders}
          helper="Concluídos ou em preparo"
        />
        <MetricCard
          Icon={TrendingUp}
          label="Ticket Médio"
          value={money(data.metrics?.averageOrder)}
          comparison={data.comparisons?.averageOrder}
          helper="Faturamento ÷ Pedidos"
        />
        <MetricCard
          Icon={BarChart3}
          label="Cancelamentos"
          value={data.metrics?.cancelled || 0}
          comparison={data.comparisons?.cancelled}
          lowerIsBetter
          helper="Pedidos estornados/cancelados"
        />
        <MetricCard
          Icon={ShoppingBag}
          label="Novos Clientes"
          value={data.metrics?.newCustomers || 0}
          comparison={data.comparisons?.newCustomers}
          helper="Primeira compra no período"
        />
      </div>

      {/* Period Indicator Banner */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-2.5 text-xs text-gray-600">
        <div className="flex items-center gap-2 font-medium">
          <Calendar className="h-4 w-4 text-emerald-600" />
          <span>
            Exibindo dados de <strong className="text-gray-900">{formatDatePtBR(periodFrom)}</strong> até <strong className="text-gray-900">{formatDatePtBR(periodTo)}</strong>
          </span>
        </div>
        <span className="hidden sm:inline-block text-gray-400 font-medium">
          Comparado ao período imediatamente anterior de mesma duração
        </span>
      </div>

      {/* Main Charts & Payments Grid */}
      <div className="grid gap-6 lg:grid-cols-12 min-w-0">
        {/* Daily Revenue Chart */}
        <section className="lg:col-span-7 xl:col-span-8 min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Evolução do Faturamento</h3>
                <p className="text-xs text-gray-500">
                  Distribuição das vendas e número de pedidos dia a dia.
                </p>
              </div>
              {hoveredDay ? (
                <div className="flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs">
                  <span>📅 {formatDatePtBR(hoveredDay.date)}</span>
                  <span className="text-emerald-400">{money(hoveredDay.revenue)}</span>
                  <span className="text-gray-300">({hoveredDay.orders} ped.)</span>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
                  <BarChart3 className="h-4 w-4 text-emerald-600" />
                  <span>Passe o mouse na barra para detalhes</span>
                </div>
              )}
            </div>

            {data.byDay && data.byDay.length > 0 ? (
              <div className="mt-4 min-w-0">
                {/* Controlled height chart container (~260px) */}
                <div className="relative h-64 w-full min-w-0 pt-6 pb-2">
                  {/* Background Grid Lines */}
                  <div className="absolute inset-x-0 top-6 bottom-7 pointer-events-none flex flex-col justify-between border-b border-gray-100">
                    <div className="border-b border-dashed border-gray-100 w-full" />
                    <div className="border-b border-dashed border-gray-100 w-full" />
                    <div className="border-b border-dashed border-gray-100 w-full" />
                  </div>

                  {/* Bars Container */}
                  <div className="relative h-full flex items-end gap-1.5 sm:gap-2 overflow-x-auto min-w-0 pb-1">
                    {data.byDay.map((day: any, idx: number) => {
                      const rev = Number(day.revenue || 0);
                      const pct = Math.max(6, Math.min(100, (rev / maxRevenue) * 100));
                      const isHovered = hoveredDay?.date === day.date;

                      return (
                        <div
                          key={day.date || `day-${idx}`}
                          onMouseEnter={() => setHoveredDay(day)}
                          onMouseLeave={() => setHoveredDay(null)}
                          className="group flex h-full flex-1 min-w-[20px] max-w-[42px] flex-col items-center justify-end"
                        >
                          {/* Value on Hover / Top */}
                          <span className="mb-1 text-[10px] font-bold text-gray-700 opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap">
                            {rev >= 1000 ? `${(rev / 1000).toFixed(1)}k` : rev}
                          </span>

                          {/* Bar Track Container with resolved height */}
                          <div className="relative w-full flex-1 flex items-end justify-center rounded-t-md bg-gray-50/80">
                            <div
                              className={`w-full max-w-[28px] rounded-t-md transition-all duration-200 ${
                                isHovered
                                  ? 'bg-emerald-600 shadow-2xs ring-2 ring-emerald-400'
                                  : 'bg-emerald-500 hover:bg-emerald-600'
                              }`}
                              style={{ height: `${pct}%` }}
                            />
                          </div>

                          {/* Date Label */}
                          <span className="mt-2 text-[10px] font-semibold text-gray-400 group-hover:text-gray-900 transition-colors whitespace-nowrap">
                            {day.date.slice(5).split('-').reverse().join('/')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-8 flex flex-col items-center justify-center py-10 text-center text-xs text-gray-400">
                <BarChart3 className="h-8 w-8 text-gray-300" />
                <p className="mt-2 font-semibold">Não há vendas registradas neste período.</p>
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3 text-[11px] font-medium text-gray-400 flex items-center justify-between">
            <span>Maior faturamento diário: <strong className="text-gray-800">{money(maxRevenue)}</strong></span>
            <span>Total de dias: <strong className="text-gray-800">{data.byDay?.length || 0}</strong></span>
          </div>
        </section>

        {/* Payments Breakdown & Financial Summary */}
        <section className="lg:col-span-5 xl:col-span-4 min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Formas de Pagamento</h3>
                <p className="text-xs text-gray-500">Como seus clientes pagaram pelos pedidos.</p>
              </div>
              <WalletCards className="h-5 w-5 text-emerald-600" />
            </div>

            <div className="mt-4 space-y-2.5">
              {data.payments && data.payments.length > 0 ? (
                data.payments.map((item: any, idx: number) => {
                  const total = Number(item.total || 0);
                  const share = totalPaymentRevenue > 0 ? (total / totalPaymentRevenue) * 100 : 0;
                  const Icon = getPaymentIcon(item.method);

                  return (
                    <div
                      key={item.method || `payment-${idx}`}
                      className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 transition-colors hover:bg-gray-100/80"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-2xs text-gray-700">
                            <Icon className="h-3.5 w-3.5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">
                              {paymentMethodLabel(item.method)}
                            </p>
                            <p className="text-[11px] font-medium text-gray-400">
                              {item.orders} pedido(s)
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-gray-900">{money(total)}</p>
                          <p className="text-[11px] font-bold text-emerald-600">
                            {share.toFixed(1).replace('.', ',')}%
                          </p>
                        </div>
                      </div>

                      {/* Share Mini Progress Bar */}
                      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200/80">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.min(100, share)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="py-6 text-center text-xs text-gray-400">
                  Nenhum recebimento registrado.
                </p>
              )}
            </div>
          </div>

          {/* Delivery & Discounts Totals */}
          <div className="mt-5 border-t border-gray-100 pt-4 space-y-2 text-xs">
            <div className="flex justify-between items-center text-gray-600">
              <span>Taxas de entrega arrecadadas</span>
              <strong className="font-bold text-gray-900">
                {money(data.metrics?.deliveryFees)}
              </strong>
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span>Descontos concedidos (Cupons/Fidelidade)</span>
              <strong className="font-bold text-amber-700">
                {money(data.metrics?.discounts)}
              </strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function getPaymentIcon(method: string) {
  switch (method) {
    case 'pix':
      return QrCode;
    case 'card':
    case 'credit':
    case 'debit':
      return CreditCard;
    case 'cash':
      return Banknote;
    case 'food_voucher':
    case 'meal_voucher':
      return UtensilsCrossed;
    default:
      return DollarSign;
  }
}

/* ==========================================================================
   TAB 2: PRODUTOS & CATEGORIAS
   ========================================================================== */

function ProductsReport({ data }: { data: any }) {
  const [sortBy, setSortBy] = useState<'revenue' | 'units'>('units');

  const sortedProducts = useMemo(() => {
    const list = [...(data.products || [])];
    if (sortBy === 'units') {
      return list.sort((a, b) => b.units - a.units);
    }
    return list.sort((a, b) => b.revenue - a.revenue);
  }, [data.products, sortBy]);

  const totalProductRevenue = useMemo(() => {
    return (data.products || []).reduce((acc: number, p: any) => acc + Number(p.revenue || 0), 0);
  }, [data.products]);

  return (
    <div className="grid gap-6 lg:grid-cols-12 min-w-0">
      {/* Ranking de Produtos */}
      <section className="lg:col-span-7 xl:col-span-8 min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xs">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900">Ranking de Produtos</h3>
            <p className="text-xs text-gray-500">
              Produtos mais vendidos por volume de unidades ou maior faturamento.
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setSortBy('units')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                sortBy === 'units'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Mais vendidos (qtd)
            </button>
            <button
              type="button"
              onClick={() => setSortBy('revenue')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                sortBy === 'revenue'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Maior faturamento
            </button>
          </div>
        </div>

        <div className="overflow-x-auto min-w-0">
          <table className="w-full min-w-[580px] text-left text-xs">
            <thead className="bg-gray-50/80 text-[11px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
              <tr>
                <th className="p-3.5 pl-5">#</th>
                <th className="p-3.5">Produto</th>
                <th className="p-3.5">Categoria</th>
                <th className="p-3.5 text-right">Unidades</th>
                <th className="p-3.5 text-right">Faturamento</th>
                <th className="p-3.5 text-right pr-5">Participação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
              {sortedProducts.map((item: any, index: number) => {
                const share =
                  item.share != null
                    ? Number(item.share)
                    : totalProductRevenue > 0
                    ? (item.revenue / totalProductRevenue) * 100
                    : 0;

                const productKey = item.productId || item._id || item.id || (item.name ? `${item.name}-${index}` : `prod-${index}`);

                return (
                  <tr key={productKey} className="hover:bg-gray-50/50">
                    <td className="p-3.5 pl-5">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${
                          index === 0
                            ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                            : index === 1
                            ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-300'
                            : index === 2
                            ? 'bg-orange-100 text-orange-800 ring-1 ring-orange-200'
                            : 'text-gray-400 font-bold'
                        }`}
                      >
                        {index + 1}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-gray-900">{item.name}</td>
                    <td className="p-3.5 text-gray-500">{item.category}</td>
                    <td className="p-3.5 text-right font-bold text-gray-900">{item.units} un</td>
                    <td className="p-3.5 text-right font-black text-gray-900">
                      {money(item.revenue)}
                    </td>
                    <td className="p-3.5 text-right pr-5">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-bold text-emerald-600">
                          {share.toFixed(1).replace('.', ',')}%
                        </span>
                        <div className="h-1.5 w-12 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${Math.min(100, share)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!sortedProducts.length && (
          <p className="p-10 text-center text-xs text-gray-400">Nenhum produto vendido no período.</p>
        )}
      </section>

      {/* Performance por Categoria */}
      <section className="lg:col-span-5 xl:col-span-4 min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
          <Tags className="h-5 w-5 text-emerald-600" />
          <div>
            <h3 className="text-base font-bold text-gray-900">Desempenho por Categoria</h3>
            <p className="text-xs text-gray-500">Participação das categorias nas vendas totais.</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {data.categories && data.categories.length > 0 ? (
            data.categories.map((item: any, idx: number) => {
              const share = Number(item.share || 0);

              return (
                <div key={item.category || `cat-${idx}`} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-gray-900">{item.category}</p>
                      <p className="text-[11px] font-medium text-gray-400">{item.units} itens vendidos</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-gray-900">{money(item.revenue)}</p>
                      <p className="text-[11px] font-bold text-emerald-600">
                        {share.toFixed(1).replace('.', ',')}% do total
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 h-2 w-full rounded-full bg-gray-200/80">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(100, share)}%` }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-8 text-center text-xs text-gray-400">
              Nenhuma categoria registrada no período.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

/* ==========================================================================
   TAB 3: DESEMPENHO OPERACIONAL
   ========================================================================== */

function OperationReport({
  data,
  maxHourOrders,
}: {
  data: any;
  maxHourOrders: number;
}) {
  const formatDuration = (min: unknown) => {
    if (min == null || !Number.isFinite(Number(min))) return 'Aguardando dados';
    return `${Math.round(Number(min))} min`;
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Operational Timing KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 min-w-0">
        <MetricCard
          Icon={Clock3}
          label="Tempo até iniciar preparo"
          value={formatDuration(data.metrics?.averageToPrepareMinutes)}
          helper={`${data.metrics?.samples?.start || 0} pedido(s) analisados`}
        />
        <MetricCard
          Icon={Clock3}
          label="Tempo de preparo na cozinha"
          value={formatDuration(data.metrics?.averagePreparationMinutes)}
          helper={`${data.metrics?.samples?.preparation || 0} pedido(s) analisados`}
        />
        <MetricCard
          Icon={TrendingUp}
          label="Tempo total médio até entrega"
          value={formatDuration(data.metrics?.averageTotalMinutes)}
          helper={`${data.metrics?.samples?.total || 0} pedido(s) analisados`}
        />
        <MetricCard
          Icon={Percent}
          label="Taxa de cancelamento"
          value={
            data.metrics?.cancellationRate == null
              ? 'Aguardando dados'
              : `${Number(data.metrics.cancellationRate).toFixed(1).replace('.', ',')}%`
          }
          helper="Proporção sobre pedidos recebidos"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12 min-w-0">
        {/* Hourly Distribution Chart */}
        <section className="lg:col-span-7 xl:col-span-8 min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Distribuição por Horário</h3>
                <p className="text-xs text-gray-500">Volume de pedidos em cada hora do dia.</p>
              </div>
              <Clock3 className="h-5 w-5 text-emerald-600" />
            </div>

            {data.byHour && data.byHour.length > 0 ? (
              <div className="mt-4 min-w-0">
                <div className="relative h-60 w-full min-w-0 pt-6 pb-2">
                  <div className="absolute inset-x-0 top-6 bottom-7 pointer-events-none flex flex-col justify-between border-b border-gray-100">
                    <div className="border-b border-dashed border-gray-100 w-full" />
                    <div className="border-b border-dashed border-gray-100 w-full" />
                  </div>

                  <div className="relative h-full flex items-end gap-1.5 sm:gap-2 overflow-x-auto min-w-0 pb-1">
                    {data.byHour.map((item: any, idx: number) => {
                      const count = Number(item.orders || 0);
                      const pct = Math.max(8, Math.min(100, (count / maxHourOrders) * 100));

                      return (
                        <div
                          key={item.hour || `hour-${idx}`}
                          className="group flex h-full flex-1 min-w-[24px] max-w-[48px] flex-col items-center justify-end"
                        >
                          <span className="mb-1 text-[10px] font-bold text-gray-700">
                            {count}
                          </span>
                          <div className="relative w-full flex-1 flex items-end justify-center rounded-t-md bg-gray-50/80">
                            <div
                              className="w-full max-w-[32px] rounded-t-md bg-emerald-500 transition-all group-hover:bg-emerald-600"
                              style={{ height: `${pct}%` }}
                            />
                          </div>
                          <span className="mt-2 text-[10px] font-medium text-gray-400 group-hover:font-bold group-hover:text-gray-800">
                            {item.hour}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-gray-400">
                Sem dados operacionais para este período.
              </p>
            )}
          </div>
        </section>

        {/* Peak Hours Ranking */}
        <section className="lg:col-span-5 xl:col-span-4 min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-base font-bold text-gray-900">Horários de Maior Movimento</h3>
            <p className="text-xs text-gray-500">Horários de pico com maior demanda de pedidos.</p>
          </div>

          <div className="mt-5 space-y-3">
            {data.peakHours && data.peakHours.length > 0 ? (
              data.peakHours.map((item: any, index: number) => (
                <div
                  key={item.hour || `peak-${index}`}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 transition-colors hover:bg-gray-100/80"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-xs font-black text-emerald-800">
                      #{index + 1}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-gray-900">Horário: {item.hour}</p>
                      <p className="text-[11px] font-medium text-gray-400">Pico de atendimento</p>
                    </div>
                  </div>
                  <strong className="text-sm font-black text-gray-900">
                    {item.orders} pedido(s)
                  </strong>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-xs text-gray-400">
                Aguardando acúmulo de dados operacionais.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ==========================================================================
   PRINT / PDF TEMPLATE
   ========================================================================== */

function SalesPrintReport({
  summary,
  products,
  settings,
}: {
  summary: any;
  products: any;
  settings: any;
}) {
  return (
    <article className="sales-print-report hidden print:block">
      <header className="print-header">
        {settings?.logo_url && (
          <img src={settings.logo_url} alt="" className="h-12 w-auto object-contain" />
        )}
        <div>
          <p className="print-eyebrow">FECHAMENTO DE VENDAS & OPERAÇÃO</p>
          <h1>{settings?.nome_loja || 'Sua Loja'}</h1>
          <p>
            Período: {formatDatePtBR(summary.period.from)} a {formatDatePtBR(summary.period.to)}
          </p>
          <p>Relatório gerado em {new Date().toLocaleString('pt-BR')}</p>
        </div>
      </header>

      <section className="print-metrics">
        <PrintMetric label="Faturamento Total" value={money(summary.metrics.revenue)} />
        <PrintMetric label="Pedidos Válidos" value={summary.metrics.validOrders} />
        <PrintMetric label="Ticket Médio" value={money(summary.metrics.averageOrder)} />
        <PrintMetric label="Cancelamentos" value={summary.metrics.cancelled} />
      </section>

      <div className="print-grid">
        <section>
          <h2>Formas de Pagamento</h2>
          {(summary.payments || []).map((item: any, idx: number) => (
            <p key={item.method || `pay-${idx}`}>
              <span>{paymentMethodLabel(item.method)} ({item.orders} ped.)</span>
              <strong>{money(item.total)}</strong>
            </p>
          ))}
        </section>

        <section>
          <h2>Resumo Financeiro</h2>
          <p>
            <span>Taxas de entrega</span>
            <strong>{money(summary.metrics.deliveryFees)}</strong>
          </p>
          <p>
            <span>Descontos concedidos</span>
            <strong>{money(summary.metrics.discounts)}</strong>
          </p>
          <p>
            <span>Novos clientes</span>
            <strong>{summary.metrics.newCustomers || 0}</strong>
          </p>
        </section>
      </div>

      <div className="print-grid">
        <section>
          <h2>Principais Produtos</h2>
          {(products?.products || []).slice(0, 8).map((item: any, idx: number) => (
            <p key={item.productId || item._id || item.id || (item.name ? `${item.name}-${idx}` : `print-prod-${idx}`)}>
              <span>
                {item.name} · {item.units} un.
              </span>
              <strong>{money(item.revenue)}</strong>
            </p>
          ))}
        </section>

        <section>
          <h2>Principais Categorias</h2>
          {(products?.categories || []).slice(0, 8).map((item: any, idx: number) => (
            <p key={item.category || `print-cat-${idx}`}>
              <span>
                {item.category} · {Number(item.share || 0).toFixed(1)}%
              </span>
              <strong>{money(item.revenue)}</strong>
            </p>
          ))}
        </section>
      </div>
    </article>
  );
}

function PrintMetric({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
