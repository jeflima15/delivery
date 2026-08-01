import { Router } from 'express';
import { z } from 'zod';
import { resolveTenant } from '../middleware/tenant.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { createAuthoritativeOrder, getPublicTracking } from '../services/orderService.js';
import { createShippingQuote } from '../services/shippingService.js';
import { securityRateLimit } from '../middleware/rateLimit.js';

const router = Router({ mergeParams: true });
router.use(resolveTenant);

const orderSchema = z.object({
  customer: z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().min(8).max(30), address: z.string().trim().max(500).optional() }),
  items: z.array(z.object({ productId: z.string().regex(/^[a-f\d]{24}$/i), quantity: z.number().int().min(1).max(50), options: z.array(z.object({ groupId: z.string().regex(/^[a-f\d]{24}$/i), itemId: z.string().regex(/^[a-f\d]{24}$/i), quantity: z.number().int().min(1).max(20) })).default([]) })).min(1).max(100),
  deliveryType: z.enum(['pickup', 'delivery']),
  paymentMethod: z.enum(['pix', 'card', 'cash']),
  shippingQuoteId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  couponCode: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(1_000).optional(),
});

router.post('/orders', securityRateLimit({ namespace: 'create-order', limit: 30, windowMs: 5 * 60_000 }), validateBody(orderSchema), asyncRoute(async (req, res) => {
  const key = req.get('idempotency-key');
  if (!key || key.length < 16 || key.length > 128) throw new HttpError(400, 'Idempotency-Key obrigatoria.', 'IDEMPOTENCY_KEY_REQUIRED');
  const result = await createAuthoritativeOrder(req.tenant!._id, key, req.body);
  res.status(201).json({ success: true, ...result });
}));

const addressSchema = z.object({ postalCode: z.string().max(12).optional(), street: z.string().trim().min(2).max(160), number: z.string().trim().max(30).optional(), district: z.string().trim().max(100).optional(), city: z.string().trim().min(2).max(100), state: z.string().trim().max(2).optional() });
router.post('/shipping/quote', securityRateLimit({ namespace: 'shipping-quote', limit: 30, windowMs: 5 * 60_000 }), validateBody(addressSchema), asyncRoute(async (req, res) => {
  res.status(201).json({ success: true, quote: await createShippingQuote(req.tenant!._id, req.body) });
}));

router.get('/tracking/:token', securityRateLimit({ namespace: 'public-tracking', limit: 60, windowMs: 5 * 60_000 }), asyncRoute(async (req, res) => {
  res.json({ success: true, tracking: await getPublicTracking(req.tenant!._id, req.params.token) });
}));

export default router;
