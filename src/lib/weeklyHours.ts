import { z } from 'zod';

export const weekdayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const weekdayKeys = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const draftWeekSchema = z.array(z.object({
  weekday: z.number().int().min(0).max(6),
  intervals: z.array(z.object({ start: clock, end: z.union([clock, z.literal('24:00')]) }).strict()).max(24),
}).strict()).max(7).refine((days) => new Set(days.map((day) => day.weekday)).size === days.length);
export type WeekHours = z.infer<typeof draftWeekSchema>;

export function suggestedWeek(scheduled: boolean): WeekHours {
  return [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, intervals: [{ start: scheduled ? '09:00' : '18:00', end: scheduled ? '18:00' : '23:00' }] }));
}

export function applyHoursToDays(current: WeekHours, days: number[], start: string, end: string): WeekHours {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, intervals: days.includes(weekday)
    ? [{ start, end }] : (current.find((day) => day.weekday === weekday)?.intervals || []).map((interval) => ({ ...interval })) }));
}

export function immediateWeek(settings: Record<string, any>): WeekHours {
  return weekdayKeys.map((key, weekday) => {
    const day = settings[key];
    return { weekday, intervals: day?.aberto ? [{ start: day.inicio, end: day.fim }, ...(day.inicio2 && day.fim2 ? [{ start: day.inicio2, end: day.fim2 }] : [])] : [] };
  });
}

export function immediateSettings(week: WeekHours, previous: Record<string, any> = {}) {
  return Object.fromEntries(weekdayKeys.map((key, weekday) => {
    const intervals = week.find((day) => day.weekday === weekday)?.intervals || [];
    if (!intervals.length && previous[key] && !previous[key].aberto) return [key, { ...previous[key] }];
    return [key, { aberto: intervals.length > 0, inicio: intervals[0]?.start || '18:00', fim: intervals[0]?.end || '23:00',
      ...(intervals[1] ? { inicio2: intervals[1].start, fim2: intervals[1].end } : {}) }];
  }));
}

export function validImmediateWeek(week: WeekHours): boolean {
  if (!draftWeekSchema.safeParse(week).success || !week.some((day) => day.intervals.length)) return false;
  const occupied = new Set<number>();
  for (const day of week) {
    if (day.intervals.length > 2) return false;
    for (const interval of day.intervals) {
      if (interval.end === '24:00' || interval.start === interval.end) return false;
      const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
      const start = minute(interval.start);
      let end = minute(interval.end);
      if (end < start) end += 1440;
      for (let offset = start; offset < end; offset++) {
        const key = (day.weekday * 1440 + offset) % 10080;
        if (occupied.has(key)) return false;
        occupied.add(key);
      }
    }
  }
  return true;
}
