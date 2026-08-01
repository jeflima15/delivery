import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type mongoose from 'mongoose';
import { getEnv } from '../config/env.js';
import { HttpError } from '../middleware/errors.js';

const storageTargets = {
  product: { bucket: 'produtos', folder: 'products' },
  store: { bucket: 'loja', folder: 'identity' },
} as const;

export type StorageTarget = keyof typeof storageTargets;

function client() {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, 'Upload temporariamente indisponivel.', 'STORAGE_UNAVAILABLE');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createTenantUpload(tenantId: mongoose.Types.ObjectId, target: StorageTarget, size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 5 * 1024 * 1024) {
    throw new HttpError(413, 'Imagem deve ter no maximo 5 MB.', 'FILE_TOO_LARGE');
  }
  const destination = storageTargets[target];
  const path = `tenants/${tenantId}/${destination.folder}/${crypto.randomUUID()}.webp`;
  const supabase = client();
  const { data, error } = await supabase.storage.from(destination.bucket).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new HttpError(502, 'Nao foi possivel preparar o upload.', 'STORAGE_SIGN_FAILED');
  const { data: publicData } = supabase.storage.from(destination.bucket).getPublicUrl(path);
  return { bucket: destination.bucket, path, token: data.token, publicUrl: publicData.publicUrl };
}
