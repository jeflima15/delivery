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
  if (today?.aberto) {
    const inicio = String(today.inicio || '18:00').trim();
    const fim = String(today.fim || '23:30').trim();

    if (inicio <= fim) {
      // Turno normal (ex: 18:00 às 23:30)
      if (timeStr >= inicio && timeStr <= fim) {
        return true;
      }
    } else {
      // Turno que vira a madrugada (ex: 18:00 às 02:00, no mesmo dia a partir das 18:00)
      if (timeStr >= inicio) {
        return true;
      }
    }
  }

  // 2. Verifica se está aberto pelo turno da madrugada iniciado ontem (ex: ontem 18:00 às 02:00, e agora é 01:30)
  const yesterday = schedules[prevDayKey];
  if (yesterday?.aberto) {
    const yInicio = String(yesterday.inicio || '18:00').trim();
    const yFim = String(yesterday.fim || '23:30').trim();

    if (yInicio > yFim && timeStr <= yFim) {
      return true;
    }
  }

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
  if (today?.aberto) {
    const inicio = String(today.inicio || '18:00').trim();
    const fim = String(today.fim || '23:30').trim();

    if (inicio <= fim) {
      if (timeStr >= inicio && timeStr <= fim) {
        return {
          isOpen: true,
          isAutomatic: true,
          text: `Aberto até às ${fim}`,
          tone: 'success',
          closingTime: fim,
        };
      }
    } else {
      if (timeStr >= inicio) {
        return {
          isOpen: true,
          isAutomatic: true,
          text: `Aberto até às ${fim}`,
          tone: 'success',
          closingTime: fim,
        };
      }
    }
  }

  // 2. Aberto na extensão da madrugada de ontem
  if (yesterday?.aberto) {
    const yInicio = String(yesterday.inicio || '18:00').trim();
    const yFim = String(yesterday.fim || '23:30').trim();
    if (yInicio > yFim && timeStr <= yFim) {
      return {
        isOpen: true,
        isAutomatic: true,
        text: `Aberto até às ${yFim}`,
        tone: 'success',
        closingTime: yFim,
      };
    }
  }

  // 3. Loja fechada no momento. Descobrir quando abre:
  // Abre mais tarde hoje?
  if (today?.aberto) {
    const inicio = String(today.inicio || '18:00').trim();
    if (timeStr < inicio) {
      return {
        isOpen: false,
        isAutomatic: true,
        text: `Fechado • Abrimos às ${inicio}`,
        tone: 'danger',
        nextOpeningTime: inicio,
        nextOpeningDay: 'hoje',
      };
    }
  }

  // Procura nos próximos 6 dias da semana
  for (let i = 1; i <= 6; i++) {
    const nextIdx = (dayIndex + i) % 7;
    const nextKey = DAYS_CONFIG[nextIdx].key;
    const nextSchedule = schedules[nextKey];
    if (nextSchedule?.aberto) {
      const nextInicio = String(nextSchedule.inicio || '18:00').trim();
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
