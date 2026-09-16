import { describe, expect, it } from 'vitest';
import {
  listPreorderSlots, preorderProductPolicySchema, preorderSettingsSchema, resolvePreorderCartPolicy,
} from '../../server/domain/preorderScheduling';

const settings = {
  salesMode: 'scheduled_only' as const,
  minLeadMinutes: 60,
  maxAdvanceDays: 7,
  allowSameDay: true,
  slotMinutes: 60,
  weeklySchedule: [{ weekday: 0, intervals: [{ start: '09:00', end: '13:00' }] }],
};
const input = {
  settings, date: '2026-09-13', timezone: 'America/Sao_Paulo', now: new Date('2026-09-13T12:00:00Z'),
};

describe('preorder settings contract', () => {
  it('keeps existing stores immediate-only and stock-independent by default', () => {
    expect(preorderSettingsSchema.parse({})).toMatchObject({
      salesMode: 'immediate_only', minLeadMinutes: 2880, weeklySchedule: [],
      maxOrdersPerDay: null, maxOrdersPerSlot: null,
    });
    expect(preorderProductPolicySchema.parse({})).toEqual({ availability: 'inherit', minLeadMinutes: null });
    expect(listPreorderSlots({ ...input, settings: {} })).toEqual([]);
  });

  it.each([
    { slotMinutes: 0 }, { slotMinutes: 1.5 }, { minLeadMinutes: -1 },
    { maxAdvanceDays: 366 }, { maxAdvanceDays: 1, minLeadMinutes: 2880 },
    { maxOrdersPerDay: 0 }, { maxOrdersPerSlot: -1 }, { allowSameDay: 'true' },
    { weeklySchedule: [{ weekday: 7, intervals: [] }] },
    { weeklySchedule: [{ weekday: 0, intervals: [] }, { weekday: 0, intervals: [] }] },
    { dateOverrides: [{ date: '2026-02-30', intervals: [] }] },
    { dateOverrides: [{ date: '2026-09-13', intervals: [] }, { date: '2026-09-13', intervals: [] }] },
    { weeklySchedule: [{ weekday: 0, intervals: [{ start: '09:00', end: '08:00' }] }] },
    { weeklySchedule: [{ weekday: 0, intervals: [{ start: '09:00', end: '09:00' }] }] },
    { weeklySchedule: [{ weekday: 0, intervals: [{ start: '25:00', end: '26:00' }] }] },
    { weeklySchedule: [{ weekday: 0, intervals: [{ start: '09:00', end: '11:00' }, { start: '10:00', end: '12:00' }] }] },
    { unexpected: true },
  ])('rejects invalid settings %j', (patch) => {
    expect(preorderSettingsSchema.safeParse({ ...settings, ...patch }).success).toBe(false);
  });

  it('accepts adjacent intervals and leap days', () => {
    expect(preorderSettingsSchema.safeParse({ ...settings,
      dateOverrides: [{ date: '2028-02-29', intervals: [{ start: '09:00', end: '10:00' }, { start: '10:00', end: '11:00' }] }],
    }).success).toBe(true);
  });
});

