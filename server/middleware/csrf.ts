import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { allowedOrigins, getEnv } from '../config/env.js';
import { HttpError } from './errors.js';

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = req.cookies?.[getEnv().CSRF_COOKIE_NAME];
  const headerToken = req.get('x-csrf-token');
  const origin = req.get('origin');
  const referer = req.get('referer');
  const allowed = allowedOrigins();
  const tokenValid = typeof cookieToken === 'string' && typeof headerToken === 'string' && cookieToken.length === headerToken.length && crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  let requestOrigin = origin;
  if (!requestOrigin && referer) {
    try { requestOrigin = new URL(referer).origin; } catch { requestOrigin = undefined; }
  }
  const originValid = allowed.size === 0 ? getEnv().NODE_ENV !== 'production' : Boolean(requestOrigin && allowed.has(requestOrigin));
  if (!tokenValid || !originValid) return next(new HttpError(403, 'Requisicao bloqueada por protecao CSRF.', 'CSRF_FAILED'));
  next();
}
