import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Subscription from '../models/Subscription.js';
import { HttpError } from '../middleware/errors.js';

export interface BillingProvider {
  readonly name: string;
  createInvoice(input: { tenantId: mongoose.Types.ObjectId; subscriptionId: mongoose.Types.ObjectId; amountCents: number; dueAt: Date }): Promise<unknown>;
  cancelInvoice(invoiceId: string, actorId: mongoose.Types.ObjectId, reason: string): Promise<unknown>;
  refundInvoice(invoiceId: string, actorId: mongoose.Types.ObjectId, reason: string): Promise<unknown>;
}

export class ManualBillingProvider implements BillingProvider {
  readonly name = 'manual';

  createInvoice(input: { tenantId: mongoose.Types.ObjectId; subscriptionId: mongoose.Types.ObjectId; amountCents: number; dueAt: Date }) {
    return Invoice.create({ ...input, provider: this.name, status: 'pending', history: [{ status: 'pending', reason: 'Fatura manual criada.' }] });
  }

  async markPaid(invoiceId: string, actorId: mongoose.Types.ObjectId, reason: string, receiptReference?: string) {
    const invoice = await Invoice.findOneAndUpdate(
      { _id: invoiceId, provider: this.name, status: { $in: ['pending', 'overdue', 'failed'] } },
      { $set: { status: 'paid', paidAt: new Date(), receiptReference }, $push: { history: { status: 'paid', actorId, reason } } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!invoice) throw new HttpError(409, 'Fatura nao pode ser marcada como paga.', 'INVALID_INVOICE_STATE');
    await Subscription.updateOne({ _id: invoice.subscriptionId }, { $set: { status: 'active' } });
    return invoice;
  }

  async cancelInvoice(invoiceId: string, actorId: mongoose.Types.ObjectId, reason: string) {
    const invoice = await Invoice.findOneAndUpdate(
      { _id: invoiceId, provider: this.name, status: { $in: ['pending', 'overdue', 'failed'] } },
      { $set: { status: 'cancelled' }, $push: { history: { status: 'cancelled', actorId, reason } } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!invoice) throw new HttpError(409, 'Fatura nao pode ser cancelada.', 'INVALID_INVOICE_STATE');
    return invoice;
  }

  async refundInvoice(invoiceId: string, actorId: mongoose.Types.ObjectId, reason: string) {
    const invoice = await Invoice.findOneAndUpdate(
      { _id: invoiceId, provider: this.name, status: 'paid' },
      { $set: { status: 'refunded' }, $push: { history: { status: 'refunded', actorId, reason } } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!invoice) throw new HttpError(409, 'Somente uma fatura manual paga pode ser estornada.', 'INVALID_INVOICE_STATE');
    await Subscription.updateOne({ _id: invoice.subscriptionId, status: 'active' }, { $set: { status: 'past_due' } });
    return invoice;
  }
}

export const manualBilling = new ManualBillingProvider();
