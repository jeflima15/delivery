import { describe, expect, it } from 'vitest';
import { centsToReais, reaisToCents } from '../../server/domain/money';

describe('dinheiro em centavos', () => {
  it('evita erro de ponto flutuante', () => {
    expect(reaisToCents(10.1 + 0.2)).toBe(1030);
    expect(centsToReais(2490)).toBe(24.9);
  });

  it('rejeita valor invalido', () => expect(() => reaisToCents(Number.NaN)).toThrow());
});
