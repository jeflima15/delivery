import crypto from 'node:crypto';
import { getEnv, isProduction } from '../config/env.js';

export interface OtpProvider {
  send(phone: string, code: string): Promise<void>;
}

class DisabledOtpProvider implements OtpProvider {
  async send(): Promise<void> {
    throw new Error('OTP_PROVIDER_NOT_CONFIGURED');
  }
}

class LocalOtpProvider implements OtpProvider {
  async send(phone: string, code: string): Promise<void> {
    if (isProduction()) throw new Error('LOCAL_OTP_FORBIDDEN_IN_PRODUCTION');
    const callback = getEnv().OTP_LOCAL_WEBHOOK_URL;
    if (!callback) throw new Error('OTP_LOCAL_WEBHOOK_NOT_CONFIGURED');
    const response = await fetch(callback, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
    if (!response.ok) throw new Error('OTP_LOCAL_DELIVERY_FAILED');
  }
}

class WebhookOtpProvider implements OtpProvider {
  async send(phone: string, code: string): Promise<void> {
    const { OTP_WEBHOOK_URL, OTP_WEBHOOK_SECRET } = getEnv();
    if (!OTP_WEBHOOK_URL || !OTP_WEBHOOK_SECRET) throw new Error('OTP_WEBHOOK_NOT_CONFIGURED');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(OTP_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${OTP_WEBHOOK_SECRET}`,
        },
        body: JSON.stringify({ phone, code, purpose: 'password_reset' }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('OTP_WEBHOOK_DELIVERY_FAILED');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function otpProvider(): OtpProvider {
  const provider = getEnv().OTP_PROVIDER;
  if (provider === 'local') return new LocalOtpProvider();
  if (provider === 'webhook') return new WebhookOtpProvider();
  return new DisabledOtpProvider();
}

export function generateOtp(): string {
  return crypto.randomInt(100_000, 1_000_000).toString();
}
