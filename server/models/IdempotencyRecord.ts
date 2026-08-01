import mongoose, { Schema } from 'mongoose';

const idempotencySchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  scope: { type: String, required: true },
  key: { type: String, required: true },
  requestHash: { type: String, required: true },
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
  responseStatus: Number,
  responseBody: Schema.Types.Mixed,
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

idempotencySchema.index({ tenantId: 1, scope: 1, key: 1 }, { unique: true });
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default ((mongoose.models.IdempotencyRecord) || mongoose.model('IdempotencyRecord', idempotencySchema)) as mongoose.Model<Record<string, any>>;
