import { describe, expect, it } from 'vitest';
import { hasConfiguredDeliveryRates } from '../../src/lib/deliveryConfiguration';
import { settingsSchema } from '../../server/routes/tenantOperations';
import { publicSettingsDto } from '../../server/routes/public';

describe('unified delivery configuration', () => {
  it('rejects the removed mode and strips obsolete bands from settings updates', () => {
    expect(settingsSchema.safeParse({ tipo_taxa_entrega: 'km' }).success).toBe(false);
    expect(settingsSchema.parse({ tipo_taxa_entrega: 'bairro_regiao', faixas_entrega: [{ km_ate: 3, valor: 5 }] }))
      .not.toHaveProperty('faixas_entrega');
  });

  it.each(['fixa', 'bairro_regiao'])('keeps %s in the settings contract', (mode) => {
    expect(settingsSchema.safeParse({ tipo_taxa_entrega: mode }).success).toBe(true);
  });

  it('omits obsolete bands from the public catalog', () => {
    const dto = publicSettingsDto({ faixas_entrega: [{ km_ate: 3, valor: 5 }] });
    expect(dto).not.toHaveProperty('faixas_entrega');
    expect(dto.tipo_taxa_entrega).toBe('bairro_regiao');
  });

  it('does not mark unconfigured delivery as complete because fixed shipping defaults to zero', () => {
    expect(hasConfiguredDeliveryRates({ taxa_entrega_fixa: 0 })).toBe(false);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro_regiao', taxa_entrega_fixa: 0 })).toBe(false);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'fixa', taxa_entrega_fixa: 0 })).toBe(true);
  });

  it('requires usable neighborhoods or an explicitly configured fallback', () => {
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro_regiao', taxas_bairros: [
      { nome: 'Centro', valor: 5, ativo: false }, { nome: 'Outro', valor: 5, bloqueado: true },
    ] })).toBe(false);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro_regiao', taxas_bairros: [{ nome: 'Centro', valor: 5 }] })).toBe(true);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro_regiao', taxa_bairro_padrao: 0, bloquear_bairros_nao_atendidos: false })).toBe(true);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro_regiao', taxa_bairro_padrao: 0, bloquear_bairros_nao_atendidos: true })).toBe(false);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro_regiao', bloquear_bairros_nao_atendidos: false })).toBe(false);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro_regiao', taxa_bairro_padrao: -1 })).toBe(false);
  });

  it('accepts only map, only neighborhoods or both in the integrated mode', () => {
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro_regiao', delivery_regions_publication: 'published' })).toBe(true);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro_regiao', delivery_regions_publication: 'published', taxas_bairros: [{ nome: 'Centro', valor: 5 }] })).toBe(true);
  });

  it.each(['bairro', 'regiao'])('rejects selecting legacy %s as a new mode', (mode) => {
    expect(settingsSchema.safeParse({ tipo_taxa_entrega: mode }).success).toBe(false);
  });

  it('does not count an inactive map as configured delivery', () => {
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro_regiao', delivery_regions_publication: 'published', delivery_regions_active_count: 0 })).toBe(false);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro_regiao', delivery_regions_publication: 'published', delivery_regions_active_count: 1 })).toBe(true);
  });

  it('does not activate dormant rules in legacy configuration readiness', () => {
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'regiao', taxas_bairros: [{ nome: 'Centro', valor: 5 }] })).toBe(false);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro', delivery_regions_publication: 'published' })).toBe(false);
  });
});
