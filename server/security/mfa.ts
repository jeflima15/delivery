import crypto from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(value: string): Buffer {
  const clean = value.toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function generateMfaSecret(): string {
  const bytes = crypto.randomBytes(20);
  let bits = [...bytes].map((byte) => byte.toString(2).padStart(8, '0')).join('');
  let result = '';
  while (bits.length >= 5) {
    result += alphabet[Number.parseInt(bits.slice(0, 5), 2)];
    bits = bits.slice(5);
  }
  return result;
}

function totp(secret: string, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, '0');
}

export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const current = Math.floor(now / 30_000);
  return [-1, 0, 1].some((window) => crypto.timingSafeEqual(Buffer.from(totp(secret, current + window)), Buffer.from(code)));
}

function encryptionKey(): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (!configured) throw new Error('MFA_ENCRYPTION_KEY nao configurada.');
  return crypto.createHash('sha256').update(configured).digest();
}

export function encryptMfaSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptMfaSecret(value: string): string {
  const [ivValue, tagValue, dataValue] = value.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataValue, 'base64url')), decipher.final()]).toString('utf8');
}
