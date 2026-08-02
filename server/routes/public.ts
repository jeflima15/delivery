import { Router } from 'express';
import Product from '../../src/models/Product.js';
import Category from '../../src/models/Category.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import HomeBlock from '../../src/models/HomeBlock.js';
import { createStoreTheme } from '../../src/lib/theme.js';
import { asyncRoute } from '../middleware/errors.js';
import { resolveTenant } from '../middleware/tenant.js';

const router = Router({ mergeParams: true });
router.use(resolveTenant);

router.get('/store', asyncRoute(async (req, res) => {
  const [settings, categories, products, blocks] = await Promise.all([
    StoreSettings.findOne({ tenantId: req.tenant?._id }).lean(),
    Category.find({ tenantId: req.tenant?._id }).sort({ ordem: 1, createdAt: 1 }).lean(),
    Product.find({ tenantId: req.tenant?._id, ativo: { $ne: false } }).sort({ categoriaId: 1, ordem_categoria: 1, createdAt: 1 }).lean(),
    HomeBlock.find({ tenantId: req.tenant?._id, ativo: true }).sort({ posicao_exibicao: 1, ordem: 1 }).lean(),
  ]);
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  res.json({
    success: true,
    tenant: { id: req.tenant?._id, slug: req.tenant?.slug, status: req.tenant?.status, timezone: req.tenant?.timezone },
    settings: settings ? { ...settings, theme: createStoreTheme(settings.theme?.primaryColor) } : null,
    categories,
    products,
    blocks,
  });
}));

router.get('/catalog', asyncRoute(async (req, res) => {
  const categories = await Category.find({ tenantId: req.tenant?._id }).sort({ ordem: 1 }).lean();
  const products = await Product.find({ tenantId: req.tenant?._id, ativo: { $ne: false } }).sort({ categoriaId: 1, ordem_categoria: 1 }).lean();
  res.json({ success: true, categories, products });
}));

export default router;
