import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import AdminAccount from '../models/AdminAccount.js';
import TenantMembership from '../models/TenantMembership.js';
import Tenant from '../models/Tenant.js';
import AuthSession from '../models/AuthSession.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { clearSessionCookies, issueSession, readRefreshToken, revokeSession, rotateSession } from '../services/sessionService.js';
import { requireCsrf } from '../middleware/csrf.js';
import { requireSession } from '../middleware/auth.js';
import { decryptMfaSecret, verifyTotp } from '../security/mfa.js';
import { getEnv } from '../config/env.js';
import User from '../../src/models/User.js';
import AdminInvitation from '../models/AdminInvitation.js';
import { securityRateLimit } from '../middleware/rateLimit.js';

const router = Router();
const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  slug: z.string().min(3).max(63).optional(),
  mfaCode: z.string().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().regex(/^[a-f0-9]{12}$/i).optional(),
});

const strongPassword = z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/);

router.post('/admin/login', securityRateLimit({ namespace: 'admin-login', limit: 10, windowMs: 15 * 60_000 }), validateBody(loginSchema), asyncRoute(async (req, res) => {
  const { email, password, slug, mfaCode, recoveryCode } = req.body;
  const account = await AdminAccount.findOne({ email })
    .select('+passwordHash +mfa.secretEncrypted +mfa.recoveryCodeHashes active tokenVersion platformRole mfa.enabled')
    .lean();
  const valid = account?.active && await bcrypt.compare(password, account.passwordHash);
  if (!valid) throw new HttpError(401, 'Credenciais invalidas.', 'INVALID_CREDENTIALS');

  let tenantId;
  if (slug) {
    const tenant = await Tenant.findOne({ slug: slug.toLowerCase(), status: { $in: ['trial', 'active', 'past_due'] } }).select('_id').lean();
    if (!tenant) throw new HttpError(401, 'Credenciais invalidas.', 'INVALID_CREDENTIALS');
    const membership = await TenantMembership.findOne({ tenantId: tenant._id, accountId: account._id, active: true }).select('_id').lean();
    if (!membership) throw new HttpError(401, 'Credenciais invalidas.', 'INVALID_CREDENTIALS');
    tenantId = tenant._id;
  } else if (account.platformRole !== 'platform_super_admin') {
    throw new HttpError(400, 'Informe a loja para entrar.', 'TENANT_REQUIRED');
  }

  let mfaVerified = false;
  if (account.platformRole === 'platform_super_admin') {
    if (!account.mfa?.enabled || !account.mfa.secretEncrypted) throw new HttpError(403, 'MFA precisa ser configurado para o Admin Master.', 'MFA_SETUP_REQUIRED');
    const validTotp = Boolean(mfaCode && verifyTotp(decryptMfaSecret(account.mfa.secretEncrypted), mfaCode));
    let consumedRecoveryHash: string | undefined;
    if (!validTotp && recoveryCode) {
      for (const hash of account.mfa.recoveryCodeHashes || []) {
        if (await bcrypt.compare(recoveryCode.toLowerCase(), hash)) {
          consumedRecoveryHash = hash;
          break;
        }
      }
    }
    if (!validTotp && !consumedRecoveryHash) throw new HttpError(401, 'Codigo MFA invalido.', 'INVALID_MFA');
    if (consumedRecoveryHash) {
      const consumed = await AdminAccount.updateOne(
        { _id: account._id, 'mfa.recoveryCodeHashes': consumedRecoveryHash },
        { $pull: { 'mfa.recoveryCodeHashes': consumedRecoveryHash } },
      );
      if (consumed.modifiedCount !== 1) throw new HttpError(401, 'Codigo MFA invalido.', 'INVALID_MFA');
    }
    mfaVerified = true;
  }

  const csrfToken = await issueSession(req, res, { accountId: account._id as mongoose.Types.ObjectId, accountType: 'admin', tenantId: tenantId as mongoose.Types.ObjectId | undefined, tokenVersion: account.tokenVersion, mfaVerified });
  await AdminAccount.updateOne({ _id: account._id }, { $set: { lastLoginAt: new Date() } });
  res.json({ success: true, account: { id: account._id, name: account.name, email: account.email, platformRole: account.platformRole }, csrfToken });
}));

