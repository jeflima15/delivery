import mongoose from 'mongoose';
import { performance } from 'node:perf_hooks';
import { getEnv } from '../config/env.js';
import Order from '../../src/models/Order.js';

export type MonitorStatus = 'healthy' | 'warning' | 'critical' | 'unconfigured' | 'unavailable';

type ProviderResult<T> = {
  configured: boolean;
  status: MonitorStatus;
  checkedAt: string;
  message: string;
  data?: T;
};

type AtlasMetric = { name?: string; dataPoints?: Array<{ timestamp?: string; value?: number | null }> };

const MEGABYTE = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;

let atlasTokenCache: { token: string; expiresAt: number } | undefined;

export function statusFromPercent(percent?: number | null): MonitorStatus {
  if (!Number.isFinite(percent)) return 'healthy';
  if (Number(percent) >= 90) return 'critical';
  if (Number(percent) >= 70) return 'warning';
  return 'healthy';
}

export function statusFromLatency(milliseconds?: number | null): MonitorStatus {
  if (!Number.isFinite(milliseconds)) return 'unavailable';
  if (Number(milliseconds) >= 750) return 'critical';
  if (Number(milliseconds) >= 250) return 'warning';
  return 'healthy';
}

export function atlasProcessPath(hostname: string, port: number): string {
  return `${encodeURIComponent(hostname)}:${port}`;
}

function worstStatus(statuses: MonitorStatus[]): MonitorStatus {
  const weight: Record<MonitorStatus, number> = {
    unconfigured: 0,
    healthy: 1,
    unavailable: 2,
    warning: 3,
    critical: 4,
  };
  return statuses.reduce((worst, status) => weight[status] > weight[worst] ? status : worst, 'unconfigured');
}

async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS, operation = 'PROVIDER'): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${operation}_HTTP_${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

function configuredResult<T>(status: MonitorStatus, message: string, data?: T): ProviderResult<T> {
  return { configured: true, status, checkedAt: new Date().toISOString(), message, ...(data === undefined ? {} : { data }) };
}

function unconfiguredResult<T>(message: string): ProviderResult<T> {
  return { configured: false, status: 'unconfigured', checkedAt: new Date().toISOString(), message };
}

function unavailableResult<T>(message: string): ProviderResult<T> {
  return { configured: true, status: 'unavailable', checkedAt: new Date().toISOString(), message };
}

async function measure<T>(operation: () => Promise<T>): Promise<{ value: T; latencyMs: number }> {
  const startedAt = performance.now();
  const value = await operation();
  return { value, latencyMs: Math.max(0, Math.round(performance.now() - startedAt)) };
}

async function collectActivity() {
  const now = Date.now();
  const fiveMinutesAgo = new Date(now - 5 * 60_000);
  const fifteenMinutesAgo = new Date(now - 15 * 60_000);
  const oneHourAgo = new Date(now - 60 * 60_000);
  const oneDayAgo = new Date(now - 24 * 60 * 60_000);
  const orderCents = { $ifNull: ['$total_centavos', { $round: [{ $multiply: ['$total', 100] }, 0] }] };
  const validOrder = { $ne: ['$status', 'Cancelado'] };

  const [result] = await Order.aggregate([
    { $match: { createdAt: { $gte: oneDayAgo } } },
    {
      $facet: {
        summary: [{
          $group: {
            _id: null,
            orders5m: { $sum: { $cond: [{ $and: [validOrder, { $gte: ['$createdAt', fiveMinutesAgo] }] }, 1, 0] } },
            orders15m: { $sum: { $cond: [{ $and: [validOrder, { $gte: ['$createdAt', fifteenMinutesAgo] }] }, 1, 0] } },
            orders60m: { $sum: { $cond: [{ $and: [validOrder, { $gte: ['$createdAt', oneHourAgo] }] }, 1, 0] } },
            cancelled60m: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'Cancelado'] }, { $gte: ['$createdAt', oneHourAgo] }] }, 1, 0] } },
            gmv60mCents: { $sum: { $cond: [{ $and: [validOrder, { $gte: ['$createdAt', oneHourAgo] }] }, orderCents, 0] } },
            inProgress: { $sum: { $cond: [{ $in: ['$status', ['Pendente', 'Preparando', 'Saiu para Entrega']] }, 1, 0] } },
          },
        }],
        stores: [
          { $match: { createdAt: { $gte: oneHourAgo }, status: { $ne: 'Cancelado' }, tenantId: { $ne: null } } },
          { $group: { _id: '$tenantId' } },
          { $count: 'count' },
        ],
      },
    },
  ]);

  const summary = result?.summary?.[0] || {};
  return {
    orders5m: Number(summary.orders5m || 0),
    orders15m: Number(summary.orders15m || 0),
    orders60m: Number(summary.orders60m || 0),
    cancelled60m: Number(summary.cancelled60m || 0),
    gmv60mCents: Number(summary.gmv60mCents || 0),
    inProgress: Number(summary.inProgress || 0),
    storesWithOrders60m: Number(result?.stores?.[0]?.count || 0),
  };
}

