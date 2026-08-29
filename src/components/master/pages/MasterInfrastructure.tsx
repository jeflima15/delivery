import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, Clock3, Cloud, Database, Gauge, HardDrive,
  RefreshCw, Server, ShieldCheck, ShoppingBag, Store, TrendingDown, TrendingUp, WifiOff, Zap,
} from 'lucide-react';
import { masterRequest } from '../api';
import { Card, ErrorState, LoadingState, PageHeader, buttonSecondary } from '../components/MasterUI';
import type { InfrastructureResponse, MonitorProvider, MonitorStatus } from '../types';

type HistoryPoint = {
  timestamp: number;
  apiMs?: number;
  mongoMs?: number;
  upstashMs?: number;
  supabaseMs?: number;
  orders5m: number;
  atlasConnectionsPercent?: number;
  atlasOperationsPercent?: number;
  atlasStoragePercent?: number;
};

const statusUi: Record<MonitorStatus, { label: string; badge: string; dot: string }> = {
  healthy: { label: 'Normal', badge: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  warning: { label: 'Atenção', badge: 'border-amber-500/25 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' },
  critical: { label: 'Crítico', badge: 'border-red-500/25 bg-red-500/10 text-red-300', dot: 'bg-red-400' },
  unconfigured: { label: 'Não configurado', badge: 'border-slate-700 bg-slate-800/70 text-slate-400', dot: 'bg-slate-500' },
  unavailable: { label: 'Indisponível', badge: 'border-rose-500/25 bg-rose-500/10 text-rose-300', dot: 'bg-rose-400' },
};

const statusWeight: Record<MonitorStatus, number> = { unconfigured: 0, healthy: 1, unavailable: 2, warning: 3, critical: 4 };

function worstStatus(...statuses: MonitorStatus[]): MonitorStatus {
  return statuses.reduce((worst, status) => statusWeight[status] > statusWeight[worst] ? status : worst, 'unconfigured');
}

function percentage(value?: number, limit?: number): number | undefined {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || Number(limit) <= 0) return undefined;
  return Math.max(0, Math.round(Number(value) / Number(limit) * 100));
}

function formatInteger(value?: number) {
  return value === undefined ? 'Não disponível' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value);
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatBytes(bytes?: number) {
  if (bytes === undefined) return 'Não disponível';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} GB`;
}

function StatusPill({ status }: { status: MonitorStatus }) {
  const ui = statusUi[status];
  return <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ui.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${ui.dot}`}/>{ui.label}</span>;
}

function Trend({ values }: { values: Array<number | undefined> }) {
  const valid = values.filter((value): value is number => Number.isFinite(value));
  if (valid.length < 2) return <span className="text-[11px] text-slate-600">coletando tendência</span>;
  const first = valid[0];
  const last = valid.at(-1)!;
  const delta = first === 0 ? last - first : (last - first) / Math.abs(first) * 100;
  if (Math.abs(delta) < 5) return <span className="text-[11px] text-slate-500">estável nesta sessão</span>;
  return delta > 0
    ? <span className="inline-flex items-center gap-1 text-[11px] text-amber-300"><TrendingUp className="h-3 w-3"/>subindo</span>
    : <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300"><TrendingDown className="h-3 w-3"/>caindo</span>;
}

function ProgressMetric({ label, value, limit, valueLabel, history = [] }: {
  label: string; value?: number; limit?: number; valueLabel?: string; history?: Array<number | undefined>;
}) {
  const percent = percentage(value, limit);
  const color = percent !== undefined && percent >= 90 ? 'bg-red-400' : percent !== undefined && percent >= 70 ? 'bg-amber-400' : 'bg-emerald-400';
  return <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-100">{valueLabel || formatInteger(value)}{limit !== undefined && <span className="font-normal text-slate-500"> / {formatInteger(limit)}</span>}</p></div>{percent !== undefined && <strong className="text-sm tabular-nums text-white">{percent}%</strong>}</div>{percent !== undefined ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full transition-[width] ${color}`} style={{ width: `${Math.min(percent, 100)}%` }}/></div> : <p className="mt-2 text-[11px] text-slate-600">Limite não disponibilizado pela integração.</p>}<div className="mt-2"><Trend values={history}/></div></div>;
}

function SimpleMetric({ label, value, hint, history }: { label: string; value: string; hint?: string; history?: Array<number | undefined> }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-100">{value}</p>{hint && <p className="mt-1 text-[11px] leading-4 text-slate-600">{hint}</p>}{history && <div className="mt-2"><Trend values={history}/></div>}</div>;
}

