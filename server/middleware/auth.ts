import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import AuthSession from '../models/AuthSession.js';
import AdminAccount from '../models/AdminAccount.js';
import TenantMembership from '../models/TenantMembership.js';
import { getEnv } from '../config/env.js';
import { rolePermissions, type Permission, type TenantRole } from '../domain/permissions.js';
import { HttpError } from './errors.js';
import { readAccessToken } from '../services/sessionService.js';

type AccessPayload = jwt.JwtPayload & { sid: string; sub: string; kind: 'admin' | 'customer'; v: number; imp?: string };

async function hydrateSession(req: Request): Promise<boolean> {
  const token = readAccessToken(req);
  if (!token) return false;
  const payload = jwt.verify(token, getEnv().JWT_SECRET) as AccessPayload;
  if (!mongoose.isValidObjectId(payload.sid) || !mongoose.isValidObjectId(payload.sub)) return false;
  const session = await AuthSession.findOne({ _id: payload.sid, accountId: payload.sub, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
  if (!session || session.tokenVersion !== payload.v) return false;
  req.auth = {
    sessionId: session._id as mongoose.Types.ObjectId,
    accountId: session.accountId as mongoose.Types.ObjectId,
    accountType: session.accountType,
    authLevel: session.accountType === 'customer' && session.authLevel !== 'password' ? 'identified' : 'password',
    tenantId: session.tenantId as mongoose.Types.ObjectId | undefined,
    permissions: [],
    mfaVerified: session.mfaVerified,
    impersonatedBy: session.impersonatedBy as mongoose.Types.ObjectId | undefined,
  };
  return true;
}

export async function optionalSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try { await hydrateSession(req); } catch { req.auth = undefined; }
  next();
}

export async function requireSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!await hydrateSession(req)) throw new HttpError(401, 'Sessao necessaria.', 'AUTH_REQUIRED');
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, 'Sessao invalida ou expirada.', 'INVALID_SESSION'));
  }
}

export function requirePasswordAssurance(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.accountType !== 'customer' || req.auth.authLevel !== 'password') {
    return next(new HttpError(403, 'Confirme sua senha para acessar estes dados.', 'PASSWORD_VERIFICATION_REQUIRED'));
  }
  next();
}

export async function requireTenantMembership(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth || req.auth.accountType !== 'admin' || !req.tenant) throw new HttpError(403, 'Acesso negado.', 'FORBIDDEN');
    const [account, membership] = await Promise.all([
      AdminAccount.findById(req.auth.accountId).select('active tokenVersion platformRole').lean(),
      TenantMembership.findOne({ tenantId: req.tenant._id, accountId: req.auth.accountId, active: true }).lean(),
    ]);
    if (!account?.active || account.tokenVersion !== (await AuthSession.findById(req.auth.sessionId).select('tokenVersion').lean())?.tokenVersion) throw new HttpError(401, 'Conta ou sessao revogada.', 'SESSION_REVOKED');
    if (!membership) throw new HttpError(403, 'Voce nao pertence a esta loja.', 'TENANT_MEMBERSHIP_REQUIRED');
    const role = membership.role as TenantRole;
    req.auth.tenantId = req.tenant._id;
    req.auth.tenantRole = role;
    req.auth.permissions = [...rolePermissions[role]];
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth?.permissions.includes(permission)) return next(new HttpError(403, 'Permissao insuficiente.', 'FORBIDDEN'));
    next();
  };
}

export async function requireMaster(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth || req.auth.accountType !== 'admin') throw new HttpError(403, 'Acesso negado.', 'FORBIDDEN');
    const account = await AdminAccount.findById(req.auth.accountId).select('active platformRole tokenVersion').lean();
    if (!account?.active || account.platformRole !== 'platform_super_admin') throw new HttpError(403, 'Acesso exclusivo da plataforma.', 'FORBIDDEN');
    if (!req.auth.mfaVerified) throw new HttpError(403, 'MFA obrigatorio.', 'MFA_REQUIRED');
    req.auth.platformRole = 'platform_super_admin';
    req.auth.permissions = ['platform:read', 'platform:write', 'billing:read', 'audit:read'];
    next();
  } catch (error) {
    next(error);
  }
}
