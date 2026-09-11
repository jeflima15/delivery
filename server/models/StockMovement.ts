import mongoose, { Schema } from 'mongoose';

const stockMovementSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  type: { type: String, enum: ['sale', 'cancellation_return', 'cancellation_loss'], required: true },
  quantity: { type: Number, min: 1, required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'AdminAccount' },
  reason: { type: String, default: '' },
  operationKey: { type: String, required: true },
}, { timestamps: true });

stockMovementSchema.index({ tenantId: 1, operationKey: 1 }, { unique: true });
stockMovementSchema.index({ tenantId: 1, productId: 1, createdAt: -1 });

export default ((mongoose.models.StockMovement) || mongoose.model('StockMovement', stockMovementSchema)) as mongoose.Model<Record<string, any>>;
