import mongoose, { Schema } from 'mongoose';

const passwordResetChallengeSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  normalizedPhone: { type: String, required: true },
  codeHash: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
}, { timestamps: true });

passwordResetChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default ((mongoose.models.PasswordResetChallenge) || mongoose.model('PasswordResetChallenge', passwordResetChallengeSchema)) as mongoose.Model<Record<string, any>>;
