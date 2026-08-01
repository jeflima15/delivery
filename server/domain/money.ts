export function reaisToCents(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Valor monetario invalido.');
  return Math.round(value * 100);
}

export function centsToReais(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Valor em centavos invalido.');
  return value / 100;
}

export function assertCents(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Valor em centavos invalido.');
  return value;
}
