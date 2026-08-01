import { getEnv, isProduction } from '../config/env.js';
import { HttpError } from '../middleware/errors.js';

export function assertInvitationDeliveryAvailable(): void {
  if (isProduction() && !getEnv().ADMIN_INVITE_WEBHOOK_URL) {
    throw new HttpError(503, 'Canal de convite administrativo nao configurado.', 'INVITE_DELIVERY_UNAVAILABLE');
  }
}

export async function deliverAdminInvitation(input: { email: string; tenantName: string; token: string }): Promise<void> {
  const webhook = getEnv().ADMIN_INVITE_WEBHOOK_URL;
  if (!webhook) return;
  const origin = getEnv().APP_ORIGIN || 'http://localhost:3000';
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'tenant_admin_invitation',
      recipient: input.email,
      tenantName: input.tenantName,
      acceptUrl: `${origin}/invite/${encodeURIComponent(input.token)}`,
    }),
  });
  if (!response.ok) throw new HttpError(502, 'Falha ao entregar convite administrativo.', 'INVITE_DELIVERY_FAILED');
}
