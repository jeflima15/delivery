import { expect, it } from 'vitest';
import { initialOnboardingDraft, onboardingSettings, onboardingStepError, type OnboardingDraft } from '../../src/lib/onboardingSetup';

const base: OnboardingDraft = { ...initialOnboardingDraft(), mode: 'scheduled_only', name: 'Ateliê', phone: '24999999999', service: 'pickup', street: 'Rua Um', number: '1', city: 'Itatiaia', leadDays: '2', scheduleDays: [2, 4, 6], scheduleStart: '09:00', scheduleEnd: '18:00', pix: true, pixKey: 'pix@teste.com', deposit: '50' };
it('only asks scheduled stores for schedule fields and no shipping rate', () => {
  for (let step = 0; step < 4; step++) expect(onboardingStepError(base, step)).toBeNull();
  const settings = onboardingSettings(base, { updatedAt: '2026-09-14T00:00:00Z' });
  expect(settings).toMatchObject({ preorderEnabled: true, abertura_automatica: false, logisticsOptions: { allowDelivery: false, allowPickup: true }, preorderDraft: { salesMode: 'scheduled_only', minLeadMinutes: 2880, depositPercent: 50 } });
  expect(settings).not.toHaveProperty('taxa_entrega_fixa');
  expect(settings).not.toHaveProperty('horarios_funcionamento');
});
it('configures immediate stores without requiring deposit or preorder days', () => {
  const value = { ...base, mode: 'immediate_only' as const, service: 'delivery' as const, shipping: '5,50', days: [1, 2], start: '18:00', end: '23:00', estimate: '40–60 min', deposit: '' as const, leadDays: '', scheduleDays: [] };
  for (let step = 0; step < 4; step++) expect(onboardingStepError(value, step)).toBeNull();
  expect(onboardingSettings(value, {})).toMatchObject({ preorderEnabled: false, abertura_automatica: true, taxa_entrega_fixa: 5.5, horarios_funcionamento: { segunda: { aberto: true, inicio: '18:00', fim: '23:00' } } });
});
it('requires both schedules in mixed mode and rejects missing PIX or too short windows', () => {
  expect(onboardingStepError({ ...base, mode: 'both' }, 2)).not.toBeNull();
  expect(onboardingStepError({ ...base, pix: false }, 3)).not.toBeNull();
  expect(onboardingStepError({ ...base, scheduleEnd: '09:30' }, 2)).not.toBeNull();
  expect(onboardingStepError({ ...base, service: 'both', shipping: '' }, 1)).not.toBeNull();
});
