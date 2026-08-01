import mongoose, { Schema } from 'mongoose';

const geocodeCacheSchema = new Schema({
  addressHash: { type: String, required: true, unique: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  provider: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

geocodeCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default ((mongoose.models.GeocodeCache) || mongoose.model('GeocodeCache', geocodeCacheSchema)) as mongoose.Model<Record<string, any>>;
