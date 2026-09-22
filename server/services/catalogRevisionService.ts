import mongoose from 'mongoose';
import CatalogRevision from '../models/CatalogRevision.js';
import { HttpError } from '../middleware/errors.js';

export async function getCatalogRevision(tenantId: mongoose.Types.ObjectId, session?: mongoose.ClientSession): Promise<number> {
  const row = await CatalogRevision.findOne({ tenantId }).session(session || null).lean();
  return Number(row?.revision || 0);
}

export async function ensureCatalogRevision(tenantId: mongoose.Types.ObjectId): Promise<number> {
  const row = await CatalogRevision.findOneAndUpdate(
    { tenantId },
    { $setOnInsert: { revision: 0 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
  return Number(row?.revision || 0);
}

export async function bumpCatalogRevision(tenantId: mongoose.Types.ObjectId, session: mongoose.ClientSession): Promise<number> {
  const row = await CatalogRevision.findOneAndUpdate(
    { tenantId },
    { $inc: { revision: 1 } },
    { upsert: true, returnDocument: 'after', session, setDefaultsOnInsert: true },
  ).lean();
  return Number(row?.revision || 0);
}

export async function compareAndBumpCatalogRevision(
  tenantId: mongoose.Types.ObjectId,
  expectedRevision: number,
  session: mongoose.ClientSession,
): Promise<number> {
  const row = await CatalogRevision.findOneAndUpdate(
    { tenantId, revision: expectedRevision },
    { $inc: { revision: 1 } },
    { returnDocument: 'after', session },
  ).lean();
  if (!row) throw new HttpError(409, 'O catálogo mudou desde a última revisão. Revise as duplicidades novamente.', 'CATALOG_CHANGED');
  return Number(row.revision);
}

export async function withCatalogMutation<T>(
  tenantId: mongoose.Types.ObjectId,
  work: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      await bumpCatalogRevision(tenantId, session);
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
