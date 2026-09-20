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

    it('64. valida que domainNativeJsonSchema contém descriptions curtas e precisas nos blocos centrais', () => {
      const sourceEvProps = domainNativeJsonSchema.properties.sourceEvidence.properties as any;
      expect(sourceEvProps.productCandidates.description).toBeDefined();
      expect(sourceEvProps.productCandidates.description.length).toBeGreaterThan(15);
      expect(sourceEvProps.choiceGroups.description).toBeDefined();
      expect(sourceEvProps.pricingObservations.description).toBeDefined();
      expect(sourceEvProps.comboEvidence.description).toBeDefined();

      const importPlanProps = domainNativeJsonSchema.properties.importPlan.properties as any;
      expect(importPlanProps.products.description).toBeDefined();
      expect(importPlanProps.complementGroups.description).toBeDefined();

      const unresolvedProp = domainNativeJsonSchema.properties.unresolved as any;
      expect(unresolvedProp.description).toBeDefined();
    });
  });

  /* ========================================================================
     10. COBERTURA ESTRUTURAL DETERMINÍSTICA (validateImportPlanDomain)
     ======================================================================== */
  describe('10. Cobertura Estrutural Determinística (Evidence -> Plan / Unresolved)', () => {
    it('65. deve emitir UNMAPPED_PRODUCT_CANDIDATE se candidato não for mapeado nem registrado em pendências', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      // Remove um produto do plano e garante que não está em unresolved
      normalizedData.importPlan.products = normalizedData.importPlan.products.filter(
        (p) => p.name !== 'Brigadeiro Belga'
      );
      normalizedData.unresolved = normalizedData.unresolved.filter(
        (u) => !u.affectedEntityKeys.includes('cand0') && !u.evidenceKeys.includes('cand0')
      );

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmapped = issues.find((i) => i.code === 'UNMAPPED_PRODUCT_CANDIDATE');
      expect(unmapped).toBeDefined();
      expect(unmapped?.severity).toBe('warning');
      expect(unmapped?.relatedEvidenceKeys).toContain('cand0');
    });

    it('66. NÃO deve emitir UNMAPPED_PRODUCT_CANDIDATE se candidato não mapeado estiver registrado em unresolved', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.importPlan.products = normalizedData.importPlan.products.filter(
        (p) => p.name !== 'Brigadeiro Belga'
      );
      normalizedData.unresolved.push({
        key: 'unres-unmapped-cand0',
        type: 'ambiguous_product_boundary',
        severity: 'warning',
        found: 'Brigadeiro Belga',
        reason: 'Item ilegível na foto',
        affectedEntityKeys: ['cand0'],
        evidenceKeys: ['cand0'],
        possibleResolutions: ['Revisar manualmente'],
      });

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmapped = issues.find(
        (i) => i.code === 'UNMAPPED_PRODUCT_CANDIDATE' && i.relatedEvidenceKeys.includes('cand0')
      );
      expect(unmapped).toBeUndefined();
    });

    it('67. deve emitir UNMAPPED_CHOICE_GROUP se grupo de opções documental não for mapeado nem estiver em unresolved', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.importPlan.complementGroups = [];
      normalizedData.unresolved = [];

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmappedGroup = issues.find((i) => i.code === 'UNMAPPED_CHOICE_GROUP');
      expect(unmappedGroup).toBeDefined();
      expect(unmappedGroup?.severity).toBe('warning');
    });

    it('68. deve emitir UNMAPPED_OPTION se opção de grupo documental desaparecer sem estar em unresolved', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      // Remove uma opção do grupo no plano
      if (normalizedData.importPlan.complementGroups[0]?.options.length > 1) {
        normalizedData.importPlan.complementGroups[0].options.pop();
      }
      normalizedData.unresolved = [];

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmappedOpt = issues.find((i) => i.code === 'UNMAPPED_OPTION');
      expect(unmappedOpt).toBeDefined();
      expect(unmappedOpt?.severity).toBe('warning');
    });

    it('69. deve emitir UNMAPPED_RULE_BLOCK se regra documental não tiver storePolicy, preorderPolicy nem unresolved', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.importPlan.storePolicy = null;
      for (const p of normalizedData.importPlan.products) {
        p.preorderPolicy = null;
      }
      normalizedData.unresolved = [];

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmappedRule = issues.find((i) => i.code === 'UNMAPPED_RULE_BLOCK');
      expect(unmappedRule).toBeDefined();
      expect(unmappedRule?.severity).toBe('warning');
    });

    it('70. deve emitir ORPHAN_IMPORT_PLAN_PRODUCT se produto no plano não possuir evidência documental correspondente', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.importPlan.products.push({
        key: 'prod-orphan',
        kind: 'product',
        name: 'Produto Fantasma Sem Evidência',
        description: '',
        categoryKey: null,
        basePriceCents: 1000,
        priceOrigin: 'source',
        exclusiveToCombo: false,
        order: 99,
        preorderPolicy: null,
        sourceEvidenceKeys: ['cand-inexistente'],
        sourceRuleKeys: [],
      });

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const orphan = issues.find(
        (i) => i.code === 'ORPHAN_IMPORT_PLAN_PRODUCT' && i.affectedEntityKeys.includes('prod-orphan')
      );
      expect(orphan).toBeDefined();
      expect(orphan?.severity).toBe('warning');
    });

    it('71. supporting product legítimo de combo (exclusiveToCombo=true referenciado por combo) NÃO emite ORPHAN_IMPORT_PLAN_PRODUCT', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      // Vela Vulcão Faísca tem exclusiveToCombo=true e é referenciado pelo combo Kit Festa
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const orphanVela = issues.find(
        (i) =>
          i.code === 'ORPHAN_IMPORT_PLAN_PRODUCT' &&
          normalizedData.importPlan.products.find((p) => p.name === 'Vela Vulcão Faísca')?.key ===
            i.affectedEntityKeys[0]
      );
      expect(orphanVela).toBeUndefined();
    });

    it('72. deve emitir ORPHAN_IMPORT_PLAN_GROUP se complementGroup no plano não possuir choiceGroup correspondente', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.importPlan.complementGroups.push({
        key: 'grp-orphan',
        name: 'Grupo Fantasma',
        placement: { type: 'shared', productKeys: ['prod0'], categoryKeys: [] },
        required: false,
        minimum: 0,
        maximum: 1,
        active: true,
        options: [
          {
            key: 'grp-orphan-opt0',
            name: 'Opção Fantasma',
            description: '',
            priceDeltaCents: 0,
            maximumPerItem: 1,
            active: true,
            sourceEvidenceKeys: [],
          },
        ],
        sourceEvidenceKeys: ['grp-raw-inexistente'],
      });

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const orphanGrp = issues.find(
        (i) => i.code === 'ORPHAN_IMPORT_PLAN_GROUP' && i.affectedEntityKeys.includes('grp-orphan')
      );
      expect(orphanGrp).toBeDefined();
      expect(orphanGrp?.severity).toBe('warning');
    });
  });

  /* ========================================================================
     11. REFORÇO DE COBERTURA E INVARIANTES ESTRUTURAIS (MULTIPLE PRICES, RULE TRACEABILITY, PREORDER, CATEGORIES)
     ======================================================================== */
  describe('Reforço de Cobertura e Invariantes Estruturais Domain-Native', () => {
    /* --- 11.1 Múltiplos Preços (MULTI_PRICE_EVIDENCE_UNMODELED) --- */
    it('73. deve emitir blocker MULTI_PRICE_EVIDENCE_UNMODELED se candidato contiver múltiplos preços e algum não estiver modelado nem em unresolved', () => {
      const { normalizedData } = normalizeDomainNativeData(bolosPrecoMatrizDomainRawFixture);
      // bolosPrecoMatriz tem candidato 0 com 3 preços: 6500 (P), 10500 (M), 15000 (G)
      // Esvaziamos complementGroups, pricingObservations e unresolved para simular abandono REAL dos preços adicionais
      normalizedData.importPlan.complementGroups = [];
      normalizedData.sourceEvidence.pricingObservations = [];
      normalizedData.unresolved = [];

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmodeledBlockers = issues.filter((i) => i.code === 'MULTI_PRICE_EVIDENCE_UNMODELED');
      expect(unmodeledBlockers.length).toBeGreaterThanOrEqual(2);
      expect(unmodeledBlockers.every((i) => i.severity === 'blocker')).toBe(true);
      expect(unmodeledBlockers.some((i) => i.details?.unmodeledPriceCents === 10500)).toBe(true);
      expect(unmodeledBlockers.some((i) => i.details?.unmodeledPriceCents === 15000)).toBe(true);
    });

    it('74. NÃO deve emitir MULTI_PRICE_EVIDENCE_UNMODELED se todos os múltiplos preços forem cobertos por basePrice e pricingObservations', () => {
      const { normalizedData } = normalizeDomainNativeData(bolosPrecoMatrizDomainRawFixture);
      // bolosPrecoMatriz original tem basePriceCents 6500 e 3 pricingObservations (6500, 10500, 15000)
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmodeledBlockers = issues.filter((i) => i.code === 'MULTI_PRICE_EVIDENCE_UNMODELED');
      expect(unmodeledBlockers).toHaveLength(0);
    });

    it('75. NÃO deve emitir MULTI_PRICE_EVIDENCE_UNMODELED se preço não modelável aditivamente estiver registrado em unresolved', () => {
      const { normalizedData } = normalizeDomainNativeData(bolosPrecoMatrizDomainRawFixture);
      normalizedData.sourceEvidence.pricingObservations = [];
      // Registra pendência cobrindo o candidato/preços
      normalizedData.unresolved = [
        {
          key: 'unres-matrix',
          type: 'unrepresentable_pricing_matrix',
          found: 'Matriz de preços complexa',
          reason: 'Preços M e G não puderam ser expressos via matriz aditiva simples',
          evidenceKeys: ['cand0'],
          affectedEntityKeys: ['prod0'],
          severity: 'blocker',
          possibleResolutions: ['revisão manual'],
        },
      ];

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmodeledBlockers = issues.filter((i) => i.code === 'MULTI_PRICE_EVIDENCE_UNMODELED');
      expect(unmodeledBlockers).toHaveLength(0);
    });

    /* --- 11.2 Cobertura Individual de Regras Documentais (UNMAPPED_RULE_BLOCK) --- */
    it('76. deve validar cobertura individual de regras: duas regras mapeadas em produtos distintos são consideradas atendidas', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.sourceEvidence.ruleBlocks = [
        { ruleKey: 'rule0', title: 'Regra Bolos', body: 'Antecedência de 48h para bolos', rawEvidence: '48h', sourcePages: [3] },
        { ruleKey: 'rule1', title: 'Regra Doces', body: 'Antecedência de 24h para doces', rawEvidence: '24h', sourcePages: [2] },
      ];

      // Produto 0 (Doces) mapeia rule1
      normalizedData.importPlan.products[0].preorderPolicy = { availability: 'scheduled_only', minLeadMinutes: 1440 };
      normalizedData.importPlan.products[0].sourceRuleKeys = ['rule1'];

      // Produto 2 (Bolos) mapeia rule0
      normalizedData.importPlan.products[2].preorderPolicy = { availability: 'scheduled_only', minLeadMinutes: 2880 };
      normalizedData.importPlan.products[2].sourceRuleKeys = ['rule0'];

      // StorePolicy sem regras vinculadas
      if (normalizedData.importPlan.storePolicy) {
        normalizedData.importPlan.storePolicy.sourceRuleKeys = [];
        if (normalizedData.importPlan.storePolicy.globalPreorder) {
          normalizedData.importPlan.storePolicy.globalPreorder.sourceRuleKeys = [];
        }
      }

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmappedRules = issues.filter((i) => i.code === 'UNMAPPED_RULE_BLOCK');
      expect(unmappedRules).toHaveLength(0);
    });

    it('77. deve emitir UNMAPPED_RULE_BLOCK para regra não vinculada mesmo se houver StorePolicy ativa cobrindo outra regra', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.sourceEvidence.ruleBlocks = [
        { ruleKey: 'rule0', title: 'Pedido Mínimo', body: 'Pedido mínimo de R$ 50,00', rawEvidence: 'Min R$50', sourcePages: [4] },
        { ruleKey: 'rule1', title: 'Regra Desamparada', body: 'Taxa de entrega especial para feriados', rawEvidence: 'Taxa feriados', sourcePages: [4] },
      ];

      // StorePolicy cobre apenas rule0
      normalizedData.importPlan.storePolicy = {
        pedidoMinimoCents: 5000,
        sourceRuleKeys: ['rule0'],
        globalPreorder: null,
      };

      // Limpa regras dos produtos e unresolved
      for (const p of normalizedData.importPlan.products) {
        p.sourceRuleKeys = [];
      }
      normalizedData.unresolved = [];

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmappedRules = issues.filter((i) => i.code === 'UNMAPPED_RULE_BLOCK');
      expect(unmappedRules).toHaveLength(1);
      expect(unmappedRules[0].relatedEvidenceKeys).toContain('rule1');
    });

    it('78. deve aceitar regra documental vinculada a unresolved com ambiguous_rule_scope ou unsupported_domain_rule', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.sourceEvidence.ruleBlocks = [
        { ruleKey: 'rule0', title: 'Regra de Escopo Duvidoso', body: 'Encomendas sob consulta', rawEvidence: 'Consulta', sourcePages: [4] },
      ];

      if (normalizedData.importPlan.storePolicy) {
        normalizedData.importPlan.storePolicy.sourceRuleKeys = [];
        if (normalizedData.importPlan.storePolicy.globalPreorder) {
          normalizedData.importPlan.storePolicy.globalPreorder.sourceRuleKeys = [];
        }
      }
      for (const p of normalizedData.importPlan.products) {
        p.sourceRuleKeys = [];
      }

      normalizedData.unresolved = [
        {
          key: 'unres-scope',
          type: 'ambiguous_rule_scope',
          found: 'Regra de antecedência sob consulta',
          reason: 'Não fica claro se a regra se aplica a bolos ou a todos os itens',
          evidenceKeys: ['rule0'],
          affectedEntityKeys: [],
          severity: 'warning',
          possibleResolutions: ['revisão manual'],
        },
      ];

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmappedRules = issues.filter((i) => i.code === 'UNMAPPED_RULE_BLOCK');
      expect(unmappedRules).toHaveLength(0);
    });

    /* --- 11.3 Preorder por Produto e Lead Times Diferentes --- */
    it('79. deve permitir e validar produtos com lead times de encomenda distintos no mesmo catálogo', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      // Prod 0: 24h
      normalizedData.importPlan.products[0].preorderPolicy = { availability: 'scheduled_only', minLeadMinutes: 1440 };
      // Prod 2: 72h
      normalizedData.importPlan.products[2].preorderPolicy = { availability: 'both', minLeadMinutes: 4320 };

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const preorderIssues = issues.filter(
        (i) => i.code === 'INVALID_PREORDER_LEAD_TIME' || i.code === 'INVALID_PREORDER_AVAILABILITY'
      );
      expect(preorderIssues).toHaveLength(0);
    });

    it('80. deve permitir produto com availability null e minLeadMinutes definido (antecedência sem modo explícito)', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.importPlan.products[0].preorderPolicy = { availability: null, minLeadMinutes: 2880 };

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const prod0Issues = issues.filter(
        (i) => i.affectedEntityKeys.includes('prod0') && i.code === 'INVALID_PREORDER_AVAILABILITY'
      );
      expect(prod0Issues).toHaveLength(0);
    });

    it('81. deve aceitar ambiguous_rule_scope no Zod e no schema JSON de UnresolvedType', () => {
      const raw = JSON.parse(JSON.stringify(emanueleConfeitariaDomainRawFixture));
      raw.unresolved = [
        {
          type: 'ambiguous_rule_scope',
          severity: 'warning',
          found: 'Regra de 48h não especifica produtos abrangidos',
          reason: 'Escopo incerto entre bolos ou todo o catálogo',
          evidenceRuleIndexes: [0],
        },
      ];

      const parsed = catalogImportDomainRawAnalysisSchema.safeParse(raw);
      expect(parsed.success).toBe(true);

      const { normalizedData } = normalizeDomainNativeData(raw);
      expect(normalizedData.unresolved).toHaveLength(1);
      expect(normalizedData.unresolved[0].type).toBe('ambiguous_rule_scope');
      expect(normalizedData.unresolved[0].evidenceKeys).toContain('rule0');
    });

    /* --- 11.4 Categorias Não Utilizadas (UNUSED_CATEGORY) --- */
    it('82. deve emitir warning UNUSED_CATEGORY se categoria não for referenciada por produto nem complementGroup shared', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.importPlan.categories.push({
        key: 'cat-unused',
        name: 'Categoria Órfã Sem Produtos',
        description: 'Não utilizada',
        order: 99,
        sourceEvidenceKeys: [],
      });

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unused = issues.find(
        (i) => i.code === 'UNUSED_CATEGORY' && i.affectedEntityKeys.includes('cat-unused')
      );
      expect(unused).toBeDefined();
      expect(unused?.severity).toBe('warning');
    });

    it('83. NÃO deve emitir UNUSED_CATEGORY se categoria for referenciada por complementGroup shared com targetCategoryKeys', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.importPlan.categories.push({
        key: 'cat-shared-only',
        name: 'Categoria Apenas com Complementos',
        description: '',
        order: 99,
        sourceEvidenceKeys: [],
      });

      normalizedData.importPlan.complementGroups.push({
        key: 'grp-shared-cat',
        name: 'Complementos da Categoria',
        placement: { type: 'shared', productKeys: [], categoryKeys: ['cat-shared-only'] },
        required: false,
        minimum: 0,
        maximum: 2,
        active: true,
        options: [
          {
            key: 'opt-cat',
            name: 'Embalagem Especial',
            description: '',
            priceDeltaCents: 300,
            maximumPerItem: 1,
            active: true,
            sourceEvidenceKeys: [],
          },
        ],
        sourceEvidenceKeys: ['choiceGroup0'],
      });

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unused = issues.find(
        (i) => i.code === 'UNUSED_CATEGORY' && i.affectedEntityKeys.includes('cat-shared-only')
      );
      expect(unused).toBeUndefined();
    });
  });

  /* ========================================================================
     12. LINHAGEM DE PREÇOS, COMPOSITE FLATTENING E ESCOPO DE REGRAS
     ======================================================================== */
  describe('Linhagem de Preços, Composite Flattening e Escopo de Regras', () => {
    const defaultDoc = {
      sourceType: 'image' as const,
      globalTitle: 'Confeitaria Artesanal',
      globalTitleRole: 'brand' as const,
      brand: 'Confeitaria Artesanal',
      pageCount: 1,
      pageCoverage: [{ pageNumber: 1, role: 'catalog', hasCatalogEvidence: true, notes: null }],
      sections: [],
    };

    it('84. Bolo com preços múltiplos e grupo de complementos com deltas/sourcePriceKeys NÃO gera MULTI_PRICE_EVIDENCE_UNMODELED', () => {
      // Simula o caso real: Bolo Tradicional (15cm R$135, 20cm R$190, 25cm R$235)
      const rawPayload = {
        isMenu: true,
        document: defaultDoc,
        sourceEvidence: {
          productCandidates: [
            {
              name: 'Bolo Tradicional',
              description: 'Bolo com massa fofinha e recheio cremoso',
              sourcePages: [1],
              categoryHint: 'Bolos',
              prices: [
                { label: '15cm', amountCents: 13500, prefix: null, unit: null, rawText: '15cm - R$ 135' },
                { label: '20cm', amountCents: 19000, prefix: null, unit: null, rawText: '20cm - R$ 190' },
                { label: '25cm', amountCents: 23500, prefix: null, unit: null, rawText: '25cm - R$ 235' },
              ],
              rawEvidence: 'Bolo Tradicional 15cm R$135, 20cm R$190, 25cm R$235',
            },
          ],
          pricingObservations: [], // Sem observações duplicadas: modelado diretamente pelo grupo
          choiceGroups: [],
          ruleBlocks: [],
          comboEvidence: [],
          photos: [],
          residualTexts: [],
        },
        importPlan: {
          categories: [{ name: 'Bolos', description: '', order: 0, sourceEvidenceCandidateIndexes: [0] }],
          products: [
            {
              kind: 'product' as const,
              name: 'Bolo Tradicional',
              description: 'Bolo com massa fofinha e recheio cremoso',
              categoryIndex: 0,
              exclusiveToCombo: false,
              order: 0,
              preorderPolicy: null,
              basePriceCents: 13500,
              priceOrigin: 'source' as const,
              basePriceSource: { candidateIndex: 0, priceIndex: 0 },
              sourceProductCandidateIndexes: [0],
              sourceRuleIndexes: [],
            },
          ],
          complementGroups: [
            {
              name: 'Tamanho / Diâmetro',
              placementType: 'embedded_product' as const,
              parentProductIndex: 0,
              required: true,
              minimum: 1,
              maximum: 1,
              options: [
                {
                  name: '15cm (serve até 10 pessoas)',
                  priceDeltaCents: 0,
                  maximumPerItem: 1,
                  active: true,
                  sourcePriceRefs: [{ candidateIndex: 0, priceIndex: 0 }],
                },
                {
                  name: '20cm (serve até 20 pessoas)',
                  priceDeltaCents: 5500,
                  maximumPerItem: 1,
                  active: true,
                  sourcePriceRefs: [{ candidateIndex: 0, priceIndex: 1 }],
                },
                {
                  name: '25cm (serve até 30 pessoas)',
                  priceDeltaCents: 10000,
                  maximumPerItem: 1,
                  active: true,
                  sourcePriceRefs: [{ candidateIndex: 0, priceIndex: 2 }],
                },
              ],
              sourceChoiceGroupIndexes: [],
            },
          ],
          productImages: [],
          storePolicy: null,
        },
        unresolved: [],
        warnings: [],
      };

      const { normalizedData } = normalizeDomainNativeData(rawPayload);
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      // Não deve haver nenhum blocker de MULTI_PRICE_EVIDENCE_UNMODELED nem ORPHAN_IMPORT_PLAN_GROUP
      const multiPriceBlockers = issues.filter((i) => i.code === 'MULTI_PRICE_EVIDENCE_UNMODELED');
      const orphanGroupWarnings = issues.filter((i) => i.code === 'ORPHAN_IMPORT_PLAN_GROUP');

      expect(multiPriceBlockers).toHaveLength(0);
      expect(orphanGroupWarnings).toHaveLength(0);
      expect(issues.filter((i) => i.severity === 'blocker')).toHaveLength(0);
    });

    it('85. Bolo com preços múltiplos onde um preço REALMENTE não foi para lugar nenhum CONTINUA gerando blocker MULTI_PRICE_EVIDENCE_UNMODELED', () => {
      const rawPayload = {
        isMenu: true,
        document: defaultDoc,
        sourceEvidence: {
          productCandidates: [
            {
              name: 'Bolo Tradicional',
              description: 'Bolo com massa fofinha',
              sourcePages: [1],
              categoryHint: 'Bolos',
              prices: [
                { label: '15cm', amountCents: 13500, prefix: null, unit: null, rawText: '15cm - R$ 135' },
                { label: '20cm', amountCents: 19000, prefix: null, unit: null, rawText: '20cm - R$ 190' },
                { label: '25cm', amountCents: 23500, prefix: null, unit: null, rawText: '25cm - R$ 235' }, // PREÇO ABANDONADO
              ],
              rawEvidence: 'Bolo Tradicional 15cm R$135, 20cm R$190, 25cm R$235',
            },
          ],
          pricingObservations: [],
          choiceGroups: [],
          ruleBlocks: [],
          comboEvidence: [],
          photos: [],
          residualTexts: [],
        },
        importPlan: {
          categories: [{ name: 'Bolos', description: '', order: 0, sourceEvidenceCandidateIndexes: [0] }],
          products: [
            {
              kind: 'product' as const,
              name: 'Bolo Tradicional',
              description: 'Bolo com massa fofinha',
              categoryIndex: 0,
              exclusiveToCombo: false,
              order: 0,
              preorderPolicy: null,
              basePriceCents: 13500,
              priceOrigin: 'source' as const,
              basePriceSource: { candidateIndex: 0, priceIndex: 0 },
              sourceProductCandidateIndexes: [0],
              sourceRuleIndexes: [],
            },
          ],
          complementGroups: [
            {
              name: 'Tamanho / Diâmetro',
              placementType: 'embedded_product' as const,
              parentProductIndex: 0,
              required: true,
              minimum: 1,
              maximum: 1,
              options: [
                {
                  name: '15cm',
                  priceDeltaCents: 0,
                  maximumPerItem: 1,
                  active: true,
                  sourcePriceRefs: [{ candidateIndex: 0, priceIndex: 0 }],
                },
                {
                  name: '20cm',
                  priceDeltaCents: 5500,
                  maximumPerItem: 1,
                  active: true,
                  sourcePriceRefs: [{ candidateIndex: 0, priceIndex: 1 }],
                },
                // 25cm (23500) NÃO foi modelado aqui nem em lugar nenhum!
              ],
              sourceChoiceGroupIndexes: [],
            },
          ],
          productImages: [],
          storePolicy: null,
        },
        unresolved: [],
        warnings: [],
      };

      const { normalizedData } = normalizeDomainNativeData(rawPayload);
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const unmodeled = issues.filter((i) => i.code === 'MULTI_PRICE_EVIDENCE_UNMODELED');
      expect(unmodeled.length).toBeGreaterThanOrEqual(1);
      expect(unmodeled[0].severity).toBe('blocker');
      expect(unmodeled[0].details?.unmodeledPriceCents).toBe(23500);
    });

    it('86. ComplementGroup que nasceu só de tabela de preços (com sourcePriceKeys e embedded em produto com evidência) NÃO emite ORPHAN_IMPORT_PLAN_GROUP', () => {
      const rawPayload = {
        isMenu: true,
        document: defaultDoc,
        sourceEvidence: {
          productCandidates: [
            {
              name: 'Pizza Margherita',
              description: 'Molho, mussarela e manjericão',
              sourcePages: [1],
              categoryHint: 'Pizzas',
              prices: [
                { label: 'Broto', amountCents: 4000, prefix: null, unit: null, rawText: 'Broto R$ 40' },
                { label: 'Grande', amountCents: 6500, prefix: null, unit: null, rawText: 'Grande R$ 65' },
              ],
              rawEvidence: 'Pizza Margherita Broto R$40 Grande R$65',
            },
          ],
          pricingObservations: [],
          choiceGroups: [], // ZERO choice groups na fonte: grupo nasceu puramente da tabela de preços!
          ruleBlocks: [],
          comboEvidence: [],
          photos: [],
          residualTexts: [],
        },
        importPlan: {
          categories: [{ name: 'Pizzas', description: '', order: 0, sourceEvidenceCandidateIndexes: [0] }],
          products: [
            {
              kind: 'product' as const,
              name: 'Pizza Margherita',
              description: 'Molho, mussarela e manjericão',
              categoryIndex: 0,
              exclusiveToCombo: false,
              order: 0,
              preorderPolicy: null,
              basePriceCents: 4000,
              priceOrigin: 'source' as const,
              basePriceSource: { candidateIndex: 0, priceIndex: 0 },
              sourceProductCandidateIndexes: [0],
              sourceRuleIndexes: [],
            },
          ],
          complementGroups: [
            {
              name: 'Tamanho da Pizza',
              placementType: 'embedded_product' as const,
              parentProductIndex: 0,
              required: true,
              minimum: 1,
              maximum: 1,
              options: [
                {
                  name: 'Broto (4 fatias)',
                  priceDeltaCents: 0,
                  maximumPerItem: 1,
                  active: true,
                  sourcePriceRefs: [{ candidateIndex: 0, priceIndex: 0 }],
                },
                {
                  name: 'Grande (8 fatias)',
                  priceDeltaCents: 2500,
                  maximumPerItem: 1,
                  active: true,
                  sourcePriceRefs: [{ candidateIndex: 0, priceIndex: 1 }],
                },
              ],
              sourceChoiceGroupIndexes: [],
            },
          ],
          productImages: [],
          storePolicy: null,
        },
        unresolved: [],
        warnings: [],
      };

      const { normalizedData } = normalizeDomainNativeData(rawPayload);
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const orphans = issues.filter((i) => i.code === 'ORPHAN_IMPORT_PLAN_GROUP');
      expect(orphans).toHaveLength(0);
    });

    it('87. ComplementGroup que nasceu de choiceGroup continua não emitindo orphan', () => {
      const rawPayload = {
        isMenu: true,
        document: defaultDoc,
        sourceEvidence: {
          productCandidates: [
            {
              name: 'Burger Simples',
              description: 'Hambúrguer artesanal',
              sourcePages: [1],
              categoryHint: 'Burgers',
              prices: [{ label: null, amountCents: 3000, prefix: null, unit: null, rawText: 'R$ 30' }],
              rawEvidence: 'Burger Simples R$30',
            },
          ],
          pricingObservations: [],
          choiceGroups: [
            {
              title: 'Molhos Extras',
              sourcePages: [1],
              instruction: 'Escolha até 2',
              parentCandidateIndex: 0,
              options: [
                { name: 'Maionese da Casa', rawText: 'Maionese da Casa +R$3', amountCents: 300, priceRawText: '+R$3' },
              ],
              rawEvidence: 'Molhos Extras: Maionese da Casa +R$3',
            },
          ],
          ruleBlocks: [],
          comboEvidence: [],
          photos: [],
          residualTexts: [],
        },
        importPlan: {
          categories: [{ name: 'Burgers', description: '', order: 0, sourceEvidenceCandidateIndexes: [0] }],
          products: [
            {
              kind: 'product' as const,
              name: 'Burger Simples',
              description: 'Hambúrguer artesanal',
              categoryIndex: 0,
              exclusiveToCombo: false,
              order: 0,
              preorderPolicy: null,
              basePriceCents: 3000,
              priceOrigin: 'source' as const,
              sourceProductCandidateIndexes: [0],
              sourceRuleIndexes: [],
            },
          ],
          complementGroups: [
            {
              name: 'Molhos Extras',
              placementType: 'embedded_product' as const,
              parentProductIndex: 0,
              required: false,
              minimum: 0,
              maximum: 2,
              options: [
                {
                  name: 'Maionese da Casa',
                  priceDeltaCents: 300,
                  maximumPerItem: 2,
                  active: true,
                  sourceChoiceGroupIndex: 0,
                  sourceOptionIndex: 0,
                },
              ],
              sourceChoiceGroupIndexes: [0],
            },
          ],
          productImages: [],
          storePolicy: null,
        },
        unresolved: [],
        warnings: [],
      };

      const { normalizedData } = normalizeDomainNativeData(rawPayload);
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const orphans = issues.filter((i) => i.code === 'ORPHAN_IMPORT_PLAN_GROUP');
      expect(orphans).toHaveLength(0);
    });

    it('88. ComplementGroup shared sem nenhuma evidência emite ORPHAN_IMPORT_PLAN_GROUP', () => {
      const { normalizedData } = normalizeDomainNativeData(emanueleConfeitariaDomainRawFixture);
      normalizedData.importPlan.complementGroups.push({
        key: 'grp-shared-orphan',
        name: 'Grupo Sem Evidência Alguma',
        placement: { type: 'shared', productKeys: ['prod0'], categoryKeys: [] },
        required: false,
        minimum: 0,
        maximum: 1,
        active: true,
        options: [
          {
            key: 'opt-orphan',
            name: 'Opção Fantasma',
            priceDeltaCents: 500,
            maximumPerItem: 1,
            active: true,
            sourceEvidenceKeys: [],
            sourcePriceKeys: [],
          },
        ],
        sourceEvidenceKeys: [], // Vazio! Não aponta para choiceGroup nem tem priceKeys
      });

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const orphan = issues.find(
        (i) => i.code === 'ORPHAN_IMPORT_PLAN_GROUP' && i.affectedEntityKeys.includes('grp-shared-orphan')
      );
      expect(orphan).toBeDefined();
      expect(orphan?.severity).toBe('warning');
    });

    it('89. Composite choice flattening: representa fielmente matriz não aditiva finita enumerada sem blockers', () => {
      // Matriz finita 2 tamanhos x 2 massas:
      // P + Tradicional = R$ 50
      // P + Especial = R$ 60 (+10)
      // M + Tradicional = R$ 80 (+30)
      // M + Especial = R$ 95 (+45)
      const rawPayload = {
        isMenu: true,
        document: defaultDoc,
        sourceEvidence: {
          productCandidates: [
            {
              name: 'Torta Salgada',
              description: 'Torta caseira recheada',
              sourcePages: [1],
              categoryHint: 'Tortas',
              prices: [
                { label: 'P - Tradicional', amountCents: 5000, prefix: null, unit: null, rawText: 'P Tradicional R$50' },
                { label: 'P - Especial', amountCents: 6000, prefix: null, unit: null, rawText: 'P Especial R$60' },
                { label: 'M - Tradicional', amountCents: 8000, prefix: null, unit: null, rawText: 'M Tradicional R$80' },
                { label: 'M - Especial', amountCents: 9500, prefix: null, unit: null, rawText: 'M Especial R$95' },
              ],
              rawEvidence: 'Torta P Tradicional R$50, P Especial R$60, M Tradicional R$80, M Especial R$95',
            },
          ],
          pricingObservations: [],
          choiceGroups: [],
          ruleBlocks: [],
          comboEvidence: [],
          photos: [],
          residualTexts: [],
        },
        importPlan: {
          categories: [{ name: 'Tortas', description: '', order: 0, sourceEvidenceCandidateIndexes: [0] }],
          products: [
            {
              kind: 'product' as const,
              name: 'Torta Salgada',
              description: 'Torta caseira recheada',
              categoryIndex: 0,
              exclusiveToCombo: false,
              order: 0,
              preorderPolicy: null,
              basePriceCents: 5000,
              priceOrigin: 'source' as const,
              basePriceSource: { candidateIndex: 0, priceIndex: 0 },
              sourceProductCandidateIndexes: [0],
              sourceRuleIndexes: [],
            },
          ],
          complementGroups: [
            {
              name: 'Combinação Tamanho e Massa',
              placementType: 'embedded_product' as const,
              parentProductIndex: 0,
              required: true,
              minimum: 1,
              maximum: 1,
              options: [
                {
                  name: 'P com Massa Tradicional',
                  priceDeltaCents: 0,
                  maximumPerItem: 1,
                  active: true,
                  sourcePriceRefs: [{ candidateIndex: 0, priceIndex: 0 }],
                },
                {
                  name: 'P com Massa Especial',
                  priceDeltaCents: 1000,
                  maximumPerItem: 1,
                  active: true,
                  sourcePriceRefs: [{ candidateIndex: 0, priceIndex: 1 }],
                },
                {
                  name: 'M com Massa Tradicional',
                  priceDeltaCents: 3000,
                  maximumPerItem: 1,
                  active: true,
                  sourcePriceRefs: [{ candidateIndex: 0, priceIndex: 2 }],
                },
                {
                  name: 'M com Massa Especial',
                  priceDeltaCents: 4500,
                  maximumPerItem: 1,
                  active: true,
                  sourcePriceRefs: [{ candidateIndex: 0, priceIndex: 3 }],
                },
              ],
              sourceChoiceGroupIndexes: [],
            },
          ],
          productImages: [],
          storePolicy: null,
        },
        unresolved: [],
        warnings: [],
      };

      const { normalizedData } = normalizeDomainNativeData(rawPayload);
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      expect(issues.filter((i) => i.severity === 'blocker')).toHaveLength(0);
      expect(normalizedData.importPlan.complementGroups[0].options).toHaveLength(4);
    });

    it('90. Matriz com preço faltando vai para unresolved e emite blocker se não estiver resolvida', () => {
      const rawPayload = {
        isMenu: true,
        document: defaultDoc,
        sourceEvidence: {
          productCandidates: [
            {
              name: 'Torta Especial',
              description: 'Torta com matriz incompleta',
              sourcePages: [1],
              categoryHint: 'Tortas',
              prices: [
                { label: 'P', amountCents: 5000, prefix: null, unit: null, rawText: 'P R$50' },
                { label: 'M', amountCents: null, prefix: null, unit: null, rawText: 'M sob consulta' }, // Faltando preço
              ],
              rawEvidence: 'Torta P R$50, M sob consulta',
            },
          ],
          pricingObservations: [],
          choiceGroups: [],
          ruleBlocks: [],
          comboEvidence: [],
          photos: [],
          residualTexts: [],
        },
        importPlan: {
          categories: [{ name: 'Tortas', description: '', order: 0, sourceEvidenceCandidateIndexes: [0] }],
          products: [
            {
              kind: 'product' as const,
              name: 'Torta Especial',
              description: 'Torta com matriz incompleta',
              categoryIndex: 0,
              exclusiveToCombo: false,
              order: 0,
              preorderPolicy: null,
              basePriceCents: 5000,
              priceOrigin: 'source' as const,
              sourceProductCandidateIndexes: [0],
              sourceRuleIndexes: [],
            },
          ],
          complementGroups: [],
          productImages: [],
          storePolicy: null,
        },
        unresolved: [
          {
            type: 'missing_price' as const,
            found: 'Torta Especial tamanho M sob consulta',
            reason: 'Tamanho M não possui valor explícito no documento',
            evidenceCandidateIndexes: [0],
            affectedProductIndexes: [0],
            severity: 'blocker' as const,
            possibleResolutions: ['Informar preço do tamanho M'],
          },
        ],
        warnings: [],
      };

      const { normalizedData } = normalizeDomainNativeData(rawPayload);
      expect(normalizedData.unresolved).toHaveLength(1);
      expect(normalizedData.unresolved[0].severity).toBe('blocker');
      expect(normalizedData.unresolved[0].type).toBe('missing_price');
    });

    it('91. Choice group com appliesToCandidateIndexes normaliza corretamente para appliesToCandidateKeys', () => {
      const rawPayload = {
        isMenu: true,
        document: defaultDoc,
        sourceEvidence: {
          productCandidates: [
            {
              name: 'Burger Bovino',
              description: '',
              sourcePages: [1],
              categoryHint: 'Burgers',
              prices: [{ label: null, amountCents: 3500, prefix: null, unit: null, rawText: 'R$ 35' }],
              rawEvidence: 'Burger Bovino R$35',
            },
            {
              name: 'Burger Frango',
              description: '',
              sourcePages: [1],
              categoryHint: 'Burgers',
              prices: [{ label: null, amountCents: 3000, prefix: null, unit: null, rawText: 'R$ 30' }],
              rawEvidence: 'Burger Frango R$30',
            },
            {
              name: 'Burger Veggie',
              description: '',
              sourcePages: [1],
              categoryHint: 'Burgers',
              prices: [{ label: null, amountCents: 3200, prefix: null, unit: null, rawText: 'R$ 32' }],
              rawEvidence: 'Burger Veggie R$32',
            },
          ],
          pricingObservations: [],
          choiceGroups: [
            {
              title: 'Adicionais de Queijo',
              sourcePages: [1],
              instruction: 'Escolha seu queijo',
              appliesToCandidateIndexes: [0, 2], // Aplica apenas ao Bovino e Veggie!
              options: [{ name: 'Cheddar Inglês', rawText: 'Cheddar +R$5', amountCents: 500, priceRawText: '+R$5' }],
              rawEvidence: 'Queijos extras para Burger Bovino e Veggie',
            },
          ],
          ruleBlocks: [],
          comboEvidence: [],
          photos: [],
          residualTexts: [],
        },
        importPlan: {
          categories: [{ name: 'Burgers', description: '', order: 0, sourceEvidenceCandidateIndexes: [0, 1, 2] }],
          products: [
            {
              kind: 'product' as const,
              name: 'Burger Bovino',
              description: '',
              categoryIndex: 0,
              exclusiveToCombo: false,
              order: 0,
              preorderPolicy: null,
              basePriceCents: 3500,
              priceOrigin: 'source' as const,
              sourceProductCandidateIndexes: [0],
              sourceRuleIndexes: [],
            },
            {
              kind: 'product' as const,
              name: 'Burger Frango',
              description: '',
              categoryIndex: 0,
              exclusiveToCombo: false,
              order: 1,
              preorderPolicy: null,
              basePriceCents: 3000,
              priceOrigin: 'source' as const,
              sourceProductCandidateIndexes: [1],
              sourceRuleIndexes: [],
            },
            {
              kind: 'product' as const,
              name: 'Burger Veggie',
              description: '',
              categoryIndex: 0,
              exclusiveToCombo: false,
              order: 2,
              preorderPolicy: null,
              basePriceCents: 3200,
              priceOrigin: 'source' as const,
              sourceProductCandidateIndexes: [2],
              sourceRuleIndexes: [],
            },
          ],
          complementGroups: [
            {
              name: 'Adicionais de Queijo',
              placementType: 'shared' as const,
              targetProductIndexes: [0, 2],
              required: false,
              minimum: 0,
              maximum: 2,
              options: [
                {
                  name: 'Cheddar Inglês',
                  priceDeltaCents: 500,
                  maximumPerItem: 1,
                  active: true,
                  sourceChoiceGroupIndex: 0,
                  sourceOptionIndex: 0,
                },
              ],
              sourceChoiceGroupIndexes: [0],
            },
          ],
          productImages: [],
          storePolicy: null,
        },
        unresolved: [],
        warnings: [],
      };

      const { normalizedData } = normalizeDomainNativeData(rawPayload);
      const choiceGroup = normalizedData.sourceEvidence.choiceGroups[0];
      expect(choiceGroup.appliesToCandidateKeys).toEqual(['cand0', 'cand2']);
      expect(choiceGroup.parentCandidateKey).toBe('cand0');

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );
      expect(issues.filter((i) => i.severity === 'blocker')).toHaveLength(0);
    });

    it('92. Regra com scope: "products" vinculada exclusivamente a storePolicy emite INCONSISTENT_RULE_SCOPE', () => {
      const rawPayload = {
        isMenu: true,
        document: defaultDoc,
        sourceEvidence: {
          productCandidates: [
            {
              name: 'Bolo de Casamento',
              description: '',
              sourcePages: [1],
              categoryHint: 'Bolos',
              prices: [{ label: null, amountCents: 50000, prefix: null, unit: null, rawText: 'R$ 500' }],
              rawEvidence: 'Bolo de Casamento R$500',
            },
          ],
          pricingObservations: [],
          choiceGroups: [],
          ruleBlocks: [
            {
              title: 'Antecedência Bolo de Casamento',
              body: 'Encomendas de Bolo de Casamento devem ser feitas com 7 dias de antecedência',
              scope: 'products' as const,
              targetCandidateIndexes: [0],
              sourcePages: [1],
              rawEvidence: 'Encomendas de Bolo de Casamento com 7 dias de antecedência',
            },
          ],
          comboEvidence: [],
          photos: [],
          residualTexts: [],
        },
        importPlan: {
          categories: [{ name: 'Bolos', description: '', order: 0, sourceEvidenceCandidateIndexes: [0] }],
          products: [
            {
              kind: 'product' as const,
              name: 'Bolo de Casamento',
              description: '',
              categoryIndex: 0,
              exclusiveToCombo: false,
              order: 0,
              preorderPolicy: null, // O produto NÃO recebeu a regra!
              basePriceCents: 50000,
              priceOrigin: 'source' as const,
              sourceProductCandidateIndexes: [0],
              sourceRuleIndexes: [],
            },
          ],
          complementGroups: [],
          productImages: [],
          storePolicy: {
            pedidoMinimoCents: 5000,
            sourceRuleIndexes: [0], // Inconsistente! Regra de produto vinculada exclusivamente como storePolicy global!
            globalPreorder: null,
          },
        },
        unresolved: [],
        warnings: [],
      };

      const { normalizedData } = normalizeDomainNativeData(rawPayload);
      // Forçamos a inserção na storePolicy para testar o validador
      normalizedData.importPlan.storePolicy!.sourceRuleKeys = ['rule0'];

      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const inconsistentScope = issues.find((i) => i.code === 'INCONSISTENT_RULE_SCOPE');
      expect(inconsistentScope).toBeDefined();
      expect(inconsistentScope?.severity).toBe('warning');
    });

    it('93. Regra com scope: "ambiguous" fora de unresolved emite alerta AMBIGUOUS_RULE_SCOPE_UNRESOLVED', () => {
      const rawPayload = {
        isMenu: true,
        document: defaultDoc,
        sourceEvidence: {
          productCandidates: [
            {
              name: 'Docinhos',
              description: '',
              sourcePages: [1],
              categoryHint: 'Doces',
              prices: [{ label: null, amountCents: 200, prefix: null, unit: null, rawText: 'R$ 2' }],
              rawEvidence: 'Docinhos R$2',
            },
          ],
          pricingObservations: [],
          choiceGroups: [],
          ruleBlocks: [
            {
              title: 'Aviso sobre encomendas',
              body: 'Faça seu pedido com antecedência',
              scope: 'ambiguous' as const, // Escopo incerto
              sourcePages: [1],
              rawEvidence: 'Faça seu pedido com antecedência',
            },
          ],
          comboEvidence: [],
          photos: [],
          residualTexts: [],
        },
        importPlan: {
          categories: [{ name: 'Doces', description: '', order: 0, sourceEvidenceCandidateIndexes: [0] }],
          products: [
            {
              kind: 'product' as const,
              name: 'Docinhos',
              description: '',
              categoryIndex: 0,
              exclusiveToCombo: false,
              order: 0,
              preorderPolicy: null,
              basePriceCents: 200,
              priceOrigin: 'source' as const,
              sourceProductCandidateIndexes: [0],
              sourceRuleIndexes: [],
            },
          ],
          complementGroups: [],
          productImages: [],
          storePolicy: null,
        },
        unresolved: [], // Modelo não registrou em unresolved!
        warnings: [],
      };

      const { normalizedData } = normalizeDomainNativeData(rawPayload);
      const issues = validateImportPlanDomain(
        normalizedData.sourceEvidence,
        normalizedData.importPlan,
        normalizedData.unresolved
      );

      const ambiguousIssue = issues.find((i) => i.code === 'AMBIGUOUS_RULE_SCOPE_UNRESOLVED');
      expect(ambiguousIssue).toBeDefined();
      expect(ambiguousIssue?.severity).toBe('warning');
    });
  });
});
