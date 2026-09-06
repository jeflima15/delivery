import 'dotenv/config';
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
import Subscription from '../../server/models/Subscription.js';
import Invoice from '../../server/models/Invoice.js';
import SlugHistory from '../../server/models/SlugHistory.js';
import AuthSession from '../../server/models/AuthSession.js';
import CustomerAuthFlow from '../../server/models/CustomerAuthFlow.js';
import IdempotencyRecord from '../../server/models/IdempotencyRecord.js';
import OrderSequence from '../../server/models/OrderSequence.js';
import PasswordResetChallenge from '../../server/models/PasswordResetChallenge.js';
import ShippingQuote from '../../server/models/ShippingQuote.js';
import AdminInvitation from '../../server/models/AdminInvitation.js';
import AdminPasswordReset from '../../server/models/AdminPasswordReset.js';

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGO_URI não configurada no ambiente.');
    process.exit(1);
  }

  console.log('🔄 Conectando ao MongoDB para faxina de dados órfãos...');
  await mongoose.connect(uri);

  const activeTenants = await Tenant.find().select('_id slug').lean();
  const validTenantIds = activeTenants.map((t) => t._id as mongoose.Types.ObjectId);
  const validSlugs = new Set(activeTenants.map((t) => t.slug.toLowerCase()));

  console.log(`📌 Encontradas ${activeTenants.length} lojas ativas no banco:`, activeTenants.map(t => t.slug));

  const orphanFilter = { tenantId: { $nin: validTenantIds, $exists: true } };
  const superAdmins = await AdminAccount.find({ platformRole: 'platform_super_admin' }).select('_id').lean();
  const superAdminAccountIds = superAdmins.map((a) => a._id);
  await AuthSession.updateMany({ accountId: { $in: superAdminAccountIds } }, { $set: { tenantId: null } });

  const [
    users,
    storeSettings,
    products,
    categories,
    orders,
    subscriptions,
    invoices,
    homeBlocks,
    coupons,
    auditLogs,
    slugHistoriesByTenant,
    authSessions,
    customerAuthFlows,
    idempotencyRecords,
    orderSequences,
    passwordResetChallenges,
    shippingQuotes,
    memberships,
    invitations,
    resets,
  ] = await Promise.all([
    User.deleteMany(orphanFilter),
    StoreSettings.deleteMany(orphanFilter),
    Product.deleteMany(orphanFilter),
    Category.deleteMany(orphanFilter),
    Order.deleteMany(orphanFilter),
    Subscription.deleteMany(orphanFilter),
    Invoice.deleteMany(orphanFilter),
    HomeBlock.deleteMany(orphanFilter),
    Coupon.deleteMany(orphanFilter),
    AuditLog.deleteMany(orphanFilter),
    SlugHistory.deleteMany(orphanFilter),
    AuthSession.deleteMany({ ...orphanFilter, accountId: { $nin: superAdminAccountIds } }),
    CustomerAuthFlow.deleteMany(orphanFilter),
    IdempotencyRecord.deleteMany(orphanFilter),
    OrderSequence.deleteMany(orphanFilter),
    PasswordResetChallenge.deleteMany(orphanFilter),
    ShippingQuote.deleteMany(orphanFilter),
    TenantMembership.deleteMany(orphanFilter),
    AdminInvitation.deleteMany(orphanFilter),
    AdminPasswordReset.deleteMany(orphanFilter),
  ]);

  const slugHistoriesBySlug = await SlugHistory.deleteMany({ slug: { $nin: Array.from(validSlugs) } });

  const allAccounts = await AdminAccount.find({ platformRole: { $ne: 'platform_super_admin' } }).select('_id email').lean();
  let deletedAccountsCount = 0;
  for (const acc of allAccounts) {
    const hasMembership = await TenantMembership.exists({ accountId: acc._id });
    if (!hasMembership) {
      await AdminAccount.deleteOne({ _id: acc._id });
      await AdminInvitation.deleteMany({ email: acc.email });
      await AdminPasswordReset.deleteMany({ accountId: acc._id });
      deletedAccountsCount++;
    }
  }

  const summary = {
    users: users.deletedCount,
    storeSettings: storeSettings.deletedCount,
    products: products.deletedCount,
    categories: categories.deletedCount,
    orders: orders.deletedCount,
    subscriptions: subscriptions.deletedCount,
    invoices: invoices.deletedCount,
    homeBlocks: homeBlocks.deletedCount,
    coupons: coupons.deletedCount,
    auditLogs: auditLogs.deletedCount,
    slugHistoriesByTenant: slugHistoriesByTenant.deletedCount,
    slugHistoriesBySlug: slugHistoriesBySlug.deletedCount,
    authSessions: authSessions.deletedCount,
    customerAuthFlows: customerAuthFlows.deletedCount,
    idempotencyRecords: idempotencyRecords.deletedCount,
    orderSequences: orderSequences.deletedCount,
    passwordResetChallenges: passwordResetChallenges.deletedCount,
    shippingQuotes: shippingQuotes.deletedCount,
    memberships: memberships.deletedCount,
    invitations: invitations.deletedCount,
    resets: resets.deletedCount,
    deletedAccountsCount,
  };

  const total = Object.values(summary).reduce((a, b) => a + b, 0);

  console.log('✅ Faxina concluída com sucesso!');
  console.log(`🧹 Total de registros órfãos apagados: ${total}`);
  console.table(summary);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌ Erro na faxina de dados órfãos:', err);
  process.exit(1);
});
