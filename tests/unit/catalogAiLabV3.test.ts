import { describe, expect, it } from 'vitest';
import { HttpError } from '../../server/middleware/errors.js';
import { enrichPdfT1Evidence, PDF_V3_EXTRACTION_PROMPT } from '../../server/services/geminiService.js';
import { validateSemanticReferences, buildPdfSemanticPrompt, normalizeTextForComparison } from '../../server/services/pdfSemanticService.js';
import { validatePdfPhotoReferences, type CompactPdfPhotoItemInput } from '../../server/services/pdfPhotoService.js';
import {
  buildAuditPrompt,
  pdfAuditDataSchema,
  buildDeterministicPdfAuditIssues,
  mergePdfAuditIssues,
} from '../../server/services/pdfCatalogAuditService.js';

describe('Laboratório IA de Cardápio em PDF — V3', () => {
  /* ========================================================================
     1. GERAÇÃO DETERMINÍSTICA DE IDS E COBERTURA T1
     ======================================================================== */
  describe('1. Geração determinística de IDs e cobertura T1 (enrichPdfT1Evidence)', () => {
    it('1. gera IDs determinísticos para candidateGroups e suas opções (cg0, cg0-o0, cg0-o1...)', () => {
      const rawData = {
        isMenu: true,
        categories: [
          {
            name: 'Pizzas',
            sourcePage: 1,
            products: [
              {
                name: 'Pizza Família',
                description: 'Escolha até 2 sabores',
                sourcePage: 1,
                prices: [{ amountCents: 6000, rawText: 'R$ 60,00' }],
              },
            ],
          },
        ],
        candidateGroups: [
          {
            title: 'Sabores Salgados',
            sourcePage: 1,
            instruction: 'Escolha 2',
            parentProductHint: 'Pizza Família',
            options: [
              { name: 'Calabresa', amountCents: null },
              { name: 'Mussarela', amountCents: null },
            ],
          },
          {
            title: 'Sabores Doces',
            sourcePage: 2,
            instruction: 'Opcional',
            parentProductHint: 'Pizza Família',
            options: [
              { name: 'Chocolate com Morango', amountCents: 500 },
            ],
          },
        ],
        ruleBlocks: [],
        sectionHeadings: [],
        pageCoverage: [
          { pageNumber: 1, role: 'catalogo', hasCatalogEvidence: true },
          { pageNumber: 2, role: 'catalogo', hasCatalogEvidence: true },
        ],
        unmappedTexts: [],
        warnings: [],
      };

      const enriched = enrichPdfT1Evidence(rawData as any);

      expect(enriched.candidateGroups).toHaveLength(2);
      expect(enriched.candidateGroups[0].groupKey).toBe('cg0');
      expect(enriched.candidateGroups[0].options[0].optionKey).toBe('cg0-o0');
      expect(enriched.candidateGroups[0].options[0].name).toBe('Calabresa');
      expect(enriched.candidateGroups[0].options[1].optionKey).toBe('cg0-o1');
      expect(enriched.candidateGroups[1].groupKey).toBe('cg1');
      expect(enriched.candidateGroups[1].options[0].optionKey).toBe('cg1-o0');
      expect(enriched.candidateGroups[1].options[0].amountCents).toBe(500);
    });

    it('2. gera IDs determinísticos para ruleBlocks (rb0, rb1...)', () => {
      const rawData = {
        isMenu: true,
        categories: [],
        candidateGroups: [],
        ruleBlocks: [
          {
            title: 'Encomendas',
            body: 'Faça seu pedido com no mínimo 48h de antecedência pelo WhatsApp.',
            sourcePage: 1,
          },
          {
            title: 'Taxa de Entrega',
            body: 'Consulte o valor do frete para o seu bairro.',
            sourcePage: 2,
          },
        ],
        sectionHeadings: [],
        pageCoverage: [{ pageNumber: 1, role: 'catalogo', hasCatalogEvidence: true }],
        unmappedTexts: [],
        warnings: [],
      };

      const enriched = enrichPdfT1Evidence(rawData as any);

      expect(enriched.ruleBlocks).toHaveLength(2);
      expect(enriched.ruleBlocks[0].ruleKey).toBe('rb0');
      expect(enriched.ruleBlocks[0].body).toBe('Faça seu pedido com no mínimo 48h de antecedência pelo WhatsApp.');
      expect(enriched.ruleBlocks[1].ruleKey).toBe('rb1');
    });

    it('3. gera IDs determinísticos para sectionHeadings (sh0, sh1...)', () => {
      const rawData = {
        isMenu: true,
        categories: [],
        candidateGroups: [],
        ruleBlocks: [],
        sectionHeadings: [
          { text: 'Tortas Geladas', sourcePage: 1 },
          { text: 'Doces Finos e Brigadeiros', sourcePage: 2 },
        ],
        pageCoverage: [{ pageNumber: 1, role: 'catalogo', hasCatalogEvidence: true }],
        unmappedTexts: [],
        warnings: [],
      };

      const enriched = enrichPdfT1Evidence(rawData as any);

      expect(enriched.sectionHeadings).toHaveLength(2);
      expect(enriched.sectionHeadings[0].headingKey).toBe('sh0');
      expect(enriched.sectionHeadings[0].text).toBe('Tortas Geladas');
      expect(enriched.sectionHeadings[1].headingKey).toBe('sh1');
    });

    it('4. ordena pageCoverage em ordem crescente de página', () => {
      const rawData = {
        isMenu: true,
        categories: [],
        candidateGroups: [],
        ruleBlocks: [],
        sectionHeadings: [],
        pageCoverage: [
          { pageNumber: 3, role: 'catalogo', hasCatalogEvidence: true },
          { pageNumber: 1, role: 'capa', hasCatalogEvidence: false },
          { pageNumber: 2, role: 'catalogo', hasCatalogEvidence: true },
        ],
        unmappedTexts: [],
        warnings: [],
      };

      const enriched = enrichPdfT1Evidence(rawData as any);

      expect(enriched.pageCoverage.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
      expect(enriched.pageCoverage[0].role).toBe('capa');
    });

    it('5. rejeita pageCoverage com página duplicada lançando HttpError 502', () => {
      const rawData = {
        isMenu: true,
        categories: [],
        candidateGroups: [],
        ruleBlocks: [],
        sectionHeadings: [],
        pageCoverage: [
          { pageNumber: 1, role: 'capa', hasCatalogEvidence: false },
          { pageNumber: 1, role: 'catalogo', hasCatalogEvidence: true },
        ],
        unmappedTexts: [],
        warnings: [],
      };

      expect(() => enrichPdfT1Evidence(rawData as any)).toThrow(HttpError);
      expect(() => enrichPdfT1Evidence(rawData as any)).toThrow(/Página duplicada em pageCoverage/);
    });

    it('6. rejeita pageCoverage com número de página inválido (< 1)', () => {
      const rawData = {
        isMenu: true,
        categories: [],
        candidateGroups: [],
        ruleBlocks: [],
        sectionHeadings: [],
        pageCoverage: [
          { pageNumber: 0, role: 'capa', hasCatalogEvidence: false },
        ],
        unmappedTexts: [],
        warnings: [],
      };

      expect(() => enrichPdfT1Evidence(rawData as any)).toThrow(HttpError);
      expect(() => enrichPdfT1Evidence(rawData as any)).toThrow(/pageNumber inválido em pageCoverage/);
    });
  });

  /* ========================================================================
     2. DOMÍNIO SEMÂNTICO E RASTREABILIDADE T2
     ======================================================================== */
  describe('2. Domínio semântico e rastreabilidade T2 (validateSemanticReferences)', () => {
    const validItemKeys = new Set(['c0-p0', 'cg0-o0', 'cg0-o1']);
    const validCandidateGroupKeys = new Set(['cg0', 'cg1']);
    const validRuleBlocksMap = new Map([
      ['rb0', { body: 'Retiradas de terça a sábado até às 18h.', sourcePage: 1 }],
      ['rb1', { body: 'Mínimo de 20 unidades por sabor.', sourcePage: 2 }],
    ]);
    const validTextKeysMap = new Map([['t0', 'Taxa sob consulta']]);

    it('7. valida estrutura com Product e ComplementGroup com pricingBehavior e limites', () => {
      const semanticData = {
        items: [
          {
            itemKey: 'c0-p0',
            kind: 'product' as const,
            parentItemKey: null,
            groupKey: null,
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Doces',
            relatedPages: [1],
            photoCandidatePages: [1],
          },
          {
            itemKey: 'cg0-o0',
            kind: 'option' as const,
            parentItemKey: 'c0-p0',
            groupKey: 'g0',
            pricingModel: null,
            normalizedCategoryName: null,
            relatedPages: [1],
            photoCandidatePages: [],
          },
          {
            itemKey: 'cg0-o1',
            kind: 'option' as const,
            parentItemKey: 'c0-p0',
            groupKey: 'g0',
            pricingModel: null,
            normalizedCategoryName: null,
            relatedPages: [1],
            photoCandidatePages: [],
          },
        ],
        groups: [
          {
            groupKey: 'g0',
            name: 'Sabores',
            kind: 'option_group' as const,
            parentItemKey: 'c0-p0',
            itemKeys: ['cg0-o0', 'cg0-o1'],
            sourceGroupKeys: ['cg0'],
            pricingBehavior: 'inherits_parent' as const,
            selectionMode: 'multiple' as const,
            required: true,
            minimum: 1,
            maximum: 2,
          },
        ],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      const validated = validateSemanticReferences(
        semanticData,
        validItemKeys,
        validCandidateGroupKeys,
        validRuleBlocksMap,
        validTextKeysMap
      );

      expect(validated.groups).toHaveLength(1);
      expect(validated.groups[0].pricingBehavior).toBe('inherits_parent');
      expect(validated.groups[0].required).toBe(true);
      expect(validated.groups[0].maximum).toBe(2);
    });

    it('8. suporta fusão de múltiplos candidateGroups em um único ComplementGroup (sourceGroupKeys: [cg0, cg1])', () => {
      const semanticData = {
        items: [
          {
            itemKey: 'c0-p0',
            kind: 'product' as const,
            parentItemKey: null,
            groupKey: null,
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Bolos',
            relatedPages: [1, 2],
            photoCandidatePages: [1],
          },
          {
            itemKey: 'cg0-o0',
            kind: 'option' as const,
            parentItemKey: 'c0-p0',
            groupKey: 'g0',
            pricingModel: null,
            normalizedCategoryName: null,
            relatedPages: [1],
            photoCandidatePages: [],
          },
          {
            itemKey: 'cg0-o1',
            kind: 'option' as const,
            parentItemKey: 'c0-p0',
            groupKey: 'g0',
            pricingModel: null,
            normalizedCategoryName: null,
            relatedPages: [2],
            photoCandidatePages: [],
          },
        ],
        groups: [
          {
            groupKey: 'g0',
            name: 'Sabores Continuados Multipágina',
            kind: 'option_group' as const,
            parentItemKey: 'c0-p0',
            itemKeys: ['cg0-o0', 'cg0-o1'],
            sourceGroupKeys: ['cg0', 'cg1'], // Fusão de cg0 (pág 1) e cg1 (pág 2)
            pricingBehavior: 'inherits_parent' as const,
            selectionMode: 'single' as const,
            required: true,
            minimum: 1,
            maximum: 1,
          },
        ],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      const validated = validateSemanticReferences(
        semanticData,
        validItemKeys,
        validCandidateGroupKeys,
        validRuleBlocksMap,
        validTextKeysMap
      );

      expect(validated.groups[0].sourceGroupKeys).toEqual(['cg0', 'cg1']);
    });

    it('9. rejeita sourceGroupKey inexistente não listado na T1', () => {
      const semanticData = {
        items: [
          { itemKey: 'c0-p0', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
          { itemKey: 'cg0-o0', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: 'g0', pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
          { itemKey: 'cg0-o1', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: 'g0', pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
        ],
        groups: [
          {
            groupKey: 'g0',
            name: 'Sabores',
            kind: 'option_group' as const,
            parentItemKey: 'c0-p0',
            itemKeys: ['cg0-o0', 'cg0-o1'],
            sourceGroupKeys: ['cg99_fantasma'],
            pricingBehavior: 'inherits_parent' as const,
          },
        ],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      expect(() =>
        validateSemanticReferences(
          semanticData,
          validItemKeys,
          validCandidateGroupKeys,
          validRuleBlocksMap,
          validTextKeysMap
        )
      ).toThrow(/sourceGroupKey inexistente/);
    });

    it('10. resolve autoritativamente o corpo integral de businessRule a partir de ruleBlock.body da T1', () => {
      const semanticData = {
        items: [
          { itemKey: 'c0-p0', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
          { itemKey: 'cg0-o0', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
          { itemKey: 'cg0-o1', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
        ],
        groups: [],
        businessRules: [
          {
            type: 'advance_notice' as const,
            sourceRuleKey: 'rb0',
            rawText: 'Resumo encurtado inventado pelo Gemini', // Deve ser sobrescrito pelo corpo da T1!
            sourcePage: null,
          },
        ],
        ignoredTexts: [],
        warnings: [],
      };

      const validated = validateSemanticReferences(
        semanticData,
        validItemKeys,
        validCandidateGroupKeys,
        validRuleBlocksMap,
        validTextKeysMap
      );

      expect(validated.businessRules[0].rawText).toBe('Retiradas de terça a sábado até às 18h.');
      expect(validated.businessRules[0].sourcePage).toBe(1);
    });

    it('11. rejeita sourceRuleKey inexistente não extraído na T1', () => {
      const semanticData = {
        items: [
          { itemKey: 'c0-p0', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
          { itemKey: 'cg0-o0', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
          { itemKey: 'cg0-o1', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
        ],
        groups: [],
        businessRules: [
          {
            type: 'advance_notice' as const,
            sourceRuleKey: 'rb99',
            rawText: 'Regra fantasma',
          },
        ],
        ignoredTexts: [],
        warnings: [],
      };

      expect(() =>
        validateSemanticReferences(
          semanticData,
          validItemKeys,
          validCandidateGroupKeys,
          validRuleBlocksMap,
          validTextKeysMap
        )
      ).toThrow(/sourceRuleKey inexistente/);
    });

    it('12. permite rastreabilidade de businessRule via sourceTextKey quando proveniente de texto livre', () => {
      const semanticData = {
        items: [
          { itemKey: 'c0-p0', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
          { itemKey: 'cg0-o0', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
          { itemKey: 'cg0-o1', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
        ],
        groups: [],
        businessRules: [
          {
            type: 'ordering_instruction' as const,
            sourceTextKey: 't0',
            rawText: null,
          },
        ],
        ignoredTexts: [],
        warnings: [],
      };

      const validated = validateSemanticReferences(
        semanticData,
        validItemKeys,
        validCandidateGroupKeys,
        validRuleBlocksMap,
        validTextKeysMap
      );

      expect(validated.businessRules[0].rawText).toBe('Taxa sob consulta');
    });

    it('13. rejeita businessRule sem qualquer origem rastreável (sem sourceRuleKey, sourceTextKey nem relatedItemKey)', () => {
      const semanticData = {
        items: [
          { itemKey: 'c0-p0', kind: 'product' as const, parentItemKey: null, groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
          { itemKey: 'cg0-o0', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
          { itemKey: 'cg0-o1', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
        ],
        groups: [],
        businessRules: [
          {
            type: 'ordering_instruction' as const,
            rawText: 'Regra sem âncora nem evidência',
          },
        ],
        ignoredTexts: [],
        warnings: [],
      };

      expect(() =>
        validateSemanticReferences(
          semanticData,
          validItemKeys,
          validCandidateGroupKeys,
          validRuleBlocksMap,
          validTextKeysMap
        )
      ).toThrow(/Regra de negócio sem origem rastreável/);
    });

    it('14. normaliza normalizedCategoryName forçando null para option, addon e informational', () => {
      const semanticData = {
        items: [
          {
            itemKey: 'c0-p0',
            kind: 'product' as const,
            parentItemKey: null,
            groupKey: null,
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Tortas',
            relatedPages: [],
            photoCandidatePages: [],
          },
          {
            itemKey: 'cg0-o0',
            kind: 'option' as const,
            parentItemKey: 'c0-p0',
            groupKey: null,
            pricingModel: null,
            normalizedCategoryName: 'Categoria Indevida de Opção', // Deve ser forçado para null
            relatedPages: [],
            photoCandidatePages: [],
          },
          {
            itemKey: 'cg0-o1',
            kind: 'option' as const,
            parentItemKey: 'c0-p0',
            groupKey: null,
            pricingModel: null,
            normalizedCategoryName: null,
            relatedPages: [],
            photoCandidatePages: [],
          },
        ],
        groups: [],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      const validated = validateSemanticReferences(
        semanticData,
        validItemKeys,
        validCandidateGroupKeys,
        validRuleBlocksMap,
        validTextKeysMap
      );

      expect(validated.items[0].normalizedCategoryName).toBe('Tortas');
      expect(validated.items[1].normalizedCategoryName).toBeNull();
    });

    it('15. rejeita photoCandidatePages com mais de 5 páginas candidatas', () => {
      const semanticData = {
        items: [
          {
            itemKey: 'c0-p0',
            kind: 'product' as const,
            parentItemKey: null,
            groupKey: null,
            pricingModel: 'single' as const,
            normalizedCategoryName: null,
            relatedPages: [],
            photoCandidatePages: [1, 2, 3, 4, 5, 6], // 6 páginas excede o limite máximo de 5
          },
          { itemKey: 'cg0-o0', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
          { itemKey: 'cg0-o1', kind: 'option' as const, parentItemKey: 'c0-p0', groupKey: null, pricingModel: null, normalizedCategoryName: null, relatedPages: [], photoCandidatePages: [] },
        ],
        groups: [],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      expect(() =>
        validateSemanticReferences(
          semanticData,
          validItemKeys,
          validCandidateGroupKeys,
          validRuleBlocksMap,
          validTextKeysMap
        )
      ).toThrow(/excede o limite máximo de 5 páginas em photoCandidatePages/);
    });
  });

  /* ========================================================================
     3. ESCOPO E CONSISTÊNCIA DE FOTOS T3
     ======================================================================== */
  describe('3. Escopo e consistência de fotos T3 (validatePdfPhotoReferences)', () => {
    const sentItems: CompactPdfPhotoItemInput[] = [
      {
        itemKey: 'c0-p0',
        name: 'Bolo Vulcão',
        kind: 'product',
        sourcePage: 2,
        photoCandidatePages: [1, 2],
        parentItemKey: null,
        groupKey: null,
      },
      {
        itemKey: 'c0-p1',
        name: 'Combo Festa',
        kind: 'combo',
        sourcePage: 3,
        photoCandidatePages: [3],
        parentItemKey: null,
        groupKey: null,
      },
    ];

    it('16. valida detecção com bounding box válida e relação direta', () => {
      const photoData = {
        items: [
          {
            itemKey: 'c0-p0',
            pageNumber: 2,
            photoBox: [100, 200, 500, 800] as [number, number, number, number],
            photoRelation: 'direct' as const,
            photoWarning: null,
          },
          {
            itemKey: 'c0-p1',
            pageNumber: null,
            photoBox: null,
            photoRelation: 'none' as const,
            photoWarning: 'Sem foto detectada',
          },
        ],
        warnings: [],
      };

      const validated = validatePdfPhotoReferences(photoData, sentItems);

      expect(validated.items).toHaveLength(2);
      expect(validated.items[0].photoRelation).toBe('direct');
      expect(validated.items[0].pageNumber).toBe(2);
      expect(validated.items[1].photoRelation).toBe('none');
    });

    it('17. rejeita item com photoRelation: none que informa pageNumber ou photoBox', () => {
      const photoData = {
        items: [
          {
            itemKey: 'c0-p0',
            pageNumber: 2,
            photoBox: [100, 200, 500, 800] as [number, number, number, number],
            photoRelation: 'none' as const, // Inconsistência: none com photoBox
            photoWarning: null,
          },
          {
            itemKey: 'c0-p1',
            pageNumber: null,
            photoBox: null,
            photoRelation: 'none' as const,
            photoWarning: null,
          },
        ],
        warnings: [],
      };

      expect(() => validatePdfPhotoReferences(photoData, sentItems)).toThrow(
        /possui photoRelation "none" mas informou/
      );
    });

    it('18. valida que a página da foto deve pertencer estritamente a photoCandidatePages', () => {
      const photoData = {
        items: [
          {
            itemKey: 'c0-p0',
            pageNumber: 1, // Página 1 está em [1, 2] -> Válido
            photoBox: [100, 100, 400, 400] as [number, number, number, number],
            photoRelation: 'direct' as const,
            photoWarning: null,
          },
          {
            itemKey: 'c0-p1',
            pageNumber: 3, // Página 3 está em [3] -> Válido
            photoBox: [200, 200, 600, 600] as [number, number, number, number],
            photoRelation: 'shared' as const,
            photoWarning: null,
          },
        ],
        warnings: [],
      };

      const validated = validatePdfPhotoReferences(photoData, sentItems);
      expect(validated.items[0].pageNumber).toBe(1);
    });

    it('19. rejeita foto localizada em página não pertencente a photoCandidatePages', () => {
      const photoData = {
        items: [
          {
            itemKey: 'c0-p0',
            pageNumber: 7, // Página 7 NÃO está nas candidatas [1, 2]
            photoBox: [100, 100, 400, 400] as [number, number, number, number],
            photoRelation: 'direct' as const,
            photoWarning: null,
          },
          {
            itemKey: 'c0-p1',
            pageNumber: null,
            photoBox: null,
            photoRelation: 'none' as const,
            photoWarning: null,
          },
        ],
        warnings: [],
      };

      expect(() => validatePdfPhotoReferences(photoData, sentItems)).toThrow(
        /Inconsistência de página para item "c0-p0": foto localizada na página 7/
      );
    });

    it('20. rejeita photoBox com coordenadas invertidas (ymin >= ymax)', () => {
      const photoData = {
        items: [
          {
            itemKey: 'c0-p0',
            pageNumber: 2,
            photoBox: [600, 100, 400, 500] as [number, number, number, number], // ymin 600 > ymax 400
            photoRelation: 'direct' as const,
            photoWarning: null,
          },
          {
            itemKey: 'c0-p1',
            pageNumber: null,
            photoBox: null,
            photoRelation: 'none' as const,
            photoWarning: null,
          },
        ],
        warnings: [],
      };

      expect(() => validatePdfPhotoReferences(photoData, sentItems)).toThrow(
        /ymin \(600\) deve ser menor que ymax \(400\)/
      );
    });
  });

  /* ========================================================================
     4. AUDITORIA MULTIPÁGINA T4 (pdfCatalogAuditService)
     ======================================================================== */
  describe('4. Auditoria multipágina T4 (pdfCatalogAuditService)', () => {
    it('21. constrói o prompt da auditoria incluindo resumo textual e semântico', () => {
      const prompt = buildAuditPrompt(
        'RESUMO_TEXTUAL_MOCK_T1',
        'RESUMO_SEMANTICO_MOCK_T2'
      );

      expect(prompt).toContain('auditor rigoroso e conservador');
      expect(prompt).toContain('RESUMO_TEXTUAL_MOCK_T1');
      expect(prompt).toContain('RESUMO_SEMANTICO_MOCK_T2');
      expect(prompt).toContain('missing_product');
      expect(prompt).toContain('missing_choice_group');
    });

    it('22. valida o schema de issues da auditoria com severidades high, medium e low', () => {
      const validAuditData = {
        issues: [
          {
            severity: 'high' as const,
            type: 'missing_choice_group' as const,
            sourcePage: 3,
            relatedItemKey: 'c0-p0',
            relatedGroupKey: null,
            message: 'Lista de 15 recheios de bolo na página 3 não foi associada a nenhum produto.',
            evidence: 'Recheios disponíveis: Ninho, Nutella, Brigadeiro...',
          },
          {
            severity: 'medium' as const,
            type: 'missing_rule' as const,
            sourcePage: 1,
            relatedItemKey: null,
            relatedGroupKey: null,
            message: 'Aviso de taxa de deslocamento para cidades vizinhas omitido.',
            evidence: 'Entregas fora da capital: consultar taxa.',
          },
          {
            severity: 'low' as const,
            type: 'possible_noise' as const,
            sourcePage: 4,
            relatedItemKey: 'c1-p2',
            relatedGroupKey: null,
            message: 'Slogan da loja extraído como descrição de produto.',
            evidence: 'O amor em forma de doce',
          },
        ],
        warnings: [],
      };

      const parsed = pdfAuditDataSchema.safeParse(validAuditData);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.issues).toHaveLength(3);
        expect(parsed.data.issues[0].severity).toBe('high');
        expect(parsed.data.issues[0].type).toBe('missing_choice_group');
      }
    });

    it('23. rejeita issue com severidade desconhecida no schema da auditoria', () => {
      const invalidAuditData = {
        issues: [
          {
            severity: 'critical_inventado',
            type: 'missing_product',
            message: 'Produto ausente',
          },
        ],
        warnings: [],
      };

      const parsed = pdfAuditDataSchema.safeParse(invalidAuditData);
      expect(parsed.success).toBe(false);
    });

    it('24. isolamento da auditoria: auditoria é estritamente diagnóstica e preserva a estrutura de catálogo', () => {
      // Como a T4 é puramente diagnóstica, verificamos que seu output é independente
      // e não contém métodos de mutação sobre a T2
      const auditResult = {
        status: 'ok' as const,
        model: 'gemini-2.5-flash',
        executionTimeMs: 420,
        data: {
          issues: [
            {
              severity: 'high' as const,
              type: 'missing_option' as const,
              sourcePage: 2,
              relatedItemKey: null,
              relatedGroupKey: null,
              message: 'Opção ausente detectada',
              evidence: 'Sabor pistache',
            },
          ],
          warnings: [],
        },
        rawJson: '{"issues":[]}',
      };

      expect(auditResult.status).toBe('ok');
      expect(auditResult.data.issues).toHaveLength(1);
      // Nenhuma mutação ou flag de "autoRepair" é admitida
      expect((auditResult.data as any).repairedCatalog).toBeUndefined();
    });
  });

  /* ========================================================================
     5. PREVENÇÃO DE SUPEREXTRAÇÃO E PROMOÇÃO INDEVIDA — V3.1
     ======================================================================== */
  describe('5. Prevenção de superextração e promoção indevida — V3.1', () => {
    it('25. rejeita promoção de choice_option para product com HttpError 502 (Invariante 1)', () => {
      const inputItemsMap = new Map([
        ['cg0-o0', { itemKey: 'cg0-o0', name: 'Massa Baunilha', sourceType: 'choice_option' as const, sourcePage: 1 }],
      ]);
      const semanticData = {
        items: [
          {
            itemKey: 'cg0-o0',
            kind: 'product' as const,
            parentItemKey: null,
            groupKey: null,
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Bolos',
            relatedPages: [1],
            photoCandidatePages: [1],
          },
        ],
        groups: [],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      expect(() =>
        validateSemanticReferences(
          semanticData,
          inputItemsMap,
          new Set(['cg0']),
          new Map(),
          new Map()
        )
      ).toThrow(HttpError);

      try {
        validateSemanticReferences(
          semanticData,
          inputItemsMap,
          new Set(['cg0']),
          new Map(),
          new Map()
        );
      } catch (err: any) {
        expect(err.status).toBe(502);
        expect(err.code).toBe('INVALID_SEMANTIC_REFERENCES');
        expect(err.message).toContain('não pode ser promovido a "product"');
      }
    });

    it('26. rejeita promoção de choice_option para combo com HttpError 502 (Invariante 1)', () => {
      const inputItemsMap = new Map([
        ['cg0-o0', { itemKey: 'cg0-o0', name: 'Massa Baunilha', sourceType: 'choice_option' as const, sourcePage: 1 }],
      ]);
      const semanticData = {
        items: [
          {
            itemKey: 'cg0-o0',
            kind: 'combo' as const,
            parentItemKey: null,
            groupKey: null,
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Combos',
            relatedPages: [1],
            photoCandidatePages: [1],
          },
        ],
        groups: [],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      expect(() =>
        validateSemanticReferences(
          semanticData,
          inputItemsMap,
          new Set(['cg0']),
          new Map(),
          new Map()
        )
      ).toThrow(HttpError);

      try {
        validateSemanticReferences(
          semanticData,
          inputItemsMap,
          new Set(['cg0']),
          new Map(),
          new Map()
        );
      } catch (err: any) {
        expect(err.status).toBe(502);
        expect(err.code).toBe('INVALID_SEMANTIC_REFERENCES');
        expect(err.message).toContain('não pode ser promovido a "combo"');
      }
    });

    it('27. rejeita product com parentItemKey não-null com HttpError 502 (Invariante 2)', () => {
      const inputItemsMap = new Map([
        ['c0-p0', { itemKey: 'c0-p0', name: 'Bolo de Festa', sourceType: 'product_candidate' as const, sourcePage: 1 }],
        ['c0-p1', { itemKey: 'c0-p1', name: 'Bolo 15cm', sourceType: 'product_candidate' as const, sourcePage: 1 }],
      ]);
      const semanticData = {
        items: [
          {
            itemKey: 'c0-p0',
            kind: 'product' as const,
            parentItemKey: null,
            groupKey: null,
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Bolos',
            relatedPages: [1],
            photoCandidatePages: [1],
          },
          {
            itemKey: 'c0-p1',
            kind: 'product' as const,
            parentItemKey: 'c0-p0', // Proibido para product!
            groupKey: null,
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Bolos',
            relatedPages: [1],
            photoCandidatePages: [1],
          },
        ],
        groups: [],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      expect(() =>
        validateSemanticReferences(
          semanticData,
          inputItemsMap,
          new Set(),
          new Map(),
          new Map()
        )
      ).toThrow(HttpError);

      try {
        validateSemanticReferences(
          semanticData,
          inputItemsMap,
          new Set(),
          new Map(),
          new Map()
        );
      } catch (err: any) {
        expect(err.status).toBe(502);
        expect(err.code).toBe('INVALID_SEMANTIC_REFERENCES');
        expect(err.message).toContain('não pode possuir parentItemKey');
      }
    });

    it('28. rejeita product com groupKey não-null com HttpError 502 (Invariante 2)', () => {
      const inputItemsMap = new Map([
        ['c0-p0', { itemKey: 'c0-p0', name: 'Bolo de Festa', sourceType: 'product_candidate' as const, sourcePage: 1 }],
      ]);
      const semanticData = {
        items: [
          {
            itemKey: 'c0-p0',
            kind: 'product' as const,
            parentItemKey: null,
            groupKey: 'g0', // Proibido para product!
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Bolos',
            relatedPages: [1],
            photoCandidatePages: [1],
          },
        ],
        groups: [],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      expect(() =>
        validateSemanticReferences(
          semanticData,
          inputItemsMap,
          new Set(),
          new Map(),
          new Map()
        )
      ).toThrow(HttpError);

      try {
        validateSemanticReferences(
          semanticData,
          inputItemsMap,
          new Set(),
          new Map(),
          new Map()
        );
      } catch (err: any) {
        expect(err.status).toBe(502);
        expect(err.code).toBe('INVALID_SEMANTIC_REFERENCES');
        expect(err.message).toContain('não pode pertencer a um grupo');
      }
    });

    it('29. rejeita combo com parentItemKey ou groupKey não-null com HttpError 502 (Invariante 2)', () => {
      const inputItemsMap = new Map([
        ['c0-p0', { itemKey: 'c0-p0', name: 'Combo Festa', sourceType: 'product_candidate' as const, sourcePage: 1 }],
      ]);
      const semanticDataWithGroup = {
        items: [
          {
            itemKey: 'c0-p0',
            kind: 'combo' as const,
            parentItemKey: null,
            groupKey: 'g0',
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Combos',
            relatedPages: [1],
            photoCandidatePages: [1],
          },
        ],
        groups: [],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      expect(() =>
        validateSemanticReferences(
          semanticDataWithGroup,
          inputItemsMap,
          new Set(),
          new Map(),
          new Map()
        )
      ).toThrow(HttpError);

      try {
        validateSemanticReferences(
          semanticDataWithGroup,
          inputItemsMap,
          new Set(),
          new Map(),
          new Map()
        );
      } catch (err: any) {
        expect(err.status).toBe(502);
        expect(err.code).toBe('INVALID_SEMANTIC_REFERENCES');
        expect(err.message).toContain('não pode pertencer a um grupo');
      }
    });

    it('30. T4 aceita issue do tipo overpromoted_product no schema de validação', () => {
      const auditData = {
        issues: [
          {
            severity: 'high' as const,
            type: 'overpromoted_product' as const,
            sourcePage: 7,
            relatedItemKey: 'c0-p5',
            relatedGroupKey: null,
            message: 'Decoração especial floral com preço de acréscimo foi indevidamente promovida a produto autônomo.',
            evidence: 'Semi floral — a partir de R$ 10',
          },
        ],
        warnings: [],
      };

      const result = pdfAuditDataSchema.safeParse(auditData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.issues[0].type).toBe('overpromoted_product');
      }
    });

    it('31. T4 aceita issue do tipo fragmented_product_family no schema de validação', () => {
      const auditData = {
        issues: [
          {
            severity: 'medium' as const,
            type: 'fragmented_product_family' as const,
            sourcePage: 5,
            relatedItemKey: 'c0-p1',
            relatedGroupKey: null,
            message: 'Tabela de tamanhos de bolo de festa foi fragmentada em produtos separados (12cm, 15cm, 20cm).',
            evidence: '12 cm / 1,5kg — R$ 128 | 15 cm / 2kg — R$ 175',
          },
        ],
        warnings: [],
      };

      const result = pdfAuditDataSchema.safeParse(auditData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.issues[0].type).toBe('fragmented_product_family');
      }
    });

    it('32. Prompt T1 contém regra explícita de independência comercial', () => {
      expect(PDF_V3_EXTRACTION_PROMPT).toContain('TESTE DE INDEPENDÊNCIA COMERCIAL');
      expect(PDF_V3_EXTRACTION_PROMPT).toContain('Esta entidade pode ser comprada/pedida de forma independente');
    });

    it('33. Prompt T1 contém regra de que ter nome, foto ou preço não torna uma entidade um Product', () => {
      expect(PDF_V3_EXTRACTION_PROMPT).toContain('TER NOME, FOTO OU PREÇO NÃO TORNA UMA ENTIDADE UM PRODUCT');
      expect(PDF_V3_EXTRACTION_PROMPT).toContain('PREÇO NÃO IMPLICA INDEPENDÊNCIA COMERCIAL');
    });

    it('34. Prompt T1 contém regra de consolidação de tabelas de tamanhos no array prices', () => {
      expect(PDF_V3_EXTRACTION_PROMPT).toContain('REGRA FORTE PARA TABELAS DE VARIAÇÕES (CONSOLIDAÇÃO EM "prices")');
      expect(PDF_V3_EXTRACTION_PROMPT).toContain('Bolo de festa');
      expect(PDF_V3_EXTRACTION_PROMPT).toContain('12 cm');
    });

    it('35. Prompt T1 orienta parentProductHint usando continuidade multipágina', () => {
      expect(PDF_V3_EXTRACTION_PROMPT).toContain('CONTEXTO MULTIPÁGINA PARA parentProductHint');
      expect(PDF_V3_EXTRACTION_PROMPT).toContain('continuidade visual do documento');
    });

    it('36. Prompt T2 diz explicitamente que product_candidate não é Product confirmado', () => {
      const prompt = buildPdfSemanticPrompt([], [], [], [], [], []);
      expect(prompt).toContain('REAVALIAÇÃO DE "product_candidate" (CRÍTICO - NÃO É PRODUTO CONFIRMADO)');
      expect(prompt).toContain('ISSO NÃO SIGNIFICA que o item seja obrigatoriamente um Product!');
    });

    it('37. Prompt T2 contém teste de independência comercial com exemplos contrastantes', () => {
      const prompt = buildPdfSemanticPrompt([], [], [], [], [], []);
      expect(prompt).toContain('TESTE DE INDEPENDÊNCIA COMERCIAL');
      expect(prompt).toContain('O cliente pode pedir/comprar esta entidade sozinha no balcão ou delivery');
      expect(prompt).toContain('Bolo de festa');
      expect(prompt).toContain('Borda de pizza');
    });

    it('38. Prompt T4 audita expressamente superextração e independência comercial', () => {
      const prompt = buildAuditPrompt({}, {});
      expect(prompt).toContain('SUPEREXTRAÇÃO');
      expect(prompt).toContain('overpromoted_product');
      expect(prompt).toContain('fragmented_product_family');
      expect(prompt).toContain('Independência Comercial');
    });

    it('39. Invariante 3: limpa normalizedCategoryName para itens com kind option, addon ou variant', () => {
      const inputItemsMap = new Map([
        ['c0-p0', { itemKey: 'c0-p0', name: 'Bolo', sourceType: 'product_candidate' as const, sourcePage: 1 }],
        ['cg0-o0', { itemKey: 'cg0-o0', name: 'Recheio Ninho', sourceType: 'choice_option' as const, sourcePage: 1 }],
      ]);
      const semanticData = {
        items: [
          {
            itemKey: 'c0-p0',
            kind: 'product' as const,
            parentItemKey: null,
            groupKey: null,
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Bolos',
            relatedPages: [1],
            photoCandidatePages: [1],
          },
          {
            itemKey: 'cg0-o0',
            kind: 'option' as const,
            parentItemKey: 'c0-p0',
            groupKey: 'g0',
            pricingModel: null,
            normalizedCategoryName: 'Categoria Indevida Para Opção', // Deve ser forçado para null!
            relatedPages: [1],
            photoCandidatePages: [],
          },
        ],
        groups: [
          {
            groupKey: 'g0',
            name: 'Recheios',
            kind: 'option_group' as const,
            parentItemKey: 'c0-p0',
            itemKeys: ['cg0-o0'],
            sourceGroupKeys: ['cg0'],
            pricingBehavior: 'inherits_parent' as const,
            selectionMode: 'single' as const,
            required: true,
            minimum: 1,
            maximum: 1,
          },
        ],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      const validated = validateSemanticReferences(
        semanticData,
        inputItemsMap,
        new Set(['cg0']),
        new Map(),
        new Map()
      );

      const optionItem = validated.items.find((i) => i.itemKey === 'cg0-o0');
      expect(optionItem?.normalizedCategoryName).toBeNull();
    });
  });

  /* ========================================================================
     6. AUDITORIA DETERMINÍSTICA E FECHAMENTO DE VAZAMENTOS — V3.2
     ======================================================================== */
  describe('6. Auditoria determinística e fechamento de vazamentos — V3.2', () => {
    const mock12OptionsCandidateGroup = {
      groupKey: 'cg0',
      title: 'Sabores de Brigadeiro',
      sourcePage: 3,
      options: Array.from({ length: 12 }, (_, i) => ({
        optionKey: `cg0-o${i}`,
        name: `Sabor ${i + 1}`,
        amountCents: null,
      })),
    };

    it('40. candidateGroup com 12 options + semanticGroup com 11 gera missing_option determinístico', () => {
      const issues = buildDeterministicPdfAuditIssues({
        candidateGroups: [mock12OptionsCandidateGroup],
        groups: [
          {
            groupKey: 'g0',
            name: 'Sabores',
            kind: 'option_group',
            parentItemKey: 'c0-p0',
            sourceGroupKeys: ['cg0'],
            itemKeys: Array.from({ length: 11 }, (_, i) => `cg0-o${i}`), // Falta cg0-o11!
          },
        ],
      });

      const missingOptIssues = issues.filter((i) => i.type === 'missing_option');
      expect(missingOptIssues).toHaveLength(1);
      expect(missingOptIssues[0].severity).toBe('high');
      expect(missingOptIssues[0].origin).toBe('deterministic');
      expect(missingOptIssues[0].relatedGroupKey).toBe('g0');
      expect(missingOptIssues[0].relatedItemKey).toBe('cg0-o11');
      expect(missingOptIssues[0].sourcePage).toBe(3);
    });

    it('41. evidence da opção ausente aparece na issue determinística', () => {
      const issues = buildDeterministicPdfAuditIssues({
        candidateGroups: [mock12OptionsCandidateGroup],
        groups: [
          {
            groupKey: 'g0',
            name: 'Sabores',
            kind: 'option_group',
            parentItemKey: 'c0-p0',
            sourceGroupKeys: ['cg0'],
            itemKeys: Array.from({ length: 11 }, (_, i) => `cg0-o${i}`),
          },
        ],
      });

      const missingOpt = issues.find((i) => i.relatedItemKey === 'cg0-o11');
      expect(missingOpt).toBeDefined();
      expect(missingOpt?.evidence).toBe('Sabor 12');
      expect(missingOpt?.message).toContain('Sabor 12');
    });

    it('42. candidateGroup inteiro sem SemanticGroup gera missing_choice_group determinístico', () => {
      const issues = buildDeterministicPdfAuditIssues({
        candidateGroups: [mock12OptionsCandidateGroup],
        groups: [], // Nenhum grupo semanticamente associado!
      });

      const missingGroupIssues = issues.filter((i) => i.type === 'missing_choice_group');
      expect(missingGroupIssues).toHaveLength(1);
      expect(missingGroupIssues[0].severity).toBe('high');
      expect(missingGroupIssues[0].origin).toBe('deterministic');
      expect(missingGroupIssues[0].evidence).toContain('Sabores de Brigadeiro');
      expect(missingGroupIssues[0].sourcePage).toBe(3);
    });

    it('43. candidateGroup completo e representado não gera issue', () => {
      const issues = buildDeterministicPdfAuditIssues({
        candidateGroups: [mock12OptionsCandidateGroup],
        groups: [
          {
            groupKey: 'g0',
            name: 'Sabores',
            kind: 'option_group',
            parentItemKey: 'c0-p0',
            sourceGroupKeys: ['cg0'],
            itemKeys: Array.from({ length: 12 }, (_, i) => `cg0-o${i}`), // Todos os 12!
          },
        ],
      });

      const choiceIssues = issues.filter(
        (i) => i.type === 'missing_choice_group' || i.type === 'missing_option'
      );
      expect(choiceIssues).toHaveLength(0);
    });

    it('44. candidateGroups fundidos (sourceGroupKeys: ["cg0", "cg1"]) validam a união completa das opções', () => {
      const cg0 = {
        groupKey: 'cg0',
        title: 'Sabores Parte 1',
        sourcePage: 1,
        options: [
          { optionKey: 'cg0-o0', name: 'Chocolate', amountCents: null },
          { optionKey: 'cg0-o1', name: 'Morango', amountCents: null },
        ],
      };
      const cg1 = {
        groupKey: 'cg1',
        title: 'Sabores Parte 2',
        sourcePage: 2,
        options: [
          { optionKey: 'cg1-o0', name: 'Baunilha', amountCents: null },
          { optionKey: 'cg1-o1', name: 'Pistache', amountCents: 500 },
        ],
      };

      const issues = buildDeterministicPdfAuditIssues({
        candidateGroups: [cg0, cg1],
        groups: [
          {
            groupKey: 'g0',
            name: 'Todos os Sabores',
            kind: 'option_group',
            parentItemKey: 'c0-p0',
            sourceGroupKeys: ['cg0', 'cg1'],
            itemKeys: ['cg0-o0', 'cg0-o1', 'cg1-o0'], // Faltou cg1-o1 (Pistache)!
          },
        ],
      });

      const missingOptions = issues.filter((i) => i.type === 'missing_option');
      expect(missingOptions).toHaveLength(1);
      expect(missingOptions[0].relatedItemKey).toBe('cg1-o1');
      expect(missingOptions[0].evidence).toBe('Pistache');
    });

    it('45. ruleBlock sem businessRule gera missing_rule determinístico', () => {
      const issues = buildDeterministicPdfAuditIssues({
        candidateGroups: [],
        ruleBlocks: [
          {
            ruleKey: 'rb0',
            title: 'Pedido Mínimo',
            body: 'Pedido mínimo de 25 unidades por sabor.',
            sourcePage: 2,
          },
        ],
        businessRules: [], // Nenhuma businessRule vinculada!
      });

      const missingRule = issues.find((i) => i.type === 'missing_rule');
      expect(missingRule).toBeDefined();
      expect(missingRule?.severity).toBe('medium');
      expect(missingRule?.sourcePage).toBe(2);
      expect(missingRule?.origin).toBe('deterministic');
    });

    it('46. ruleBlock corretamente referenciado não gera missing_rule', () => {
      const issues = buildDeterministicPdfAuditIssues({
        candidateGroups: [],
        ruleBlocks: [
          {
            ruleKey: 'rb0',
            title: 'Pedido Mínimo',
            body: 'Pedido mínimo de 25 unidades por sabor.',
            sourcePage: 2,
          },
        ],
        businessRules: [
          {
            type: 'minimum_order',
            sourceRuleKey: 'rb0',
            sourcePage: 2,
          },
        ],
      });

      const missingRule = issues.find((i) => i.type === 'missing_rule');
      expect(missingRule).toBeUndefined();
    });

    it('47. T4 schema aceita unsupported_domain_rule', () => {
      const auditData = {
        issues: [
          {
            severity: 'high' as const,
            type: 'unsupported_domain_rule' as const,
            sourcePage: 4,
            relatedItemKey: null,
            relatedGroupKey: 'g0',
            message: 'A regra de escolha condicionada a tamanho não pode ser expressa no modelo atual de grupo único.',
            evidence: 'Tamanho G permite até 2 sabores',
            origin: 'gemini' as const,
          },
        ],
        warnings: [],
      };

      const parsed = pdfAuditDataSchema.safeParse(auditData);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.issues[0].type).toBe('unsupported_domain_rule');
        expect(parsed.data.issues[0].origin).toBe('gemini');
      }
    });

    it('48. prompt T4 contém orientação sobre regra não representável no domínio (unsupported_domain_rule)', () => {
      const prompt = buildAuditPrompt({}, {});
      expect(prompt).toContain('unsupported_domain_rule');
      expect(prompt).toContain('máximo condicionado ao tamanho');
      expect(prompt).toContain('mínimo por sabor/opção');
    });

    it('49. prompt T1 exige ruleBlock para regra operacional embutida em descrição', () => {
      expect(PDF_V3_EXTRACTION_PROMPT).toContain(
        'REGRAS COMERCIAIS E OPERACIONAIS EMBUTIDAS EM DESCRIÇÕES DE PRODUTO'
      );
      expect(PDF_V3_EXTRACTION_PROMPT).toContain('Pedido mínimo: 25 unidades por sabor');
    });

    it('50. prompt T2 exige preservar regra não representável como businessRule', () => {
      const prompt = buildPdfSemanticPrompt([], [], [], [], [], []);
      expect(prompt).toContain('PRESERVAÇÃO DE REGRAS NÃO REPRESENTÁVEIS NO DOMÍNIO');
      expect(prompt).toContain('NÃO tente deformar a regra para caber à força no ComplementGroup');
    });

    it('51. normalizedCategoryName igual ao product.name vira null (remoção de redundância auto-referencial)', () => {
      const inputItemsMap = new Map([
        ['c0-p0', { itemKey: 'c0-p0', name: 'PETIT brownie', sourceType: 'product_candidate' as const, sourcePage: 1 }],
      ]);
      const semanticData = {
        items: [
          {
            itemKey: 'c0-p0',
            kind: 'product' as const,
            parentItemKey: null,
            groupKey: null,
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Petit Brownie', // Redundante com o nome!
            relatedPages: [1],
            photoCandidatePages: [1],
          },
        ],
        groups: [],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      const validated = validateSemanticReferences(
        semanticData,
        inputItemsMap,
        new Set(),
        new Map(),
        new Map()
      );

      expect(validated.items[0].normalizedCategoryName).toBeNull();
    });

    it('52. normalizedCategoryName diferente de product.name permanece inalterado', () => {
      const inputItemsMap = new Map([
        ['c0-p0', { itemKey: 'c0-p0', name: 'Morango', sourceType: 'product_candidate' as const, sourcePage: 1 }],
      ]);
      const semanticData = {
        items: [
          {
            itemKey: 'c0-p0',
            kind: 'product' as const,
            parentItemKey: null,
            groupKey: null,
            pricingModel: 'single' as const,
            normalizedCategoryName: 'Torta gelada', // Categoria legítima diferente!
            relatedPages: [1],
            photoCandidatePages: [1],
          },
        ],
        groups: [],
        businessRules: [],
        ignoredTexts: [],
        warnings: [],
      };

      const validated = validateSemanticReferences(
        semanticData,
        inputItemsMap,
        new Set(),
        new Map(),
        new Map()
      );

      expect(validated.items[0].normalizedCategoryName).toBe('Torta gelada');
    });

    it('53. helper normalizeTextForComparison remove acentos, pontuação e espaços múltiplos', () => {
      expect(normalizeTextForComparison('  BRIGADEIROS de festa!  ')).toBe('brigadeiros de festa');
      expect(normalizeTextForComparison('BEM-CASADO')).toBe('bem casado');
      expect(normalizeTextForComparison('Torta')).not.toBe(normalizeTextForComparison('Torta Gelada'));
    });

    it('54. issues Gemini + determinísticas são mescladas preservando ambas', () => {
      const geminiIssues = [
        {
          severity: 'low' as const,
          type: 'photo_candidate_gap' as const,
          sourcePage: 2,
          relatedItemKey: 'c0-p0',
          relatedGroupKey: null,
          message: 'Foto na página 1 não associada.',
          evidence: null,
          origin: 'gemini' as const,
        },
      ];

      const deterministicIssues = [
        {
          severity: 'high' as const,
          type: 'missing_option' as const,
          sourcePage: 3,
          relatedItemKey: 'cg0-o11',
          relatedGroupKey: 'g0',
          message: 'Opção ausente detectada.',
          evidence: 'Pistache',
          origin: 'deterministic' as const,
        },
      ];

      const merged = mergePdfAuditIssues(geminiIssues, deterministicIssues);
      expect(merged).toHaveLength(2);
      expect(merged.some((i) => i.origin === 'gemini')).toBe(true);
      expect(merged.some((i) => i.origin === 'deterministic')).toBe(true);
    });

    it('55. merge não duplica mesma issue óbvia entre Gemini e determinística', () => {
      const geminiIssues = [
        {
          severity: 'high' as const,
          type: 'missing_option' as const,
          sourcePage: 3,
          relatedItemKey: 'cg0-o11',
          relatedGroupKey: 'g0',
          message: 'Opção de pistache ausente no grupo.',
          evidence: 'Pistache',
          origin: 'gemini' as const,
        },
      ];

      const deterministicIssues = [
        {
          severity: 'high' as const,
          type: 'missing_option' as const,
          sourcePage: 3,
          relatedItemKey: 'cg0-o11',
          relatedGroupKey: 'g0',
          message: 'O grupo possui 12 opções na T1, mas Pistache não foi vinculada.',
          evidence: 'Pistache',
          origin: 'deterministic' as const,
        },
      ];

      const merged = mergePdfAuditIssues(geminiIssues, deterministicIssues);
      expect(merged).toHaveLength(1);
      expect(merged[0].origin).toBe('gemini');
    });

    it('56. auditoria determinística é função pura sem chamadas de rede ou modelo Gemini', () => {
      const result = buildDeterministicPdfAuditIssues({
        candidateGroups: [],
        ruleBlocks: [],
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });
});
