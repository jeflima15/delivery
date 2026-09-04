import mongoose from 'mongoose';

const StoreSettingsSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  is_open: { type: Boolean, default: true },
  nome_loja: { type: String, default: 'Minha Loja' },
  tagline: { type: String, default: 'Sabor & Qualidade' },
  logo_url: { type: String, default: '' },
  capa_url: { type: String, default: '' },
  logoShape: { type: String, enum: ['circle', 'squircle'], default: 'squircle' },
  theme: {
    primaryColor: { type: String, default: '#059669' },
    primaryTextColor: { type: String, default: '#ffffff' },
    primaryHoverColor: { type: String, default: '#047857' },
    primarySoftColor: { type: String, default: '#ecfdf5' },
    primaryBorderColor: { type: String, default: '#a7f3d0' }
  },
  secondaryBanners: [{
    id: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    active: { type: Boolean, default: false },
    link: { type: String, default: '' }
  }],
  logisticsOptions: {
    allowPickup: { type: Boolean, default: true },
    allowDelivery: { type: Boolean, default: true },
    allowDineIn: { type: Boolean, default: false }
  },
  tempo_entrega: { type: String, default: '45-60 min' },
  prazo_entrega_modo: { type: String, enum: ['total', 'preparo_deslocamento'], default: 'total' },
  tempo_preparo_min: { type: Number, min: 0, max: 1_440 },
  tempo_preparo_max: { type: Number, min: 0, max: 1_440 },
  tempo_deslocamento_min: { type: Number, min: 0, max: 1_440 },
  tempo_deslocamento_max: { type: Number, min: 0, max: 1_440 },
  whatsapp: { type: String, default: '' },
  telefone: { type: String, default: '' },

  // Endereço e Identidade
  sobre_texto: { type: String, default: '' },
  instagram_url: { type: String, default: '' },
  cep_loja: { type: String, default: '' },
  rua_loja: { type: String, default: '' },
  numero_loja: { type: String, default: '' },
  bairro_loja: { type: String, default: '' },
  cidade_loja: { type: String, default: '' },
  estado_loja: { type: String, default: '' },

  // Modelos de frete
  tipo_taxa_entrega: { type: String, enum: ['bairro', 'fixa', 'regiao', 'bairro_regiao'], default: 'bairro' },
  localizacao_loja: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    confirmed: { type: Boolean, default: false },
    addressKey: { type: String, default: '' },
  },
  delivery_regions_publication: { type: String, default: '' },
  taxa_entrega_fixa: { type: Number, default: 0 },
  taxas_bairros: [{
    nome: { type: String, required: true },
    cidade: { type: String, default: '' },
    estado: { type: String, default: '' },
    valor: { type: Number, required: true, min: 0 },
    tempo_estimado: { type: String, default: '' },
    bloqueado: { type: Boolean, default: false },
    observacao: { type: String, maxlength: 500, default: '' },
    deliveryTimeMin: { type: Number, min: 0, max: 1_440 },
    deliveryTimeMax: { type: Number, min: 0, max: 1_440 },
    ativo: { type: Boolean, default: true }
  }],
  taxa_bairro_padrao: { type: Number, default: null },
  bloquear_bairros_nao_atendidos: { type: Boolean, default: true },

  // Gestão Automática de Horários
  abertura_automatica: { type: Boolean, default: false },
  mensagem_fechado: { type: String, default: 'Estamos fechados no momento.' },
  horarios_funcionamento: {
    domingo: { aberto: { type: Boolean, default: false }, inicio: { type: String, default: '18:00' }, fim: { type: String, default: '23:30' } },
    segunda: { aberto: { type: Boolean, default: false }, inicio: { type: String, default: '18:00' }, fim: { type: String, default: '23:30' } },
    terca: { aberto: { type: Boolean, default: false }, inicio: { type: String, default: '18:00' }, fim: { type: String, default: '23:30' } },
    quarta: { aberto: { type: Boolean, default: false }, inicio: { type: String, default: '18:00' }, fim: { type: String, default: '23:30' } },
    quinta: { aberto: { type: Boolean, default: false }, inicio: { type: String, default: '18:00' }, fim: { type: String, default: '23:30' } },
    sexta: { aberto: { type: Boolean, default: false }, inicio: { type: String, default: '18:00' }, fim: { type: String, default: '23:30' } },
    sabado: { aberto: { type: Boolean, default: false }, inicio: { type: String, default: '18:00' }, fim: { type: String, default: '23:30' } }
  },

  // Regras Comerciais e Pagamentos
  pedido_minimo: { type: Number, default: 0 },
  frete_gratis_acima_de: { type: Number, default: 0 }, // 0 = desabilitado
  talheres_ativo: { type: Boolean, default: false },
  talheres_valor: { type: Number, min: 0, default: 0 },
  pagamento_pix: { type: Boolean, default: true },
  pagamento_cartao: { type: Boolean, default: true },
  pagamento_cartao_credito: { type: Boolean },
  pagamento_cartao_debito: { type: Boolean },
  pagamento_dinheiro: { type: Boolean, default: true },
  pagamento_vale_alimentacao: { type: Boolean, default: false },
  bandeiras_vale_alimentacao: { type: [String], default: [] },
  pagamento_vale_refeicao: { type: Boolean, default: false },
  bandeiras_vale_refeicao: { type: [String], default: [] },
  chave_pix: { type: String, default: '' },
  instrucoes_pix: { type: String, default: '' },

  // Marketing & Vitrine
  banner_ativo: { type: Boolean, default: false },
  banner_texto: { type: String, default: 'Hoje frete grátis acima de R$ 60' },
  cupom_global_ativo: { type: Boolean, default: false },

  // Programa de Fidelidade
  fidelidade_ativa: { type: Boolean, default: true },
  pontos_por_real: { type: Number, default: 1 },
  valor_ponto_reais: { type: Number, default: 0.05 } // 1 ponto vale 5 centavos por padrão
}, { timestamps: true });

StoreSettingsSchema.index(
  { tenantId: 1 },
  { unique: true, partialFilterExpression: { tenantId: { $exists: true } } },
);


export default ((mongoose.models.StoreSettings) || mongoose.model('StoreSettings', StoreSettingsSchema)) as mongoose.Model<Record<string, any>>;
