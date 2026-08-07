import mongoose, { Schema } from 'mongoose';

const authSessionSchema = new Schema({
  accountType: { type: String, enum: ['admin', 'customer'], required: true },
  accountId: { type: Schema.Types.ObjectId, required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  refreshTokenHash: { type: String, required: true, select: false },
  tokenVersion: { type: Number, default: 0 },
  mfaVerified: { type: Boolean, default: false },
  impersonatedBy: { type: Schema.Types.ObjectId, ref: 'AdminAccount', default: null },
  ipHash: String,
  userAgent: { type: String, maxlength: 500 },
  lastUsedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  revokeReason: String,
}, { timestamps: true });

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ accountId: 1, revokedAt: 1 });

export default ((mongoose.models.AuthSession) || mongoose.model('AuthSession', authSessionSchema)) as mongoose.Model<Record<string, any>>;
