import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../server/middleware/errors.js';
import {
  buildLabPreprocessorContext,
  buildUnifiedAnalysisPrompt,
  V4_SYSTEM_INSTRUCTION,
  DOMAIN_NATIVE_SYSTEM_INSTRUCTION,
} from '../../server/services/catalogLabPreprocessor.js';
import {
  preflightPdfSignedUrl,
  normalizeUnifiedData,
  validateUnifiedAnalysis,
  analyzeMenuUnifiedWithGemini,
  analyzeMenuDomainNativeWithGemini,
} from '../../server/services/catalogLabUnifiedService.js';
import { domainNativeJsonSchema } from '../../src/lib/catalogImportDomain.js';
import { emanueleConfeitariaDomainRawFixture } from '../fixtures/catalogImportFixtures.js';

const toArrayBuffer = (buf: Buffer): ArrayBuffer =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

describe('Laboratório IA de Cardápio — V4 UNIFIED / SINGLE-PASS', () => {
  /* ========================================================================
     1. PRÉ-PROCESSADOR DETERMINÍSTICO E CAPACIDADES DE DOMÍNIO
     ======================================================================== */
  describe('1. Pré-processador determinístico (catalogLabPreprocessor)', () => {
    it('1. constrói o contexto com capacidades do Pode Vir incluindo Product e ComplementGroup', () => {
      const context = buildLabPreprocessorContext({
        sourceType: 'pdf',
        tenantId: 'tenant-test-1',
        filename: 'cardapio.pdf',
        fileSizeBytes: 2048576,
        pageCount: 3,
      });

      expect(context.sourceType).toBe('pdf');
      expect(context.tenantId).toBe('tenant-test-1');
      expect(context.capabilities.maxProductsPerCategory).toBe(100);
      expect(context.capabilities.supportedEntities).toContain('Product');
      expect(context.capabilities.supportedEntities).toContain('ComplementGroup');
      expect(context.capabilities.supportedEntities).toContain('BusinessRule');
      expect(context.capabilities.supportedOptionKinds).toEqual(['option', 'variant', 'addon']);
      expect(context.capabilities.supportedPricingModels).toContain('size_variants');
      expect(context.capabilities.supportedPricingModels).toContain('quantity_tiers');
      expect(context.domainRules.length).toBeGreaterThan(0);
    });

    it('2. inclui regras estritas de isolamento comercial e independência entre lojas', () => {
      const context = buildLabPreprocessorContext({
        sourceType: 'image',
        tenantId: 'store-abc',
      });

      const isolationRule = context.domainRules.find((r) =>
        r.toLowerCase().includes('isolamento') || r.toLowerCase().includes('tenant')
      );
      expect(isolationRule).toBeDefined();
    });

    it('3. buildUnifiedAnalysisPrompt inclui instruções explícitas de 1 única inferência e structured output', () => {
      const context = buildLabPreprocessorContext({
        sourceType: 'pdf',
        tenantId: 'test-store',
        pageCount: 4,
      });
      const prompt = buildUnifiedAnalysisPrompt(context);

      expect(prompt).toContain('1 (UMA) ÚNICA INFERÊNCIA MULTIMODAL');
      expect(prompt).toContain('EVIDÊNCIAS DE ENTRADA (CANDIDATES, GROUPS, RULES)');
      expect(prompt).toContain('CATÁLOGO COMERCIAL FINAL');
      expect(prompt).toContain('FOTOS COM CORRESPONDÊNCIA');
      expect(prompt).toContain('NÃO transforme opções, sabores ou adicionais em produtos');
      expect(prompt).toContain('Páginas totais informadas no contexto: 4');
    });

    it('4. V4_SYSTEM_INSTRUCTION define a identidade de especialista em cardápios do Pode Vir', () => {
      expect(V4_SYSTEM_INSTRUCTION).toContain('Pode Vir');
      expect(V4_SYSTEM_INSTRUCTION).toContain('NÃO invente');
      expect(V4_SYSTEM_INSTRUCTION).toContain('Interactions API');
    });
  });

  /* ========================================================================
     2. PREFLIGHT HTTP RANGE DO PDF VIA SIGNED URL
     ======================================================================== */
  describe('2. Preflight HTTP Range do PDF (preflightPdfSignedUrl)', () => {
    it('5. aceita resposta HTTP 206 com cabeçalho %PDF- e content-range dentro do limite', async () => {
      const fakePdfHeader = '%PDF-1.7\n%âãÏÓ\n1 0 obj\n';
      const fakeBuffer = Buffer.from(fakePdfHeader, 'utf-8');

      const mockFetch = vi.fn().mockResolvedValue({
        status: 206,
        ok: true,
        headers: {
          get: (header: string) => {
            if (header.toLowerCase() === 'content-range') return 'bytes 0-1023/5242880';
            if (header.toLowerCase() === 'content-type') return 'application/pdf';
            return null;
          },
        },
        arrayBuffer: async () => toArrayBuffer(fakeBuffer),
      });

      const result = await preflightPdfSignedUrl('https://storage.example.com/menu.pdf?token=xyz', mockFetch as any);

      expect(result.isValidPdf).toBe(true);
      expect(result.headerSnippet).toBe('%PDF-1.7');
      expect(result.detectedSizeBytes).toBe(5242880);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://storage.example.com/menu.pdf?token=xyz',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Range: 'bytes=0-1023' }),
        })
      );
    });

    it('6. aceita resposta HTTP 200 com magic number %PDF- quando servidor ignora range mas tem tamanho válido', async () => {
      const fakePdfHeader = '%PDF-1.4\n%header\n';
      const fakeBuffer = Buffer.from(fakePdfHeader, 'utf-8');

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: {
          get: (header: string) => {
            if (header.toLowerCase() === 'content-length') return '10485760';
            if (header.toLowerCase() === 'content-type') return 'application/pdf';
            return null;
          },
        },
        arrayBuffer: async () => toArrayBuffer(fakeBuffer),
      });

      const result = await preflightPdfSignedUrl('https://storage.example.com/menu.pdf', mockFetch as any);

      expect(result.isValidPdf).toBe(true);
      expect(result.headerSnippet).toBe('%PDF-1.4');
      expect(result.detectedSizeBytes).toBe(10485760);
    });

    it('7. rejeita com HttpError 422 se o cabeçalho não iniciar com %PDF-', async () => {
      const fakeHtmlHeader = '<!DOCTYPE html><html><head><title>Error</title></head>';
      const fakeBuffer = Buffer.from(fakeHtmlHeader, 'utf-8');

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: {
          get: () => 'text/html',
        },
        arrayBuffer: async () => toArrayBuffer(fakeBuffer),
      });

      await expect(
        preflightPdfSignedUrl('https://storage.example.com/error.html', mockFetch as any)
      ).rejects.toThrow(HttpError);
    });

    it('8. rejeita com HttpError 413 se o tamanho informado pelo header for maior que 20 MiB', async () => {
      const fakePdfHeader = '%PDF-1.5\n';
      const fakeBuffer = Buffer.from(fakePdfHeader, 'utf-8');
      const largeSizeBytes = 25 * 1024 * 1024; // 25 MiB

      const mockFetch = vi.fn().mockResolvedValue({
        status: 206,
        ok: true,
        headers: {
          get: (h: string) => (h.toLowerCase() === 'content-range' ? `bytes 0-1023/${largeSizeBytes}` : null),
        },
        arrayBuffer: async () => toArrayBuffer(fakeBuffer),
      });

      await expect(
        preflightPdfSignedUrl('https://storage.example.com/large.pdf', mockFetch as any)
      ).rejects.toThrow(HttpError);
    });
  });

  /* ========================================================================
     3. NORMALIZAÇÃO DETERMINÍSTICA E GERAÇÃO DE IDS (normalizeUnifiedData)
     ======================================================================== */
  describe('3. Normalização determinística e resiliência (normalizeUnifiedData)', () => {
    it('9. gera chaves determinísticas para produtos (p0, p1), grupos (g0), opções (g0-o0) e regras (r0)', () => {
      const rawOutput: any = {
        isMenu: true,
        document: {
          globalTitle: 'Doceria da Maria',
          globalTitleRole: 'brand',
          sections: [{ name: 'Bolos Vulcão', role: 'category', sourcePages: [1] }],
          pageCoverage: [{ pageNumber: 1, role: 'menu', hasCatalogEvidence: true, notes: null }],
        },
        evidence: {
          productCandidates: [
            {
              name: 'Bolo Vulcão Ninho',
              description: 'Bolo fofinho com ninho',
              sourcePages: [1],
              categoryHint: 'Bolos Vulcão',
              prices: [{ amountCents: 4500, rawText: 'R$ 45,00', label: null, prefix: null, unit: null }],
            },
          ],
          choiceGroups: [
            {
              title: 'Adicionais',
              sourcePages: [1],
              instruction: 'Escolha até 2',
              parentProductHint: 'Bolo Vulcão Ninho',
              options: [{ name: 'Morango Extra', amountCents: 500, priceRawText: '+R$ 5,00' }],
            },
          ],
          ruleBlocks: [
            {
              title: 'Encomendas',
              body: 'Pedidos com 24h de antecedência',
              sourcePages: [1],
            },
          ],
          residualTexts: [],
        },
        catalog: {
          products: [
            {
              sourceProductIndexes: [0],
              kind: 'product',
              pricingModel: 'single',
              name: 'Bolo Vulcão Ninho',
              description: 'Bolo fofinho com ninho',
              categoryName: 'Bolos Vulcão',
              prices: [{ amountCents: 4500, rawText: 'R$ 45,00', label: null, prefix: null, unit: null }],
              sourcePages: [1],
              relatedPages: [],
            },
          ],
          groups: [
            {
              parentProductIndex: 0,
              sourceChoiceGroupIndexes: [0],
              name: 'Adicionais',
              kind: 'addon_group',
              pricingBehavior: 'own_price_per_item',
              selectionMode: 'multiple',
              required: false,
              minimum: 0,
              maximum: 2,
              options: [
                {
                  sourceChoiceGroupIndex: 0,
                  sourceOptionIndex: 0,
                  name: 'Morango Extra',
                  amountCents: 500,
                  rawPrice: '+R$ 5,00',
                  semanticKind: 'addon',
                },
              ],
            },
          ],
          businessRules: [
            {
              sourceRuleIndex: 0,
              type: 'advance_notice',
              rawText: 'Pedidos com 24h de antecedência',
              sourcePage: 1,
              parentProductIndex: null,
              groupIndex: null,
            },
          ],
        },
        photos: [
          {
            productIndex: 0,
            pageNumber: 1,
            photoBox: [100, 100, 400, 400],
            photoRelation: 'direct',
            photoWarning: null,
          },
        ],
        reviewFlags: [],
        warnings: [],
      };

      const result = normalizeUnifiedData(rawOutput);

      expect(result.normalizedData.catalog.products[0].productKey).toBe('p0');
      expect(result.normalizedData.catalog.groups[0].groupKey).toBe('g0');
      expect(result.normalizedData.catalog.groups[0].parentProductKey).toBe('p0');
      expect(result.normalizedData.catalog.groups[0].options[0].optionKey).toBe('g0-o0');
      expect(result.normalizedData.catalog.businessRules[0].ruleKey).toBe('r0');
      expect(result.normalizedData.photos[0].productKey).toBe('p0');
      expect(result.localIssues.length).toBe(0);
    });

    it('10. higieniza categoria quando for igual ao título global ou brand (evita categoria "Doceria")', () => {
      const rawOutput: any = {
        isMenu: true,
        document: {
          globalTitle: 'Doceria da Maria',
          globalTitleRole: 'brand',
          sections: [],
          pageCoverage: [],
        },
        evidence: {
          productCandidates: [{ name: 'Brigadeiro', sourcePages: [1], prices: [{ amountCents: 500, rawText: 'R$ 5', label: null, prefix: null, unit: null }] }],
          choiceGroups: [],
          ruleBlocks: [],
          residualTexts: [],
        },
        catalog: {
          products: [
            {
              sourceProductIndexes: [0],
              kind: 'product',
              pricingModel: 'single',
              name: 'Brigadeiro',
              description: null,
              categoryName: 'Doceria da Maria', // Deve ser higienizado!
              prices: [{ amountCents: 500, rawText: 'R$ 5,00', label: null, prefix: null, unit: null }],
              sourcePages: [1],
              relatedPages: [],
            },
          ],
          groups: [],
          businessRules: [],
        },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const result = normalizeUnifiedData(rawOutput);
      expect(result.normalizedData.catalog.products[0].categoryName).toBeNull();
    });

    it('11. higieniza categoria quando for idêntica ao próprio nome do produto', () => {
      const rawOutput: any = {
        isMenu: true,
        document: {
          globalTitle: 'Cardápio',
          globalTitleRole: 'document_title',
          sections: [],
          pageCoverage: [],
        },
        evidence: {
          productCandidates: [{ name: 'Bolo Cenoura', sourcePages: [1], prices: [{ amountCents: 2000, rawText: 'R$ 20', label: null, prefix: null, unit: null }] }],
          choiceGroups: [],
          ruleBlocks: [],
          residualTexts: [],
        },
        catalog: {
          products: [
            {
              sourceProductIndexes: [0],
              kind: 'product',
              pricingModel: 'single',
              name: 'Bolo Cenoura',
              description: null,
              categoryName: 'Bolo Cenoura', // Repetição do nome!
              prices: [{ amountCents: 2000, rawText: 'R$ 20,00', label: null, prefix: null, unit: null }],
              sourcePages: [1],
              relatedPages: [],
            },
          ],
          groups: [],
          businessRules: [],
        },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const result = normalizeUnifiedData(rawOutput);
      expect(result.normalizedData.catalog.products[0].categoryName).toBeNull();
    });

    it('12. preserva categoria legítima quando for uma seção comercial válida', () => {
      const rawOutput: any = {
        isMenu: true,
        document: {
          globalTitle: 'Cardápio de Doces',
          globalTitleRole: 'document_title',
          sections: [{ name: 'Tortas Holandesas', role: 'category', sourcePages: [1] }],
          pageCoverage: [],
        },
        evidence: {
          productCandidates: [{ name: 'Torta Clássica', sourcePages: [1], prices: [{ amountCents: 8000, rawText: 'R$ 80', label: null, prefix: null, unit: null }] }],
          choiceGroups: [],
          ruleBlocks: [],
          residualTexts: [],
        },
        catalog: {
          products: [
            {
              sourceProductIndexes: [0],
              kind: 'product',
              pricingModel: 'single',
              name: 'Torta Clássica',
              description: null,
              categoryName: 'Tortas Holandesas',
              prices: [{ amountCents: 8000, rawText: 'R$ 80,00', label: null, prefix: null, unit: null }],
              sourcePages: [1],
              relatedPages: [],
            },
          ],
          groups: [],
          businessRules: [],
        },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const result = normalizeUnifiedData(rawOutput);
      expect(result.normalizedData.catalog.products[0].categoryName).toBe('Tortas Holandesas');
    });

    it('13. resiliência: índice de produto pai fora do intervalo (ex: 999) não derruba a resposta e gera issue HIGH', () => {
      const rawOutput: any = {
        isMenu: true,
        document: {
          globalTitle: null,
          globalTitleRole: 'unknown',
          sections: [],
          pageCoverage: [],
        },
        evidence: {
          productCandidates: [{ name: 'Pizza Média', sourcePages: [1], prices: [{ amountCents: 4000, rawText: 'R$ 40', label: null, prefix: null, unit: null }] }],
          choiceGroups: [{ title: 'Bordas', sourcePages: [1], options: [{ name: 'Catupiry' }] }],
          ruleBlocks: [],
          residualTexts: [],
        },
        catalog: {
          products: [
            {
              sourceProductIndexes: [0],
              kind: 'product',
              pricingModel: 'single',
              name: 'Pizza Média',
              description: null,
              categoryName: 'Pizzas',
              prices: [{ amountCents: 4000, rawText: 'R$ 40,00', label: null, prefix: null, unit: null }],
              sourcePages: [1],
              relatedPages: [],
            },
          ],
          groups: [
            {
              parentProductIndex: 999, // Índice inexistente alucinado!
              sourceChoiceGroupIndexes: [0],
              name: 'Bordas',
              kind: 'addon_group',
              pricingBehavior: 'own_price_per_item',
              selectionMode: 'single',
              required: false,
              minimum: 0,
              maximum: 1,
              options: [{ name: 'Catupiry', amountCents: 500, rawPrice: 'R$ 5', semanticKind: 'addon' }],
            },
          ],
          businessRules: [],
        },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const result = normalizeUnifiedData(rawOutput);

      expect(result.normalizedData.catalog.groups[0].parentProductKey).toBeNull();
      expect(result.normalizedData.catalog.products.length).toBe(1);
      const issue = result.localIssues.find((i) => i.type === 'invalid_index_recovered');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('high');
      expect(issue?.message).toContain('parentProductIndex inválido');
    });

    it('14. resiliência: índice de foto fora do intervalo não derruba fotos válidas', () => {
      const rawOutput: any = {
        isMenu: true,
        document: {
          globalTitle: null,
          globalTitleRole: 'unknown',
          sections: [],
          pageCoverage: [],
        },
        evidence: {
          productCandidates: [{ name: 'Hambúrguer', sourcePages: [1], prices: [{ amountCents: 3000, rawText: 'R$ 30', label: null, prefix: null, unit: null }] }],
          choiceGroups: [],
          ruleBlocks: [],
          residualTexts: [],
        },
        catalog: {
          products: [
            {
              sourceProductIndexes: [0],
              kind: 'product',
              pricingModel: 'single',
              name: 'Hambúrguer',
              description: null,
              categoryName: 'Lanches',
              prices: [{ amountCents: 3000, rawText: 'R$ 30,00', label: null, prefix: null, unit: null }],
              sourcePages: [1],
              relatedPages: [],
            },
          ],
          groups: [],
          businessRules: [],
        },
        photos: [
          {
            productIndex: 888, // Foto apontando para produto inexistente!
            pageNumber: 1,
            photoBox: [50, 50, 200, 200],
            photoRelation: 'direct',
            photoWarning: null,
          },
        ],
        reviewFlags: [],
        warnings: [],
      };

      const result = normalizeUnifiedData(rawOutput);

      expect(result.normalizedData.photos.length).toBe(0);
      const photoIssue = result.localIssues.find((i) => i.message.includes('photo com productIndex inválido') || i.message.includes('inválido'));
      expect(photoIssue).toBeDefined();
      expect(photoIssue?.severity).toBe('high');
    });
  });

  /* ========================================================================
     4. VALIDAÇÃO DETERMINÍSTICA E COBERTURA (validateUnifiedAnalysis)
     ======================================================================== */
  describe('4. Validação determinística de integridade (validateUnifiedAnalysis)', () => {
    it('15. detecta produto candidato omitido no catálogo final (missing_product HIGH)', () => {
      const normalizedData = {
        isMenu: true,
        document: { sourceType: 'pdf' as const, globalTitle: null, globalTitleRole: 'unknown' as const, pageCoverage: [], sections: [] },
        evidence: {
          productCandidates: [
            { candidateKey: 'ep0', name: 'Pizza Calabresa', description: null, sourcePages: [1], categoryHint: null, prices: [] },
            { candidateKey: 'ep1', name: 'Pizza Quatro Queijos', description: null, sourcePages: [1], categoryHint: null, prices: [] },
          ],
          choiceGroups: [],
          ruleBlocks: [],
          residualTexts: [],
        },
        catalog: {
          // Apenas a Pizza Calabresa foi levada para o catálogo
          products: [
            {
              productKey: 'p0',
              sourceProductIndexes: [0],
              kind: 'product' as const,
              pricingModel: 'single' as const,
              name: 'Pizza Calabresa',
              description: null,
              categoryName: 'Pizzas',
              prices: [{ label: null, amountCents: 5000, prefix: null, unit: null, rawText: 'R$ 50' }],
              sourcePages: [1],
              relatedPages: [],
            },
          ],
          groups: [],
          businessRules: [],
        },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const issues = validateUnifiedAnalysis(normalizedData as any);
      const missingProd = issues.find((i) => i.type === 'missing_product');

      expect(missingProd).toBeDefined();
      expect(missingProd?.severity).toBe('high');
      expect(missingProd?.message).toContain('Pizza Quatro Queijos');
    });

    it('16. detecta grupo de escolhas candidato omitido no catálogo final (missing_choice_group HIGH)', () => {
      const normalizedData = {
        isMenu: true,
        document: { sourceType: 'pdf' as const, globalTitle: null, globalTitleRole: 'unknown' as const, pageCoverage: [], sections: [] },
        evidence: {
          productCandidates: [{ candidateKey: 'ep0', name: 'Bolo Vulcão', description: null, sourcePages: [1], categoryHint: null, prices: [] }],
          choiceGroups: [
            { groupKey: 'eg0', title: 'Massas Disponíveis', sourcePages: [1], instruction: null, parentProductHint: null, options: [{ optionKey: 'eg0-o0', name: 'Chocolate' }] },
          ],
          ruleBlocks: [],
          residualTexts: [],
        },
        catalog: {
          products: [
            {
              productKey: 'p0',
              sourceProductIndexes: [0],
              kind: 'product' as const,
              pricingModel: 'single' as const,
              name: 'Bolo Vulcão',
              description: null,
              categoryName: null,
              prices: [{ label: null, amountCents: 4000, prefix: null, unit: null, rawText: 'R$ 40' }],
              sourcePages: [1],
              relatedPages: [],
            },
          ],
          groups: [], // Omitiu o grupo de Massas!
          businessRules: [],
        },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const issues = validateUnifiedAnalysis(normalizedData as any);
      const missingGroup = issues.find((i) => i.type === 'missing_choice_group');

      expect(missingGroup).toBeDefined();
      expect(missingGroup?.severity).toBe('high');
      expect(missingGroup?.message).toContain('Massas Disponíveis');
    });

    it('17. detecta regra de negócio omitida e atribui severidade MEDIUM por padrão determinístico sem regex', () => {
      const normalizedData = {
        isMenu: true,
        document: { sourceType: 'pdf' as const, globalTitle: null, globalTitleRole: 'unknown' as const, pageCoverage: [], sections: [] },
        evidence: {
          productCandidates: [],
          choiceGroups: [],
          ruleBlocks: [
            { ruleKey: 'er0', title: 'Pedido Mínimo', body: 'Pedido mínimo de 50 reais para entrega', sourcePages: [1] },
          ],
          residualTexts: [],
        },
        catalog: {
          products: [],
          groups: [],
          businessRules: [], // Regra omitida!
        },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const issues = validateUnifiedAnalysis(normalizedData as any);
      const missingRule = issues.find((i) => i.type === 'missing_rule');

      expect(missingRule).toBeDefined();
      expect(missingRule?.severity).toBe('medium'); // Default limpo sem regex
      expect(missingRule?.message).toContain('Pedido Mínimo');
    });

    it('18. detecta produto sem preço cadastrado (missing_price MEDIUM)', () => {
      const normalizedData = {
        isMenu: true,
        document: { sourceType: 'image' as const, globalTitle: null, globalTitleRole: 'unknown' as const, pageCoverage: [], sections: [] },
        evidence: { productCandidates: [], choiceGroups: [], ruleBlocks: [], residualTexts: [] },
        catalog: {
          products: [
            {
              productKey: 'p0',
              sourceProductIndexes: [0],
              kind: 'product' as const,
              pricingModel: 'single' as const,
              name: 'Pastel Especial',
              description: null,
              categoryName: null,
              prices: [], // Sem preço!
              sourcePages: [1],
              relatedPages: [],
            },
          ],
          groups: [],
          businessRules: [],
        },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const issues = validateUnifiedAnalysis(normalizedData as any);
      const missingPrice = issues.find((i) => i.type === 'missing_price');

      expect(missingPrice).toBeDefined();
      expect(missingPrice?.severity).toBe('medium');
      expect(missingPrice?.message).toContain('Pastel Especial');
    });
  });

  /* ========================================================================
     5. INFERÊNCIA UNIFICADA GEMINI (ai.interactions.create)
     ======================================================================== */
  describe('5. Integração com Gemini Interactions API (analyzeMenuUnifiedWithGemini)', () => {
    it('19. para PDF: executa exatamente 1 chamada a ai.interactions.create com type: document e mime_type: application/pdf', async () => {
      const mockRawOutput: any = {
        isMenu: true,
        document: { globalTitle: 'Menu', globalTitleRole: 'document_title', sections: [], pageCoverage: [] },
        evidence: { productCandidates: [], choiceGroups: [], ruleBlocks: [], residualTexts: [] },
        catalog: { products: [], groups: [], businessRules: [] },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const mockCreateInteraction = vi.fn().mockResolvedValue({
        output_text: JSON.stringify(mockRawOutput),
        usage: { prompt_tokens: 1200, candidates_tokens: 450, total_tokens: 1650 },
      });

      const mockAi = {
        interactions: {
          create: mockCreateInteraction,
        },
      };

      // Mock preflight fetch
      const fakePdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n', 'utf-8');
      const mockPreflightFetch = vi.fn().mockResolvedValue({
        status: 206,
        ok: true,
        headers: { get: () => 'bytes 0-1023/1048576' },
        arrayBuffer: async () => toArrayBuffer(fakePdfBuffer),
      });

      const result = await analyzeMenuUnifiedWithGemini({
        sourceType: 'pdf',
        tenantId: 'test-tenant',
        pdfSignedUrl: 'https://storage.supabase.co/tenant/test.pdf?token=secret123',
        aiClient: mockAi as any,
        fetchClient: mockPreflightFetch as any,
      });

      expect(result.pipeline).toBe('v4_unified');
      expect(result.modelRequestCount).toBe(1);
      expect(result.inputTransport).toBe('signed_url');
      expect(result.usage?.inputTokens).toBe(1200);
      expect(result.usage?.outputTokens).toBe(450);
      expect(mockCreateInteraction).toHaveBeenCalledTimes(1);

      // Valida argumentos enviados à Interactions API
      const interactionArgs = mockCreateInteraction.mock.calls[0][0];
      expect(interactionArgs.model).toBe('gemini-2.5-flash');
      expect(interactionArgs.input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'document',
            uri: 'https://storage.supabase.co/tenant/test.pdf?token=secret123',
            mime_type: 'application/pdf',
          }),
        ])
      );
    });

    it('20. para Imagem: executa exatamente 1 chamada a ai.interactions.create com type: image (sem generateContent)', async () => {
      const mockRawOutput: any = {
        isMenu: true,
        document: { globalTitle: 'Lanchonete', globalTitleRole: 'brand', sections: [], pageCoverage: [] },
        evidence: { productCandidates: [], choiceGroups: [], ruleBlocks: [], residualTexts: [] },
        catalog: { products: [], groups: [], businessRules: [] },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const mockCreateInteraction = vi.fn().mockResolvedValue({
        output_text: JSON.stringify(mockRawOutput),
        usage: { prompt_tokens: 800, candidates_tokens: 300, total_tokens: 1100 },
      });

      const mockAi = {
        interactions: {
          create: mockCreateInteraction,
        },
      };

      const result = await analyzeMenuUnifiedWithGemini({
        sourceType: 'image',
        tenantId: 'test-tenant',
        imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        imageMimeType: 'image/png',
        aiClient: mockAi as any,
      });

      expect(result.pipeline).toBe('v4_unified');
      expect(result.modelRequestCount).toBe(1);
      expect(result.inputTransport).toBe('inline');
      expect(result.usage?.totalTokens).toBe(1100);
      expect(mockCreateInteraction).toHaveBeenCalledTimes(1);

      const interactionArgs = mockCreateInteraction.mock.calls[0][0];
      expect(interactionArgs.input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'image',
            mime_type: 'image/png',
          }),
        ])
      );
    });

    it('21. medição de tempo: executionTimeMs e inferenceTimeMs são números válidos', async () => {
      const mockRawOutput: any = {
        isMenu: true,
        document: { globalTitle: null, globalTitleRole: 'unknown', sections: [], pageCoverage: [] },
        evidence: { productCandidates: [], choiceGroups: [], ruleBlocks: [], residualTexts: [] },
        catalog: { products: [], groups: [], businessRules: [] },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const mockAi = {
        interactions: {
          create: vi.fn().mockResolvedValue({
            output_text: JSON.stringify(mockRawOutput),
          }),
        },
      };

      const result = await analyzeMenuUnifiedWithGemini({
        sourceType: 'image',
        tenantId: 'tenant-perf',
        imageBase64: 'abc',
        imageMimeType: 'image/jpeg',
        aiClient: mockAi as any,
      });

      expect(typeof result.executionTimeMs).toBe('number');
      expect(typeof result.inferenceTimeMs).toBe('number');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.inferenceTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('22. nunca vaza signed URL ou segredos em campos de retorno ou mensagens', async () => {
      const secretSignedUrl = 'https://supabase.co/storage/v1/object/sign/temp-catalog-pdf/secret_pdf.pdf?token=SUPER_SECRET_TOKEN_123';
      const mockRawOutput: any = {
        isMenu: true,
        document: { globalTitle: 'Teste', globalTitleRole: 'document_title', sections: [], pageCoverage: [] },
        evidence: { productCandidates: [], choiceGroups: [], ruleBlocks: [], residualTexts: [] },
        catalog: { products: [], groups: [], businessRules: [] },
        photos: [],
        reviewFlags: [],
        warnings: [],
      };

      const mockAi = {
        interactions: {
          create: vi.fn().mockResolvedValue({
            output_text: JSON.stringify(mockRawOutput),
          }),
        },
      };

      const fakePdfBuffer = Buffer.from('%PDF-1.4\n', 'utf-8');
      const mockFetch = vi.fn().mockResolvedValue({
        status: 206,
        ok: true,
        headers: { get: () => 'bytes 0-1023/1000' },
        arrayBuffer: async () => toArrayBuffer(fakePdfBuffer),
      });

      const result = await analyzeMenuUnifiedWithGemini({
        sourceType: 'pdf',
        tenantId: 'tenant-sec',
        pdfSignedUrl: secretSignedUrl,
        aiClient: mockAi as any,
        fetchClient: mockFetch as any,
      });

      const resultSerialized = JSON.stringify(result);
      expect(resultSerialized).not.toContain('SUPER_SECRET_TOKEN_123');
      expect(resultSerialized).not.toContain('secret_pdf.pdf');
    });

    it('23. falha com erro tratável quando saída do modelo for JSON inválido', async () => {
      const mockAi = {
        interactions: {
          create: vi.fn().mockResolvedValue({
            output_text: 'MALFORMED_JSON_STRING',
          }),
        },
      };

      await expect(
        analyzeMenuUnifiedWithGemini({
          sourceType: 'image',
          tenantId: 'tenant-err',
          imageBase64: 'abc',
          imageMimeType: 'image/jpeg',
          aiClient: mockAi as any,
        })
      ).rejects.toThrow('A IA não retornou uma resposta estruturada válida');
    });

    it('24. lida com resposta is_menu: false de forma limpa sem quebrar', async () => {
      const mockRawOutput: any = {
        isMenu: false,
        document: { globalTitle: null, globalTitleRole: 'unknown', sections: [], pageCoverage: [] },
        evidence: { productCandidates: [], choiceGroups: [], ruleBlocks: [], residualTexts: [] },
        catalog: { products: [], groups: [], businessRules: [] },
        photos: [],
        reviewFlags: [{ severity: 'high', type: 'not_a_menu', message: 'Documento parece ser um boleto bancário' }],
        warnings: ['O documento enviado não contém itens de cardápio comercial.'],
      };

      const mockAi = {
        interactions: {
          create: vi.fn().mockResolvedValue({
            output_text: JSON.stringify(mockRawOutput),
          }),
        },
      };

      const result = await analyzeMenuUnifiedWithGemini({
        sourceType: 'image',
        tenantId: 'tenant-not-menu',
        imageBase64: 'abc',
        imageMimeType: 'image/jpeg',
        aiClient: mockAi as any,
      });

      expect(result.data.isMenu).toBe(false);
      expect(result.data.catalog.products.length).toBe(0);
      expect(result.reviewFlags[0].type).toBe('not_a_menu');
    });

    it('25. fotos 1:1: apenas produtos de catálogo elegíveis recebem foto associada', () => {
      const rawOutput: any = {
        isMenu: true,
        document: { globalTitle: null, globalTitleRole: 'unknown', sections: [], pageCoverage: [] },
        evidence: {
          productCandidates: [
            { name: 'Combo Casal', sourcePages: [1], prices: [{ amountCents: 7000, rawText: 'R$ 70', label: null, prefix: null, unit: null }] },
            { name: 'Coca-Cola 2L', sourcePages: [1], prices: [{ amountCents: 1200, rawText: 'R$ 12', label: null, prefix: null, unit: null }] },
          ],
          choiceGroups: [],
          ruleBlocks: [],
          residualTexts: [],
        },
        catalog: {
          products: [
            {
              sourceProductIndexes: [0],
              kind: 'combo',
              pricingModel: 'single',
              name: 'Combo Casal',
              description: null,
              categoryName: 'Combos',
              prices: [{ amountCents: 7000, rawText: 'R$ 70,00', label: null, prefix: null, unit: null }],
              sourcePages: [1],
              relatedPages: [],
            },
            {
              sourceProductIndexes: [1],
              kind: 'product',
              pricingModel: 'single',
              name: 'Coca-Cola 2L',
              description: null,
              categoryName: 'Bebidas',
              prices: [{ amountCents: 1200, rawText: 'R$ 12,00', label: null, prefix: null, unit: null }],
              sourcePages: [1],
              relatedPages: [],
            },
          ],
          groups: [],
          businessRules: [],
        },
        photos: [
          {
            productIndex: 0,
            pageNumber: 1,
            photoBox: [10, 10, 200, 200],
            photoRelation: 'direct',
            photoWarning: null,
          },
          {
            productIndex: 1,
            pageNumber: 1,
            photoBox: null,
            photoRelation: 'none',
            photoWarning: 'Foto não encontrada na página',
          },
        ],
        reviewFlags: [],
        warnings: [],
      };

      const result = normalizeUnifiedData(rawOutput);

      expect(result.normalizedData.photos.length).toBe(2);
      expect(result.normalizedData.photos[0].productKey).toBe('p0');
      expect(result.normalizedData.photos[0].photoRelation).toBe('direct');
      expect(result.normalizedData.photos[1].productKey).toBe('p1');
      expect(result.normalizedData.photos[1].photoRelation).toBe('none');
    });
  });

  /* ========================================================================
     6. INTEGRAÇÃO DOMAIN_NATIVE (analyzeMenuDomainNativeWithGemini)
     ======================================================================== */
  describe('6. Integração com Gemini Interactions API — Pipeline DOMAIN_NATIVE', () => {
    it('26. para PDF: executa exatamente 1 chamada com thinking MEDIUM, Signed URL e schema Domain-Native', async () => {
      const mockCreateInteraction = vi.fn().mockResolvedValue({
        output_text: JSON.stringify(emanueleConfeitariaDomainRawFixture),
        usage: { prompt_tokens: 2500, candidates_tokens: 1800, total_tokens: 4300 },
      });

      const mockAi = {
        interactions: {
          create: mockCreateInteraction,
        },
      };

      const fakePdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n', 'utf-8');
      const mockPreflightFetch = vi.fn().mockResolvedValue({
        status: 206,
        ok: true,
        headers: { get: () => 'bytes 0-1023/1048576' },
        arrayBuffer: async () => toArrayBuffer(fakePdfBuffer),
      });

      const result = await analyzeMenuDomainNativeWithGemini({
        sourceType: 'pdf',
        tenantId: 'test-tenant',
        signedUrl: 'https://storage.supabase.co/catalog-import-temp/tenant/cardapio.pdf?token=secret123',
        aiClient: mockAi as any,
        fetchClient: mockPreflightFetch as any,
      });

      // 1 única chamada ao modelo
      expect(mockCreateInteraction).toHaveBeenCalledTimes(1);
      expect(result.pipeline).toBe('domain_native');
      expect(result.modelRequestCount).toBe(1);
      expect(result.inputTransport).toBe('signed_url');
      expect(result.thinkingLevel).toBe('medium');
      expect(result.success).toBe(true);

      // Validação detalhada do payload enviado para ai.interactions.create
      const payload = mockCreateInteraction.mock.calls[0][0];
      expect(payload.model).toBe('gemini-2.5-flash');
      expect(payload.system_instruction).toBe(DOMAIN_NATIVE_SYSTEM_INSTRUCTION);

      // Transport do PDF: Signed URL como documento
      expect(payload.input[0]).toEqual({
        type: 'document',
        uri: 'https://storage.supabase.co/catalog-import-temp/tenant/cardapio.pdf?token=secret123',
        mime_type: 'application/pdf',
      });
      expect(payload.input[1].type).toBe('text');

      // Structured Output preservado
      expect(payload.response_format).toEqual({
        type: 'text',
        mime_type: 'application/json',
        schema: domainNativeJsonSchema,
      });

      // Thinking MEDIUM explicitamente configurado em generation_config
      expect(payload.generation_config).toEqual({
        max_output_tokens: 16384,
        thinking_level: 'medium',
      });
    });

    it('27. para Imagem: executa exatamente 1 chamada com imagem inline base64 e thinking MEDIUM', async () => {
      const mockCreateInteraction = vi.fn().mockResolvedValue({
        output_text: JSON.stringify(emanueleConfeitariaDomainRawFixture),
        usage: { prompt_tokens: 1500, candidates_tokens: 1200, total_tokens: 2700 },
      });

      const mockAi = {
        interactions: {
          create: mockCreateInteraction,
        },
      };

      const result = await analyzeMenuDomainNativeWithGemini({
        sourceType: 'image',
        tenantId: 'test-tenant',
        imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        imageMimeType: 'image/png',
        aiClient: mockAi as any,
      });

      // 1 única chamada ao modelo
      expect(mockCreateInteraction).toHaveBeenCalledTimes(1);
      expect(result.pipeline).toBe('domain_native');
      expect(result.modelRequestCount).toBe(1);
      expect(result.inputTransport).toBe('inline');
      expect(result.thinkingLevel).toBe('medium');

      // Payload da imagem inline
      const payload = mockCreateInteraction.mock.calls[0][0];
      expect(payload.input[0]).toEqual({
        type: 'image',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        mime_type: 'image/png',
      });
      expect(payload.input[1].type).toBe('text');

      // Structured Output e thinking MEDIUM
      expect(payload.response_format.type).toBe('text');
      expect(payload.response_format.mime_type).toBe('application/json');
      expect(payload.response_format.schema).toBe(domainNativeJsonSchema);
      expect(payload.generation_config.thinking_level).toBe('medium');
    });
  });
});
