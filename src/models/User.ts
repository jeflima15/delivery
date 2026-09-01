import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  nome: { type: String, required: true },
  telefone: { type: String, required: true },
  normalizedPhone: { type: String },
  senha: { type: String, select: false },
  tokenVersion: { type: Number, default: 0 },
  email: { type: String, trim: true, lowercase: true, default: '' },
  nascimento: { type: String, default: '' },
  genero: { type: String, default: '' },
  enderecos: [{
    titulo: String,
    logradouro: String,
    numero: String,
    complemento: String,
    referencia: String,
    bairro: String,
    cidade: String,
    estado: String,
    cep: String,
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    locationConfirmed: { type: Boolean, default: false },
    padrao: { type: Boolean, default: false }
  }],
  pontos: { type: Number, default: 0 }

}, { timestamps: true });

UserSchema.index(
  { tenantId: 1, normalizedPhone: 1 },
  { unique: true, partialFilterExpression: { tenantId: { $exists: true }, normalizedPhone: { $type: 'string' } } },
);

export default ((mongoose.models.User) || mongoose.model('User', UserSchema)) as mongoose.Model<Record<string, any>>;
