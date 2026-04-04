import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  adminId: {
     type: String, // No nosso caso é o Token admin_stitch_123 vindo do env ou 'SYSTEM'
     default: 'ADMIN'
  },
  acao: {
    type: String,
    required: true
  },
  detalhes: {
    type: String,
    required: true
  },
  tabela: {
    type: String,
    required: true // Ex: 'PRODUTO', 'PEDIDO', 'CONFIG'
  },
  documentoId: {
    type: String
  }
}, { timestamps: true });

export default mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
