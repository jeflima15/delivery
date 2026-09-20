import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type mongoose from 'mongoose';
import { getEnv } from '../config/env.js';
import { HttpError } from '../middleware/errors.js';

const storageTargets = {
  product: { bucket: 'produtos', folder: 'products' },
  store: { bucket: 'loja', folder: 'identity' },
  orderReference: { bucket: 'order-references', folder: 'order-references', private: true },
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
  const supabase = client();
  if ('private' in destination && destination.private) {
    const { data: existing } = await supabase.storage.getBucket(destination.bucket);
    if (!existing) {
      const { error: createError } = await supabase.storage.createBucket(destination.bucket, {
        public: false,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ['image/webp'],
      });
      if (createError && !/already exists/i.test(createError.message)) throw new HttpError(502, 'Nao foi possivel preparar o armazenamento privado.', 'STORAGE_BUCKET_FAILED');
    } else if (existing.public) {
      const { error: updateError } = await supabase.storage.updateBucket(destination.bucket, {
        public: false,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ['image/webp'],
      });
      if (updateError) throw new HttpError(502, 'Nao foi possivel proteger o armazenamento das referencias.', 'STORAGE_BUCKET_FAILED');
    }
  }
  const path = `tenants/${tenantId}/${destination.folder}/${crypto.randomUUID()}.webp`;
  const { data, error } = await supabase.storage.from(destination.bucket).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new HttpError(502, 'Nao foi possivel preparar o upload.', 'STORAGE_SIGN_FAILED');
  if ('private' in destination && destination.private) return { bucket: destination.bucket, path, token: data.token, publicUrl: '' };
  const { data: publicData } = supabase.storage.from(destination.bucket).getPublicUrl(path);
  return { bucket: destination.bucket, path, token: data.token, publicUrl: publicData.publicUrl };
}

export async function createTenantReadUrl(tenantId: mongoose.Types.ObjectId, bucket: string, path: string) {
  const prefix = `tenants/${tenantId}/order-references/`;
  if (bucket !== storageTargets.orderReference.bucket || !path.startsWith(prefix)) throw new HttpError(404, 'Imagem nao encontrada.', 'NOT_FOUND');
  const { data, error } = await client().storage.from(bucket).createSignedUrl(path, 5 * 60);
  if (error || !data?.signedUrl) throw new HttpError(404, 'Imagem nao encontrada.', 'NOT_FOUND');
  return data.signedUrl;
}

