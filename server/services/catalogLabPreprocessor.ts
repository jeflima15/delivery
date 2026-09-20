/**
 * Pré-processador Local do Laboratório IA (Domain-Native / Single-Pass)
 *
 * Responsabilidades:
 * - Preparar deterministicamente o contexto antes da inferência Gemini (sem OCR, sem heurística semântica);
 * - Mapear capacidades factuais da Pode Vir consumindo diretamente de catalogImportDomain.ts;
 * - Fornecer prompts concisos e objetivos instruindo a separação estrita em 3 camadas:
 *   1. sourceEvidence (com pricingObservations e comboEvidence estruturados);
 *   2. importPlan (ProductPlanBase, regular products com preço canônico, combos com startingPrice derivável, groups embedded/shared);
 *   3. unresolved (16 categorias formais de pendências e ambiguidades).
 */

import {
  PODE_VIR_DOMAIN_CAPABILITIES,
  type DomainCapabilities,
} from '../domain/catalogImportDomain.js';

export { PODE_VIR_DOMAIN_CAPABILITIES, type DomainCapabilities };

export interface LabPreprocessorContext {
  sourceType: 'pdf' | 'image';
  tenantId?: string;
  filename?: string;
  mimeType?: string;
  fileSize: number;
  fileSizeBytes?: number;
  pageCountKnown: number | null;
  pageCount?: number | null;
  domainCapabilities: any;
  capabilities: any;
  domainRules: string[];
}

export interface BuildLabPreprocessorParams {
  sourceType: 'pdf' | 'image';
  tenantId?: string;
  filename?: string;
  mimeType?: string;
  fileSize?: number;
  fileSizeBytes?: number;
  pageCountKnown?: number | null;
  pageCount?: number | null;
}

export interface DomainNativePreprocessorContext {
  sourceType: 'pdf' | 'image';
  tenantId?: string;
  filename?: string;
  mimeType: string;
  fileSize: number;
  fileSizeBytes: number;
  pageCountKnown: number | null;
  pageCount: number | null;
  domainCapabilities: DomainCapabilities;
  domainRules: string[];
}

export function buildDomainNativePreprocessorContext(
  params: BuildLabPreprocessorParams
): DomainNativePreprocessorContext {
  const { sourceType, tenantId, filename, mimeType, fileSize, fileSizeBytes, pageCountKnown, pageCount } = params;

  const resolvedPageCount = pageCount ?? pageCountKnown ?? null;
  const validPageCount =
    sourceType === 'image'
      ? 1
      : typeof resolvedPageCount === 'number' && Number.isInteger(resolvedPageCount) && resolvedPageCount >= 1
      ? resolvedPageCount
      : null;

  const size = Math.max(0, fileSizeBytes ?? fileSize ?? 0);

  const domainRules = [
    'Isolamento estrito de loja e tenant: o cardápio pertence exclusivamente ao estabelecimento analisado.',
    'Ontologia da fonte vs Ontologia Pode Vir: separe rigorosamente sourceEvidence, importPlan e unresolved.',
    'Preço canônico único por produto: variações de tamanho viram ComplementGroup com deltas aditivos.',
    'Combos e produtos exclusivos: componentes exclusivos de combo são Products com exclusiveToCombo=true.',
    'Preço ausente vira null e missing_price blocker; null nunca vira R$0 por suposição.',
    'Fotos apenas para produtos e combos comerciais; opções nunca possuem foto no catálogo.',
  ];

  return {
    sourceType,
    tenantId,
    filename,
    mimeType: mimeType || (sourceType === 'pdf' ? 'application/pdf' : 'image/jpeg'),
    fileSize: size,
    fileSizeBytes: size,
    pageCountKnown: validPageCount,
    pageCount: validPageCount,
    domainCapabilities: PODE_VIR_DOMAIN_CAPABILITIES,
    domainRules,
  };
}

