import { describe, it, expect } from 'vitest';
import { computeIsStoreOpen, getStoreStatusDetails, scheduleEndsNextDay } from '../../src/lib/storeStatus';

describe('Store Status & Automatic Schedules', () => {
  const baseSettings = {
    nome_loja: 'Pode Vir Burgueria',
    is_open: false, // manual is closed
    abertura_automatica: true,
    horarios_funcionamento: {
      domingo: { aberto: true, inicio: '18:00', fim: '23:30' },
      segunda: { aberto: true, inicio: '18:00', fim: '23:30' },
      terca: { aberto: true, inicio: '18:00', fim: '23:30' },
      quarta: { aberto: true, inicio: '18:00', fim: '23:30' },
      quinta: { aberto: true, inicio: '18:00', fim: '23:30' },
      sexta: { aberto: true, inicio: '18:00', fim: '02:00' }, // vira madrugada
      sabado: { aberto: false, inicio: '18:00', fim: '23:30' }, // sabado fechado
    },
  };

  it('deve abrir automaticamente na segunda-feira as 22:01 mesmo com is_open false no banco', () => {
    // 2026-08-17 é uma segunda-feira.
    // Em UTC, 22:01 em São Paulo (UTC-3) é 2026-08-18T01:01:00.000Z
    const testDate = new Date('2026-08-18T01:01:00.000Z');

    const isOpen = computeIsStoreOpen(baseSettings, testDate, 'America/Sao_Paulo');
    expect(isOpen).toBe(true);

    const details = getStoreStatusDetails(baseSettings, testDate, 'America/Sao_Paulo');
    expect(details.isOpen).toBe(true);
    expect(details.text).toBe('Aberto até às 23:30');
    expect(details.tone).toBe('success');
  });

  it('deve informar que abre hoje as 18:00 na segunda-feira as 15:00', () => {
    // 15:00 em SP = 18:00 UTC
    const testDate = new Date('2026-08-17T18:00:00.000Z');

    const isOpen = computeIsStoreOpen(baseSettings, testDate, 'America/Sao_Paulo');
    expect(isOpen).toBe(false);

    const details = getStoreStatusDetails(baseSettings, testDate, 'America/Sao_Paulo');
    expect(details.isOpen).toBe(false);
    expect(details.text).toBe('Fechado • Abrimos às 18:00');
    expect(details.tone).toBe('danger');
  });

  it('deve informar que abre amanha as 18:00 na segunda-feira as 23:45', () => {
    // 23:45 em SP = 2026-08-18T02:45:00.000Z
    const testDate = new Date('2026-08-18T02:45:00.000Z');

    const isOpen = computeIsStoreOpen(baseSettings, testDate, 'America/Sao_Paulo');
    expect(isOpen).toBe(false);

    const details = getStoreStatusDetails(baseSettings, testDate, 'America/Sao_Paulo');
    expect(details.isOpen).toBe(false);
    expect(details.text).toBe('Fechado • Abrimos amanhã às 18:00');
    expect(details.tone).toBe('danger');
  });

  it('deve suportar turno que vira a madrugada (sexta para sabado as 01:30)', () => {
    // Sexta-feira 2026-08-21. Vira para sábado 2026-08-22 as 01:30 em SP = 2026-08-22T04:30:00.000Z
    const testDate = new Date('2026-08-22T04:30:00.000Z');

    const isOpen = computeIsStoreOpen(baseSettings, testDate, 'America/Sao_Paulo');
    expect(isOpen).toBe(true);

    const details = getStoreStatusDetails(baseSettings, testDate, 'America/Sao_Paulo');
    expect(details.isOpen).toBe(true);
    expect(details.text).toBe('Aberto até às 02:00');
    expect(details.tone).toBe('success');
  });

  it('deixa claro antes da meia-noite que o fechamento ocorre no dia seguinte', () => {
    const testDate = new Date('2026-08-22T01:00:00.000Z');
    const details = getStoreStatusDetails(baseSettings, testDate, 'America/Sao_Paulo');

    expect(details.isOpen).toBe(true);
    expect(details.text).toBe('Aberto até às 02:00 do dia seguinte');
  });

  it('identifica visualmente apenas horarios que terminam no dia seguinte', () => {
    expect(scheduleEndsNextDay({ aberto: true, inicio: '18:00', fim: '02:00' })).toBe(true);
    expect(scheduleEndsNextDay({ aberto: true, inicio: '09:00', fim: '18:00' })).toBe(false);
    expect(scheduleEndsNextDay({ aberto: false, inicio: '18:00', fim: '02:00' })).toBe(false);
  });

  it('respeita controle manual quando abertura automatica esta desligada', () => {
    const manualSettingsOpen = {
      nome_loja: 'Pode Vir Burgueria',
      is_open: true,
      abertura_automatica: false,
    };
    const manualSettingsClosed = {
      nome_loja: 'Pode Vir Burgueria',
      is_open: false,
      abertura_automatica: false,
    };

    expect(computeIsStoreOpen(manualSettingsOpen)).toBe(true);
    expect(computeIsStoreOpen(manualSettingsClosed)).toBe(false);

    expect(getStoreStatusDetails(manualSettingsOpen).text).toBe('Aberto');
    expect(getStoreStatusDetails(manualSettingsClosed).text).toBe('Fechado');
  });

  it('abre no segundo turno e informa a proxima abertura entre os turnos', () => {
    const settings = {
      ...baseSettings,
      horarios_funcionamento: {
        ...baseSettings.horarios_funcionamento,
        segunda: { aberto: true, inicio: '11:00', fim: '14:00', inicio2: '18:00', fim2: '23:00' },
      },
    };
    const betweenShifts = new Date('2026-08-17T18:00:00.000Z'); // 15:00 em SP
    const dinner = new Date('2026-08-17T22:00:00.000Z'); // 19:00 em SP

    expect(computeIsStoreOpen(settings, betweenShifts, 'America/Sao_Paulo')).toBe(false);
    expect(getStoreStatusDetails(settings, betweenShifts, 'America/Sao_Paulo').text).toBe('Fechado • Abrimos às 18:00');
    expect(computeIsStoreOpen(settings, dinner, 'America/Sao_Paulo')).toBe(true);
    expect(getStoreStatusDetails(settings, dinner, 'America/Sao_Paulo').text).toBe('Aberto até às 23:00');
  });

  it('mantem a programacao automatica fechada durante uma pausa temporaria', () => {
    const now = new Date('2026-08-18T01:01:00.000Z');
    const paused = { ...baseSettings, pausado_manualmente: true, pausado_ate: '2026-08-18T01:31:00.000Z' };
    expect(computeIsStoreOpen(paused, now, 'America/Sao_Paulo')).toBe(false);
    expect(getStoreStatusDetails(paused, now, 'America/Sao_Paulo').text).toContain('Pausada até');
    expect(computeIsStoreOpen(paused, new Date('2026-08-18T01:32:00.000Z'), 'America/Sao_Paulo')).toBe(true);
  });

  it('permite abertura manual temporaria sem apagar a programacao automatica', () => {
    const now = new Date('2026-08-18T14:00:00.000Z');
    const scheduledClosed = {
      ...baseSettings,
      aberto_manualmente_ate: '2026-08-18T16:00:00.000Z',
      horarios_funcionamento: {},
    };
    expect(computeIsStoreOpen(scheduledClosed, now, 'America/Sao_Paulo')).toBe(true);
    expect(computeIsStoreOpen(scheduledClosed, new Date('2026-08-18T16:01:00.000Z'), 'America/Sao_Paulo')).toBe(false);
  });
});