function ServiceCard({ icon, title, subtitle, status, message, children }: {
  icon: ReactNode; title: string; subtitle: string; status: MonitorStatus; message: string; children: ReactNode;
}) {
  return <Card className="overflow-hidden"><div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-4"><div className="flex min-w-0 gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-800 text-[var(--pv-accent)]">{icon}</span><div className="min-w-0"><h2 className="font-semibold text-white">{title}</h2><p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p></div></div><StatusPill status={status}/></div><div className="grid gap-3 p-4 sm:grid-cols-2">{children}</div><p className="border-t border-slate-800 px-4 py-3 text-xs leading-5 text-slate-500">{message}</p></Card>;
}

function LiveChart({ title, values, color, unit }: { title: string; values: number[]; color: string; unit: string }) {
  const width = 520; const height = 118; const max = Math.max(...values, 1); const min = Math.min(...values, 0); const span = Math.max(max - min, 1);
  const points = values.map((value, index) => `${values.length <= 1 ? width / 2 : index * width / (values.length - 1)},${height - 12 - ((value - min) / span) * (height - 24)}`).join(' ');
  return <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-400">{title}</p><strong className="text-sm tabular-nums text-white">{values.at(-1) ?? 0} {unit}</strong></div><svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-24 w-full" role="img" aria-label={`Tendência de ${title}`}><polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{values.map((value, index) => { const [x, y] = points.split(' ')[index].split(','); return <circle key={`${index}-${value}`} cx={x} cy={y} r="3" fill={color}/>; })}</svg><p className="mt-1 text-[11px] text-slate-600">Desde que esta página foi aberta.</p></div>;
}

function serviceMessage(primary: MonitorProvider<unknown>, optional?: MonitorProvider<unknown>) {
  if (optional?.configured) return optional.message;
  return optional && !optional.configured ? `${primary.message} ${optional.message}` : primary.message;
}

