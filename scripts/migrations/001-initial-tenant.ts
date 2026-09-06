import 'dotenv/config';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Tenant from '../../server/models/Tenant.js';
import AdminAccount from '../../server/models/AdminAccount.js';
import TenantMembership from '../../server/models/TenantMembership.js';
import Product from '../../src/models/Product.js';
import Category from '../../src/models/Category.js';
import Order from '../../src/models/Order.js';
import User from '../../src/models/User.js';
import Coupon from '../../src/models/Coupon.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import HomeBlock from '../../src/models/HomeBlock.js';
import AuditLog from '../../src/models/AuditLog.js';
import Admin from '../../src/models/Admin.js';
import { assertAvailableSlug } from '../../server/domain/slug.js';
import { reaisToCents } from '../../server/domain/money.js';

const apply = process.argv.includes('--apply');
const dryRun = !apply || process.argv.includes('--dry-run');
const slug = assertAvailableSlug(process.env.DEFAULT_TENANT_SLUG || 'loja-piloto');

if (apply && process.env.CONFIRM_MIGRATION !== slug) {
  throw new Error(`Para aplicar, defina CONFIRM_MIGRATION=${slug}. Execute primeiro com --dry-run.`);
}
if (!process.env.MONGO_URI) throw new Error('MONGO_URI nao configurada.');
if (!process.env.MIGRATION_DB_NAME) throw new Error('MIGRATION_DB_NAME nao configurada. Informe explicitamente o banco que sera migrado.');

const databaseName = process.env.MIGRATION_DB_NAME;
const report: Record<string, unknown> = { mode: dryRun ? 'dry-run' : 'apply', slug, databaseName, startedAt: new Date().toISOString() };

type MoneyIssue = { collection: 'products' | 'orders'; documentId: string; field: string; value: unknown };
type MoneyPreflight = { issues: MoneyIssue[]; recoverableOrderTotals: number };

function isFiniteMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function itemSubtotal(item: Record<string, any>): number | null {
  if (isFiniteMoney(item.subtotal)) return item.subtotal;
  const quantity = Number(item.quantidade) || 1;
  return isFiniteMoney(item.preco_unitario) && quantity > 0 ? item.preco_unitario * quantity : null;
}

function deriveOrderTotal(order: Record<string, any>): number | null {
  if (!Array.isArray(order.itens) || order.itens.length === 0) return null;
  let itemsTotal = 0;
  for (const item of order.itens) {
    const subtotal = itemSubtotal(item);
    if (subtotal == null) return null;
    itemsTotal += subtotal;
  }
  const optionalValues = [order.frete, order.desconto_cupom, order.valor_desconto_pontos];
  if (optionalValues.some((value) => value != null && !isFiniteMoney(value))) return null;
  return Math.max(0, itemsTotal + (order.frete || 0) - (order.desconto_cupom || 0) - (order.valor_desconto_pontos || 0));
}

async function findMoneyIssues(): Promise<MoneyPreflight> {
  const issues: MoneyIssue[] = [];
  let recoverableOrderTotals = 0;
  const products = await Product.collection.find({}).project({ preco: 1, preco_antigo: 1, preco_centavos: 1, preco_antigo_centavos: 1, grupos_adicionais: 1 }).toArray();
  for (const product of products) {
    const documentId = product._id.toString();
    if (!Number.isSafeInteger(product.preco_centavos) && !isFiniteMoney(product.preco)) {
      issues.push({ collection: 'products', documentId, field: 'preco', value: product.preco });
    }
    if (product.preco_antigo != null && product.preco_antigo !== 0 && !Number.isSafeInteger(product.preco_antigo_centavos) && !isFiniteMoney(product.preco_antigo)) {
      issues.push({ collection: 'products', documentId, field: 'preco_antigo', value: product.preco_antigo });
    }
    for (const [groupIndex, group] of (product.grupos_adicionais || []).entries()) {
      for (const [itemIndex, item] of (group.itens || []).entries()) {
        if (!Number.isSafeInteger(item.preco_centavos) && item.preco != null && !isFiniteMoney(item.preco)) {
          issues.push({ collection: 'products', documentId, field: `grupos_adicionais.${groupIndex}.itens.${itemIndex}.preco`, value: item.preco });
        }
      }
    }
  }

  const orders = await Order.collection.find({}).project({ total: 1, frete: 1, desconto_cupom: 1, valor_desconto_pontos: 1, total_centavos: 1, frete_centavos: 1, itens: 1 }).toArray();
  for (const order of orders) {
    const documentId = order._id.toString();
    if (!Number.isSafeInteger(order.total_centavos) && !isFiniteMoney(order.total)) {
      if (deriveOrderTotal(order) == null) issues.push({ collection: 'orders', documentId, field: 'total', value: order.total });
      else recoverableOrderTotals += 1;
    }
    if (!Number.isSafeInteger(order.frete_centavos) && order.frete != null && !isFiniteMoney(order.frete)) {
      issues.push({ collection: 'orders', documentId, field: 'frete', value: order.frete });
    }
    for (const [itemIndex, item] of (order.itens || []).entries()) {
      const quantity = Number(item.quantidade) || 1;
      const canDeriveUnitPrice = isFiniteMoney(item.subtotal) && quantity > 0;
      const canDeriveSubtotal = isFiniteMoney(item.preco_unitario) && quantity > 0;
      if (!Number.isSafeInteger(item.preco_unitario_centavos) && !isFiniteMoney(item.preco_unitario) && !canDeriveUnitPrice) {
        issues.push({ collection: 'orders', documentId, field: `itens.${itemIndex}.preco_unitario`, value: item.preco_unitario });
      }
      if (!Number.isSafeInteger(item.subtotal_centavos) && !isFiniteMoney(item.subtotal) && !canDeriveSubtotal) {
        issues.push({ collection: 'orders', documentId, field: `itens.${itemIndex}.subtotal`, value: item.subtotal });
      }
    }
  }
  return { issues, recoverableOrderTotals };
}

