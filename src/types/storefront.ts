import type { StoreTheme } from '../lib/theme';

export interface AdditionalItem {
  _id?: string;
  id?: string;
  nome: string;
  preco: number;
  preco_centavos?: number;
  ativo?: boolean;
}

export interface AdditionalGroup {
  _id?: string;
  id?: string;
  nome: string;
  obrigatorio: boolean;
  minimo: number;
  maximo: number;
  itens: AdditionalItem[];
}

export interface ComboStageOption {
  produtoId: string;
  acrescimo_centavos: number;
  ordem: number;
}

export interface ComboStage {
  _id: string;
  nome: string;
  ordem: number;
  valor_etapa_centavos: number;
  cobrar_complementos: boolean;
  opcoes: ComboStageOption[];
}

export interface Product {
  id?: string;
  _id?: string;
  tipo?: 'produto' | 'combo';
  nome: string;
  descricao?: string;
  preco: number;
  preco_centavos?: number;
  preco_antigo?: number;
  preco_antigo_centavos?: number;
  categoriaId?: string | null;
  categoriaNome?: string;
  imagem?: string;
  ativo?: boolean;
  personalizavel?: boolean;
  quantidade_total_opcoes?: number;
  opcoes_disponiveis?: string[];
  controlar_estoque?: boolean;
  estoque?: number;
  estoque_minimo?: number;
  esgotado?: boolean;
  permite_talheres?: boolean;
  destaque?: boolean;
  selo_destaque?: string;
  promocao?: boolean;
  pode_resgatar?: boolean;
  pontos_resgate?: number;
  grupos_adicionais?: AdditionalGroup[];
  combo_etapas?: ComboStage[];
}

export interface Category {
  id?: string;
  _id?: string;
  nome: string;
  descricao?: string;
  ordem?: number;
}

export interface DeliveryRange {
  km_ate: number;
  valor: number;
}

export interface StoreSettings {
  nome_loja: string;
  tagline?: string;
  logo_url?: string;
  capa_url?: string;
  logoShape?: 'circle' | 'squircle';
  is_open?: boolean;
  manual_is_open?: boolean;
  tempo_entrega?: string;
  whatsapp?: string;
  sobre_texto?: string;
  instagram_url?: string;
  cep_loja?: string;
  rua_loja?: string;
  numero_loja?: string;
  bairro_loja?: string;
  cidade_loja?: string;
  estado_loja?: string;
  theme?: StoreTheme;
  logisticsOptions?: {
    allowPickup?: boolean;
    allowDelivery?: boolean;
    allowDineIn?: boolean;
  };
  faixas_entrega?: DeliveryRange[];
  pedido_minimo?: number;
  frete_gratis_acima_de?: number;
  talheres_ativo?: boolean;
  talheres_valor?: number;
  fidelidade_ativa?: boolean;
  pontos_por_real?: number;
  valor_ponto_reais?: number;
  banner_ativo?: boolean;
  banner_texto?: string;
}

export interface SelectedOptionDisplay {
  opcao: string;
  quantidade: number;
}

export interface SecureOptionSelection {
  groupId: string;
  itemId: string;
  quantity: number;
}

export interface ComboCartSelection {
  stageId: string;
  selectedProductId: string;
  options: SecureOptionSelection[];
}

export interface ComboDisplayOption {
  itemId?: string;
  itemName?: string;
  quantity?: number;
  unitPriceCents?: number;
}

export interface ComboDisplayStage {
  stageId?: string;
  name?: string;
  selectedProductName?: string;
  options?: ComboDisplayOption[];
}

export interface CartItem {
  produtoId: string;
  nome: string;
  imagem?: string;
  preco_unitario: number;
  quantidade: number;
  subtotal: number;
  opcoes_escolhidas?: SelectedOptionDisplay[];
  selections?: Record<string, number>;
  groupSelections?: Record<string, Record<string, number>>;
  secureOptions?: SecureOptionSelection[];
  comboSelections?: ComboCartSelection[];
  comboDisplay?: ComboDisplayStage[];
  itemType?: 'produto' | 'combo';
  configurationKey?: string;
  observacao?: string;
  is_resgate?: boolean;
  pode_resgatar?: boolean;
  pontos_resgate?: number;
  permite_talheres?: boolean;
}

export interface HomeBlock {
  _id: string;
  titulo?: string;
  subtitulo?: string;
  descricao?: string;
  imagem_desktop?: string;
  imagem_mobile?: string;
  link_destino?: string;
  texto_botao?: string;
  tipo_bloco: string;
  posicao_exibicao: string;
  acao_clique?: string;
  modal_titulo?: string;
  modal_texto_completo?: string;
  modal_imagem?: string;
  modal_cta_texto?: string;
  modal_cta_link?: string;
  ativo?: boolean;
  ordem?: number;
  abrir_nova_aba?: boolean;
  cor_fundo?: string;
  cor_texto?: string;
}
