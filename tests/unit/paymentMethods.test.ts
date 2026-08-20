import { describe, expect, it } from 'vitest';
import { paymentMethodLabel } from '../../src/lib/paymentMethods';
import { publicSettingsDto } from '../../server/routes/public';

describe('formas de pagamento com cartao separado', () => {
  it('rotula credito, debito e pedidos legados sem presumir credito', () => {
    expect(paymentMethodLabel('credit_card')).toBe('Cartão de crédito');
    expect(paymentMethodLabel('debit_card')).toBe('Cartão de débito');
    expect(paymentMethodLabel('card')).toBe('Cartão');
  });

  it('mantem fallback para configuracoes antigas e respeita opcoes explicitas', () => {
    const legacy = publicSettingsDto({ pagamento_cartao: true });
    expect(legacy?.pagamento_cartao_credito).toBe(true);
    expect(legacy?.pagamento_cartao_debito).toBe(true);

    const separated = publicSettingsDto({
      pagamento_cartao: true,
      pagamento_cartao_credito: false,
      pagamento_cartao_debito: true,
    });
    expect(separated?.pagamento_cartao).toBe(true);
    expect(separated?.pagamento_cartao_credito).toBe(false);
    expect(separated?.pagamento_cartao_debito).toBe(true);
  });
});
