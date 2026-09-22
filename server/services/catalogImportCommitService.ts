import mongoose from 'mongoose';
import type { Request } from 'express';
import Category from '../../src/models/Category.js';
import Product from '../../src/models/Product.js';
import ComplementGroup from '../../src/models/ComplementGroup.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import IdempotencyRecord from '../models/IdempotencyRecord.js';
import CatalogImport from '../models/CatalogImport.js';
import CatalogImportAnalysis from '../models/CatalogImportAnalysis.js';
import CatalogImportJob from '../models/CatalogImportJob.js';
import { compareAndBumpCatalogRevision, ensureCatalogRevision, getCatalogRevision } from './catalogRevisionService.js';
import { buildImportPreview, computeImportReadiness, hashValue, reconcileCatalogImport } from './catalogImportReviewService.js';
import { audit } from './auditService.js';
import { HttpError } from '../middleware/errors.js';
import { cleanupCatalogImport } from './catalogImportJobService.js';
import { verifyCatalogImportImage } from './storageService.js';

type ConfirmInput = { expectedRevision: number; previewHash: string; publishMode: 'review_first' | 'publish_now'; idempotencyKey: string };

function groupsForProduct(plan: any, productKey: string, excluded: Set<string>) {
  return (plan.complementGroups || []).filter((group: any) => group.placement?.type === 'embedded_product' && group.placement.productKey === productKey && !excluded.has(group.key)).map((group: any) => ({
    nome: group.name,
    obrigatorio: Boolean(group.required),
    minimo: Number(group.minimum || 0),
    maximo: Number(group.maximum || 1),
    itens: (group.options || []).filter((option: any) => !excluded.has(option.key)).map((option: any) => ({
      nome: option.name,
      descricao: option.description || '',
      preco: Number(option.priceDeltaCents || 0) / 100,
      preco_centavos: Number(option.priceDeltaCents || 0),
      maximo: Number(option.maximumPerItem || 0),
      ativo: option.active !== false,
    })),
  }));
}

function productPreorder(product: any, settings: any) {
  const explicit = product.preorderPolicy?.availability;
  const availability = explicit || (settings?.preorderEnabled && settings?.preorderDraft?.salesMode === 'scheduled_only' ? 'scheduled_only' : 'immediate_only');
  return { availability, ...(Number.isFinite(product.preorderPolicy?.minLeadMinutes) ? { minLeadMinutes: product.preorderPolicy.minLeadMinutes } : {}) };
}

export async function refreshImportForConfirmation(importDoc: any, analysisData: any) {
  const reconciliation = await reconcileCatalogImport(importDoc.tenantId, importDoc.workingPlan, importDoc.decisions);
  const readiness = computeImportReadiness(analysisData, importDoc.workingPlan, importDoc.decisions, reconciliation);
  return { reconciliation, readiness };
}

