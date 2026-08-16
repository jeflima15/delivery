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
import { clearSessionCookies, issueSession, readRefreshToken, requestSessionScope, revokeSession, rotateSession, sessionCookieNames } from '../services/sessionService.js';
import { requireCsrf } from '../middleware/csrf.js';
import { requireSession } from '../middleware/auth.js';
import { decryptMfaSecret, verifyTotp } from '../security/mfa.js';
import { getEnv, isProduction } from '../config/env.js';
import User from '../../src/models/User.js';
import AdminInvitation from '../models/AdminInvitation.js';
import AdminPasswordReset from '../models/AdminPasswordReset.js';
import ImpersonateToken from '../models/ImpersonateToken.js';
import SlugHistory from '../models/SlugHistory.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import { normalizeSlug, assertAvailableSlug, RESERVED_SLUGS } from '../domain/slug.js';
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
  let targetSlug = slug ? slug.toLowerCase() : undefined;

  if (slug) {
    const tenant = await Tenant.findOne({ slug: targetSlug, status: { $in: ['onboarding', 'trial', 'active', 'past_due'] } }).select('_id displayName slug').lean();
    if (!tenant) throw new HttpError(401, 'Credenciais invalidas.', 'INVALID_CREDENTIALS');
    const membership = await TenantMembership.findOne({ tenantId: tenant._id, accountId: account._id, active: true }).select('_id').lean();
    if (!membership) throw new HttpError(401, 'Credenciais invalidas.', 'INVALID_CREDENTIALS');
    tenantId = tenant._id;
  } else if (account.platformRole !== 'platform_super_admin') {
    const memberships = await TenantMembership.find({ accountId: account._id, active: true }).select('tenantId').lean();
    const tenantIds = memberships.map((m) => m.tenantId);
    const tenants = await Tenant.find({ _id: { $in: tenantIds }, status: { $in: ['onboarding', 'trial', 'active', 'past_due'] } }).select('_id displayName slug status').lean();

    if (tenants.length === 0) {
      throw new HttpError(401, 'Nenhuma loja ativa encontrada para esta conta.', 'NO_TENANT_FOUND');
    }

    if (tenants.length === 1) {
      tenantId = tenants[0]._id;
      targetSlug = tenants[0].slug;
    } else {
      return res.json({
        success: true,
        requireTenantSelection: true,
        tenants: tenants.map((t) => ({ id: String(t._id), displayName: t.displayName, slug: t.slug, status: t.status })),
      });
    }
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

  const scope = tenantId ? 'tenant' : 'master';
  const csrfToken = await issueSession(req, res, { accountId: account._id as mongoose.Types.ObjectId, accountType: 'admin', tenantId: tenantId as mongoose.Types.ObjectId | undefined, tokenVersion: account.tokenVersion, mfaVerified }, scope);
  await AdminAccount.updateOne({ _id: account._id }, { $set: { lastLoginAt: new Date() } });
  res.json({ success: true, account: { id: account._id, name: account.name, email: account.email, platformRole: account.platformRole }, slug: targetSlug, csrfToken });
}));

router.get('/check-slug', asyncRoute(async (req, res) => {
  const rawSlug = typeof req.query.slug === 'string' ? req.query.slug : '';
  const slug = normalizeSlug(rawSlug);

  const suggestions = [`${slug}-delivery`, `${slug}-oficial`, `${slug}-loja`];

  if (slug.length < 3 || slug.length > 63) {
    return res.json({
      success: true,
      available: false,
      slug,
      reason: 'Slug deve ter entre 3 e 63 caracteres.',
      suggestions,
    });
  }

  if (RESERVED_SLUGS.has(slug)) {
    return res.json({
      success: true,
      available: false,
      slug,
      reason: 'Slug reservado pela plataforma.',
      suggestions,
    });
  }

  const [existsInTenant, existsInHistory] = await Promise.all([
    Tenant.exists({ slug }),
    SlugHistory.exists({ slug }),
  ]);

  if (existsInTenant || existsInHistory) {
    return res.json({
      success: true,
      available: false,
      slug,
      reason: 'Slug ja utilizado.',
      suggestions,
    });
  }

  return res.json({
    success: true,
    available: true,
    slug,
  });
}));

router.get('/invitations/:token', asyncRoute(async (req, res) => {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(req.params.token)) throw new HttpError(400, 'Convite invalido ou expirado.', 'INVALID_INVITATION');
  const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const invitation = await AdminInvitation.findOne({ tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
  if (!invitation) throw new HttpError(400, 'Convite invalido ou expirado.', 'INVALID_INVITATION');

  const tenant = await Tenant.findById(invitation.tenantId).select('displayName slug').lean();
  const isOwnerInvite = invitation.role === 'tenant_owner';
  res.json({
    success: true,
    invitation: {
      email: invitation.email,
      role: invitation.role,
      isOwnerInvite,
      store: tenant ? { name: tenant.displayName, slug: tenant.slug } : null,
    },
  });
}));

const invitationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  password: strongPassword,
  storeName: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().min(3).max(63).optional(),
  phone: z.string().trim().max(30).optional(),
});

