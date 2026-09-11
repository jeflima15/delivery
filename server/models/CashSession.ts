import mongoose, { Schema } from 'mongoose';

const cashMovementSchema = new Schema({
  type: { type: String, enum: ['payment', 'refund', 'supply', 'withdrawal'], required: true },
  amountCents: { type: Number, min: 1, required: true },
  method: { type: String, required: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  paymentId: String,
  note: { type: String, default: '' },
  actorId: { type: Schema.Types.ObjectId, ref: 'AdminAccount', required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const cashSessionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  operationalDate: { type: String, required: true, index: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  openingBalanceCents: { type: Number, min: 0, required: true },
  openedBy: { type: Schema.Types.ObjectId, ref: 'AdminAccount', required: true },
  openedAt: { type: Date, default: Date.now },
  movements: { type: [cashMovementSchema], default: [] },
  countedByMethod: { type: Map, of: Number, default: {} },
  expectedByMethod: { type: Map, of: Number, default: {} },
  differenceByMethod: { type: Map, of: Number, default: {} },
  closingNote: { type: String, default: '' },
  closedBy: { type: Schema.Types.ObjectId, ref: 'AdminAccount' },
  closedAt: Date,
}, { timestamps: true });

cashSessionSchema.index({ tenantId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });
cashSessionSchema.index({ tenantId: 1, openedAt: -1 });

export default ((mongoose.models.CashSession) || mongoose.model('CashSession', cashSessionSchema)) as mongoose.Model<Record<string, any>>;
