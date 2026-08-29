import { Router } from 'express';
import Product from '../../src/models/Product.js';
import Category from '../../src/models/Category.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import HomeBlock from '../../src/models/HomeBlock.js';
import { createStoreTheme } from '../../src/lib/theme.js';
import { computeIsStoreOpen } from '../../src/lib/storeStatus.js';
import { asyncRoute } from '../middleware/errors.js';
import { resolveTenant } from '../middleware/tenant.js';

const router = Router({ mergeParams: true });
router.use(resolveTenant);

export const publicSettingsDto = (settings: Record<string, any> | null | undefined) => {
  if (!settings) return null;
  const legacyCardEnabled = settings.pagamento_cartao !== false;
  const creditCardEnabled = typeof settings.pagamento_cartao_credito === 'boolean'
    ? settings.pagamento_cartao_credito
    : legacyCardEnabled;
  const debitCardEnabled = typeof settings.pagamento_cartao_debito === 'boolean'
    ? settings.pagamento_cartao_debito
    : legacyCardEnabled;
  return {
    is_open: computeIsStoreOpen(settings),
    manual_is_open: Boolean(settings.is_open),
    pausado_manualmente: Boolean(settings.pausado_manualmente),
    nome_loja: String(settings.nome_loja || ''),
    tagline: String(settings.tagline || ''),
    logo_url: String(settings.logo_url || ''),
    capa_url: String(settings.capa_url || ''),
    logoShape: settings.logoShape || 'squircle',
    theme: createStoreTheme(settings.theme),
    secondaryBanners: Array.isArray(settings.secondaryBanners)
      ? settings.secondaryBanners.map((b: any) => ({
          id: String(b.id || ''),
          imageUrl: String(b.imageUrl || ''),
          active: Boolean(b.active),
          link: String(b.link || ''),
        }))
      : [],
    logisticsOptions: {
      allowPickup: settings.logisticsOptions?.allowPickup !== false,
      allowDelivery: settings.logisticsOptions?.allowDelivery !== false,
      allowDineIn: Boolean(settings.logisticsOptions?.allowDineIn),
    },
    tempo_entrega: String(settings.tempo_entrega || '45-60 min'),
    whatsapp: String(settings.whatsapp || ''),
    sobre_texto: String(settings.sobre_texto || ''),
    instagram_url: String(settings.instagram_url || ''),
    cep_loja: String(settings.cep_loja || ''),
    rua_loja: String(settings.rua_loja || ''),
    numero_loja: String(settings.numero_loja || ''),
    bairro_loja: String(settings.bairro_loja || ''),
    cidade_loja: String(settings.cidade_loja || ''),
    estado_loja: String(settings.estado_loja || ''),
    faixas_entrega: Array.isArray(settings.faixas_entrega)
      ? settings.faixas_entrega.map((f: any) => ({ km_ate: Number(f.km_ate || 0), valor: Number(f.valor || 0) }))
      : [],
    abertura_automatica: Boolean(settings.abertura_automatica),
    mensagem_fechado: String(settings.mensagem_fechado || 'Estamos fechados no momento.'),
    horarios_funcionamento: settings.horarios_funcionamento || {},
    pedido_minimo: Number(settings.pedido_minimo || 0),
    frete_gratis_acima_de: Number(settings.frete_gratis_acima_de || 0),
    pagamento_pix: settings.pagamento_pix !== false,
    pagamento_cartao: creditCardEnabled || debitCardEnabled,
    pagamento_cartao_credito: creditCardEnabled,
    pagamento_cartao_debito: debitCardEnabled,
    pagamento_dinheiro: settings.pagamento_dinheiro !== false,
    pagamento_vale_alimentacao: Boolean(settings.pagamento_vale_alimentacao),
    bandeiras_vale_alimentacao: Array.isArray(settings.bandeiras_vale_alimentacao) ? settings.bandeiras_vale_alimentacao : [],
    pagamento_vale_refeicao: Boolean(settings.pagamento_vale_refeicao),
    bandeiras_vale_refeicao: Array.isArray(settings.bandeiras_vale_refeicao) ? settings.bandeiras_vale_refeicao : [],
    chave_pix: String(settings.chave_pix || ''),
    instrucoes_pix: String(settings.instrucoes_pix || ''),
    banner_ativo: Boolean(settings.banner_ativo),
    banner_texto: String(settings.banner_texto || ''),
    cupom_global_ativo: Boolean(settings.cupom_global_ativo),
    fidelidade_ativa: settings.fidelidade_ativa !== false,
    pontos_por_real: Number(settings.pontos_por_real || 1),
    valor_ponto_reais: Number(settings.valor_ponto_reais || 0.05),
  };
};

export const publicCategoryDto = (category: Record<string, any>) => ({
  _id: String(category._id),
  nome: String(category.nome || ''),
  descricao: String(category.descricao || ''),
  ordem: Number(category.ordem ?? 999),
});

