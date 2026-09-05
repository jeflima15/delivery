import { describe, expect, it } from 'vitest';
import {
  buildDeliverySettingsPayload,
  buildOperationSettingsPayload,
  buildSettingsPayload,
  normalizeDeliveryRegionsDraft,
} from './settingsPayload';

describe('settings payloads', () => {
  it('sends only appearance fields from the appearance page', () => {
    const payload = buildSettingsPayload('aparencia', {
      nome_loja: 'Loja', logo_url: 'https://example.com/logo.webp',
      cep_loja: '27500000', deliveryRegions: { storeLocation: null, regions: [] },
    });
    expect(payload).toEqual({ nome_loja: 'Loja', logo_url: 'https://example.com/logo.webp' });
    expect(payload).not.toHaveProperty('deliveryRegions');
    expect(payload).not.toHaveProperty('cep_loja');
  });

  it('keeps logistics and delivery estimates on the delivery page', () => {
    const config = {
      is_open: true,
      tempo_entrega: '30-40 min',
      logisticsOptions: { allowDelivery: true, allowPickup: false },
      prazo_entrega_modo: 'preparo_deslocamento',
      tempo_preparo_min: 15,
      cep_loja: '27512112',
    };

    expect(buildDeliverySettingsPayload(config)).toMatchObject({
      logisticsOptions: config.logisticsOptions,
      prazo_entrega_modo: 'preparo_deslocamento',
      tempo_preparo_min: 15,
      cep_loja: '27512112',
    });
    expect(buildOperationSettingsPayload(config)).toEqual({
      is_open: true,
      tempo_entrega: '30-40 min',
    });
  });

  it('normalizes an incomplete location to null when all regions are inactive', () => {
    expect(normalizeDeliveryRegionsDraft({
      storeLocation: { latitude: undefined, longitude: undefined, confirmed: false } as any,
      regions: [{ active: false } as any],
    }).storeLocation).toBeNull();
  });

  it('rejects an active region without a confirmed location', () => {
    expect(() => normalizeDeliveryRegionsDraft({ storeLocation: null, regions: [{ active: true } as any] }))
      .toThrow('Localize e confirme');
  });
});
