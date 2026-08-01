import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import AdminAccount from '../../server/models/AdminAccount.js';
import { encryptMfaSecret, generateMfaSecret } from '../../server/security/mfa.js';

const email = process.env.MASTER_BOOTSTRAP_EMAIL?.toLowerCase().trim();
const password = process.env.MASTER_BOOTSTRAP_PASSWORD;
const name = process.env.MASTER_BOOTSTRAP_NAME || 'Admin Master';
const databaseName = process.env.MASTER_BOOTSTRAP_DB_NAME;
if (!process.env.MONGO_URI || !databaseName || !email || !password) throw new Error('Defina MONGO_URI, MASTER_BOOTSTRAP_DB_NAME, MASTER_BOOTSTRAP_EMAIL e MASTER_BOOTSTRAP_PASSWORD apenas para esta execucao.');
if (password.length < 12) throw new Error('MASTER_BOOTSTRAP_PASSWORD deve ter no minimo 12 caracteres.');

async function main() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: databaseName });
  if (await AdminAccount.exists({ email })) throw new Error('Conta ja existe; o bootstrap e idempotente e nao altera credenciais existentes.');
  const secret = generateMfaSecret();
  const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(6).toString('hex'));
  await AdminAccount.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password!, 12),
    platformRole: 'platform_super_admin',
    active: true,
    mfa: { enabled: true, secretEncrypted: encryptMfaSecret(secret), recoveryCodeHashes: await Promise.all(recoveryCodes.map((code) => bcrypt.hash(code, 12))) },
  });
  const issuer = encodeURIComponent(process.env.APP_NAME || 'Delivery SaaS');
  console.log('\nBootstrap concluido. Guarde agora e remova as variaveis de bootstrap:');
  console.log(`TOTP: otpauth://totp/${issuer}:${encodeURIComponent(email!)}?secret=${secret}&issuer=${issuer}`);
  console.log(`Codigos de recuperacao: ${recoveryCodes.join(' ')}`);
}

main().finally(() => mongoose.disconnect()).catch((error) => { console.error(error.message); process.exitCode = 1; });
