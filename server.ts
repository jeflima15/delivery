import dotenv from 'dotenv';
dotenv.config();

import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import apiRouter from './server/routes/index.js';
import { connectDatabase, databaseReady } from './server/db/connect.js';
import { errorHandler, notFound } from './server/middleware/errors.js';
import { requestContext } from './server/middleware/requestContext.js';
import Tenant from './server/models/Tenant.js';
import StoreSettings from './src/models/StoreSettings.js';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(requestContext);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
      connectSrc: ["'self'", 'https://*.supabase.co'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', (_req, res) => res.status(databaseReady() ? 200 : 503).json({
  status: databaseReady() ? 'ready' : 'not_ready',
}));

app.use('/api', async (_req, _res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});
app.use('/api', apiRouter);
app.use('/api', notFound);

const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));

app.get('/*splat', async (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  try {
    const slug = req.path.split('/').filter(Boolean)[0] || process.env.DEFAULT_TENANT_SLUG;
    const tenant = slug ? await Tenant.findOne({ slug }).select('_id displayName').lean() : null;
    const settings = tenant
      ? await StoreSettings.findOne({ tenantId: tenant._id }).select('nome_loja').lean()
      : null;
    const storeName = escapeHtml(settings?.nome_loja || tenant?.displayName || 'Delivery');
    const html = fs.readFileSync(indexPath, 'utf8')
      .replace(/<title>.*?<\/title>/g, `<title>${storeName}</title>`)
      .replace(/content="My Google AI Studio App"/g, `content="${storeName}"`)
      .replace(/property="og:title" content=".*?"/g, `property="og:title" content="${storeName}"`);
    res.send(html);
  } catch {
    res.sendFile(indexPath);
  }
});

app.use(errorHandler);

export default app;
