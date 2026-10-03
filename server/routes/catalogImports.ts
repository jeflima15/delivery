import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import CatalogImport from '../models/CatalogImport.js';
import CatalogImportAnalysis from '../models/CatalogImportAnalysis.js';
import CatalogImportJob from '../models/CatalogImportJob.js';
import { requireCsrf } from '../middleware/csrf.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { securityRateLimit } from '../middleware/rateLimit.js';
import { MAX_CATALOG_IMAGE_SIZE_BYTES, createCatalogImportImageUpload, createCatalogImportSourceReadUrl, createCatalogImportSourceUpload, verifyCatalogImportImage, verifyCatalogImportSource } from '../services/storageService.js';
import { enqueueCatalogImportAnalysis, enqueueCatalogImportCleanup, cleanupCatalogImport, processCatalogImportJob } from '../services/catalogImportJobService.js';
import { applyReviewOperations, buildImportPreview, computeImportReadiness, reconcileCatalogImport } from '../services/catalogImportReviewService.js';
import { confirmCatalogImport } from '../services/catalogImportCommitService.js';
import { audit } from '../services/auditService.js';

const router = Router({ mergeParams: true });
const sourceSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().positive().max(20 * 1024 * 1024),
}).strict();
const preorderPolicySchema = z.object({
  availability: z.enum(['immediate_only', 'scheduled_only', 'both']).nullable(),
  minLeadMinutes: z.number().int().nonnegative().nullable(),
}).strict().nullable();
const placementSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('embedded_product'), productKey: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal('shared'), productKeys: z.array(z.string().min(1).max(100)).max(500), categoryKeys: z.array(z.string().min(1).max(100)).max(500) }).strict(),
]);
const comboSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed'), comboBasePriceCents: z.number().int().nonnegative().nullable(), items: z.array(z.object({ productKey: z.string().min(1).max(100), quantity: z.number().int().positive().max(100) }).strict()).min(1).max(100) }).strict(),
  z.object({ mode: z.literal('stages'), comboBasePriceCents: z.number().int().nonnegative().nullable(), stages: z.array(z.object({
    key: z.string().min(1).max(100), name: z.string().trim().min(1).max(120), order: z.number().int().nonnegative(), stageValueCents: z.number().int().nonnegative(), chargeComplements: z.boolean(),
    options: z.array(z.object({ productKey: z.string().min(1).max(100), extraCents: z.number().int().nonnegative(), order: z.number().int().nonnegative() }).strict()).min(1).max(100),
  }).strict()).min(1).max(30) }).strict(),
]);
const reviewOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('edit_category'), key: z.string().min(1).max(100), patch: z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(500).optional() }).strict() }).strict(),
  z.object({ type: z.literal('edit_product'), key: z.string().min(1).max(100), patch: z.object({ name: z.string().trim().min(1).max(160).optional(), description: z.string().trim().max(2000).nullable().optional(), categoryKey: z.string().max(100).nullable().optional(), basePriceCents: z.number().int().nonnegative().nullable().optional(), exclusiveToCombo: z.boolean().optional(), preorderPolicy: preorderPolicySchema.optional() }).strict() }).strict(),
  z.object({ type: z.literal('edit_combo'), key: z.string().min(1).max(100), combo: comboSchema }).strict(),
  z.object({ type: z.literal('edit_group'), key: z.string().min(1).max(100), patch: z.object({ name: z.string().trim().min(1).max(160).optional(), required: z.boolean().optional(), minimum: z.number().int().nonnegative().optional(), maximum: z.number().int().positive().max(100).optional(), active: z.boolean().optional(), placement: placementSchema.optional() }).strict() }).strict(),
  z.object({ type: z.literal('edit_option'), groupKey: z.string().min(1).max(100), optionKey: z.string().min(1).max(100), patch: z.object({ name: z.string().trim().min(1).max(160).optional(), description: z.string().trim().max(1000).optional(), priceDeltaCents: z.number().int().nonnegative().optional(), maximumPerItem: z.number().int().nonnegative().max(100).optional(), active: z.boolean().optional() }).strict() }).strict(),
  z.object({ type: z.literal('set_excluded'), key: z.string().min(1).max(100), excluded: z.boolean() }).strict(),
  z.object({ type: z.literal('set_duplicate'), key: z.string().min(1).max(100), action: z.enum(['create', 'reuse_existing', 'skip']), existingId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).strict(),
  z.object({ type: z.literal('select_modeling'), key: z.string().min(1).max(100), strategy: z.string().min(1).max(100), expectedRevision: z.number().int().nonnegative().optional() }).strict(),
  z.object({ type: z.literal('resolve_issue'), key: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal('set_image'), productKey: z.string().min(1).max(100), url: z.union([z.literal(''), z.string().url().max(2000)]), sourcePhotoKey: z.string().min(1).max(100).optional() }).strict(),
]);
const reviewSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  operations: z.array(reviewOperationSchema).min(1).max(50),
}).strict();
const imageUploadSchema = z.object({ mimeType: z.literal('image/webp'), size: z.number().int().positive().max(5 * 1024 * 1024) }).strict();
const confirmSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  previewHash: z.string().regex(/^[a-f\d]{64}$/i),
  publishMode: z.enum(['review_first', 'publish_now']).default('review_first'),
}).strict();

