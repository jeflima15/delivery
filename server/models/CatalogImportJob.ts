import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  importId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogImport', required: true },
  type: { type: String, enum: ['analyze', 'cleanup'], required: true },
  generation: { type: Number, required: true, min: 1 },
  state: { type: String, enum: ['pending', 'leased', 'succeeded', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0, min: 0 },
  maxAttempts: { type: Number, default: 3, min: 1 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseToken: String,
  leaseUntil: { type: Date, default: () => new Date(0) },
  lastError: { code: String, message: String },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

schema.index({ importId: 1, type: 1, generation: 1 }, { unique: true });
schema.index({ state: 1, nextAttemptAt: 1, leaseUntil: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default (mongoose.models.CatalogImportJob || mongoose.model('CatalogImportJob', schema)) as mongoose.Model<Record<string, any>>;
