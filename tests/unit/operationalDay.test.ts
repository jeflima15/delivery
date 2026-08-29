import { describe, expect, it } from 'vitest';
import { getOperationalDate } from '../../server/domain/operationalDay';

describe('operational day', () => {
  it('mantém pedidos da madrugada no dia operacional anterior', () => {
    expect(getOperationalDate(new Date('2026-08-29T05:30:00.000Z'), 'America/Sao_Paulo')).toBe('2026-08-28');
  });

  it('inicia um novo dia operacional às 06:00 no fuso da loja', () => {
    expect(getOperationalDate(new Date('2026-08-29T09:00:00.000Z'), 'America/Sao_Paulo')).toBe('2026-08-29');
  });

  it('respeita o fuso configurado pelo tenant', () => {
    expect(getOperationalDate(new Date('2026-08-29T09:30:00.000Z'), 'America/Manaus')).toBe('2026-08-28');
  });
});
