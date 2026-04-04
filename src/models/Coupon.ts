import mongoose from 'mongoose';

const CouponSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true },
  tipo: { type: String, enum: ['fixo', 'porcentagem'], default: 'fixo' },
  valor: { type: Number, required: true },
  minimo_pedido: { type: Number, default: 0 },
  ativo: { type: Boolean, default: true },
  validade: { type: Date },
  usos_restantes: { type: Number, default: -1 } // -1 = ilimitado
}, { timestamps: true });

export default mongoose.models.Coupon || mongoose.model('Coupon', CouponSchema);
