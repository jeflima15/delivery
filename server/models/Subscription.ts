import mongoose, { Schema } from 'mongoose';

const subscriptionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
  status: { type: String, enum: ['trial', 'active', 'past_due', 'suspended', 'cancelled'], default: 'trial', index: true },
  provider: { type: String, default: 'manual' },
  externalId: String,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  trialEndsAt: Date,
  graceEndsAt: Date,
  cancelledAt: Date,
}, { timestamps: true });

subscriptionSchema.index({ tenantId: 1 }, { unique: true });
subscriptionSchema.index({ provider: 1, externalId: 1 }, { unique: true, sparse: true });
subscriptionSchema.index({ status: 1, planId: 1, currentPeriodEnd: 1 });
subscriptionSchema.index({ status: 1, trialEndsAt: 1 });

export default ((mongoose.models.Subscription) || mongoose.model('Subscription', subscriptionSchema)) as mongoose.Model<Record<string, any>>;
