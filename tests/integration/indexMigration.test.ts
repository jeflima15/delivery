import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../server/db/connect.js';

const execute = promisify(execFile);
let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'index-migration-test', autoIndex: false, autoCreate: false });
});
afterAll(async () => { globalThis.__mongooseConnection = undefined; vi.unstubAllEnvs(); await mongoose.disconnect(); await mongo?.stop(); });

it('conexao real isolada preserva indices globais sem criar colecoes de modelos', async () => {
  const db = mongoose.connection.db!;
  await db.collection('users').createIndex({ telefone: 1 }, { unique: true });
  const beforeIndexes = await db.collection('users').indexes();
  const beforeCollections = await db.listCollections({}, { nameOnly: true }).toArray();
  await mongoose.disconnect();
  vi.stubEnv('MONGO_URI', mongo.getUri('index-migration-test'));
  await connectDatabase();
  expect(await mongoose.connection.db!.collection('users').indexes()).toEqual(beforeIndexes);
  expect(await mongoose.connection.db!.listCollections({}, { nameOnly: true }).toArray()).toEqual(beforeCollections);
});

it('dry-run nao altera indices; apply explicito cria unicidade antes de retirar somente legado selecionado', async () => {
  const db = mongoose.connection.db!;
  const tenantId = new mongoose.Types.ObjectId();
  await db.collection('users').insertOne({ tenantId, normalizedPhone: '+551111111111', telefone: '1111111111' });
  await db.collection('users').createIndex({ telefone: 1 }, { unique: true });
  await db.collection('products').createIndex({ slug: 1 }, { unique: true, name: 'custom_slug' });
  const env = { ...process.env, MONGO_URI: mongo.getUri(), MIGRATION_DB_NAME: db.databaseName };
  const args = ['--import', 'tsx', 'scripts/migrations/004-explicit-indexes.ts', '--drop-index=users:telefone_1'];
  const before = await db.collection('users').indexes();
  const dry = await execute(process.execPath, args, { env });
  const plan = JSON.parse(dry.stdout.slice(dry.stdout.indexOf('{')));
  expect(plan.checks).toEqual([]);
  expect(plan.drop).toHaveLength(1);
  expect(await db.collection('users').indexes()).toEqual(before);
  await execute(process.execPath, [...args, '--apply'], { env: { ...env, CONFIRM_INDEX_MIGRATION: db.databaseName, APPROVED_INDEX_PLAN: plan.fingerprint } });
  const indexes = await db.collection('users').indexes();
  expect(indexes.some((index) => index.name === 'telefone_1')).toBe(false);
  expect(indexes.some((index) => index.key.tenantId === 1 && index.key.normalizedPhone === 1 && index.unique)).toBe(true);
  expect((await db.collection('products').indexes()).some((index) => index.name === 'custom_slug')).toBe(true);
  await expect(db.collection('users').insertOne({ tenantId, normalizedPhone: '+551111111111', telefone: 'other' })).rejects.toMatchObject({ code: 11000 });
  await db.collection('users').insertOne({ tenantId: new mongoose.Types.ObjectId(), normalizedPhone: '+551111111111', telefone: 'other' });
  const repeat = await execute(process.execPath, args.slice(0, -1), { env });
  const nextPlan = JSON.parse(repeat.stdout.slice(repeat.stdout.indexOf('{')));
  expect(nextPlan.create).toEqual([]);
  expect(nextPlan.blockers).toEqual([]);
});
