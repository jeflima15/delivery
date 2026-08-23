import type { ComboCartSelection, ComboStage, Product, SecureOptionSelection } from '../types/storefront';

interface CartConfigurationInput {
  produtoId?: string;
  productId?: string;
  observacao?: string;
  is_resgate?: boolean;
  itemType?: string;
  comboSelections?: ComboCartSelection[];
  secureOptions?: SecureOptionSelection[];
}

export function isComboProduct(product: Product | null | undefined): product is Product & { tipo: 'combo'; combo_etapas: ComboStage[] } {
  return product?.tipo === 'combo';
}

export function productIsPurchasable(product: Product | undefined) {
  return Boolean(
    product
    && product.tipo !== 'combo'
    && product.ativo !== false
    && !product.esgotado
    && (!product.controlar_estoque || Number(product.estoque || 0) > 0),
  );
}

export function comboIsPurchasable(combo: Product, products: Product[]) {
  if (!isComboProduct(combo) || combo.ativo === false || combo.esgotado) return false;
  const byId = new Map(products.map((product) => [String(product._id || product.id), product]));
  const stages = combo.combo_etapas || [];
  return stages.length > 0 && stages.every((stage) =>
    (stage.opcoes || []).some((option) => productIsPurchasable(byId.get(String(option.produtoId))))
  );
}

function normalizedOptions(options: SecureOptionSelection[] = []) {
  return options
    .map((option) => ({ groupId: String(option.groupId), itemId: String(option.itemId), quantity: Number(option.quantity || 0) }))
    .filter((option) => option.groupId && option.itemId && option.quantity > 0)
    .sort((a, b) => `${a.groupId}:${a.itemId}`.localeCompare(`${b.groupId}:${b.itemId}`));
}

export function cartConfigurationKey(item: CartConfigurationInput) {
  const base = {
    productId: String(item.produtoId || item.productId || ''),
    observation: String(item.observacao || '').trim(),
    redeem: Boolean(item.is_resgate),
  };
  if (item.itemType === 'combo' || Array.isArray(item.comboSelections)) {
    const stages = (item.comboSelections || [])
      .map((stage) => ({
        stageId: String(stage.stageId),
        selectedProductId: String(stage.selectedProductId),
        options: normalizedOptions(stage.options),
      }))
      .sort((a, b) => a.stageId.localeCompare(b.stageId));
    return JSON.stringify({ ...base, type: 'combo', stages });
  }
  return JSON.stringify({ ...base, type: 'produto', options: normalizedOptions(item.secureOptions) });
}
