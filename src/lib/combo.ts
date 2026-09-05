import type { ComboCartSelection, ComboMode, ComboStage, Product, SecureOptionSelection } from '../types/storefront';

interface CartConfigurationInput {
  produtoId?: string;
  productId?: string;
  observacao?: string;
  is_resgate?: boolean;
  itemType?: string;
  comboMode?: ComboMode;
  comboSelections?: ComboCartSelection[];
  secureOptions?: SecureOptionSelection[];
}

export function isComboProduct(product: Product | null | undefined): product is Product & { tipo: 'combo' } {
  return product?.tipo === 'combo';
}

export function getComboMode(product: Product | null | undefined): 'fixed' | 'stages' | 'legacy' {
  if (!product || product.tipo !== 'combo') return 'legacy';
  if (product.combo_mode === 'fixed') return 'fixed';
  if (product.combo_mode === 'stages') return 'stages';
  if (product.combo_itens_fixos && product.combo_itens_fixos.length > 0 && (!product.combo_etapas || product.combo_etapas.length === 0)) {
    return 'fixed';
  }
  return 'legacy';
}

export function productIsPurchasable(product: Product | undefined, requiredQuantity = 1) {
  return Boolean(
    product
    && product.tipo !== 'combo'
    && product.ativo !== false
    && !product.esgotado
    && (!product.controlar_estoque || Number(product.estoque || 0) >= requiredQuantity),
  );
}

export function fixedComboIsPurchasable(combo: Product, products: Product[], comboQuantity = 1) {
  if (!isComboProduct(combo) || combo.ativo === false || combo.esgotado) return false;
  const items = combo.combo_itens_fixos || [];
  if (items.length === 0) return false;
  const byId = new Map(products.map((product) => [String(product._id || product.id), product]));
  return items.every((item) => {
    const comp = byId.get(String(item.produtoId));
    const demand = Number(item.quantidade || 1) * comboQuantity;
    return productIsPurchasable(comp, demand);
  });
}

export function comboIsPurchasable(combo: Product, products: Product[]) {
  if (!isComboProduct(combo) || combo.ativo === false || combo.esgotado) return false;
  const mode = getComboMode(combo);
  if (mode === 'fixed') {
    return fixedComboIsPurchasable(combo, products);
  }
  const byId = new Map(products.map((product) => [String(product._id || product.id), product]));
  const stages = combo.combo_etapas || [];
  return stages.length > 0 && stages.every((stage) =>
    (stage.opcoes || []).some((option) => productIsPurchasable(byId.get(String(option.produtoId))))
  );
}

export function comboStartingPriceCents(combo: Product): number {
  const mode = getComboMode(combo);
  if (mode === 'fixed') {
    if (typeof combo.combo_preco_base_centavos === 'number') {
      return combo.combo_preco_base_centavos;
    }
    if (typeof combo.preco_centavos === 'number' && combo.preco_centavos > 0) {
      return combo.preco_centavos;
    }
    return Math.round(Number(combo.preco || 0) * 100);
  }

  const basePrice = typeof combo.combo_preco_base_centavos === 'number' ? combo.combo_preco_base_centavos : 0;
  const stages = combo.combo_etapas || [];
  const stagesMin = stages.reduce((total, stage) => {
    const minExtra = stage.opcoes?.length ? Math.min(...stage.opcoes.map((opt) => Number(opt.acrescimo_centavos || 0))) : 0;
    return total + Number(stage.valor_etapa_centavos || 0) + (isFinite(minExtra) ? minExtra : 0);
  }, 0);

  if (basePrice > 0 || stages.length > 0) {
    return basePrice + stagesMin;
  }
  return typeof combo.preco_centavos === 'number' && combo.preco_centavos > 0
    ? combo.preco_centavos
    : Math.round(Number(combo.preco || 0) * 100);
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
    if (item.comboSelections && item.comboSelections.length > 0) {
      const stages = item.comboSelections
        .map((stage) => ({
          stageId: String(stage.stageId),
          selectedProductId: String(stage.selectedProductId),
          options: normalizedOptions(stage.options),
        }))
        .sort((a, b) => a.stageId.localeCompare(b.stageId));
      return JSON.stringify({ ...base, type: 'combo_stages', stages });
    }
    return JSON.stringify({ ...base, type: 'combo_fixed' });
  }
  return JSON.stringify({ ...base, type: 'produto', options: normalizedOptions(item.secureOptions) });
}

