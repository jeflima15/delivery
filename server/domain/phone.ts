export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw new Error('INVALID_PHONE');
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
}
