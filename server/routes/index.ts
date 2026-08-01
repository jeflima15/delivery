import { Router } from 'express';
import authRouter from './auth.js';
import publicRouter from './public.js';
import tenantRouter from './tenant.js';
import masterRouter from './master.js';
import customerRouter from './customer.js';
import customerAuthRouter from './customerAuth.js';

const router = Router();
router.use('/platform/auth', authRouter);
router.use('/public/stores/:slug', publicRouter);
router.use('/tenant/stores/:slug', tenantRouter);
router.use('/customer/stores/:slug/auth', customerAuthRouter);
router.use('/customer/stores/:slug', customerRouter);
router.use('/master', masterRouter);

export default router;
