import mongoose from 'mongoose';
import { getEnv } from '../config/env.js';

declare global {
  var __mongooseConnection: Promise<typeof mongoose> | undefined;
}

export function connectDatabase(): Promise<typeof mongoose> {
  if (!globalThis.__mongooseConnection) {
    globalThis.__mongooseConnection = mongoose.connect(getEnv().MONGO_URI, {
      serverSelectionTimeoutMS: 8_000,
      connectTimeoutMS: 8_000,
      maxPoolSize: 10,
    }).catch((error) => {
      globalThis.__mongooseConnection = undefined;
      throw error;
    });
  }
  return globalThis.__mongooseConnection;
}

export function databaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}
