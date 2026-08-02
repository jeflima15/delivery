import mongoose from 'mongoose';

const CustomerAuthFlowSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  normalizedPhone: { type: String, required: true },
  nextStep: { type: String, enum: ['login', 'register'], required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

CustomerAuthFlowSchema.index({ tenantId: 1, normalizedPhone: 1, createdAt: -1 });

export default (mongoose.models.CustomerAuthFlow || mongoose.model('CustomerAuthFlow', CustomerAuthFlowSchema)) as mongoose.Model<Record<string, any>>;
