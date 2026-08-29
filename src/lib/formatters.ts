function normalizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') && digits.length > 11 ? digits : `55${digits}`;
}

export function formatWhatsAppLink(phone: string, text: string = ''): string {
  const internationalPhone = normalizeWhatsAppPhone(phone);
  const textParam = text ? `?text=${encodeURIComponent(text)}` : '';
  if (!internationalPhone) return `https://wa.me/${textParam}`;
  return `https://wa.me/${internationalPhone}${textParam}`;
}

export function formatWhatsAppAppLink(phone: string, text: string = ''): string {
  const internationalPhone = normalizeWhatsAppPhone(phone);
  const params = [
    internationalPhone ? `phone=${internationalPhone}` : '',
    text ? `text=${encodeURIComponent(text)}` : '',
  ].filter(Boolean);
  return `whatsapp://send${params.length ? `?${params.join('&')}` : ''}`;
}
