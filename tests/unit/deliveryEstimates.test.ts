import { describe, expect, it } from 'vitest';
import { calculateDeliveryEstimate, getPreparationEstimateLabel, parseDeliveryEstimate, validateEstimateSettings, readEstimateSettings, readDeliveryEstimate } from '../../src/lib/deliveryEstimates';
import { matchCombinedDistrict } from '../../server/services/shippingService';
import { publicSettingsDto } from '../../server/routes/public';
import { settingsSchema } from '../../server/routes/tenantOperations';

const separated = { prazo_entrega_modo: 'preparo_deslocamento', tempo_preparo_min: 10, tempo_preparo_max: 20, tempo_deslocamento_min: 15, tempo_deslocamento_max: 30 };

describe('delivery estimate contract', () => {
  it('projects persisted fields with runtime type checks, retaining neighborhood limits', () => {
    const projected = readEstimateSettings({ ...separated, tempo_entrega: 45, tempo_preparo_min: '10', taxas_bairros: [null, false, 'invalid', { deliveryTimeMin: 1000, deliveryTimeMax: 1430, tempo_estimado: false, observacao: 'internal' }] });
    expect(projected.tempo_entrega).toBeUndefined();
    expect(projected.tempo_preparo_min).toBeUndefined();
    expect(projected.taxas_bairros).toEqual([{ deliveryTimeMin: 1000, deliveryTimeMax: 1430, tempo_estimado: undefined }]);
    expect(validateEstimateSettings(projected)).not.toBeNull();
    expect(validateEstimateSettings({ ...projected, tempo_preparo_min: 10 })).not.toBeNull();
    expect(readEstimateSettings(separated)).toMatchObject(separated);
    expect(readDeliveryEstimate({ deliveryTimeMin: '10', deliveryTimeMax: null })).toEqual({ deliveryTimeMin: undefined, deliveryTimeMax: undefined, tempo_estimado: undefined });
  });
  it.each([
    ['45-60 min', 45, 60], ['1h30', 90, 90], ['1 hora 30 minutos', 90, 90],
    ['1-2 horas', 60, 120], ['1h a 2h', 60, 120], ['1,5 h', 90, 90], ['0 min', 0, 0],
  ])('parses %s', (value, min, max) => {
    expect(parseDeliveryEstimate(value)).toEqual({ deliveryTimeMin: min, deliveryTimeMax: max });
  });
  it.each(['', 'abc 30', '-5', '60-30 min', '1-2-3', '25h', 'NaN', 'Infinity', '1.5 min'])('rejects %s', (value) => {
    expect(parseDeliveryEstimate(value)).toEqual({});
  });
  it('does not add preparation to legacy totals', () => {
    expect(calculateDeliveryEstimate({ ...separated, prazo_entrega_modo: undefined, tempo_entrega: '45-60 min' })).toEqual({ deliveryTimeMin: 45, deliveryTimeMax: 60 });
    expect(calculateDeliveryEstimate({ tempo_entrega: '45-60 min' }, 'pickup')).toEqual({});
  });
  it('adds transit or fallback once and returns only preparation for pickup/dine-in', () => {
    expect(calculateDeliveryEstimate(separated)).toEqual({ deliveryTimeMin: 25, deliveryTimeMax: 50 });
    expect(calculateDeliveryEstimate(separated, 'delivery', { deliveryTimeMin: 5, deliveryTimeMax: 10 })).toEqual({ deliveryTimeMin: 15, deliveryTimeMax: 30 });
    for (const type of ['pickup', 'dine_in', 'local'] as const) expect(calculateDeliveryEstimate(separated, type)).toEqual({ deliveryTimeMin: 10, deliveryTimeMax: 20 });
    expect(getPreparationEstimateLabel(separated)).toBe('10-20 min');
    expect(getPreparationEstimateLabel(null)).toBe('');
  });
  it('validates merged partial updates and total limits', () => {
    expect(validateEstimateSettings(separated)).toBeNull();
    expect(validateEstimateSettings({ ...separated, tempo_preparo_min: 21 })).not.toBeNull();
    expect(validateEstimateSettings({ tempo_preparo_min: 10 })).not.toBeNull();
    expect(validateEstimateSettings({ ...separated, tempo_deslocamento_max: 1430 })).not.toBeNull();
    expect(validateEstimateSettings(separated, [{ deliveryTimeMax: 1430 }])).not.toBeNull();
    expect(settingsSchema.safeParse({ taxas_bairros: [{ nome: 'Centro', valor: 0, deliveryTimeMin: 10 }] }).success).toBe(false);
  });
  it('recognizes legacy municipality without borrowing the store city or matching substrings', () => {
    const rate = { nome: 'Centro (Itatiaia)' };
    expect(matchCombinedDistrict({ district: 'Centro', city: 'Itatiaia', state: 'RJ' }, rate, 'Resende', 'RJ')).toBe(true);
    expect(matchCombinedDistrict({ district: 'Centro', city: 'Resende', state: 'RJ' }, rate, 'Resende', 'RJ')).toBe(false);
    expect(matchCombinedDistrict({ district: 'Centro', city: 'Itatiaia', state: 'SP' }, rate, 'Resende', 'RJ')).toBe(false);
    expect(matchCombinedDistrict({ district: 'Centro', city: 'Nova Itatiaia', state: 'RJ' }, rate, 'Resende', 'RJ')).toBe(false);
  });
  it.each(['Centro (Sul)', 'Centro(Sul)', 'Centro - Sul'])('preserves structured district name %s', (nome) => {
    const rate = { nome, cidade: 'Itatiaia', estado: 'RJ', bloqueado: true };
    expect(matchCombinedDistrict({ district: nome, city: 'Itatiaia', state: 'RJ' }, rate, 'Resende', 'RJ')).toBe(true);
    expect(matchCombinedDistrict({ district: 'Centro', city: 'Itatiaia', state: 'RJ' }, rate, 'Resende', 'RJ')).toBe(false);
  });
  it('does not expose internal notes in public settings', () => {
    const dto = publicSettingsDto({ notes: 'secret', taxas_bairros: [{ nome: 'Centro', observacao: 'secret', bloqueado: true }] });
    expect(JSON.stringify(dto)).not.toContain('secret');
    expect(dto?.taxas_bairros[0].bloqueado).toBe(true);
  });
});
