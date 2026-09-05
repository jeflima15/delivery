import type { DeliveryRegionsDraft, StoreLocation } from '../../types/deliveryRegions';

export type SettingsSection = 'aparencia' | 'operacao' | 'entrega_pagamento' | 'promocoes_fidelidade';

type SettingsRecord = Record<string, any>;

const SECTION_FIELDS: Record<SettingsSection, readonly string[]> = {
  aparencia: [
    'nome_loja', 'tagline', 'sobre_texto', 'whatsapp', 'instagram_url',
    'logo_url', 'capa_url', 'logoShape', 'theme',
  ],
  operacao: [
    'is_open', 'tempo_entrega', 'abertura_automatica', 'mensagem_fechado',
    'horarios_funcionamento',
  ],
  entrega_pagamento: [
    'logisticsOptions', 'prazo_entrega_modo', 'tempo_preparo_min',
    'tempo_preparo_max', 'tempo_deslocamento_min', 'tempo_deslocamento_max',
    'cep_loja', 'rua_loja', 'numero_loja', 'bairro_loja', 'cidade_loja', 'estado_loja',
    'tipo_taxa_entrega', 'taxa_entrega_fixa', 'taxas_bairros', 'taxa_bairro_padrao',
    'bloquear_bairros_nao_atendidos', 'pedido_minimo', 'frete_gratis_acima_de',
    'talheres_ativo', 'talheres_valor', 'pagamento_pix', 'pagamento_cartao',
    'pagamento_cartao_credito', 'pagamento_cartao_debito', 'pagamento_dinheiro',
    'pagamento_vale_alimentacao', 'bandeiras_vale_alimentacao',
    'pagamento_vale_refeicao', 'bandeiras_vale_refeicao', 'chave_pix', 'instrucoes_pix',
  ],
  promocoes_fidelidade: [
    'banner_ativo', 'banner_texto', 'cupom_global_ativo', 'fidelidade_ativa',
    'pontos_por_real', 'valor_ponto_reais',
  ],
};

function pick(config: SettingsRecord, fields: readonly string[]) {
  return Object.fromEntries(fields.filter((field) => field in config).map((field) => [field, config[field]]));
}

export function buildAppearanceSettingsPayload(config: SettingsRecord) {
  return pick(config, SECTION_FIELDS.aparencia);
}

export function buildOperationSettingsPayload(config: SettingsRecord) {
  return pick(config, SECTION_FIELDS.operacao);
}

export function buildDeliverySettingsPayload(config: SettingsRecord) {
  return pick(config, SECTION_FIELDS.entrega_pagamento);
}

export function buildPromotionsSettingsPayload(config: SettingsRecord) {
  return pick(config, SECTION_FIELDS.promocoes_fidelidade);
}

export function buildSettingsPayload(section: SettingsSection, config: SettingsRecord) {
  if (section === 'aparencia') return buildAppearanceSettingsPayload(config);
  if (section === 'operacao') return buildOperationSettingsPayload(config);
  if (section === 'entrega_pagamento') return buildDeliverySettingsPayload(config);
  return buildPromotionsSettingsPayload(config);
}

function normalizeLocation(location: StoreLocation | null | undefined): StoreLocation | null {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  return {
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    confirmed: location.confirmed === true,
    ...(location.addressKey ? { addressKey: location.addressKey } : {}),
  };
}

export function normalizeDeliveryRegionsDraft(draft: DeliveryRegionsDraft): DeliveryRegionsDraft {
  const storeLocation = normalizeLocation(draft.storeLocation);
  const regions = Array.isArray(draft.regions) ? draft.regions : [];
  if (regions.some((region) => region.active !== false) && (!storeLocation || !storeLocation.confirmed)) {
    throw new Error('Localize e confirme a posição da loja antes de publicar regiões ativas.');
  }
  return { storeLocation, regions };
}
