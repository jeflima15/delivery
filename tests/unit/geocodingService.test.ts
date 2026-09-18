import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/models/GeocodeCache.js', () => ({
  default: {
    findOne: vi.fn(() => ({ lean: vi.fn().mockResolvedValue(null) })),
    updateOne: vi.fn().mockResolvedValue({}),
  },
}));

import { geocodeAddress, searchDeliveryAddresses } from '../../server/services/geocodingService.js';

describe('geocodingService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exige o numero antes de consultar coordenadas', async () => {
    await expect(geocodeAddress({
      postalCode: '27500000',
      street: 'Rua Principal',
      city: 'Resende',
      state: 'RJ',
    })).rejects.toMatchObject({ code: 'ADDRESS_NUMBER_REQUIRED' });
  });

  it('preserva uma coordenada confirmada sem consultar o provedor', async () => {
    await expect(geocodeAddress({
      street: 'Rua Principal',
      city: 'Resende',
      latitude: -22.47,
      longitude: -44.45,
      locationConfirmed: true,
    })).resolves.toMatchObject({
      latitude: -22.47,
      longitude: -44.45,
      provider: 'customer-confirmed',
      precision: 'confirmed',
    });
  });

  it('rejeita coordenadas nulas do fallback de CEP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        street: 'Rua Principal',
        neighborhood: 'Centro',
        city: 'Resende',
        state: 'RJ',
        location: { coordinates: { latitude: null, longitude: null } },
      }),
    }));

    await expect(geocodeAddress({
      postalCode: '27500000',
      street: 'Rua Principal',
      number: '123',
      district: 'Centro',
      city: 'Resende',
      state: 'RJ',
    })).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
  });

  it('normaliza e remove sugestoes duplicadas de endereco', async () => {
    const row = {
      address: { road: 'Rua da Torre', house_number: '237', suburb: 'Novo Surubi', city: 'Resende', state_code: 'RJ', postcode: '27500-000' },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [row, row] }));
    await expect(searchDeliveryAddresses('Rua da Torre, 237')).resolves.toEqual([{
      label: 'Rua da Torre, 237 — Novo Surubi — Resende/RJ', logradouro: 'Rua da Torre', numero: '237', bairro: 'Novo Surubi', cidade: 'Resende', estado: 'RJ', cep: '27500000',
    }]);
  });
});
