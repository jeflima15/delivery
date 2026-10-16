import mongoose from 'mongoose';
import type { Request } from 'express';
import Invoice from '../models/Invoice.js';
import { HttpError } from '../middleware/errors.js';
import { audit } from './auditService.js';
import { billingRelationship, openInvoiceStatuses, syncTenantBillingStatus } from './billingStateService.js';

type CreateInvoiceInput = {
  tenantId: mongoose.Types.ObjectId | string;
  subscriptionId: mongoose.Types.ObjectId | string;
  amountCents: number;
  dueAt: Date;
  idempotencyKey?: string;
};

export interface BillingProvider {
  readonly name: string;
  createInvoice(input: CreateInvoiceInput): Promise<unknown>;
  cancelInvoice(invoiceId: string, actorId: mongoose.Types.ObjectId, reason: string): Promise<unknown>;
  refundInvoice(invoiceId: string, actorId: mongoose.Types.ObjectId, reason: string): Promise<unknown>;
}

export class ManualBillingProvider implements BillingProvider {
  readonly name = 'manual';

  async createInvoice(input: CreateInvoiceInput, req?: Request) {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0 || !Number.isFinite(input.dueAt?.getTime())) {
      throw new HttpError(400, 'Valor ou vencimento invalido.', 'INVALID_INVOICE_INPUT');
    }
    // A manual provider reference also works with the existing provider/externalId unique index.
    // It identifies a local record, never a payment gateway transaction.
    const externalId = `manual:${input.idempotencyKey || new mongoose.Types.ObjectId()}`;
    const assertReplay = (invoice: NonNullable<Awaited<ReturnType<typeof Invoice.findOne>>>) => {
      if (String(invoice.tenantId) !== String(input.tenantId) || String(invoice.subscriptionId) !== String(input.subscriptionId)
        || invoice.amountCents !== input.amountCents || invoice.dueAt.getTime() !== input.dueAt.getTime()) {
        throw new HttpError(409, 'A identificacao desta criacao ja foi utilizada com outros dados.', 'BILLING_IDEMPOTENCY_CONFLICT');
      }
      return invoice;
    };
    try {
      return await mongoose.connection.transaction(async (session) => {
        await billingRelationship(String(input.subscriptionId), session, String(input.tenantId));
        if (input.idempotencyKey) {
          const existing = await Invoice.findOne({ provider: this.name, externalId }).session(session);
          if (existing) return assertReplay(existing);
        }
        const [invoice] = await Invoice.create([{
          tenantId: input.tenantId, subscriptionId: input.subscriptionId, amountCents: input.amountCents,
          dueAt: input.dueAt, provider: this.name, externalId, status: 'pending',
          history: [{ status: 'pending', reason: 'Fatura manual criada.', actorId: req?.auth?.accountId }],
        }], { session });
        if (req) await audit(req, { action: 'INVOICE_CREATED', targetType: 'Invoice', targetId: String(invoice._id), after: invoice.toObject() }, session);
        return invoice;
      });
    } catch (error) {
      // A simultaneous replay may lose the unique-index race after both initial reads found no invoice.
      if (input.idempotencyKey && (error as { code?: number }).code === 11000) {
        const existing = await Invoice.findOne({ provider: this.name, externalId });
        if (existing) return assertReplay(existing);
      }
      throw error;
    }
  }

  async markPaid(invoiceId: string, actorId: mongoose.Types.ObjectId, reason: string, receiptReference?: string, paidAt = new Date(), req?: Request) {
    if (!Number.isFinite(paidAt.getTime()) || paidAt.getTime() > Date.now() + 60_000) {
      throw new HttpError(400, 'A data de pagamento nao pode estar no futuro.', 'INVALID_PAYMENT_DATE');
    }
    return this.transition(invoiceId, actorId, reason, 'paid', req, { paidAt, receiptReference });
  }

  async cancelInvoice(invoiceId: string, actorId: mongoose.Types.ObjectId, reason: string, req?: Request) {
    return this.transition(invoiceId, actorId, reason, 'cancelled', req);
  }

  async refundInvoice(invoiceId: string, actorId: mongoose.Types.ObjectId, reason: string, req?: Request) {
    return this.transition(invoiceId, actorId, reason, 'refunded', req);
  }

  private async transition(
    invoiceId: string, actorId: mongoose.Types.ObjectId, reason: string,
    status: 'paid' | 'cancelled' | 'refunded', req?: Request,
    payment?: { paidAt: Date; receiptReference?: string },
  ) {
    if (reason.trim().length < 5) throw new HttpError(400, 'Informe um motivo com pelo menos 5 caracteres.', 'BILLING_REASON_REQUIRED');
    return mongoose.connection.transaction(async (session) => {
      const invoice = await Invoice.findOne({ _id: invoiceId, provider: this.name }).session(session);
      const allowed = status === 'refunded' ? ['paid'] : openInvoiceStatuses;
      if (!invoice || !allowed.includes(invoice.status)) {
        throw new HttpError(409, 'Esta fatura nao permite a operacao solicitada. Atualize a lista.', 'INVALID_INVOICE_STATE');
      }
      const { subscription, tenant } = await billingRelationship(String(invoice.subscriptionId), session, String(invoice.tenantId));
      const before = { invoice: invoice.toObject(), subscription: subscription.toObject(), tenantStatus: tenant.status };
      // Every invoice transition writes the same subscription, preventing write skew when
      // different overdue invoices are paid concurrently. Mongo retries against a fresh snapshot.
      subscription.$inc('billingRevision', 1);
      invoice.status = status;
      if (payment) { invoice.paidAt = payment.paidAt; invoice.receiptReference = payment.receiptReference; }
      invoice.history.push({ status, at: new Date(), actorId, reason: reason.trim() });
      await invoice.save({ session });

      if (status === 'paid' && ['trial', 'active', 'past_due'].includes(subscription.status)) {
        const overdue = await Invoice.exists({
          tenantId: tenant._id, subscriptionId: subscription._id,
          status: { $in: openInvoiceStatuses }, dueAt: { $lt: new Date() },
        }).session(session);
        subscription.status = overdue ? 'past_due' : 'active';
        await syncTenantBillingStatus(tenant, subscription.status, session);
      } else if (status === 'refunded' && subscription.status === 'active') {
        subscription.status = 'past_due';
        await syncTenantBillingStatus(tenant, 'past_due', session);
      }
      await subscription.save({ session });
      if (req) await audit(req, {
        action: status === 'paid' ? 'INVOICE_MARKED_PAID' : status === 'cancelled' ? 'INVOICE_CANCELLED' : 'INVOICE_REFUNDED',
        targetType: 'Invoice', targetId: String(invoice._id), reason,
        before, after: { invoice: invoice.toObject(), subscription: subscription.toObject(), tenantStatus: tenant.status },
      }, session);
      return invoice;
    });
  }
}

export const manualBilling = new ManualBillingProvider();
