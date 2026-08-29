import mongoose from 'mongoose';

const OrderItemSchema = new mongoose.Schema({
  produtoId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  nome: {
    type: String
  },
  categoriaId: { type: mongoose.Schema.Types.ObjectId },
  categoria_nome: { type: String, default: '' },
  quantidade: { 
    type: Number, 
    required: true,
    default: 1
  },
  opcoes_escolhidas: [{
    groupId: { type: mongoose.Schema.Types.ObjectId },
    itemId: { type: mongoose.Schema.Types.ObjectId },
    opcao: { type: String, required: true },
    quantidade: { type: Number, required: true },
    preco_centavos: { type: Number, min: 0, default: 0 }
  }],
  tipo_item: { type: String, enum: ['produto', 'combo'], default: 'produto' },
  combo_snapshot: {
    etapas: [{
      stageId: { type: mongoose.Schema.Types.ObjectId, required: true },
      nome: { type: String, required: true },
      valor_etapa_centavos: { type: Number, min: 0, default: 0 },
      cobrar_complementos: { type: Boolean, default: true },
      produtoId: { type: mongoose.Schema.Types.ObjectId, required: true },
      produto_nome: { type: String, required: true },
      acrescimo_centavos: { type: Number, min: 0, default: 0 },
      adicionais: [{
        groupId: { type: mongoose.Schema.Types.ObjectId },
        itemId: { type: mongoose.Schema.Types.ObjectId },
        grupo_nome: { type: String, default: '' },
        item_nome: { type: String, required: true },
        quantidade: { type: Number, min: 1, required: true },
        preco_unitario_centavos: { type: Number, min: 0, default: 0 }
      }]
    }]
  },
  preco_unitario: {
    type: Number,
    required: true
  },
  preco_unitario_centavos: { type: Number, min: 0 },
  subtotal: {
    type: Number,
    required: true
  },
  subtotal_centavos: { type: Number, min: 0 },
  resgatado: { type: Boolean, default: false },
  pontos_resgate: { type: Number, min: 0, default: 0 },
  valor_resgate_centavos: { type: Number, min: 0, default: 0 }
});

const OrderSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  orderNumber: { type: Number, min: 1 },
  trackingTokenHash: { type: String, select: false },
  trackingToken: { type: String, select: false },
  trackingTokenPrefix: { type: String, index: true },
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cliente: { 
    nome: { type: String, required: true },
    telefone: { type: String, required: true },
    endereco: { type: String, required: true }
  },
  itens: [OrderItemSchema],
  total: { 
    type: Number, 
    required: true 
  },
  total_centavos: { type: Number, min: 0 },
  metodo_pagamento: {
    type: String,
    required: true
  },
  frete: {
    type: Number,
    default: 0
  },
  frete_centavos: { type: Number, min: 0, default: 0 },
  tipo_entrega: {
    type: String,
    required: true
  },
  observacoes: {
    type: String,
    default: ''
  },
  troco_para: {
    type: Number,
    default: 0
  },
  talheres: { type: Boolean, default: false },
  desconto_cupom: { type: Number, default: 0 },
  cupom_codigo: { type: String, default: '' },
  pontos_utilizados: { type: Number, default: 0 },
  pontos_creditados: { type: Number, default: 0 },
  loyaltyCreditApplied: { type: Boolean, default: false },
  loyaltyRedeemReverted: { type: Boolean, default: false },
  valor_desconto_pontos: { type: Number, default: 0 },

  historico_status: [{
    status: { type: String, required: true },
    data: { type: Date, default: Date.now }
  }],
  status: { 
    type: String, 
    enum: ['Pendente', 'Preparando', 'Saiu para Entrega', 'Entregue', 'Cancelado'],
    default: 'Pendente' 
  },
  avaliacao: {
    nota: { type: Number, min: 1, max: 5 },
    comentario: { type: String, maxlength: 1_000, default: '' },
    criadaEm: { type: Date },
    atualizadaEm: { type: Date },
  },
}, { timestamps: true });

OrderSchema.index({ tenantId: 1, createdAt: -1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ tenantId: 1, usuarioId: 1, createdAt: -1 });
OrderSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
OrderSchema.index(
  { tenantId: 1, orderNumber: 1 },
  { unique: true, partialFilterExpression: { tenantId: { $exists: true }, orderNumber: { $type: 'number' } } },
);

export default ((mongoose.models.Order) || mongoose.model('Order', OrderSchema)) as mongoose.Model<Record<string, any>>;
