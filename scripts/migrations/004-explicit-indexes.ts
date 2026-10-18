import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import mongoose from 'mongoose';
import { planIndexes, type IndexInventory } from './indexPlan.js';

// Like the existing migrations: explicit database, dry-run by default, never
// called by HTTP or startup. Load schemas without allowing Mongoose DDL.
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const apply = process.argv.includes('--apply') && !process.argv.includes('--dry-run');
const selectedDrops = process.argv.filter((arg) => arg.startsWith('--drop-index=')).map((arg) => arg.slice('--drop-index='.length));

async function main() {
  const databaseName = process.env.MIGRATION_DB_NAME;
  if (!process.env.MONGO_URI || !databaseName) throw new Error('Defina MONGO_URI e MIGRATION_DB_NAME explicitamente.');
  if (apply && process.env.CONFIRM_INDEX_MIGRATION !== databaseName) throw new Error('CONFIRM_INDEX_MIGRATION deve corresponder a MIGRATION_DB_NAME.');
  for (const directory of [new URL('../../src/models/', import.meta.url), new URL('../../server/models/', import.meta.url)]) {
    for (const file of (await readdir(directory)).sort()) {
      if (/\.(ts|js)$/.test(file) && !file.endsWith('.d.ts')) await import(new URL(file, directory).href);
    }
  }
  await mongoose.connect(process.env.MONGO_URI, { dbName: databaseName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 8_000 });
  const db = mongoose.connection.db!;
  const collections = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name));
  const inventory: IndexInventory[] = [];
  for (const model of Object.values(mongoose.models).sort((a, b) => a.collection.name.localeCompare(b.collection.name))) {
    inventory.push({ collection: model.collection.name, existing: collections.has(model.collection.name) ? await db.collection(model.collection.name).indexes() : [],
      desired: model.schema.indexes().map(([key, { unique, ...options }]) => ({
        key: Object.fromEntries(Object.entries(key).map(([field, direction]) => [field,
          direction === 'asc' || direction === 'ascending' ? 1 : direction === 'desc' || direction === 'descending' ? -1 : direction])),
        options: { ...options, ...(unique === undefined ? {} : { unique: Array.isArray(unique) ? unique[0] : unique }) },
      })) });
  }
  const plan = planIndexes(inventory, selectedDrops);
  // Count issues only: never print customer values, credentials or connection URI.
  const checks: Array<{ collection: string; issue: string; count: number }> = [];
  for (const { collection, index } of plan.create.filter((entry) => entry.index.options.unique)) {
    if (!collections.has(collection)) continue;
    const keys = Object.keys(index.key);
    const match = index.options.partialFilterExpression || (index.options.sparse ? { $or: keys.map((key) => ({ [key]: { $exists: true } })) } : {});
    const result = await db.collection(collection).aggregate([
      { $match: match }, { $group: { _id: Object.fromEntries(keys.map((key, i) => [`k${i}`, { $ifNull: [`$${key}`, null] }])), count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }, { $count: 'count' },
    ], { collation: index.options.collation }).toArray();
    if (result[0]?.count) checks.push({ collection, issue: 'duplicate-unique-key-groups', count: result[0].count });
  }
  if (plan.drop.some((entry) => entry.collection === 'users')) {
    const count = await db.collection('users').countDocuments({ $or: [
      { tenantId: { $not: { $type: 'objectId' } } },
      { telefone: { $not: /^ANON-/ }, normalizedPhone: { $not: { $type: 'string' } } },
    ] });
    if (count) checks.push({ collection: 'users', issue: 'tenant-phone-backfill-required', count });
  }
  console.log(JSON.stringify({ databaseName, mode: apply ? 'apply' : 'dry-run', ...plan, checks }, null, 2));
  if (plan.blockers.length || checks.length) throw new Error('Preflight bloqueado. Revise definicoes e contagens no relatorio.');
  if (!apply) return;
  if (process.env.APPROVED_INDEX_PLAN !== plan.fingerprint) throw new Error('APPROVED_INDEX_PLAN deve ser o fingerprint do dry-run revisado.');
  // Build every replacement before dropping any historical constraint. Build
  // failures leave old uniqueness intact; unknown indexes are always preserved.
  for (const { collection, index } of plan.create) await db.collection(collection).createIndex(index.key, index.options);
  for (const { collection, index } of plan.drop) await db.collection(collection).dropIndex(index.name!);
  console.log(JSON.stringify({ completed: true }));
}

main().catch((error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'PREFLIGHT_OR_APPROVAL';
  console.error(`Migracao de indices interrompida (${code}); revise plano/aprovacao. Nenhum dado foi excluido.`);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
