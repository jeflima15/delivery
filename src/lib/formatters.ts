export function formatMoney(value: number): string {
  if (typeof value !== 'number') return 'R$ 0,00';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function maskPhone(value: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

export function unmaskDigits(value: string): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

export function formatWhatsAppLink(phone: string, text: string = ''): string {
  const digits = unmaskDigits(phone);
  if (!digits) return '';
  const textParam = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/55${digits}${textParam}`;
}

export function formatDate(date: string | Date): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR');
}
