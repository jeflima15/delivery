import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import User from '../../src/models/User.js';
import AuthSession from '../models/AuthSession.js';
import CustomerAuthFlow from '../models/CustomerAuthFlow.js';
import PasswordResetChallenge from '../models/PasswordResetChallenge.js';
import { resolveTenant } from '../middleware/tenant.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { optionalSession, requireSession } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { normalizePhone } from '../domain/phone.js';
import { clearSessionCookies, issueSession, revokeSession } from '../services/sessionService.js';
import { generateOtp, otpProvider } from '../services/otpService.js';
import { getEnv, isProduction } from '../config/env.js';
import { securityRateLimit } from '../middleware/rateLimit.js';
import { assertCustomerTenant, customerDto } from '../services/customerService.js';

const router = Router({ mergeParams: true });
router.use(resolveTenant);

const strongPassword = z.string().min(10, 'A senha deve ter pelo menos 10 caracteres.').max(128).regex(/[a-z]/, 'Inclua uma letra minuscula.').regex(/[A-Z]/, 'Inclua uma letra maiuscula.').regex(/\d/, 'Inclua um numero.');
const phoneSchema = z.object({ phone: z.string().min(8).max(30) });
const credentialsSchema = phoneSchema.extend({ password: strongPassword, flowId: z.string().regex(/^[a-f\d]{24}$/i).optional() });
const registerSchema = credentialsSchema.extend({ name: z.string().trim().min(2).max(120), confirmPassword: z.string().max(128).optional() });

function parsePhone(phone: string): string {
  try { return normalizePhone(phone); } catch { throw new HttpError(400, 'Telefone invalido.', 'INVALID_PHONE'); }
}

function maskPhone(phone: string) {
  return phone.length > 4 ? `${phone.slice(0, 4)}*****${phone.slice(-2)}` : '***';
}

