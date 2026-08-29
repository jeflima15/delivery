import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { allowedOrigins, getEnv, isProduction } from '../config/env.js';
import { HttpError } from './errors.js';
import { requestSessionScope, sessionCookieNames } from '../services/sessionService.js';

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const cookieName = sessionCookieNames(requestSessionScope(req)).csrf;
  let cookieToken = req.cookies?.[cookieName];
  let headerToken = req.get('x-csrf-token');

  if (typeof cookieToken === 'string') cookieToken = decodeURIComponent(cookieToken).trim();
  if (typeof headerToken === 'string') headerToken = decodeURIComponent(headerToken).trim();

  const origin = req.get('origin');
  const referer = req.get('referer');
  const allowed = allowedOrigins();

  let requestOrigin = origin;
  if (!requestOrigin && referer) {
    try { requestOrigin = new URL(referer).origin; } catch { requestOrigin = undefined; }
  }
  try { if (requestOrigin) requestOrigin = new URL(requestOrigin).origin; } catch { requestOrigin = undefined; }

  let originHostName: string | undefined;
  let originProtocol: string | undefined;
  if (requestOrigin) {
    try {
      const parsed = new URL(requestOrigin);
      originHostName = parsed.hostname.toLowerCase();
      originProtocol = parsed.protocol.toLowerCase();
    } catch {
      requestOrigin = undefined;
    }
  }

  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  let hostName: string | undefined;
  if (host) {
    hostName = host.split(':')[0].toLowerCase();
  }

  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const expectedProtocol = (forwardedProtocol || req.protocol).toLowerCase().replace(/:$/, '') + ':';

  const sameOrigin = host ? `${forwardedProtocol || req.protocol}://${host}` : undefined;
  let normalizedSameOrigin: string | undefined;
  if (sameOrigin) {
    try { normalizedSameOrigin = new URL(sameOrigin).origin; } catch { normalizedSameOrigin = undefined; }
  }

  const originHostMatches = Boolean(
    originHostName &&
    hostName &&
    originHostName === hostName &&
    originProtocol &&
    originProtocol === expectedProtocol
  );

  const originValid = !requestOrigin ||
    allowed.has(requestOrigin) ||
    (normalizedSameOrigin && requestOrigin === normalizedSameOrigin) ||
    originHostMatches ||
    (allowed.size === 0 && getEnv().NODE_ENV !== 'production');

  // Se a requisição for comprovadamente same-origin e tiver headerToken válido, sincroniza o cookie automaticamente
  if (originValid && typeof headerToken === 'string' && headerToken.length >= 16 && (!cookieToken || cookieToken !== headerToken)) {
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

  if (!tokenValid || !originValid) {
    return next(new HttpError(403, 'Requisicao bloqueada por protecao CSRF.', 'CSRF_FAILED'));
  }
  next();
}

