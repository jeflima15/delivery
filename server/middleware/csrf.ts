import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { allowedOrigins, getEnv, isProduction } from '../config/env.js';
import { HttpError } from './errors.js';
import { requestSessionType, sessionCookieNames } from '../services/sessionService.js';

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const cookieName = sessionCookieNames(requestSessionType(req)).csrf;
  let cookieToken = req.cookies?.[cookieName];
  let headerToken = req.get('x-csrf-token');

  if (typeof cookieToken === 'string') cookieToken = decodeURIComponent(cookieToken).trim();
  if (typeof headerToken === 'string') headerToken = decodeURIComponent(headerToken).trim();

  // Se o token vier no cabeçalho mas o cookie não estiver presente no req, sincroniza no res
  if (headerToken && (!cookieToken || typeof cookieToken !== 'string')) {
    cookieToken = headerToken;
    res.cookie(cookieName, cookieToken, {
      secure: isProduction(),
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  const tokenValid = typeof cookieToken === 'string' &&
    typeof headerToken === 'string' &&
    cookieToken.length > 0 &&
    cookieToken.length === headerToken.length &&
    crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));

  const origin = req.get('origin');
  const referer = req.get('referer');
  const allowed = allowedOrigins();

  let requestOrigin = origin;
  if (!requestOrigin && referer) {
    try { requestOrigin = new URL(referer).origin; } catch { requestOrigin = undefined; }
  }
  try { if (requestOrigin) requestOrigin = new URL(requestOrigin).origin; } catch { requestOrigin = undefined; }

  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  const hostName = host?.split(':')[0];
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const sameOrigin = host ? `${forwardedProtocol || req.protocol}://${host}` : undefined;

  const originMatchesHost = Boolean(requestOrigin && hostName && requestOrigin.includes(hostName));
  const originValid = !requestOrigin ||
    allowed.has(requestOrigin) ||
    requestOrigin === sameOrigin ||
    originMatchesHost ||
    (allowed.size === 0 && getEnv().NODE_ENV !== 'production');

  if (!tokenValid || !originValid) {
    return next(new HttpError(403, 'Requisicao bloqueada por protecao CSRF.', 'CSRF_FAILED'));
  }
  next();
}
