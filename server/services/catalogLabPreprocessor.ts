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
    supportsCompositeChoiceFlattening: true,
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
Sua missão é compreender a estrutura comercial real do documento em UMA ÚNICA PASSAGEM e traduzi-la fielmente nas 3 camadas:
1. "sourceEvidence": transcrição fidedigna do documento (ofertas candidatas, opções, observações de preço, regras, combos e fotos).
2. "importPlan": plano comercial modelado estritamente nas capacidades reais da plataforma Pode Vir (categories, products, complementGroups, productImages e storePolicy).
3. "unresolved": pendências formais, ambiguidades documentais ou regras de negócio que não cabem fielmente no domínio.

PRINCÍPIOS SEMÂNTICOS FUNDAMENTAIS:
1. EVIDENCE FIRST:
   - "sourceEvidence" descreve integralmente a fonte. Nenhuma informação comercial deve sumir da Evidence apenas por ser difícil ou impossível representá-la na plataforma.
2. FRONTEIRAS DE PRODUTO E COMPLETUDE DE CHOICE GROUPS:
   - Um Product representa uma oferta comercial principal e autônoma identificável.
   - Alternativas que o cliente escolhe (sabores, massas, tamanhos, adicionais) DEVEM ser estruturadas em "choiceGroups" (não apenas no texto descritivo) e virar ComplementGroupPlan ou unresolved.
   - Category é agrupamento comercial real da loja, NÃO heading de produto individual. Se uma seção do documento contém apenas 1 produto e o título da seção é o próprio nome do produto, use a categoria de nível superior.
3. PRICING CAUSAL E MATRIZES DE PREÇO:
   - Use as capacidades do domínio antes de declarar unsupported:
     * 1 dimensão discreta com preços -> 1 ComplementGroup com base + deltas.
     * Múltiplas dimensões aditivas -> grupos independentes.
     * Matriz não aditiva finita com todas as combinações enumeradas -> 1 grupo composto (composite choice flattening) onde cada opção possui delta exato sobre o menor preço base.
     * Somente matriz incompleta/impossível -> unresolved ("unrepresentable_pricing_matrix").
   - Proveniência causal: "sourcePriceRefs" deve ser preenchido apenas quando a opção determina/reconstrói causalmente aquele preço (base + delta == price). NÃO associe o preço base a opções gratuitas de sabor.
   - Se houver múltiplos preços observados em um candidato, relacione em "pricingObservations" ou aponte os preços afetados em "unresolved" ("evidencePriceRefs").
4. COBERTURA VISUAL COMPLETA (1:1 POR CANDIDATO):
   - Para CADA ProductCandidate (índices 0..N-1), produza exatamente UMA avaliação visual em "photos":
     * "direct": fotografia retrata especificamente aquele produto, com "photoBox" [ymin, xmin, ymax, xmax] normalizado 0..1000 (ymin < ymax e xmin < xmax). Gera ProductImagePlan.
     * "shared": imagem comercial compartilhada entre ofertas.
     * "ambiguous": relação visual incerta ou meramente ilustrativa.
     * "none": não existe fotografia comercial adequada (photoBox null). "none" é um resultado válido e esperado.
   - NUNCA use como foto de produto: logotipos, marcas, selos, ícones, ornamentos gráficos, fundos ou ilustrações genéricas.
5. PREORDER E REGRAS:
   - "minLeadMinutes" define tempo de antecedência em minutos. NÃO determine disponibilidade automática (deixe availability=null e salesMode=null) a menos que explicitamente declarado no texto.
   - Todo bloco em "ruleBlocks" DEVE ter escopo explícito: scope ('global' | 'products' | 'category' | 'ambiguous'). Se ambíguo, envie para unresolved.
6. RASTREABILIDADE TOTAL:
   - Toda entidade em "importPlan" deve ter correspondência em "sourceEvidence".
   - Toda Evidence comercial relevante deve virar "importPlan" ou aparecer em "unresolved" (zero perda silenciosa).

