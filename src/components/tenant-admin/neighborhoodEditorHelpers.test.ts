import { describe, expect, it } from 'vitest';
import { previewNeighborhoodUpdate, validateEditorDeliveryTimes } from './neighborhoodEditorHelpers';
import { flattenGroups, groupNeighborhoods, materializeNeighborhoodGroups } from './NeighborhoodTierEditor';

describe('neighborhood editor bulk updates', () => {
  const items = [
    { _id: 'a', nome: 'Centro', cidade: 'Resende', estado: 'RJ', valor: 5, deliveryTimeMin: 20, deliveryTimeMax: 30, observacao: 'Portaria', ativo: true },
    { _id: 'b', nome: 'Centro', cidade: 'Outra', estado: 'SP', valor: 8, bloqueado: true, ativo: true, observacao: 'Nao atender' },
    { _id: 'c', nome: 'Inativo', valor: 9, ativo: false },
  ];
  it('preserves blocked/inactive items, identity, city/state and metadata', () => {
    const result = previewNeighborhoodUpdate(items, { valor: '12', min: '10', max: '15' });
    expect(result[0]).toEqual({ ...items[0], valor: 12, deliveryTimeMin: 10, deliveryTimeMax: 15, tempo_estimado: '10-15 min' });
    expect(result[1]).toBe(items[1]);
    expect(result[2]).toBe(items[2]);
    expect(items[0].valor).toBe(5);
  });
  it('retains unspecified fields and accepts zero fee', () => {
    expect(previewNeighborhoodUpdate(items, { valor: '0', min: '', max: '' })[0]).toEqual({ ...items[0], valor: 0 });
    expect(previewNeighborhoodUpdate(items, { valor: '', min: '0', max: '0' })[0].valor).toBe(5);
  });
  it('preserves individual blocked and inactive metadata while editing a shared tier', () => {
    const sameTier = items.map((item) => ({ ...item, valor: 5, tempo_estimado: '20-30 min', deliveryTimeMin: 20, deliveryTimeMax: 30 }));
    const groups = groupNeighborhoods(sameTier);
    expect(groups).toHaveLength(1);
    const result = flattenGroups(groups.map((group) => ({ ...group, valor: 15, min: '5', max: '10', tempo_estimado: '5-10 min' })));
    expect(result[0]).toMatchObject({ _id: 'a', valor: 15, cidade: 'Resende', estado: 'RJ', ativo: true, observacao: 'Portaria', deliveryTimeMin: 5 });
    expect(result[1]).toMatchObject(sameTier[1]);
    expect(result[2]).toMatchObject(sameTier[2]);
  });
  it.each([
    { valor: '', min: '', max: '' }, { valor: '-1', min: '', max: '' },
    { valor: 'Infinity', min: '', max: '' }, { valor: '', min: '30', max: '20' },
    { valor: '', min: '20', max: '' }, { valor: '', min: '1.5', max: '20' },
  ])('rejects invalid drafts %j', (draft) => {
    expect(() => previewNeighborhoodUpdate(items, draft)).toThrow();
  });
});

describe('explicit delivery time opt-in validation', () => {
  it('does not require or reinterpret legacy total times', () => {
    expect(validateEditorDeliveryTimes({ tempo_entrega: '45-60 min' })).toBe('');
    expect(validateEditorDeliveryTimes({ prazo_entrega_modo: 'total' })).toBe('');
  });
  const valid = { prazo_entrega_modo: 'preparo_deslocamento', tempo_preparo_min: 10, tempo_preparo_max: 20, tempo_deslocamento_min: 5, tempo_deslocamento_max: 10 };
  it('accepts explicit numeric intervals', () => expect(validateEditorDeliveryTimes(valid)).toBe(''));
  it.each([null, '', -1, 30, 2.5, Infinity])('rejects invalid preparation minimum %j', (value) => {
    expect(validateEditorDeliveryTimes({ ...valid, tempo_preparo_min: value })).not.toBe('');
  });
});

describe('duplicate neighborhood identity regression', () => {
  it.each([5, 8])('retains every duplicate and its protection through two edits (fee %s)', (otherFee) => {
    const original = [
      { _id: 'blocked', nome: 'Centro', cidade: 'Resende', estado: 'RJ', valor: 5, bloqueado: true, ativo: true, observacao: 'Bloqueio explicito' },
      { _id: 'active', nome: 'Centro', cidade: 'Resende', estado: 'RJ', valor: otherFee, bloqueado: false, ativo: true, observacao: 'Outro cadastro' },
      { _id: 'inactive', nome: 'Centro', cidade: 'Resende', estado: 'RJ', valor: 5, ativo: false },
    ];
    const grouped = groupNeighborhoods(original);
    expect(grouped.flatMap((group) => group.bairros)).toHaveLength(3);
    const first = materializeNeighborhoodGroups(grouped.map((group) => ({ ...group, valor: 10 })));
    const second = materializeNeighborhoodGroups(first.groups.map((group) => ({ ...group, valor: 20 })));
    expect(second.items).toHaveLength(3);
    expect(second.items.find((item) => item._id === 'blocked')).toMatchObject(original[0]);
    expect(second.items.find((item) => item._id === 'inactive')).toMatchObject(original[2]);
    expect(second.items.find((item) => item._id === 'active')).toMatchObject({ ...original[1], valor: 20 });
  });
});
