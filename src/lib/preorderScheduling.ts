import { z } from 'zod';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const clockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');

const intervalSchema = z.object({
  start: clockSchema,
  end: z.union([clockSchema, z.literal('24:00')]),
}).strict().refine((interval) => minutes(interval.start) < minutes(interval.end), {
  message: 'Use a separate interval on each date for overnight availability',
});

const intervalsSchema = z.array(intervalSchema).max(24).superRefine((intervals, context) => {
  const ordered = [...intervals].sort((a, b) => minutes(a.start) - minutes(b.start));
  for (let index = 1; index < ordered.length; index++) {
    if (minutes(ordered[index].start) < minutes(ordered[index - 1].end)) {
      context.addIssue({ code: 'custom', message: 'Availability intervals cannot overlap' });
    }
  }
});

export const preorderSettingsSchema = z.object({
  salesMode: z.enum(['immediate_only', 'scheduled_only', 'both']).default('immediate_only'),
  acceptingPreorders: z.boolean().default(true),
  depositPercent: z.number().int().min(0).max(100).default(0),
  minLeadMinutes: z.number().int().min(0).max(525_600).default(2_880),
  maxAdvanceDays: z.number().int().min(1).max(365).default(30),
  allowSameDay: z.boolean().default(false),
  slotMinutes: z.number().int().min(5).max(1_440).default(60),
  maxOrdersPerDay: z.number().int().positive().nullable().default(null),
  maxOrdersPerSlot: z.number().int().positive().nullable().default(null),
  weeklySchedule: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    intervals: intervalsSchema,
  }).strict()).max(7).default([]),
  dateOverrides: z.array(z.object({
    date: dateSchema,
    intervals: intervalsSchema,
  }).strict()).max(366).default([]),
}).strict().superRefine((settings, context) => {
  if (new Set(settings.weeklySchedule.map((day) => day.weekday)).size !== settings.weeklySchedule.length) {
    context.addIssue({ code: 'custom', path: ['weeklySchedule'], message: 'Duplicate weekday' });
  }
  if (new Set(settings.dateOverrides.map((day) => day.date)).size !== settings.dateOverrides.length) {
    context.addIssue({ code: 'custom', path: ['dateOverrides'], message: 'Duplicate date override' });
  }
  if (settings.minLeadMinutes > settings.maxAdvanceDays * 1_440) {
    context.addIssue({ code: 'custom', message: 'Minimum lead time exceeds the booking horizon' });
  }
});

export const preorderProductPolicySchema = z.object({
  availability: z.enum(['inherit', 'immediate_only', 'scheduled_only', 'both']).default('inherit'),
  minLeadMinutes: z.number().int().min(0).max(525_600).nullable().default(null),
}).strict();

export type PreorderSettings = z.infer<typeof preorderSettingsSchema>;
export type PreorderProductPolicy = z.infer<typeof preorderProductPolicySchema>;

export function resolvePreorderCartPolicy(
  rawSettings: z.input<typeof preorderSettingsSchema>,
  rawProducts: Array<z.input<typeof preorderProductPolicySchema>>,
) {
  const settings = preorderSettingsSchema.parse(rawSettings);
  const products = rawProducts.map((product) => preorderProductPolicySchema.parse(product));
  const immediateAllowed = settings.salesMode !== 'scheduled_only'
    && products.every((product) => product.availability !== 'scheduled_only');
  const scheduledAllowed = settings.salesMode !== 'immediate_only' && settings.acceptingPreorders
    && products.every((product) => product.availability === 'scheduled_only' || product.availability === 'both');
  const minLeadMinutes = products.length
    ? Math.max(...products.map((product) => product.minLeadMinutes ?? settings.minLeadMinutes))
    : settings.minLeadMinutes;
  return { immediateAllowed, scheduledAllowed, minLeadMinutes };
}

const occupancySchema = z.object({
  date: dateSchema,
  dailyCount: z.number().int().nonnegative(),
  slots: z.record(z.string().datetime(), z.number().int().nonnegative()),
}).strict().superRefine((occupancy, context) => {
  const keys = Object.keys(occupancy.slots).map((key) => new Date(key).toISOString());
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', message: 'Duplicate slot instant' });
  }
  if (Object.values(occupancy.slots).reduce((total, count) => total + count, 0) > occupancy.dailyCount) {
    context.addIssue({ code: 'custom', message: 'Slot counts exceed daily occupancy' });
  }
}).transform((occupancy) => ({
  ...occupancy,
  slots: Object.fromEntries(Object.entries(occupancy.slots).map(([key, count]) => [new Date(key).toISOString(), count])),
}));