router.post('/invitations/:token/accept', validateBody(invitationSchema), asyncRoute(async (req, res) => {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(req.params.token)) throw new HttpError(400, 'Convite invalido ou expirado.', 'INVALID_INVITATION');
  const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const invitation = await AdminInvitation.findOne({ tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }).select('+tokenHash');
  if (!invitation) throw new HttpError(400, 'Convite invalido ou expirado.', 'INVALID_INVITATION');

  const isOwnerInvite = invitation.role === 'tenant_owner';
  let targetSlug: string | undefined;
  if (isOwnerInvite && req.body.slug) {
    targetSlug = assertAvailableSlug(req.body.slug);
    const [tenantConflict, historyConflict] = await Promise.all([
      Tenant.exists({ slug: targetSlug, _id: { $ne: invitation.tenantId } }),
      SlugHistory.exists({ slug: targetSlug, tenantId: { $ne: invitation.tenantId } }),
    ]);
    if (tenantConflict || historyConflict) {
      throw new HttpError(409, 'Slug ja utilizado.', 'SLUG_CONFLICT');
    }
  }

  const session = await mongoose.startSession();
  let account;
  let finalStore: { name: string; slug: string } | null = null;
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

      const currentTenant = await Tenant.findById(invitation.tenantId).session(session);
      if (!currentTenant) throw new HttpError(404, 'Loja nao encontrada.', 'NOT_FOUND');

      if (isOwnerInvite) {
        const tenantUpdate: Record<string, any> = {
          'owner.name': req.body.name,
        };
        if (req.body.storeName) {
          tenantUpdate.displayName = req.body.storeName;
          tenantUpdate.legalName = req.body.storeName;
        }
        if (targetSlug) {
          if (currentTenant.slug !== targetSlug) {
            await SlugHistory.updateOne(
              { slug: currentTenant.slug },
              { $setOnInsert: { tenantId: currentTenant._id, slug: currentTenant.slug } },
              { upsert: true, session },
            );
          }
          tenantUpdate.slug = targetSlug;
        }
        if (req.body.phone !== undefined) {
          tenantUpdate['owner.phone'] = req.body.phone;
        }

        const updatedTenant = await Tenant.findByIdAndUpdate(
          invitation.tenantId,
          { $set: tenantUpdate },
          { returnDocument: 'after', session },
        ).lean();

        const storeName = req.body.storeName || currentTenant.displayName;
        const storeSettingsUpdate: Record<string, any> = {
          nome_loja: storeName,
        };
        if (req.body.phone !== undefined) {
          storeSettingsUpdate.telefone = req.body.phone;
        }

        await StoreSettings.updateOne(
          { tenantId: invitation.tenantId },
          { $set: storeSettingsUpdate },
          { upsert: true, session, setDefaultsOnInsert: true },
        );

        finalStore = updatedTenant
          ? { name: updatedTenant.displayName, slug: updatedTenant.slug }
          : { name: currentTenant.displayName, slug: currentTenant.slug };
      } else {
        finalStore = { name: currentTenant.displayName, slug: currentTenant.slug };
      }
    });
  } finally {
    await session.endSession();
  }

  if (!finalStore) {
    const tenant = await Tenant.findById(invitation.tenantId).select('displayName slug').lean();
    finalStore = tenant ? { name: tenant.displayName, slug: tenant.slug } : null;
  }

  res.status(201).json({
    success: true,
    store: finalStore,
  });
}));

const resetPasswordSchema = z.object({ password: strongPassword });

router.get('/admin/reset-password/:token', asyncRoute(async (req, res) => {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(req.params.token)) throw new HttpError(400, 'Link invalido ou expirado.', 'INVALID_RESET_LINK');
  const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const reset = await AdminPasswordReset.findOne({ tokenHash, consumedAt: null, expiresAt: { $gt: new Date() } })
    .populate('accountId', 'name email')
    .populate('tenantId', 'displayName slug');
  if (!reset) throw new HttpError(400, 'Link invalido ou expirado.', 'INVALID_RESET_LINK');

  const account = reset.accountId as unknown as { name?: string; email?: string } | null;
  const tenant = reset.tenantId as unknown as { displayName?: string; slug?: string } | null;

  res.json({
    success: true,
    info: {
      accountName: account?.name || 'Administrador',
      accountEmail: account?.email || '',
      tenantName: tenant?.displayName || 'Sua Loja',
      tenantSlug: tenant?.slug || '',
    },
  });
}));

