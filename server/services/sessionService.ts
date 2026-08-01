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

function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: isProduction(), sameSite: 'lax' as const, path: '/', maxAge };
}

export async function issueSession(req: Request, res: Response, identity: SessionIdentity): Promise<void> {
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

  res.cookie(getEnv().SESSION_COOKIE_NAME, access, cookieOptions(ACCESS_TTL_SECONDS * 1000));
  res.cookie(getEnv().REFRESH_COOKIE_NAME, refresh, cookieOptions(REFRESH_TTL_SECONDS * 1000));
  res.cookie(getEnv().CSRF_COOKIE_NAME, csrf, { secure: isProduction(), sameSite: 'lax', path: '/', maxAge: REFRESH_TTL_SECONDS * 1000 });
}

export async function rotateSession(req: Request, res: Response, session: RefreshableSession, refreshSecret: string): Promise<boolean> {
  const matches = await bcrypt.compare(refreshSecret, session.refreshTokenHash);
  if (!matches) {
    await AuthSession.updateMany(
      { accountId: session.accountId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokeReason: 'refresh_token_reuse' } },
    );
    clearSessionCookies(res);
    return false;
  }

  const nextSecret = crypto.randomBytes(48).toString('base64url');
  const nextHash = await bcrypt.hash(nextSecret, 12);
  const updated = await AuthSession.updateOne(
    { _id: session._id, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { refreshTokenHash: nextHash, lastUsedAt: new Date() } },
  );
  if (updated.modifiedCount !== 1) return false;

  const access = jwt.sign(
    { sid: session._id.toString(), sub: session.accountId.toString(), kind: session.accountType, v: session.tokenVersion },
    getEnv().JWT_SECRET,
    { expiresIn: ACCESS_TTL_SECONDS },
  );
  const csrf = crypto.randomBytes(24).toString('base64url');
  res.cookie(getEnv().SESSION_COOKIE_NAME, access, cookieOptions(ACCESS_TTL_SECONDS * 1000));
  res.cookie(getEnv().REFRESH_COOKIE_NAME, `${session._id}.${nextSecret}`, cookieOptions(REFRESH_TTL_SECONDS * 1000));
  res.cookie(getEnv().CSRF_COOKIE_NAME, csrf, { secure: isProduction(), sameSite: 'lax', path: '/', maxAge: REFRESH_TTL_SECONDS * 1000 });
  return true;
}

export async function revokeSession(sessionId: string, reason = 'logout'): Promise<void> {
  if (mongoose.isValidObjectId(sessionId)) await AuthSession.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: reason } });
}

export function clearSessionCookies(res: Response): void {
  const options = { secure: isProduction(), sameSite: 'lax' as const, path: '/' };
  res.clearCookie(getEnv().SESSION_COOKIE_NAME, options);
  res.clearCookie(getEnv().REFRESH_COOKIE_NAME, options);
  res.clearCookie(getEnv().CSRF_COOKIE_NAME, options);
}

export function readAccessToken(req: Request): string | undefined {
  return req.cookies?.[getEnv().SESSION_COOKIE_NAME];
}

export function readRefreshToken(req: Request): { sessionId: string; secret: string } | null {
  const value = req.cookies?.[getEnv().REFRESH_COOKIE_NAME];
  if (typeof value !== 'string') return null;
  const separator = value.indexOf('.');
  if (separator <= 0) return null;
  return { sessionId: value.slice(0, separator), secret: value.slice(separator + 1) };
}
