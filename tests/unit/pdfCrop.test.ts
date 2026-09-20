import { describe, expect, it } from 'vitest';
import {
  isCatalogPhotoCandidate,
  calculatePageRenderScale,
  cropCanvasRegionToDataUrl,
  extractPdfCrops,
  type PdfPhotoCandidateItem,
} from '../../src/lib/pdfCrop.js';

describe('pdfCrop: regras de domínio e recorte de cardápios em PDF', () => {
  describe('isCatalogPhotoCandidate (elegibilidade a foto no catálogo)', () => {
    it('aceita exclusivamente "product" e "combo" como donos de foto de catálogo', () => {
      expect(isCatalogPhotoCandidate('product')).toBe(true);
      expect(isCatalogPhotoCandidate('combo')).toBe(true);
    });

    it('rejeita opções, adicionais, variantes, informativos e desconhecidos', () => {
      expect(isCatalogPhotoCandidate('option')).toBe(false);
      expect(isCatalogPhotoCandidate('addon')).toBe(false);
      expect(isCatalogPhotoCandidate('variant')).toBe(false);
      expect(isCatalogPhotoCandidate('informational')).toBe(false);
      expect(isCatalogPhotoCandidate('unknown')).toBe(false);
    });

    it('rejeita valores nulos, indefinidos ou arbitrários', () => {
      expect(isCatalogPhotoCandidate(null)).toBe(false);
      expect(isCatalogPhotoCandidate(undefined)).toBe(false);
      expect(isCatalogPhotoCandidate('')).toBe(false);
      expect(isCatalogPhotoCandidate('anything_else')).toBe(false);
    });
  });

  describe('calculatePageRenderScale', () => {
    it('calcula escala adequada para página A4 padrão (595 x 842) mirando ~2200px', () => {
      const scale = calculatePageRenderScale(595, 842, 2200);
      // 2200 / 842 = 2.61
      expect(scale).toBeCloseTo(2.61, 2);
      expect(scale).toBeGreaterThanOrEqual(1.0);
      expect(scale).toBeLessThanOrEqual(3.0);
    });

    it('limita escala máxima a 3.0 para páginas muito pequenas', () => {
      const scale = calculatePageRenderScale(200, 300, 2200);
      expect(scale).toBe(3.0);
    });

    it('limita escala mínima a 1.0 para páginas enormes', () => {
      const scale = calculatePageRenderScale(3000, 4000, 2200);
      expect(scale).toBe(1.0);
    });

    it('retorna escala padrão de fallback caso dimensões sejam inválidas', () => {
      const scale = calculatePageRenderScale(0, 0);
      expect(scale).toBe(1.5);
    });
  });

  describe('cropCanvasRegionToDataUrl', () => {
    it('retorna null se dimensões do canvas forem zero ou inválidas', () => {
      const dummyCanvas = { width: 0, height: 0 } as any;
      const res = cropCanvasRegionToDataUrl(dummyCanvas, [0, 0, 1000, 1000]);
      expect(res).toBeNull();
    });
  });

  describe('extractPdfCrops: orquestração e filtro de páginas necessárias (pagesNeeded)', () => {
    it('retorna vazio sem carregar PDF se não houver candidatos de catálogo', async () => {
      const mockFile = new File(['mock content'], 'menu.pdf', { type: 'application/pdf' });
      const candidates: PdfPhotoCandidateItem[] = [
        {
          itemKey: 'c0-p1',
          name: 'Opção Brigadeiro Tradicional',
          kind: 'option',
          pageNumber: 2,
          photoBox: [100, 100, 300, 300],
          photoRelation: 'direct',
        },
        {
          itemKey: 'c0-p2',
          name: 'Opção Beijinho',
          kind: 'option',
          pageNumber: 2,
          photoBox: [350, 100, 550, 300],
          photoRelation: 'direct',
        },
      ];

      // Como todas são options, validCandidates fica vazio e o PDF nem é carregado
      const result = await extractPdfCrops(mockFile, candidates);
      expect(result.crops).toEqual({});
      expect(result.renderedPages).toEqual([]);
      expect(result.pagePreviews).toEqual({});
    });

    it('ignora itens com photoRelation "none"', async () => {
      const mockFile = new File(['mock content'], 'menu.pdf', { type: 'application/pdf' });
      const candidates: PdfPhotoCandidateItem[] = [
        {
          itemKey: 'c0-p0',
          name: 'Cento de Brigadeiros',
          kind: 'product',
          pageNumber: 1,
          photoBox: [100, 100, 300, 300],
          photoRelation: 'none',
        },
      ];

      const result = await extractPdfCrops(mockFile, candidates);
      expect(result.crops).toEqual({});
      expect(result.renderedPages).toEqual([]);
    });
  });
});
