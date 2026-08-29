import { describe, expect, it } from 'vitest';
import { formatWhatsAppAppLink, formatWhatsAppLink } from '../../src/lib/formatters';

describe('formatWhatsAppLink', () => {
  it('adds the Brazilian country code to a local phone number', () => {
    expect(formatWhatsAppLink('(24) 99909-7604')).toBe('https://wa.me/5524999097604');
  });

  it('does not duplicate an existing Brazilian country code', () => {
    expect(formatWhatsAppLink('+55 (24) 99909-7604')).toBe('https://wa.me/5524999097604');
  });

  it('supports a share-only link without a phone number', () => {
    expect(formatWhatsAppLink('', 'Conheça a loja')).toBe(
      'https://wa.me/?text=Conhe%C3%A7a%20a%20loja',
    );
  });

  it('keeps a local number whose area code is 55', () => {
    expect(formatWhatsAppLink('(55) 99909-7604')).toBe('https://wa.me/5555999097604');
  });

  it('encodes accents and line breaks once', () => {
    expect(formatWhatsAppLink('5524999097604', 'Olá!\nPedido pronto.')).toBe(
      'https://wa.me/5524999097604?text=Ol%C3%A1!%0APedido%20pronto.',
    );
  });

  it('returns the WhatsApp share root for empty input', () => {
    expect(formatWhatsAppLink('')).toBe('https://wa.me/');
  });
});

describe('formatWhatsAppAppLink', () => {
  it('creates a link for the installed WhatsApp app without duplicating the country code', () => {
    expect(formatWhatsAppAppLink('+55 (24) 99909-7604', 'Pedido pronto!')).toBe(
      'whatsapp://send?phone=5524999097604&text=Pedido%20pronto!',
    );
  });
});
