import mongoose from 'mongoose';
import StoreSettings from './src/models/StoreSettings.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const settings = await StoreSettings.findOne();
  console.log('Settings:', JSON.stringify(settings, null, 2));
  process.exit(0);
}
check();
