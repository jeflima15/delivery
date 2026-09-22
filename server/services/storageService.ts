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
export const MAX_CATALOG_IMAGE_SIZE_BYTES = Number(process.env.CATALOG_IMPORT_IMAGE_MAX_BYTES || 3 * 1024 * 1024);

const CATALOG_IMPORT_SOURCE_MIME = {
  'application/pdf': { extension: 'pdf', maxSize: MAX_CATALOG_PDF_SIZE_BYTES },
  'image/jpeg': { extension: 'jpg', maxSize: MAX_CATALOG_IMAGE_SIZE_BYTES },
  'image/png': { extension: 'png', maxSize: MAX_CATALOG_IMAGE_SIZE_BYTES },
  'image/webp': { extension: 'webp', maxSize: MAX_CATALOG_IMAGE_SIZE_BYTES },
} as const;

const CATALOG_IMPORT_SOURCE_PATH_REGEX = /^tenants\/([^/]+)\/catalog-imports\/([a-f\d]{24})\/source\/([0-9a-f-]{36})\.(pdf|jpg|png|webp)$/i;
const CATALOG_IMPORT_IMAGE_PATH_REGEX = /^tenants\/([^/]+)\/catalog-imports\/([a-f\d]{24})\/images\/([0-9a-f-]{36})\.webp$/i;

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

async function ensureCatalogImportSourceBucket(supabase: ReturnType<typeof client>) {
  const { data: existing } = await supabase.storage.getBucket(CATALOG_IMPORT_TEMP_BUCKET);
  const settings = {
    public: false,
    fileSizeLimit: MAX_CATALOG_PDF_SIZE_BYTES,
    allowedMimeTypes: Object.keys(CATALOG_IMPORT_SOURCE_MIME),
  };
  if (!existing) {
    const { error } = await supabase.storage.createBucket(CATALOG_IMPORT_TEMP_BUCKET, settings);
    if (error && !/already exists/i.test(error.message)) throw new HttpError(502, 'Não foi possível preparar o armazenamento da importação.', 'STORAGE_BUCKET_FAILED');
  } else {
    const { error } = await supabase.storage.updateBucket(CATALOG_IMPORT_TEMP_BUCKET, settings);
    if (error) throw new HttpError(502, 'Não foi possível proteger o armazenamento da importação.', 'STORAGE_BUCKET_FAILED');
  }
}

export function validateCatalogImportSourcePath(
  tenantId: mongoose.Types.ObjectId | string,
  importId: mongoose.Types.ObjectId | string,
  bucket: string,
  path: string,
) {
  const match = typeof path === 'string' ? path.match(CATALOG_IMPORT_SOURCE_PATH_REGEX) : null;
  if (bucket !== CATALOG_IMPORT_TEMP_BUCKET || !match || match[1] !== String(tenantId) || match[2] !== String(importId)) {
    throw new HttpError(403, 'Acesso negado ao arquivo informado.', 'FORBIDDEN_STORAGE_PATH');
  }
  return { extension: match[4].toLowerCase() };
}

export async function createCatalogImportSourceUpload(input: {
  tenantId: mongoose.Types.ObjectId;
  importId: mongoose.Types.ObjectId | string;
  mimeType: keyof typeof CATALOG_IMPORT_SOURCE_MIME;
  size: number;
}) {
  const config = CATALOG_IMPORT_SOURCE_MIME[input.mimeType];
  if (!config) throw new HttpError(400, 'Formato não suportado. Envie PDF, JPG, PNG ou WebP.', 'UNSUPPORTED_FILE_TYPE');
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > config.maxSize) {
    throw new HttpError(413, `O arquivo excede o limite de ${Math.round(config.maxSize / 1024 / 1024)} MiB.`, 'FILE_TOO_LARGE');
  }
  const supabase = client();
  await ensureCatalogImportSourceBucket(supabase);
  const path = `tenants/${input.tenantId}/catalog-imports/${input.importId}/source/${crypto.randomUUID()}.${config.extension}`;
  const { data, error } = await supabase.storage.from(CATALOG_IMPORT_TEMP_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new HttpError(502, 'Não foi possível preparar o upload do cardápio.', 'STORAGE_SIGN_FAILED');
  return { bucket: CATALOG_IMPORT_TEMP_BUCKET, path, token: data.token };
}

export async function createCatalogImportImageUpload(input: {
  tenantId: mongoose.Types.ObjectId;
  importId: mongoose.Types.ObjectId | string;
  size: number;
}) {
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > 5 * 1024 * 1024) {
    throw new HttpError(413, 'A imagem deve ter no máximo 5 MiB.', 'FILE_TOO_LARGE');
  }
  const bucket = storageTargets.product.bucket;
  const path = `tenants/${input.tenantId}/catalog-imports/${input.importId}/images/${crypto.randomUUID()}.webp`;
  const supabase = client();
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new HttpError(502, 'Não foi possível preparar a imagem do rascunho.', 'STORAGE_SIGN_FAILED');
  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
  return { bucket, path, token: data.token, publicUrl: publicData.publicUrl };
}

