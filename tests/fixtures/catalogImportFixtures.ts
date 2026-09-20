import type { CatalogImportDomainRawAnalysis } from '../../src/lib/catalogImportDomain.js';

/**
 * Fixture 1: Confeitaria Artesanal (Emanuele Confeitaria)
 * - Doces finos com preço unitário
 * - Bolos sob encomenda com antecedência de 48h (scheduled_only)
 * - Produto exclusivo para combo com technical_zero_exclusive_combo
 * - Combo "Kit Festa" fixed_bundle
 * - Bounding boxes de fotos mapeadas
 */
export const emanueleConfeitariaDomainRawFixture: CatalogImportDomainRawAnalysis = {
  isMenu: true,
  document: {
    sourceType: 'pdf',
    globalTitle: 'Emanuele Confeitaria Artesanal',
    globalTitleRole: 'brand',
    brand: 'Emanuele Confeitaria',
    pageCoverage: [
      { pageNumber: 1, role: 'cover', hasCatalogEvidence: false, notes: 'Capa' },
      { pageNumber: 2, role: 'doces', hasCatalogEvidence: true, notes: 'Doces' },
      { pageNumber: 3, role: 'bolos', hasCatalogEvidence: true, notes: 'Bolos' },
      { pageNumber: 4, role: 'combos', hasCatalogEvidence: true, notes: 'Kits e regras' },
    ],
    sections: [
      { name: 'Doces Finos', role: 'category', sourcePages: [2] },
      { name: 'Bolos Personalizados', role: 'category', sourcePages: [3] },
      { name: 'Kits Promocionais', role: 'category', sourcePages: [4] },
    ],
  },
  sourceEvidence: {
    productCandidates: [
      {
        name: 'Brigadeiro Belga',
        description: 'Chocolate belga 54% cacau com confeitos Callebaut',
        sourcePages: [2],
        categoryHint: 'Doces Finos',
        prices: [{ label: 'Unidade', amountCents: 450, prefix: null, unit: null, rawText: 'R$ 4,50' }],
        rawEvidence: 'Brigadeiro Belga - R$ 4,50',
      },
      {
        name: 'Beijinho de Coco Fresco',
        description: 'Feito com coco fresco ralado e leite condensado',
        sourcePages: [2],
        categoryHint: 'Doces Finos',
        prices: [{ label: 'Unidade', amountCents: 400, prefix: null, unit: null, rawText: 'R$ 4,00' }],
        rawEvidence: 'Beijinho - R$ 4,00',
      },
      {
        name: 'Bolo Red Velvet',
        description: 'Massa aveludada com recheio de cream cheese',
        sourcePages: [3],
        categoryHint: 'Bolos Personalizados',
        prices: [{ label: 'A partir de', amountCents: 12000, prefix: 'A partir de', unit: 'kg', rawText: 'A partir de R$ 120,00' }],
        rawEvidence: 'Bolo Red Velvet - A partir de R$ 120,00',
      },
      {
        name: 'Vela Vulcão Faísca',
        description: 'Vela especial para topo de bolo, disponível apenas no Kit Festa',
        sourcePages: [4],
        categoryHint: 'Kits Promocionais',
        prices: [],
        rawEvidence: 'Incluso no Kit Festa',
      },
      {
        name: 'Kit Festa Aniversário',
        description: '1 Bolo Red Velvet 1kg + 30 Brigadeiros + 1 Vela Vulcão',
        sourcePages: [4],
        categoryHint: 'Kits Promocionais',
        prices: [{ label: 'Kit Completo', amountCents: 22000, prefix: null, unit: null, rawText: 'R$ 220,00' }],
        rawEvidence: 'Kit Festa - R$ 220,00',
      },
    ],
    pricingObservations: [
      {
        productCandidateIndex: 2,
        amountCents: 12000,
        selectors: [{ choiceGroupIndex: 0, optionIndex: 0 }],
        rawText: 'R$ 120,00 (1kg)',
        sourcePages: [3],
      },
      {
        productCandidateIndex: 2,
        amountCents: 21000,
        selectors: [{ choiceGroupIndex: 0, optionIndex: 1 }],
        rawText: 'R$ 210,00 (2kg)',
        sourcePages: [3],
      },
    ],
    choiceGroups: [
      {
        title: 'Tamanho do Bolo',
        sourcePages: [3],
        instruction: 'Escolha o peso',
        parentCandidateIndex: 2,
        options: [
          { name: '1kg (10 a 12 fatias)', rawText: '1kg', amountCents: 12000, priceRawText: 'R$ 120,00' },
          { name: '2kg (20 a 24 fatias)', rawText: '2kg', amountCents: 21000, priceRawText: 'R$ 210,00' },
        ],
        rawEvidence: 'Tamanhos: 1kg R$ 120 / 2kg R$ 210',
      },
    ],
    ruleBlocks: [
      {
        title: 'Antecedência',
        body: 'Encomendas de bolos devem ser feitas com no mínimo 48 horas de antecedência.',
        sourcePages: [4],
        rawEvidence: 'Antecedência mínima 48h',
      },
    ],
    comboEvidence: [
      {
        rawTitle: 'Kit Festa Aniversário',
        rawDescription: '1 Bolo Red Velvet + 30 Brigadeiros + 1 Vela Vulcão',
        observedPriceCents: 22000,
        components: [
          { name: 'Bolo Red Velvet', quantity: 1, rawText: '1 Bolo', productCandidateIndex: 2, isFixed: true },
          { name: 'Brigadeiro Belga', quantity: 30, rawText: '30 Brigadeiros', productCandidateIndex: 0, isFixed: true },
          { name: 'Vela Vulcão Faísca', quantity: 1, rawText: '1 Vela', productCandidateIndex: 3, isFixed: true },
        ],
        rawText: 'Kit Festa R$ 220,00',
        sourcePages: [4],
      },
    ],
    photos: [
      {
        productIndex: 0,
        pageNumber: 2,
        photoBox: [100, 120, 350, 450],
        photoRelation: 'direct',
        photoWarning: null,
      },
      {
        productIndex: 2,
        pageNumber: 3,
        photoBox: [150, 520, 500, 900],
        photoRelation: 'direct',
        photoWarning: null,
      },
    ],
    residualTexts: [
      { text: 'Adoçando a vida desde 2018', sourcePage: 1, probableRole: 'slogan' },
    ],
  },
  importPlan: {
    categories: [
      { name: 'Doces Finos', description: 'Doces gourmet', order: 1, sourceEvidenceCandidateIndexes: [0, 1] },
      { name: 'Bolos Personalizados', description: 'Bolos decorados', order: 2, sourceEvidenceCandidateIndexes: [2] },
      { name: 'Kits Promocionais', description: 'Combos e pacotes de festa', order: 3, sourceEvidenceCandidateIndexes: [3, 4] },
    ],
    products: [
      {
        kind: 'product',
        name: 'Brigadeiro Belga',
        description: 'Chocolate belga 54% cacau com confeitos Callebaut',
        categoryIndex: 0,
        basePriceCents: 450,
        priceOrigin: 'source',
        exclusiveToCombo: false,
        order: 1,
        preorderPolicy: { availability: 'both', minLeadMinutes: 0 },
        combo: null,
        sourceProductCandidateIndexes: [0],
      },
      {
        kind: 'product',
        name: 'Beijinho de Coco Fresco',
        description: 'Feito com coco fresco ralado e leite condensado',
        categoryIndex: 0,
        basePriceCents: 400,
        priceOrigin: 'source',
        exclusiveToCombo: false,
        order: 2,
        preorderPolicy: { availability: 'both', minLeadMinutes: 0 },
        combo: null,
        sourceProductCandidateIndexes: [1],
      },
      {
        kind: 'product',
        name: 'Bolo Red Velvet',
        description: 'Massa aveludada com recheio de cream cheese',
        categoryIndex: 1,
        basePriceCents: 12000,
        priceOrigin: 'source',
        exclusiveToCombo: false,
        order: 1,
        preorderPolicy: { availability: 'scheduled_only', minLeadMinutes: 2880 },
        combo: null,
        sourceProductCandidateIndexes: [2],
      },
      {
        kind: 'product',
        name: 'Vela Vulcão Faísca',
        description: 'Vela especial para topo de bolo, disponível apenas no Kit Festa',
        categoryIndex: 2,
        basePriceCents: 0,
        priceOrigin: 'technical_zero_exclusive_combo',
        exclusiveToCombo: true,
        order: 2,
        preorderPolicy: null,
        combo: null,
        sourceProductCandidateIndexes: [3],
      },
      {
        kind: 'combo',
        name: 'Kit Festa Aniversário',
        description: '1 Bolo Red Velvet 1kg + 30 Brigadeiros + 1 Vela Vulcão',
        categoryIndex: 2,
        basePriceCents: 22000,
        priceOrigin: 'source',
        exclusiveToCombo: false,
        order: 1,
        preorderPolicy: { availability: 'scheduled_only', minLeadMinutes: 2880 },
        combo: {
          mode: 'fixed',
          comboBasePriceCents: 22000,
          items: [
            { productIndex: 2, quantity: 1 },
            { productIndex: 0, quantity: 20 },
            { productIndex: 3, quantity: 1 },
          ],
        },
        sourceProductCandidateIndexes: [4],
      },
    ],
    complementGroups: [
      {
        name: 'Tamanho do Bolo',
        placementType: 'embedded_product',
        parentProductIndex: 2,
        targetProductIndexes: [2],
        targetCategoryIndexes: [],
        required: true,
        minimum: 1,
        maximum: 1,
        active: true,
        options: [
          { name: '1kg (10 a 12 fatias)', description: '', priceDeltaCents: 0, maximumPerItem: 1, active: true, sourceChoiceGroupIndex: 0, sourceOptionIndex: 0 },
          { name: '2kg (20 a 24 fatias)', description: '', priceDeltaCents: 9000, maximumPerItem: 1, active: true, sourceChoiceGroupIndex: 0, sourceOptionIndex: 1 },
        ],
        sourceChoiceGroupIndexes: [0],
      },
    ],
    productImages: [
      { productIndex: 0, sourcePhotoIndex: 0, confidence: 0.95, transformation: 'use_crop' },
      { productIndex: 2, sourcePhotoIndex: 1, confidence: 0.95, transformation: 'use_crop' },
    ],
    storePolicy: {
      pedidoMinimoCents: 5000,
      globalPreorder: { minLeadMinutes: 2880, salesMode: 'both' },
    },
  },
  unresolved: [],
  warnings: [],
};