function normalizePhone(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI!, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 8_000,
    autoCreate: false,
    autoIndex: false,
  });
  const tenantCollections = [Product, Category, Order, User, Coupon, StoreSettings, HomeBlock, AuditLog]
    .map((model) => ({ name: model.modelName, collection: model.collection }));
  const counts = Object.fromEntries(await Promise.all(tenantCollections.map(async ({ name, collection }) => [name, await collection.countDocuments()] as const)));
  const missingTenant = Object.fromEntries(await Promise.all(tenantCollections.map(async ({ name, collection }) => [name, await collection.countDocuments({ tenantId: { $exists: false } })] as const)));
  const duplicatePhones = await User.aggregate([{ $group: { _id: { $toString: '$telefone' }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]);
  const duplicateCoupons = await Coupon.aggregate([{ $group: { _id: { $toUpper: '$codigo' }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]);
  const moneyPreflight = await findMoneyIssues();
  Object.assign(report, { counts, missingTenant, duplicatePhones, duplicateCoupons, moneyIssues: moneyPreflight.issues, recoverableOrderTotals: moneyPreflight.recoverableOrderTotals });
  if (duplicatePhones.length || duplicateCoupons.length) throw new Error('Duplicidades globais detectadas. Resolva o relatorio antes do backfill.');
  if (moneyPreflight.issues.length) throw new Error('Valores monetarios legados invalidos detectados. Resolva o relatorio antes de continuar.');

  const existingTenant = await Tenant.findOne({ slug }).lean();
  if (dryRun) {
    report.tenantAction = existingTenant ? 'reuse' : 'create';
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const settings = await StoreSettings.findOne().lean();
  const tenant = existingTenant || await Tenant.create({
    legalName: settings?.nome_loja || 'Loja piloto',
    displayName: settings?.nome_loja || 'Loja piloto',
    slug,
    status: 'active',
    owner: {
      name: process.env.DEFAULT_TENANT_OWNER_NAME || 'Proprietario',
      email: (process.env.DEFAULT_TENANT_OWNER_EMAIL || 'owner@example.invalid').toLowerCase(),
      phone: process.env.DEFAULT_TENANT_OWNER_PHONE || '',
    },
    timezone: process.env.DEFAULT_TENANT_TIMEZONE || 'America/Sao_Paulo',
    activatedAt: new Date(),
    onboarding: { completed: true, step: 'complete' },
  });

  const tenantId = tenant._id;
  for (const { collection } of tenantCollections) {
    await collection.updateMany({ tenantId: { $exists: false } }, { $set: { tenantId } });
  }

  for await (const user of User.find({ tenantId, $or: [{ normalizedPhone: { $exists: false } }, { normalizedPhone: '' }] }).cursor()) {
    user.normalizedPhone = normalizePhone(user.telefone);
    await user.save();
  }
  for await (const coupon of Coupon.find({ tenantId, $or: [{ normalizedCode: { $exists: false } }, { normalizedCode: '' }] }).cursor()) {
    coupon.normalizedCode = coupon.codigo.trim().toUpperCase();
    coupon.valor_centavos = coupon.tipo === 'fixo' ? reaisToCents(coupon.valor) : undefined;
    await coupon.save();
  }
  for await (const product of Product.find({ tenantId }).cursor()) {
    if (!Number.isSafeInteger(product.preco_centavos)) product.preco_centavos = reaisToCents(product.preco);
    if (product.preco_antigo && !Number.isSafeInteger(product.preco_antigo_centavos)) product.preco_antigo_centavos = reaisToCents(product.preco_antigo);
    for (const group of product.grupos_adicionais || []) {
      for (const item of group.itens || []) {
        if (!Number.isSafeInteger(item.preco_centavos) || (item.preco_centavos === 0 && item.preco > 0)) {
          item.preco_centavos = reaisToCents(item.preco || 0);
        }
      }
    }
    await product.save();
  }

  let nextOrderNumber = 1;
  for await (const order of Order.collection.find({ tenantId }).sort({ createdAt: 1, _id: 1 })) {
    const update: Record<string, unknown> = {};
    const orderNumber = Number.isSafeInteger(order.orderNumber) && order.orderNumber > 0 ? order.orderNumber : nextOrderNumber;
    update.orderNumber = orderNumber;
    nextOrderNumber = Math.max(nextOrderNumber, orderNumber + 1);

    let total = isFiniteMoney(order.total) ? order.total : null;
    if (total == null && Number.isSafeInteger(order.total_centavos)) total = order.total_centavos / 100;
    if (total == null) total = deriveOrderTotal(order);
    if (total == null) throw new Error(`Nao foi possivel reconstruir o total do pedido ${order._id}.`);
    update.total = total;
    if (!Number.isSafeInteger(order.total_centavos)) {
      update.total_centavos = reaisToCents(total);
    }

    const shipping = isFiniteMoney(order.frete)
      ? order.frete
      : (Number.isSafeInteger(order.frete_centavos) ? order.frete_centavos / 100 : 0);
    update.frete = shipping;
    if (!Number.isSafeInteger(order.frete_centavos)) update.frete_centavos = reaisToCents(shipping);

    if (!order.trackingTokenHash) {
      const token = crypto.randomBytes(32).toString('base64url');
      update.trackingTokenPrefix = token.slice(0, 12);
      update.trackingTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    }

    update.itens = (order.itens || []).map((item: Record<string, any>) => {
      const quantity = Number(item.quantidade) || 1;
      let unitPrice = isFiniteMoney(item.preco_unitario) ? item.preco_unitario : null;
      let subtotal = isFiniteMoney(item.subtotal) ? item.subtotal : null;
      if (unitPrice == null && Number.isSafeInteger(item.preco_unitario_centavos)) unitPrice = item.preco_unitario_centavos / 100;
      if (subtotal == null && Number.isSafeInteger(item.subtotal_centavos)) subtotal = item.subtotal_centavos / 100;
      if (unitPrice == null && subtotal != null) unitPrice = subtotal / quantity;
      if (subtotal == null && unitPrice != null) subtotal = unitPrice * quantity;
      if (unitPrice == null || subtotal == null) throw new Error(`Nao foi possivel reconstruir os valores de um item do pedido ${order._id}.`);
      return {
        ...item,
        preco_unitario: unitPrice,
        preco_unitario_centavos: Number.isSafeInteger(item.preco_unitario_centavos) ? item.preco_unitario_centavos : reaisToCents(unitPrice),
        subtotal,
        subtotal_centavos: Number.isSafeInteger(item.subtotal_centavos) ? item.subtotal_centavos : reaisToCents(subtotal),
      };
    });

    await Order.collection.updateOne({ _id: order._id }, { $set: update });
  }

  for (const legacy of await Admin.find({ ativo: { $ne: false } }).lean()) {
    const account = await AdminAccount.findOneAndUpdate(
      { email: legacy.email.toLowerCase() },
      { $setOnInsert: { name: legacy.nome, email: legacy.email.toLowerCase(), passwordHash: legacy.senha }, $set: { active: true } },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    );
    await TenantMembership.updateOne(
      { tenantId, accountId: account._id },
      { $setOnInsert: { role: 'tenant_owner', active: true, acceptedAt: new Date() } },
      { upsert: true },
    );
  }

  const postCounts = Object.fromEntries(await Promise.all(tenantCollections.map(async ({ name, collection }) => [name, await collection.countDocuments({ tenantId })] as const)));
  const remaining = Object.fromEntries(await Promise.all(tenantCollections.map(async ({ name, collection }) => [name, await collection.countDocuments({ tenantId: { $exists: false } })] as const)));
  Object.assign(report, { tenantId: tenantId.toString(), postCounts, remaining, completedAt: new Date().toISOString() });
  if (Object.values(remaining).some((value) => value !== 0)) throw new Error('Backfill incompleto; nenhum dado foi apagado. Consulte o relatorio.');
  console.log(JSON.stringify(report, null, 2));
}

main().finally(() => mongoose.disconnect()).catch((error) => {
  console.error(JSON.stringify({ ...report, error: error.message }, null, 2));
  process.exitCode = 1;
});
