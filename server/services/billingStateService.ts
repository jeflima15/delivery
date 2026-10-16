import type { ClientSession } from 'mongoose';
import Subscription from '../models/Subscription.js';
import Tenant from '../models/Tenant.js';
import { HttpError } from '../middleware/errors.js';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
export const openInvoiceStatuses = ['pending', 'overdue', 'failed'];
const protectedTenantStatuses = ['suspended', 'cancelled', 'archived'];

export async function billingRelationship(subscriptionId: string, session: ClientSession, tenantId?: string) {
  const subscription = await Subscription.findById(subscriptionId).session(session);
  if (!subscription) throw new HttpError(404, 'Assinatura nao encontrada.', 'SUBSCRIPTION_NOT_FOUND');
  if (tenantId && String(subscription.tenantId) !== tenantId) {
    throw new HttpError(409, 'A assinatura nao pertence a esta loja.', 'BILLING_TENANT_MISMATCH');
  }
  const tenant = await Tenant.findById(subscription.tenantId).session(session);
  if (!tenant) throw new HttpError(409, 'Loja da assinatura nao encontrada.', 'BILLING_TENANT_NOT_FOUND');
  // Old tenants may not have the reverse reference yet. A conflicting reference is never repaired implicitly.
  if (tenant.subscriptionId && String(tenant.subscriptionId) !== String(subscription._id)) {
    throw new HttpError(409, 'O vinculo da assinatura precisa ser revisado pelo Master.', 'BILLING_LINK_CONFLICT');
  }
  return { subscription, tenant };
}

export async function syncTenantBillingStatus(
  tenant: Awaited<ReturnType<typeof billingRelationship>>['tenant'],
  status: SubscriptionStatus,
  session: ClientSession,
) {
  // Billing cannot lift a suspension, cancellation or archive imposed on the tenant.
  // Reopening that store requires the explicit tenant status action.
  if (protectedTenantStatuses.includes(tenant.status)) return;
  tenant.status = status;
  if (status === 'active') tenant.activatedAt = new Date();
  if (status === 'suspended') tenant.suspendedAt = new Date();
  if (status === 'cancelled') tenant.cancelledAt = new Date();
  await tenant.save({ session });
}
