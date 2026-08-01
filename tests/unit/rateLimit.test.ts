import express from 'express';
import request from 'supertest';
import { expect, it } from 'vitest';
import { securityRateLimit } from '../../server/middleware/rateLimit';
import { errorHandler } from '../../server/middleware/errors';

it('bloqueia requisicoes acima do limite local de desenvolvimento', async () => {
  const app = express();
  app.get('/limited', securityRateLimit({ namespace: `unit-${Date.now()}`, limit: 2, windowMs: 60_000 }), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  await request(app).get('/limited').set('User-Agent', 'rate-test').expect(200);
  await request(app).get('/limited').set('User-Agent', 'rate-test').expect(200);
  const response = await request(app).get('/limited').set('User-Agent', 'rate-test').expect(429);
  expect(response.body.error.code).toBe('RATE_LIMITED');
});
