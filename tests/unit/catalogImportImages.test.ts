import { describe, expect, it } from 'vitest';
import { buildCatalogImportPhotoSuggestions } from '../../src/components/tenant-admin/catalog-import/CatalogImportPage';
import type { CatalogImportDraft } from '../../src/components/tenant-admin/api';

describe('catalog import image suggestions', () => {
  it('preserva fotos detectadas mesmo quando apenas parte delas foi mapeada no plano', () => {
    const current = {
      workingPlan: {
        products: [
          { key: 'prod0', kind: 'product', name: 'X-Burger', sourceEvidenceKeys: ['cand0'] },
          { key: 'prod1', kind: 'product', name: 'Combo', sourceEvidenceKeys: ['cand1'] },
        ],
        productImages: [{ productKey: 'prod0', sourcePhotoKey: 'photo0', confidence: 0.98, transformation: 'use_crop' }],
      },
      analysis: {
        data: {
          sourceEvidence: {
            productCandidates: [
              { candidateKey: 'cand0', name: 'X-Burger' },
              { candidateKey: 'cand1', name: 'Combo' },
            ],
            photos: [
              { photoKey: 'photo0', candidateKey: 'cand0', photoRelation: 'direct', photoBox: [100, 100, 500, 500] },
              { photoKey: 'photo1', candidateKey: 'cand1', photoRelation: 'ambiguous', photoBox: [200, 200, 700, 700] },
              { photoKey: 'photo2', candidateKey: null, photoRelation: 'none', photoBox: null },
            ],
          },
        },
      },
    } as unknown as CatalogImportDraft;

    const suggestions = buildCatalogImportPhotoSuggestions(current);

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({ product: { key: 'prod0' }, plan: { sourcePhotoKey: 'photo0' } });
    expect(suggestions[1]).toMatchObject({ product: null, candidate: { candidateKey: 'cand1' }, plan: undefined });
  });

  it('usa a imagem inteira quando o plano pede use_full_source_image', () => {
    const current = {
      workingPlan: {
        products: [{ key: 'prod0', kind: 'product', name: 'Produto', sourceEvidenceKeys: ['cand0'] }],
        productImages: [{ productKey: 'prod0', sourcePhotoKey: 'photo0', confidence: 1, transformation: 'use_full_source_image' }],
      },
      analysis: {
        data: {
          sourceEvidence: {
            productCandidates: [{ candidateKey: 'cand0', name: 'Produto' }],
            photos: [{ photoKey: 'photo0', candidateKey: 'cand0', photoRelation: 'direct', photoBox: null }],
          },
        },
      },
    } as unknown as CatalogImportDraft;

    expect(buildCatalogImportPhotoSuggestions(current)[0].photoBox).toEqual([0, 0, 1000, 1000]);
  });
});