function assertId(value: string) {
  if (!mongoose.isValidObjectId(value)) throw new HttpError(404, 'Importação não encontrada.', 'NOT_FOUND');
}

async function loadImport(tenantId: mongoose.Types.ObjectId, id: string) {
  assertId(id);
  const item = await CatalogImport.findOne({ _id: id, tenantId, hiddenAt: null });
  if (!item) throw new HttpError(404, 'Importação não encontrada.', 'NOT_FOUND');
  return item;
}

async function importDto(item: any, includeAnalysis = true) {
  const analysis = includeAnalysis && item.analysisId
    ? await CatalogImportAnalysis.findOne({ _id: item.analysisId, importId: item._id, tenantId: item.tenantId }).select('-__v').lean()
    : null;
  return {
    id: String(item._id), status: item.status, revision: Number(item.revision || 0), analysisGeneration: Number(item.analysisGeneration || 0),
    source: item.source ? { originalName: item.source.originalName, mimeType: item.source.mimeType, declaredSize: item.source.declaredSize, verifiedSize: item.source.verifiedSize, uploadState: item.source.uploadState, uploadedAt: item.source.uploadedAt } : null,
    workingPlan: item.workingPlan || null,
    decisions: item.decisions || {}, reconciliation: item.reconciliation || {}, readiness: item.readiness || {}, confirmation: item.confirmation || {}, lastError: item.lastError || null,
    analysis: analysis ? { model: analysis.model, generation: analysis.generation, usage: analysis.usage, executionTimeMs: analysis.executionTimeMs, inferenceTimeMs: analysis.inferenceTimeMs, data: analysis.data, analysisHash: analysis.analysisHash } : null,
    createdAt: item.createdAt, updatedAt: item.updatedAt, expiresAt: item.expiresAt,
  };
}

router.use(requirePermission('catalog:write'));

router.post('/', requireCsrf, asyncRoute(async (req, res) => {
  const active = await CatalogImport.countDocuments({ tenantId: req.tenant!._id, createdBy: req.auth!.accountId, status: { $nin: ['completed', 'cancelled', 'expired'] } });
  if (active >= 5) throw new HttpError(429, 'Finalize ou cancele uma importação anterior antes de criar outra.', 'TOO_MANY_ACTIVE_IMPORTS');
  const item = await CatalogImport.create({
    tenantId: req.tenant!._id, createdBy: req.auth!.accountId, updatedBy: req.auth!.accountId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
  });
  await audit(req, { action: 'CATALOG_IMPORT_CREATED', targetType: 'CatalogImport', targetId: String(item._id) });
  res.status(201).json({ success: true, import: await importDto(item, false) });
}));

