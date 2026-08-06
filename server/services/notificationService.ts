import { getEnv, isProduction } from '../config/env.js';
import { HttpError } from '../middleware/errors.js';

export function assertInvitationDeliveryAvailable(): void {
  // Always allow invitations. If webhook is not configured, it will fallback to returning the manual link.
}

export function adminInvitationAcceptUrl(token: string): string {
  const origin = getEnv().APP_ORIGIN || 'http://localhost:3000';
  return `${origin}/invite/${encodeURIComponent(token)}`;
}

export async function deliverAdminInvitation(input: { email: string; tenantName: string; token: string }): Promise<void> {
  const env = getEnv();
  if (env.ADMIN_INVITE_DELIVERY_MODE === 'manual') return;
  const webhook = env.ADMIN_INVITE_WEBHOOK_URL;
  if (!webhook) return;
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'tenant_admin_invitation',
      recipient: input.email,
      tenantName: input.tenantName,
      acceptUrl: adminInvitationAcceptUrl(input.token),
    }),
  });
  if (!response.ok) throw new HttpError(502, 'Falha ao entregar convite administrativo.', 'INVITE_DELIVERY_FAILED');
}
