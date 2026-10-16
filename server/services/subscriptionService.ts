import type { Request } from 'express';
import mongoose from 'mongoose';
import Plan from '../models/Plan.js';
import Subscription from '../models/Subscription.js';
import Tenant from '../models/Tenant.js';
import { HttpError } from '../middleware/errors.js';
import { audit } from './auditService.js';
import { billingRelationship, syncTenantBillingStatus, type SubscriptionStatus } from './billingStateService.js';

export async function assignSubscription(input: { tenantId: string; planId: string; status: 'trial' | 'active' }, req: Request) {
  return mongoose.connection.transaction(async (session) => {
    const tenant = await Tenant.findById(input.tenantId).session(session);
    const plan = await Plan.findOne({ _id: input.planId, active: true }).session(session);
    if (!tenant || !plan) throw new HttpError(404, 'Loja ou plano nao encontrado.', 'NOT_FOUND');
    if (await Subscription.exists({ tenantId: tenant._id }).session(session)) {
      throw new HttpError(409, 'Esta loja ja possui assinatura. Edite a assinatura existente.', 'SUBSCRIPTION_ALREADY_ASSIGNED');
    }
    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.interval === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);
    const [subscription] = await Subscription.create([{
      tenantId: tenant._id, planId: plan._id, status: input.status, provider: 'manual', externalId: `manual:${tenant._id}`,
      currentPeriodStart: now, currentPeriodEnd: periodEnd,
      trialEndsAt: input.status === 'trial' ? new Date(now.getTime() + Number(plan.trialDays || 0) * 86_400_000) : null,
    }], { session });
    tenant.planId = plan._id;
    tenant.subscriptionId = subscription._id;
    await tenant.save({ session });
    await syncTenantBillingStatus(tenant, input.status, session);
    await audit(req, { action: 'SUBSCRIPTION_ASSIGNED', targetType: 'Subscription', targetId: String(subscription._id), after: subscription.toObject() }, session);
    return subscription;
  });
}

export async function updateSubscription(id: string, input: { planId?: string; status?: SubscriptionStatus; reason: string }, req: Request) {
  return mongoose.connection.transaction(async (session) => {
    const { subscription, tenant } = await billingRelationship(id, session);
    const before = { subscription: subscription.toObject(), tenantStatus: tenant.status };
    if (input.planId) {
      const plan = await Plan.findOne({ _id: input.planId, active: true }).session(session);
      if (!plan) throw new HttpError(409, 'Plano indisponivel.', 'PLAN_UNAVAILABLE');
      subscription.planId = plan._id;
      tenant.planId = plan._id;
      await tenant.save({ session });
    }
    if (input.status) {
      subscription.status = input.status;
      subscription.cancelledAt = input.status === 'cancelled' ? new Date() : undefined;
      await syncTenantBillingStatus(tenant, input.status, session);
    }
    await subscription.save({ session });
    await audit(req, {
      action: 'SUBSCRIPTION_UPDATED', targetType: 'Subscription', targetId: id, reason: input.reason,
      before, after: { subscription: subscription.toObject(), tenantStatus: tenant.status },
    }, session);
    return subscription;
  });
}

export async function extendSubscriptionTrial(id: string, req: Request) {
  return mongoose.connection.transaction(async (session) => {
    const { subscription, tenant } = await billingRelationship(id, session);
    if (subscription.status !== 'trial') {
      throw new HttpError(409, 'Somente uma assinatura em trial pode ter o teste prorrogado.', 'TRIAL_NOT_ELIGIBLE');
    }
    const before = subscription.toObject();
    const currentEnd = subscription.trialEndsAt && subscription.trialEndsAt > new Date() ? subscription.trialEndsAt : new Date();
    subscription.trialEndsAt = new Date(currentEnd.getTime() + 7 * 86_400_000);
    await subscription.save({ session });
    await syncTenantBillingStatus(tenant, 'trial', session);
    await audit(req, {
      action: 'TRIAL_EXTENDED', targetType: 'Subscription', targetId: id,
      reason: 'Prorrogacao manual de 7 dias pelo Master', before, after: subscription.toObject(),
    }, session);
    return subscription;
  });
}
