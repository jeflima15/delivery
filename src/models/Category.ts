import mongoose from 'mongoose';

const CategorySchema = new mongoose.Schema({
  nome: { type: String, required: true },
  ordem: { type: Number, default: 999 }
}, { timestamps: true });

export default mongoose.models.Category || mongoose.model('Category', CategorySchema);
