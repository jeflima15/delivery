import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true },
  attempts: { type: Number, default: 0 },
  state: { type: String, enum: ['pending', 'accepted', 'failed', 'skipped'], default: 'pending' },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: { type: Date, default: () => new Date(0) },
  expiresAt: { type: Date, required: true },
  lastError: { type: String, default: '' },
}, { timestamps: true });
schema.index({ orderId: 1, deviceId: 1 }, { unique: true });
schema.index({ state: 1, nextAttemptAt: 1, leaseUntil: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 });
export default (mongoose.models.PushJob || mongoose.model('PushJob', schema)) as mongoose.Model<Record<string, any>>;
