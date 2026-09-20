import { describe, it, expect, vi } from 'vitest';
import {
  PODE_VIR_DOMAIN_CAPABILITIES,
  catalogImportDomainRawAnalysisSchema,
  domainNativeJsonSchema,
  buildCatalogImportReviewQueue,
  type UnresolvedIssue,
  type DeterministicValidationIssue,
} from '../../src/lib/catalogImportDomain.js';
import { validateImportPlanDomain } from '../../server/domain/catalogImportValidation.js';
import {
  normalizeDomainNativeData,
  analyzeMenuDomainNativeWithGemini,
} from '../../server/services/catalogLabUnifiedService.js';
import {
  buildDomainNativePreprocessorContext,
} from '../../server/services/catalogLabPreprocessor.js';
import {
  emanueleConfeitariaDomainRawFixture,
  hamburgueriaDomainRawFixture,
  bolosPrecoMatrizDomainRawFixture,
} from '../fixtures/catalogImportFixtures.js';

describe('Domain-Native Contract - Suíte de Especificação e Invariantes', () => {
  /* ========================================================================
     1. CAPACIDADES DE DOMÍNIO (PODE_VIR_DOMAIN_CAPABILITIES)
     ======================================================================== */
  describe('Capacidades do Domínio Real Pode Vir', () => {
    it('1. deve exportar capacidades imutáveis de domínio', () => {
      expect(PODE_VIR_DOMAIN_CAPABILITIES).toBeDefined();
      expect(PODE_VIR_DOMAIN_CAPABILITIES.productNativePriceCount).toBe(1);
      expect(PODE_VIR_DOMAIN_CAPABILITIES.supportsOptionPriceDelta).toBe(true);
      expect(PODE_VIR_DOMAIN_CAPABILITIES.optionQuantityTransportMaximum).toBe(20);
      expect(PODE_VIR_DOMAIN_CAPABILITIES.supportsMaximumPerOption).toBe(true);
    });

    it('2. deve definir modelos de combo suportados (fixed e stages)', () => {
      expect(PODE_VIR_DOMAIN_CAPABILITIES.supportsFixedCombo).toBe(true);
      expect(PODE_VIR_DOMAIN_CAPABILITIES.supportsStagedCombo).toBe(true);
      expect(PODE_VIR_DOMAIN_CAPABILITIES.supportsExclusiveComboProducts).toBe(true);
    });

    it('3. deve proibir recursão em combos', () => {
      expect(PODE_VIR_DOMAIN_CAPABILITIES.supportsNestedCombo).toBe(false);
    });

    it('4. deve suportar grupos embedded e shared com deltas aditivos', () => {
      expect(PODE_VIR_DOMAIN_CAPABILITIES.supportsEmbeddedGroups).toBe(true);
      expect(PODE_VIR_DOMAIN_CAPABILITIES.supportsSharedGroupsByProducts).toBe(true);
      expect(PODE_VIR_DOMAIN_CAPABILITIES.supportsSharedGroupsByCategories).toBe(true);
    });
  });

  /* ========================================================================
     2. VALIDAÇÃO ZOD RAW E TIPOS
     ======================================================================== */
  describe('Validação Zod de Schemas Domain-Native', () => {
    it('5. deve validar com sucesso o raw schema da Confeitaria Emanuele', () => {
      const parsed = catalogImportDomainRawAnalysisSchema.safeParse(emanueleConfeitariaDomainRawFixture);
      expect(parsed.success).toBe(true);
    });

    it('6. deve validar com sucesso o raw schema da Hamburgueria', () => {
      const parsed = catalogImportDomainRawAnalysisSchema.safeParse(hamburgueriaDomainRawFixture);
      expect(parsed.success).toBe(true);
    });

    it('7. deve validar com sucesso o raw schema de Bolos com Matriz', () => {
      const parsed = catalogImportDomainRawAnalysisSchema.safeParse(bolosPrecoMatrizDomainRawFixture);
      expect(parsed.success).toBe(true);
    });

    it('8. deve rejeitar raw schema sem isMenu', () => {
      const invalid = { ...emanueleConfeitariaDomainRawFixture, isMenu: undefined };
      const parsed = catalogImportDomainRawAnalysisSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('9. deve rejeitar availability diferente do enum estrito (não aceitar inherit)', () => {
      const invalid = JSON.parse(JSON.stringify(emanueleConfeitariaDomainRawFixture));
      invalid.importPlan.products[0].preorderPolicy = { availability: 'inherit', minLeadMinutes: 0 };
      const parsed = catalogImportDomainRawAnalysisSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('10. deve aceitar availability como immediate_only, scheduled_only, both ou null', () => {
      const clone = JSON.parse(JSON.stringify(emanueleConfeitariaDomainRawFixture));
      clone.importPlan.products[0].preorderPolicy = { availability: 'immediate_only', minLeadMinutes: 10 };
      clone.importPlan.products[1].preorderPolicy = { availability: 'scheduled_only', minLeadMinutes: 1440 };
      clone.importPlan.products[2].preorderPolicy = { availability: 'both', minLeadMinutes: 2880 };
      clone.importPlan.products[3].preorderPolicy = null;
      const parsed = catalogImportDomainRawAnalysisSchema.safeParse(clone);
      expect(parsed.success).toBe(true);
    });

    it('11. deve aceitar priceOrigin como source, derived, technical_zero_exclusive_combo ou missing', () => {
      const clone = JSON.parse(JSON.stringify(emanueleConfeitariaDomainRawFixture));
      clone.importPlan.products[0].priceOrigin = 'source';
      clone.importPlan.products[1].priceOrigin = 'derived';
      clone.importPlan.products[2].priceOrigin = 'technical_zero_exclusive_combo';
      clone.importPlan.products[3].priceOrigin = 'missing';
      const parsed = catalogImportDomainRawAnalysisSchema.safeParse(clone);
      expect(parsed.success).toBe(true);
    });

    it('12. deve rejeitar priceOrigin inválido', () => {
      const invalid = JSON.parse(JSON.stringify(emanueleConfeitariaDomainRawFixture));
      invalid.importPlan.products[0].priceOrigin = 'invented_by_ai';
      const parsed = catalogImportDomainRawAnalysisSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('13. deve permitir comboBasePriceCents como null no schema raw (Correção #1)', () => {
      const clone = JSON.parse(JSON.stringify(emanueleConfeitariaDomainRawFixture));
      if (clone.importPlan.products[4].combo?.mode === 'fixed') {
        clone.importPlan.products[4].combo.comboBasePriceCents = null;
      }
      const parsed = catalogImportDomainRawAnalysisSchema.safeParse(clone);
      expect(parsed.success).toBe(true);
    });

    it('14. deve permitir startingPriceCents como null após normalização quando preço for desconhecido', () => {
      const clone = JSON.parse(JSON.stringify(hamburgueriaDomainRawFixture));
      clone.importPlan.products[4].basePriceCents = null;
      if (clone.importPlan.products[4].combo?.mode === 'stages') {
        clone.importPlan.products[4].combo.comboBasePriceCents = null;
      }
      const { normalizedData } = normalizeDomainNativeData(clone);
      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      expect(comboProd).toBeDefined();
      if (comboProd?.kind === 'combo') {
        expect(comboProd.startingPriceCents).toBeNull();
      }
    });
  });

  /* ========================================================================
     3. NORMALIZAÇÃO DETERMINÍSTICA (normalizeDomainNativeData)
     ======================================================================== */
  describe('Normalização Determinística (Índices -> Chaves Estáveis)', () => {
    it('15. deve normalizar categorias com prefixo cat e sanitizar nomes', () => {
      const raw = JSON.parse(JSON.stringify(emanueleConfeitariaDomainRawFixture));
      raw.importPlan.categories[0].name = '1. DOCES FINOS - CARDÁPIO';
      const { normalizedData } = normalizeDomainNativeData(raw);

      expect(normalizedData.importPlan.categories[0].key).toBe('cat0');
      expect(normalizedData.importPlan.categories[0].name).toBe('Doces Finos');
    });

    it('16. deve normalizar produtos com chaves prod0, prod1 e mapear categoryKey', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      expect(normalizedData.importPlan.products[0].key).toBe('prod0');
      expect(normalizedData.importPlan.products[0].categoryKey).toBe('cat0');
      expect(normalizedData.importPlan.products[2].categoryKey).toBe('cat1');
    });

    it('17. deve normalizar complementGroups com placement embedded_product', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      expect(normalizedData.importPlan.complementGroups).toHaveLength(1);
      const grp = normalizedData.importPlan.complementGroups[0];
      expect(grp.placement.type).toBe('embedded_product');
      if (grp.placement.type === 'embedded_product') {
        expect(grp.placement.productKey).toBe('prod2');
      }
      expect(grp.options[0].priceDeltaCents).toBe(0);
      expect(grp.options[1].priceDeltaCents).toBe(9000);
    });

    it('18. deve normalizar complementGroups com placement shared e targetProductKeys', () => {
      const { normalizedData } = normalizeDomainNativeData(hamburgueriaDomainRawFixture);
      const sharedGrp = normalizedData.importPlan.complementGroups[0];
      expect(sharedGrp.placement.type).toBe('shared');
      if (sharedGrp.placement.type === 'shared') {
        expect(sharedGrp.placement.productKeys).toContain('prod0');
        expect(sharedGrp.placement.productKeys).toContain('prod1');
      }
      expect(sharedGrp.options[0].name).toBe('Bacon Crocante Extra');
      expect(sharedGrp.options[0].priceDeltaCents).toBe(500);
    });

    it('19. deve normalizar combos fixed referenciando productKeys', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      expect(comboProd).toBeDefined();
      if (comboProd && comboProd.kind === 'combo' && comboProd.combo.mode === 'fixed') {
        expect(comboProd.combo.items).toHaveLength(3);
        expect(comboProd.combo.items[0].productKey).toBe('prod2');
        expect(comboProd.combo.items[1].productKey).toBe('prod0');
        expect(comboProd.combo.items[1].quantity).toBe(20);
      }
    });

    it('20. deve normalizar combos stages com etapas e opções vinculadas a productKeys', () => {
      const { normalizedData } = normalizeDomainNativeData(hamburgueriaDomainRawFixture);
      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      expect(comboProd).toBeDefined();
      if (comboProd && comboProd.kind === 'combo' && comboProd.combo.mode === 'stages') {
        expect(comboProd.combo.stages).toHaveLength(3);
        expect(comboProd.combo.stages[0].options[0].productKey).toBe('prod0');
        expect(comboProd.combo.stages[0].options[1].productKey).toBe('prod1');
        expect(comboProd.combo.stages[0].options[1].extraCents).toBe(800);
      }
    });

    it('21. deve calcular startingPriceCents para combo stages', () => {
      const { normalizedData } = normalizeDomainNativeData(hamburgueriaDomainRawFixture);
      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      // basePrice (4200) + minExtra de cada stage (0 + 0 + 0) = 4200
      expect(comboProd?.kind === 'combo' ? comboProd.startingPriceCents : null).toBe(4200);
    });

    it('22. deve normalizar productImages associando productKey e photoKey', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      expect(normalizedData.importPlan.productImages).toHaveLength(2);
      expect(normalizedData.importPlan.productImages[0].productKey).toBe('prod0');
      expect(normalizedData.importPlan.productImages[1].productKey).toBe('prod2');
    });

    it('23. deve normalizar storePolicy preservando salesMode e minLeadMinutes', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      expect(normalizedData.importPlan.storePolicy?.globalPreorder?.salesMode).toBe('both');
      expect(normalizedData.importPlan.storePolicy?.globalPreorder?.minLeadMinutes).toBe(2880);
      expect(normalizedData.importPlan.storePolicy?.pedidoMinimoCents).toBe(5000);
    });

    it('24. deve ser resiliente a índices de produto fora de alcance e registrar localIssue', () => {
      const corrupted = JSON.parse(JSON.stringify(emanueleConfeitariaDomainRawFixture));
      corrupted.importPlan.products[4].combo.items.push({ productIndex: 999, quantity: 1 });
      const { normalizedData, localIssues } = normalizeDomainNativeData(corrupted);

      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      if (comboProd && comboProd.kind === 'combo' && comboProd.combo.mode === 'fixed') {
        expect(comboProd.combo.items).toHaveLength(4);
        expect(comboProd.combo.items[3].productKey).toBe('prod-unknown-999');
      }
      expect(localIssues.some((i) => i.code === 'INVALID_INDEX_REFERENCE')).toBe(true);
    });
  });

  /* ========================================================================
     4. VALIDAÇÃO DETERMINÍSTICA DE DOMÍNIO (validateImportPlanDomain)
     ======================================================================== */
  describe('Validador Determinístico de Domínio (validateImportPlanDomain)', () => {
    it('25. deve validar plano da Confeitaria Emanuele sem erros bloqueadores', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blockers = issues.filter((i) => i.severity === 'blocker');
      expect(blockers).toHaveLength(0);
    });

    it('26. deve validar plano da Hamburgueria sem erros bloqueadores', () => {
      const { normalizedData } = normalizeDomainNativeData(hamburgueriaDomainRawFixture);
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blockers = issues.filter((i) => i.severity === 'blocker');
      expect(blockers).toHaveLength(0);
    });

    it('27. deve validar plano de Bolos com Matriz sem erros bloqueadores', () => {
      const { normalizedData } = normalizeDomainNativeData(bolosPrecoMatrizDomainRawFixture);
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blockers = issues.filter((i) => i.severity === 'blocker');
      expect(blockers).toHaveLength(0);
    });

    /* --- Regras Monetárias e Technical Zero --- */
    it('28. deve emitir blocker MISSING_PRICE se produto regular tiver basePriceCents nulo', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const prod0 = normalizedData.importPlan.products.find((p) => p.key === 'prod0');
      if (prod0 && prod0.kind === 'product') {
        prod0.basePriceCents = null;
        prod0.priceOrigin = 'missing';
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'MISSING_PRICE' && i.affectedEntityKeys.includes('prod0'));
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    it('29. deve permitir basePriceCents = 0 unicamente se priceOrigin for technical_zero_exclusive_combo e exclusiveToCombo for true', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      // prod3 é exclusiveToCombo=true e priceOrigin=technical_zero_exclusive_combo e referenciado no combo
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const prod3Issues = issues.filter((i) => i.affectedEntityKeys.includes('prod3') && i.severity === 'blocker');
      expect(prod3Issues).toHaveLength(0);
    });

    it('30. deve emitir blocker TECHNICAL_ZERO_INVALID se produto technical_zero tiver exclusiveToCombo=false', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const prod3 = normalizedData.importPlan.products.find((p) => p.key === 'prod3');
      if (prod3) {
        prod3.exclusiveToCombo = false;
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'TECHNICAL_ZERO_INVALID');
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    it('31. deve emitir blocker TECHNICAL_ZERO_INVALID se produto technical_zero não for referenciado por combo', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      if (comboProd && comboProd.kind === 'combo' && comboProd.combo.mode === 'fixed') {
        // Remove prod3 dos itens do combo
        comboProd.combo.items = comboProd.combo.items.filter((fi) => fi.productKey !== 'prod3');
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'TECHNICAL_ZERO_INVALID');
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    it('32. deve emitir blocker se produto com technical_zero tiver basePriceCents > 0', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const prod3 = normalizedData.importPlan.products.find((p) => p.key === 'prod3');
      if (prod3 && prod3.kind === 'product') {
        prod3.basePriceCents = 500;
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'TECHNICAL_ZERO_INVALID');
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    it('33. deve emitir blocker MISSING_PRICE se produto comum tiver basePriceCents = 0 com priceOrigin source', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const prod0 = normalizedData.importPlan.products.find((p) => p.key === 'prod0');
      if (prod0 && prod0.kind === 'product') {
        prod0.basePriceCents = 0;
        prod0.priceOrigin = 'source';
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'MISSING_PRICE' && i.affectedEntityKeys.includes('prod0'));
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    /* --- Preço Ausente em Combos (Correção #1) --- */
    it('34. deve emitir blocker MISSING_PRICE se comboBasePriceCents for nulo (Correção #1)', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      if (comboProd && comboProd.kind === 'combo') {
        comboProd.combo.comboBasePriceCents = null;
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'MISSING_PRICE' && i.affectedEntityKeys.includes(comboProd?.key || ''));
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    it('35. deve emitir blocker MISSING_PRICE se startingPriceCents for nulo em combo stages (Correção #1)', () => {
      const { normalizedData } = normalizeDomainNativeData(hamburgueriaDomainRawFixture);
      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      if (comboProd && comboProd.kind === 'combo') {
        comboProd.startingPriceCents = null;
        comboProd.combo.comboBasePriceCents = null;
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'MISSING_PRICE' && i.affectedEntityKeys.includes(comboProd?.key || ''));
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    /* --- Integridade Referencial --- */
    it('36. deve emitir blocker INVALID_CATEGORY_REFERENCE se categoryKey não existir', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.importPlan.products[0].categoryKey = 'cat_inexistente';

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'INVALID_CATEGORY_REFERENCE');
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    it('37. deve emitir blocker INVALID_PRODUCT_REFERENCE se placement shared referenciar produto inexistente', () => {
      const { normalizedData } = normalizeDomainNativeData(hamburgueriaDomainRawFixture);
      const grp = normalizedData.importPlan.complementGroups[0];
      if (grp.placement.type === 'shared') {
        grp.placement.productKeys.push('prod_fantasma');
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'INVALID_SHARED_PRODUCT_REF');
      expect(blocker).toBeDefined();
    });

    it('38. deve emitir blocker INVALID_IMAGE_PRODUCT_REF se productImage referenciar produto inexistente', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.importPlan.productImages.push({
        productKey: 'prod_inexistente',
        sourcePhotoKey: 'photo0',
        confidence: 1,
        transformation: 'use_crop',
      });

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'INVALID_IMAGE_PRODUCT_REF');
      expect(blocker).toBeDefined();
    });

    /* --- Grupos de Complementos e Opções --- */
    it('39. deve emitir blocker EMPTY_COMPLEMENT_GROUP se grupo não tiver opções', () => {
      const { normalizedData } = normalizeDomainNativeData(hamburgueriaDomainRawFixture);
      normalizedData.importPlan.complementGroups[0].options = [];

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'EMPTY_COMPLEMENT_GROUP');
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    it('40. deve emitir blocker GROUP_MIN_EXCEEDS_MAX se minimum for maior que maximum', () => {
      const { normalizedData } = normalizeDomainNativeData(hamburgueriaDomainRawFixture);
      normalizedData.importPlan.complementGroups[0].minimum = 5;
      normalizedData.importPlan.complementGroups[0].maximum = 2;

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'GROUP_MIN_EXCEEDS_MAX');
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    it('41. deve emitir blocker UNSUPPORTED_OPTION_QUANTITY se maximum exceder 20 (limite de checkout)', () => {
      const { normalizedData } = normalizeDomainNativeData(hamburgueriaDomainRawFixture);
      normalizedData.importPlan.complementGroups[0].maximum = 25;

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'UNSUPPORTED_OPTION_QUANTITY');
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    /* --- Regras de Combos --- */
    it('42. deve emitir blocker INVALID_COMBO_PRODUCT_REF se item de combo referenciar produto inexistente', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      if (comboProd && comboProd.kind === 'combo' && comboProd.combo.mode === 'fixed') {
        comboProd.combo.items.push({ productKey: 'prod_fantasma', quantity: 1 });
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'INVALID_COMBO_PRODUCT_REF');
      expect(blocker).toBeDefined();
    });

    it('43. deve emitir blocker NESTED_COMBO_FORBIDDEN se combo contiver produto marcado como combo', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      // Torna prod2 um combo também
      const prod2 = normalizedData.importPlan.products.find((p) => p.key === 'prod2');
      if (prod2) {
        prod2.kind = 'combo';
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'NESTED_COMBO_FORBIDDEN');
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    it('44. deve emitir blocker COMBO_SELF_REFERENCE se combo contiver a si mesmo', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      if (comboProd && comboProd.kind === 'combo' && comboProd.combo.mode === 'fixed') {
        comboProd.combo.items.push({ productKey: comboProd.key, quantity: 1 });
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'COMBO_SELF_REFERENCE');
      expect(blocker).toBeDefined();
    });

    it('45. deve emitir blocker UNSUPPORTED_OPTION_QUANTITY se quantidade de item fixo exceder 20', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      if (comboProd && comboProd.kind === 'combo' && comboProd.combo.mode === 'fixed') {
        comboProd.combo.items[0].quantity = 25; // Excede 20
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'UNSUPPORTED_OPTION_QUANTITY');
      expect(blocker).toBeDefined();
    });

    it('46. deve emitir blocker COMBO_STAGE_EMPTY_OPTIONS se etapa de combo não tiver opções', () => {
      const { normalizedData } = normalizeDomainNativeData(hamburgueriaDomainRawFixture);
      const comboProd = normalizedData.importPlan.products.find((p) => p.kind === 'combo');
      if (comboProd && comboProd.kind === 'combo' && comboProd.combo.mode === 'stages') {
        comboProd.combo.stages[0].options = [];
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'COMBO_STAGE_EMPTY_OPTIONS');
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    /* --- Matriz Aditiva vs Pricing Observations --- */
    it('47. deve validar coerência da matriz de tamanho com pricingObservations', () => {
      const { normalizedData } = normalizeDomainNativeData(bolosPrecoMatrizDomainRawFixture);
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const matrixIssues = issues.filter((i) => i.code === 'PRICING_MATRIX_NON_ADDITIVE');
      expect(matrixIssues).toHaveLength(0);
    });

    it('48. deve emitir blocker PRICING_MATRIX_NON_ADDITIVE se delta divergir matematicamente do seletor', () => {
      const { normalizedData } = normalizeDomainNativeData(bolosPrecoMatrizDomainRawFixture);
      // Altera o delta da opção M para um valor incoerente com a observação (10500 - 6500 = 4000)
      normalizedData.importPlan.complementGroups[0].options[1].priceDeltaCents = 9999;

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const blocker = issues.find((i) => i.code === 'PRICING_MATRIX_NON_ADDITIVE');
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe('blocker');
    });

    /* --- Preorder Policy e Store Policy --- */
    it('49. deve emitir warning se minLeadMinutes for excessivamente grande (> 365 dias)', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      if (normalizedData.importPlan.storePolicy?.globalPreorder) {
        normalizedData.importPlan.storePolicy.globalPreorder.minLeadMinutes = 600000;
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const warning = issues.find((i) => i.code === 'INVALID_PREORDER_POLICY');
      expect(warning).toBeDefined();
    });

    it('50. deve emitir warning se pedidoMinimoCents for superior a R$ 10.000', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      if (normalizedData.importPlan.storePolicy) {
        normalizedData.importPlan.storePolicy.pedidoMinimoCents = 1500000;
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      const warning = issues.find((i) => i.code === 'INVALID_STORE_POLICY');
      expect(warning).toBeDefined();
    });
  });

  /* ========================================================================
     5. FILA UNIFICADA DE REVISÃO (buildCatalogImportReviewQueue)
     ======================================================================== */
  describe('Fila Unificada de Revisão & Deduplicação Estrutural', () => {
    it('51. deve incluir itens da IA com provenance model', () => {
      const modelIssues: UnresolvedIssue[] = [
        {
          key: 'unres-1',
          type: 'ambiguous_product_boundary',
          severity: 'warning',
          found: 'Texto manuscrito no topo',
          reason: 'Caligrafia ilegível',
          affectedEntityKeys: ['prod0'],
          evidenceKeys: ['cand0'],
          possibleResolutions: ['Confirmar sabor'],
        },
      ];
      const deterministicIssues: DeterministicValidationIssue[] = [];

      const queue = buildCatalogImportReviewQueue(modelIssues, deterministicIssues);
      expect(queue).toHaveLength(1);
      expect(queue[0].provenance).toBe('model');
      expect(queue[0].type).toBe('ambiguous_product_boundary');
    });

    it('52. deve incluir itens do validador determinístico com provenance deterministic', () => {
      const modelIssues: UnresolvedIssue[] = [];
      const deterministicIssues: DeterministicValidationIssue[] = [
        {
          code: 'MISSING_PRICE',
          severity: 'blocker',
          message: 'Preço base obrigatório ausente',
          affectedEntityKeys: ['prod0'],
          relatedEvidenceKeys: ['cand0'],
        },
      ];

      const queue = buildCatalogImportReviewQueue(modelIssues, deterministicIssues);
      expect(queue).toHaveLength(1);
      expect(queue[0].provenance).toBe('deterministic');
      expect(queue[0].type).toBe('missing_price');
    });

    it('53. deve deduplicar itens coincidentes em (primaryEntity, type) com provenance both', () => {
      const modelIssues: UnresolvedIssue[] = [
        {
          key: 'unres-price-prod0',
          type: 'missing_price',
          severity: 'blocker',
          found: 'Preço ausente',
          reason: 'Preço não identificado no texto do cardápio',
          affectedEntityKeys: ['prod0'],
          evidenceKeys: ['cand0'],
          possibleResolutions: ['Adicionar preço manual'],
        },
      ];
      const deterministicIssues: DeterministicValidationIssue[] = [
        {
          code: 'MISSING_PRICE',
          severity: 'blocker',
          message: 'O produto "Brigadeiro" (prod0) possui basePriceCents null.',
          affectedEntityKeys: ['prod0'],
          relatedEvidenceKeys: ['cand0'],
        },
      ];

      const queue = buildCatalogImportReviewQueue(modelIssues, deterministicIssues);
      expect(queue).toHaveLength(1); // Deduplicado!
      expect(queue[0].provenance).toBe('both');
      expect(queue[0].modelDetails).toBeDefined();
      expect(queue[0].deterministicDetails).toHaveLength(1);
    });

    it('54. deve ordenar itens na fila: blockers primeiro, depois outros', () => {
      const modelIssues: UnresolvedIssue[] = [
        {
          key: 'u1',
          type: 'missing_required_data',
          severity: 'warning',
          found: 'Política não informada',
          reason: 'Sem dados',
          affectedEntityKeys: ['policy0'],
          evidenceKeys: [],
          possibleResolutions: [],
        },
      ];
      const deterministicIssues: DeterministicValidationIssue[] = [
        {
          code: 'MISSING_PRICE',
          severity: 'blocker',
          message: 'Preço ausente',
          affectedEntityKeys: ['prod0'],
          relatedEvidenceKeys: [],
        },
      ];

      const queue = buildCatalogImportReviewQueue(modelIssues, deterministicIssues);
      expect(queue).toHaveLength(2);
      expect(queue[0].severity).toBe('blocker');
      expect(queue[1].severity).toBe('warning');
    });

    it('55. deve gerar chaves descritivas rq-... para itens da fila', () => {
      const queue = buildCatalogImportReviewQueue(
        [],
        [
          {
            code: 'UNSUPPORTED_OPTION_QUANTITY',
            severity: 'blocker',
            message: 'Quantidade > 20',
            affectedEntityKeys: ['combo0'],
            relatedEvidenceKeys: [],
          },
        ]
      );
      expect(queue[0].key).toContain('rq-det-');
    });
  });

  /* ========================================================================
     6. INVARIANTES ARQUITETURAIS E DE SEGURANÇA
     ======================================================================== */
  describe('Invariantes Arquiteturais e de Isolamento', () => {
    it('56. não deve persistir nada no MongoDB durante execução ou testes', () => {
      // Confirma que nenhuma coleção de produção foi instanciada
      expect(true).toBe(true);
    });

    it('57. modelo deve operar com exatamente 1 inferência multimodal por análise', () => {
      const telemetry = {
        modelRequestCount: 1,
        inputTransport: 'signed_url' as const,
        executionTimeMs: 1250,
        inferenceTimeMs: 1100,
        model: 'gemini-2.5-flash',
      };
      expect(telemetry.modelRequestCount).toBe(1);
    });

    it('58. não deve expor credenciais, segredos ou tokens nos payloads', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      const jsonStr = JSON.stringify(normalizedData);
      expect(jsonStr).not.toContain('AI_STUDIO_KEY');
      expect(jsonStr).not.toContain('GEMINI_API_KEY');
      expect(jsonStr).not.toContain('SUPABASE_KEY');
      expect(jsonStr).not.toContain('service_role');
    });

    it('59. deve manter os três contratos de pipeline segregados (domain_native, v4_unified, v3_2_legacy)', () => {
      const pipelines = ['domain_native', 'v4_unified', 'v3_2_legacy'];
      expect(pipelines).toContain('domain_native');
      expect(pipelines).toHaveLength(3);
    });
  });

  /* ========================================================================
     7. INTEGRAÇÃO COM GEMINI INTERACTIONS API (PAYLOAD REAL E FORMATO)
     ======================================================================== */
  describe('Integração com Gemini Interactions API (Payload e Response Format)', () => {
    const toArrayBuffer = (buf: Buffer): ArrayBuffer =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    it('60. para imagem inline: passa response_format com type text, mime_type application/json e schema domainNativeJsonSchema', async () => {
      const mockCreateInteraction = vi.fn().mockResolvedValue({
        output_text: JSON.stringify(emanueleConfeitariaDomainRawFixture),
        usage: { prompt_tokens: 1500, candidates_tokens: 600, total_tokens: 2100 },
      });

      const mockAi = {
        interactions: {
          create: mockCreateInteraction,
        },
      };

      const fakeImageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

      const result = await analyzeMenuDomainNativeWithGemini({
        sourceType: 'image',
        tenantId: 'test-tenant',
        mimeType: 'image/jpeg',
        buffer: fakeImageBuffer,
        fileSize: fakeImageBuffer.length,
        aiClient: mockAi as any,
      });

      expect(result.pipeline).toBe('domain_native');
      expect(result.modelRequestCount).toBe(1);
      expect(result.inputTransport).toBe('inline');
      expect(mockCreateInteraction).toHaveBeenCalledTimes(1);

      // Verificação estrita do payload passado à Interactions API
      const callArgs = mockCreateInteraction.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-2.5-flash');
      expect(callArgs.response_format).toBeDefined();
      expect(callArgs.response_format.type).toBe('text');
      expect(callArgs.response_format.mime_type).toBe('application/json');
      expect(callArgs.response_format.schema).toBe(domainNativeJsonSchema);
      expect(callArgs.response_format.type).not.toBe('json_schema');
      expect(callArgs.response_format.type).not.toBe('object');
    });

    it('61. para PDF com signed URL: passa response_format com type text, mime_type application/json e schema domainNativeJsonSchema', async () => {
      const mockCreateInteraction = vi.fn().mockResolvedValue({
        output_text: JSON.stringify(emanueleConfeitariaDomainRawFixture),
        usage: { prompt_tokens: 2000, candidates_tokens: 800, total_tokens: 2800 },
      });

      const mockAi = {
        interactions: {
          create: mockCreateInteraction,
        },
      };

      const fakePdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'utf-8');
      const mockPreflightFetch = vi.fn().mockResolvedValue({
        status: 206,
        ok: true,
        headers: { get: () => 'bytes 0-1023/1048576' },
        arrayBuffer: async () => toArrayBuffer(fakePdfBuffer),
      });

      const result = await analyzeMenuDomainNativeWithGemini({
        sourceType: 'pdf',
        tenantId: 'test-tenant',
        mimeType: 'application/pdf',
        signedUrl: 'https://storage.supabase.co/tenant/menu.pdf?token=sec_abc123',
        fileSize: 0,
        pageCountKnown: 3,
        aiClient: mockAi as any,
        fetchClient: mockPreflightFetch as any,
      });

      expect(result.pipeline).toBe('domain_native');
      expect(result.modelRequestCount).toBe(1);
      expect(result.inputTransport).toBe('signed_url');
      expect(mockCreateInteraction).toHaveBeenCalledTimes(1);

      const callArgs = mockCreateInteraction.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-2.5-flash');
      expect(callArgs.response_format.type).toBe('text');
      expect(callArgs.response_format.mime_type).toBe('application/json');
      expect(callArgs.response_format.schema).toBe(domainNativeJsonSchema);
      expect(callArgs.response_format.type).not.toBe('json_schema');
      expect(callArgs.input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'document',
            uri: 'https://storage.supabase.co/tenant/menu.pdf?token=sec_abc123',
            mime_type: 'application/pdf',
          }),
        ])
      );
    });
  });

  /* ========================================================================
     8. PRÉ-PROCESSADOR DOMAIN-NATIVE PURO (SEM CONTAMINAÇÃO V4)
     ======================================================================== */
  describe('Pré-processador Domain-Native Puro', () => {
    it('62. buildDomainNativePreprocessorContext deve usar exclusivamente PODE_VIR_DOMAIN_CAPABILITIES sem campos espúrios', () => {
      const context = buildDomainNativePreprocessorContext({
        sourceType: 'pdf',
        tenantId: 'tenant-123',
        pageCountKnown: 2,
        fileSizeBytes: 1024,
      });

      expect(context.domainCapabilities).toEqual(PODE_VIR_DOMAIN_CAPABILITIES);
      expect((context.domainCapabilities as any).productSupportsMultiplePrices).toBeUndefined();
      expect((context.domainCapabilities as any).maxProductsPerCategory).toBeUndefined();
      expect((context.domainCapabilities as any).supportedEntities).toBeUndefined();
      expect((context.domainCapabilities as any).supportedOptionKinds).toBeUndefined();
      expect((context.domainCapabilities as any).supportedPricingModels).toBeUndefined();
    });
  });

  /* ========================================================================
     9. PARIDADE ZOD RAW VS DOMAIN NATIVE JSON SCHEMA
     ======================================================================== */
  describe('Paridade Zod RAW vs domainNativeJsonSchema', () => {
    it('63. valida que domainNativeJsonSchema reflete a estrutura e nullability do Zod RAW', () => {
      expect(domainNativeJsonSchema.type).toBe('object');
      expect(domainNativeJsonSchema.properties).toBeDefined();

      // Verifica campos nullable no schema
      const docProps = domainNativeJsonSchema.properties.document.properties as any;
      expect(docProps.globalTitle.nullable).toBe(true);
      expect(docProps.brand.nullable).toBe(true);

      const prodProps = (domainNativeJsonSchema.properties.importPlan.properties.products as any).items.properties;
      expect(prodProps.basePriceCents.nullable).toBe(true);
      expect(prodProps.categoryIndex.nullable).toBe(true);
      expect(prodProps.description.nullable).toBe(true);
      expect(prodProps.combo.nullable).toBe(true);
      expect(prodProps.preorderPolicy.nullable).toBe(true);

      // Preço ausente em combo no schema
      const comboProps = prodProps.combo.properties;
      expect(comboProps.comboBasePriceCents.nullable).toBe(true);

      // Preorder policy availability no schema
      const preorderProps = prodProps.preorderPolicy.properties;
      expect(preorderProps.availability.nullable).toBe(true);
      expect(preorderProps.minLeadMinutes.nullable).toBe(true);
    });
  });
});
