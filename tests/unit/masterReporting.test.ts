import { afterEach, describe, expect, it, vi } from 'vitest';
import { masterCalendarDate, masterDateBoundary, masterReportRange } from '../../src/lib/masterReporting';
import { rangeForPeriod } from '../../src/components/master/utils';

afterEach(() => vi.useRealTimers());

describe('calendário financeiro do Master', () => {
  it('interpreta o dia em Brasília, independentemente do fuso da máquina', () => {
    expect(masterCalendarDate(new Date('2026-10-01T02:59:59Z'))).toBe('2026-09-30');
    expect(masterDateBoundary('2026-10-01').toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(masterDateBoundary('2026-10-01', true).toISOString()).toBe('2026-10-02T02:59:59.999Z');
  });

  it('recusa datas inexistentes e períodos invertidos', () => {
    expect(() => masterDateBoundary('2026-02-30')).toThrow();
    expect(() => masterReportRange({ from: '2026-10-02', to: '2026-10-01' })).toThrow();
    expect(() => masterReportRange({ from: 'invalid' })).toThrow();
  });

  it('preserva timestamps explícitos e usa 30 dias de calendário por padrão', () => {
    expect(masterReportRange({ from: '2026-09-01T03:00:00Z', to: '2026-09-02T02:59:59Z' }).to.toISOString()).toBe('2026-09-02T02:59:59.000Z');
    const range = masterReportRange({}, new Date('2026-10-01T02:00:00Z'));
    expect(range.from.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-10-01T02:59:59.999Z');
  });

  it('mantém os presets do navegador no mesmo calendário do servidor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T02:00:00Z'));
    expect(rangeForPeriod('today')).toEqual({ from: '2026-09-30', to: '2026-09-30' });
    expect(rangeForPeriod('previous_month')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(rangeForPeriod('current_year')).toEqual({ from: '2026-01-01', to: '2026-09-30' });
  });
});