export const publicProductDtoLight = (product: Record<string, any>) => {
  const isEsgotado = Boolean(product.esgotado || (product.controlar_estoque && Number(product.estoque || 0) <= 0));
  
  return {
    _id: String(product._id),
    id: String(product._id),
    tipo: product.tipo === 'combo' ? 'combo' : 'produto',
    nome: String(product.nome || ''),
    descricao: String(product.descricao || ''),
    preco: Number(product.preco || 0),
    preco_centavos: product.preco_centavos,
    preco_antigo: Number(product.preco_antigo || 0),
    preco_antigo_centavos: product.preco_antigo_centavos,
    imagem: String(product.imagem || ''),
    categoriaId: product.categoriaId ? String(product.categoriaId) : null,
    ativo: product.ativo !== false,
    esgotado: isEsgotado,
    destaque: Boolean(product.destaque),
    selo_destaque: String(product.selo_destaque || ''),
    promocao: Boolean(product.promocao),
    personalizavel: Boolean(product.personalizavel),
    pode_resgatar: Boolean(product.pode_resgatar),
    pontos_resgate: Number(product.pontos_resgate || 0),
    quantidade_total_opcoes: Number(product.quantidade_total_opcoes || 0),
    opcoes_disponiveis: Array.isArray(product.opcoes_disponiveis) ? product.opcoes_disponiveis : [],
    controlar_estoque: Boolean(product.controlar_estoque),
    estoque: Number(product.estoque || 0),
    estoque_minimo: Number(product.estoque_minimo || 0),
  };
};

export const publicProductDto = (product: Record<string, any>) => {
  const isEsgotado = Boolean(product.esgotado || (product.controlar_estoque && Number(product.estoque || 0) <= 0));
  const isEstoqueBaixo = Boolean(product.controlar_estoque && Number(product.estoque || 0) > 0 && Number(product.estoque || 0) <= Number(product.estoque_minimo || 0));

  return {
    _id: String(product._id),
    tipo: product.tipo === 'combo' ? 'combo' : 'produto',
    nome: String(product.nome || ''),
    descricao: String(product.descricao || ''),
    preco: Number(product.preco || 0),
    preco_centavos: product.preco_centavos,
    preco_antigo: Number(product.preco_antigo || 0),
    preco_antigo_centavos: product.preco_antigo_centavos,
    imagem: String(product.imagem || ''),
    personalizavel: Boolean(product.personalizavel),
    quantidade_total_opcoes: Number(product.quantidade_total_opcoes || 0),
    opcoes_disponiveis: Array.isArray(product.opcoes_disponiveis) ? product.opcoes_disponiveis : [],
    esgotado: isEsgotado,
    estoque_baixo: isEstoqueBaixo,
    categoriaId: product.categoriaId ? String(product.categoriaId) : null,
    ativo: product.ativo !== false,
    ordem: Number(product.ordem ?? 999),
    ordem_categoria: Number(product.ordem_categoria ?? 999),
    destaque: Boolean(product.destaque),
    selo_destaque: String(product.selo_destaque || ''),
    promocao: Boolean(product.promocao),
    pode_resgatar: Boolean(product.pode_resgatar),
    pontos_resgate: Number(product.pontos_resgate || 0),
    grupos_adicionais: Array.isArray(product.grupos_adicionais)
      ? product.grupos_adicionais.map((g: any) => ({
          _id: g._id ? String(g._id) : g.id ? String(g.id) : undefined,
          nome: String(g.nome || ''),
          obrigatorio: Boolean(g.obrigatorio),
          minimo: Number(g.minimo || 0),
          maximo: Number(g.maximo ?? 1),
          itens: Array.isArray(g.itens)
            ? g.itens.map((i: any) => ({
                _id: i._id ? String(i._id) : i.id ? String(i.id) : undefined,
                nome: String(i.nome || ''),
                preco: Number(i.preco || 0),
                preco_centavos: i.preco_centavos,
                ativo: i.ativo !== false,
              }))
            : [],
        }))
      : [],
    combo_etapas: product.tipo === 'combo' && Array.isArray(product.combo_etapas)
      ? product.combo_etapas.map((stage: any) => ({
          _id: String(stage._id),
          nome: String(stage.nome || ''),
          ordem: Number(stage.ordem || 0),
          valor_etapa_centavos: Number(stage.valor_etapa_centavos || 0),
          cobrar_complementos: stage.cobrar_complementos !== false,
          opcoes: Array.isArray(stage.opcoes) ? stage.opcoes.map((option: any) => ({
            produtoId: String(option.produtoId),
            acrescimo_centavos: Number(option.acrescimo_centavos || 0),
            ordem: Number(option.ordem || 0),
          })) : [],
        }))
      : [],
  };
};

