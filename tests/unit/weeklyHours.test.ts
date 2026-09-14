import { expect, it } from 'vitest';
import { applyHoursToDays, immediateSettings, immediateWeek, suggestedWeek, validImmediateWeek } from '../../src/lib/weeklyHours';
import { initialOnboardingDraft, onboardingSettings, selectSalesMode, onboardingWeek } from '../../src/lib/onboardingSetup';

it('suggests independent models and preserves edits when switching sales modes', () => {
  const initial = selectSalesMode(initialOnboardingDraft(), 'both');
  expect(onboardingWeek(initial, false)[0].intervals).toEqual([{ start: '18:00', end: '23:00' }]);
  expect(onboardingWeek(initial, true)[0].intervals).toEqual([{ start: '09:00', end: '18:00' }]);
  const edited = { ...initial, immediateWeek: applyHoursToDays(initial.immediateWeek!, [6], '11:00', '14:00') };
  expect(selectSalesMode(selectSalesMode(edited, 'scheduled_only'), 'both').immediateWeek).toEqual(edited.immediateWeek);
  expect(selectSalesMode({ ...initial, immediateWeek: [] }, 'both').immediateWeek).toEqual([]);
});
it('treats database default closed hours as unconfigured, but preserves customized closed days', () => {
  const settings = { horarios_funcionamento: Object.fromEntries(['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'].map((key) => [key, { aberto: false, inicio: '18:00', fim: '23:30' }])), preorderDraft: { weeklySchedule: [] } };
  const draft = selectSalesMode(initialOnboardingDraft(settings), 'both');
  expect(draft.immediateWeek).toEqual(suggestedWeek(false));
  expect(draft.scheduleWeek).toEqual(suggestedWeek(true));
  settings.horarios_funcionamento.segunda.inicio = '11:00';
  expect(onboardingWeek(selectSalesMode(initialOnboardingDraft(settings), 'both'), false).every((day) => day.intervals.length === 0)).toBe(true);
});
it('preserves legacy drafts and persisted settings instead of replacing them with models', () => {
  const old = { ...initialOnboardingDraft(), days: [0], start: '10:00', end: '14:00' };
  expect(onboardingWeek(selectSalesMode(old, 'immediate_only'), false)).toEqual([{ weekday: 0, intervals: [{ start: '10:00', end: '14:00' }] }]);
  const settings = { horarios_funcionamento: { domingo: { aberto: true, inicio: '11:00', fim: '14:00', inicio2: '18:00', fim2: '23:00' } } };
  expect(selectSalesMode(initialOnboardingDraft(settings), 'both').immediateWeek).toEqual(immediateWeek(settings.horarios_funcionamento));
});
it('changes only selected days and validates overnight overlaps across weekday boundaries', () => {
  const week = suggestedWeek(false);
  const changed = applyHoursToDays(week, [6], '19:00', '02:00');
  expect(changed.find((day) => day.weekday === 1)).toEqual(week[0]);
  expect(week[5].intervals[0].end).toBe('23:00');
  expect(validImmediateWeek(changed)).toBe(true);
  expect(validImmediateWeek(applyHoursToDays(changed, [0], '01:00', '03:00'))).toBe(false);
  expect(validImmediateWeek(applyHoursToDays(changed, [0], '99:00', '03:00'))).toBe(false);
  expect(immediateSettings(changed).sabado).toMatchObject({ aberto: true, inicio: '19:00', fim: '02:00' });
});
it('publishes per-day differences and both shifts from onboarding', () => {
  const d = selectSalesMode(initialOnboardingDraft(), 'immediate_only');
  d.immediateWeek = [{ weekday: 1, intervals: [{ start: '11:00', end: '14:00' }, { start: '18:00', end: '23:00' }] }];
  expect(onboardingSettings(d, {}).horarios_funcionamento.segunda).toEqual({ aberto: true, inicio: '11:00', fim: '14:00', inicio2: '18:00', fim2: '23:00' });
});
