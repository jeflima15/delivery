import mongoose, { Schema } from 'mongoose';

const GeometrySchema = new Schema({
  type: { type: String, enum: ['Polygon'], required: true },
  coordinates: { type: [[[Number]]], required: true },
}, { _id: false });

const CenterSchema = new Schema({
  latitude: { type: Number, min: -90, max: 90, required: true },
  longitude: { type: Number, min: -180, max: 180, required: true },
  confirmed: { type: Boolean, default: true },
}, { _id: false });

const DeliveryRegionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  publicationId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  notes: { type: String, maxlength: 500, default: '' },
  sourceType: { type: String, enum: ['circle', 'polygon'], required: true },
  geometry: { type: GeometrySchema, required: true },
  center: { type: CenterSchema },
  radiusMeters: { type: Number, min: 100, max: 150_000 },
  feeCents: { type: Number, required: true, min: 0, max: 10_000_000 },
  deliveryTimeMin: { type: Number, min: 0, max: 1_440 },
  deliveryTimeMax: { type: Number, min: 0, max: 1_440 },
  blocked: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  priority: { type: Number, required: true, min: 0, max: 1_000 },
}, { timestamps: true });

DeliveryRegionSchema.index({ tenantId: 1, publicationId: 1, priority: 1 });

export default ((mongoose.models.DeliveryRegion) || mongoose.model('DeliveryRegion', DeliveryRegionSchema)) as mongoose.Model<Record<string, any>>;