export function buildLabPreprocessorContext(
  params: BuildLabPreprocessorParams
): LabPreprocessorContext {
  const { sourceType, tenantId, filename, mimeType, fileSize, fileSizeBytes, pageCountKnown, pageCount } = params;

  const resolvedPageCount = pageCount ?? pageCountKnown ?? null;
  const validPageCount =
    sourceType === 'image'
      ? 1
      : typeof resolvedPageCount === 'number' && Number.isInteger(resolvedPageCount) && resolvedPageCount >= 1
      ? resolvedPageCount
      : null;

  const size = Math.max(0, fileSizeBytes ?? fileSize ?? 0);

  const domainRules = [
    'Isolamento estrito de loja e tenant: o cardápio pertence exclusivamente ao estabelecimento analisado.',
    'Ontologia da fonte vs Ontologia Pode Vir: separe rigorosamente sourceEvidence, importPlan e unresolved.',
    'Preço canônico único por produto: variações de tamanho viram ComplementGroup com deltas aditivos.',
    'Combos e produtos exclusivos: componentes exclusivos de combo são Products com exclusiveToCombo=true.',
    'Preço ausente vira null e missing_price blocker; null nunca vira R$0 por suposição.',
    'Fotos apenas para produtos e combos comerciais; opções nunca possuem foto no catálogo.',
  ];

  const caps = {
    ...PODE_VIR_DOMAIN_CAPABILITIES,
    maxProductsPerCategory: 100,
    supportedEntities: ['Product', 'ComplementGroup', 'BusinessRule'],
    supportedOptionKinds: ['option', 'variant', 'addon'],
    supportedPricingModels: ['single', 'size_variants', 'quantity_tiers', 'multiple_prices'],
    productHasImage: true,
    productSupportsMultiplePrices: true,
    groupsSupportRequired: true,
    groupsSupportMinimum: true,
    groupsSupportMaximum: true,
    optionSupportsPrice: true,
    optionSupportsOwnImage: false,
    conditionalGroupLimitByVariant: false,
    minimumPerIndividualOption: false,
  };

  return {
    sourceType,
    tenantId,
    filename,
    mimeType: mimeType || (sourceType === 'pdf' ? 'application/pdf' : 'image/jpeg'),
    fileSize: size,
    fileSizeBytes: size,
    pageCountKnown: validPageCount,
    pageCount: validPageCount,
    domainCapabilities: caps as any,
    capabilities: caps as any,
    domainRules,
  };
}

/* ==========================================================================
   PROMPTS DO PIPELINE DOMAIN_NATIVE (NOVO PADRÃO CANÔNICO)
   ========================================================================== */

export const DOMAIN_NATIVE_SYSTEM_INSTRUCTION = `Você é o planejador de importação de catálogo da Pode Vir.
Sua missão é analisar o documento em UMA ÚNICA PASSAGEM e produzir o draft estrutural exato nas 3 camadas:
1. "sourceEvidence": transcrição fidedigna da fonte documental (candidatos brutos, pricingObservations com seletores, choiceGroups, ruleBlocks, comboEvidence estruturado e photos).
2. "importPlan": plano modelado estritamente nas capacidades reais da Pode Vir (categories, products com preço canônico único, complementGroups embedded/shared com deltas, productImages e storePolicy).
3. "unresolved": registro formal de ambiguidades documentais, incompatibilidades matemáticas ou regras fora do domínio.

REGRAS DE OURO DA PODE VIR:
- REFERÊNCIAS POR ÍNDICES INTEIROS: No JSON gerado, todos os campos de vínculo usam índices inteiros (ex: productIndex, categoryIndex, choiceGroupIndex). NUNCA invente strings de IDs.
- PREÇO CANÔNICO E DELTAS: Product comercial tem exatamente 1 preço base (basePriceCents). Variações de tamanho (ex: 15cm R$100, 20cm R$150) viram: basePriceCents=10000 e um ComplementGroup "Tamanho" com deltas 0 e 5000.
- PREÇO AUSENTE: Se o produto não tiver preço no documento, use basePriceCents=null, priceOrigin='missing' e registre unresolved 'missing_price'. NUNCA use R$0 para preço desconhecido (R$0 apenas se explicitamente grátis).
- COMPONENTES EXCLUSIVOS DE COMBO: Se um item comercial existe apenas dentro de um combo (ex: batata ou bebida do combo), crie como Product com exclusiveToCombo=true. Se não tiver preço avulso e não participar da soma, use priceOrigin='technical_zero_exclusive_combo' e basePriceCents=0.
- COMBOS: Fixed combo define comboBasePriceCents e itens fixos. Staged combo define comboBasePriceCents, etapas e opções com extraCents. Se o preço do combo não for identificável, use comboBasePriceCents=null e registre missing_price.
- ESCOPOS DE GRUPOS: ComplementGroup que pertence a 1 produto é embedded_product. Grupo compartilhado é shared (com targetProductIndexes e/ou targetCategoryIndexes). Escopo incerto vira unresolved 'ambiguous_group_scope'.
- FOTOS: Exclusivamente para produtos comerciais e combos (productImages). Opções de complemento NUNCA têm foto.`;

