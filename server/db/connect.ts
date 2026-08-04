import mongoose from 'mongoose';
import { getEnv } from '../config/env.js';

declare global {
  var __mongooseConnection: Promise<typeof mongoose> | undefined;
  var __databaseMaintenance: Promise<void> | undefined;
}

async function reconcileTenantIndexes(): Promise<void> {
  const database = mongoose.connection.db;
  if (!database) return;
  const collections = await database.listCollections({ name: 'users' }, { nameOnly: true }).toArray();
  if (!collections.length) return;

  const users = database.collection('users');
  const indexes = await users.indexes();
  const obsoleteGlobalIndexes = indexes.filter((index) => {
    if (!index.unique) return false;
    const fields = Object.keys(index.key);
    return fields.length === 1 && ['telefone', 'normalizedPhone'].includes(fields[0]);
  });
  for (const index of obsoleteGlobalIndexes) {
    if (index.name) await users.dropIndex(index.name).catch((error: any) => {
      if (error?.codeName !== 'IndexNotFound') throw error;
    });
  }

  const hasTenantPhoneIndex = indexes.some((index) => index.unique
    && index.key.tenantId === 1
    && index.key.normalizedPhone === 1
    && Object.keys(index.key).length === 2);
  if (!hasTenantPhoneIndex) {
    await users.createIndex(
      { tenantId: 1, normalizedPhone: 1 },
      { unique: true, name: 'tenant_phone_unique', partialFilterExpression: { tenantId: { $exists: true }, normalizedPhone: { $type: 'string' } } },
    );
  }
}

export function connectDatabase(): Promise<typeof mongoose> {
  if (!globalThis.__mongooseConnection) {
    globalThis.__mongooseConnection = mongoose.connect(getEnv().MONGO_URI, {
      serverSelectionTimeoutMS: 8_000,
      connectTimeoutMS: 8_000,
      maxPoolSize: 10,
    }).then(async (connection) => {
      globalThis.__databaseMaintenance ||= reconcileTenantIndexes();
      await globalThis.__databaseMaintenance;
      return connection;
    }).catch((error) => {
      globalThis.__mongooseConnection = undefined;
      globalThis.__databaseMaintenance = undefined;
      throw error;
    });
  }
  return globalThis.__mongooseConnection;
}

export function databaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}
