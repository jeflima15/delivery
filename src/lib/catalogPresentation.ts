import type { Product } from '../types/storefront';
import { comboIsPurchasable, isComboProduct, productIsPurchasable } from './combo';

export function normalizeCatalogSearch(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
}
export function catalogItemUnavailable(product: Product, products: Product[] = []) {
  return product.catalogAvailability?.purchasable === false || (isComboProduct(product) ? !comboIsPurchasable(product, products) : !productIsPurchasable(product));
}
export function adminAvailabilityLabel(product: { ativo?: boolean; esgotado?: boolean; controlar_estoque?: boolean; estoque?: number }) {
  if (product.ativo === false) return 'Oculto';
  if (product.esgotado || (product.controlar_estoque && Number(product.estoque || 0) <= 0)) return 'Esgotado';
  return 'Disponível';
}
