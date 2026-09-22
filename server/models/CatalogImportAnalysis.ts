import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  importId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogImport', required: true },
  generation: { type: Number, required: true, min: 1, immutable: true },
  provider: { type: String, default: 'google', immutable: true },
  model: { type: String, required: true, immutable: true },
  pipeline: { type: String, enum: ['domain_native'], default: 'domain_native', immutable: true },
  schemaVersion: { type: String, default: 'domain-native-v1', immutable: true },
  seed: { type: Number, immutable: true },
  usage: { type: mongoose.Schema.Types.Mixed, immutable: true },
  executionTimeMs: { type: Number, immutable: true },
  inferenceTimeMs: { type: Number, immutable: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  analysisHash: { type: String, required: true, immutable: true },
  purgeAt: Date,
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, importId: 1, generation: 1 }, { unique: true });
schema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export default (mongoose.models.CatalogImportAnalysis || mongoose.model('CatalogImportAnalysis', schema)) as mongoose.Model<Record<string, any>>;
