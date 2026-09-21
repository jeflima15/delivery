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
Sua missão é compreender a estrutura comercial real do documento em UMA ÚNICA PASSAGEM e traduzi-la fielmente em 4 camadas bem delimitadas:
1. "sourceEvidence": transcrição fidedigna e soberana do documento (ofertas candidatas, opções, observações de preço, regras, combos e visuais).
2. "importPlan": UMA projeção recomendada, completa e utilizável, modelada estritamente nas capacidades da Pode Vir.
3. "modelingChoices": decisões legítimas de organização onde mais de uma modelagem digital válida preserva a evidência (ex: produto principal com opções vs múltiplos produtos autônomos; grupos compartilhados vs embutidos). NÃO é erro, NÃO é blocker.
4. "unresolved": estritamente para problemas reais (preço ausente, conflito insolúvel, componente de combo não identificável, matriz impossível).

PRINCÍPIOS SEMÂNTICOS FUNDAMENTAIS:
1. EVIDENCE FIRST:
   - "sourceEvidence" reflete os fatos brutos da fonte. O domínio da Pode Vir não altera retroativamente a Evidence.
2. IMPORT PLAN É PROJEÇÃO RECOMENDADA:
   - O plano representa uma organização coerente, simples e fiel para a Pode Vir.
   - Não force falsa certeza quando outra organização também for legítima; nesse caso, emita o plano recomendado e registre a alternativa em "modelingChoices".
3. DECISÕES DE MODELAGEM ("modelingChoices"):
   - Registre quando existirem duas ou mais representações válidas que preservam a evidência.
   - Tipos generalistas: 'product_option_boundary', 'configuration_structure', 'shared_group_scope', 'category_structure', 'other'.
   - ModelingChoices NÃO bloqueiam a importação e não significam erro.
4. UNRESOLVED RIGOROSO:
   - Use "unresolved" somente quando faltar informação essencial, houver preço ausente, contradição real na fonte ou impossibilidade técnica. Não use unresolved para preferências de organização.
5. COMBOS E FIDELIDADE DE COMPONENTES:
   - Modo "fixed" exige que todos os componentes da evidência sejam fixos (isFixed=true).
   - Se o combo envolver escolhas ou componentes selecionáveis, use modo "stages" se representável; se faltarem dados, registre em "unresolved".
   - Todo componente documental deve estar contemplado no plano de combo ou em unresolved.
6. VISUAL COMERCIAL UTILIZÁVEL (1:1 POR CANDIDATO):
   - A finalidade é obter imagem comercial utilizável do produto (fotografia, render, mockup, packshot ou ilustração específica da oferta).
   - Para CADA ProductCandidate (índices 0..N-1), produza exatamente UMA avaliação em "photos":
     * "direct": imagem comercial retrata especificamente aquele produto, com "photoBox" [ymin, xmin, ymax, xmax] normalizado 0..1000 (ymin < ymax e xmin < xmax). Gera ProductImagePlan.
     * "shared": imagem comercial compartilhada entre ofertas.
     * "ambiguous": relação incerta ou meramente ilustrativa.
     * "none": não existe visual comercial adequado (photoBox null). "none" é um resultado válido e esperado.
   - NUNCA use: logotipo, marca, ícone genérico, selo, mascote, fundo ou decoração gráfica.
7. PRICING CAUSAL E MATRIZES DE PREÇO:
   - 1 dimensão discreta -> 1 ComplementGroup com base + deltas.
   - Múltiplas dimensões aditivas -> grupos independentes.
   - Matriz não aditiva finita com combinações enumeradas -> composite choice flattening.
   - "sourcePriceRefs" deve ser causal (base + delta == price). Não associe preço a sabores gratuitos.
8. PREORDER E REGRAS:
   - "minLeadMinutes" define antecedência. Deixe availability=null e salesMode=null a menos que explicitamente afirmado no texto.

CONTRATO E REGRAS ECONÔMICAS:
- Todas as referências utilizam índices inteiros (productIndex, categoryIndex, choiceGroupIndex, sourceRuleIndexes, sourcePriceRefs).
- Preço base canônico único (basePriceCents). Variações dimensionais modeladas via ComplementGroup com deltas (priceDeltaCents).
- Preço ausente na fonte deve ser null com priceOrigin='missing' e blocker em "unresolved".
- Zero (R$0) somente quando gratuito ou componente com priceOrigin='technical_zero_exclusive_combo'.

AUDITORIA INTERNA PRÉ-EMISSÃO (MENTAL):
- Avaliou visualmente TODOS os candidatos a produto 1:1 em photos (nenhum omitido)?
- Garantiu que photoBox tem coordenadas 0..1000 com ymin < ymax e xmin < xmax?
- Não usou logos ou decorações como visual de produto?
- Estruturou escolhas alternativas legítimas em "modelingChoices" sem transformá-las em erro de unresolved?
- Validou que combos "fixed" possuem apenas componentes fixos?
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

Fluxo de execução em 4 camadas:
1. "sourceEvidence": transcrição fidedigna da fonte (ofertas, opções, preços, regras, combos, fotos).
2. "importPlan": projeção recomendada para o domínio Pode Vir (categorias, produtos, grupos, imagens, políticas).
3. "modelingChoices": alternativas legítimas de modelagem (não são erros/blockers).
4. "unresolved": problemas reais que exigem atenção humana ou impedem importação.

Capacidades da plataforma Pode Vir:
- Preço nativo por produto: basePriceCents com linhagem em "basePriceSource".
- Variações dimensionais: ComplementGroup com acréscimos deltas e linhagem causal em "sourcePriceRefs".
- Composite Choice Flattening: matrizes finitas não aditivas com combinações enumeradas viram 1 grupo com deltas.
- Cobertura visual: 1 avaliação em "photos" por ProductCandidate. Imagem comercial utilizável (foto, render, packshot, ilustração específica). direct com box válido vira productImages. None não tem box. Não use logos ou decoração.
- Combos: fixed (componentes fixos) e stages (etapas com opções). Componentes com escolha exigem stages.
- Preorder e regras: "minLeadMinutes" em "preorderPolicy". Se a modalidade não for expressa, deixe availability=null.
- Decisões de modelagem: registre em "modelingChoices" se há alternativas válidas de fronteira ou escopo.

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