router.get('/', asyncRoute(async (req, res) => {
  const items = await CatalogImport.find({ tenantId: req.tenant!._id, hiddenAt: null }).sort({ updatedAt: -1 }).limit(20).lean();
  res.json({ success: true, limits: { image: MAX_CATALOG_IMAGE_SIZE_BYTES, pdf: 20 * 1024 * 1024 }, items: await Promise.all(items.map((item) => importDto(item, false))) });
}));

router.delete('/history', requireCsrf, asyncRoute(async (req, res) => {
  const terminalStatuses = ['completed', 'failed', 'cancelled', 'expired'];
  const items = await CatalogImport.find({
    tenantId: req.tenant!._id,
    hiddenAt: null,
    status: { $in: terminalStatuses },
  }).limit(100);
  if (items.length === 0) return res.json({ success: true, cleared: 0 });

  const hiddenAt = new Date();
  const ids = items.map((item) => item._id);
  await CatalogImport.updateMany(
    { _id: { $in: ids }, tenantId: req.tenant!._id, status: { $in: terminalStatuses } },
    { $set: { hiddenAt, updatedBy: req.auth!.accountId } },
  );
  for (const item of items) {
    await enqueueCatalogImportCleanup(item);
    await cleanupCatalogImport(item);
  }
  await audit(req, {
    action: 'CATALOG_IMPORT_HISTORY_CLEARED',
    targetType: 'CatalogImport',
    targetId: String(req.tenant!._id),
    after: { count: items.length },
  });
  res.json({ success: true, cleared: items.length });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const item = await loadImport(req.tenant!._id, req.params.id);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, import: await importDto(item) });
}));

router.post('/:id/source/sign', securityRateLimit({ namespace: 'catalog-import-source', limit: 10, windowMs: 60_000 }), requireCsrf, validateBody(sourceSchema), asyncRoute(async (req, res) => {
  const item = await loadImport(req.tenant!._id, req.params.id);
  if (item.status !== 'awaiting_upload') throw new HttpError(409, 'Esta importação já possui um arquivo.', 'SOURCE_ALREADY_SET');
  const upload = await createCatalogImportSourceUpload({ tenantId: req.tenant!._id, importId: String(item._id), mimeType: req.body.mimeType, size: req.body.size });
  const reserved = await CatalogImport.findOneAndUpdate(
    { _id: item._id, tenantId: item.tenantId, status: 'awaiting_upload', revision: item.revision },
    { $set: { source: { originalName: req.body.originalName, mimeType: req.body.mimeType, declaredSize: req.body.size, bucket: upload.bucket, path: upload.path, uploadState: 'pending' }, updatedBy: req.auth!.accountId }, $inc: { revision: 1 } },
    { returnDocument: 'after' },
  );
  if (!reserved) throw new HttpError(409, 'Outro upload já foi iniciado para esta importação.', 'SOURCE_ALREADY_SET');
  res.status(201).json({ success: true, upload, revision: reserved.revision });
}));

router.post('/:id/source/complete', requireCsrf, asyncRoute(async (req, res) => {
  const item = await loadImport(req.tenant!._id, req.params.id);
  if (!item.source?.bucket || !item.source?.path || !item.source?.mimeType) throw new HttpError(409, 'Solicite o upload antes de concluí-lo.', 'SOURCE_NOT_SIGNED');
  const verified = await verifyCatalogImportSource({ tenantId: req.tenant!._id, importId: String(item._id), bucket: item.source.bucket, path: item.source.path, mimeType: item.source.mimeType, declaredSize: item.source.declaredSize });
  const completed = await CatalogImport.findOneAndUpdate(
    { _id: item._id, tenantId: item.tenantId, revision: item.revision, 'source.uploadState': 'pending' },
    { $set: { 'source.verifiedSize': verified.verifiedSize, 'source.sha256': verified.sha256, 'source.uploadState': 'verified', 'source.uploadedAt': new Date(), updatedBy: req.auth!.accountId }, $inc: { revision: 1 } },
    { returnDocument: 'after' },
  );
  if (!completed) throw new HttpError(409, 'O upload foi concluído em outra tela.', 'REVISION_CONFLICT');
  res.json({ success: true, import: await importDto(completed, false) });
}));