/**
 * Fixture 2: Hamburgueria Artesanal
 * - Burgers com adicionais compartilhados (shared complement group)
 * - Combo com etapas de escolha (staged combo)
 * - Pronta entrega imediata
 */
export const hamburgueriaDomainRawFixture: CatalogImportDomainRawAnalysis = {
  isMenu: true,
  document: {
    sourceType: 'image',
    globalTitle: 'Smash & Craft Burger Co.',
    globalTitleRole: 'brand',
    brand: 'Smash & Craft',
    pageCoverage: [
      { pageNumber: 1, role: 'cardapio_completo', hasCatalogEvidence: true, notes: 'Menu único' },
    ],
    sections: [
      { name: 'Burgers', role: 'category', sourcePages: [1] },
      { name: 'Acompanhamentos', role: 'category', sourcePages: [1] },
      { name: 'Bebidas', role: 'category', sourcePages: [1] },
      { name: 'Combos Especiais', role: 'category', sourcePages: [1] },
    ],
  },
  sourceEvidence: {
    productCandidates: [
      {
        name: 'Classic Cheeseburger',
        description: 'Pão brioche, smash burger 120g, cheddar inglês e maionese da casa',
        sourcePages: [1],
        categoryHint: 'Burgers',
        prices: [{ label: null, amountCents: 2800, prefix: null, unit: null, rawText: 'R$ 28,00' }],
        rawEvidence: 'Classic Cheeseburger R$ 28,00',
      },
      {
        name: 'Bacon Double Smash',
        description: 'Dois smashes de 100g, dobro de queijo e bacon crocante',
        sourcePages: [1],
        categoryHint: 'Burgers',
        prices: [{ label: null, amountCents: 3800, prefix: null, unit: null, rawText: 'R$ 38,00' }],
        rawEvidence: 'Bacon Double Smash R$ 38,00',
      },
      {
        name: 'Batata Rústica Pequena',
        description: 'Batatas com alecrim e alho frito',
        sourcePages: [1],
        categoryHint: 'Acompanhamentos',
        prices: [{ label: null, amountCents: 1400, prefix: null, unit: null, rawText: 'R$ 14,00' }],
        rawEvidence: 'Batata Rústica R$ 14,00',
      },
      {
        name: 'Refrigerante Lata 350ml',
        description: 'Coca-Cola, Guaraná Antárctica ou Sprite',
        sourcePages: [1],
        categoryHint: 'Bebidas',
        prices: [{ label: null, amountCents: 700, prefix: null, unit: null, rawText: 'R$ 7,00' }],
        rawEvidence: 'Refrigerante R$ 7,00',
      },
      {
        name: 'Combo Smash Perfeito',
        description: '1 Burger à sua escolha + 1 Acompanhamento + 1 Bebida',
        sourcePages: [1],
        categoryHint: 'Combos Especiais',
        prices: [{ label: 'A partir de', amountCents: 4200, prefix: 'A partir de', unit: null, rawText: 'A partir de R$ 42,00' }],
        rawEvidence: 'Combo Smash Perfeito A partir de R$ 42,00',
      },
    ],
    pricingObservations: [],
    choiceGroups: [
      {
        title: 'Adicionais Extras',
        sourcePages: [1],
        instruction: 'Turbine seu burger',
        parentCandidateIndex: null,
        options: [
          { name: 'Bacon Crocante Extra', rawText: '+R$ 5,00', amountCents: 500, priceRawText: '+R$ 5,00' },
          { name: 'Queijo Cheddar Extra', rawText: '+R$ 4,00', amountCents: 400, priceRawText: '+R$ 4,00' },
        ],
        rawEvidence: 'Adicionais: Bacon +5, Cheddar +4',
      },
    ],
    ruleBlocks: [],
    comboEvidence: [
      {
        rawTitle: 'Combo Smash Perfeito',
        rawDescription: 'Burger + Acompanhamento + Bebida',
        observedPriceCents: 4200,
        components: [
          { name: 'Burger à escolha', quantity: 1, rawText: '1 Burger', productCandidateIndex: 0, isFixed: false },
          { name: 'Batata Rústica', quantity: 1, rawText: '1 Batata', productCandidateIndex: 2, isFixed: true },
          { name: 'Refrigerante Lata', quantity: 1, rawText: '1 Refri', productCandidateIndex: 3, isFixed: true },
        ],
        rawText: 'Combo a partir de R$ 42,00',
        sourcePages: [1],
      },
    ],
    photos: [
      {
        productIndex: 0,
        pageNumber: 1,
        photoBox: [100, 50, 400, 450],
        photoRelation: 'direct',
        photoWarning: null,
      },
    ],
    residualTexts: [],
  },
  importPlan: {
    categories: [
      { name: 'Burgers', description: '', order: 1, sourceEvidenceCandidateIndexes: [0, 1] },
      { name: 'Acompanhamentos', description: '', order: 2, sourceEvidenceCandidateIndexes: [2] },
      { name: 'Bebidas', description: '', order: 3, sourceEvidenceCandidateIndexes: [3] },
      { name: 'Combos Especiais', description: '', order: 4, sourceEvidenceCandidateIndexes: [4] },
    ],
    products: [
      {
        kind: 'product',
        name: 'Classic Cheeseburger',
        description: 'Pão brioche, smash burger 120g, cheddar inglês e maionese da casa',
        categoryIndex: 0,
        basePriceCents: 2800,
        priceOrigin: 'source',
        exclusiveToCombo: false,
        order: 1,
        preorderPolicy: { availability: 'immediate_only', minLeadMinutes: 25 },
        combo: null,
        sourceProductCandidateIndexes: [0],
      },
      {
        kind: 'product',
        name: 'Bacon Double Smash',
        description: 'Dois smashes de 100g, dobro de queijo e bacon crocante',
        categoryIndex: 0,
        basePriceCents: 3800,
        priceOrigin: 'source',
        exclusiveToCombo: false,
        order: 2,
        preorderPolicy: { availability: 'immediate_only', minLeadMinutes: 25 },
        combo: null,
        sourceProductCandidateIndexes: [1],
      },
      {
        kind: 'product',
        name: 'Batata Rústica Pequena',
        description: 'Batatas com alecrim e alho frito',
        categoryIndex: 1,
        basePriceCents: 1400,
        priceOrigin: 'source',
        exclusiveToCombo: false,
        order: 1,
        preorderPolicy: { availability: 'immediate_only', minLeadMinutes: 20 },
        combo: null,
        sourceProductCandidateIndexes: [2],
      },
      {
        kind: 'product',
        name: 'Refrigerante Lata 350ml',
        description: 'Coca-Cola, Guaraná Antárctica ou Sprite',
        categoryIndex: 2,
        basePriceCents: 700,
        priceOrigin: 'source',
        exclusiveToCombo: false,
        order: 1,
        preorderPolicy: { availability: 'immediate_only', minLeadMinutes: 10 },
        combo: null,
        sourceProductCandidateIndexes: [3],
      },
      {
        kind: 'combo',
        name: 'Combo Smash Perfeito',
        description: '1 Burger à sua escolha + 1 Acompanhamento + 1 Bebida',
        categoryIndex: 3,
        basePriceCents: 4200,
        priceOrigin: 'source',
        exclusiveToCombo: false,
        order: 1,
        preorderPolicy: { availability: 'immediate_only', minLeadMinutes: 30 },
        combo: {
          mode: 'stages',
          comboBasePriceCents: 4200,
          stages: [
            {
              name: 'Escolha seu Burger',
              order: 1,
              stageValueCents: 0,
              chargeComplements: true,
              options: [
                { productIndex: 0, extraCents: 0, order: 1 },
                { productIndex: 1, extraCents: 800, order: 2 },
              ],
            },
            {
              name: 'Escolha seu Acompanhamento',
              order: 2,
              stageValueCents: 0,
              chargeComplements: false,
              options: [{ productIndex: 2, extraCents: 0, order: 1 }],
            },
            {
              name: 'Escolha sua Bebida',
              order: 3,
              stageValueCents: 0,
              chargeComplements: false,
              options: [{ productIndex: 3, extraCents: 0, order: 1 }],
            },
          ],
        },
        sourceProductCandidateIndexes: [4],
      },
    ],
    complementGroups: [
      {
        name: 'Adicionais Extras',
        placementType: 'shared',
        parentProductIndex: null,
        targetProductIndexes: [0, 1],
        targetCategoryIndexes: [],
        required: false,
        minimum: 0,
        maximum: 5,
        active: true,
        options: [
          { name: 'Bacon Crocante Extra', description: '', priceDeltaCents: 500, maximumPerItem: 3, active: true, sourceChoiceGroupIndex: 0, sourceOptionIndex: 0 },
          { name: 'Queijo Cheddar Extra', description: '', priceDeltaCents: 400, maximumPerItem: 3, active: true, sourceChoiceGroupIndex: 0, sourceOptionIndex: 1 },
        ],
        sourceChoiceGroupIndexes: [0],
      },
    ],
    productImages: [
      { productIndex: 0, sourcePhotoIndex: 0, confidence: 0.95, transformation: 'use_crop' },
    ],
    storePolicy: {
      pedidoMinimoCents: 2000,
      globalPreorder: { minLeadMinutes: 30, salesMode: 'immediate_only' },
    },
  },
  unresolved: [],
  warnings: [],
};

