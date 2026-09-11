export const DAYS_CONFIG = [
  { key: 'domingo', label: 'Domingo', short: 'Dom' },
  { key: 'segunda', label: 'Segunda-feira', short: 'Seg' },
  { key: 'terca', label: 'Terça-feira', short: 'Ter' },
  { key: 'quarta', label: 'Quarta-feira', short: 'Qua' },
  { key: 'quinta', label: 'Quinta-feira', short: 'Qui' },
  { key: 'sexta', label: 'Sexta-feira', short: 'Sex' },
  { key: 'sabado', label: 'Sábado', short: 'Sáb' },
] as const;

export type DayKey = (typeof DAYS_CONFIG)[number]['key'];

type StoreSchedule = {
  aberto?: boolean;
  inicio?: string;
  fim?: string;
  inicio2?: string;
  fim2?: string;
};

type Shift = { inicio: string; fim: string };

function scheduleShifts(schedule?: StoreSchedule | null): Shift[] {
  if (!schedule?.aberto) return [];
  const shifts: Shift[] = [];
  if (schedule.inicio && schedule.fim) shifts.push({ inicio: schedule.inicio, fim: schedule.fim });
  if (schedule.inicio2 && schedule.fim2) shifts.push({ inicio: schedule.inicio2, fim: schedule.fim2 });
  return shifts.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export function isStorePaused(settings: any, date: Date = new Date()) {
  if (!settings?.pausado_manualmente) return false;
  if (!settings.pausado_ate) return true;
  const pauseEnd = new Date(settings.pausado_ate);
  return Number.isFinite(pauseEnd.getTime()) && pauseEnd.getTime() > date.getTime();
}

export function scheduleEndsNextDay(schedule?: StoreSchedule | null) {
  return scheduleShifts(schedule).some((shift) => shift.fim < shift.inicio);
}

export function getZonedTimeParts(dateInput: Date = new Date(), timezone = 'America/Sao_Paulo') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(dateInput);
  const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase();
  const hour = parts.find((p) => p.type === 'hour')?.value.padStart(2, '0') || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value.padStart(2, '0') || '00';
  const timeStr = `${hour}:${minute}`;

  const weekdayIndexMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };

  const dayIndex = weekdayIndexMap[weekday || 'mon'] ?? 1;
  const dayKey = DAYS_CONFIG[dayIndex].key;
  const prevDayIndex = (dayIndex + 6) % 7;
  const prevDayKey = DAYS_CONFIG[prevDayIndex].key;

  return { dayIndex, dayKey, prevDayIndex, prevDayKey, timeStr };
}

export function computeIsStoreOpen(
  settings: any,
  date: Date = new Date(),
  timezone = 'America/Sao_Paulo'
): boolean {
  if (!settings) return false;
  if (isStorePaused(settings, date)) return false;
  if (settings.aberto_manualmente_ate) {
    const manualOpenEnd = new Date(settings.aberto_manualmente_ate);
    if (Number.isFinite(manualOpenEnd.getTime()) && manualOpenEnd.getTime() > date.getTime()) return true;
  }

  // Se a abertura automática estiver desligada, respeita o switch manual is_open
  if (!settings.abertura_automatica) {
    return settings.is_open !== false;
  }

  const schedules = settings.horarios_funcionamento;
  if (!schedules || typeof schedules !== 'object') {
    return settings.is_open !== false;
  }

  const { dayKey, prevDayKey, timeStr } = getZonedTimeParts(date, timezone);

  // 1. Verifica o horário configurado para hoje
  const today = schedules[dayKey];
  if (scheduleShifts(today).some(({ inicio, fim }) => inicio <= fim ? timeStr >= inicio && timeStr <= fim : timeStr >= inicio)) return true;

  // 2. Verifica se está aberto pelo turno da madrugada iniciado ontem (ex: ontem 18:00 às 02:00, e agora é 01:30)
  const yesterday = schedules[prevDayKey];
  if (scheduleShifts(yesterday).some(({ inicio, fim }) => inicio > fim && timeStr <= fim)) return true;

  return false;
}

export interface StoreStatusDetails {
  isOpen: boolean;
  isAutomatic: boolean;
  text: string;
  tone: 'success' | 'danger' | 'neutral';
  closingTime?: string;
  nextOpeningTime?: string;
  nextOpeningDay?: string;
}

