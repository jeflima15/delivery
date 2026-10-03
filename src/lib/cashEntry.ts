export function cashEntryCents(value: string) {
  const text = value.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text) && !/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text);
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

