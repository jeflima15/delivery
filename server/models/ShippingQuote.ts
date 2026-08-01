import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  feeCents: { type: Number, required: true, min: 0 },
  normalizedAddressHash: { type: String, required: true },
  provider: { type: String, required: true },
  distanceMeters: { type: Number, min: 0 },
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
}, { timestamps: true });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default ((mongoose.models.ShippingQuote) || mongoose.model('ShippingQuote', schema)) as mongoose.Model<Record<string, any>>;