router.post('/admin/reset-password/:token', validateBody(resetPasswordSchema), asyncRoute(async (req, res) => {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(req.params.token)) throw new HttpError(400, 'Link invalido ou expirado.', 'INVALID_RESET_LINK');
  const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const reset = await AdminPasswordReset.findOne({ tokenHash, consumedAt: null, expiresAt: { $gt: new Date() } });
  if (!reset) throw new HttpError(400, 'Link invalido ou expirado.', 'INVALID_RESET_LINK');

  const account = await AdminAccount.findById(reset.accountId);
  if (!account || !account.active) throw new HttpError(409, 'Conta administrativa desativada ou nao encontrada.', 'ACCOUNT_DISABLED');

  const nextVersion = Number(account.tokenVersion || 0) + 1;
  const passwordHash = await bcrypt.hash(req.body.password, 12);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await AdminAccount.updateOne({ _id: account._id }, { $set: { passwordHash, tokenVersion: nextVersion } }, { session });
      await AuthSession.updateMany({ accountId: account._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: 'password_reset' } }, { session });
      await AdminPasswordReset.updateOne({ _id: reset._id }, { $set: { consumedAt: new Date() } }, { session });
    });
  } finally {
    await session.endSession();
  }

  res.json({ success: true });
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
  clearSessionCookies(res, requestSessionScope(req));
  res.json({ success: true, reauthenticationRequired: true });
}));

router.get('/session', requireSession, asyncRoute(async (req, res) => {
  res.json({ success: true, session: { accountType: req.auth?.accountType, tenantId: req.auth?.tenantId, mfaVerified: req.auth?.mfaVerified } });
}));

router.get('/csrf', (req, res) => {
  const cookieName = sessionCookieNames(requestSessionScope(req)).csrf;
  let csrfToken = req.cookies?.[cookieName];
  if (!csrfToken || typeof csrfToken !== 'string') {
    csrfToken = crypto.randomBytes(24).toString('base64url');
    res.cookie(cookieName, csrfToken, {
      secure: isProduction(),
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
  res.json({ success: true, csrfToken });
});

router.post('/refresh', requireCsrf, asyncRoute(async (req, res) => {
  const scope = requestSessionScope(req);
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
    clearSessionCookies(res, scope);
    throw new HttpError(401, 'Sessao expirada.', 'SESSION_EXPIRED');
  }

  const csrfToken = await rotateSession(req, res, session as any, refresh.secret, scope);
  if (!csrfToken) throw new HttpError(401, 'Sessao invalida.', 'REFRESH_REUSE_DETECTED');
  res.json({ success: true, csrfToken });
}));

router.post('/logout', requireSession, requireCsrf, asyncRoute(async (req, res) => {
  if (req.auth) await revokeSession(req.auth.sessionId.toString());
  clearSessionCookies(res, requestSessionScope(req));
  res.json({ success: true });
}));

router.post('/logout-all', requireSession, requireCsrf, asyncRoute(async (req, res) => {
  await AuthSession.updateMany({ accountId: req.auth?.accountId, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: 'logout_all' } });
  clearSessionCookies(res, requestSessionScope(req));
  res.json({ success: true });
}));

router.get('/impersonate/consume', asyncRoute(async (req, res) => {
  const token = req.query.token as string;
  if (!token || typeof token !== 'string') throw new HttpError(400, 'Token invalido.', 'INVALID_TOKEN');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = await ImpersonateToken.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { returnDocument: 'before' },
  ).lean();

  if (!record) throw new HttpError(401, 'Link de acesso expirado ou ja utilizado.', 'TOKEN_EXPIRED');

  const tenant = await Tenant.findById(record.tenantId).select('slug').lean();
  if (!tenant) throw new HttpError(404, 'Loja nao encontrada.', 'NOT_FOUND');

  const account = await AdminAccount.findById(record.accountId).select('tokenVersion').lean();
  if (!account) throw new HttpError(404, 'Conta nao encontrada.', 'NOT_FOUND');

  await issueSession(req, res, {
    accountId: record.accountId as mongoose.Types.ObjectId,
    accountType: 'admin',
    tenantId: record.tenantId as mongoose.Types.ObjectId,
    tokenVersion: account.tokenVersion || 0,
    mfaVerified: true,
    impersonatedBy: record.masterAccountId as mongoose.Types.ObjectId,
  }, 'tenant');

  res.redirect(`/${tenant.slug}/admin`);
}));

export default router;
