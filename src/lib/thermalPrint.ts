export type ThermalPaperWidth = '58mm' | '80mm';

const STORAGE_KEY_PREFIX = 'podevir_thermal_paper_width_';

export function getThermalPaperWidth(slug?: string): ThermalPaperWidth {
  if (typeof window === 'undefined') return '80mm';
  try {
    const key = `${STORAGE_KEY_PREFIX}${slug || 'default'}`;
    const saved = localStorage.getItem(key);
    if (saved === '58mm' || saved === '80mm') {
      return saved;
    }
  } catch {
    // ignore localStorage error
  }
  return '80mm';
}

export function setThermalPaperWidth(slug: string | undefined, width: ThermalPaperWidth): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${STORAGE_KEY_PREFIX}${slug || 'default'}`;
    localStorage.setItem(key, width);
  } catch {
    // ignore localStorage error
  }
}

export function formatCurrency(value?: number | null): string {
  const num = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDateTime(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function createDummyTestOrder(storeName?: string) {
  return {
    _id: 'teste-impressao-001',
    orderNumber: 42,
    createdAt: new Date().toISOString(),
    status: 'Preparando',
    tipo_entrega: 'delivery',
    talheres: true,
    metodo_pagamento: 'cash',
    troco_para: 100.0,
    observacoes: 'Sem cebola, por favor enviar molho extra de alho e caprichar no ponto da carne!',
    cliente: {
      nome: 'João da Silva (Pedido Teste)',
      telefone: '(11) 98765-4321',
      endereco: 'Av. Paulista, 1500, Apto 102 - Bela Vista, São Paulo - SP (Ref: Próximo ao MASP)',
    },
    itens: [
      {
        nome: 'Burger Artesanal Especial',
        quantidade: 2,
        preco_unitario: 32.0,
        subtotal: 64.0,
        tipo_item: 'produto',
        opcoes_escolhidas: [
          { opcao: 'Ponto da carne: Ao Ponto para Bem', quantidade: 1 },
          { opcao: 'Bacon Crocante Extra (+R$ 4,00)', quantidade: 1, preco_centavos: 400 },
          { opcao: 'Queijo Cheddar Duplo (+R$ 3,50)', quantidade: 1, preco_centavos: 350 },
        ],
      },
      {
        nome: 'Combo Smash Burger + Batata + Bebida',
        quantidade: 1,
        preco_unitario: 39.9,
        subtotal: 39.9,
        tipo_item: 'combo',
        combo_snapshot: {
          etapas: [
            {
              stageId: 's1',
              nome: '1. Escolha o Hambúrguer',
              produto_nome: 'Smash Duplo com Queijo Prato',
              adicionais: [
                { item_nome: 'Cebola Caramelizada', quantidade: 1, preco_unitario_centavos: 0 },
              ],
            },
            {
              stageId: 's2',
              nome: '2. Acompanhamento',
              produto_nome: 'Batata Frita Rústica Individual',
              adicionais: [
                { item_nome: 'Molho Especial da Casa', quantidade: 1, preco_unitario_centavos: 0 },
              ],
            },
            {
              stageId: 's3',
              nome: '3. Bebida',
              produto_nome: 'Refrigerante Guaraná Lata 350ml',
              adicionais: [],
            },
          ],
        },
      },
      {
        nome: 'Suco Natural de Laranja 500ml',
        quantidade: 1,
        preco_unitario: 10.0,
        subtotal: 10.0,
        tipo_item: 'produto',
        opcoes_escolhidas: [
          { opcao: 'Com gelo e sem açúcar', quantidade: 1 },
        ],
      },
    ],
    desconto_cupom: 10.0,
    cupom_codigo: 'BEMVINDO10',
    valor_desconto_pontos: 0,
    frete: 8.0,
    total: 111.9,
    storeName: storeName || 'PodeVir Delivery',
  };
}
