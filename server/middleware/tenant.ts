import type { NextFunction, Request, Response } from 'express';
import Tenant from '../models/Tenant.js';
import SlugHistory from '../models/SlugHistory.js';
import { normalizeSlug } from '../domain/slug.js';
import { HttpError } from './errors.js';

export async function resolveTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = normalizeSlug(String(req.params.slug || ''));
    if (!slug) throw new HttpError(404, 'Loja nao encontrada.', 'TENANT_NOT_FOUND');

    const tenant = await Tenant.findOne({ slug }).select('_id slug status timezone').lean();
    if (!tenant) {
      const history = await SlugHistory.findOne({ slug }).select('tenantId').lean();
      if (history) {
        const current = await Tenant.findById(history.tenantId).select('slug').lean();
        if (current) {
          res.redirect(308, req.originalUrl.replace(`/${slug}`, `/${current.slug}`));
          return;
        }
      }
      throw new HttpError(404, 'Loja nao encontrada.', 'TENANT_NOT_FOUND');
    }

    if (['suspended', 'cancelled', 'archived'].includes(tenant.status)) {
      throw new HttpError(423, 'Esta loja esta temporariamente indisponivel.', 'TENANT_UNAVAILABLE');
    }

    req.tenant = tenant as unknown as Express.Request['tenant'];
    next();
  } catch (error) {
    next(error);
  }
}