export function buildDomainNativeAnalysisPrompt(
  context: DomainNativePreprocessorContext | LabPreprocessorContext
): string {
  const pageCount = context.pageCountKnown ?? context.pageCount;
  const pageInfo =
    context.sourceType === 'pdf' && pageCount
      ? `Documento PDF com ${pageCount} página(s). Páginas totais informadas no contexto: ${pageCount}. Analise TODAS as páginas da página 1 até a última.`
      : context.sourceType === 'pdf'
      ? 'Documento PDF multipágina. Analise atentamente todas as páginas do início ao fim.'
      : 'Cardápio em formato de imagem única.';

  return `EXECUÇÃO: 1 (UMA) ÚNICA INFERÊNCIA MULTIMODAL DOMAIN-NATIVE.
${pageInfo}
Analise integralmente o cardápio e produza o draft estrutural no schema JSON fornecido.

ESTRUTURA DE DADOS:
1. sourceEvidence:
   - productCandidates: candidatos brutos a produtos
   - pricingObservations: linhas de preço observadas com seletores (choiceGroupIndex + optionIndex) para validação aditiva
   - choiceGroups: grupos de opções brutos observados
   - ruleBlocks: regras completas e seus corpos
   - comboEvidence: combos observados com componentes estruturados (nome, quantidade, isFixed)
   - photos: localização de fotos de produtos e combos (box normalizado 0-1000)
2. importPlan:
   - categories: categorias comerciais reais (null se não houver seção específica)
   - products: produtos e combos (com kind, preço canônico, exclusiveToCombo, preorderPolicy e combo config)
   - complementGroups: grupos embedded_product ou shared com deltas de preço
   - productImages: imagens atribuídas a produtos
   - storePolicy: pedido mínimo ou políticas gerais de encomenda da loja
3. unresolved:
   - registre pendências reais (missing_price, unrepresentable_pricing_matrix, unsupported_domain_rule, etc.)

Capacidades reais:
- productNativePriceCount: 1
- optionQuantityTransportMaximum: 20
- supportsOptionPriceDelta: true
- optionSupportsOwnImage: false
- supportsFixedCombo: true, supportsStagedCombo: true, supportsExclusiveComboProducts: true

Preencha rigorosamente os arrays usando índices inteiros para todas as referências cruzadas.`;
}

/* ==========================================================================
   PROMPTS DO PIPELINE V4_UNIFIED (PRESERVADO PARA MODO DEV / COMPARAÇÃO)
   ========================================================================== */

