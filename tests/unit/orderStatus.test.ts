import { describe, expect, it } from 'vitest';
import { getOrderStatusLabel } from '../../src/lib/orderStatus';

describe('order status labels', () => {
  it('uses the fulfillment mode for the ready stage', () => {
    expect(getOrderStatusLabel('Pronto', 'delivery')).toBe('Pronto para Entrega');
    expect(getOrderStatusLabel('Pronto', 'pickup')).toBe('Pronto para Retirada');
    expect(getOrderStatusLabel('Pronto', 'local')).toBe('Pronto para Servir');
    expect(getOrderStatusLabel('Saiu para Entrega', 'delivery')).toBe('Saiu para Entrega');
    expect(getOrderStatusLabel('Saiu para Entrega', 'pickup')).toBe('Pronto para Retirada');
    expect(getOrderStatusLabel('Saiu para Entrega', 'retirada')).toBe('Pronto para Retirada');
    expect(getOrderStatusLabel('Saiu para Entrega', 'dine_in')).toBe('Pronto para Servir');
    expect(getOrderStatusLabel('Saiu para Entrega', 'local')).toBe('Pronto para Servir');
  });

  it('uses the fulfillment mode for completed orders', () => {
    expect(getOrderStatusLabel('Entregue', 'delivery')).toBe('Pedido Entregue');
    expect(getOrderStatusLabel('Entregue', 'pickup')).toBe('Pedido Retirado');
    expect(getOrderStatusLabel('Concluído', 'local')).toBe('Pedido Finalizado');
  });

  it('keeps generic and unknown statuses safe', () => {
    expect(getOrderStatusLabel('Pendente', 'pickup')).toBe('Aguardando confirmação');
    expect(getOrderStatusLabel('Preparando', 'delivery')).toBe('Em preparação');
    expect(getOrderStatusLabel('Status legado', 'delivery')).toBe('Status legado');
  });
});
