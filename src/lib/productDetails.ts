import type { Product } from '../types/storefront';

interface ProductDetailsPayload {
  success: boolean;
  product: Product;
  relatedProducts?: Product[];
  error?: { message?: string };
}

export interface ProductDetailsResult {
  product: Product;
  relatedProducts: Product[];
}

const requestCache = new Map<string, Promise<ProductDetailsResult>>();

const productId = (product: Product) => String(product._id || product.id || '');

export function mergeProductDetails(products: Product[], details: ProductDetailsResult) {
  const detailedById = new Map(
    [details.product, ...details.relatedProducts].map((product) => [productId(product), product]),
  );

  const merged = products.map((product) => detailedById.get(productId(product)) || product);
  for (const detail of detailedById.values()) {
    if (!merged.some((product) => productId(product) === productId(detail))) merged.push(detail);
  }
  return merged;
}

export function loadProductDetails(tenantSlug: string, product: Product) {
  const id = productId(product);
  if (!id) return Promise.reject(new Error('Produto invalido'));

  const cacheKey = `${tenantSlug}:${id}`;
  const cached = requestCache.get(cacheKey);
  if (cached) return cached;

  const request = fetch(
    `/api/public/stores/${encodeURIComponent(tenantSlug)}/products/${encodeURIComponent(id)}`,
  )
    .then(async (response) => {
      const payload = await response.json() as ProductDetailsPayload;
      if (!response.ok || !payload.success || !payload.product) {
        throw new Error(payload.error?.message || 'Nao foi possivel carregar o produto');
      }
      return {
        product: { ...product, ...payload.product },
        relatedProducts: Array.isArray(payload.relatedProducts) ? payload.relatedProducts : [],
      };
    })
    .catch((error) => {
      requestCache.delete(cacheKey);
      throw error;
    });

  requestCache.set(cacheKey, request);
  return request;
}
