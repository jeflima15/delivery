import mongoose, { Schema } from 'mongoose';

const webhookEventSchema = new Schema({
  provider: { type: String, required: true },
  eventId: { type: String, required: true },
  type: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  signatureValid: { type: Boolean, required: true },
  status: { type: String, enum: ['received', 'processed', 'failed', 'ignored'], default: 'received' },
  attempts: { type: Number, default: 0 },
  processedAt: Date,
  lastError: String,
}, { timestamps: true });

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export default ((mongoose.models.WebhookEvent) || mongoose.model('WebhookEvent', webhookEventSchema)) as mongoose.Model<Record<string, any>>;
