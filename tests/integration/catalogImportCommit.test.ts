import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import CatalogImport from '../../server/models/CatalogImport.js';
import CatalogImportAnalysis from '../../server/models/CatalogImportAnalysis.js';
import CatalogRevision from '../../server/models/CatalogRevision.js';
import IdempotencyRecord from '../../server/models/IdempotencyRecord.js';
import Category from '../../src/models/Category.js';
import Product from '../../src/models/Product.js';
import { buildImportPreview, computeImportReadiness, hashValue, reconcileCatalogImport } from '../../server/services/catalogImportReviewService.js';
import { confirmCatalogImport } from '../../server/services/catalogImportCommitService.js';
import { withCatalogMutation } from '../../server/services/catalogRevisionService.js';

let mongo: MongoMemoryReplSet | undefined;

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
}, 120_000);

function simpleAnalysis() {
  return {
    sourceEvidence: {
      document: { sourceType: 'image' },
      productCandidates: [{ candidateKey: 'cand0', name: 'Café Especial', prices: [{ priceKey: 'price0', amountCents: 1290 }] }],
      pricingObservations: [], choiceGroups: [], ruleBlocks: [], comboEvidence: [],
      photos: [{ photoKey: 'photo0', candidateKey: 'cand0', photoRelation: 'none', photoBox: null }],
      residualTexts: [],
    },
    importPlan: {
      categories: [{ key: 'cat0', name: 'Cafés', description: '', order: 0 }],
      products: [{
        key: 'prod0', kind: 'product', name: 'Café Especial', description: '250 ml', categoryKey: 'cat0',
        basePriceCents: 1290, priceOrigin: 'source', exclusiveToCombo: false, sourceEvidenceKeys: ['cand0'], order: 0,
      }],
      complementGroups: [], productImages: [], storePolicy: null,
    },
    unresolved: [], modelingChoices: [],
  };
}

async function seedDraft(
  tenantId = new mongoose.Types.ObjectId(),
  data: any = simpleAnalysis(),
  decisions: any = { modeling: {}, duplicates: {}, acknowledgedWarnings: [], resolvedIssueKeys: [], excludedEntityKeys: [], imageSelections: {} },
) {
  const accountId = new mongoose.Types.ObjectId();
  const importDoc = await CatalogImport.create({
    tenantId, createdBy: accountId, updatedBy: accountId, status: 'reviewing', revision: 2, analysisGeneration: 1,
    workingPlan: data.importPlan, decisions, expiresAt: new Date(Date.now() + 86_400_000),
  });
  const analysis = await CatalogImportAnalysis.create({
    tenantId, importId: importDoc._id, generation: 1, model: 'mock-gemini', data, analysisHash: hashValue(data),
  });
  const reconciliation = await reconcileCatalogImport(tenantId, data.importPlan, decisions);
  importDoc.analysisId = analysis._id;
  importDoc.reconciliation = reconciliation;
  importDoc.readiness = computeImportReadiness(data, data.importPlan, decisions, reconciliation);
  await importDoc.save();
  const preview = buildImportPreview(importDoc.toObject());
  const req = {
    tenant: { _id: tenantId },
    auth: { accountId, tenantRole: 'owner' },
    requestId: 'test-request', ip: '127.0.0.1', get: () => 'vitest',
  } as any;
  return { tenantId, importDoc, preview, req };
}

describe('confirmação real da importação de catálogo', () => {
  it('cria o catálogo em uma transação e repete a mesma resposta por idempotência', async () => {
    const { tenantId, importDoc, preview, req } = await seedDraft();
    expect(importDoc.readiness?.canConfirm).toBe(true);
    const input = { expectedRevision: 2, previewHash: preview.previewHash, publishMode: 'review_first' as const, idempotencyKey: 'catalog-import-test-key-0001' };

    const first = await confirmCatalogImport(req, String(importDoc._id), input);
    const replay = await confirmCatalogImport(req, String(importDoc._id), input);

    expect(replay).toEqual(first);
    expect(await Category.countDocuments({ tenantId })).toBe(1);
    expect(await Product.countDocuments({ tenantId })).toBe(1);
    const product = await Product.findOne({ tenantId }).lean();
    expect(product?.preco_centavos).toBe(1290);
    expect(product?.ativo).toBe(false);
    expect(await CatalogRevision.findOne({ tenantId }).lean()).toMatchObject({ revision: 1 });
    expect(await IdempotencyRecord.countDocuments({ tenantId, status: 'completed' })).toBe(1);
  });

  it('recusa a confirmação quando o catálogo muda depois da revisão', async () => {
    const { tenantId, importDoc, preview, req } = await seedDraft();
    await withCatalogMutation(tenantId, async (session) => {
      await Category.create([{ tenantId, nome: 'Criada em outra tela' }], { session });
    });

    await expect(confirmCatalogImport(req, String(importDoc._id), {
      expectedRevision: 2,
      previewHash: preview.previewHash,
      publishMode: 'publish_now',
      idempotencyKey: 'catalog-import-test-key-0002',
    })).rejects.toMatchObject({ status: 409, code: 'CATALOG_CHANGED' });

    expect(await Product.countDocuments({ tenantId })).toBe(0);
    expect(await Category.countDocuments({ tenantId })).toBe(1);
  });

  it('isola a reconciliação por tenant', async () => {
    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();
    await Category.create({ tenantId: tenantB, nome: 'Cafés' });
    await Product.create({ tenantId: tenantB, nome: 'Café Especial', preco: 12.9, preco_centavos: 1290 });
    const data = simpleAnalysis();
    const decisions = { duplicates: {} };

    const reconciliation = await reconcileCatalogImport(tenantA, data.importPlan, decisions);
    expect(reconciliation.duplicates).toHaveLength(0);
  });

  it('faz rollback de tudo quando uma dependência reutilizada desaparece durante o commit', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const existingCategoryId = new mongoose.Types.ObjectId();
    const existingProductId = new mongoose.Types.ObjectId();
    await Category.create({ _id: existingCategoryId, tenantId, nome: 'Cafés' });
    await Product.create({ _id: existingProductId, tenantId, categoriaId: existingCategoryId, nome: 'Café Especial', preco: 12.9, preco_centavos: 1290 });
    const data = simpleAnalysis();
    data.importPlan.categories.push({ key: 'cat1', name: 'Novidades', description: '', order: 1 });
    const decisions: any = { modeling: {}, duplicates: { prod0: { action: 'reuse_existing', existingId: String(existingProductId) } }, acknowledgedWarnings: [], resolvedIssueKeys: [], excludedEntityKeys: [], imageSelections: {} };
    const { importDoc, preview, req } = await seedDraft(tenantId, data, decisions);
    await Product.deleteOne({ _id: existingProductId, tenantId });

    await expect(confirmCatalogImport(req, String(importDoc._id), {
      expectedRevision: 2, previewHash: preview.previewHash, publishMode: 'publish_now', idempotencyKey: 'catalog-import-test-key-0003',
    })).rejects.toMatchObject({ status: 409, code: 'CATALOG_CHANGED' });

    expect(await Category.countDocuments({ tenantId, nome: 'Novidades' })).toBe(0);
    expect((await CatalogImport.findById(importDoc._id).lean())?.status).toBe('reviewing');
    expect((await CatalogRevision.findOne({ tenantId }).lean())?.revision).toBe(0);
  });
});