router.get('/:id/source/read-url', asyncRoute(async (req, res) => {
  const item = await loadImport(req.tenant!._id, req.params.id);
  if (!item.source?.bucket || !item.source?.path || item.source.uploadState !== 'verified') throw new HttpError(404, 'Arquivo não encontrado.', 'NOT_FOUND');
  const url = await createCatalogImportSourceReadUrl({ tenantId: req.tenant!._id, importId: String(item._id), bucket: item.source.bucket, path: item.source.path });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, url });
}));

router.post('/:id/images/sign', requireCsrf, validateBody(imageUploadSchema), asyncRoute(async (req, res) => {
  const item = await loadImport(req.tenant!._id, req.params.id);
  if (item.status !== 'reviewing') throw new HttpError(409, 'A importação não está em revisão.', 'IMPORT_NOT_REVIEWABLE');
  const upload = await createCatalogImportImageUpload({ tenantId: req.tenant!._id, importId: String(item._id), size: req.body.size });
  res.status(201).json({ success: true, upload });
}));

router.post('/:id/analyze', securityRateLimit({ namespace: 'catalog-import-analyze', limit: 3, windowMs: 60_000 }), requireCsrf, asyncRoute(async (req, res) => {
  const item = await loadImport(req.tenant!._id, req.params.id);
  await enqueueCatalogImportAnalysis(item, item.status === 'failed');
  const result = await processCatalogImportJob(String(item._id));
  const refreshed = await loadImport(req.tenant!._id, req.params.id);
  res.status(refreshed.status === 'reviewing' ? 200 : 202).json({ success: true, processing: result, import: await importDto(refreshed) });
}));