export default function MasterInfrastructure() {
  const [data, setData] = useState<InfrastructureResponse | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiProbeMs, setApiProbeMs] = useState<number>();
  const inFlight = useRef(false);

  const load = useCallback(async (manual = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (manual) setRefreshing(true);
    setError('');
    try {
      const healthStartedAt = performance.now();
      const [response, health] = await Promise.all([
        masterRequest<InfrastructureResponse>('/infrastructure'),
        fetch('/health', { cache: 'no-store' }).then((result) => ({ ok: result.ok, milliseconds: Math.round(performance.now() - healthStartedAt) })).catch(() => ({ ok: false, milliseconds: undefined })),
      ]);
      const measuredApiMs = health.ok ? health.milliseconds : undefined;
      setApiProbeMs(measuredApiMs);
      setData(response);
      const atlas = response.services.atlas.data;
      setHistory((items) => [...items, {
        timestamp: Date.now(),
        apiMs: measuredApiMs,
        mongoMs: response.services.mongo.data?.latencyMs,
        upstashMs: response.services.upstash.data?.latencyMs,
        supabaseMs: response.services.supabase.data?.latencyMs,
        orders5m: response.activity.orders5m,
        atlasConnectionsPercent: percentage(atlas?.connections, atlas?.connectionsLimit),
        atlasOperationsPercent: percentage(atlas?.operationsPerSecond, atlas?.operationsLimit),
        atlasStoragePercent: percentage(atlas?.storageBytes, atlas?.storageLimitBytes),
      }].slice(-60));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar a infraestrutura.');
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [load]);

  if (loading && !data) return <div className="space-y-6"><PageHeader eyebrow="Operação ao vivo" title="Infraestrutura" description="Coletando os primeiros sinais da plataforma..."/><LoadingState rows={8}/></div>;
  if (error && !data) return <ErrorState message={error} retry={() => load(true)}/>;
  if (!data) return null;

  const { activity, services } = data;
  const mongoStatus = worstStatus(services.mongo.status, services.atlas.configured ? services.atlas.status : 'unconfigured');
  const supabaseStatus = worstStatus(services.supabase.status, services.supabaseManagement.configured ? services.supabaseManagement.status : 'unconfigured');
  const vercelStatus = services.vercel.configured ? services.vercel.status : apiProbeMs === undefined ? 'unavailable' : 'healthy';
  const statuses = [mongoStatus, supabaseStatus, vercelStatus, services.upstash.status];
  const overall = worstStatus(...statuses);
  const atlas = services.atlas.data;
  const supabaseUsage = services.supabaseManagement.data;
  const vercel = services.vercel.data;
  const updatedLabel = new Date(data.sampledAt).toLocaleTimeString('pt-BR');

  return <div className="space-y-6"><PageHeader eyebrow="Radar de escala" title="Infraestrutura" description="Leitura ao vivo para identificar pressão, indisponibilidade e aproximação dos limites. Os pontos são descartados ao fechar a página." actions={<button className={buttonSecondary} disabled={refreshing} onClick={() => load(true)}><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}/>Atualizar agora</button>}/>
    <Card className="overflow-hidden"><div className="grid gap-5 p-5 lg:grid-cols-[1.35fr_1fr]"><div className="flex items-start gap-4"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${overall === 'critical' ? 'bg-red-500/15 text-red-300' : overall === 'warning' ? 'bg-amber-500/15 text-amber-300' : overall === 'unavailable' ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{overall === 'critical' || overall === 'warning' ? <AlertTriangle className="h-6 w-6"/> : overall === 'unavailable' ? <WifiOff className="h-6 w-6"/> : <ShieldCheck className="h-6 w-6"/>}</span><div><div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold text-white">Saúde atual da plataforma</h2><StatusPill status={overall}/></div><p className="mt-2 text-sm leading-6 text-slate-400">{overall === 'critical' ? 'Existe pelo menos um sinal crítico que merece verificação imediata.' : overall === 'warning' ? 'Há pressão em pelo menos um serviço. Acompanhe a tendência durante o pico.' : overall === 'unavailable' ? 'Uma integração configurada não respondeu nesta leitura.' : 'Os sinais disponíveis estão respondendo dentro das faixas normais.'}</p></div></div><div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-500">Última leitura</p><p className="mt-1 font-semibold tabular-nums text-white">{updatedLabel}</p></div><div className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-500">Próxima leitura</p><p className="mt-1 font-semibold text-white">em 30 segundos</p></div></div></div>{error && <div className="border-t border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-200">A última atualização falhou; os dados anteriores continuam visíveis. {error}</div>}</Card>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card className="p-4"><ShoppingBag className="h-5 w-5 text-[var(--pv-accent)]"/><p className="mt-3 text-xs text-slate-500">Pedidos nos últimos 5 min</p><strong className="mt-1 block text-2xl tabular-nums text-white">{activity.orders5m}</strong><Trend values={history.map((point) => point.orders5m)}/></Card><Card className="p-4"><Clock3 className="h-5 w-5 text-cyan-300"/><p className="mt-3 text-xs text-slate-500">Pedidos na última hora</p><strong className="mt-1 block text-2xl tabular-nums text-white">{activity.orders60m}</strong><p className="mt-1 text-xs text-slate-600">{activity.cancelled60m} cancelado(s)</p></Card><Card className="p-4"><Activity className="h-5 w-5 text-amber-300"/><p className="mt-3 text-xs text-slate-500">Pedidos em andamento</p><strong className="mt-1 block text-2xl tabular-nums text-white">{activity.inProgress}</strong><p className="mt-1 text-xs text-slate-600">janela operacional de 24h</p></Card><Card className="p-4"><Store className="h-5 w-5 text-emerald-300"/><p className="mt-3 text-xs text-slate-500">Lojas com pedidos na última hora</p><strong className="mt-1 block text-2xl tabular-nums text-white">{activity.storesWithOrders60m}</strong><p className="mt-1 text-xs text-slate-600">GMV {formatMoney(activity.gmv60mCents)}</p></Card></section>

    <section className="grid gap-4 xl:grid-cols-2"><ServiceCard icon={<Database className="h-5 w-5"/>} title="MongoDB Atlas" subtitle={atlas?.tier ? `Cluster ${atlas.tier}` : 'Banco de pedidos e configurações'} status={mongoStatus} message={serviceMessage(services.mongo, services.atlas)}><SimpleMetric label="Ping real da aplicação" value={services.mongo.data?.latencyMs === undefined ? 'Não disponível' : `${services.mongo.data.latencyMs} ms`} history={history.map((point) => point.mongoMs)}/><SimpleMetric label="Estado da conexão" value={services.mongo.status === 'healthy' || services.mongo.status === 'warning' ? 'Conectado' : 'Indisponível'} hint="Medição da instância que respondeu ao Master."/><ProgressMetric label="Conexões Atlas" value={atlas?.connections} limit={atlas?.connectionsLimit} history={history.map((point) => point.atlasConnectionsPercent)}/><ProgressMetric label="Operações por segundo" value={atlas?.operationsPerSecond} limit={atlas?.operationsLimit} history={history.map((point) => point.atlasOperationsPercent)}/><ProgressMetric label="Armazenamento" value={atlas?.storageBytes} limit={atlas?.storageLimitBytes} valueLabel={formatBytes(atlas?.storageBytes)} history={history.map((point) => point.atlasStoragePercent)}/><SimpleMetric label="Tier detectado" value={atlas?.tier || 'Atlas avançado não configurado'}/></ServiceCard>

      <ServiceCard icon={<HardDrive className="h-5 w-5"/>} title="Supabase Storage" subtitle="Imagens dos cardápios e identidade" status={supabaseStatus} message={serviceMessage(services.supabase, services.supabaseManagement)}><SimpleMetric label="Resposta do Storage" value={services.supabase.data?.latencyMs === undefined ? 'Não disponível' : `${services.supabase.data.latencyMs} ms`} history={history.map((point) => point.supabaseMs)}/><SimpleMetric label="Buckets acessíveis" value={formatInteger(services.supabase.data?.bucketCount)}/><SimpleMetric label="Requisições Storage" value={formatInteger(supabaseUsage?.storageRequests)} hint="Janela devolvida pela Management API."/><SimpleMetric label="Requisições totais" value={formatInteger(supabaseUsage?.totalRequests)}/><ProgressMetric label="Armazenamento atual (referência Free)" value={supabaseUsage?.storageBytes} limit={supabaseUsage?.storageReferenceLimitBytes} valueLabel={formatBytes(supabaseUsage?.storageBytes)} history={[]}/><SimpleMetric label="Egress" value="Não disponível" hint="A API oficial atual não fornece esse dado em tempo real para esta integração."/></ServiceCard>

      <ServiceCard icon={<Cloud className="h-5 w-5"/>} title="Vercel / PodeVir API" subtitle="Aplicação e último deploy de produção" status={vercelStatus} message={services.vercel.configured ? services.vercel.message : `A aplicação respondeu ao probe. ${services.vercel.message}`}><SimpleMetric label="Probe da aplicação" value={apiProbeMs === undefined ? 'Indisponível' : `${apiProbeMs} ms`} history={history.map((point) => point.apiMs)}/><SimpleMetric label="Estado do deploy" value={vercel?.state || 'Vercel não configurada'}/><SimpleMetric label="Criado em" value={vercel?.createdAt ? new Date(vercel.createdAt).toLocaleString('pt-BR') : 'Não disponível'}/><SimpleMetric label="Pronto em" value={vercel?.readyAt ? new Date(vercel.readyAt).toLocaleString('pt-BR') : 'Não disponível'}/><div className="sm:col-span-2"><SimpleMetric label="Última alteração" value={vercel?.commitMessage || 'Não disponível'} hint={vercel?.url ? `Produção: ${vercel.url}` : undefined}/></div></ServiceCard>

      <ServiceCard icon={<Zap className="h-5 w-5"/>} title="Upstash Redis" subtitle="Rate limit e proteção distribuída" status={services.upstash.status} message={services.upstash.message}><SimpleMetric label="Ping do Redis" value={services.upstash.data?.latencyMs === undefined ? 'Não disponível' : `${services.upstash.data.latencyMs} ms`} history={history.map((point) => point.upstashMs)}/><SimpleMetric label="Proteção distribuída" value={services.upstash.status === 'healthy' || services.upstash.status === 'warning' ? 'Ativa' : services.upstash.configured ? 'Com falha' : 'Não configurada'}/><SimpleMetric label="Consumo de comandos" value="Não disponível" hint="O token REST do banco não expõe a franquia da conta."/><SimpleMetric label="Persistência do monitor" value="Nenhuma" hint="O painel apenas executa PING; não grava métricas no Redis."/></ServiceCard></section>

    <Card className="p-5"><div className="flex items-center gap-3"><Gauge className="h-5 w-5 text-[var(--pv-accent)]"/><div><h2 className="font-semibold text-white">Tendência desta sessão</h2><p className="mt-1 text-xs text-slate-500">Até 60 leituras temporárias, mantidas somente nesta aba.</p></div></div><div className="mt-5 grid gap-4 lg:grid-cols-3"><LiveChart title="Aplicação" values={history.map((point) => point.apiMs ?? 0)} color="#22d3ee" unit="ms"/><LiveChart title="MongoDB" values={history.map((point) => point.mongoMs ?? 0)} color="#34d399" unit="ms"/><LiveChart title="Pedidos em 5 min" values={history.map((point) => point.orders5m)} color="#f8a838" unit="pedidos"/></div></Card>

    {data.configuration.missing.length > 0 && <Card className="border-amber-500/20 bg-amber-500/[0.04] p-5"><div className="flex items-start gap-3"><Server className="mt-0.5 h-5 w-5 shrink-0 text-amber-300"/><div><h2 className="font-semibold text-amber-100">Integrações opcionais pendentes</h2><p className="mt-1 text-sm leading-6 text-slate-400">O monitor já funciona com os dados nativos. Adicione estas variáveis na Vercel para liberar as leituras avançadas:</p><div className="mt-3 flex flex-wrap gap-2">{data.configuration.missing.map((variable) => <code key={variable} className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300">{variable}</code>)}</div><p className="mt-3 text-xs text-slate-500">Os valores nunca são retornados ao navegador; somente os nomes das variáveis ausentes.</p></div></div></Card>}
  </div>;
}
