import crypto from 'node:crypto';
import type mongoose from 'mongoose';
import CatalogImport from '../models/CatalogImport.js';
import CatalogImportAnalysis from '../models/CatalogImportAnalysis.js';
import CatalogImportJob from '../models/CatalogImportJob.js';
import { analyzeMenuDomainNativeWithGemini } from './catalogLabUnifiedService.js';
import { cleanupCatalogImportImages, createCatalogImportSourceReadUrl, deletePrivateStorageFile, downloadPrivateStorageFile } from './storageService.js';
import { computeImportReadiness, hashValue, reconcileCatalogImport } from './catalogImportReviewService.js';
import { HttpError } from '../middleware/errors.js';

const retryableCodes = new Set(['GEMINI_TIMEOUT', 'GEMINI_SERVICE_ERROR', 'GEMINI_EMPTY_RESPONSE', 'INVALID_GEMINI_RESPONSE', 'STORAGE_DOWNLOAD_FAILED', 'STORAGE_SIGN_FAILED']);

function safeJobError(error: unknown) {
  const code = error instanceof HttpError ? error.code : 'CATALOG_IMPORT_FAILED';
  const retryable = retryableCodes.has(code) || !(error instanceof HttpError);
  const message = retryable
    ? 'Não foi possível concluir a análise agora. Uma nova tentativa pode ser realizada.'
    : error instanceof HttpError ? error.message : 'Não foi possível analisar este arquivo.';
  return { code, message, retryable };
}

