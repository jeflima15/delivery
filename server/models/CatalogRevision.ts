import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
  revision: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true });

export default (mongoose.models.CatalogRevision || mongoose.model('CatalogRevision', schema)) as mongoose.Model<Record<string, any>>;
