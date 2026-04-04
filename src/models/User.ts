import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  telefone: { type: String, required: true, unique: true },
  senha: { type: String, required: true },
  enderecos: [{
    titulo: String,
    logradouro: String,
    numero: String,
    complemento: String,
    bairro: String,
    cidade: String,
    estado: String,
    cep: String
  }],
  pontos: { type: Number, default: 0 }

}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);