router.patch('/:id/review', requireCsrf, validateBody(reviewSchema), asyncRoute(async (req, res) => {
  const item = await loadImport(req.tenant!._id, req.params.id);
  if (item.status !== 'reviewing') throw new HttpError(409, 'A importação não está em revisão.', 'IMPORT_NOT_REVIEWABLE');
  if (Number(item.revision) !== req.body.expectedRevision) throw new HttpError(409, 'O rascunho mudou em outra tela.', 'REVISION_CONFLICT');
  const analysis = await CatalogImportAnalysis.findOne({ _id: item.analysisId, importId: item._id, tenantId: item.tenantId }).lean();
  if (!analysis) throw new HttpError(409, 'A análise original não está disponível.', 'ANALYSIS_NOT_FOUND');
  for (const operation of req.body.operations) {
    if (operation.type === 'set_image' && operation.url) await verifyCatalogImportImage({ tenantId: String(item.tenantId), importId: String(item._id), publicUrl: operation.url });
    if (operation.type === 'set_image' && operation.sourcePhotoKey) {
      const sourcePhoto = analysis.data?.sourceEvidence?.photos?.find((photo: any) => photo.photoKey === operation.sourcePhotoKey);
      if (!sourcePhoto || sourcePhoto.photoRelation === 'none') throw new HttpError(400, 'A foto escolhida não pertence à análise deste cardápio.', 'INVALID_SOURCE_PHOTO');
    }
    if (operation.type === 'set_duplicate') {
      const duplicate = (item.reconciliation?.duplicates || []).find((entry: any) => entry.entityKey === operation.key);
      if (!duplicate) throw new HttpError(400, 'A duplicidade informada não existe mais.', 'INVALID_DUPLICATE_RESOLUTION');
      if (operation.action === 'reuse_existing' && !duplicate.candidates.some((candidate: any) => candidate.id === operation.existingId)) {
        throw new HttpError(400, 'Escolha um dos itens existentes apresentados na revisão.', 'INVALID_DUPLICATE_RESOLUTION');
      }
    }
  }
  const changed = applyReviewOperations(item.workingPlan, analysis.data, item.decisions, req.body.operations);
  const reconciliation = await reconcileCatalogImport(item.tenantId, changed.plan, changed.decisions);
  const readiness = computeImportReadiness(analysis.data, changed.plan, changed.decisions, reconciliation);
  const updated = await CatalogImport.findOneAndUpdate(
    { _id: item._id, tenantId: item.tenantId, revision: req.body.expectedRevision, status: 'reviewing' },
    { $set: { workingPlan: changed.plan, decisions: changed.decisions, reconciliation, readiness, updatedBy: req.auth!.accountId }, $inc: { revision: 1 } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) throw new HttpError(409, 'O rascunho mudou durante o salvamento.', 'REVISION_CONFLICT');
  res.json({ success: true, import: await importDto(updated) });
}));

router.post('/:id/reconcile', requireCsrf, asyncRoute(async (req, res) => {
  const item = await loadImport(req.tenant!._id, req.params.id);
  const analysis = await CatalogImportAnalysis.findOne({ _id: item.analysisId, importId: item._id, tenantId: item.tenantId }).lean();
  if (!analysis || !item.workingPlan) throw new HttpError(409, 'A análise ainda não está pronta.', 'ANALYSIS_NOT_FOUND');
  const reconciliation = await reconcileCatalogImport(item.tenantId, item.workingPlan, item.decisions);
  const readiness = computeImportReadiness(analysis.data, item.workingPlan, item.decisions, reconciliation);
  const updated = await CatalogImport.findOneAndUpdate(
    { _id: item._id, tenantId: item.tenantId, revision: item.revision, status: 'reviewing' },
    { $set: { reconciliation, readiness, updatedBy: req.auth!.accountId }, $inc: { revision: 1 } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new HttpError(409, 'O rascunho mudou durante a reconciliação.', 'REVISION_CONFLICT');
  res.json({ success: true, import: await importDto(updated) });
}));

router.get('/:id/preview', asyncRoute(async (req, res) => {
  const item = await loadImport(req.tenant!._id, req.params.id);
  if (!item.readiness?.canConfirm) throw new HttpError(409, 'Resolva as pendências antes de visualizar a confirmação.', 'IMPORT_HAS_BLOCKERS', item.readiness);
  const result = buildImportPreview(item.toObject());
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, ...result });
}));

router.post('/:id/confirm', requireCsrf, validateBody(confirmSchema), asyncRoute(async (req, res) => {
  assertId(req.params.id);
  const idempotencyKey = req.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) throw new HttpError(400, 'Chave de idempotência inválida.', 'IDEMPOTENCY_KEY_REQUIRED');
  const result = await confirmCatalogImport(req, req.params.id, { ...req.body, idempotencyKey });
  res.status(201).json(result);
}));

router.post('/:id/cancel', requireCsrf, asyncRoute(async (req, res) => {
  const item = await loadImport(req.tenant!._id, req.params.id);
  if (item.status === 'completed') throw new HttpError(409, 'Uma importação concluída não pode ser cancelada.', 'IMPORT_COMPLETED');
  const cancelled = await CatalogImport.findOneAndUpdate(
    { _id: item._id, tenantId: item.tenantId, revision: item.revision, status: { $nin: ['completed', 'confirming', 'cancelled'] } },
    { $set: { status: 'cancelled', updatedBy: req.auth!.accountId }, $inc: { revision: 1 } },
    { returnDocument: 'after' },
  );
  if (!cancelled) throw new HttpError(409, 'A importação mudou enquanto era cancelada.', 'REVISION_CONFLICT');
  await CatalogImportJob.updateMany({ importId: cancelled._id, tenantId: cancelled.tenantId, state: { $in: ['pending', 'leased'] } }, { $set: { state: 'failed', lastError: { code: 'CANCELLED', message: 'Importação cancelada.' } } });
  await enqueueCatalogImportCleanup(cancelled);
  await cleanupCatalogImport(cancelled);
  await audit(req, { action: 'CATALOG_IMPORT_CANCELLED', targetType: 'CatalogImport', targetId: String(cancelled._id) });
  res.json({ success: true });
}));

export default router;