/**
 * Fixture 3: Família de Bolos com Matriz de Preço por Tamanho
 * - Base canônica: P (menor valor = R$ 65,00 = 6500 cents)
 * - M: delta +4000 (10500 - 6500)
 * - G: delta +8500 (15000 - 6500)
 */
export const bolosPrecoMatrizDomainRawFixture: CatalogImportDomainRawAnalysis = {
  isMenu: true,
  document: {
    sourceType: 'pdf',
    globalTitle: 'Doçaria Matriz de Sabores',
    globalTitleRole: 'brand',
    brand: 'Doçaria Matriz',
    pageCoverage: [
      { pageNumber: 1, role: 'bolos_matriz', hasCatalogEvidence: true, notes: 'Matriz de bolos' },
    ],
    sections: [{ name: 'Bolos Tradicionais', role: 'category', sourcePages: [1] }],
  },
  sourceEvidence: {
    productCandidates: [
      {
        name: 'Bolo de Cenoura com Brigadeiro',
        description: 'Massa fofa de cenoura com cobertura farta de brigadeiro tradicional',
        sourcePages: [1],
        categoryHint: 'Bolos Tradicionais',
        prices: [
          { label: 'P', amountCents: 6500, prefix: null, unit: null, rawText: 'P: R$ 65,00' },
          { label: 'M', amountCents: 10500, prefix: null, unit: null, rawText: 'M: R$ 105,00' },
          { label: 'G', amountCents: 15000, prefix: null, unit: null, rawText: 'G: R$ 150,00' },
        ],
        rawEvidence: 'P: R$ 65 | M: R$ 105 | G: R$ 150',
      },
    ],
    pricingObservations: [
      {
        productCandidateIndex: 0,
        amountCents: 6500,
        selectors: [{ choiceGroupIndex: 0, optionIndex: 0 }],
        rawText: 'P: R$ 65,00',
        sourcePages: [1],
      },
      {
        productCandidateIndex: 0,
        amountCents: 10500,
        selectors: [{ choiceGroupIndex: 0, optionIndex: 1 }],
        rawText: 'M: R$ 105,00',
        sourcePages: [1],
      },
      {
        productCandidateIndex: 0,
        amountCents: 15000,
        selectors: [{ choiceGroupIndex: 0, optionIndex: 2 }],
        rawText: 'G: R$ 150,00',
        sourcePages: [1],
      },
    ],
    choiceGroups: [
      {
        title: 'Tamanho do Bolo',
        sourcePages: [1],
        instruction: 'Selecione o tamanho',
        parentCandidateIndex: 0,
        options: [
          { name: 'P (15cm - até 10 pessoas)', rawText: 'P', amountCents: 6500, priceRawText: 'R$ 65,00' },
          { name: 'M (20cm - até 20 pessoas)', rawText: 'M', amountCents: 10500, priceRawText: 'R$ 105,00' },
          { name: 'G (25cm - até 30 pessoas)', rawText: 'G', amountCents: 15000, priceRawText: 'R$ 150,00' },
        ],
        rawEvidence: 'Tamanhos: P, M, G',
      },
    ],
    ruleBlocks: [],
    comboEvidence: [],
    photos: [],
    residualTexts: [],
  },
  importPlan: {
    categories: [{ name: 'Bolos Tradicionais', description: '', order: 1, sourceEvidenceCandidateIndexes: [0] }],
    products: [
      {
        kind: 'product',
        name: 'Bolo de Cenoura com Brigadeiro',
        description: 'Massa fofa de cenoura com cobertura farta de brigadeiro tradicional',
        categoryIndex: 0,
        basePriceCents: 6500,
        priceOrigin: 'source',
        exclusiveToCombo: false,
        order: 1,
        preorderPolicy: { availability: 'scheduled_only', minLeadMinutes: 1440 },
        combo: null,
        sourceProductCandidateIndexes: [0],
      },
    ],
    complementGroups: [
      {
        name: 'Tamanho do Bolo',
        placementType: 'embedded_product',
        parentProductIndex: 0,
        targetProductIndexes: [0],
        targetCategoryIndexes: [],
        required: true,
        minimum: 1,
        maximum: 1,
        active: true,
        options: [
          { name: 'P (15cm - até 10 pessoas)', description: '', priceDeltaCents: 0, maximumPerItem: 1, active: true, sourceChoiceGroupIndex: 0, sourceOptionIndex: 0 },
          { name: 'M (20cm - até 20 pessoas)', description: '', priceDeltaCents: 4000, maximumPerItem: 1, active: true, sourceChoiceGroupIndex: 0, sourceOptionIndex: 1 },
          { name: 'G (25cm - até 30 pessoas)', description: '', priceDeltaCents: 8500, maximumPerItem: 1, active: true, sourceChoiceGroupIndex: 0, sourceOptionIndex: 2 },
        ],
        sourceChoiceGroupIndexes: [0],
      },
    ],
    productImages: [],
    storePolicy: {
      pedidoMinimoCents: 0,
      globalPreorder: { minLeadMinutes: 1440, salesMode: 'scheduled_only' },
    },
  },
  unresolved: [],
  warnings: [],
};