async function collectMongoNative() {
  if (!mongoose.connection.db || mongoose.connection.readyState !== 1) {
    return unavailableResult<{ latencyMs?: number; connectionState: number }>('A conexão da aplicação com o MongoDB não está pronta.');
  }
  try {
    const { latencyMs } = await measure(() => mongoose.connection.db!.admin().command({ ping: 1 }));
    return configuredResult(statusFromLatency(latencyMs), 'Ping executado pela própria aplicação.', {
      latencyMs,
      connectionState: mongoose.connection.readyState,
    });
  } catch (error) {
    console.warn('[infrastructure] Falha no ping do MongoDB:', error instanceof Error ? error.message : 'erro desconhecido');
    return unavailableResult<{ latencyMs?: number; connectionState: number }>('Não foi possível executar o ping do MongoDB.');
  }
}

async function collectSupabaseNative() {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return unconfiguredResult<{ latencyMs?: number; bucketCount?: number }>('Storage não configurado no servidor.');
  }
  try {
    const { value, latencyMs } = await measure(() => fetchJson<Array<unknown>>(
      `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/bucket`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
    ));
    return configuredResult(statusFromLatency(latencyMs), 'Storage respondeu usando a integração atual.', {
      latencyMs,
      bucketCount: Array.isArray(value) ? value.length : undefined,
    });
  } catch (error) {
    console.warn('[infrastructure] Falha no probe do Supabase Storage:', error instanceof Error ? error.message : 'erro desconhecido');
    return unavailableResult<{ latencyMs?: number; bucketCount?: number }>('Não foi possível consultar o Supabase Storage.');
  }
}

