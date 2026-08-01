import 'dotenv/config';
import crypto from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import AdminAccount from '../../server/models/AdminAccount.js';
import { encryptMfaSecret, generateMfaSecret } from '../../server/security/mfa.js';

const email = process.env.MASTER_BOOTSTRAP_EMAIL?.toLowerCase().trim();
const databaseName = process.env.MASTER_BOOTSTRAP_DB_NAME;
if (!process.env.MONGO_URI || !databaseName || !email || !process.env.MFA_ENCRYPTION_KEY) {
  throw new Error('Defina MONGO_URI, MASTER_BOOTSTRAP_DB_NAME, MASTER_BOOTSTRAP_EMAIL e MFA_ENCRYPTION_KEY apenas para esta execucao.');
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: databaseName });
  const account = await AdminAccount.findOne({ email, platformRole: 'platform_super_admin', active: true });
  if (!account) throw new Error('Administrador Master ativo nao encontrado.');

  const secret = generateMfaSecret();
  const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(6).toString('hex'));
  account.mfa = {
    enabled: true,
    secretEncrypted: encryptMfaSecret(secret),
    recoveryCodeHashes: await Promise.all(recoveryCodes.map((code) => bcrypt.hash(code, 12))),
  };
  await account.save();

  const issuer = encodeURIComponent(process.env.APP_NAME || 'Delivery SaaS');
  const uri = `otpauth://totp/${issuer}:${encodeURIComponent(email)}?secret=${secret}&issuer=${issuer}`;
  const outputPath = path.join(process.env.USERPROFILE || process.cwd(), 'Desktop', 'delivery-master-mfa.txt');
  await writeFile(outputPath, `TOTP: ${uri}\n\nCodigos de recuperacao:\n${recoveryCodes.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(`MFA rotacionado. As novas credenciais foram salvas somente em: ${outputPath}`);
}

main().finally(() => mongoose.disconnect()).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