const invitationSchema = z.object({ name: z.string().trim().min(2).max(120), password: strongPassword });
router.post('/invitations/:token/accept', validateBody(invitationSchema), asyncRoute(async (req, res) => {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(req.params.token)) throw new HttpError(400, 'Convite invalido ou expirado.', 'INVALID_INVITATION');
  const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const invitation = await AdminInvitation.findOne({ tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }).select('+tokenHash');
  if (!invitation) throw new HttpError(400, 'Convite invalido ou expirado.', 'INVALID_INVITATION');

  const session = await mongoose.startSession();
  let account;
  try {
    await session.withTransaction(async () => {
      account = await AdminAccount.findOne({ email: invitation.email }).session(session);
      if (!account) {
        const [created] = await AdminAccount.create([{ name: req.body.name, email: invitation.email, passwordHash: await bcrypt.hash(req.body.password, 12) }], { session });
        account = created;
      } else if (!account.active) {
        throw new HttpError(409, 'Conta administrativa desativada.', 'ACCOUNT_DISABLED');
      }
      await TenantMembership.updateOne(
        { tenantId: invitation.tenantId, accountId: account._id },
        { $set: { role: invitation.role, active: true, acceptedAt: new Date(), revokedAt: null } },
        { upsert: true, session, setDefaultsOnInsert: true },
      );
      await AdminInvitation.updateOne({ _id: invitation._id, acceptedAt: null }, { $set: { acceptedAt: new Date() } }, { session });
    });
  } finally {
    await session.endSession();
  }
  res.status(201).json({ success: true });
}));

const changePasswordSchema = z.object({ email: z.string().email(), currentPassword: z.string().min(1).max(128), newPassword: strongPassword, confirmPassword: z.string() });
router.put('/admin/me/password', requireSession, requireCsrf, validateBody(changePasswordSchema), asyncRoute(async (req, res) => {
  if (req.auth?.accountType !== 'admin') throw new HttpError(403, 'Acesso negado.', 'FORBIDDEN');
  if (req.body.newPassword !== req.body.confirmPassword) throw new HttpError(400, 'A confirmacao da nova senha nao confere.', 'PASSWORD_CONFIRMATION');
  const account = await AdminAccount.findById(req.auth.accountId).select('+passwordHash email tokenVersion active').lean();
  if (!account?.active || account.email.toLowerCase() !== req.body.email.toLowerCase()) throw new HttpError(403, 'Os dados informados nao conferem.', 'IDENTITY_MISMATCH');
  if (!await bcrypt.compare(req.body.currentPassword, account.passwordHash)) throw new HttpError(400, 'Senha atual incorreta.', 'INVALID_CURRENT_PASSWORD');
  if (await bcrypt.compare(req.body.newPassword, account.passwordHash)) throw new HttpError(400, 'A nova senha deve ser diferente.', 'PASSWORD_REUSED');
  const nextVersion = Number(account.tokenVersion || 0) + 1;
  await Promise.all([
    AdminAccount.updateOne({ _id: account._id }, { $set: { passwordHash: await bcrypt.hash(req.body.newPassword, 12), tokenVersion: nextVersion } }),
    AuthSession.updateMany({ accountId: account._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: 'password_changed' } }),
  ]);
  clearSessionCookies(res);
  res.json({ success: true, reauthenticationRequired: true });
}));

router.get('/session', requireSession, asyncRoute(async (req, res) => {
  res.json({ success: true, session: { accountType: req.auth?.accountType, tenantId: req.auth?.tenantId, mfaVerified: req.auth?.mfaVerified } });
}));

router.get('/csrf', (req, res) => {
  res.json({ success: true, csrfToken: req.cookies?.[getEnv().CSRF_COOKIE_NAME] || null });
});

router.post('/refresh', requireCsrf, asyncRoute(async (req, res) => {
  const refresh = readRefreshToken(req);
  if (!refresh || !mongoose.isValidObjectId(refresh.sessionId)) throw new HttpError(401, 'Sessao invalida.', 'INVALID_SESSION');

  const session = await AuthSession.findOne({
    _id: refresh.sessionId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).select('+refreshTokenHash').lean();
  if (!session) throw new HttpError(401, 'Sessao expirada.', 'SESSION_EXPIRED');

  const account = session.accountType === 'admin'
    ? await AdminAccount.findOne({ _id: session.accountId, active: true }).select('tokenVersion').lean()
    : await User.findOne({ _id: session.accountId, tenantId: session.tenantId }).select('_id tokenVersion').lean();
  const versionIsValid = account?.tokenVersion === session.tokenVersion;
  if (!account || !versionIsValid) {
    await revokeSession(refresh.sessionId, 'token_version_changed');
    clearSessionCookies(res);
    throw new HttpError(401, 'Sessao expirada.', 'SESSION_EXPIRED');
  }

  const csrfToken = await rotateSession(req, res, session as any, refresh.secret);
  if (!csrfToken) throw new HttpError(401, 'Sessao invalida.', 'REFRESH_REUSE_DETECTED');
  res.json({ success: true, csrfToken });
}));

router.post('/logout', requireSession, requireCsrf, asyncRoute(async (req, res) => {
  if (req.auth) await revokeSession(req.auth.sessionId.toString());
  clearSessionCookies(res);
  res.json({ success: true });
}));

router.post('/logout-all', requireSession, requireCsrf, asyncRoute(async (req, res) => {
  await AuthSession.updateMany({ accountId: req.auth?.accountId, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: 'logout_all' } });
  clearSessionCookies(res);
  res.json({ success: true });
}));

export default router;
