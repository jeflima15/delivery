const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
export const OPERATIONAL_DAY_CUTOFF_HOUR = 6;

export function getOperationalDate(
  date: Date = new Date(),
  timezone = DEFAULT_TIMEZONE,
  cutoffHour = OPERATIONAL_DAY_CUTOFF_HOUR,
): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const hour = value('hour');
  const localCalendarDay = Date.UTC(year, month - 1, day);
  const operationalDay = localCalendarDay - (hour < cutoffHour ? 86_400_000 : 0);
  return new Date(operationalDay).toISOString().slice(0, 10);
}