export function validateCatalogImportImageUrl(
  tenantId: mongoose.Types.ObjectId | string,
  importId: mongoose.Types.ObjectId | string,
  publicUrl: string,
) {
  let parsed: URL;
  try { parsed = new URL(publicUrl); } catch { throw new HttpError(400, 'URL de imagem inválida.', 'INVALID_IMAGE_URL'); }
  const configured = getEnv().SUPABASE_URL;
  if (!configured || parsed.origin !== new URL(configured).origin) throw new HttpError(400, 'A imagem não pertence ao storage configurado.', 'INVALID_IMAGE_URL');
  const marker = `/storage/v1/object/public/${storageTargets.product.bucket}/`;
  const markerIndex = parsed.pathname.indexOf(marker);
  if (markerIndex < 0) throw new HttpError(400, 'A imagem não pertence ao rascunho.', 'INVALID_IMAGE_URL');
  const path = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  const match = path.match(CATALOG_IMPORT_IMAGE_PATH_REGEX);
  if (!match || match[1] !== String(tenantId) || match[2] !== String(importId)) throw new HttpError(403, 'Acesso negado à imagem informada.', 'FORBIDDEN_STORAGE_PATH');
  return { bucket: storageTargets.product.bucket, path };
}

export async function verifyCatalogImportImage(input: {
  tenantId: mongoose.Types.ObjectId | string;
  importId: mongoose.Types.ObjectId | string;
  publicUrl: string;
}) {
  const target = validateCatalogImportImageUrl(input.tenantId, input.importId, input.publicUrl);
  const buffer = await downloadPrivateStorageFile(target.bucket, target.path);
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new HttpError(400, 'A imagem enviada possui tamanho inválido.', 'INVALID_FILE_SIZE');
  if (!matchesMagic(buffer, 'image/webp')) throw new HttpError(400, 'O arquivo da foto não é uma imagem WebP válida.', 'INVALID_FILE_SIGNATURE');
  return { ...target, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

export async function cleanupCatalogImportImages(input: {
  tenantId: mongoose.Types.ObjectId | string;
  importId: mongoose.Types.ObjectId | string;
  keepUrls?: string[];
}) {
  const prefix = `tenants/${input.tenantId}/catalog-imports/${input.importId}/images`;
  const keepPaths = new Set((input.keepUrls || []).map((url) => {
    try { return validateCatalogImportImageUrl(input.tenantId, input.importId, url).path; } catch { return ''; }
  }).filter(Boolean));
  const supabase = client();
  const { data, error } = await supabase.storage.from(storageTargets.product.bucket).list(prefix, { limit: 1000 });
  if (error) return false;
  const remove = (data || []).map((entry) => `${prefix}/${entry.name}`).filter((path) => !keepPaths.has(path));
  if (remove.length) {
    const { error: removeError } = await supabase.storage.from(storageTargets.product.bucket).remove(remove);
    if (removeError) return false;
  }
  return true;
}

function matchesMagic(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mimeType === 'image/jpeg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/webp') return buffer.length > 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

export async function verifyCatalogImportSource(input: {
  tenantId: mongoose.Types.ObjectId;
  importId: mongoose.Types.ObjectId | string;
  bucket: string;
  path: string;
  mimeType: keyof typeof CATALOG_IMPORT_SOURCE_MIME;
  declaredSize: number;
}) {
  validateCatalogImportSourcePath(input.tenantId, input.importId, input.bucket, input.path);
  const config = CATALOG_IMPORT_SOURCE_MIME[input.mimeType];
  if (!config) throw new HttpError(400, 'Formato de arquivo inválido.', 'UNSUPPORTED_FILE_TYPE');
  const buffer = await downloadPrivateStorageFile(input.bucket, input.path);
  if (!buffer.length || buffer.length > config.maxSize || buffer.length !== input.declaredSize) {
    throw new HttpError(400, 'O tamanho do arquivo enviado não corresponde ao upload solicitado.', 'INVALID_FILE_SIZE');
  }
  if (!matchesMagic(buffer, input.mimeType)) throw new HttpError(400, 'O conteúdo do arquivo não corresponde ao formato informado.', 'INVALID_FILE_SIGNATURE');
  return { buffer, verifiedSize: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

export async function createCatalogImportSourceReadUrl(input: {
  tenantId: mongoose.Types.ObjectId | string;
  importId: mongoose.Types.ObjectId | string;
  bucket: string;
  path: string;
  expiresInSeconds?: number;
}) {
  validateCatalogImportSourcePath(input.tenantId, input.importId, input.bucket, input.path);
  const { data, error } = await client().storage.from(input.bucket).createSignedUrl(input.path, input.expiresInSeconds || 5 * 60);
  if (error || !data?.signedUrl) throw new HttpError(404, 'Arquivo da importação não encontrado.', 'NOT_FOUND');
  return data.signedUrl;
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
