import mongoose, { Schema } from 'mongoose';

const resetSchema = new Schema({
  accountId: { type: Schema.Types.ObjectId, ref: 'AdminAccount', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
  tokenHash: { type: String, required: true, unique: true },
  consumedAt: Date,
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

resetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default ((mongoose.models.AdminPasswordReset) || mongoose.model('AdminPasswordReset', resetSchema)) as mongoose.Model<Record<string, any>>;
