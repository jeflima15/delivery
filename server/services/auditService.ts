import type { Request } from 'express';
import AuditLog from '../../src/models/AuditLog.js';

const blockedKeys = /password|senha|token|secret|otp|authorization|cookie/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !blockedKeys.test(key))
      .map(([key, entry]) => [key, sanitize(entry)]));
  }
  return typeof value === 'string' && value.length > 2_000 ? `${value.slice(0, 2_000)}...` : value;
}

type AuditInput = {
  action: string;
  targetType: string;
  targetId?: string;
  details?: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
};

export async function audit(req: Request, input: AuditInput): Promise<void> {
  await AuditLog.create({
    tenantId: req.tenant?._id,
    adminId: req.auth?.accountId?.toString() || 'SYSTEM',
    actorRole: req.auth?.platformRole || req.auth?.tenantRole || req.auth?.accountType || 'system',
    acao: input.action,
    tabela: input.targetType,
    targetType: input.targetType,
    documentoId: input.targetId,
    detalhes: input.details || input.action,
    reason: input.reason,
    before: sanitize(input.before),
    after: sanitize(input.after),
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500),
  });
}
