import { Router } from 'express';
import crypto from 'node:crypto';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { processCatalogImportJobs } from '../services/catalogImportJobService.js';

const router = Router();
router.post('/run', asyncRoute(async (req, res) => {
  const expected = process.env.CATALOG_IMPORT_WORKER_SECRET || '';
  const supplied = req.get('authorization')?.replace(/^Bearer /, '') || '';
  if (expected.length < 32 || supplied.length < 1 || !crypto.timingSafeEqual(crypto.createHash('sha256').update(supplied).digest(), crypto.createHash('sha256').update(expected).digest())) {
    throw new HttpError(401, 'Acesso negado.', 'FORBIDDEN');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, ...(await processCatalogImportJobs()) });
}));
export default router;
