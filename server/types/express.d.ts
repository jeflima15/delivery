import type { Types } from 'mongoose';
import type { Permission, TenantRole } from '../domain/permissions.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      tenant?: { _id: Types.ObjectId; slug: string; displayName: string; status: string; timezone: string };
      auth?: {
        sessionId: Types.ObjectId;
        accountId: Types.ObjectId;
        accountType: 'admin' | 'customer';
        tenantId?: Types.ObjectId;
        platformRole?: 'platform_super_admin';
        tenantRole?: TenantRole;
        permissions: Permission[];
        mfaVerified: boolean;
      };
    }
  }
}

export {};
