import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import AdminAccount from '../server/models/AdminAccount.js';

const email = process.argv[2]?.toLowerCase().trim();
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Uso: npx tsx scripts/reset-tenant-password.ts <email> <nova_senha>');
  process.exitCode = 1;
  process.exit();
}

if (newPassword.length < 8) {
  console.error('A senha deve ter no mínimo 8 caracteres.');
  process.exitCode = 1;
  process.exit();
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI não está definido no .env');
  }

  console.log(`Conectando ao banco de dados...`);
  // Obter o nome do banco do .env ou string de conexao, ou default
  await mongoose.connect(process.env.MONGO_URI);

  const account = await AdminAccount.findOne({ email });
  if (!account) {
    throw new Error(`Nenhuma conta encontrada com o e-mail: ${email}`);
  }

  console.log(`Conta encontrada: ${account.name}. Gerando hash da nova senha...`);
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await AdminAccount.updateOne({ _id: account._id }, { $set: { passwordHash } });

  console.log('Senha atualizada com sucesso!');
}

main()
  .finally(() => mongoose.disconnect())
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