describe('cart scheduling rules', () => {
  it.each([{}, { availability: 'inherit' as const }, { availability: 'immediate_only' as const }])('never implicitly schedules ordinary products %j', (product) => {
    expect(resolvePreorderCartPolicy({ ...settings, salesMode: 'both' }, [product])).toMatchObject({ immediateAllowed: true, scheduledAllowed: false });
    expect(resolvePreorderCartPolicy(settings, [product]).scheduledAllowed).toBe(false);
  });
  it('uses the most restrictive product lead time, inheriting unset values', () => {
    expect(resolvePreorderCartPolicy(settings, [{ availability: 'scheduled_only', minLeadMinutes: 4320 }, { availability: 'scheduled_only' }])).toEqual({
      immediateAllowed: false, scheduledAllowed: true, minLeadMinutes: 4320,
    });
  });

  it('allows an explicit product lead time to replace the store default', () => {
    expect(resolvePreorderCartPolicy(settings, [{ minLeadMinutes: 0 }]).minLeadMinutes).toBe(0);
    expect(resolvePreorderCartPolicy(settings, [{ minLeadMinutes: 0 }, {}]).minLeadMinutes).toBe(60);
  });

  it('does not let a product override a store mode or a preorder pause', () => {
    expect(resolvePreorderCartPolicy({}, [{ availability: 'both' }]).scheduledAllowed).toBe(false);
    expect(resolvePreorderCartPolicy({ ...settings, acceptingPreorders: false }, []).scheduledAllowed).toBe(false);
    expect(resolvePreorderCartPolicy(settings, [{ availability: 'both' }]).immediateAllowed).toBe(false);
  });

  it('identifies incompatible carts without changing the products', () => {
    const products = [{ availability: 'immediate_only' as const }, { availability: 'scheduled_only' as const }];
    expect(resolvePreorderCartPolicy({ ...settings, salesMode: 'both' }, products)).toMatchObject({
      immediateAllowed: false, scheduledAllowed: false,
    });
    expect(products).toHaveLength(2);
  });
});

