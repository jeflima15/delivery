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
  quantidade: { 
    type: Number, 
    required: true,
    default: 1
  },
  opcoes_escolhidas: [{
    opcao: { type: String, required: true },
    quantidade: { type: Number, required: true }
  }],
  preco_unitario: {
    type: Number,
    required: true
  },
  subtotal: {
    type: Number,
    required: true
  }
});

const OrderSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
  metodo_pagamento: {
    type: String,
    required: true
  },
  frete: {
    type: Number,
    default: 0
  },
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
  desconto_cupom: { type: Number, default: 0 },
  cupom_codigo: { type: String, default: '' },
  pontos_utilizados: { type: Number, default: 0 },
  valor_desconto_pontos: { type: Number, default: 0 },

  historico_status: [{
    status: { type: String, required: true },
    data: { type: Date, default: Date.now }
  }],
  status: { 
    type: String, 
    enum: ['Pendente', 'Preparando', 'Saiu para Entrega', 'Entregue', 'Cancelado'],
    default: 'Pendente' 
  }
}, { timestamps: true });

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);
