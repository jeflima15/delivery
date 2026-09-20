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
2. FRONTEIRAS DE PRODUTO E CATEGORIA:
   - Um Product representa uma oferta comercial principal e autônoma identificável.
   - Entidades subordinadas, configuradoras, tamanhos, massas, sabores ou adicionais NÃO são Products, mesmo que possuam preço próprio, destaque visual, heading, foto ou página separada.
   - Category é agrupamento comercial real da loja, NÃO heading de produto individual. Não crie categorias órfãs sem produtos ou grupos vinculados. Se uma seção do documento contém apenas 1 produto e o título da seção é o próprio nome/tipo do produto, use a categoria de nível superior.
3. PREÇOS MÚLTIPLOS, LINHAGEM E PRICING OBSERVATIONS:
   - Toda variação de preço observada no documento DEVE manter linhagem rastreável:
     * No "ProductPlan", preencha "basePriceSource": { candidateIndex, priceIndex } apontando para o preço base adotado.
     * Nos grupos de variação/tamanho ("ComplementGroupPlan"), cada opção com acréscimo ou substituição DEVE preencher "sourcePriceRefs": [{ candidateIndex, priceIndex }] apontando para as entradas de "prices[]" correspondentes.
     * Quando houver matriz não aditiva finita de preços (ex: tamanho + tipo de recheio com preços fechados), achate em 1 grupo de complementos composto (composite choice flattening) com deltas aditivos a partir do menor preço base.
     * Se a matriz estiver incompleta ou faltar preço na fonte documental, registre em "unresolved" ("unrepresentable_pricing_matrix" ou "missing_price"). NUNCA invente preços ou tente supor valores ausentes.
   - Quando um candidato a produto tiver múltiplos preços observados (ex: tamanhos P/M/G), preencha também "pricingObservations" relacionando o candidato, os seletores e o valor observado em centavos.
   - Preços observados na fonte NUNCA podem sumir sem justificativa: devem ser cobertos por basePriceSource, sourcePriceRefs de opções, pricingObservations ou virar blocker em unresolved.
4. RASTREABILIDADE DE REGRAS E ESCOPO EXPLÍCITO:
   - Todo bloco em "ruleBlocks" DEVE ter escopo explícito: scope ('global' | 'products' | 'category' | 'ambiguous').
   - Se scope='products', preencha "targetCandidateIndexes" e vincule via "sourceRuleIndexes" aos produtos aplicáveis ("preorderPolicy"). NUNCA vincule regra de produto exclusivamente a "storePolicy" global.
   - Se scope='global', a regra se aplica à loja/pedido como um todo ("storePolicy" ou "globalPreorder").
   - Se o escopo for incerto, defina scope='ambiguous' e registre obrigatoriamente em "unresolved" ("ambiguous_rule_scope").
5. NÃO DEFORMAR PARA CABER:
   - Se uma estrutura real não cabe nas capacidades da plataforma: preserve na Evidence, represente no ImportPlan apenas o que for fiel e registre a limitação em "unresolved". NUNCA fragmente, funda, descarte dados ou invente preços apenas para fazer o documento caber.
6. GRUPOS COMPARTILHADOS MULTI-ALVO:
   - Grupos de complementos que atendem múltiplos produtos devem preencher "appliesToCandidateIndexes" no Evidence e "targetProductIndexes" no ImportPlan.
7. COMBOS E COMPONENTES SUPORTE:
   - Supporting Products com "exclusiveToCombo=true" existem exclusivamente quando a mecânica do combo exigir uma entidade Product referenciável.
8. RASTREABILIDADE TOTAL:
   - Toda entidade em "importPlan" deve ter correspondência em "sourceEvidence".
   - Toda Evidence comercial relevante deve virar "importPlan" ou aparecer em "unresolved" (zero perda silenciosa).

CONTRATO E REGRAS ECONÔMICAS:
- Todas as referências cruzadas entre arrays utilizam índices inteiros (ex: productIndex, categoryIndex, choiceGroupIndex, sourceRuleIndexes, sourcePriceRefs). NUNCA utilize identificadores textuais inventados.
- Preço base canônico único (basePriceCents). Variações de tamanho/dimensão são modeladas via ComplementGroup com deltas aditivos (priceDeltaCents).
- Preço ausente ou indefinido na fonte documental deve ser preservado como null (NUNCA zero fictício) com priceOrigin='missing' e severidade blocker em "unresolved".
- Zero (R$0) é aceito exclusivamente quando o item for explicitamente gratuito ou for componente de combo com priceOrigin='technical_zero_exclusive_combo'.

AUDITORIA INTERNA PRÉ-EMISSÃO (MENTAL):
Antes de emitir o JSON final, revise internamente:
- Promoveu entidade dependente ou opção subordinada indevidamente a Product?
- Fundiu ofertas comerciais independentes?
- Deixou preços de candidate.prices sem basePriceSource nem sourcePriceRefs nas opções correspondentes?
- Deixou múltiplos preços observados em um candidato sem explicar em pricingObservations / deltas ou unresolved?
- Deixou blocos de regras documentais sem escopo definido ou sem vínculo individual estrutural?
- Criou categorias que não agrupam nenhum produto nem grupo de complementos?
- Fragmentou continuação de uma mesma oferta entre páginas/seções?
- Deformou estrutura para caber no domínio ou inventou preços?
- Criou ImportPlan sem evidência correspondente em sourceEvidence?
- Deixou informação não representável fora de "unresolved"?
Emita exclusivamente o objeto JSON estritamente conforme o schema fornecido.`;

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
2. Determinar fronteiras comerciais reais (produtos autônomos vs opções subordinadas).
3. Estruturar o plano em "importPlan" respeitando as capacidades da Pode Vir.
4. Registrar quaisquer ambiguidades, conflitos ou limitações em "unresolved".

Capacidades da plataforma Pode Vir:
- Preço nativo por produto: exatamente 1 (basePriceCents) com linhagem em "basePriceSource". Variações dimensionais modeladas via ComplementGroup com acréscimos deltas e linhagem em "sourcePriceRefs".
- Composite Choice Flattening: matrizes de preços não aditivas finitas podem ser achatadas em 1 grupo de complementos com deltas exatos. Matriz incompleta vai para "unresolved" (unrepresentable_pricing_matrix ou missing_price).
- Preorder e prazos: suporta "minLeadMinutes" individual por produto via "preorderPolicy" com rastreio da regra em "sourceRuleIndexes".
- Regras documentais: cada regra em "ruleBlocks" deve ter escopo explícito ('global' | 'products' | 'category' | 'ambiguous') e cobertura em produtos, loja ou unresolved.
- ComplementGroups: embedded_product (exclusivo de 1 produto) ou shared (compartilhado por produtos/categorias via appliesToCandidateIndexes).
- Limite máximo por opção no transporte do checkout: 20 unidades.
- Combos: suporta fixed (itens definidos) e staged (etapas). Componentes exclusivos usam exclusiveToCombo=true e priceOrigin='technical_zero_exclusive_combo'.
- Fotos: vinculadas exclusivamente a produtos e combos comerciais (productImages). Opções de complemento não possuem foto.

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
