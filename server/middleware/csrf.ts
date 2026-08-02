import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { allowedOrigins, getEnv } from '../config/env.js';
import { HttpError } from './errors.js';
import { requestSessionType, sessionCookieNames } from '../services/sessionService.js';

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = req.cookies?.[sessionCookieNames(requestSessionType(req)).csrf];
  const headerToken = req.get('x-csrf-token');
  const origin = req.get('origin');
  const referer = req.get('referer');
  const allowed = allowedOrigins();
  const tokenValid = typeof cookieToken === 'string' && typeof headerToken === 'string' && cookieToken.length === headerToken.length && crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  let requestOrigin = origin;
  if (!requestOrigin && referer) {
    try { requestOrigin = new URL(referer).origin; } catch { requestOrigin = undefined; }
  }
  try { if (requestOrigin) requestOrigin = new URL(requestOrigin).origin; } catch { requestOrigin = undefined; }
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const sameOrigin = host ? `${forwardedProtocol || req.protocol}://${host}` : undefined;
  const originValid = Boolean(
    requestOrigin && (allowed.has(requestOrigin) || requestOrigin === sameOrigin)
  ) || (allowed.size === 0 && getEnv().NODE_ENV !== 'production');
  if (!tokenValid || !originValid) return next(new HttpError(403, 'Requisicao bloqueada por protecao CSRF.', 'CSRF_FAILED'));
  next();
}
