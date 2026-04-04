// @ts-nocheck
import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema({
  nome: { 
    type: String, 
    required: true 
  },
  descricao: { 
    type: String 
  },
  preco: { 
    type: Number, 
    required: true 
  },
  preco_antigo: { 
    type: Number,
    default: 0
  },
  imagem: {
    type: String
  },
  personalizavel: { 
    type: Boolean, 
    default: false 
  },
  quantidade_total_opcoes: { 
    type: Number,
    default: 0
  },
  opcoes_disponiveis: [{ 
    type: String 
  }],
  // Novos campos para controle de estoque e categoria
  controlar_estoque: {
    type: Boolean,
    default: false
  },
  estoque: {
    type: Number,
    default: 0
  },
  esgotado: {
    type: Boolean,
    default: false
  },
  categoriaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },
  ativo: {
    type: Boolean,
    default: true
  },

  // Vitrine Estratégica
  ordem: { type: Number, default: 999 },
  destaque: { type: Boolean, default: false },
  selo_destaque: { type: String, default: '' }, // Ex: "Mais Pedido", "Edição Limitada"
  promocao: { type: Boolean, default: false },

  // Resgate por Pontos (Fidelidade)
  pode_resgatar: { type: Boolean, default: false },
  pontos_resgate: { type: Number, default: 0 },
  
  // Complementos e Adicionais Pagos/Upsell
  grupos_adicionais: [{
    nome: { type: String, required: true }, // ex "Escolha suas frutas" ou "Deseja embalagem pra presente?"
    obrigatorio: { type: Boolean, default: false },
    minimo: { type: Number, default: 0 },
    maximo: { type: Number, default: 1 },
    itens: [{
      nome: { type: String, required: true },
      preco: { type: Number, default: 0 } // Preço adicional a ser cobrado
    }]
  }]
}, { timestamps: true });

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);
