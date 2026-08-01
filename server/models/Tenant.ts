import mongoose, { Schema } from 'mongoose';

const tenantSchema = new Schema({
  legalName: { type: String, required: true, trim: true },
  displayName: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ['onboarding', 'trial', 'active', 'past_due', 'suspended', 'cancelled', 'archived'], default: 'onboarding', index: true },
  owner: {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
  },
  timezone: { type: String, default: 'America/Sao_Paulo' },
  planId: { type: Schema.Types.ObjectId, ref: 'Plan', default: null },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', default: null },
  effectiveFeatures: { type: Map, of: Boolean, default: {} },
  effectiveLimits: { type: Map, of: Number, default: {} },
  onboarding: { completed: { type: Boolean, default: false }, step: { type: String, default: 'store' } },
  activatedAt: Date,
  suspendedAt: Date,
  cancelledAt: Date,
  archivedAt: Date,
  lastActivityAt: Date,
}, { timestamps: true });

tenantSchema.index({ slug: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
tenantSchema.index({ status: 1, createdAt: -1 });
tenantSchema.index({ planId: 1, status: 1 });
tenantSchema.index({ lastActivityAt: -1 });

export type TenantDocument = mongoose.InferSchemaType<typeof tenantSchema> & { _id: mongoose.Types.ObjectId };
export default ((mongoose.models.Tenant) || mongoose.model('Tenant', tenantSchema)) as mongoose.Model<Record<string, any>>;
