// @ts-nocheck
import mongoose from 'mongoose';

const HomeBlockSchema = new mongoose.Schema({
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
    default: 'before_products'
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

export default mongoose.models.HomeBlock || mongoose.model('HomeBlock', HomeBlockSchema);
