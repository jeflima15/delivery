import { expect, it } from 'vitest';
import crypto from 'node:crypto';
import { isPushEndpoint, pushSubscriptionSchema } from '../../server/services/pushService';

it('accepts only HTTPS endpoints of supported push vendors', () => {
  for (const url of ['https://fcm.googleapis.com/fcm/send/a', 'https://web.push.apple.com/a', 'https://updates.push.services.mozilla.com/wpush/v2/a', 'https://wns2-db5p.notify.windows.com/w/']) expect(isPushEndpoint(url)).toBe(true);
  for (const url of ['http://fcm.googleapis.com/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://fcm.googleapis.com.evil.test/a', 'https://evil.test@fcm.googleapis.com/a', 'https://fcm.googleapis.com:444/a', 'file:///a']) expect(isPushEndpoint(url)).toBe(false);
});
it('validates actual encryption keys, not only arbitrary strings', () => {
  const key = crypto.createECDH('prime256v1'); key.generateKeys();
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys: { auth: crypto.randomBytes(16).toString('base64url'), p256dh: key.getPublicKey().toString('base64url') } };
  expect(pushSubscriptionSchema.safeParse(subscription).success).toBe(true);
  expect(pushSubscriptionSchema.safeParse({ ...subscription, keys: { ...subscription.keys, p256dh: Buffer.alloc(65).toString('base64url') } }).success).toBe(false);
});