export async function deleteStoredFile(publicUrl?: string | null): Promise<boolean> {
  if (!publicUrl || typeof publicUrl !== 'string') return false;
  try {
    const marker = '/storage/v1/object/public/';
    const index = publicUrl.indexOf(marker);
    if (index === -1) return false;

    const relative = publicUrl.slice(index + marker.length);
    const slashIndex = relative.indexOf('/');
    if (slashIndex === -1) return false;

    const bucket = relative.slice(0, slashIndex);
    const filePath = relative.slice(slashIndex + 1);

    if (!bucket || !filePath) return false;

    const supabase = client();
    const { error } = await supabase.storage.from(bucket).remove([filePath]);
    if (error) {
      console.warn(`[storage] Falha ao remover arquivo ${filePath} do bucket ${bucket}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[storage] Exceção ao deletar arquivo do storage:', err);
    return false;
  }
}

export const CATALOG_IMPORT_TEMP_BUCKET = 'catalog-import-temp';
export const MAX_CATALOG_PDF_SIZE_BYTES = 20 * 1024 * 1024; // 20 MiB

const PDF_TEMP_PATH_REGEX = /^tenants\/([^/]+)\/catalog-import-temp\/lab\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.pdf$/;

export function validateCatalogPdfTempPath(
  tenantId: mongoose.Types.ObjectId | string,
  bucket: string,
  path: string,
): { tenantId: string; uuid: string } {
  if (bucket !== CATALOG_IMPORT_TEMP_BUCKET) {
    throw new HttpError(400, 'Bucket de importação temporária inválido.', 'INVALID_STORAGE_BUCKET');
  }

  const match = typeof path === 'string' ? path.match(PDF_TEMP_PATH_REGEX) : null;
  if (!match) {
    throw new HttpError(403, 'Acesso negado ao arquivo informado.', 'FORBIDDEN_STORAGE_PATH');
  }

  const [, pathTenantId, uuid] = match;
  const expectedTenantId = tenantId.toString();

  if (pathTenantId !== expectedTenantId) {
    throw new HttpError(403, 'Acesso negado ao arquivo informado.', 'FORBIDDEN_STORAGE_PATH');
  }

  return { tenantId: pathTenantId, uuid };
}

async function ensureCatalogImportTempBucket(supabase: ReturnType<typeof client>) {
  const { data: existing } = await supabase.storage.getBucket(CATALOG_IMPORT_TEMP_BUCKET);
  if (!existing) {
    const { error: createError } = await supabase.storage.createBucket(CATALOG_IMPORT_TEMP_BUCKET, {
      public: false,
      fileSizeLimit: MAX_CATALOG_PDF_SIZE_BYTES,
      allowedMimeTypes: ['application/pdf'],
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw new HttpError(502, 'Não foi possível preparar o armazenamento temporário de catálogo.', 'STORAGE_BUCKET_FAILED');
    }
  } else if (existing.public) {
    const { error: updateError } = await supabase.storage.updateBucket(CATALOG_IMPORT_TEMP_BUCKET, {
      public: false,
      fileSizeLimit: MAX_CATALOG_PDF_SIZE_BYTES,
      allowedMimeTypes: ['application/pdf'],
    });
    if (updateError) {
      throw new HttpError(502, 'Não foi possível proteger o armazenamento temporário de catálogo.', 'STORAGE_BUCKET_FAILED');
    }
  }
}

export async function createCatalogPdfTempUpload(tenantId: mongoose.Types.ObjectId, size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_CATALOG_PDF_SIZE_BYTES) {
    throw new HttpError(413, 'O PDF deve ter no máximo 20 MB.', 'FILE_TOO_LARGE');
  }
  const supabase = client();
  await ensureCatalogImportTempBucket(supabase);
  const path = `tenants/${tenantId.toString()}/catalog-import-temp/lab/${crypto.randomUUID()}.pdf`;
  const { data, error } = await supabase.storage.from(CATALOG_IMPORT_TEMP_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) {
    throw new HttpError(502, 'Não foi possível preparar o upload temporário.', 'STORAGE_SIGN_FAILED');
  }
  return { bucket: CATALOG_IMPORT_TEMP_BUCKET, path, token: data.token };
}

export async function downloadPrivateStorageFile(bucket: string, path: string): Promise<Buffer> {
  const supabase = client();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new HttpError(502, 'Não foi possível baixar o arquivo temporário do storage.', 'STORAGE_DOWNLOAD_FAILED');
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function deletePrivateStorageFile(bucket: string, path: string): Promise<boolean> {
  if (!bucket || !path) return false;
  try {
    const supabase = client();
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) {
      console.warn(`[storage] Falha ao remover arquivo temporário ${path} do bucket ${bucket}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[storage] Exceção ao deletar arquivo temporário do storage:', err);
    return false;
  }
}

export async function createCatalogPdfTempReadUrl(
  tenantId: mongoose.Types.ObjectId | string,
  bucket: string,
  path: string,
  expiresInSeconds = 10 * 60
): Promise<string> {
  validateCatalogPdfTempPath(tenantId, bucket, path);
  const supabase = client();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new HttpError(
      502,
      'Não foi possível preparar o acesso temporário ao PDF no storage.',
      'STORAGE_SIGN_FAILED'
    );
  }
  return data.signedUrl;
}
