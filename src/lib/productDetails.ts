import type { CartItem, Product, SecureOptionSelection } from '../types/storefront';
import { effectiveComplementMinimum } from './complementRules';
import { cartConfigurationKey } from './combo';

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
    { cache: 'no-store' },
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
    ;

  requestCache.set(cacheKey, request);
  const clearRequest = () => {
    if (requestCache.get(cacheKey) === request) requestCache.delete(cacheKey);
  };
  request.then(clearRequest, clearRequest);
  return request;
}

export function reconcileCartProductAvailability(cart: CartItem[], details: ProductDetailsResult) {
  const currentProductId = productId(details.product);
  let removedItems = 0;
  let removedOptions = 0;

  const nextCart = cart.flatMap((cartItem) => {
    if (String(cartItem.produtoId) !== currentProductId) return [cartItem];

    // Combos can contain options from several child products. Removing the whole
    // line is safer than silently changing the combo chosen by the customer.
    if (cartItem.itemType === 'combo' || details.product.tipo === 'combo') {
      removedItems += 1;
      return [];
    }

    const groups = details.product.grupos_adicionais || [];
    const groupById = new Map(groups.map((group) => [String(group._id || group.id), group]));
    const validOptions: SecureOptionSelection[] = [];

    for (const selection of cartItem.secureOptions || []) {
      const group = groupById.get(String(selection.groupId));
      const item = group?.itens.find((candidate) => String(candidate._id || candidate.id) === String(selection.itemId));
      if (!group || !item || item.ativo === false) {
        removedOptions += 1;
        continue;
      }
      validOptions.push(selection);
    }

    const rulesAreValid = groups.every((group) => {
      const groupId = String(group._id || group.id);
      const count = validOptions
        .filter((selection) => String(selection.groupId) === groupId)
        .reduce((total, selection) => total + Number(selection.quantity || 0), 0);
      return count >= effectiveComplementMinimum(group) && count <= Number(group.maximo || 1);
    });
    if (!rulesAreValid) {
      removedItems += 1;
      return [];
    }

    const groupSelections: Record<string, Record<string, number>> = {};
    const selectedDisplays = Object.entries(cartItem.selections || {})
      .filter(([, amount]) => Number(amount) > 0)
      .map(([name, amount]) => ({ opcao: name, quantidade: Number(amount) }));
    let additions = 0;
    for (const selection of validOptions) {
      const group = groupById.get(String(selection.groupId));
      const item = group?.itens.find((candidate) => String(candidate._id || candidate.id) === String(selection.itemId));
      if (!group || !item) continue;
      const amount = Number(selection.quantity || 0);
      groupSelections[group.nome] ||= {};
      groupSelections[group.nome][item.nome] = amount;
      additions += Number(item.preco || 0) * amount;
      selectedDisplays.push({
        opcao: `${group.nome}: ${item.nome}${Number(item.preco || 0) > 0 ? ` (+ R$ ${Number(item.preco).toFixed(2).replace('.', ',')})` : ''}`,
        quantidade: amount,
      });
    }

    const precoUnitario = Number(details.product.preco || 0) + additions;
    const updated: CartItem = {
      ...cartItem,
      secureOptions: validOptions,
      groupSelections,
      opcoes_escolhidas: selectedDisplays,
      preco_unitario: precoUnitario,
      subtotal: precoUnitario * Number(cartItem.quantidade || 1),
    };
    updated.configurationKey = cartConfigurationKey(updated);
    return [updated];
  });

  return { cart: nextCart, removedItems, removedOptions };
}
