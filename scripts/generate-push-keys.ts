import crypto from 'node:crypto';
const key = crypto.createECDH('prime256v1');
key.generateKeys();
console.log(`PUSH_VAPID_PUBLIC_KEY=${key.getPublicKey().toString('base64url')}\nPUSH_VAPID_PRIVATE_KEY=${key.getPrivateKey().toString('base64url')}\nPUSH_WORKER_SECRET=${crypto.randomBytes(32).toString('hex')}`);
