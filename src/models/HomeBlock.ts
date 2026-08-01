// @ts-nocheck
import mongoose from 'mongoose';

const HomeBlockSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  titulo: { type: String, default: '' },
  subtitulo: { type: String, default: '' },
  descricao: { type: String, default: '' },
  
  imagem_desktop: { type: String, default: '' },
  imagem_mobile: { type: String, default: '' },
  
  link_destino: { type: String, default: '' },
  texto_botao: { type: String, default: '' },
  
  tipo_bloco: { 
    type: String, 
    enum: ['banner_principal', 'card_promocional', 'card_institucional', 'fidelidade', 'texto'], 
    default: 'card_promocional' 
  },
  
  posicao_exibicao: {
    type: String,
    enum: ['below_hero', 'before_products', 'middle_home', 'after_products'],
    default: 'below_hero'
  },
  
  acao_clique: {
    type: String,
    enum: ['nenhuma', 'link', 'modal'],
    default: 'nenhuma'
  },
  
  // Conf Modal 
  modal_titulo: { type: String, default: '' },
  modal_texto_completo: { type: String, default: '' },
  modal_imagem: { type: String, default: '' },
  modal_cta_texto: { type: String, default: '' },
  modal_cta_link: { type: String, default: '' },

  ativo: { type: Boolean, default: true },
  ordem: { type: Number, default: 999 },
  
  abrir_nova_aba: { type: Boolean, default: false },
  
  cor_fundo: { type: String, default: '#ffffff' },
  cor_texto: { type: String, default: '#000000' }
}, { timestamps: true });

HomeBlockSchema.index({ tenantId: 1, posicao_exibicao: 1, ordem: 1, ativo: 1 });

export default ((mongoose.models.HomeBlock) || mongoose.model('HomeBlock', HomeBlockSchema)) as mongoose.Model<Record<string, any>>;
