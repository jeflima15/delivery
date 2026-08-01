import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
  value: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

export default ((mongoose.models.OrderSequence) || mongoose.model('OrderSequence', schema)) as mongoose.Model<Record<string, any>>;
