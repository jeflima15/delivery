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
  
  ativo: { type: Boolean, default: true },
  ordem: { type: Number, default: 999 },
  
  abrir_nova_aba: { type: Boolean, default: false },
  
  cor_fundo: { type: String, default: '#ffffff' },
  cor_texto: { type: String, default: '#000000' }
}, { timestamps: true });

export default mongoose.models.HomeBlock || mongoose.model('HomeBlock', HomeBlockSchema);