CONTRATO E REGRAS ECONÔMICAS:
- Todas as referências cruzadas utilizam índices inteiros (ex: productIndex, categoryIndex, choiceGroupIndex, sourceRuleIndexes, sourcePriceRefs).
- Preço base canônico único (basePriceCents). Variações dimensionais modeladas via ComplementGroup com deltas aditivos (priceDeltaCents).
- Preço ausente na fonte documental deve ser preservado como null (NUNCA zero fictício) com priceOrigin='missing' e severidade blocker em "unresolved".
- Zero (R$0) é aceito exclusivamente quando o item for explicitamente gratuito ou for componente de combo com priceOrigin='technical_zero_exclusive_combo'.

AUDITORIA INTERNA PRÉ-EMISSÃO (MENTAL):
Antes de emitir o JSON final, revise internamente:
- Avaliou visualmente TODOS os ProductCandidates 1:1 em photos (nenhum candidato sem avaliação visual)?
- Garantiu que photoBox tem coordenadas válidas 0..1000 com ymin < ymax e xmin < xmax?
- Não utilizou logos, ícones ou decorações como foto comercial de produtos?
- Modelou matrizes finitas enumeradas via composite choice flattening antes de desistir para unresolved?
- Não associou o preço base a opções gratuitas de sabor em sourcePriceRefs?
- Não forçou availability/salesMode em regras de antecedência sem evidência real (availability=null)?
- Todas as alternativas de escolha do cliente foram estruturadas em choiceGroups?
- Emita exclusivamente o objeto JSON estritamente conforme o schema fornecido.`;

export function buildDomainNativeAnalysisPrompt(
  context: DomainNativePreprocessorContext | LabPreprocessorContext
): string {
  const pageCount = context.pageCountKnown ?? context.pageCount;
  const pageInfo =
    context.sourceType === 'pdf' && pageCount
      ? `Documento PDF com ${pageCount} página(s). Analise TODAS as páginas da página 1 até a última.`
      : context.sourceType === 'pdf'
      ? 'Documento PDF multipágina. Analise atentamente todas as páginas do início ao fim.'
      : 'Cardápio em formato de imagem única.';

  return `EXECUÇÃO: 1 (UMA) ÚNICA INFERÊNCIA MULTIMODAL DOMAIN-NATIVE.
${pageInfo}

Fluxo de execução:
1. Compreender integralmente a fonte e preencher "sourceEvidence".
2. Determinar fronteiras comerciais reais (produtos autônomos vs opções subordinadas em choiceGroups).
3. Avaliar visualmente CADA candidato a produto 1:1 em "photos" (direct com box [ymin, xmin, ymax, xmax], shared, ambiguous ou none).
4. Estruturar o plano em "importPlan" respeitando as capacidades da Pode Vir (dimensão discreta -> base + deltas; matriz finita -> composite flattening).
5. Registrar pendências com referências causais ("evidencePriceRefs") em "unresolved".

Capacidades da plataforma Pode Vir:
- Preço nativo por produto: exatamente 1 (basePriceCents) com linhagem em "basePriceSource".
- Variações dimensionais: ComplementGroup com acréscimos deltas e linhagem causal em "sourcePriceRefs". Não associe preços a sabores gratuitos.
- Composite Choice Flattening: matrizes finitas não aditivas com combinações enumeradas são achatadas em 1 grupo com deltas sobre a base menor. Matrizes impossíveis vão para "unresolved".
- Cobertura visual obrigatória: exatamente 1 avaliação em "photos" para cada ProductCandidate. Fotos direct com box válido viram productImages. None não tem box. Não use logos ou decoração como foto.
- Preorder e prazos: suporta "minLeadMinutes" em "preorderPolicy". Se a modalidade não for expressa, deixe availability=null.
- Regras documentais: cada regra em "ruleBlocks" deve ter escopo explícito ('global' | 'products' | 'category' | 'ambiguous') e cobertura em produtos, loja ou unresolved.
- ComplementGroups: embedded_product (exclusivo de 1 produto) ou shared (compartilhado por produtos/categorias).
- Combos: suporta fixed (itens definidos) e staged (etapas). Componentes exclusivos usam exclusiveToCombo=true e technical_zero_exclusive_combo.

Preencha rigorosamente os campos e referências usando índices inteiros.`;
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
