import { describe, expect, it } from 'vitest';
import { formatOrderReference, getOrderDisplayNumber } from '../../src/lib/orderReference';

describe('order reference', () => {
  it('prioriza o número operacional diário', () => {
    expect(formatOrderReference({ dailyOrderNumber: 8, orderNumber: 142 })).toBe('#8');
  });

  it('mantém compatibilidade com pedidos anteriores', () => {
    expect(getOrderDisplayNumber({ orderNumber: 142 })).toBe('142');
    expect(getOrderDisplayNumber({ _id: '64fa12d5d952' })).toBe('D5D952');
  });
});
