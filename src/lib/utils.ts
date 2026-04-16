import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getStoreStatus(storeInfo: any) {
  if (!storeInfo || !storeInfo.nome_loja) return { text: "Carregando...", tone: "neutral" };

  const isOpenManual = storeInfo.is_open; // Já vem computado do server (respeitando abertura_automatica)
  const isAuto = storeInfo.abertura_automatica;
  const schedules = storeInfo.horarios_funcionamento;

  if (!isAuto) {
    return {
      text: isOpenManual ? "Aberto" : "Fechado",
      tone: isOpenManual ? "success" : "danger"
    };
  }

  // Lógica Automática (Abertura automática ligada)
  // Usamos o fuso horário de São Paulo para garantir que o dia da semana bata com o Admin/Server
  const now = new Date();
  const diaSemanaSP = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' })
    .format(now)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos (terça -> terca)
    .replace('-feira', '');

  const configDia = schedules ? schedules[diaSemanaSP] : null;

  if (isOpenManual) {
    const fechamento = configDia?.fim;
    return {
      text: fechamento ? `Aberto até às ${fechamento}` : "Aberto",
      tone: "success"
    };
  } else {
    // Se está fechado no automático
    const abertura = configDia?.aberto ? configDia?.inicio : null;
    
    return {
      text: abertura ? `Fechado • Abrimos às ${abertura}` : "Fechado",
      tone: "danger"
    };
  }
}
