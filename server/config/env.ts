import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  MFA_ENCRYPTION_KEY: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default('delivery_session'),
  REFRESH_COOKIE_NAME: z.string().default('delivery_refresh'),
  CSRF_COOKIE_NAME: z.string().default('delivery_csrf'),
  DEFAULT_TENANT_SLUG: z.string().default('loja-piloto'),
  APP_ORIGIN: z.string().url().optional(),
  ALLOWED_ORIGINS: z.string().default(''),
  MASTER_BOOTSTRAP_EMAIL: z.string().email().optional(),
  OTP_PROVIDER: z.enum(['local', 'webhook', 'disabled']).default('disabled'),
  OTP_LOCAL_WEBHOOK_URL: z.string().url().optional(),
  OTP_WEBHOOK_URL: z.string().url().optional(),
  OTP_WEBHOOK_SECRET: z.string().min(20).optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  ADMIN_INVITE_DELIVERY_MODE: z.enum(['webhook', 'manual']).default('webhook'),
  ADMIN_INVITE_WEBHOOK_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(20).optional(),
  MONGODB_ATLAS_CLIENT_ID: z.string().min(1).optional(),
  MONGODB_ATLAS_CLIENT_SECRET: z.string().min(20).optional(),
  MONGODB_ATLAS_PROJECT_ID: z.string().min(1).optional(),
  MONGODB_ATLAS_CLUSTER_NAME: z.string().min(1).optional(),
  SUPABASE_MANAGEMENT_TOKEN: z.string().min(20).optional(),
  SUPABASE_PROJECT_REF: z.string().min(1).optional(),
  VERCEL_ACCESS_TOKEN: z.string().min(20).optional(),
  VERCEL_PROJECT_ID: z.string().min(1).optional(),
  VERCEL_TEAM_ID: z.string().min(1).optional(),
}).superRefine((env, context) => {
  if (env.NODE_ENV === 'production' && !env.APP_ORIGIN) context.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'APP_ORIGIN e obrigatoria em producao.' });
  if (Boolean(env.SUPABASE_URL) !== Boolean(env.SUPABASE_SERVICE_ROLE_KEY)) context.addIssue({ code: 'custom', path: ['SUPABASE_SERVICE_ROLE_KEY'], message: 'Configure URL e service role do Storage em conjunto.' });
  if (env.OTP_PROVIDER === 'webhook' && (!env.OTP_WEBHOOK_URL || !env.OTP_WEBHOOK_SECRET)) context.addIssue({ code: 'custom', path: ['OTP_WEBHOOK_URL'], message: 'O provedor webhook exige URL e segredo.' });
  if (Boolean(env.UPSTASH_REDIS_REST_URL) !== Boolean(env.UPSTASH_REDIS_REST_TOKEN)) context.addIssue({ code: 'custom', path: ['UPSTASH_REDIS_REST_TOKEN'], message: 'Configure URL e token do rate limit em conjunto.' });
  if (env.NODE_ENV === 'production' && (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN)) context.addIssue({ code: 'custom', path: ['UPSTASH_REDIS_REST_URL'], message: 'Rate limit distribuido e obrigatorio em producao.' });
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cachedEnv) cachedEnv = envSchema.parse(process.env);
  return cachedEnv;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function allowedOrigins(): Set<string> {
  const values = [process.env.APP_ORIGIN, ...(process.env.ALLOWED_ORIGINS || '').split(',')]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try { return new URL(value).origin; } catch { return value.replace(/\/$/, ''); }
    });
  return new Set(values);
}