export const publicHomeBlockDto = (block: Record<string, any>) => ({
  _id: String(block._id),
  titulo: String(block.titulo || ''),
  subtitulo: String(block.subtitulo || ''),
  descricao: String(block.descricao || ''),
  imagem_desktop: String(block.imagem_desktop || ''),
  imagem_mobile: String(block.imagem_mobile || ''),
  link_destino: String(block.link_destino || ''),
  texto_botao: String(block.texto_botao || ''),
  tipo_bloco: block.tipo_bloco || 'card_promocional',
  posicao_exibicao: block.posicao_exibicao || 'below_hero',
  acao_clique: block.acao_clique || 'nenhuma',
  modal_titulo: String(block.modal_titulo || ''),
  modal_texto_completo: String(block.modal_texto_completo || ''),
  modal_imagem: String(block.modal_imagem || ''),
  modal_cta_texto: String(block.modal_cta_texto || ''),
  modal_cta_link: String(block.modal_cta_link || ''),
  ativo: block.ativo !== false,
  ordem: Number(block.ordem ?? 999),
  abrir_nova_aba: Boolean(block.abrir_nova_aba),
  cor_fundo: String(block.cor_fundo || '#ffffff'),
  cor_texto: String(block.cor_texto || '#000000'),
});

router.get('/store', asyncRoute(async (req, res) => {
  const [settings, categories, products, blocks] = await Promise.all([
    StoreSettings.findOne({ tenantId: req.tenant?._id }).select('is_open pausado_manualmente nome_loja tagline logo_url capa_url logoShape theme secondaryBanners logisticsOptions tempo_entrega whatsapp sobre_texto instagram_url cep_loja rua_loja numero_loja bairro_loja cidade_loja estado_loja faixas_entrega abertura_automatica mensagem_fechado horarios_funcionamento pedido_minimo frete_gratis_acima_de pagamento_pix pagamento_cartao pagamento_cartao_credito pagamento_cartao_debito pagamento_dinheiro pagamento_vale_alimentacao bandeiras_vale_alimentacao pagamento_vale_refeicao bandeiras_vale_refeicao chave_pix instrucoes_pix banner_ativo banner_texto cupom_global_ativo fidelidade_ativa pontos_por_real valor_ponto_reais').lean(),
    Category.find({ tenantId: req.tenant?._id }).select('_id nome descricao ordem').sort({ ordem: 1, createdAt: 1 }).lean(),
    Product.find({ tenantId: req.tenant?._id, ativo: { $ne: false } }).select('_id tipo nome descricao preco preco_centavos preco_antigo preco_antigo_centavos imagem personalizavel quantidade_total_opcoes opcoes_disponiveis esgotado controlar_estoque estoque estoque_minimo categoriaId ativo ordem ordem_categoria destaque selo_destaque promocao pode_resgatar pontos_resgate grupos_adicionais combo_etapas').sort({ categoriaId: 1, ordem_categoria: 1, createdAt: 1 }).lean(),
    HomeBlock.find({ tenantId: req.tenant?._id, ativo: true }).select('_id titulo subtitulo descricao imagem_desktop imagem_mobile link_destino texto_botao tipo_bloco posicao_exibicao acao_clique modal_titulo modal_texto_completo modal_imagem modal_cta_texto modal_cta_link ativo ordem abrir_nova_aba cor_fundo cor_texto').sort({ posicao_exibicao: 1, ordem: 1 }).lean(),
  ]);
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.json({
    success: true,
    tenant: { id: req.tenant?._id, slug: req.tenant?.slug, status: req.tenant?.status, timezone: req.tenant?.timezone },
    settings: publicSettingsDto(settings),
    categories: categories.map(publicCategoryDto),
    products: products.map(publicProductDtoLight),
    blocks: blocks.map(publicHomeBlockDto),
  });
}));

router.get('/catalog', asyncRoute(async (req, res) => {
  const categories = await Category.find({ tenantId: req.tenant?._id }).select('_id nome descricao ordem').sort({ ordem: 1 }).lean();
  const products = await Product.find({ tenantId: req.tenant?._id, ativo: { $ne: false } }).select('_id tipo nome descricao preco preco_centavos preco_antigo preco_antigo_centavos imagem personalizavel quantidade_total_opcoes opcoes_disponiveis esgotado controlar_estoque estoque estoque_minimo categoriaId ativo ordem ordem_categoria destaque selo_destaque promocao pode_resgatar pontos_resgate grupos_adicionais combo_etapas').sort({ categoriaId: 1, ordem_categoria: 1 }).lean();
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.json({
    success: true,
    categories: categories.map(publicCategoryDto),
    products: products.map(publicProductDto),
  });
}));

router.get('/products/:productId', asyncRoute(async (req, res) => {
  const { productId } = req.params;
  const product = await Product.findOne({ _id: productId, tenantId: req.tenant?._id }).lean();
  
  if (!product) {
    res.status(404).json({ success: false, error: 'Product not found' });
    return;
  }
  
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  res.json({
    success: true,
    product: publicProductDto(product),
  });
}));

export default router;
