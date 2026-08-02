import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import AuthSession from '../models/AuthSession.js';
import { getEnv, isProduction } from '../config/env.js';

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

type SessionIdentity = {
  accountId: mongoose.Types.ObjectId;
  accountType: 'admin' | 'customer';
  tenantId?: mongoose.Types.ObjectId;
  tokenVersion: number;
  mfaVerified?: boolean;
};

type RefreshableSession = SessionIdentity & {
  _id: mongoose.Types.ObjectId;
  refreshTokenHash: string;
};

export function sessionCookieNames(accountType: 'admin' | 'customer') {
  const env = getEnv();
  const suffix = accountType === 'customer' ? '_customer' : '';
  return {
    access: `${env.SESSION_COOKIE_NAME}${suffix}`,
    refresh: `${env.REFRESH_COOKIE_NAME}${suffix}`,
    csrf: `${env.CSRF_COOKIE_NAME}${suffix}`,
  };
}

export function requestSessionType(req: Request): 'admin' | 'customer' {
  return req.originalUrl.startsWith('/api/customer/') ? 'customer' : 'admin';
}

function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: isProduction(), sameSite: 'lax' as const, path: '/', maxAge };
}

export async function issueSession(req: Request, res: Response, identity: SessionIdentity): Promise<string> {
  const refreshSecret = crypto.randomBytes(48).toString('base64url');
  const refreshTokenHash = await bcrypt.hash(refreshSecret, 12);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
  const session = await AuthSession.create({
    ...identity,
    refreshTokenHash,
    mfaVerified: identity.mfaVerified ?? false,
    expiresAt,
    lastUsedAt: new Date(),
    ipHash: crypto.createHash('sha256').update(req.ip || '').digest('hex'),
    userAgent: req.get('user-agent')?.slice(0, 500),
  });
  const access = jwt.sign({ sid: session._id.toString(), sub: identity.accountId.toString(), kind: identity.accountType, v: identity.tokenVersion }, getEnv().JWT_SECRET, { expiresIn: ACCESS_TTL_SECONDS });
  const refresh = `${session._id}.${refreshSecret}`;
  const csrf = crypto.randomBytes(24).toString('base64url');

  const names = sessionCookieNames(identity.accountType);
  res.cookie(names.access, access, cookieOptions(ACCESS_TTL_SECONDS * 1000));
  res.cookie(names.refresh, refresh, cookieOptions(REFRESH_TTL_SECONDS * 1000));
  res.cookie(names.csrf, csrf, { secure: isProduction(), sameSite: 'lax', path: '/', maxAge: REFRESH_TTL_SECONDS * 1000 });
  return csrf;
}

export async function rotateSession(req: Request, res: Response, session: RefreshableSession, refreshSecret: string): Promise<string | null> {
  const matches = await bcrypt.compare(refreshSecret, session.refreshTokenHash);
  if (!matches) {
    await AuthSession.updateMany(
      { accountId: session.accountId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokeReason: 'refresh_token_reuse' } },
    );
    clearSessionCookies(res, session.accountType);
    return null;
  }

  const nextSecret = crypto.randomBytes(48).toString('base64url');
  const nextHash = await bcrypt.hash(nextSecret, 12);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
  const updated = await AuthSession.updateOne(
    { _id: session._id, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { refreshTokenHash: nextHash, lastUsedAt: new Date(), expiresAt } },
  );
  if (updated.modifiedCount !== 1) return null;

  const access = jwt.sign(
    { sid: session._id.toString(), sub: session.accountId.toString(), kind: session.accountType, v: session.tokenVersion },
    getEnv().JWT_SECRET,
    { expiresIn: ACCESS_TTL_SECONDS },
  );
  const csrf = crypto.randomBytes(24).toString('base64url');
  const names = sessionCookieNames(session.accountType);
  res.cookie(names.access, access, cookieOptions(ACCESS_TTL_SECONDS * 1000));
  res.cookie(names.refresh, `${session._id}.${nextSecret}`, cookieOptions(REFRESH_TTL_SECONDS * 1000));
  res.cookie(names.csrf, csrf, { secure: isProduction(), sameSite: 'lax', path: '/', maxAge: REFRESH_TTL_SECONDS * 1000 });
  return csrf;
}

export async function revokeSession(sessionId: string, reason = 'logout'): Promise<void> {
  if (mongoose.isValidObjectId(sessionId)) await AuthSession.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: reason } });
}

export function clearSessionCookies(res: Response, accountType: 'admin' | 'customer' = 'admin'): void {
  const options = { secure: isProduction(), sameSite: 'lax' as const, path: '/' };
  const names = sessionCookieNames(accountType);
  res.clearCookie(names.access, options);
  res.clearCookie(names.refresh, options);
  res.clearCookie(names.csrf, options);
}

export function readAccessToken(req: Request): string | undefined {
  return req.cookies?.[sessionCookieNames(requestSessionType(req)).access];
}

export function readRefreshToken(req: Request): { sessionId: string; secret: string } | null {
  const value = req.cookies?.[getEnv().REFRESH_COOKIE_NAME];
  if (typeof value !== 'string') return null;
  const separator = value.indexOf('.');
  if (separator <= 0) return null;
  return { sessionId: value.slice(0, separator), secret: value.slice(separator + 1) };
}
