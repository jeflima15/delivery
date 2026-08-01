import { describe, expect, it } from 'vitest';
import { decryptMfaSecret, encryptMfaSecret, generateMfaSecret } from '../../server/security/mfa';

describe('segredo MFA', () => {
  it('e cifrado em repouso', () => {
    const secret = generateMfaSecret();
    const encrypted = encryptMfaSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptMfaSecret(encrypted)).toBe(secret);
  });
});
