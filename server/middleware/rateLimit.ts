import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getEnv, isProduction } from '../config/env.js';
import { HttpError } from './errors.js';

type Options = { namespace: string; limit: number; windowMs: number };
type MemoryEntry = { count: number; expiresAt: number };

const memory = new Map<string, MemoryEntry>();

function keyFor(req: Request, namespace: string, windowMs: number): string {
  const bucket = Math.floor(Date.now() / windowMs);
  const identity = crypto.createHash('sha256').update(`${req.ip || 'unknown'}:${req.get('user-agent') || ''}`).digest('hex').slice(0, 32);
  return `delivery:limit:${namespace}:${identity}:${bucket}`;
}

async function incrementDistributed(key: string, windowSeconds: number): Promise<number> {
  const env = getEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) throw new Error('DISTRIBUTED_RATE_LIMIT_NOT_CONFIGURED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch(`${env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSeconds, 'NX']]),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('DISTRIBUTED_RATE_LIMIT_FAILED');
    const result = await response.json() as Array<{ result?: number; error?: string }>;
    if (result[0]?.error || !Number.isFinite(Number(result[0]?.result))) throw new Error('DISTRIBUTED_RATE_LIMIT_INVALID_RESPONSE');
    return Number(result[0].result);
  } finally {
    clearTimeout(timeout);
  }
}

function incrementMemory(key: string, windowMs: number): number {
  const now = Date.now();
  const current = memory.get(key);
  const next = !current || current.expiresAt <= now ? { count: 1, expiresAt: now + windowMs } : { ...current, count: current.count + 1 };
  memory.set(key, next);
  if (memory.size > 10_000) for (const [entryKey, value] of memory) if (value.expiresAt <= now) memory.delete(entryKey);
  return next.count;
}

export function securityRateLimit(options: Options): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyFor(req, options.namespace, options.windowMs);
    try {
      const env = getEnv();
      const count = env.UPSTASH_REDIS_REST_URL
        ? await incrementDistributed(key, Math.ceil(options.windowMs / 1_000))
        : incrementMemory(key, options.windowMs);
      res.setHeader('RateLimit-Limit', options.limit);
      res.setHeader('RateLimit-Remaining', Math.max(options.limit - count, 0));
      if (count > options.limit) throw new HttpError(429, 'Muitas tentativas. Aguarde e tente novamente.', 'RATE_LIMITED');
      next();
    } catch (error) {
      if (error instanceof HttpError) return next(error);
      if (isProduction()) return next(new HttpError(503, 'Protecao de trafego temporariamente indisponivel.', 'RATE_LIMIT_UNAVAILABLE'));
      next(error);
    }
  };
}
