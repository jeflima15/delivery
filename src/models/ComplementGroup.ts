import mongoose from 'mongoose';

const ComplementItemSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  preco: { type: Number, default: 0 },
  preco_centavos: { type: Number, min: 0, default: 0 },
  ativo: { type: Boolean, default: true },
});

const ComplementGroupSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, required: true },
  nome: { type: String, required: true },
  obrigatorio: { type: Boolean, default: false },
  minimo: { type: Number, default: 0, min: 0 },
  maximo: { type: Number, default: 1, min: 1 },
  ativo: { type: Boolean, default: true },
  ordem: { type: Number, default: 999 },
  itens: [ComplementItemSchema],
  produtos_vinculados: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  categorias_vinculadas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
}, { timestamps: true });

ComplementGroupSchema.index({ tenantId: 1, ativo: 1, ordem: 1 });
ComplementGroupSchema.index({ tenantId: 1, produtos_vinculados: 1 });
ComplementGroupSchema.index({ tenantId: 1, categorias_vinculadas: 1 });

export default ((mongoose.models.ComplementGroup) || mongoose.model('ComplementGroup', ComplementGroupSchema)) as mongoose.Model<Record<string, any>>;
