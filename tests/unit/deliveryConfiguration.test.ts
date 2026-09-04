import { describe, expect, it } from 'vitest';
import { hasConfiguredDeliveryRates } from '../../src/lib/deliveryConfiguration';
import { settingsSchema } from '../../server/routes/tenantOperations';
import { publicSettingsDto } from '../../server/routes/public';

describe('delivery configuration without standalone distance bands', () => {
  it('rejects the removed mode and strips obsolete bands from settings updates', () => {
    expect(settingsSchema.safeParse({ tipo_taxa_entrega: 'km' }).success).toBe(false);
    expect(settingsSchema.parse({ tipo_taxa_entrega: 'bairro', faixas_entrega: [{ km_ate: 3, valor: 5 }] }))
      .not.toHaveProperty('faixas_entrega');
  });

  it.each(['bairro', 'fixa', 'regiao', 'bairro_regiao'])('keeps %s in the settings contract', (mode) => {
    expect(settingsSchema.safeParse({ tipo_taxa_entrega: mode }).success).toBe(true);
  });

  it('omits obsolete bands from the public catalog', () => {
    const dto = publicSettingsDto({ faixas_entrega: [{ km_ate: 3, valor: 5 }] });
    expect(dto).not.toHaveProperty('faixas_entrega');
    expect(dto.tipo_taxa_entrega).toBe('bairro');
  });

  it('does not mark unconfigured delivery as complete because fixed shipping defaults to zero', () => {
    expect(hasConfiguredDeliveryRates({ taxa_entrega_fixa: 0 })).toBe(false);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro', taxa_entrega_fixa: 0 })).toBe(false);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'fixa', taxa_entrega_fixa: 0 })).toBe(true);
  });

  it('requires usable neighborhoods or an explicitly configured fallback', () => {
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro', taxas_bairros: [
      { nome: 'Centro', valor: 5, ativo: false }, { nome: 'Outro', valor: 5, bloqueado: true },
    ] })).toBe(false);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro', taxas_bairros: [{ nome: 'Centro', valor: 5 }] })).toBe(true);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: 'bairro', taxa_bairro_padrao: 0 })).toBe(true);
  });

  it.each(['regiao', 'bairro_regiao'] as const)('requires publication for %s regardless of unrelated fees', (mode) => {
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: mode, taxa_entrega_fixa: 0, taxas_bairros: [{ nome: 'Centro', valor: 5 }] })).toBe(false);
    expect(hasConfiguredDeliveryRates({ tipo_taxa_entrega: mode, delivery_regions_publication: 'published' })).toBe(true);
  });
});
