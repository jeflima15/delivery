import express from 'express';
import request from 'supertest';
import { expect, it } from 'vitest';
import { asyncRoute, errorHandler, HttpError } from '../../server/middleware/errors.js';
import { requestContext } from '../../server/middleware/requestContext.js';

it('preserva parametro nomeado, middleware e encaminhamento de erro assincrono no Express 5', async () => {
  const app = express();
  app.use(requestContext);
  app.get('/resources/:id', (_req, res, next) => { res.setHeader('X-Middleware', 'ok'); next(); }, asyncRoute<{ id: string }>(async (req, res) => {
    await Promise.resolve();
    if (req.params.id === 'denied') throw new HttpError(403, 'Acesso negado.', 'FORBIDDEN');
    res.json({ id: req.params.id });
  }));
  app.get('/files/*splat', asyncRoute<{ splat: string[] }>(async (req, res) => { res.json({ parts: req.params.splat }); }));
  app.use(errorHandler);
  const success = await request(app).get('/resources/abc').expect(200);
  expect(success.body).toEqual({ id: 'abc' });
  expect(success.headers['x-middleware']).toBe('ok');
  expect((await request(app).get('/resources/denied').expect(403)).body.error.code).toBe('FORBIDDEN');
  expect((await request(app).get('/files/a/b').expect(200)).body.parts).toEqual(['a', 'b']);
});