export type PreorderOccupancy = z.infer<typeof occupancySchema>;
export type PreorderSlot = {
  date: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  remainingOrders: number | null;
};

function localEpoch(formatter: Intl.DateTimeFormat, date: Date): number {
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'));
}

const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

/** Read-only availability preview. Occupancy must be tenant-scoped by the caller;
 * booking still requires a fresh capacity check and an atomic reservation. */
export function listPreorderSlots(input: {
  settings: z.input<typeof preorderSettingsSchema>;
  date: string;
  timezone: string;
  now: Date;
  products?: Array<z.input<typeof preorderProductPolicySchema>>;
  occupancy?: PreorderOccupancy;
}): PreorderSlot[] {
  const settings = preorderSettingsSchema.parse(input.settings);
  const date = dateSchema.parse(input.date);
  const timezone = z.string().min(1).parse(input.timezone);
  if (!Number.isFinite(input.now.getTime())) throw new Error('Invalid current time');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const occupancy = input.occupancy ? occupancySchema.parse(input.occupancy) : undefined;
  if (occupancy && occupancy.date !== date) throw new Error('Occupancy belongs to a different date');
  const midnight = Date.parse(`${date}T00:00:00.000Z`);
  if (occupancy && Object.keys(occupancy.slots).some((key) => Math.floor(localEpoch(formatter, new Date(key)) / DAY_MS) * DAY_MS !== midnight)) {
    throw new Error('Occupied slot belongs to a different local date');
  }
  const policy = resolvePreorderCartPolicy(settings, input.products || []);
  if (!policy.scheduledAllowed) return [];

  const localNow = localEpoch(formatter, input.now);
  const today = Math.floor(localNow / DAY_MS) * DAY_MS;
  if (midnight < today || midnight > today + settings.maxAdvanceDays * DAY_MS) return [];
  if (!settings.allowSameDay && midnight === today) return [];
  const dailyRemaining = settings.maxOrdersPerDay === null
    ? Infinity : Math.max(0, settings.maxOrdersPerDay - (occupancy?.dailyCount || 0));
  if (dailyRemaining === 0) return [];

  const override = settings.dateOverrides.find((entry) => entry.date === date);
  const intervals = override
    ? override.intervals
    : settings.weeklySchedule.find((entry) => entry.weekday === new Date(midnight).getUTCDay())?.intervals || [];

  // Round-trip surrounding timezone offsets instead of assuming a fixed UTC offset.
  // Missing or ambiguous wall-clock times at DST transitions are not offered.
  const offsets = new Set([-36, -12, 12, 36].map((hours) => {
    const epoch = midnight + hours * 60 * MINUTE_MS;
    return localEpoch(formatter, new Date(epoch)) - epoch;
  }));
  const resolveInstant = (minute: number): number | null => {
    const wallTime = midnight + minute * MINUTE_MS;
    const matches = [...offsets].map((offset) => wallTime - offset)
      .filter((epoch) => localEpoch(formatter, new Date(epoch)) === wallTime);
    return matches.length === 1 ? matches[0] : null;
  };

  const earliest = input.now.getTime() + policy.minLeadMinutes * MINUTE_MS;
  const slots: PreorderSlot[] = [];
  for (const interval of [...intervals].sort((a, b) => minutes(a.start) - minutes(b.start))) {
    for (let start = minutes(interval.start); start + settings.slotMinutes <= minutes(interval.end); start += settings.slotMinutes) {
      const end = start + settings.slotMinutes;
      const startsAt = resolveInstant(start);
      const endsAt = resolveInstant(end);
      if (startsAt === null || endsAt === null || startsAt < earliest || endsAt - startsAt !== settings.slotMinutes * MINUTE_MS) continue;
      const startIso = new Date(startsAt).toISOString();
      const slotRemaining = settings.maxOrdersPerSlot === null
        ? Infinity : Math.max(0, settings.maxOrdersPerSlot - (occupancy?.slots[startIso] || 0));
      const remaining = Math.min(dailyRemaining, slotRemaining);
      if (remaining === 0) continue;
      slots.push({ date, startTime: clock(start), endTime: clock(end), startsAt: startIso,
        endsAt: new Date(endsAt).toISOString(), remainingOrders: Number.isFinite(remaining) ? remaining : null });
    }
  }
  return slots;
}
