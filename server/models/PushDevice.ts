import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true },
  endpointHash: { type: String, required: true },
  endpoint: { type: String, required: true, select: false },
  keys: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  name: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  lastAcceptedAt: Date,
  lastError: { type: String, default: '' },
}, { timestamps: true });
schema.index({ tenantId: 1, endpointHash: 1 }, { unique: true });
export default (mongoose.models.PushDevice || mongoose.model('PushDevice', schema)) as mongoose.Model<Record<string, any>>;