export function getStoreStatusDetails(
  settings: any,
  date: Date = new Date(),
  timezone = 'America/Sao_Paulo'
): StoreStatusDetails {
  if (!settings || !settings.nome_loja) {
    return { isOpen: true, isAutomatic: false, text: 'Carregando...', tone: 'neutral' };
  }

  if (isStorePaused(settings, date)) {
    const pauseEnd = settings.pausado_ate ? new Date(settings.pausado_ate) : null;
    const time = pauseEnd && Number.isFinite(pauseEnd.getTime())
      ? new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(pauseEnd)
      : null;
    return { isOpen: false, isAutomatic: Boolean(settings.abertura_automatica), text: time ? `Pausada até ${time}` : 'Pausada manualmente', tone: 'danger' };
  }

  if (settings.aberto_manualmente_ate) {
    const manualOpenEnd = new Date(settings.aberto_manualmente_ate);
    if (Number.isFinite(manualOpenEnd.getTime()) && manualOpenEnd.getTime() > date.getTime()) {
      const time = new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(manualOpenEnd);
      return { isOpen: true, isAutomatic: Boolean(settings.abertura_automatica), text: `Aberta manualmente até ${time}`, tone: 'success' };
    }
  }

  const isAutomatic = Boolean(settings.abertura_automatica);

  if (!isAutomatic) {
    const isOpen = settings.is_open !== false;
    return {
      isOpen,
      isAutomatic: false,
      text: isOpen ? 'Aberto' : 'Fechado',
      tone: isOpen ? 'success' : 'danger',
    };
  }

  const schedules = settings.horarios_funcionamento;
  if (!schedules || typeof schedules !== 'object') {
    const isOpen = settings.is_open !== false;
    return {
      isOpen,
      isAutomatic: true,
      text: isOpen ? 'Aberto' : 'Fechado',
      tone: isOpen ? 'success' : 'danger',
    };
  }

  const { dayIndex, dayKey, prevDayKey, timeStr } = getZonedTimeParts(date, timezone);
  const today = schedules[dayKey];
  const yesterday = schedules[prevDayKey];

  // 1. Aberto hoje no turno normal ou início de madrugada
  const activeToday = scheduleShifts(today).find(({ inicio, fim }) => inicio <= fim ? timeStr >= inicio && timeStr <= fim : timeStr >= inicio);
  if (activeToday) return { isOpen: true, isAutomatic: true, text: `Aberto até às ${activeToday.fim}${activeToday.inicio > activeToday.fim ? ' do dia seguinte' : ''}`, tone: 'success', closingTime: activeToday.fim };

  // 2. Aberto na extensão da madrugada de ontem
  const activeYesterday = scheduleShifts(yesterday).find(({ inicio, fim }) => inicio > fim && timeStr <= fim);
  if (activeYesterday) return { isOpen: true, isAutomatic: true, text: `Aberto até às ${activeYesterday.fim}`, tone: 'success', closingTime: activeYesterday.fim };

  // 3. Loja fechada no momento. Descobrir quando abre:
  // Abre mais tarde hoje?
  const nextToday = scheduleShifts(today).find(({ inicio }) => timeStr < inicio);
  if (nextToday) {
      return {
        isOpen: false,
        isAutomatic: true,
        text: `Fechado • Abrimos às ${nextToday.inicio}`,
        tone: 'danger',
        nextOpeningTime: nextToday.inicio,
        nextOpeningDay: 'hoje',
      };
  }

  // Procura nos próximos 6 dias da semana
  for (let i = 1; i <= 6; i++) {
    const nextIdx = (dayIndex + i) % 7;
    const nextKey = DAYS_CONFIG[nextIdx].key;
    const nextSchedule = schedules[nextKey];
    const nextShift = scheduleShifts(nextSchedule)[0];
    if (nextShift) {
      const nextInicio = nextShift.inicio;
      const dayLabel = i === 1 ? 'amanhã' : DAYS_CONFIG[nextIdx].label;
      return {
        isOpen: false,
        isAutomatic: true,
        text:
          i === 1
            ? `Fechado • Abrimos amanhã às ${nextInicio}`
            : `Fechado • Abrimos ${dayLabel} às ${nextInicio}`,
        tone: 'danger',
        nextOpeningTime: nextInicio,
        nextOpeningDay: dayLabel,
      };
    }
  }

  return {
    isOpen: false,
    isAutomatic: true,
    text: 'Fechado no momento',
    tone: 'danger',
  };
}
