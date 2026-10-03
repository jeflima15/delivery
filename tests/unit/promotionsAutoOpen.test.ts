import { describe, expect, it } from 'vitest';
import { isPromotionProduct } from '../../src/components/PromotionsModal';
import type { Product } from '../../src/types/storefront';

describe('Produtos exibidos nas promocoes da vitrine', () => {
  const produtoNormal: Product = {
    _id: 'p1',
    nome: 'Bolo Caseiro',
    preco: 30,
    ativo: true,
  };

  const produtoPromocional: Product = {
    _id: 'p2',
    nome: 'Bolo de Chocolate em Promocao',
    preco: 25,
    preco_antigo: 35,
    ativo: true,
  };

  const produtoInativoComDesconto: Product = {
    _id: 'p3',
    nome: 'Torta Inativa',
    preco: 20,
    preco_antigo: 40,
    ativo: false,
  };

  const produtoPrecoIgual: Product = {
    _id: 'p4',
    nome: 'Docinho',
    preco: 10,
    preco_antigo: 10,
    ativo: true,
  };

  const produtoPrecoAntigoMenor: Product = {
    _id: 'p5',
    nome: 'Cupcake',
    preco: 15,
    preco_antigo: 10,
    ativo: true,
  };

  const produtoFlagPromocaoSemDesconto: Product = {
    _id: 'p6',
    nome: 'Brigadeiro Gourmet',
    preco: 5,
    promocao: true,
    ativo: true,
  };

  describe('isPromotionProduct (regra base de promocao)', () => {
    it('identifica produto promocional quando preco_antigo > preco e ativo !== false', () => {
      expect(isPromotionProduct(produtoPromocional)).toBe(true);
    });

    it('ignora produto com preco_antigo > preco quando ativo === false', () => {
      expect(isPromotionProduct(produtoInativoComDesconto)).toBe(false);
    });

    it('ignora produto quando preco_antigo <= preco', () => {
      expect(isPromotionProduct(produtoNormal)).toBe(false);
      expect(isPromotionProduct(produtoPrecoIgual)).toBe(false);
      expect(isPromotionProduct(produtoPrecoAntigoMenor)).toBe(false);
    });

    it('ignora campo promocao caso preco_antigo > preco nao seja atendido', () => {
      expect(isPromotionProduct(produtoFlagPromocaoSemDesconto)).toBe(false);
    });
  });

});
