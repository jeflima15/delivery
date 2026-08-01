import mongoose from 'mongoose';

const CategorySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  nome: { type: String, required: true },
  descricao: { type: String, default: '' },
  ordem: { type: Number, default: 999 }
}, { timestamps: true });

CategorySchema.index({ tenantId: 1, ordem: 1 });

export default ((mongoose.models.Category) || mongoose.model('Category', CategorySchema)) as mongoose.Model<Record<string, any>>;
