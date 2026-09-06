import { describe, expect, it } from 'vitest';
import { buildAdminPath, parseAdminLocation } from '../../src/lib/adminNavigation';

describe('navegacao do painel administrativo', () => {
  it('restaura uma subaba valida da URL', () => {
    expect(parseAdminLocation('/loja-piloto/admin/loja', '?tab=entrega_pagamento')).toMatchObject({
      section: 'loja',
      storeTab: 'entrega_pagamento',
    });
  });

  it('ignora secoes e subabas desconhecidas', () => {
    expect(parseAdminLocation('/loja-piloto/admin/desconhecida', '?tab=invalida')).toEqual({
      section: 'dashboard',
      ordersTab: 'active',
      catalogTab: 'estrutura',
      storeTab: 'aparencia',
    });
  });

  it('omite a subaba padrao e codifica o slug', () => {
    expect(buildAdminPath('Loja Piloto', 'catalogo', 'estrutura')).toBe('/Loja%20Piloto/admin/catalogo');
    expect(buildAdminPath('Loja Piloto', 'catalogo', 'complementos')).toBe('/Loja%20Piloto/admin/catalogo?tab=complementos');
  });
});