async function consumeFlow(tenantId: mongoose.Types.ObjectId, flowId: string | undefined, normalizedPhone: string, expected: 'login' | 'register') {
  if (!flowId) return;
  const flow = await CustomerAuthFlow.findOneAndUpdate(
    { _id: flowId, tenantId, normalizedPhone, nextStep: expected, consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!flow) throw new HttpError(400, 'Identificacao expirada. Informe o telefone novamente.', 'AUTH_FLOW_EXPIRED');
}

router.post('/identify', securityRateLimit({ namespace: 'customer-identify', limit: 30, windowMs: 15 * 60_000 }), validateBody(phoneSchema), asyncRoute(async (req, res) => {
  const normalizedPhone = parsePhone(req.body.phone);
  const nextStep = await User.exists({ tenantId: req.tenant!._id, normalizedPhone }) ? 'login' : 'register';
  const flow = await CustomerAuthFlow.create({ tenantId: req.tenant!._id, normalizedPhone, nextStep, expiresAt: new Date(Date.now() + 10 * 60_000) });
  res.json({ success: true, flowId: String(flow._id), nextStep, maskedPhone: maskPhone(normalizedPhone) });
}));

router.post('/register', securityRateLimit({ namespace: 'customer-register', limit: 10, windowMs: 15 * 60_000 }), validateBody(registerSchema), asyncRoute(async (req, res) => {
  if (req.body.confirmPassword && req.body.password !== req.body.confirmPassword) throw new HttpError(400, 'As senhas nao coincidem.', 'PASSWORD_MISMATCH');
  const normalizedPhone = parsePhone(req.body.phone);
  await consumeFlow(req.tenant!._id, req.body.flowId, normalizedPhone, 'register');
  if (await User.exists({ tenantId: req.tenant!._id, normalizedPhone })) throw new HttpError(409, 'Esta conta ja existe. Entre com sua senha.', 'ACCOUNT_EXISTS');
  const user = await User.create({ tenantId: req.tenant!._id, nome: req.body.name, telefone: req.body.phone, normalizedPhone, senha: await bcrypt.hash(req.body.password, 12) });
  await issueSession(req, res, { accountId: user._id as mongoose.Types.ObjectId, accountType: 'customer', tenantId: req.tenant!._id, tokenVersion: 0 });
  res.status(201).json({ success: true, user: customerDto(user.toObject()) });
}));

router.post('/login', securityRateLimit({ namespace: 'customer-login', limit: 20, windowMs: 15 * 60_000 }), validateBody(credentialsSchema), asyncRoute(async (req, res) => {
  let normalizedPhone = '';
  try { normalizedPhone = normalizePhone(req.body.phone); } catch { /* resposta generica */ }
  if (normalizedPhone) await consumeFlow(req.tenant!._id, req.body.flowId, normalizedPhone, 'login');
  const user = normalizedPhone ? await User.findOne({ tenantId: req.tenant!._id, normalizedPhone }).select('+senha') : null;
  const valid = user && await bcrypt.compare(req.body.password, user.senha);
  if (!valid) throw new HttpError(401, 'Telefone ou senha incorretos.', 'INVALID_CREDENTIALS');
  await issueSession(req, res, { accountId: user._id as mongoose.Types.ObjectId, accountType: 'customer', tenantId: req.tenant!._id, tokenVersion: Number(user.tokenVersion || 0) });
  res.json({ success: true, user: customerDto(user.toObject()) });
}));

router.get('/session', optionalSession, asyncRoute(async (req, res) => {
  if (!req.auth) return res.json({ success: true, authenticated: false, user: null });
  if (req.auth.accountType !== 'customer' || req.auth.tenantId?.toString() !== req.tenant!._id.toString()) return res.json({ success: true, authenticated: false, user: null });
  const user = await User.findOne({ _id: req.auth.accountId, tenantId: req.tenant!._id }).lean();
  if (!user) return res.json({ success: true, authenticated: false, user: null });
  res.json({ success: true, authenticated: true, user: customerDto(user) });
}));

router.post('/logout', optionalSession, requireCsrf, asyncRoute(async (req, res) => {
  if (req.auth) await revokeSession(req.auth.sessionId.toString());
  clearSessionCookies(res);
  res.json({ success: true });
}));

const profileSchema = z.object({ nome: z.string().trim().min(2).max(120), email: z.string().email().or(z.literal('')).optional(), nascimento: z.string().max(20).optional(), genero: z.string().max(40).optional() });
router.put('/profile', requireSession, requireCsrf, validateBody(profileSchema), asyncRoute(async (req, res) => {
  assertCustomerTenant(req);
  const user = await User.findOneAndUpdate({ _id: req.auth!.accountId, tenantId: req.tenant!._id }, { $set: req.body }, { returnDocument: 'after', runValidators: true }).lean();
  if (!user) throw new HttpError(404, 'Conta nao encontrada.', 'NOT_FOUND');
  res.json({ success: true, user: customerDto(user) });
}));

const passwordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: strongPassword });
router.put('/password', requireSession, requireCsrf, validateBody(passwordSchema), asyncRoute(async (req, res) => {
  assertCustomerTenant(req);
  const user = await User.findOne({ _id: req.auth!.accountId, tenantId: req.tenant!._id }).select('+senha tokenVersion');
  if (!user || !await bcrypt.compare(req.body.currentPassword, user.senha)) throw new HttpError(400, 'Senha atual incorreta.', 'INVALID_CURRENT_PASSWORD');
  if (await bcrypt.compare(req.body.newPassword, user.senha)) throw new HttpError(400, 'A nova senha deve ser diferente.', 'PASSWORD_REUSED');
  user.senha = await bcrypt.hash(req.body.newPassword, 12);
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  await user.save();
  await AuthSession.updateMany({ accountId: user._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: 'password_changed' } });
  clearSessionCookies(res);
  res.json({ success: true, reauthenticationRequired: true });
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
  clearSessionCookies(res);
  res.json({ success: true });
}));

export default router;
