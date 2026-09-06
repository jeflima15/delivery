import mongoose, { type Types } from 'mongoose';

export type HomeBlockType = 'banner_principal' | 'card_promocional' | 'card_institucional' | 'fidelidade' | 'texto';
export type HomeBlockPosition = 'below_hero' | 'before_products' | 'middle_home' | 'after_products';
export type HomeBlockAction = 'nenhuma' | 'link' | 'modal';

export interface HomeBlockRecord {
  _id: Types.ObjectId;
  tenantId?: Types.ObjectId | string;
  titulo?: string;
  subtitulo?: string;
  descricao?: string;
  imagem_desktop?: string;
  imagem_mobile?: string;
  link_destino?: string;
  texto_botao?: string;
  tipo_bloco?: HomeBlockType;
  posicao_exibicao?: HomeBlockPosition;
  acao_clique?: HomeBlockAction;
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
  createdAt?: Date;
  updatedAt?: Date;
}

const HomeBlockSchema = new mongoose.Schema<HomeBlockRecord>({
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

const HomeBlock = (mongoose.models.HomeBlock as mongoose.Model<HomeBlockRecord> | undefined)
  || mongoose.model<HomeBlockRecord>('HomeBlock', HomeBlockSchema);

export default HomeBlock;
