import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAccount', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAccount', required: true },
  status: {
    type: String,
    enum: ['awaiting_upload', 'queued', 'analyzing', 'reviewing', 'confirming', 'completed', 'failed', 'cancelled', 'expired'],
    default: 'awaiting_upload',
    required: true,
  },
  revision: { type: Number, default: 0, min: 0, required: true },
  analysisGeneration: { type: Number, default: 0, min: 0, required: true },
  contractVersion: { type: String, default: 'domain-native-v1' },
  source: {
    originalName: String,
    mimeType: String,
    declaredSize: Number,
    verifiedSize: Number,
    sha256: String,
    bucket: String,
    path: String,
    uploadState: { type: String, enum: ['pending', 'uploaded', 'verified', 'deleted'], default: 'pending' },
    uploadedAt: Date,
    deletedAt: Date,
  },
  analysisId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogImportAnalysis' },
  workingPlan: { type: mongoose.Schema.Types.Mixed },
  decisions: {
    modeling: { type: mongoose.Schema.Types.Mixed, default: {} },
    duplicates: { type: mongoose.Schema.Types.Mixed, default: {} },
    acknowledgedWarnings: { type: [String], default: [] },
    resolvedIssueKeys: { type: [String], default: [] },
    excludedEntityKeys: { type: [String], default: [] },
    imageSelections: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  reconciliation: {
    catalogRevision: { type: Number, default: 0 },
    checkedAt: Date,
    duplicates: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  readiness: {
    blockerCount: { type: Number, default: 0 },
    requiredDecisionCount: { type: Number, default: 0 },
    unresolvedDuplicateCount: { type: Number, default: 0 },
    canConfirm: { type: Boolean, default: false },
  },
  confirmation: {
    previewHash: String,
    publishMode: { type: String, enum: ['review_first', 'publish_now'] },
    startedAt: Date,
    completedAt: Date,
    result: mongoose.Schema.Types.Mixed,
  },
  lastError: {
    code: String,
    message: String,
    retryable: Boolean,
  },
  expiresAt: { type: Date, required: true },
  cleanupState: { type: String, enum: ['pending', 'not_required', 'completed'], default: 'pending' },
  purgeAt: Date,
}, { timestamps: true, minimize: false });

schema.index({ tenantId: 1, updatedAt: -1 });
schema.index({ tenantId: 1, status: 1 });
schema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { cleanupState: 'completed' } });

export default (mongoose.models.CatalogImport || mongoose.model('CatalogImport', schema)) as mongoose.Model<Record<string, any>>;
