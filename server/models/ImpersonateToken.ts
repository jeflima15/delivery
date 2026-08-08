import mongoose, { Schema } from 'mongoose';

const impersonateTokenSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'AdminAccount', required: true },
  masterAccountId: { type: Schema.Types.ObjectId, ref: 'AdminAccount', required: true },
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

export default (mongoose.models.ImpersonateToken || mongoose.model('ImpersonateToken', impersonateTokenSchema)) as mongoose.Model<Record<string, unknown>>;
