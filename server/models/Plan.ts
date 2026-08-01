import mongoose, { Schema } from 'mongoose';

const planSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, lowercase: true, trim: true, unique: true },
  active: { type: Boolean, default: true },
  priceCents: { type: Number, required: true, min: 0 },
  interval: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  trialDays: { type: Number, default: 0, min: 0 },
  limits: { type: Map, of: Number, default: {} },
  features: { type: Map, of: Boolean, default: {} },
}, { timestamps: true });

export default ((mongoose.models.Plan) || mongoose.model('Plan', planSchema)) as mongoose.Model<Record<string, any>>;
