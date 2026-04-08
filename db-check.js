import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import User from './src/models/User.js';
import Order from './src/models/Order.js';

async function check() {
  if (!process.env.MONGO_URI) {
    console.log("NO MONGO URI FOUND");
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");

  // Get all users
  const users = await User.find({});
  console.log(`TOTAL USERS: ${users.length}`);

  const phoneCount = {};
  users.forEach(u => {
    let p = u.telefone;
    let n = p.replace(/\D/g, '');
    if (!phoneCount[n]) phoneCount[n] = [];
    phoneCount[n].push({ id: u._id, raw: p, nome: u.nome, addrs: u.enderecos.length });
  });

  const dups = Object.entries(phoneCount).filter(([k, v]) => v.length > 1);
  if (dups.length > 0) {
    console.log("--- DUPLICATE PHONES FOUND ---");
    console.log(JSON.stringify(dups, null, 2));
  } else {
    console.log("--- NO DUPLICATES FOUND ---");
  }

  // Check how many orders exist
  const orders = await Order.find({});
  console.log(`TOTAL ORDERS: ${orders.length}`);

  // Print orders userIds
  const oUsers = orders.map(o => o.usuarioId.toString());
  const uni = [...new Set(oUsers)];
  console.log(`UNIQUE USERS WITH ORDERS: ${uni.length}`);

  console.log("Script Finished");
  process.exit();
}

check().catch(console.error);