async function collectUpstash() {
  const env = getEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return unconfiguredResult<{ latencyMs?: number }>('Upstash não configurado neste ambiente.');
  }
  try {
    const { value, latencyMs } = await measure(() => fetchJson<{ result?: string }>(
      `${env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '')}/ping`,
      { headers: { authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` } },
    ));
    if (value.result !== 'PONG') throw new Error('UPSTASH_INVALID_PING');
    return configuredResult(statusFromLatency(latencyMs), 'Rate limit distribuído respondendo normalmente.', { latencyMs });
  } catch (error) {
    console.warn('[infrastructure] Falha no ping do Upstash:', error instanceof Error ? error.message : 'erro desconhecido');
    return unavailableResult<{ latencyMs?: number }>('Não foi possível consultar o Upstash.');
  }
}

async function atlasAccessToken(): Promise<string> {
  const env = getEnv();
  if (atlasTokenCache && atlasTokenCache.expiresAt > Date.now() + 60_000) return atlasTokenCache.token;
  const basic = Buffer.from(`${env.MONGODB_ATLAS_CLIENT_ID}:${env.MONGODB_ATLAS_CLIENT_SECRET}`).toString('base64');
  const response = await fetchJson<{ access_token: string; expires_in?: number }>('https://cloud.mongodb.com/api/oauth/token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  }, REQUEST_TIMEOUT_MS, 'ATLAS_OAUTH');
  atlasTokenCache = { token: response.access_token, expiresAt: Date.now() + Number(response.expires_in || 3_600) * 1_000 };
  return response.access_token;
}

function latestMetric(metrics: AtlasMetric[], name: string): number | undefined {
  const points = metrics.find((metric) => metric.name === name)?.dataPoints || [];
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.value;
    if (Number.isFinite(value)) return Number(value);
  }
  return undefined;
}

async function collectAtlas() {
  const env = getEnv();
  if (!env.MONGODB_ATLAS_CLIENT_ID || !env.MONGODB_ATLAS_CLIENT_SECRET || !env.MONGODB_ATLAS_PROJECT_ID) {
    return unconfiguredResult<{
      tier?: string; connections?: number; connectionsLimit?: number; operationsPerSecond?: number;
      operationsLimit?: number; storageBytes?: number; storageLimitBytes?: number;
    }>('Adicione as credenciais de leitura do Atlas para liberar capacidade e limites.');
  }
  try {
    const token = await atlasAccessToken();
    const headers = { accept: 'application/vnd.atlas.2025-03-12+json', authorization: `Bearer ${token}` };
    const base = `https://cloud.mongodb.com/api/atlas/v2/groups/${encodeURIComponent(env.MONGODB_ATLAS_PROJECT_ID)}`;
    const [processResponse, clusterResponse] = await Promise.all([
      fetchJson<{ results?: Array<{ id?: string; hostname?: string; port?: number; typeName?: string }> }>(
        `${base}/processes`, { headers }, REQUEST_TIMEOUT_MS, 'ATLAS_PROCESSES',
      ),
      fetchJson<{ results?: Array<{ name?: string; providerSettings?: { instanceSizeName?: string }; effectiveInstanceSizeName?: string }> }>(
        `${base}/clusters`, { headers }, REQUEST_TIMEOUT_MS, 'ATLAS_CLUSTERS',
      ).catch((error) => {
        console.warn('[infrastructure] Detalhes do cluster Atlas indisponíveis:', error instanceof Error ? error.message : 'erro desconhecido');
        return { results: [] };
      }),
    ]);
    const processes = processResponse.results || [];
    const clusterName = env.MONGODB_ATLAS_CLUSTER_NAME?.toLowerCase();
    const process = processes.find((item) => clusterName && item.hostname?.toLowerCase().includes(clusterName))
      || processes.find((item) => item.typeName?.includes('PRIMARY'))
      || processes[0];
    if (!process?.hostname || process.port === undefined) throw new Error('ATLAS_PROCESS_NOT_FOUND');

    const metricsQuery = new URLSearchParams({ granularity: 'PT1M', period: 'PT5M' });
    ['CONNECTIONS', 'DB_STORAGE_TOTAL', 'OPCOUNTER_CMD', 'OPCOUNTER_QUERY', 'OPCOUNTER_INSERT', 'OPCOUNTER_UPDATE', 'OPCOUNTER_DELETE', 'OPCOUNTER_GETMORE']
      .forEach((metric) => metricsQuery.append('m', metric));
    // Atlas documents this segment as hostname:port. Keeping the colon literal is
    // important because its API router doesn't resolve an encoded %3A as a process ID.
    const processId = atlasProcessPath(process.hostname, process.port);
    const measurements = await fetchJson<{ measurements?: AtlasMetric[] }>(
      `${base}/processes/${processId}/measurements?${metricsQuery}`,
      { headers },
      REQUEST_TIMEOUT_MS,
      'ATLAS_MEASUREMENTS',
    );
    const metrics = measurements.measurements || [];
    const connections = latestMetric(metrics, 'CONNECTIONS');
    const storageBytes = latestMetric(metrics, 'DB_STORAGE_TOTAL');
    const operationsPerSecond = ['OPCOUNTER_CMD', 'OPCOUNTER_QUERY', 'OPCOUNTER_INSERT', 'OPCOUNTER_UPDATE', 'OPCOUNTER_DELETE', 'OPCOUNTER_GETMORE']
      .map((name) => latestMetric(metrics, name) || 0)
      .reduce((total, value) => total + value, 0);
    const cluster = (clusterName ? clusterResponse.results?.find((item) => item.name?.toLowerCase() === clusterName) : undefined) || clusterResponse.results?.[0];
    const tier = cluster?.effectiveInstanceSizeName || cluster?.providerSettings?.instanceSizeName;
    const isFree = tier === 'M0';
    const connectionsLimit = isFree ? 500 : undefined;
    const operationsLimit = isFree ? 100 : undefined;
    const storageLimitBytes = isFree ? 512 * MEGABYTE : undefined;
    const statuses = [
      statusFromPercent(connectionsLimit && connections !== undefined ? connections / connectionsLimit * 100 : undefined),
      statusFromPercent(operationsLimit ? operationsPerSecond / operationsLimit * 100 : undefined),
      statusFromPercent(storageLimitBytes && storageBytes !== undefined ? storageBytes / storageLimitBytes * 100 : undefined),
    ];
    return configuredResult(worstStatus(statuses), 'Métricas globais fornecidas pelo Atlas.', {
      tier,
      connections,
      connectionsLimit,
      operationsPerSecond: Math.round(operationsPerSecond * 10) / 10,
      operationsLimit,
      storageBytes,
      storageLimitBytes,
    });
  } catch (error) {
    console.warn('[infrastructure] Falha na API do Atlas:', error instanceof Error ? error.message : 'erro desconhecido');
    return unavailableResult('Não foi possível consultar as métricas do Atlas. Confira credenciais e acesso de rede.');
  }
}

function supabaseProjectRef(): string | undefined {
  const env = getEnv();
  if (env.SUPABASE_PROJECT_REF) return env.SUPABASE_PROJECT_REF;
  if (!env.SUPABASE_URL) return undefined;
  try { return new URL(env.SUPABASE_URL).hostname.split('.')[0]; } catch { return undefined; }
}

async function collectSupabaseManagement() {
  const env = getEnv();
  const projectRef = supabaseProjectRef();
  if (!env.SUPABASE_MANAGEMENT_TOKEN || !projectRef) {
    return unconfiguredResult<{ totalRequests?: number; storageRequests?: number; authRequests?: number; restRequests?: number; realtimeRequests?: number; storageBytes?: number; storageReferenceLimitBytes?: number }>('Adicione o token de Management para liberar contadores de uso.');
  }
  try {
    const headers = { authorization: `Bearer ${env.SUPABASE_MANAGEMENT_TOKEN}`, 'content-type': 'application/json' };
    const [usageResult, storageResult] = await Promise.allSettled([
      fetchJson<{
        result?: Array<{
          total_auth_requests?: number; total_realtime_requests?: number;
          total_rest_requests?: number; total_storage_requests?: number;
        }>;
      }>(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/analytics/endpoints/usage.api-counts`, { headers }),
      fetchJson<unknown>(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query/read-only`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: "select coalesce(sum((metadata->>'size')::bigint), 0)::bigint as storage_bytes from storage.objects", parameters: [] }),
      }),
    ]);
    if (usageResult.status === 'rejected' && storageResult.status === 'rejected') throw new Error('SUPABASE_MANAGEMENT_UNAVAILABLE');
    const response = usageResult.status === 'fulfilled' ? usageResult.value : undefined;
    const latest = response?.result?.at(-1);
    const authRequests = Number(latest?.total_auth_requests || 0);
    const realtimeRequests = Number(latest?.total_realtime_requests || 0);
    const restRequests = Number(latest?.total_rest_requests || 0);
    const storageRequests = Number(latest?.total_storage_requests || 0);
    const storageBytes = storageResult.status === 'fulfilled' ? findNumericField(storageResult.value, 'storage_bytes') : undefined;
    return configuredResult('healthy', 'Contadores fornecidos pela Management API.', {
      totalRequests: authRequests + realtimeRequests + restRequests + storageRequests,
      storageRequests,
      authRequests,
      restRequests,
      realtimeRequests,
      storageBytes,
      storageReferenceLimitBytes: 1024 * MEGABYTE,
    });
  } catch (error) {
    console.warn('[infrastructure] Falha na Management API do Supabase:', error instanceof Error ? error.message : 'erro desconhecido');
    return unavailableResult('Não foi possível consultar os contadores do Supabase.');
  }
}

