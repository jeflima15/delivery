// Financial calendar for Pode Vir. Store operational calendars remain tenant-specific.
export const MASTER_REPORT_TIMEZONE = 'America/Sao_Paulo';

export function masterCalendarDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MASTER_REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function masterDateBoundary(value: string, end = false): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid calendar date');
  }
  const base = date.getTime() + (end ? 86_400_000 : 0);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: MASTER_REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let result = base;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = formatter.formatToParts(new Date(result));
    const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    const local = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
    result = base - (local - result);
  }
  return new Date(result - (end ? 1 : 0));
}

export function masterReportRange(query: Record<string, unknown>, now = new Date()) {
  const toText = query.to ? String(query.to) : masterCalendarDate(now);
  const to = toText.length === 10 ? masterDateBoundary(toText, true) : new Date(toText);
  const defaultFrom = new Date(`${masterCalendarDate(to)}T12:00:00.000Z`);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const fromText = query.from ? String(query.from) : defaultFrom.toISOString().slice(0, 10);
  const from = fromText.length === 10 ? masterDateBoundary(fromText) : new Date(fromText);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) throw new Error('Invalid period');
  return { from, to, timezone: MASTER_REPORT_TIMEZONE };
}
