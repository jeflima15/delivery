import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  operationalDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  value: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

schema.index({ tenantId: 1, operationalDate: 1 }, { unique: true });

export default ((mongoose.models.DailyOrderSequence) || mongoose.model('DailyOrderSequence', schema)) as mongoose.Model<Record<string, any>>;