describe('read-only preorder availability', () => {
  it('enforces exact lead time and returns UTC instants with local labels', () => {
    const slots = listPreorderSlots(input);
    expect(slots.map((slot) => slot.startTime)).toEqual(['10:00', '11:00', '12:00']);
    expect(slots[0]).toEqual({ date: '2026-09-13', startTime: '10:00', endTime: '11:00',
      startsAt: '2026-09-13T13:00:00.000Z', endsAt: '2026-09-13T14:00:00.000Z', remainingOrders: null });
    expect(listPreorderSlots({ ...input, now: new Date('2026-09-13T12:00:00.001Z') })[0].startTime).toBe('11:00');
  });

  it('blocks same-day bookings when disabled', () => {
    expect(listPreorderSlots({ ...input, settings: { ...settings, allowSameDay: false } })).toEqual([]);
  });

  it('uses the local calendar date, not UTC or the 6am operational cutoff', () => {
    const overnight = { ...input, now: new Date('2026-09-14T01:00:00Z'),
      settings: { ...settings, minLeadMinutes: 0, weeklySchedule: [{ weekday: 0, intervals: [{ start: '23:00', end: '24:00' }] }] } };
    expect(listPreorderSlots(overnight)[0].startsAt).toBe('2026-09-14T02:00:00.000Z');
    expect(listPreorderSlots({ ...input, now: new Date('2026-09-13T06:00:00Z'),
      settings: { ...settings, allowSameDay: false } })).toEqual([]);
  });

  it('includes the last allowed calendar date and excludes past/later dates', () => {
    expect(listPreorderSlots({ ...input, date: '2026-09-20' })).toHaveLength(4);
    expect(listPreorderSlots({ ...input, date: '2026-09-27' })).toEqual([]);
    expect(listPreorderSlots({ ...input, date: '2026-09-06' })).toEqual([]);
  });

  it('allows a date override to close or replace the regular schedule', () => {
    expect(listPreorderSlots({ ...input, settings: { ...settings,
      dateOverrides: [{ date: input.date, intervals: [] }] } })).toEqual([]);
    expect(listPreorderSlots({ ...input, settings: { ...settings,
      dateOverrides: [{ date: input.date, intervals: [{ start: '15:00', end: '17:00' }] }] } })
      .map((slot) => slot.startTime)).toEqual(['15:00', '16:00']);
  });

  it('allows an exceptional opening on a normally closed weekday', () => {
    expect(listPreorderSlots({ ...input, date: '2026-09-14' })).toEqual([]);
    expect(listPreorderSlots({ ...input, date: '2026-09-14', settings: { ...settings,
      dateOverrides: [{ date: '2026-09-14', intervals: [{ start: '09:00', end: '10:00' }] }] } })).toHaveLength(1);
  });

  it('splits shifts without crossing breaks or extending partial slots', () => {
    expect(listPreorderSlots({ ...input, settings: { ...settings, slotMinutes: 30,
      weeklySchedule: [{ weekday: 0, intervals: [{ start: '14:00', end: '15:10' }, { start: '10:00', end: '11:00' }] }] } })
      .map((slot) => slot.startTime)).toEqual(['10:00', '10:30', '14:00', '14:30']);
  });

  it('applies daily and slot capacity without reserving or modifying occupancy', () => {
    const occupancy = { date: input.date, dailyCount: 3, slots: { '2026-09-13T13:00:00.000Z': 2 } };
    const request = { ...input, occupancy, settings: { ...settings, maxOrdersPerDay: 4, maxOrdersPerSlot: 2 } };
    const slots = listPreorderSlots(request);
    expect(slots.map((slot) => slot.startTime)).toEqual(['11:00', '12:00']);
    expect(slots.every((slot) => slot.remainingOrders === 1)).toBe(true);
    expect(listPreorderSlots(request)).toEqual(slots);
    expect(occupancy.dailyCount).toBe(3);
    expect(listPreorderSlots({ ...request, occupancy: { ...occupancy, dailyCount: 4 } })).toEqual([]);
  });

  it('applies cart restrictions to the slots', () => {
    expect(listPreorderSlots({ ...input, products: [{ availability: 'immediate_only' }] })).toEqual([]);
    expect(listPreorderSlots({ ...input, products: [{ minLeadMinutes: 4320 }] })).toEqual([]);
    expect(listPreorderSlots({ ...input, settings: { ...settings, acceptingPreorders: false } })).toEqual([]);
  });

  it('normalizes equivalent UTC timestamp formats in occupancy', () => {
    const slots = listPreorderSlots({ ...input, settings: { ...settings, maxOrdersPerSlot: 1 },
      occupancy: { date: input.date, dailyCount: 1, slots: { '2026-09-13T13:00:00Z': 1 } } });
    expect(slots.map((slot) => slot.startTime)).toEqual(['11:00', '12:00']);
  });

  it.each([
    { date: input.date, dailyCount: 0, slots: { '2026-09-13T13:00:00Z': 1 } },
    { date: input.date, dailyCount: 2, slots: { '2026-09-13T13:00:00Z': 1, '2026-09-13T13:00:00.000Z': 1 } },
    { date: input.date, dailyCount: 1, slots: { '2026-09-14T13:00:00Z': 1 } },
  ])('rejects inconsistent occupancy %j', (occupancy) => {
    expect(() => listPreorderSlots({ ...input, occupancy })).toThrow();
  });

  it('rejects invalid timezones, dates, current time and occupancy', () => {
    expect(() => listPreorderSlots({ ...input, timezone: 'Unknown/Timezone' })).toThrow();
    expect(() => listPreorderSlots({ ...input, date: '2026-02-30' })).toThrow();
    expect(() => listPreorderSlots({ ...input, now: new Date(NaN) })).toThrow();
    expect(() => listPreorderSlots({ ...input, occupancy: { date: '2026-09-14', dailyCount: 0, slots: {} } })).toThrow();
    expect(() => listPreorderSlots({ ...input, occupancy: { date: input.date, dailyCount: -1, slots: {} } })).toThrow();
  });

  it.each([
    ['2026-03-08', ['00:00', '03:00']],
    ['2026-11-01', ['02:00', '03:00']],
  ])('does not offer nonexistent, ambiguous or distorted DST slots on %s', (date, expected) => {
    const slots = listPreorderSlots({ date, timezone: 'America/New_York',
      now: new Date(`${date}T00:00:00Z`), settings: { ...settings, minLeadMinutes: 0,
        weeklySchedule: [{ weekday: 0, intervals: [{ start: '00:00', end: '04:00' }] }] } });
    expect(slots.map((slot) => slot.startTime)).toEqual(expected);
  });
});
