import { describe, expect, it } from 'vitest';
import { isPromotionProduct, shouldAutoOpenPromotions } from '../../src/components/PromotionsModal';
import type { Product } from '../../src/types/storefront';

describe('Auto-abertura do modal de Promocoes na vitrine', () => {
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

  describe('shouldAutoOpenPromotions', () => {
    it('1. loja com produto onde preco_antigo > preco -> Promocoes abre automaticamente', () => {
      const shouldOpen = shouldAutoOpenPromotions({
        products: [produtoNormal, produtoPromocional],
        currentHash: '',
        hasAlreadyChecked: false,
      });
      expect(shouldOpen).toBe(true);
    });

    it('2. URL sem hash permite auto-abertura', () => {
      expect(
        shouldAutoOpenPromotions({
          products: [produtoPromocional],
          currentHash: '',
          hasAlreadyChecked: false,
        })
      ).toBe(true);

      expect(
        shouldAutoOpenPromotions({
          products: [produtoPromocional],
          currentHash: '#',
          hasAlreadyChecked: false,
        })
      ).toBe(true);
    });

    it('3. loja sem promocao -> nao abre', () => {
      const shouldOpen = shouldAutoOpenPromotions({
        products: [produtoNormal, produtoPrecoIgual, produtoFlagPromocaoSemDesconto],
        currentHash: '',
        hasAlreadyChecked: false,
      });
      expect(shouldOpen).toBe(false);
    });

    it('4. produto inativo com desconto -> nao causa abertura', () => {
      const shouldOpen = shouldAutoOpenPromotions({
        products: [produtoNormal, produtoInativoComDesconto],
        currentHash: '',
        hasAlreadyChecked: false,
      });
      expect(shouldOpen).toBe(false);
    });

    it('5. fechar o modal -> nao abre novamente sozinho na mesma sessao/montagem (hasAlreadyChecked)', () => {
      const firstCheck = shouldAutoOpenPromotions({
        products: [produtoPromocional],
        currentHash: '',
        hasAlreadyChecked: false,
      });
      expect(firstCheck).toBe(true);

      // Apos fechar o modal, hasAlreadyChecked ja e true e o modal nao reabre
      const secondCheckAfterClose = shouldAutoOpenPromotions({
        products: [produtoPromocional],
        currentHash: '',
        hasAlreadyChecked: true,
      });
      expect(secondCheckAfterClose).toBe(false);
    });

    it('6. acesso direto com #promocoes continua funcionando pelo hash listener nativo', () => {
      // Com #promocoes na URL, shouldAutoOpenPromotions nao interfere para manter o fluxo original
      const shouldOpen = shouldAutoOpenPromotions({
        products: [produtoPromocional],
        currentHash: '#promocoes',
        hasAlreadyChecked: false,
      });
      expect(shouldOpen).toBe(false);
    });

    it('se a URL tiver outro hash, nao sobrescreve e nao abre', () => {
      const shouldOpenOtherHash = shouldAutoOpenPromotions({
        products: [produtoPromocional],
        currentHash: '#categoria-sobremesas',
        hasAlreadyChecked: false,
      });
      expect(shouldOpenOtherHash).toBe(false);
    });
  });
});
