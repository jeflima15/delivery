import type { StoreSettings } from '../types/storefront';

type DeliveryConfiguration = Pick<StoreSettings,
  'taxas_bairros' | 'taxa_bairro_padrao' |
  'bloquear_bairros_nao_atendidos' | 'taxa_entrega_fixa'
> & { tipo_taxa_entrega?: string; delivery_regions_publication?: string; delivery_regions_active_count?: number };

export function hasConfiguredDeliveryRates(settings: DeliveryConfiguration): boolean {
  const hasMap = Boolean(settings.delivery_regions_publication)
    && (settings.delivery_regions_active_count == null || settings.delivery_regions_active_count > 0);
  const hasNeighborhoods = Boolean(settings.taxas_bairros?.some((rate) => rate.ativo !== false && !rate.bloqueado));
  const hasFallback = settings.taxa_bairro_padrao != null
    && Number.isFinite(settings.taxa_bairro_padrao) && settings.taxa_bairro_padrao >= 0;
  switch (settings.tipo_taxa_entrega) {
    case 'bairro':
      return hasNeighborhoods || hasFallback;
    case 'fixa':
      return typeof settings.taxa_entrega_fixa === 'number'
        && Number.isFinite(settings.taxa_entrega_fixa) && settings.taxa_entrega_fixa >= 0;
    case 'regiao':
      return hasMap;
    case 'bairro_regiao':
      return hasNeighborhoods || hasMap
        || (settings.bloquear_bairros_nao_atendidos === false && hasFallback);
    default:
      return false;
  }
}
