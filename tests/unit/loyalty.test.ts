import { describe, expect, it } from 'vitest';
import { calculateLoyaltyPoints, createLoyaltySnapshot } from '../../src/lib/loyalty';

describe('loyalty rules', () => {
  it('never generates points when loyalty is disabled', () => {
    expect(calculateLoyaltyPoints(10_000, false, 5)).toBe(0);
    expect(createLoyaltySnapshot(10_000, false, 5)).toEqual({
      enabled: false,
      pointsPerReal: 0,
      expectedPoints: 0,
    });
  });

  it('snapshots the points promised at checkout', () => {
    expect(createLoyaltySnapshot(1_099, true, 2)).toEqual({
      enabled: true,
      pointsPerReal: 2,
      expectedPoints: 21,
    });
  });

  it('normalizes invalid totals and rates safely', () => {
    expect(calculateLoyaltyPoints(Number.NaN, true, 1)).toBe(0);
    expect(calculateLoyaltyPoints(1_000, true, -1)).toBe(0);
  });
});
