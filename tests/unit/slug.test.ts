import { describe, expect, it } from 'vitest';
import { assertAvailableSlug, normalizeSlug } from '../../server/domain/slug';

describe('slug de tenant', () => {
  it('normaliza acentos, espacos e caracteres perigosos', () => {
    expect(normalizeSlug(' Pizzaria do João / Centro ')).toBe('pizzaria-do-joao-centro');
    expect(normalizeSlug('Açaí_Resende')).toBe('acai_resende');
  });

  it('bloqueia rotas reservadas', () => {
    expect(() => assertAvailableSlug('master')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('invite')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('convite')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('checkout')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('cart')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('pedidos')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('central')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('loja')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('minha-loja')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('dashboard')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('settings')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('config')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('../')).toThrow(/3 e 63/);
  });
});