export async function confirmCatalogImport(req: Request, importId: string, input: ConfirmInput) {
  const tenantId = req.tenant!._id;
  const requestHash = hashValue({ importId, expectedRevision: input.expectedRevision, previewHash: input.previewHash, publishMode: input.publishMode });
  const previous = await IdempotencyRecord.findOne({ tenantId, scope: `catalog-import-confirm:${importId}`, key: input.idempotencyKey }).lean();
  if (previous && previous.requestHash !== requestHash) throw new HttpError(409, 'A chave de idempotência já foi usada com outros dados.', 'IDEMPOTENCY_CONFLICT');
  if (previous?.status === 'completed') {
    return previous.responseBody;
  }
  if (previous?.status === 'processing') throw new HttpError(409, 'Esta confirmação já está em processamento.', 'IDEMPOTENCY_IN_PROGRESS');

  const importDoc = await CatalogImport.findOne({ _id: importId, tenantId });
  if (!importDoc) throw new HttpError(404, 'Importação não encontrada.', 'NOT_FOUND');
  if (importDoc.status === 'completed') return importDoc.confirmation?.result;
  if (importDoc.status !== 'reviewing') throw new HttpError(409, 'A importação não está pronta para confirmação.', 'IMPORT_NOT_REVIEWABLE');
  if (Number(importDoc.revision) !== input.expectedRevision) throw new HttpError(409, 'O rascunho foi alterado em outra tela.', 'REVISION_CONFLICT');
  const analysis = await CatalogImportAnalysis.findOne({ _id: importDoc.analysisId, importId: importDoc._id, tenantId }).lean();
  if (!analysis) throw new HttpError(409, 'A análise original não está disponível.', 'ANALYSIS_NOT_FOUND');
  const reviewedCatalogRevision = Number(importDoc.reconciliation?.catalogRevision || 0);
  const fresh = await refreshImportForConfirmation(importDoc, analysis.data);
  if (Number(fresh.reconciliation.catalogRevision) !== reviewedCatalogRevision) throw new HttpError(409, 'O catálogo mudou desde a revisão.', 'CATALOG_CHANGED');
  if (!fresh.readiness.canConfirm) throw new HttpError(409, 'Resolva as pendências antes de confirmar.', 'IMPORT_HAS_BLOCKERS', fresh.readiness);
  const { preview, previewHash } = buildImportPreview(importDoc.toObject());
  if (previewHash !== input.previewHash) throw new HttpError(409, 'A prévia mudou. Revise os dados antes de confirmar.', 'PREVIEW_CHANGED', { preview, previewHash });
  for (const url of Object.values(importDoc.decisions?.imageSelections || {})) {
    if (url) await verifyCatalogImportImage({ tenantId, importId: String(importDoc._id), publicUrl: String(url) });
  }
  await ensureCatalogRevision(tenantId);
  const currentCatalogRevision = await getCatalogRevision(tenantId);
  if (currentCatalogRevision !== reviewedCatalogRevision) throw new HttpError(409, 'O catálogo mudou desde a revisão.', 'CATALOG_CHANGED');

  const session = await mongoose.startSession();
  try {
    let response: any;
    await session.withTransaction(async () => {
      const locked = await CatalogImport.findOne({ _id: importId, tenantId, status: 'reviewing', revision: input.expectedRevision }).session(session);
      if (!locked) throw new HttpError(409, 'O rascunho mudou durante a confirmação.', 'REVISION_CONFLICT');
      if (previous?.status === 'failed') {
        const retried = await IdempotencyRecord.updateOne(
          { tenantId, scope: `catalog-import-confirm:${importId}`, key: input.idempotencyKey, requestHash, status: 'failed' },
          { $set: { status: 'processing', responseStatus: null, responseBody: null, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) } },
          { session },
        );
        if (retried.modifiedCount !== 1) throw new HttpError(409, 'Não foi possível retomar esta confirmação.', 'IDEMPOTENCY_CONFLICT');
      } else {
        await IdempotencyRecord.create([{
          tenantId, scope: `catalog-import-confirm:${importId}`, key: input.idempotencyKey, requestHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        }], { session });
      }
      const nextCatalogRevision = await compareAndBumpCatalogRevision(tenantId, Number(locked.reconciliation?.catalogRevision || 0), session);
      locked.status = 'confirming';
      locked.confirmation = { ...(locked.confirmation || {}), publishMode: input.publishMode, previewHash, startedAt: new Date() };
      await locked.save({ session });

      const settings = await StoreSettings.findOne({ tenantId }).select('preorderEnabled preorderDraft').session(session).lean();
      const plan: any = locked.workingPlan;
      const excluded = new Set<string>(locked.decisions?.excludedEntityKeys || []);
      const resolutions: Record<string, any> = locked.decisions?.duplicates || {};
      const autoDuplicates = new Map((locked.reconciliation?.duplicates || []).map((entry: any) => [entry.entityKey, entry]));
      const categoryIds = new Map<string, mongoose.Types.ObjectId>();
      const productIds = new Map<string, mongoose.Types.ObjectId>();
      const created = { categories: [] as string[], products: [] as string[], combos: [] as string[], complementGroups: [] as string[] };
      const reused = { categories: [] as string[], products: [] as string[], complementGroups: [] as string[] };

      for (const category of plan.categories || []) {
        if (excluded.has(category.key) || resolutions[category.key]?.action === 'skip') continue;
        const resolution = resolutions[category.key] || (autoDuplicates.get(category.key) as any)?.resolution;
        if (resolution?.action === 'reuse_existing') {
          const existing = await Category.findOne({ _id: resolution.existingId, tenantId }).session(session).lean();
          if (!existing) throw new HttpError(409, `A categoria existente de "${category.name}" não está mais disponível.`, 'CATALOG_CHANGED');
          categoryIds.set(category.key, existing._id as mongoose.Types.ObjectId); reused.categories.push(String(existing._id));
        } else {
          const id = new mongoose.Types.ObjectId(); categoryIds.set(category.key, id);
          await Category.create([{ _id: id, tenantId, nome: category.name, descricao: category.description || '', ordem: Number(category.order || 999) }], { session });
          created.categories.push(String(id));
        }
      }

      for (const product of plan.products || []) {
        if (excluded.has(product.key) || resolutions[product.key]?.action === 'skip') continue;
        const resolution = resolutions[product.key];
        if (resolution?.action === 'reuse_existing') {
          if (!mongoose.isValidObjectId(resolution.existingId)) throw new HttpError(400, 'Produto reutilizado inválido.', 'INVALID_DUPLICATE_RESOLUTION');
          const existing = await Product.findOne({ _id: resolution.existingId, tenantId, tipo: product.kind === 'combo' ? 'combo' : { $ne: 'combo' } }).session(session).lean();
          if (!existing) throw new HttpError(409, `O produto existente de "${product.name}" não está mais disponível.`, 'CATALOG_CHANGED');
          productIds.set(product.key, existing._id as mongoose.Types.ObjectId); reused.products.push(String(existing._id));
        } else productIds.set(product.key, new mongoose.Types.ObjectId());
      }

      for (const product of (plan.products || []).filter((entry: any) => entry.kind === 'product')) {
        const id = productIds.get(product.key);
        if (!id || reused.products.includes(String(id))) continue;
        if (!Number.isInteger(product.basePriceCents) || product.basePriceCents < 0 || (product.basePriceCents === 0 && !product.exclusiveToCombo)) throw new HttpError(409, `Defina um preço comercial válido para "${product.name}".`, 'INVALID_PRODUCT_PRICE');
        const groups = groupsForProduct(plan, product.key, excluded);
        const active = input.publishMode === 'publish_now' || Boolean(product.exclusiveToCombo);
        await Product.create([{
          _id: id, tenantId, tipo: 'produto', nome: product.name, descricao: product.description || '',
          categoriaId: product.categoryKey ? categoryIds.get(product.categoryKey) || null : null,
          preco: product.basePriceCents / 100, preco_centavos: product.basePriceCents,
          preco_antigo: 0, preco_antigo_centavos: 0,
          imagem: locked.decisions?.imageSelections?.[product.key] || '',
          ativo: active, exclusivo_combo: Boolean(product.exclusiveToCombo),
          grupos_adicionais: groups, personalizavel: groups.length > 0,
          controlar_estoque: false, estoque: 0, estoque_minimo: 0, esgotado: false,
          promocao: false, pode_resgatar: false, pontos_resgate: 0,
          ordem_categoria: Number(product.order || 999), ordem: Number(product.order || 999),
          preorderDraft: productPreorder(product, settings),
        }], { session });
        created.products.push(String(id));
      }

      for (const combo of (plan.products || []).filter((entry: any) => entry.kind === 'combo')) {
        const id = productIds.get(combo.key);
        if (!id || reused.products.includes(String(id))) continue;
        const baseCents = Number(combo.combo?.comboBasePriceCents ?? combo.startingPriceCents);
        if (!Number.isInteger(baseCents) || baseCents < 0) throw new HttpError(409, `Defina o preço do combo "${combo.name}".`, 'INVALID_PRODUCT_PRICE');
        let comboFields: any;
        if (combo.combo.mode === 'fixed') {
          const items = combo.combo.items.map((item: any) => ({ produtoId: productIds.get(item.productKey), quantidade: item.quantity }));
          if (items.some((item: any) => !item.produtoId)) throw new HttpError(409, `O combo "${combo.name}" possui componente ignorado.`, 'MISSING_COMBO_COMPONENT');
          comboFields = { combo_mode: 'fixed', combo_preco_base_centavos: baseCents, combo_itens_fixos: items, combo_etapas: [] };
        } else {
          const stages = combo.combo.stages.map((stage: any) => ({ nome: stage.name, ordem: stage.order, valor_etapa_centavos: stage.stageValueCents, cobrar_complementos: stage.chargeComplements, opcoes: stage.options.map((option: any) => ({ produtoId: productIds.get(option.productKey), acrescimo_centavos: option.extraCents, ordem: option.order })) }));
          if (stages.some((stage: any) => stage.opcoes.some((option: any) => !option.produtoId))) throw new HttpError(409, `O combo "${combo.name}" possui opção ignorada.`, 'MISSING_COMBO_COMPONENT');
          comboFields = { combo_mode: 'stages', combo_preco_base_centavos: baseCents, combo_itens_fixos: [], combo_etapas: stages };
        }
        await Product.create([{
          _id: id, tenantId, tipo: 'combo', nome: combo.name, descricao: combo.description || '', categoriaId: combo.categoryKey ? categoryIds.get(combo.categoryKey) || null : null,
          preco: Number(combo.startingPriceCents ?? baseCents) / 100, preco_centavos: Number(combo.startingPriceCents ?? baseCents), imagem: locked.decisions?.imageSelections?.[combo.key] || '',
          ativo: input.publishMode === 'publish_now', exclusivo_combo: false, controlar_estoque: false, estoque: 0, esgotado: false,
          promocao: false, pode_resgatar: false, grupos_adicionais: [], ordem_categoria: Number(combo.order || 999), ordem: Number(combo.order || 999), preorderDraft: productPreorder(combo, settings), ...comboFields,
        }], { session });
        created.combos.push(String(id));
      }

      for (const group of (plan.complementGroups || []).filter((entry: any) => entry.placement?.type === 'shared')) {
        if (excluded.has(group.key) || resolutions[group.key]?.action === 'skip') continue;
        const resolution = resolutions[group.key];
        if (resolution?.action === 'reuse_existing') {
          const existing = await ComplementGroup.findOne({ _id: resolution.existingId, tenantId }).session(session).lean();
          if (!existing) throw new HttpError(409, `O grupo existente "${group.name}" não está mais disponível.`, 'CATALOG_CHANGED');
          reused.complementGroups.push(String(existing._id)); continue;
        }
        const productTargets = group.placement.productKeys.map((key: string) => productIds.get(key)).filter(Boolean);
        const categoryTargets = group.placement.categoryKeys.map((key: string) => categoryIds.get(key)).filter(Boolean);
        const createdGroup = await ComplementGroup.create([{
          tenantId, nome: group.name, obrigatorio: Boolean(group.required), minimo: Number(group.minimum || 0), maximo: Number(group.maximum || 1),
          ativo: input.publishMode === 'publish_now' && group.active !== false, ordem: 999,
          itens: (group.options || []).filter((option: any) => !excluded.has(option.key)).map((option: any) => ({ nome: option.name, descricao: option.description || '', preco: Number(option.priceDeltaCents || 0) / 100, preco_centavos: Number(option.priceDeltaCents || 0), maximo: Number(option.maximumPerItem || 0), ativo: option.active !== false })),
          produtos_vinculados: productTargets, categorias_vinculadas: categoryTargets,
        }], { session });
        created.complementGroups.push(String(createdGroup[0]._id));
      }

      response = { success: true, importId, catalogRevision: nextCatalogRevision, created, reused, preview };
      locked.status = 'completed';
      locked.revision = Number(locked.revision) + 1;
      locked.confirmation = { ...locked.confirmation, completedAt: new Date(), result: response };
      locked.cleanupState = 'pending';
      await locked.save({ session });
      await CatalogImportJob.create([{ tenantId, importId: locked._id, type: 'cleanup', generation: locked.analysisGeneration, state: 'pending', attempts: 0, maxAttempts: 10, nextAttemptAt: new Date(), leaseUntil: new Date(0), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) }], { session });
      await IdempotencyRecord.updateOne({ tenantId, scope: `catalog-import-confirm:${importId}`, key: input.idempotencyKey }, { $set: { status: 'completed', responseStatus: 201, responseBody: response } }, { session });
      await audit(req, { action: 'CATALOG_IMPORT_CONFIRMED', targetType: 'CatalogImport', targetId: importId, after: { created, reused, publishMode: input.publishMode } }, session);
    });
    const completed = await CatalogImport.findOne({ _id: importId, tenantId, status: 'completed' }).lean();
    if (completed) await cleanupCatalogImport(completed).catch(() => false);
    return response;
  } catch (error: any) {
    if (error?.code === 11000) {
      const replay = await IdempotencyRecord.findOne({ tenantId, scope: `catalog-import-confirm:${importId}`, key: input.idempotencyKey }).lean();
      if (replay?.status === 'completed' && replay.requestHash === requestHash) return replay.responseBody;
    }
    await IdempotencyRecord.updateOne({ tenantId, scope: `catalog-import-confirm:${importId}`, key: input.idempotencyKey, status: 'processing' }, { $set: { status: 'failed' } }).catch(() => undefined);
    throw error;
  } finally {
    await session.endSession();
  }
}