function findNumericField(value: unknown, field: string): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNumericField(item, field);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (field in record && Number.isFinite(Number(record[field]))) return Number(record[field]);
  for (const nested of Object.values(record)) {
    const found = findNumericField(nested, field);
    if (found !== undefined) return found;
  }
  return undefined;
}

async function collectVercel() {
  const env = getEnv();
  if (!env.VERCEL_ACCESS_TOKEN || !env.VERCEL_PROJECT_ID) {
    return unconfiguredResult<{ state?: string; url?: string; createdAt?: string; readyAt?: string; commitMessage?: string }>('Adicione o token e o Project ID para liberar o estado do deploy.');
  }
  try {
    const query = new URLSearchParams({ projectId: env.VERCEL_PROJECT_ID, target: 'production', limit: '1' });
    if (env.VERCEL_TEAM_ID) query.set('teamId', env.VERCEL_TEAM_ID);
    const response = await fetchJson<{
      deployments?: Array<{
        uid?: string; url?: string; state?: string; readyState?: string; created?: number; ready?: number;
        meta?: Record<string, string | undefined>;
      }>;
    }>(`https://api.vercel.com/v6/deployments?${query}`, {
      headers: { authorization: `Bearer ${env.VERCEL_ACCESS_TOKEN}` },
    });
    const deployment = response.deployments?.[0];
    if (!deployment) throw new Error('VERCEL_DEPLOYMENT_NOT_FOUND');
    const state = deployment.readyState || deployment.state || 'UNKNOWN';
    const status: MonitorStatus = state === 'READY' ? 'healthy' : ['ERROR', 'CANCELED'].includes(state) ? 'critical' : 'warning';
    return configuredResult(status, 'Último deployment de produção fornecido pela Vercel.', {
      state,
      url: deployment.url,
      createdAt: deployment.created ? new Date(deployment.created).toISOString() : undefined,
      readyAt: deployment.ready ? new Date(deployment.ready).toISOString() : undefined,
      commitMessage: deployment.meta?.githubCommitMessage || deployment.meta?.gitCommitMessage,
    });
  } catch (error) {
    console.warn('[infrastructure] Falha na API da Vercel:', error instanceof Error ? error.message : 'erro desconhecido');
    return unavailableResult('Não foi possível consultar o deployment da Vercel.');
  }
}

