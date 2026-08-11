import mongoose, { Schema } from 'mongoose';

const customerPasswordRecoverySchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  normalizedPhone: { type: String, required: true },
  reference: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'consumed', 'cancelled'], default: 'pending', index: true },
  requestExpiresAt: { type: Date, required: true },
  resetTokenHash: { type: String, select: false },
  resetExpiresAt: Date,
  approvedBy: { type: Schema.Types.ObjectId, ref: 'AdminAccount' },
  approvedAt: Date,
  consumedAt: Date,
  cancelledAt: Date,
}, { timestamps: true });

customerPasswordRecoverySchema.index({ tenantId: 1, reference: 1 }, { unique: true });
customerPasswordRecoverySchema.index({ tenantId: 1, status: 1, createdAt: -1 });
customerPasswordRecoverySchema.index({ accountId: 1, createdAt: -1 });

export default ((mongoose.models.CustomerPasswordRecovery)
  || mongoose.model('CustomerPasswordRecovery', customerPasswordRecoverySchema)) as mongoose.Model<Record<string, any>>;
