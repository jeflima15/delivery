import { describe, expect, it } from 'vitest';
import { extractHouseNumber } from '../../src/lib/addressSearch';

describe('extractHouseNumber', () => {
  it('preserva o numero informado depois do logradouro', () => {
    expect(extractHouseNumber('Rua da Torre, 237, Resende')).toBe('237');
    expect(extractHouseNumber('Avenida Central, 120-A, Centro')).toBe('120-A');
  });

  it('nao confunde nome de rua ou CEP com numero do imovel', () => {
    expect(extractHouseNumber('Rua 15 de Novembro, Centro')).toBe('');
    expect(extractHouseNumber('Rua das Flores, 27500000')).toBe('');
  });
});
