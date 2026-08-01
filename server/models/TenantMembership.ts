import mongoose, { Schema } from 'mongoose';

const membershipSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'AdminAccount', required: true, index: true },
  role: { type: String, enum: ['tenant_owner', 'tenant_admin', 'tenant_manager', 'tenant_operator'], required: true },
  active: { type: Boolean, default: true },
  invitedAt: Date,
  acceptedAt: Date,
  revokedAt: Date,
}, { timestamps: true });

membershipSchema.index({ tenantId: 1, accountId: 1 }, { unique: true });

export default ((mongoose.models.TenantMembership) || mongoose.model('TenantMembership', membershipSchema)) as mongoose.Model<Record<string, any>>;