function missingConfiguration() {
  const env = getEnv();
  const missing: string[] = [];
  if (!env.MONGODB_ATLAS_CLIENT_ID) missing.push('MONGODB_ATLAS_CLIENT_ID');
  if (!env.MONGODB_ATLAS_CLIENT_SECRET) missing.push('MONGODB_ATLAS_CLIENT_SECRET');
  if (!env.MONGODB_ATLAS_PROJECT_ID) missing.push('MONGODB_ATLAS_PROJECT_ID');
  if (!env.SUPABASE_MANAGEMENT_TOKEN) missing.push('SUPABASE_MANAGEMENT_TOKEN');
  if (!supabaseProjectRef()) missing.push('SUPABASE_PROJECT_REF');
  if (!env.VERCEL_ACCESS_TOKEN) missing.push('VERCEL_ACCESS_TOKEN');
  if (!env.VERCEL_PROJECT_ID) missing.push('VERCEL_PROJECT_ID');
  if (!env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!env.UPSTASH_REDIS_REST_URL) missing.push('UPSTASH_REDIS_REST_URL');
  if (!env.UPSTASH_REDIS_REST_TOKEN) missing.push('UPSTASH_REDIS_REST_TOKEN');
  return missing;
}

export async function collectInfrastructureSnapshot() {
  const startedAt = performance.now();
  const [activity, mongo, supabase, upstash, atlas, supabaseManagement, vercel] = await Promise.all([
    collectActivity(),
    collectMongoNative(),
    collectSupabaseNative(),
    collectUpstash(),
    collectAtlas(),
    collectSupabaseManagement(),
    collectVercel(),
  ]);

  return {
    success: true as const,
    sampledAt: new Date().toISOString(),
    refreshAfterMs: 30_000,
    sampleDurationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    activity,
    services: { mongo, atlas, supabase, supabaseManagement, vercel, upstash },
    configuration: { missing: missingConfiguration() },
  };
}
