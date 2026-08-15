import { describe, expect, it } from 'vitest';
import { cartConfigurationKey } from '../../src/lib/combo';

describe('cartConfigurationKey para combos', () => {
  const baseItem = {
    produtoId: 'combo-1',
    itemType: 'combo',
    observacao: 'Sem guardanapo',
    comboSelections: [
      {
        stageId: 'etapa-lanche',
        selectedProductId: 'x-bacon',
        options: [
          { groupId: 'molhos', itemId: 'barbecue', quantity: 1 },
          { groupId: 'extras', itemId: 'bacon', quantity: 2 },
        ],
      },
      {
        stageId: 'etapa-bebida',
        selectedProductId: 'coca',
        options: [],
      },
    ],
  };

  it('e estavel para a mesma configuracao independentemente da ordem recebida', () => {
    const reordered = {
      ...baseItem,
      comboSelections: [
        baseItem.comboSelections[1],
        {
          ...baseItem.comboSelections[0],
          options: [...baseItem.comboSelections[0].options].reverse(),
        },
      ],
    };

    expect(cartConfigurationKey(reordered)).toBe(cartConfigurationKey(baseItem));
  });

  it('nao mescla combos com produto, adicional ou quantidade de adicional diferentes', () => {
    const otherProduct = structuredClone(baseItem);
    otherProduct.comboSelections[0].selectedProductId = 'x-salada';

    const otherAddition = structuredClone(baseItem);
    otherAddition.comboSelections[0].options[0].itemId = 'maionese';

    const otherAdditionQuantity = structuredClone(baseItem);
    otherAdditionQuantity.comboSelections[0].options[1].quantity = 1;

    const key = cartConfigurationKey(baseItem);
    expect(cartConfigurationKey(otherProduct)).not.toBe(key);
    expect(cartConfigurationKey(otherAddition)).not.toBe(key);
    expect(cartConfigurationKey(otherAdditionQuantity)).not.toBe(key);
  });
});
