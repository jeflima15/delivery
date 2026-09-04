import { describe, expect, it } from 'vitest';
import { getPreparationEstimateLabel } from '../../src/lib/deliveryEstimates';

describe('getPreparationEstimateLabel', () => {
  it('does not override legacy estimates', () => {
    expect(getPreparationEstimateLabel()).toBe('');
    expect(getPreparationEstimateLabel(null)).toBe('');
    expect(getPreparationEstimateLabel({ prazo_entrega_modo: 'total', tempo_preparo_min: 15 })).toBe('');
    expect(getPreparationEstimateLabel({ tempo_preparo_min: 15 })).toBe('');
  });

  it.each([
    [15, 25, '15-25 min'],
    [15, 15, '15 min'],
    [0, 0, '0 min'],
    [0, 10, '0-10 min'],
  ])('formats preparation %s to %s', (min, max, expected) => {
    expect(getPreparationEstimateLabel({
      prazo_entrega_modo: 'preparo_deslocamento', tempo_preparo_min: min, tempo_preparo_max: max,
    })).toBe(expected);
  });

  it.each([[undefined, 20], [15, undefined], [-1, 20], [20, 10], [NaN, 20], [10, Infinity], [1.5, 20], [10, 1441]])(
    'does not display invalid preparation %s to %s', (min, max) => {
      expect(getPreparationEstimateLabel({
        prazo_entrega_modo: 'preparo_deslocamento', tempo_preparo_min: min, tempo_preparo_max: max,
      })).toBe('');
    },
  );
});
