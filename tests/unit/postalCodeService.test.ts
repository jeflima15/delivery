import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupPostalCode } from '../../server/services/postalCodeService.js';

describe('postalCodeService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('identifies a city-wide postal code without inventing street data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cep: '12345-000', localidade: 'Cidade Pequena', uf: 'SP' }) }));
    await expect(lookupPostalCode('12345000')).resolves.toMatchObject({ scope: 'city', street: '', district: '', city: 'Cidade Pequena', state: 'SP' });
  });

  it('identifies a street-specific postal code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cep: '27512-112', logradouro: 'Rua da Torre', bairro: 'Novo Surubi', localidade: 'Resende', uf: 'RJ' }) }));
    await expect(lookupPostalCode('27512112')).resolves.toMatchObject({ scope: 'street', street: 'Rua da Torre', district: 'Novo Surubi' });
  });
});
