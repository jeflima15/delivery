import { Activity, AlarmClock, BarChart3, Building2, Download, Layers3, LineChart, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { masterRequest, queryString } from '../api';
import { useRemote } from '../hooks';
import type { PeriodKey } from '../types';
import { date, downloadCsv, money, periodLabels, rangeForPeriod } from '../utils';
import { Card, EmptyState, ErrorState, LoadingState, MiniAreaChart, PageHeader, fieldClass } from '../components/MasterUI';

type ReportItem = {
  _id: string | { month?: string; status?: string; plan?: string };
  value?: number | null;
  cents?: number;
  count?: number;
  displayName?: string;
  status?: string;
  orders?: number;
  gmvCents?: number;
  averageOrderCents?: number;
  trialEndsAt?: string;
  lastActivityAt?: string;
};

const reports = [
  { key: 'store-growth', title: 'Crescimento de lojas', description: 'Novas lojas por mês', icon: Building2 },
  { key: 'revenue', title: 'Receita SaaS', description: 'Recebida, pendente e vencida', icon: ReceiptText },
  { key: 'store-ranking', title: 'Ranking de lojas', description: 'Pedidos, GMV e ticket médio', icon: BarChart3 },
  { key: 'tenant-status', title: 'Lojas por status', description: 'Distribuição atual da base', icon: LineChart },
  { key: 'tenant-plan', title: 'Status e plano', description: 'Composição comercial das lojas', icon: Layers3 },
  { key: 'mrr-by-plan', title: 'MRR por plano', description: 'Receita mensal normalizada atual', icon: ReceiptText },
  { key: 'trials-ending', title: 'Trials vencendo', description: 'Lojas com trial no período', icon: AlarmClock },
  { key: 'inactive-stores', title: 'Sem atividade', description: 'Lojas sem uso desde o início do período', icon: Activity },
] as const;

export default function MasterReports({ period, setPeriod }: { period: PeriodKey; setPeriod: (period: PeriodKey) => void }) {
  const [report, setReport] = useState<(typeof reports)[number]['key']>('store-growth');
  const range = rangeForPeriod(period);
  const remote = useRemote(
    () => masterRequest<{ success: true; items: ReportItem[] }>(`/reports/${report}${queryString(range)}`),
    [report, period],
  );
  const rows = remote.data?.items || [];
  const current = reports.find((item) => item.key === report)!;

  const label = (item: ReportItem) => {
    if (item.displayName) return item.displayName;
    if (typeof item._id === 'string') return item._id;
    return [item._id.plan, item._id.status, item._id.month].filter(Boolean).join(' · ');
  };
  const numericValue = (item: ReportItem) => item.value ?? item.cents ?? item.gmvCents ?? 0;
  const displayValue = (item: ReportItem) => {
    if (report === 'revenue' || report === 'mrr-by-plan') return money(item.cents || 0);
    if (report === 'trials-ending') return item.trialEndsAt ? date(item.trialEndsAt) : '—';
    if (report === 'inactive-stores') return item.lastActivityAt ? `${item.value || 0} dias` : 'Nunca registrada';
    return String(numericValue(item));
  };
  const exportRows = rows.map((item) => ({
    Referência: label(item),
    Status: item.status || (typeof item._id === 'object' ? item._id.status || '' : ''),
    Valor: displayValue(item),
    Pedidos: item.orders || 0,
    GMV: item.gmvCents ? money(item.gmvCents) : '',
    'Trial encerra': item.trialEndsAt ? date(item.trialEndsAt) : '',
    'Última atividade': item.lastActivityAt ? date(item.lastActivityAt, true) : '',
  }));

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Inteligência gerencial"
      title="Relatórios"
      description="Indicadores calculados com dados reais. Métricas sem histórico suficiente não são estimadas."
      actions={<select className={`${fieldClass} w-44`} value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)}>{Object.entries(periodLabels).map(([key, item]) => <option key={key} value={key}>{item}</option>)}</select>}
    />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {reports.map((item) => {
        const Icon = item.icon;
        return <button key={item.key} onClick={() => setReport(item.key)} className={`rounded-2xl border p-4 text-left transition ${report === item.key ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}>
          <Icon className={`h-5 w-5 ${report === item.key ? 'text-emerald-300' : 'text-slate-500'}`}/>
          <strong className="mt-4 block text-sm text-white">{item.title}</strong>
          <p className="mt-1 text-xs text-slate-500">{item.description}</p>
        </button>;
      })}
    </div>
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold text-white">{current.title}</h2><p className="mt-1 text-xs text-slate-500">Período: {periodLabels[period]}</p></div>
        <button disabled={!rows.length} onClick={() => downloadCsv(`${report}.csv`, exportRows)} className="flex items-center gap-2 text-sm text-emerald-300 disabled:opacity-40"><Download className="h-4 w-4"/>Exportar CSV</button>
      </div>
      {remote.loading ? <div className="mt-6"><LoadingState rows={4}/></div> : remote.error ? <div className="mt-6"><ErrorState message={remote.error} retry={remote.refresh}/></div> : rows.length ? <>
        {!['store-ranking', 'trials-ending', 'inactive-stores'].includes(report) && <MiniAreaChart points={rows.map((item) => ({ date: label(item), value: Number(numericValue(item) || 0) }))} valueKey="value"/>}
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[660px] text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-3">Referência</th>{report === 'store-ranking' ? <><th className="text-right">Pedidos</th><th className="text-right">GMV</th><th className="text-right">Ticket médio</th></> : <><th>Status</th><th className="text-right">Valor</th></>}</tr></thead><tbody className="divide-y divide-slate-800">{rows.map((item, index) => <tr key={`${label(item)}-${index}`}><td className="py-3 text-slate-300">{label(item)}</td>{report === 'store-ranking' ? <><td className="text-right text-slate-400">{item.orders || 0}</td><td className="text-right text-white">{money(item.gmvCents || 0)}</td><td className="text-right text-slate-400">{money(item.averageOrderCents || 0)}</td></> : <><td className="text-slate-500">{item.status || (typeof item._id === 'object' ? item._id.status || '—' : '—')}</td><td className="text-right text-white">{displayValue(item)}</td></>}</tr>)}</tbody></table></div>
      </> : <EmptyState title="Dados insuficientes" description="Este indicador ainda não possui base confiável no período selecionado."/>}
    </Card>
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400"><strong className="text-slate-200">Conversão de trial e churn:</strong> indisponíveis até existir histórico de transições suficiente para um cálculo auditável.</div>
  </div>;
}
