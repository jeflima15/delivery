import crypto from 'node:crypto';
import type mongoose from 'mongoose';
import AdminInvitation from '../models/AdminInvitation.js';

export async function createInvitation(input: {
  tenantId: mongoose.Types.ObjectId;
  email: string;
  role: string;
  invitedBy: mongoose.Types.ObjectId;
}) {
  const token = crypto.randomBytes(32).toString('base64url');
  await AdminInvitation.updateMany(
    { tenantId: input.tenantId, email: input.email, acceptedAt: null, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  const invitation = await AdminInvitation.create({
    ...input,
    email: input.email.toLowerCase(),
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 48 * 60 * 60_000),
  });
  return { invitation, token };
}
