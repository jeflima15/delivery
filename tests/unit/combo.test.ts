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

  it('gera chave estavel para combo fixo baseado no produto e observacao', () => {
    const fixedItem1 = {
      produtoId: 'combo-fixo-1',
      itemType: 'combo',
      comboMode: 'fixed',
      observacao: 'Sem cebola',
    };
    const fixedItem2 = {
      produtoId: 'combo-fixo-1',
      itemType: 'combo',
      comboMode: 'fixed',
      observacao: 'Sem cebola',
    };
    const fixedItemDiffObs = {
      produtoId: 'combo-fixo-1',
      itemType: 'combo',
      comboMode: 'fixed',
      observacao: 'Com cebola extra',
    };

    expect(cartConfigurationKey(fixedItem1)).toBe(cartConfigurationKey(fixedItem2));
    expect(cartConfigurationKey(fixedItem1)).not.toBe(cartConfigurationKey(fixedItemDiffObs));
  });
});

describe('comboStartingPriceCents', () => {
  it('calcula o preco inicial de combo fixo a partir de combo_preco_base_centavos', async () => {
    const { comboStartingPriceCents } = await import('../../src/lib/combo');
    const combo: any = {
      tipo: 'combo',
      combo_mode: 'fixed',
      combo_preco_base_centavos: 3990,
      preco: 0,
      combo_itens_fixos: [
        { produtoId: 'burger-1', quantidade: 2 },
        { produtoId: 'batata-1', quantidade: 1 },
      ],
    };
    expect(comboStartingPriceCents(combo)).toBe(3990);
  });

  it('calcula o preco inicial de combo com escolhas usando preco-base + acréscimos mínimos', async () => {
    const { comboStartingPriceCents } = await import('../../src/lib/combo');
    const combo: any = {
      tipo: 'combo',
      combo_mode: 'stages',
      combo_preco_base_centavos: 2500,
      combo_etapas: [
        {
          _id: 'etapa-1',
          nome: 'Lanche',
          valor_etapa_centavos: 0,
          opcoes: [
            { produtoId: 'lanche-1', acrescimo_centavos: 0 },
            { produtoId: 'lanche-2', acrescimo_centavos: 500 },
          ],
        },
        {
          _id: 'etapa-2',
          nome: 'Bebida',
          valor_etapa_centavos: 200,
          opcoes: [
            { produtoId: 'bebida-1', acrescimo_centavos: 100 },
            { produtoId: 'bebida-2', acrescimo_centavos: 300 },
          ],
        },
      ],
    };
    // Preço base (2500) + etapa 1 min (0 + 0) + etapa 2 min (200 + 100) = 2800 centavos
    expect(comboStartingPriceCents(combo)).toBe(2800);
  });

  it('calcula combo legado (sem combo_preco_base_centavos) somando valor das etapas', async () => {
    const { comboStartingPriceCents } = await import('../../src/lib/combo');
    const legacyCombo: any = {
      tipo: 'combo',
      combo_etapas: [
        {
          _id: 'etapa-1',
          nome: 'Lanche',
          valor_etapa_centavos: 2000,
          opcoes: [{ produtoId: 'l1', acrescimo_centavos: 0 }],
        },
        {
          _id: 'etapa-2',
          nome: 'Bebida',
          valor_etapa_centavos: 800,
          opcoes: [{ produtoId: 'b1', acrescimo_centavos: 0 }],
        },
      ],
    };
    expect(comboStartingPriceCents(legacyCombo)).toBe(2800);
  });
});

describe('fixedComboIsPurchasable', () => {
  it('retorna true quando todos os componentes fixos estao disponiveis', async () => {
    const { fixedComboIsPurchasable } = await import('../../src/lib/combo');
    const combo: any = {
      tipo: 'combo',
      combo_mode: 'fixed',
      ativo: true,
      esgotado: false,
      combo_itens_fixos: [
        { produtoId: 'p1', quantidade: 2 },
        { produtoId: 'p2', quantidade: 1 },
      ],
    };
    const catalog: any[] = [
      { _id: 'p1', ativo: true, esgotado: false, controlar_estoque: true, estoque: 10 },
      { _id: 'p2', ativo: true, esgotado: false, controlar_estoque: false },
    ];
    expect(fixedComboIsPurchasable(combo, catalog, 1)).toBe(true);
  });

  it('retorna false quando um componente fixo esta esgotado ou com estoque insuficiente', async () => {
    const { fixedComboIsPurchasable } = await import('../../src/lib/combo');
    const combo: any = {
      tipo: 'combo',
      combo_mode: 'fixed',
      ativo: true,
      esgotado: false,
      combo_itens_fixos: [
        { produtoId: 'p1', quantidade: 2 },
        { produtoId: 'p2', quantidade: 1 },
      ],
    };
    const catalogLowStock: any[] = [
      { _id: 'p1', ativo: true, esgotado: false, controlar_estoque: true, estoque: 3 }, // precisa de 2 * 2 = 4 para comboQuantity = 2
      { _id: 'p2', ativo: true, esgotado: false },
    ];
    expect(fixedComboIsPurchasable(combo, catalogLowStock, 2)).toBe(false);

    const catalogSoldOut: any[] = [
      { _id: 'p1', ativo: true, esgotado: true },
      { _id: 'p2', ativo: true, esgotado: false },
    ];
    expect(fixedComboIsPurchasable(combo, catalogSoldOut, 1)).toBe(false);
  });
});
