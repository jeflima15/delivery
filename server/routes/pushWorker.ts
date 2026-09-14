import { Router } from 'express';
import crypto from 'node:crypto';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { processPushJobs } from '../services/pushService.js';

const router = Router();
router.post('/run', asyncRoute(async (req, res) => {
  const expected = process.env.PUSH_WORKER_SECRET;
  const supplied = req.get('authorization')?.replace(/^Bearer /, '') || '';
  if (!expected || expected.length < 32 || !crypto.timingSafeEqual(crypto.createHash('sha256').update(supplied).digest(), crypto.createHash('sha256').update(expected).digest())) throw new HttpError(401, 'Acesso negado.', 'FORBIDDEN');
  res.setHeader('Cache-Control', 'no-store');
  res.json(await processPushJobs());
}));
export default router;
