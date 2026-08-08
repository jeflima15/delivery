export function formatWhatsAppLink(phone: string, text?: string): string {
  if (!phone) {
    return text ? `https://wa.me/?text=${encodeURIComponent(text)}` : 'https://wa.me/';
  }
  const digits = phone.replace(/\D/g, '');
  let formattedPhone = digits;

  if (digits.startsWith('55') && digits.length > 11) {
    formattedPhone = digits;
  } else {
    formattedPhone = '55' + digits;
  }

  const baseUrl = `https://wa.me/${formattedPhone}`;
  
  if (text) {
    return `${baseUrl}?text=${encodeURIComponent(text)}`;
  }
  
  return baseUrl;
}
