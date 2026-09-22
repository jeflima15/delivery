import { describe, expect, it } from 'vitest';
import { emanueleConfeitariaDomainRawFixture } from '../fixtures/catalogImportFixtures.js';
import { normalizeDomainNativeData } from '../../server/services/catalogLabUnifiedService.js';
import {
  applyReviewOperations,
  buildImportPreview,
  computeImportReadiness,
  normalizeCatalogName,
} from '../../server/services/catalogImportReviewService.js';
import CatalogImport from '../../server/models/CatalogImport.js';

function normalizedAnalysis() {
  return normalizeDomainNativeData(structuredClone(emanueleConfeitariaDomainRawFixture)).normalizedData;
}

function emptyDecisions() {
  return { modeling: {}, duplicates: {}, acknowledgedWarnings: [], resolvedIssueKeys: [], excludedEntityKeys: [], imageSelections: {} };
}

describe('revisão persistente de importação de catálogo', () => {
  it('normaliza nomes somente em memória, sem depender de campo persistido', () => {
    expect(normalizeCatalogName('  BÔLOS & Doces -- Especiais  ')).toBe('bolos doces especiais');
  });

  it('aplica edições tipadas sem alterar a análise original', () => {
    const analysis = normalizedAnalysis();
    const originalName = analysis.importPlan.products[0].name;
    const changed = applyReviewOperations(analysis.importPlan, analysis, emptyDecisions(), [{
      type: 'edit_product',
      key: 'prod0',
      patch: { name: 'Brigadeiro revisado', basePriceCents: 525 },
    }]);

    expect(changed.plan.products[0].name).toBe('Brigadeiro revisado');
    expect(changed.plan.products[0].basePriceCents).toBe(525);
    expect(analysis.importPlan.products[0].name).toBe(originalName);
  });

  it('não transforma uma alternativa de modelagem apenas mudando uma flag', () => {
    const analysis = normalizedAnalysis() as any;
    analysis.modelingChoices = [{
      key: 'choice-1',
      title: 'Representação do tamanho',
      requiresUserDecision: true,
      recommendedStrategy: 'complement_group',
      alternatives: [{ strategy: 'complement_group' }, { strategy: 'separate_products' }],
    }];

    expect(() => applyReviewOperations(analysis.importPlan, analysis, emptyDecisions(), [{
      type: 'select_modeling', key: 'choice-1', strategy: 'separate_products', expectedRevision: 3,
    }])).toThrow(/edição estruturada/i);

    const changed = applyReviewOperations(analysis.importPlan, analysis, emptyDecisions(), [
      { type: 'edit_product', key: 'prod0', patch: { name: 'Brigadeiro individual' } },
      { type: 'select_modeling', key: 'choice-1', strategy: 'separate_products', expectedRevision: 3 },
    ]);
    expect(changed.decisions.modeling['choice-1'].strategy).toBe('separate_products');
  });

  it('bloqueia duplicidade de produto até uma decisão create/reuse/skip', () => {
    const analysis = normalizedAnalysis();
    const reconciliation = {
      catalogRevision: 4,
      duplicates: [{ entityKey: 'prod0', entityType: 'product', candidates: [{ id: 'existing-1' }] }],
    };
    const pending = computeImportReadiness(analysis, analysis.importPlan, emptyDecisions(), reconciliation);
    expect(pending.unresolvedDuplicateCount).toBe(1);
    expect(pending.canConfirm).toBe(false);

    const decided: any = emptyDecisions();
    decided.duplicates.prod0 = { action: 'create' } as never;
    const ready = computeImportReadiness(analysis, analysis.importPlan, decided, reconciliation);
    expect(ready.unresolvedDuplicateCount).toBe(0);
  });

  it('gera preview determinístico independente do modo de publicação', () => {
    const analysis = normalizedAnalysis();
    const base = {
      workingPlan: analysis.importPlan,
      decisions: emptyDecisions(),
      reconciliation: { catalogRevision: 8, duplicates: [] },
      revision: 12,
    };
    const reviewFirst = buildImportPreview({ ...base, confirmation: { publishMode: 'review_first' } });
    const publishNow = buildImportPreview({ ...base, confirmation: { publishMode: 'publish_now' } });
    expect(reviewFirst.previewHash).toBe(publishNow.previewHash);
    expect(reviewFirst.preview.products.created).toBeGreaterThan(0);
  });

  it('persiste a origem da foto vinculada e a remove quando a imagem é trocada manualmente', () => {
    const analysis = normalizedAnalysis();
    const productKey = analysis.importPlan.products[0].key;
    const withAiPhoto = applyReviewOperations(analysis.importPlan, analysis, emptyDecisions(), [{
      type: 'set_image', productKey, url: 'https://example.test/ai.webp', sourcePhotoKey: 'photo0',
    }]);
    expect(withAiPhoto.decisions.imageSelections[productKey]).toBe('https://example.test/ai.webp');
    expect(withAiPhoto.decisions.imageSourceKeys[productKey]).toBe('photo0');

    const manuallyReplaced = applyReviewOperations(analysis.importPlan, analysis, withAiPhoto.decisions, [{
      type: 'set_image', productKey, url: 'https://example.test/manual.webp',
    }]);
    expect(manuallyReplaced.decisions.imageSourceKeys[productKey]).toBeUndefined();
  });

  it('aceita decisions vindas de um documento Mongoose real', () => {
    const analysis = normalizedAnalysis();
    const productKey = analysis.importPlan.products[0].key;
    const document = new CatalogImport({
      tenantId: '507f1f77bcf86cd799439011',
      createdBy: '507f1f77bcf86cd799439012',
      updatedBy: '507f1f77bcf86cd799439012',
      expiresAt: new Date(Date.now() + 60_000),
      decisions: emptyDecisions(),
    });

    expect(() => applyReviewOperations(analysis.importPlan, analysis, document.decisions, [{
      type: 'set_image', productKey, url: 'https://example.test/mongoose.webp', sourcePhotoKey: 'photo0',
    }])).not.toThrow();
  });

  it('não permite dispensar bloqueio do modelo sem corrigir ou excluir o item', () => {
    const analysis: any = normalizedAnalysis();
    analysis.unresolved = [{ key: 'issue-1', severity: 'blocker', type: 'missing_price', found: 'Preço ausente', reason: 'Não localizado', evidenceKeys: [], affectedEntityKeys: ['prod0'], possibleResolutions: [] }];
    expect(() => applyReviewOperations(analysis.importPlan, analysis, emptyDecisions(), [{ type: 'resolve_issue', key: 'issue-1' }])).toThrow(/corrija ou exclua/i);

    const changed = applyReviewOperations(analysis.importPlan, analysis, emptyDecisions(), [{ type: 'edit_product', key: 'prod0', patch: { basePriceCents: 500 } }]);
    expect(changed.decisions.resolvedIssueKeys).toContain('issue-1');
  });

  it('impede confirmar combo cujo componente foi marcado para não importar', () => {
    const analysis = normalizedAnalysis();
    const decisions: any = emptyDecisions();
    decisions.excludedEntityKeys = ['prod0'];
    const readiness = computeImportReadiness(analysis, analysis.importPlan, decisions, { catalogRevision: 0, duplicates: [] });
    expect(readiness.deterministicIssues.some((issue: any) => issue.code === 'EXCLUDED_COMBO_COMPONENT')).toBe(true);
    expect(readiness.canConfirm).toBe(false);
  });
});
