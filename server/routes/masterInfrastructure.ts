import { Router } from 'express';
import { asyncRoute } from '../middleware/errors.js';
import { collectInfrastructureSnapshot } from '../services/infrastructureService.js';

const router = Router();

router.get('/infrastructure', asyncRoute(async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await collectInfrastructureSnapshot());
}));

export default router;
