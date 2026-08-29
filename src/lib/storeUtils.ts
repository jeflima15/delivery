export function computeIsStoreOpen(settings: any): boolean {
  if (settings?.pausado_manualmente) return false;
  if (settings?.abertura_automatica === false) return settings?.is_open !== false;
  
  const horarios = settings?.horarios_funcionamento;
  if (!horarios) return settings?.is_open !== false; // fallback to server value
  
  const now = new Date();
  const days = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  const today = days[now.getDay()];
  const prevDay = days[(now.getDay() + 6) % 7];
  
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  function parseTime(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  function isTimeInShift(startStr: string, endStr: string, minutes: number): boolean {
    const start = parseTime(startStr);
    const end = parseTime(endStr);
    if (start <= end) {
      return minutes >= start && minutes <= end;
    } else {
      // Overnight shift
      return minutes >= start || minutes <= end;
    }
  }
  
  // Check today's schedule
  const schedule = horarios[today];
  if (schedule?.aberto) {
    if (schedule.inicio && schedule.fim && isTimeInShift(schedule.inicio, schedule.fim, currentMinutes)) {
      return true;
    }
    if (schedule.inicio2 && schedule.fim2 && isTimeInShift(schedule.inicio2, schedule.fim2, currentMinutes)) {
      return true;
    }
  }

  // Check yesterday's overnight shift
  const yesterdaySchedule = horarios[prevDay];
  if (yesterdaySchedule?.aberto) {
    if (yesterdaySchedule.inicio && yesterdaySchedule.fim) {
      const yStart = parseTime(yesterdaySchedule.inicio);
      const yEnd = parseTime(yesterdaySchedule.fim);
      if (yStart > yEnd && currentMinutes <= yEnd) return true;
    }
    if (yesterdaySchedule.inicio2 && yesterdaySchedule.fim2) {
      const yStart2 = parseTime(yesterdaySchedule.inicio2);
      const yEnd2 = parseTime(yesterdaySchedule.fim2);
      if (yStart2 > yEnd2 && currentMinutes <= yEnd2) return true;
    }
  }
  
  return false;
}
