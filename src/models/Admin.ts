import mongoose from 'mongoose';

const AdminSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true },
  role: { type: String, default: 'admin' }, // 'master' ou 'admin'
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

export default ((mongoose.models.Admin) || mongoose.model('Admin', AdminSchema)) as mongoose.Model<Record<string, any>>;
