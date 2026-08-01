import { describe, expect, it } from 'vitest';
import { assertAvailableSlug, normalizeSlug } from '../../server/domain/slug';

describe('slug de tenant', () => {
  it('normaliza acentos, espacos e caracteres perigosos', () => {
    expect(normalizeSlug(' Pizzaria do João / Centro ')).toBe('pizzaria-do-joao-centro');
    expect(normalizeSlug('Açaí_Resende')).toBe('acai_resende');
  });

  it('bloqueia rotas reservadas', () => {
    expect(() => assertAvailableSlug('master')).toThrow(/reservado/i);
    expect(() => assertAvailableSlug('../')).toThrow(/3 e 63/);
  });
});
