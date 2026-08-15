// @ts-nocheck
import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  tipo: {
    type: String,
    enum: ['produto', 'combo'],
    default: 'produto'
  },
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
  preco_centavos: { type: Number, min: 0 },
  preco_antigo: { 
    type: Number,
    default: 0
  },
  preco_antigo_centavos: { type: Number, min: 0, default: 0 },
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
  estoque_minimo: {
    type: Number,
    min: 0,
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
  ordem_categoria: { type: Number, default: 999 },
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
      preco: { type: Number, default: 0 }, // Compatibilidade durante a migração
      preco_centavos: { type: Number, min: 0, default: 0 },
      ativo: { type: Boolean, default: true }
    }]
  }],

  // Combo por etapas. Cada opcao referencia um produto normal do mesmo tenant.
  combo_etapas: [{
    nome: { type: String, required: true },
    ordem: { type: Number, min: 0, default: 0 },
    valor_etapa_centavos: { type: Number, min: 0, required: true },
    cobrar_complementos: { type: Boolean, default: true },
    opcoes: [{
      produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      acrescimo_centavos: { type: Number, min: 0, default: 0 },
      ordem: { type: Number, min: 0, default: 0 }
    }]
  }]
}, { timestamps: true });

ProductSchema.index({ tenantId: 1, categoriaId: 1, ordem_categoria: 1, ativo: 1 });
ProductSchema.index({ tenantId: 1, destaque: 1, ordem_categoria: 1 });
ProductSchema.index({ tenantId: 1, controlar_estoque: 1, estoque: 1 });
ProductSchema.index({ tenantId: 1, 'combo_etapas.opcoes.produtoId': 1 });

export default ((mongoose.models.Product) || mongoose.model('Product', ProductSchema)) as mongoose.Model<Record<string, any>>;
