import mongoose from 'mongoose';

const CouponSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  codigo: { type: String, required: true },
  normalizedCode: { type: String },
  tipo: { type: String, enum: ['fixo', 'porcentagem'], default: 'fixo' },
  valor: { type: Number, required: true },
  valor_centavos: { type: Number, min: 0 },
  minimo_pedido: { type: Number, default: 0 },
  ativo: { type: Boolean, default: true },
  validade: { type: Date },
  usos_restantes: { type: Number, default: -1 } // -1 = ilimitado
}, { timestamps: true });

CouponSchema.index(
  { tenantId: 1, normalizedCode: 1 },
  { unique: true, partialFilterExpression: { tenantId: { $exists: true }, normalizedCode: { $type: 'string' } } },
);

export default ((mongoose.models.Coupon) || mongoose.model('Coupon', CouponSchema)) as mongoose.Model<Record<string, any>>;
