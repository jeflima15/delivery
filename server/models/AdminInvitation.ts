import mongoose, { Schema } from 'mongoose';

const adminInvitationSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ['tenant_owner', 'tenant_admin', 'tenant_manager', 'tenant_operator'], required: true },
  tokenHash: { type: String, required: true, select: false },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'AdminAccount', required: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: Date,
  revokedAt: Date,
}, { timestamps: true });

adminInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
adminInvitationSchema.index({ tenantId: 1, email: 1, acceptedAt: 1 });

export default ((mongoose.models.AdminInvitation) || mongoose.model('AdminInvitation', adminInvitationSchema)) as mongoose.Model<Record<string, any>>;
