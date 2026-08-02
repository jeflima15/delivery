import mongoose from 'mongoose';

const StoreSettingsSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  is_open: { type: Boolean, default: true },
  nome_loja: { type: String, default: 'Stitch Delivery' },
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
    allowDelivery: { type: Boolean, default: true }
  },
  tempo_entrega: { type: String, default: '45-60 min' },
  whatsapp: { type: String, default: '' },

  // Endereço e Identidade
  sobre_texto: { type: String, default: '' },
  instagram_url: { type: String, default: '' },
  cep_loja: { type: String, default: '' },
  rua_loja: { type: String, default: '' },
  numero_loja: { type: String, default: '' },
  bairro_loja: { type: String, default: '' },
  cidade_loja: { type: String, default: '' },
  estado_loja: { type: String, default: '' },

  // Faixas Dinâmicas de Frete (Ex: Até 3km = R$ 5,00)
  faixas_entrega: [{
    km_ate: Number,
    valor: Number
  }],

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
  pagamento_pix: { type: Boolean, default: true },
  pagamento_cartao: { type: Boolean, default: true },
  pagamento_dinheiro: { type: Boolean, default: true },
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