export async function enqueueCatalogImportAnalysis(importDoc: any, manualRetry = false) {
  if (!importDoc.source || importDoc.source.uploadState !== 'verified') throw new HttpError(409, 'Conclua o upload antes de analisar.', 'SOURCE_NOT_READY');
  if (['analyzing', 'queued'].includes(importDoc.status) && !manualRetry) {
    return CatalogImportJob.findOne({ importId: importDoc._id, type: 'analyze', generation: importDoc.analysisGeneration }).lean();
  }
  const generation = Number(importDoc.analysisGeneration || 0) + 1;
  await CatalogImport.updateOne(
    { _id: importDoc._id, tenantId: importDoc.tenantId, revision: importDoc.revision },
    { $set: { status: 'queued', analysisGeneration: generation, lastError: null }, $inc: { revision: 1 } },
  );
  return CatalogImportJob.findOneAndUpdate(
    { importId: importDoc._id, type: 'analyze', generation },
    { $setOnInsert: { tenantId: importDoc.tenantId, state: 'pending', attempts: 0, maxAttempts: 3, nextAttemptAt: new Date(), leaseUntil: new Date(0), expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60_000) } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
}

async function claimJob(filter: Record<string, unknown> = {}) {
  const leaseToken = crypto.randomUUID();
  const job = await CatalogImportJob.findOneAndUpdate(
    { ...filter, type: 'analyze', nextAttemptAt: { $lte: new Date() }, leaseUntil: { $lte: new Date() }, state: { $in: ['pending', 'leased'] }, $expr: { $lt: ['$attempts', '$maxAttempts'] } },
    { $set: { state: 'leased', leaseToken, leaseUntil: new Date(Date.now() + 5 * 60_000) }, $inc: { attempts: 1 } },
    { sort: { nextAttemptAt: 1 }, returnDocument: 'after' },
  ).lean();
  return job ? { job, leaseToken } : null;
}

export async function processCatalogImportJob(importId?: mongoose.Types.ObjectId | string) {
  const claimed = await claimJob(importId ? { importId } : {});
  if (!claimed) return { processed: false };
  const { job, leaseToken } = claimed;
  const importDoc = await CatalogImport.findOne({ _id: job.importId, tenantId: job.tenantId, analysisGeneration: job.generation });
  if (!importDoc || ['cancelled', 'completed', 'expired'].includes(importDoc.status)) {
    await CatalogImportJob.updateOne({ _id: job._id, leaseToken }, { $set: { state: 'failed', lastError: { code: 'STALE_JOB', message: 'Job obsoleto.' } } });
    return { processed: true, skipped: true };
  }
  await CatalogImport.updateOne({ _id: importDoc._id, tenantId: importDoc.tenantId, analysisGeneration: job.generation }, { $set: { status: 'analyzing' } });
  try {
    let result;
    if (importDoc.source.mimeType === 'application/pdf') {
      const signedUrl = await createCatalogImportSourceReadUrl({ tenantId: importDoc.tenantId, importId: String(importDoc._id), bucket: importDoc.source.bucket, path: importDoc.source.path, expiresInSeconds: 10 * 60 });
      result = await analyzeMenuDomainNativeWithGemini({
        sourceType: 'pdf', signedUrl, mimeType: 'application/pdf', fileSize: importDoc.source.verifiedSize,
      });
    } else {
      const buffer = await downloadPrivateStorageFile(importDoc.source.bucket, importDoc.source.path);
      result = await analyzeMenuDomainNativeWithGemini({
        sourceType: 'image', buffer, mimeType: importDoc.source.mimeType, fileSize: buffer.length,
      });
    }
    if (!result.data.isMenu) throw new HttpError(422, 'O arquivo não parece conter um cardápio.', 'NOT_A_MENU');
    const analysisHash = hashValue(result.data);
    const analysis = await CatalogImportAnalysis.findOneAndUpdate(
      { tenantId: importDoc.tenantId, importId: importDoc._id, generation: job.generation },
      { $setOnInsert: {
        model: result.model, seed: result.seed, usage: result.usage, executionTimeMs: result.executionTimeMs,
        inferenceTimeMs: result.inferenceTimeMs, data: result.data, analysisHash,
      } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    const decisions = { modeling: {}, duplicates: {}, acknowledgedWarnings: [], resolvedIssueKeys: [], excludedEntityKeys: [], imageSelections: {}, imageSourceKeys: {} };
    const persistedData: any = analysis.data;
    const reconciliation = await reconcileCatalogImport(importDoc.tenantId, persistedData.importPlan, decisions);
    const readiness = computeImportReadiness(persistedData, persistedData.importPlan, decisions, reconciliation);
    const applied = await CatalogImport.findOneAndUpdate(
      { _id: importDoc._id, tenantId: importDoc.tenantId, analysisGeneration: job.generation, status: 'analyzing' },
      { $set: { status: 'reviewing', analysisId: analysis._id, workingPlan: persistedData.importPlan, decisions, reconciliation, readiness, lastError: null }, $inc: { revision: 1 } },
      { returnDocument: 'after' },
    ).lean();
    await CatalogImportJob.updateOne({ _id: job._id, leaseToken }, { $set: { state: 'succeeded', leaseUntil: new Date(0), lastError: null } });
    return { processed: true, completed: Boolean(applied), import: applied };
  } catch (error) {
    const safe = safeJobError(error);
    const retry = safe.retryable && Number(job.attempts) < Number(job.maxAttempts);
    await CatalogImportJob.updateOne({ _id: job._id, leaseToken }, {
      $set: {
        state: retry ? 'pending' : 'failed',
        leaseToken: null,
        leaseUntil: new Date(0),
        nextAttemptAt: new Date(Date.now() + Math.min(10 * 60_000, 30_000 * 2 ** Math.max(0, Number(job.attempts) - 1))),
        lastError: { code: safe.code, message: safe.message },
      },
    });
    await CatalogImport.updateOne(
      { _id: importDoc._id, tenantId: importDoc.tenantId, analysisGeneration: job.generation },
      { $set: { status: retry ? 'queued' : 'failed', lastError: safe } },
    );
    if (!retry) throw new HttpError(error instanceof HttpError ? error.status : 502, safe.message, safe.code);
    return { processed: true, retryScheduled: true };
  }
}

export async function processCatalogImportJobs(limit = 2) {
  const exhausted = await CatalogImportJob.find({ state: 'leased', leaseUntil: { $lte: new Date() }, $expr: { $gte: ['$attempts', '$maxAttempts'] } }).limit(20).lean();
  for (const job of exhausted) {
    const lastError = { code: 'JOB_LEASE_EXHAUSTED', message: 'O processamento foi interrompido repetidamente e precisa de uma nova tentativa manual.' };
    await CatalogImportJob.updateOne({ _id: job._id, state: 'leased', leaseUntil: { $lte: new Date() } }, { $set: { state: 'failed', leaseUntil: new Date(0), lastError } });
    if (job.type === 'analyze') await CatalogImport.updateOne(
      { _id: job.importId, tenantId: job.tenantId, analysisGeneration: job.generation, status: { $in: ['queued', 'analyzing'] } },
      { $set: { status: 'failed', lastError: { ...lastError, retryable: true } } },
    );
  }
  const expiredImports = await CatalogImport.find({ expiresAt: { $lte: new Date() }, status: { $nin: ['completed', 'cancelled', 'expired'] } }).limit(20);
  for (const importDoc of expiredImports) {
    importDoc.status = 'expired'; importDoc.revision = Number(importDoc.revision || 0) + 1;
    await importDoc.save();
    await enqueueCatalogImportCleanup(importDoc);
  }
  let processed = 0;
  while (processed < limit) {
    const result = await processCatalogImportJob();
    if (!result.processed) break;
    processed++;
  }
  while (processed < limit) {
    const leaseToken = crypto.randomUUID();
    const job = await CatalogImportJob.findOneAndUpdate(
      { type: 'cleanup', state: { $in: ['pending', 'leased'] }, nextAttemptAt: { $lte: new Date() }, leaseUntil: { $lte: new Date() }, $expr: { $lt: ['$attempts', '$maxAttempts'] } },
      { $set: { state: 'leased', leaseToken, leaseUntil: new Date(Date.now() + 60_000) }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1 }, returnDocument: 'after' },
    ).lean();
    if (!job) break;
    processed++;
    const importDoc = await CatalogImport.findOne({ _id: job.importId, tenantId: job.tenantId }).lean();
    const cleaned = !importDoc || await cleanupCatalogImport(importDoc);
    await CatalogImportJob.updateOne({ _id: job._id, leaseToken }, cleaned
      ? { $set: { state: 'succeeded', leaseUntil: new Date(0) } }
      : { $set: { state: Number(job.attempts) >= Number(job.maxAttempts) ? 'failed' : 'pending', leaseUntil: new Date(0), nextAttemptAt: new Date(Date.now() + 60_000), lastError: { code: 'CLEANUP_FAILED', message: 'Falha temporária ao limpar arquivos.' } } });
  }
  return { processed };
}

export async function enqueueCatalogImportCleanup(importDoc: any) {
  const generation = Math.max(1, Number(importDoc.analysisGeneration || 0));
  return CatalogImportJob.findOneAndUpdate(
    { tenantId: importDoc.tenantId, importId: importDoc._id, type: 'cleanup', generation },
    { $setOnInsert: { state: 'pending', attempts: 0, maxAttempts: 10, nextAttemptAt: new Date(), leaseUntil: new Date(0), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
}

export async function cleanupCatalogImport(importDoc: any) {
  if (importDoc.source?.bucket && importDoc.source?.path && importDoc.source.uploadState !== 'deleted') {
    const removed = await deletePrivateStorageFile(importDoc.source.bucket, importDoc.source.path);
    if (!removed) return false;
  }
  if (importDoc.source?.bucket || Object.keys(importDoc.decisions?.imageSelections || {}).length) {
    const keepUrls = importDoc.status === 'completed'
      ? (importDoc.workingPlan?.products || []).filter((product: any) => {
        const resolution = importDoc.decisions?.duplicates?.[product.key]?.action;
        return !(importDoc.decisions?.excludedEntityKeys || []).includes(product.key) && resolution !== 'skip' && resolution !== 'reuse_existing';
      }).map((product: any) => importDoc.decisions?.imageSelections?.[product.key]).filter((entry: unknown): entry is string => typeof entry === 'string' && Boolean(entry))
      : [];
    if (!await cleanupCatalogImportImages({ tenantId: importDoc.tenantId, importId: importDoc._id, keepUrls })) return false;
  }
  const purgeAt = new Date(Date.now() + 90 * 24 * 60 * 60_000);
  await Promise.all([
    CatalogImport.updateOne({ _id: importDoc._id, tenantId: importDoc.tenantId }, {
      $set: { 'source.uploadState': 'deleted', 'source.deletedAt': new Date(), cleanupState: 'completed', purgeAt },
    }),
    CatalogImportAnalysis.updateMany({ importId: importDoc._id, tenantId: importDoc.tenantId }, { $set: { purgeAt } }),
  ]);
  return true;
}
