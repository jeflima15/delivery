import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import User from '../../src/models/User.js';
import AuthSession from '../models/AuthSession.js';
import CustomerAuthFlow from '../models/CustomerAuthFlow.js';
import PasswordResetChallenge from '../models/PasswordResetChallenge.js';
import CustomerPasswordRecovery from '../models/CustomerPasswordRecovery.js';
import { resolveTenant } from '../middleware/tenant.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { optionalSession, requirePasswordAssurance, requireSession } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { normalizePhone } from '../domain/phone.js';
import { clearSessionCookies, issueSession, revokeSession, sessionCookieNames } from '../services/sessionService.js';
import { generateOtp, otpProvider } from '../services/otpService.js';
import { getEnv, isProduction } from '../config/env.js';
import { securityRateLimit } from '../middleware/rateLimit.js';
import { assertCustomerTenant, customerDto, identifiedCustomerDto } from '../services/customerService.js';

const router = Router({ mergeParams: true });
router.use(resolveTenant);

const strongPassword = z.string().min(10, 'A senha deve ter pelo menos 10 caracteres.').max(128).regex(/[a-z]/, 'Inclua uma letra minuscula.').regex(/[A-Z]/, 'Inclua uma letra maiuscula.').regex(/\d/, 'Inclua um numero.');
const phoneSchema = z.object({ phone: z.string().min(8).max(30) });
const credentialsSchema = phoneSchema.extend({ password: z.string().min(1).max(128), flowId: z.string().regex(/^[a-f\d]{24}$/i).optional() });
const registerSchema = phoneSchema.extend({ password: strongPassword, flowId: z.string().regex(/^[a-f\d]{24}$/i).optional(), name: z.string().trim().min(2).max(120), confirmPassword: z.string().max(128).optional() });

function parsePhone(phone: string): string {
  try { return normalizePhone(phone); } catch { throw new HttpError(400, 'Telefone invalido.', 'INVALID_PHONE'); }
}

function maskPhone(phone: string) {
  return phone.length > 4 ? `${phone.slice(0, 4)}*****${phone.slice(-2)}` : '***';
}

function resetTokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function recoveryReference() {
  return `REC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function normalizeBirthDate(value: string): string | null {
  const match = value.match(/^(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})\/(\d{2})\/(\d{4}))$/);
  if (!match) return null;
  const year = match[1] || match[6];
  const month = match[2] || match[5];
  const day = match[3] || match[4];
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  const valid = date.getFullYear() === Number(year)
    && date.getMonth() + 1 === Number(month)
    && date.getDate() === Number(day)
    && Number(year) >= 1900
    && date <= new Date();
  return valid ? `${year}-${month}-${day}` : null;
}

async function validateFlow(tenantId: mongoose.Types.ObjectId, flowId: string | undefined, normalizedPhone: string, expected: 'login' | 'register') {
  if (!flowId) return;
  const flow = await CustomerAuthFlow.findOne(
    { _id: flowId, tenantId, normalizedPhone, nextStep: expected, consumedAt: null, expiresAt: { $gt: new Date() } },
  ).select('_id').lean();
  if (!flow) throw new HttpError(400, 'Identificacao expirada. Informe o telefone novamente.', 'AUTH_FLOW_EXPIRED');
}

const birthDateSchema = z.string()
  .refine((value) => normalizeBirthDate(value) !== null, 'Informe uma data de nascimento valida.')
  .transform((value) => normalizeBirthDate(value)!);
const registerFastSchema = phoneSchema.extend({
  name: z.string().trim().min(2, 'Informe seu nome completo.').max(120),
  nascimento: birthDateSchema,
});

async function consumeFlow(flowId: string | undefined) {
  if (flowId) await CustomerAuthFlow.updateOne({ _id: flowId, consumedAt: null }, { $set: { consumedAt: new Date() } });
}

router.post('/identify', securityRateLimit({ namespace: 'customer-identify', limit: 30, windowMs: 15 * 60_000 }), validateBody(phoneSchema), asyncRoute(async (req, res) => {
  const normalizedPhone = parsePhone(req.body.phone);
  const user = await User.findOne({ tenantId: req.tenant!._id, normalizedPhone }).select('+senha');
  if (!user) {
    return res.json({ success: true, needsRegistration: true, phone: req.body.phone });
  }
  const csrfToken = await issueSession(req, res, {
    accountId: user._id as mongoose.Types.ObjectId,
    accountType: 'customer',
    tenantId: req.tenant!._id,
    tokenVersion: Number(user.tokenVersion || 0),
    authLevel: 'identified',
  });
  res.json({ success: true, user: identifiedCustomerDto(user.toObject()), csrfToken, authenticated: true, passwordVerified: false });
}));

router.post('/register-fast', securityRateLimit({ namespace: 'customer-register-fast', limit: 10, windowMs: 15 * 60_000 }), validateBody(registerFastSchema), asyncRoute(async (req, res) => {
  const normalizedPhone = parsePhone(req.body.phone);
  if (await User.exists({ tenantId: req.tenant!._id, normalizedPhone })) throw new HttpError(409, 'Esta conta ja existe nesta loja.', 'ACCOUNT_EXISTS');
  let user;
  try {
    user = await User.create({ tenantId: req.tenant!._id, nome: req.body.name, telefone: req.body.phone, normalizedPhone, nascimento: req.body.nascimento });
  } catch (error: any) {
    if (error?.code === 11000) throw new HttpError(409, 'Esta conta ja existe nesta loja.', 'ACCOUNT_EXISTS');
    throw error;
  }
  const csrfToken = await issueSession(req, res, { accountId: user._id as mongoose.Types.ObjectId, accountType: 'customer', tenantId: req.tenant!._id, tokenVersion: 0, authLevel: 'identified' });
  res.status(201).json({ success: true, user: identifiedCustomerDto(user.toObject()), csrfToken, authenticated: true, passwordVerified: false });
}));

router.post('/register', securityRateLimit({ namespace: 'customer-register', limit: 10, windowMs: 15 * 60_000 }), validateBody(registerSchema), asyncRoute(async (req, res) => {
  if (req.body.confirmPassword && req.body.password !== req.body.confirmPassword) throw new HttpError(400, 'As senhas nao coincidem.', 'PASSWORD_MISMATCH');
  const normalizedPhone = parsePhone(req.body.phone);
  await validateFlow(req.tenant!._id, req.body.flowId, normalizedPhone, 'register');
  if (await User.exists({ tenantId: req.tenant!._id, normalizedPhone })) throw new HttpError(409, 'Esta conta ja existe. Entre com sua senha.', 'ACCOUNT_EXISTS');
  let user;
  try {
    user = await User.create({ tenantId: req.tenant!._id, nome: req.body.name, telefone: req.body.phone, normalizedPhone, senha: await bcrypt.hash(req.body.password, 12) });
  } catch (error: any) {
    if (error?.code === 11000) throw new HttpError(409, 'Esta conta ja existe nesta loja. Entre com sua senha.', 'ACCOUNT_EXISTS');
    throw error;
  }
  await consumeFlow(req.body.flowId);
  const csrfToken = await issueSession(req, res, { accountId: user._id as mongoose.Types.ObjectId, accountType: 'customer', tenantId: req.tenant!._id, tokenVersion: 0, authLevel: 'password' });
  res.status(201).json({ success: true, user: customerDto(user.toObject()), csrfToken, passwordVerified: true });
}));

router.post('/login', securityRateLimit({ namespace: 'customer-login', limit: 20, windowMs: 15 * 60_000 }), validateBody(credentialsSchema), asyncRoute(async (req, res) => {
  let normalizedPhone = '';
  try { normalizedPhone = normalizePhone(req.body.phone); } catch { /* resposta generica */ }
  const user = normalizedPhone ? await User.findOne({ tenantId: req.tenant!._id, normalizedPhone }).select('+senha') : null;
  if (!user) throw new HttpError(401, 'Telefone ou senha incorretos.', 'INVALID_CREDENTIALS');

  if (!user.senha) {
    const passwordResult = strongPassword.safeParse(req.body.password);
    if (!passwordResult.success) throw new HttpError(400, passwordResult.error.issues[0]?.message || 'Senha invalida.', 'WEAK_PASSWORD');
    user.senha = await bcrypt.hash(req.body.password, 12);
    await user.save();
  } else {
    const valid = await bcrypt.compare(req.body.password, user.senha);
    if (!valid) throw new HttpError(401, 'Telefone ou senha incorretos.', 'INVALID_CREDENTIALS');
  }

  const csrfToken = await issueSession(req, res, { accountId: user._id as mongoose.Types.ObjectId, accountType: 'customer', tenantId: req.tenant!._id, tokenVersion: Number(user.tokenVersion || 0), authLevel: 'password' });
  res.json({ success: true, user: customerDto(user.toObject()), csrfToken, passwordVerified: true });
}));

router.get('/session', optionalSession, asyncRoute(async (req, res) => {
  if (!req.auth) return res.json({ success: true, authenticated: false, user: null });
  if (req.auth.accountType !== 'customer' || req.auth.tenantId?.toString() !== req.tenant!._id.toString()) return res.json({ success: true, authenticated: false, user: null });
  const user = await User.findOne({ _id: req.auth.accountId, tenantId: req.tenant!._id }).select('+senha').lean();
  if (!user) return res.json({ success: true, authenticated: false, user: null });
  const passwordVerified = req.auth.authLevel === 'password';
  res.json({ success: true, authenticated: true, user: passwordVerified ? customerDto(user) : identifiedCustomerDto(user), passwordVerified, csrfToken: req.cookies?.[sessionCookieNames('customer').csrf] || null });
}));

router.post('/logout', optionalSession, requireCsrf, asyncRoute(async (req, res) => {
  if (req.auth) await revokeSession(req.auth.sessionId.toString());
  clearSessionCookies(res, 'customer');
  res.json({ success: true });
}));

const profileSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  telefone: z.string().min(8).max(30).optional(),
  email: z.string().email().or(z.literal('')).optional(),
  nascimento: birthDateSchema.optional(),
  genero: z.string().max(40).optional(),
});
router.put('/profile', requireSession, requirePasswordAssurance, requireCsrf, validateBody(profileSchema), asyncRoute(async (req, res) => {
  assertCustomerTenant(req);
  const updateData: Record<string, any> = { ...req.body };
  if (req.body.telefone) {
    const normalizedPhone = parsePhone(req.body.telefone);
    const existing = await User.findOne({ tenantId: req.tenant!._id, normalizedPhone, _id: { $ne: req.auth!.accountId } });
    if (existing) throw new HttpError(409, 'Este número de telefone já está sendo usado.', 'PHONE_IN_USE');
    updateData.telefone = req.body.telefone;
    updateData.normalizedPhone = normalizedPhone;
  }
  const user = await User.findOneAndUpdate(
    { _id: req.auth!.accountId, tenantId: req.tenant!._id },
    { $set: updateData },
    { returnDocument: 'after', runValidators: true }
  ).select('+senha').lean();
  if (!user) throw new HttpError(404, 'Conta nao encontrada.', 'NOT_FOUND');
  res.json({ success: true, user: customerDto(user) });
}));

const passwordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: strongPassword });
router.put('/password', requireSession, requirePasswordAssurance, requireCsrf, validateBody(passwordSchema), asyncRoute(async (req, res) => {
  assertCustomerTenant(req);
  const user = await User.findOne({ _id: req.auth!.accountId, tenantId: req.tenant!._id }).select('+senha tokenVersion');
  if (!user || !await bcrypt.compare(req.body.currentPassword, user.senha)) throw new HttpError(400, 'Senha atual incorreta.', 'INVALID_CURRENT_PASSWORD');
  if (await bcrypt.compare(req.body.newPassword, user.senha)) throw new HttpError(400, 'A nova senha deve ser diferente.', 'PASSWORD_REUSED');
  user.senha = await bcrypt.hash(req.body.newPassword, 12);
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  await user.save();
  await AuthSession.updateMany({ accountId: user._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: 'password_changed' } });
  clearSessionCookies(res, 'customer');
  res.json({ success: true, reauthenticationRequired: true });
}));

router.post('/password/manual/request', requireSession, requireCsrf, securityRateLimit({ namespace: 'manual-password-reset-request', limit: 5, windowMs: 60 * 60_000 }), asyncRoute(async (req, res) => {
  const accountId = assertCustomerTenant(req);
  const user = await User.findOne({ _id: accountId, tenantId: req.tenant!._id }).select('+senha normalizedPhone nome telefone').lean();
  if (!user?.senha) throw new HttpError(409, 'Esta conta ainda nao possui senha para recuperar.', 'PASSWORD_NOT_CONFIGURED');

  const now = new Date();
  const recent = await CustomerPasswordRecovery.findOne({ tenantId: req.tenant!._id, accountId, status: 'pending', requestExpiresAt: { $gt: now } }).sort({ createdAt: -1 }).lean();
  if (recent && new Date(recent.createdAt).getTime() > Date.now() - 2 * 60_000) {
    return res.status(202).json({ success: true, request: { id: String(recent._id), reference: recent.reference, expiresAt: recent.requestExpiresAt } });
  }

  await CustomerPasswordRecovery.updateMany(
    { tenantId: req.tenant!._id, accountId, status: 'pending' },
    { $set: { status: 'cancelled', cancelledAt: now }, $unset: { resetTokenHash: 1, resetExpiresAt: 1 } },
  );
  const recovery = await CustomerPasswordRecovery.create({
    tenantId: req.tenant!._id,
    accountId,
    normalizedPhone: user.normalizedPhone,
    reference: recoveryReference(),
    status: 'pending',
    requestExpiresAt: new Date(Date.now() + 24 * 60 * 60_000),
  });
  res.status(202).json({ success: true, request: { id: String(recovery._id), reference: recovery.reference, expiresAt: recovery.requestExpiresAt } });
}));

router.get('/password/manual/:token', securityRateLimit({ namespace: 'manual-password-reset-check', limit: 30, windowMs: 15 * 60_000 }), asyncRoute(async (req, res) => {
  const token = String(req.params.token || '');
  if (token.length < 32 || token.length > 256) throw new HttpError(400, 'Link invalido ou expirado.', 'INVALID_RESET');
  const recovery = await CustomerPasswordRecovery.findOne({ tenantId: req.tenant!._id, resetTokenHash: resetTokenHash(token), status: 'approved', resetExpiresAt: { $gt: new Date() } }).lean();
  if (!recovery) throw new HttpError(400, 'Link invalido ou expirado.', 'INVALID_RESET');
  const user = await User.findOne({ _id: recovery.accountId, tenantId: req.tenant!._id }).select('nome telefone').lean();
  if (!user) throw new HttpError(400, 'Link invalido ou expirado.', 'INVALID_RESET');
  res.json({ success: true, request: { reference: recovery.reference, customerName: String(user.nome || '').split(' ')[0], maskedPhone: maskPhone(String(user.telefone || '')), expiresAt: recovery.resetExpiresAt } });
}));

const manualResetSchema = z.object({ newPassword: strongPassword, confirmPassword: z.string().max(128) });
router.post('/password/manual/:token', securityRateLimit({ namespace: 'manual-password-reset-confirm', limit: 10, windowMs: 15 * 60_000 }), validateBody(manualResetSchema), asyncRoute(async (req, res) => {
  if (req.body.newPassword !== req.body.confirmPassword) throw new HttpError(400, 'As senhas nao coincidem.', 'PASSWORD_MISMATCH');
  const token = String(req.params.token || '');
  if (token.length < 32 || token.length > 256) throw new HttpError(400, 'Link invalido ou expirado.', 'INVALID_RESET');
  const tokenHash = resetTokenHash(token);
  const dbSession = await mongoose.startSession();
  let accountId: mongoose.Types.ObjectId | null = null;
  try {
    await dbSession.withTransaction(async () => {
      const recovery = await CustomerPasswordRecovery.findOne({ tenantId: req.tenant!._id, resetTokenHash: tokenHash, status: 'approved', resetExpiresAt: { $gt: new Date() } }).session(dbSession);
      if (!recovery) throw new HttpError(400, 'Link invalido ou expirado.', 'INVALID_RESET');
      accountId = recovery.accountId as mongoose.Types.ObjectId;
      const user = await User.findOne({ _id: accountId, tenantId: req.tenant!._id }).select('+senha tokenVersion').session(dbSession);
      if (!user) throw new HttpError(400, 'Link invalido ou expirado.', 'INVALID_RESET');
      if (user.senha && await bcrypt.compare(req.body.newPassword, user.senha)) throw new HttpError(400, 'A nova senha deve ser diferente da atual.', 'PASSWORD_REUSED');
      user.senha = await bcrypt.hash(req.body.newPassword, 12);
      user.tokenVersion = Number(user.tokenVersion || 0) + 1;
      await user.save({ session: dbSession });
      recovery.status = 'consumed';
      recovery.consumedAt = new Date();
      recovery.resetTokenHash = undefined;
      await recovery.save({ session: dbSession });
      await CustomerPasswordRecovery.updateMany(
        { _id: { $ne: recovery._id }, tenantId: req.tenant!._id, accountId, status: { $in: ['pending', 'approved'] } },
        { $set: { status: 'cancelled', cancelledAt: new Date() }, $unset: { resetTokenHash: 1, resetExpiresAt: 1 } },
        { session: dbSession },
      );
      await AuthSession.updateMany({ accountId, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: 'manual_password_reset' } }, { session: dbSession });
    });
  } finally {
    await dbSession.endSession();
  }
  clearSessionCookies(res, 'customer');
  res.json({ success: true });
}));

const requestResetSchema = phoneSchema;
router.post('/password/request', securityRateLimit({ namespace: 'password-reset-request', limit: 5, windowMs: 15 * 60_000 }), validateBody(requestResetSchema), asyncRoute(async (req, res) => {
  const env = getEnv();
  if (env.OTP_PROVIDER === 'disabled' || (env.OTP_PROVIDER === 'local' && (isProduction() || !env.OTP_LOCAL_WEBHOOK_URL))) throw new HttpError(503, 'Recuperacao de senha temporariamente indisponivel. Fale com a loja.', 'OTP_UNAVAILABLE');
  let normalizedPhone = '';
  try { normalizedPhone = normalizePhone(req.body.phone); } catch { /* resposta generica */ }
  const user = normalizedPhone ? await User.findOne({ tenantId: req.tenant!._id, normalizedPhone }).select('_id').lean() : null;
  if (user) {
    const code = generateOtp();
    await otpProvider().send(normalizedPhone, code);
    await PasswordResetChallenge.updateMany({ tenantId: req.tenant!._id, accountId: user._id, consumedAt: null }, { $set: { consumedAt: new Date() } });
    await PasswordResetChallenge.create({ tenantId: req.tenant!._id, accountId: user._id, normalizedPhone, codeHash: await bcrypt.hash(code, 12), expiresAt: new Date(Date.now() + 10 * 60_000) });
  }
  res.status(202).json({ success: true, message: 'Se a conta existir, as instrucoes serao enviadas.' });
}));

const confirmResetSchema = phoneSchema.extend({ code: z.string().regex(/^\d{6}$/), newPassword: strongPassword });
router.post('/password/confirm', securityRateLimit({ namespace: 'password-reset-confirm', limit: 10, windowMs: 15 * 60_000 }), validateBody(confirmResetSchema), asyncRoute(async (req, res) => {
  let normalizedPhone: string;
  try { normalizedPhone = normalizePhone(req.body.phone); } catch { throw new HttpError(400, 'Codigo invalido ou expirado.', 'INVALID_RESET'); }
  const challenge = await PasswordResetChallenge.findOne({ tenantId: req.tenant!._id, normalizedPhone, consumedAt: null, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } }).sort({ createdAt: -1 }).select('+codeHash').lean();
  if (!challenge || !await bcrypt.compare(req.body.code, challenge.codeHash)) {
    if (challenge) await PasswordResetChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
    throw new HttpError(400, 'Codigo invalido ou expirado.', 'INVALID_RESET');
  }
  await Promise.all([
    User.updateOne({ _id: challenge.accountId, tenantId: req.tenant!._id }, { $set: { senha: await bcrypt.hash(req.body.newPassword, 12) }, $inc: { tokenVersion: 1 } }),
    PasswordResetChallenge.updateOne({ _id: challenge._id }, { $set: { consumedAt: new Date() } }),
    AuthSession.updateMany({ accountId: challenge.accountId, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: 'password_reset' } }),
  ]);
  clearSessionCookies(res, 'customer');
  res.json({ success: true });
}));

export default router;
