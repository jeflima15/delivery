import { describe, expect, it } from 'vitest';
import { catalogAvailability } from '../../server/domain/catalogAvailability';
import { catalogItemUnavailable, normalizeCatalogSearch, adminAvailabilityLabel } from '../../src/lib/catalogPresentation';
import { purchaseReadiness } from '../../src/lib/purchaseReadiness';
import { cashEntryCents } from '../../src/lib/cashEntry';
import { catalogEditorPath, parseCatalogEditor } from '../../src/lib/adminNavigation';

describe('catalog availability and purchase guidance', () => {
  const component = { _id: 'p', ativo: true, controlar_estoque: true, estoque: 1 };
  it('counts repeated fixed components and never discloses stock', () => {
    const combo = { _id: 'c', tipo: 'combo', combo_mode: 'fixed', ativo: true, combo_itens_fixos: [{ produtoId: 'p', quantidade: 1 }, { produtoId: 'p', quantidade: 1 }] };
    expect(catalogAvailability(combo, [component])).toEqual({ purchasable: false, reason: 'components' });
    expect(catalogAvailability(combo, [{ ...component, estoque: 2 }]).purchasable).toBe(true);
  });
  it('checks stock jointly across choice stages without choosing for the customer', () => {
    const combo = { tipo: 'combo', combo_mode: 'stages', combo_etapas: [{ opcoes: [{ produtoId: 'p' }, { produtoId: 'q' }] }, { opcoes: [{ produtoId: 'p' }] }] };
    expect(catalogAvailability(combo, [component]).purchasable).toBe(false);
    expect(catalogAvailability(combo, [{ ...component, estoque: 2 }]).purchasable).toBe(true);
    expect(catalogAvailability(combo, [component, { ...component, _id: 'q' }]).purchasable).toBe(true);
  });
  it('does not allow inactive, sold-out or zero-stock products', () => {
    for (const product of [{ ...component, ativo: false }, { ...component, esgotado: true }, { ...component, estoque: 0 }]) expect(catalogAvailability(product, []).purchasable).toBe(false);
    expect(catalogItemUnavailable({ nome: 'Combo', preco: 10, tipo: 'combo', catalogAvailability: { purchasable: false, reason: 'components' } })).toBe(true);
    expect(adminAvailabilityLabel({ ativo: true, controlar_estoque: true, estoque: 0 })).toBe('Esgotado');
    expect(adminAvailabilityLabel({ ativo: false })).toBe('Oculto');
  });
  it('normalizes accents and repeated spaces', () => { expect(normalizeCatalogSearch('  AÇAÍ  com   leite ')).toBe('acai com leite'); });
  const input = { empty: false, conflictingModes: false, closed: false, canSchedule: false, deliveryMethod: 'delivery', hasAddress: true, calculating: false, pendingPin: false, needsQuote: false, outOfRange: false, belowMinimum: false };
  it('offers corrective actions instead of an unexplained disabled button', () => {
    expect(purchaseReadiness({ ...input, hasAddress: false }).action).toBe('address');
    expect(purchaseReadiness({ ...input, deliveryMethod: null }).action).toBe('method');
    expect(purchaseReadiness({ ...input, pendingPin: true, needsQuote: true }).action).toBe('pin');
    expect(purchaseReadiness({ ...input, calculating: true }).action).toBe('wait');
    expect(purchaseReadiness({ ...input, conflictingModes: true }).action).toBe('review');
    expect(purchaseReadiness({ ...input, closed: true, canSchedule: true }).action).toBe('checkout');
  });
  it('parses monetary cash entries and rejects ambiguous invalid input', () => {
    expect(cashEntryCents('1.000,00')).toBe(100000); expect(cashEntryCents('10,50')).toBe(1050); expect(cashEntryCents('10.50')).toBe(1050);
    for (const value of ['', '-1', 'dez', '1,000', '1.2.3']) expect(cashEntryCents(value)).toBeNull();
  });
  it('preserves list state across editor navigation', () => {
    const path = catalogEditorPath('/loja/admin/catalogo', '?tab=produtos&q=bolo&page=3', { kind: 'produto', id: '507f1f77bcf86cd799439012' });
    expect(path).toContain('page=3'); expect(path).toContain('q=bolo');
    expect(parseCatalogEditor(path.split('?')[1])).toEqual({ kind: 'produto', id: '507f1f77bcf86cd799439012' });
    expect(catalogEditorPath('/loja/admin/catalogo', path.split('?')[1], null)).toContain('page=3');
    expect(parseCatalogEditor('?editor=produto&id=invalid')).toBeNull();
  });
});

