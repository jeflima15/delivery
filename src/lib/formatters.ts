export function formatWhatsAppLink(phone: string, text: string = ''): string {
  const digits = phone.replace(/\D/g, '');
  const textParam = text ? `?text=${encodeURIComponent(text)}` : '';
  if (!digits) return `https://wa.me/${textParam}`;
  const internationalPhone = digits.startsWith('55') && digits.length > 11 ? digits : `55${digits}`;
  return `https://wa.me/${internationalPhone}${textParam}`;
}
