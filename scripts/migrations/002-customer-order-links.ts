import 'dotenv/config';
import mongoose from 'mongoose';
import Tenant from '../../server/models/Tenant.js';
import User from '../../src/models/User.js';
import Order from '../../src/models/Order.js';
import { normalizePhone } from '../../server/domain/phone.js';

const apply = process.argv.includes('--apply');
const slug = process.env.CUSTOMER_MIGRATION_TENANT_SLUG || process.env.DEFAULT_TENANT_SLUG || 'loja-piloto';
if (!process.env.MONGO_URI) throw new Error('MONGO_URI nao configurada.');
if (!process.env.MIGRATION_DB_NAME) throw new Error('MIGRATION_DB_NAME nao configurada.');
if (apply && process.env.CONFIRM_CUSTOMER_ORDER_MIGRATION !== slug) throw new Error(`Para aplicar, defina CONFIRM_CUSTOMER_ORDER_MIGRATION=${slug}.`);

async function main() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MIGRATION_DB_NAME, serverSelectionTimeoutMS: 8_000, autoIndex: false });
  const tenant = await Tenant.findOne({ slug }).select('_id slug').lean();
  if (!tenant) throw new Error(`Tenant ${slug} nao encontrado.`);
  const users = await User.find({ tenantId: tenant._id }).select('_id telefone normalizedPhone').lean();
  const byPhone = new Map<string, string[]>();
  for (const user of users) {
    let phone = user.normalizedPhone;
    try { phone ||= normalizePhone(user.telefone); } catch { continue; }
    byPhone.set(phone, [...(byPhone.get(phone) || []), String(user._id)]);
  }
  const candidates = await Order.find({ tenantId: tenant._id, usuarioId: { $exists: false } }).select('_id cliente.telefone').lean();
  const updates: Array<{ orderId: string; userId: string }> = [];
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  for (const order of candidates) {
    let phone: string;
    try { phone = normalizePhone(order.cliente?.telefone || ''); } catch { unmatched.push(String(order._id)); continue; }
    const matches = byPhone.get(phone) || [];
    if (matches.length === 1) updates.push({ orderId: String(order._id), userId: matches[0] });
    else if (matches.length > 1) ambiguous.push(String(order._id));
    else unmatched.push(String(order._id));
  }
  const report = {
    mode: apply ? 'apply' : 'dry-run', tenant: slug, scanned: candidates.length,
    linkable: updates.length, migrated: apply ? updates.length : 0,
    ignored: unmatched.length, ambiguousCount: ambiguous.length, unmatched, ambiguous,
  };
  if (apply && ambiguous.length) throw new Error(`Migracao interrompida: ${ambiguous.length} pedidos possuem clientes ambiguos.`);
  if (apply && updates.length) {
    await Order.collection.bulkWrite(updates.map(({ orderId, userId }) => ({ updateOne: { filter: { _id: new mongoose.Types.ObjectId(orderId), tenantId: tenant._id, usuarioId: { $exists: false } }, update: { $set: { usuarioId: new mongoose.Types.ObjectId(userId) } } } })));
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
