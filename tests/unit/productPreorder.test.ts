import { describe, expect, it } from 'vitest';
import { combineProductPreorders, preorderLeadLabel } from '../../src/lib/productPreorder';
import { publicProductDto } from '../../server/routes/public';

describe('public preorder information', () => {
  const product = { _id: '507f1f77bcf86cd799439001', nome: 'Bolo', preorderDraft: { availability: 'scheduled_only', minLeadMinutes: 4320 } };
  const settings = { preorderEnabled: true, preorderDraft: { salesMode: 'both', minLeadMinutes: 2880 } };
  it('only publishes effective rules when the agenda is enabled', () => {
    expect(publicProductDto(product).preorder).toBeNull();
    const dto = publicProductDto(product, [], settings);
    expect(dto.preorder).toMatchObject({ immediateAllowed: false, scheduledAllowed: true, minLeadMinutes: 4320 });
    expect(dto).not.toHaveProperty('preorderDraft');
  });
  it('keeps the scheduled-only label while new bookings are paused', () => {
    expect(publicProductDto(product, [], { ...settings, preorderDraft: { ...settings.preorderDraft, acceptingPreorders: false } }).preorder)
      .toMatchObject({ immediateAllowed: false, scheduledAllowed: true, acceptingPreorders: false });
  });
  it('inherits the store mode and combines fixed component restrictions', () => {
    expect(publicProductDto({ _id: 'other' }, [], { preorderEnabled: true, preorderDraft: { salesMode: 'scheduled_only' } }).preorder?.immediateAllowed).toBe(false);
    const combo = { _id: 'combo', tipo: 'combo', combo_mode: 'fixed', combo_itens_fixos: [{ produtoId: product._id }] };
    expect(publicProductDto(combo, [], settings, [product]).preorder).toMatchObject({ immediateAllowed: false, minLeadMinutes: 4320 });
  });
  it('combines selected combo options and formats the lead time', () => {
    const rule = publicProductDto(product, [], settings).preorder!;
    expect(combineProductPreorders([rule, { ...rule, immediateAllowed: true, scheduledAllowed: false }])).toMatchObject({ immediateAllowed: false, scheduledAllowed: false });
    expect(combineProductPreorders([null, undefined])).toBeNull();
    expect(preorderLeadLabel(4320)).toBe('3 dias');
    expect(preorderLeadLabel(60)).toBe('1 hora');
    expect(preorderLeadLabel(90)).toBe('90 minutos');
  });
});
