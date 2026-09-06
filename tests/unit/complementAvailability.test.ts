import { describe, expect, it } from 'vitest';
import { activeComplementItemCount, effectiveComplementMinimum, validateComplementGroupRules } from '../../src/lib/complementRules';
import { reconcileCartProductAvailability } from '../../src/lib/productDetails';
import type { CartItem, Product } from '../../src/types/storefront';

describe('regras de disponibilidade de complementos', () => {
  it('trata grupo obrigatorio legado com minimo zero como minimo um', () => {
    const group = { obrigatorio: true, minimo: 0, maximo: 1, itens: [{ ativo: true }] };
    expect(effectiveComplementMinimum(group)).toBe(1);
    expect(activeComplementItemCount(group)).toBe(1);
    expect(validateComplementGroupRules(group)).toBeNull();
  });

  it('impede que um grupo fique com menos opcoes ativas que o minimo', () => {
    const group = { obrigatorio: true, minimo: 2, maximo: 3, itens: [{ ativo: true }, { ativo: false }] };
    expect(validateComplementGroupRules(group)).toContain('2 opcoes ativas');
  });
});

describe('reconciliacao do carrinho', () => {
  const product: Product = {
    _id: 'product-1',
    nome: 'Marmita',
    preco: 20,
    grupos_adicionais: [{
      _id: 'group-1',
      nome: 'Extras',
      obrigatorio: false,
      minimo: 0,
      maximo: 2,
      itens: [
        { _id: 'active-item', nome: 'Ovo', preco: 2, ativo: true },
        { _id: 'paused-item', nome: 'Bacon', preco: 4, ativo: false },
      ],
    }],
  };

  const cartItem: CartItem = {
    produtoId: 'product-1',
    nome: 'Marmita',
    preco_unitario: 26,
    quantidade: 2,
    subtotal: 52,
    secureOptions: [
      { groupId: 'group-1', itemId: 'active-item', quantity: 1 },
      { groupId: 'group-1', itemId: 'paused-item', quantity: 1 },
    ],
    itemType: 'produto',
  };

  it('remove apenas a opcao pausada e recalcula o valor quando o grupo continua valido', () => {
    const result = reconcileCartProductAvailability([cartItem], { product, relatedProducts: [] });
    expect(result.removedOptions).toBe(1);
    expect(result.removedItems).toBe(0);
    expect(result.cart[0].secureOptions).toEqual([{ groupId: 'group-1', itemId: 'active-item', quantity: 1 }]);
    expect(result.cart[0].preco_unitario).toBe(22);
    expect(result.cart[0].subtotal).toBe(44);
  });

  it('remove a linha quando a opcao pausada deixa um grupo obrigatorio incompleto', () => {
    const requiredProduct: Product = {
      ...product,
      grupos_adicionais: [{ ...product.grupos_adicionais![0], obrigatorio: true, minimo: 2 }],
    };
    const result = reconcileCartProductAvailability([cartItem], { product: requiredProduct, relatedProducts: [] });
    expect(result.removedItems).toBe(1);
    expect(result.cart).toEqual([]);
  });
});
