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
import { publicOrigin, renderStorefrontHtml, storefrontSlug } from './server/services/storefrontHtml.js';
import { contentSecurityPolicy } from './server/security/contentSecurityPolicy.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(requestContext);
app.use(helmet({
  contentSecurityPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use((_req, res, next) => { res.setHeader('Content-Security-Policy', contentSecurityPolicy); next(); });
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
// Institutional HTML is independent of tenant resolution and consumer sessions.
app.get('/', (_req, res) => res.sendFile(path.join(distPath, 'landing.html')));
app.use(express.static(distPath));

app.get('/*splat', async (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  const slug = storefrontSlug(req.path);
  if (!slug) { res.sendFile(indexPath); return; }
  try {
    const origin = publicOrigin(process.env.APP_ORIGIN, process.env.NODE_ENV !== 'production');
    if (!origin) throw new Error('PUBLIC_ORIGIN_UNAVAILABLE');
    await connectDatabase();
    const tenant = await Tenant.findOne({ slug }).select('_id displayName status').lean();
    if (!tenant || ['suspended', 'cancelled', 'archived'].includes(tenant.status)) {
      res.setHeader('X-Robots-Tag', 'noindex');
      res.status(tenant ? 423 : 404).sendFile(indexPath);
      return;
    }
    const settings = await StoreSettings.findOne({ tenantId: tenant._id }).select('nome_loja tagline sobre_texto capa_url logo_url').lean();
    res.type('html').send(renderStorefrontHtml(fs.readFileSync(indexPath, 'utf8'), {
      slug, origin, storageOrigin: publicOrigin(process.env.SUPABASE_URL),
      name: settings?.nome_loja || tenant.displayName,
      description: settings?.sobre_texto || settings?.tagline,
      cover: settings?.capa_url, logo: settings?.logo_url,
    }));
  } catch {
    res.setHeader('X-Robots-Tag', 'noindex');
    res.status(503).sendFile(indexPath);
  }
});

app.use(errorHandler);

export default app;
