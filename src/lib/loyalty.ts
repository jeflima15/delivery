export type LoyaltySnapshot = {
  enabled: boolean;
  pointsPerReal: number;
  expectedPoints: number;
};

export function calculateLoyaltyPoints(totalCents: number, enabled: boolean, pointsPerReal: number): number {
  if (enabled !== true) return 0;
  const safeTotalCents = Number.isFinite(totalCents) ? Math.max(0, Math.round(totalCents)) : 0;
  const safeRate = Number.isFinite(pointsPerReal) ? Math.max(0, pointsPerReal) : 0;
  return Math.max(0, Math.floor((safeTotalCents / 100) * safeRate));
}

export function createLoyaltySnapshot(totalCents: number, enabled: boolean, pointsPerReal: number): LoyaltySnapshot {
  const isEnabled = enabled === true;
  const safeRate = isEnabled && Number.isFinite(pointsPerReal) ? Math.max(0, pointsPerReal) : 0;
  return {
    enabled: isEnabled,
    pointsPerReal: safeRate,
    expectedPoints: calculateLoyaltyPoints(totalCents, isEnabled, safeRate),
  };
}
