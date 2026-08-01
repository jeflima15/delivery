import mongoose, { Schema } from 'mongoose';

const invoiceSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'overdue', 'cancelled', 'refunded', 'chargeback'], default: 'pending', index: true },
  amountCents: { type: Number, required: true, min: 0 },
  dueAt: { type: Date, required: true },
  paidAt: Date,
  provider: { type: String, default: 'manual' },
  externalId: String,
  receiptReference: String,
  history: [{ status: String, at: { type: Date, default: Date.now }, reason: String, actorId: Schema.Types.ObjectId }],
}, { timestamps: true });

invoiceSchema.index({ tenantId: 1, dueAt: -1 });
invoiceSchema.index({ provider: 1, externalId: 1 }, { unique: true, sparse: true });

export default ((mongoose.models.Invoice) || mongoose.model('Invoice', invoiceSchema)) as mongoose.Model<Record<string, any>>;
