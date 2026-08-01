import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
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
  },
  actorRole: String,
  targetType: String,
  before: mongoose.Schema.Types.Mixed,
  after: mongoose.Schema.Types.Mixed,
  reason: String,
  requestId: String,
  ip: String,
  userAgent: String
}, { timestamps: true });

AuditLogSchema.index({ tenantId: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

export default ((mongoose.models.AuditLog) || mongoose.model('AuditLog', AuditLogSchema)) as mongoose.Model<Record<string, any>>;
