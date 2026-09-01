import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  feeCents: { type: Number, required: true, min: 0 },
  normalizedAddressHash: { type: String, required: true },
  provider: { type: String, required: true },
  precision: { type: String, enum: ['confirmed', 'exact', 'street', 'postal_code', 'district'] },
  regionId: { type: Schema.Types.ObjectId, ref: 'DeliveryRegion' },
  regionPublicationId: String,
  deliveryTimeMin: { type: Number, min: 0 },
  deliveryTimeMax: { type: Number, min: 0 },
  destination: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
  },
  distanceMeters: { type: Number, min: 0 },
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
}, { timestamps: true });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default ((mongoose.models.ShippingQuote) || mongoose.model('ShippingQuote', schema)) as mongoose.Model<Record<string, any>>;
