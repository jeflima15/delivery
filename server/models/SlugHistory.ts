import mongoose, { Schema } from 'mongoose';

const slugHistorySchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  slug: { type: String, required: true, lowercase: true },
  replacedAt: { type: Date, default: Date.now },
}, { timestamps: true });

slugHistorySchema.index({ slug: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default ((mongoose.models.SlugHistory) || mongoose.model('SlugHistory', slugHistorySchema)) as mongoose.Model<Record<string, any>>;
