import mongoose, { Schema } from 'mongoose';

const adminAccountSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  platformRole: { type: String, enum: ['platform_super_admin', null], default: null },
  active: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },
  mfa: {
    enabled: { type: Boolean, default: false },
    secretEncrypted: { type: String, select: false },
    recoveryCodeHashes: { type: [String], select: false, default: [] },
    verifiedAt: Date,
  },
  lastLoginAt: Date,
}, { timestamps: true });

adminAccountSchema.index({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default ((mongoose.models.AdminAccount) || mongoose.model('AdminAccount', adminAccountSchema)) as mongoose.Model<Record<string, any>>;
