/**
 * Pré-processador Local do Laboratório IA (V4 Unified / Single-Pass)
 *
 * Responsabilidade estrita:
 * - Preparar deterministicamente o contexto antes da inferência Gemini (sem OCR, sem heurística semântica);
 * - Mapear as capacidades REAIS do domínio Pode Vir (derivadas dos modelos Product e ComplementGroup);
 * - Fornecer prompts runtime concisos e objetivos (system_instruction + prompt de entrada reduzido).
 */

export interface DomainCapabilities {
  maxProductsPerCategory: number;
  supportedEntities: string[];
  supportedOptionKinds: string[];
  supportedPricingModels: string[];
  productHasImage: boolean;
  productSupportsMultiplePrices: boolean;
  groupsSupportRequired: boolean;
  groupsSupportMinimum: boolean;
  groupsSupportMaximum: boolean;
  optionSupportsPrice: boolean;
  optionSupportsOwnImage: boolean;
  conditionalGroupLimitByVariant: boolean;
  minimumPerIndividualOption: boolean;
}

/**
 * Capacidades factuais do domínio Pode Vir:
 * - Product possui imagem própria e suporta variações de preço consolidadas;
 * - ComplementGroup suporta obrigatoriedade (required), mínimo e máximo global do grupo;
 * - ComplementItem suporta acréscimo de preço (amountCents);
 * - O domínio NÃO suporta foto individual por opção de complemento (optionSupportsOwnImage = false);
 * - O domínio NÃO suporta limites dinâmicos de grupo condicionados à variante (conditionalGroupLimitByVariant = false);
 * - O domínio NÃO suporta mínimo individual por opção selecionada (minimumPerIndividualOption = false).
 */
export const PODE_VIR_DOMAIN_CAPABILITIES: Readonly<DomainCapabilities> = Object.freeze({
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
});

export interface LabPreprocessorContext {
  sourceType: 'pdf' | 'image';
  tenantId?: string;
  filename?: string;
  mimeType?: string;
  fileSize: number;
  fileSizeBytes?: number;
  pageCountKnown: number | null;
  pageCount?: number | null;
  domainCapabilities: DomainCapabilities;
  capabilities: DomainCapabilities;
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
    'Independência de produtos comerciais: itens que não podem ser pedidos isoladamente não devem virar produtos autônomos.',
    'Consolidação de variações de tamanho e peso sob o mesmo produto no array de preços.',
    'Preservação integral do corpo das regras de negócio operacionais.',
  ];

  const caps = { ...PODE_VIR_DOMAIN_CAPABILITIES };

  return {
    sourceType,
    tenantId,
    filename,
    mimeType: mimeType || (sourceType === 'pdf' ? 'application/pdf' : 'image/jpeg'),
    fileSize: size,
    fileSizeBytes: size,
    pageCountKnown: validPageCount,
    pageCount: validPageCount,
    domainCapabilities: caps,
    capabilities: caps,
    domainRules,
  };
}

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