export const V4_SYSTEM_INSTRUCTION = `Você é um especialista em transcrição e estruturação de cardápios de alimentação para o sistema Pode Vir integrado via Interactions API.
Sua tarefa é analisar o documento (imagem ou PDF) em UMA ÚNICA PASSAGEM e produzir o draft estrutural completo e fidedigno do catálogo no formato JSON especificado.

DIRETRIZES CENTRAIS:
1. FIDELIDADE DOCUMENTAL:
   - Extraia rigorosamente apenas informações visíveis no documento.
   - NÃO invente produtos, opções, regras ou preços.
   - Se o documento claramente NÃO for um cardápio legível, defina "isMenu": false e retorne arrays vazios.

2. TESTE DE INDEPENDÊNCIA COMERCIAL:
   - Uma entidade só pertence a "catalog.products" se puder ser comprada/pedida avulsa como unidade comercial principal pelo cliente.
   - Tamanhos, diâmetros, pesos, fatias, massas, recheios, sabores, adicionais, decorações, coberturas, bordas e personalizações NÃO são produtos autônomos, mesmo que tenham preço, foto ou destaque visual.
   - Variações de tamanho/peso do mesmo produto base (ex: 12cm/1,5kg, 15cm/2kg) DEVEM ser consolidadas no array "prices" do produto principal, nunca desmembradas em múltiplos produtos.
   - Opções e personalizações pertencem a "catalog.groups".

3. TÍTULO GLOBAL VS. CATEGORIA COMERCIAL:
   - O título geral do documento (ex: "Catálogo de Encomendas", "Cardápio 2026", "Menu Especial") ou o nome da marca NÃO é categoria comercial de produtos.
   - Categorias ("categoryName") representam seções comerciais locais específicas (ex: "Bolos de Festa", "Pizzas Tradicionais", "Sobremesas").
   - Se não houver categoria comercial específica visível, use null. NUNCA invente "Geral" ou "Outros".
   - Se a categoria for idêntica ao nome do produto, defina como null.

4. PRESERVAÇÃO INTEGRAL DE REGRAS OPERACIONAIS:
   - Prazos de antecedência, pedido mínimo (por pedido ou por sabor), regras de retirada, taxas de entrega, alérgenos, sinal/pagamento e conservação devem ser preservados com seu CORPO COMPLETO em "evidence.ruleBlocks" e "catalog.businessRules". NUNCA resuma o texto da regra para apenas um título.

5. REGRAS FORA DO DOMÍNIO SUPORTADO (unsupported_domain_rule):
   - Se uma regra comercial do documento não puder ser expressa fielmente pelos campos do domínio (ex: limite de escolhas variável dependendo do tamanho escolhido, ou mínimo de unidades por sabor), preserve a regra em "catalog.businessRules" e registre um sinal em "reviewFlags" com type "unsupported_domain_rule".
   - Não deformatar campos como minimum/maximum para tentar acomodar regras condicionais.

6. FOTOGRAFIAS (photos):
   - Apenas produtos comerciais e combos ("catalog.products") possuem avaliação fotográfica. Opções e complementos NÃO possuem foto no catálogo.
   - Para CADA produto em "catalog.products", retorne exatamente um registro em "photos" referenciando seu productIndex.
   - Se houver foto nítida do alimento, informe pageNumber e photoBox [ymin, xmin, ymax, xmax] normalizado de 0 a 1000.
   - Se não houver foto para o produto, use photoRelation "none", pageNumber null e photoBox null.

7. SINAIS DO MODELO (reviewFlags):
   - Não faça uma auto-auditoria exaustiva. Registre em "reviewFlags" apenas ambiguidades reais, informações não representáveis ou pontos de incerteza operacional identificados durante a leitura.`;

export function buildUnifiedAnalysisPrompt(context: LabPreprocessorContext): string {
  const pageCount = context.pageCountKnown ?? context.pageCount;
  const pageInfo =
    context.sourceType === 'pdf' && pageCount
      ? `Documento PDF com ${pageCount} página(s). Páginas totais informadas no contexto: ${pageCount}. Analise TODAS as páginas da página 1 até a última.`
      : context.sourceType === 'pdf'
      ? 'Documento PDF multipágina. Analise atentamente todas as páginas do início ao fim.'
      : 'Cardápio em formato de imagem única.';

  return `EXECUÇÃO: 1 (UMA) ÚNICA INFERÊNCIA MULTIMODAL.
${pageInfo}
Analise integralmente o cardápio e produza o draft estrutural no schema JSON fornecido.

ESTRUTURA DE DADOS ESPERADA:
1. EVIDÊNCIAS DE ENTRADA (CANDIDATES, GROUPS, RULES):
   - Extraia produtos candidatos brutos em "evidence.productCandidates".
   - Extraia grupos de opções brutos em "evidence.choiceGroups".
   - Extraia blocos de regras completas em "evidence.ruleBlocks".

2. CATÁLOGO COMERCIAL FINAL:
   - Compile apenas produtos autônomos em "catalog.products".
   - NÃO transforme opções, sabores ou adicionais em produtos.
   - Compile grupos de complementos em "catalog.groups".
   - Compile regras em "catalog.businessRules".

3. FOTOS COM CORRESPONDÊNCIA:
   - Forneça exatamente 1 avaliação para cada item em "catalog.products".

Capacidades reais do catálogo Pode Vir:
- productSupportsMultiplePrices: true (consolide linhas de tamanho/peso em product.prices)
- optionSupportsPrice: true (acréscimo de preço em opções de complemento)
- optionSupportsOwnImage: false (opções não possuem foto própria)
- conditionalGroupLimitByVariant: false (limite condicionado ao tamanho deve ser registrado como businessRule + reviewFlag unsupported_domain_rule)
- minimumPerIndividualOption: false (mínimo por sabor/opção deve ser registrado como businessRule + reviewFlag unsupported_domain_rule)

Preencha rigorosamente os arrays de evidence, catalog, photos e reviewFlags respeitando os índices especificados no schema.`;
}
