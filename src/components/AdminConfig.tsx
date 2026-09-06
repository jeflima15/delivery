import React, { useState, useEffect, useRef } from 'react';
import { Settings, Store, Clock, Phone, Save, Truck, MapPin, Star, AlertCircle, DollarSign, CreditCard, QrCode, Banknote, Gift, Palette, RotateCcw, Copy, Sparkles, Building2 } from 'lucide-react';
import ImagePicker from './ImagePicker';
import { cn } from '../lib/utils';
import { useToast } from './Toast';
import { DEFAULT_STORE_THEME, createStoreTheme, isValidHexColor } from '../lib/theme';
import { BENEFIT_CARD_BRANDS } from '../lib/paymentMethods';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { getStoreStatusDetails, computeIsStoreOpen, scheduleEndsNextDay } from '../lib/storeStatus';
import NeighborhoodTierEditor from './tenant-admin/NeighborhoodTierEditor';
import { validateEditorDeliveryTimes } from './tenant-admin/neighborhoodEditorHelpers';
import { ApiError } from '../lib/api';
import { buildSettingsPayload, normalizeDeliveryRegionsDraft, type SettingsSection } from './tenant-admin/settingsPayload';

import type { DeliveryRegionsDraft } from '../types/deliveryRegions';

const DeliveryRegionMapEditor = React.lazy(() => import('./tenant-admin/DeliveryRegionMapEditor'));

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const SETTINGS_FIELD_LABELS: Record<string, string> = {
  nome_loja: 'Nome da loja', logo_url: 'Logo da loja', capa_url: 'Banner de capa',
  storeLocation: 'Localização da loja', deliveryRegions: 'Regiões de entrega',
  tempo_preparo_min: 'Tempo mínimo de preparo', tempo_preparo_max: 'Tempo máximo de preparo',
  bandeiras_vale_alimentacao: 'Bandeiras de vale-alimentação',
  bandeiras_vale_refeicao: 'Bandeiras de vale-refeição', theme: 'Cor principal',
};

function validUrlOrEmpty(value: unknown) {
  if (!String(value || '').trim()) return true;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function settingsErrorMessage(error: ApiError) {
  const entries = Object.entries(error.fieldErrors || {});
  if (!entries.length) return error.message;
  return entries.map(([field, messages]) => `${SETTINGS_FIELD_LABELS[field] || field}: ${messages.join(' ')}`).join('\n');
}

const PRESET_COLORS = [
  { name: 'Esmeralda', hex: '#059669' },
  { name: 'Azul', hex: '#2563EB' },
  { name: 'Roxo', hex: '#7C3AED' },
  { name: 'Laranja', hex: '#EA580C' },
  { name: 'Vermelho', hex: '#DC2626' },
  { name: 'Slate', hex: '#0F172A' },
];

export default function AdminConfig({
  token,
  onUnauthorized: _onUnauthorized,
  focusSection,
  onDirtyChange,
}: {
  token: string,
  onUnauthorized: () => void,
  focusSection?: 'aparencia' | 'operacao' | 'entrega_pagamento' | 'promocoes_fidelidade',
  onDirtyChange?: (dirty: boolean) => void,
}) {
  const api = useTenantAdminApi();
  const [config, setConfig] = useState<any>(null);
  const [initialConfig, setInitialConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState({ logo: false, cover: false });
  const [saveError, setSaveError] = useState<{ message: string; requestId?: string; fields: string[] } | null>(null);
  const saveErrorRef = useRef<HTMLDivElement>(null);
  const [storePostalCodeFeedback, setStorePostalCodeFeedback] = useState('');
  const [storePostalCodeLoading, setStorePostalCodeLoading] = useState(false);
  const storePostalCodeRequest = useRef(0);
  const [deliveryTab, setDeliveryTab] = useState<'bairros' | 'mapa'>('bairros');
  const [mapVisited, setMapVisited] = useState(false);
  const [mapDraft, setMapDraft] = useState<DeliveryRegionsDraft | null>(null);
  const [savedMap, setSavedMap] = useState<DeliveryRegionsDraft | null>(null);
  const [mapError, setMapError] = useState('');
  const [mapLoadError, setMapLoadError] = useState('');
  const [mapLoading, setMapLoading] = useState(false);
  const [mapResetKey, setMapResetKey] = useState(0);
  const legacyMode = useRef<string | undefined>(undefined);
  const settingsUpdatedAt = useRef<string | undefined>(undefined);
  const mapRequest = useRef<Promise<DeliveryRegionsDraft> | null>(null);
  const mapDirty = JSON.stringify(mapDraft) !== JSON.stringify(savedMap);
  const loadMap = async () => {
    if (mapDraft) return mapDraft;
    if (!mapRequest.current) {
      setMapLoading(true);
      setMapLoadError('');
      mapRequest.current = api.getDeliveryRegions().then((data) => {
        const draft = {
          storeLocation: data.storeLocation,
          regions: data.regions.map((region, priority) => ({
            ...region, priority, active: legacyMode.current === 'bairro' ? false : region.active,
          })),
        };
        setMapDraft(draft);
        setSavedMap(draft);
        return draft;
      }).catch((error) => {
        setMapLoadError(error instanceof Error ? error.message : 'Erro ao carregar mapa.');
        throw error;
      }).finally(() => { setMapLoading(false); mapRequest.current = null; });
    }
    return mapRequest.current;
  };
  const visitMap = () => {
    setDeliveryTab('mapa');
    setMapVisited(true);
    void loadMap().catch(() => {});
  };
  const [neighborhoodError, setNeighborhoodError] = useState('');
  const { showToast } = useToast();

  const draftKey = `podevir_config_draft_${token}`;
  const hasUnsavedChanges = initialConfig !== null && config !== null && (JSON.stringify(config) !== initialConfig || mapDirty || Boolean(mapError));

  useEffect(() => {
    let isMounted = true;
    const fetchConfig = async () => {
      try {
        const data = await api.getSettings();
        if (data.success && data.settings && isMounted) {
          legacyMode.current = String(data.settings.tipo_taxa_entrega || 'bairro_regiao');
          settingsUpdatedAt.current = typeof data.settings.updatedAt === 'string' ? data.settings.updatedAt : undefined;
          const logistics = data.settings.logisticsOptions;
          const logisticsObject = logistics && typeof logistics === 'object' ? logistics : {};
          const mappedConfig = {
            is_open: data.settings.is_open,
            tempo_entrega: data.settings.tempo_entrega || '45-60 min',
            prazo_entrega_modo: data.settings.prazo_entrega_modo || 'total',
            tempo_preparo_min: data.settings.tempo_preparo_min ?? 0,
            tempo_preparo_max: data.settings.tempo_preparo_max ?? 0,
            tempo_deslocamento_min: data.settings.tempo_deslocamento_min ?? 0,
            tempo_deslocamento_max: data.settings.tempo_deslocamento_max ?? 0,
            nome_loja: data.settings.nome_loja || 'Minha Loja',
            tagline: data.settings.tagline || 'Sabor & Qualidade',
            logo_url: data.settings.logo_url || '',
            capa_url: data.settings.capa_url || '',
            logoShape: data.settings.logoShape || 'squircle',
            theme: createStoreTheme(data.settings.theme),
            logisticsOptions: {
              allowPickup: !('allowPickup' in logisticsObject) || logisticsObject.allowPickup !== false,
              allowDelivery: !('allowDelivery' in logisticsObject) || logisticsObject.allowDelivery !== false,
              allowDineIn: 'allowDineIn' in logisticsObject && logisticsObject.allowDineIn === true,
            },
            sobre_texto: data.settings.sobre_texto || '',
            instagram_url: data.settings.instagram_url || '',
            whatsapp: data.settings.whatsapp || '',
            cep_loja: data.settings.cep_loja || '',
            rua_loja: data.settings.rua_loja || '',
            numero_loja: data.settings.numero_loja || '',
            bairro_loja: data.settings.bairro_loja || '',
            cidade_loja: data.settings.cidade_loja || '',
            estado_loja: data.settings.estado_loja || '',
            tipo_taxa_entrega: data.settings.tipo_taxa_entrega === 'fixa' ? 'fixa' : 'bairro_regiao',
            taxa_entrega_fixa: data.settings.taxa_entrega_fixa || 0,
            taxas_bairros: (Array.isArray(data.settings.taxas_bairros) ? data.settings.taxas_bairros : [])
              .filter(isRecord)
              .map((bairro) => ({ ...bairro, ativo: data.settings.tipo_taxa_entrega === 'regiao' ? false : bairro.ativo !== false })),
            taxa_bairro_padrao: data.settings.tipo_taxa_entrega === 'regiao' ? null : data.settings.taxa_bairro_padrao ?? null,
            bloquear_bairros_nao_atendidos: data.settings.tipo_taxa_entrega === 'regiao' || data.settings.bloquear_bairros_nao_atendidos !== false,
            abertura_automatica: data.settings.abertura_automatica || false,
            mensagem_fechado: data.settings.mensagem_fechado || 'Estamos fechados no momento.',
            horarios_funcionamento: data.settings.horarios_funcionamento || {
              domingo: { aberto: false, inicio: '18:00', fim: '23:30' },
              segunda: { aberto: false, inicio: '18:00', fim: '23:30' },
              terca:   { aberto: false, inicio: '18:00', fim: '23:30' },
              quarta:  { aberto: false, inicio: '18:00', fim: '23:30' },
              quinta:  { aberto: false, inicio: '18:00', fim: '23:30' },
              sexta:   { aberto: false, inicio: '18:00', fim: '23:30' },
              sabado:  { aberto: false, inicio: '18:00', fim: '23:30' }
            },
            pedido_minimo: data.settings.pedido_minimo || 0,
            frete_gratis_acima_de: data.settings.frete_gratis_acima_de || 0,
            talheres_ativo: data.settings.talheres_ativo === true,
            talheres_valor: data.settings.talheres_valor || 0,
            pagamento_pix: data.settings.pagamento_pix !== false,
            pagamento_cartao: data.settings.pagamento_cartao !== false,
            pagamento_cartao_credito: typeof data.settings.pagamento_cartao_credito === 'boolean'
              ? data.settings.pagamento_cartao_credito
              : data.settings.pagamento_cartao !== false,
            pagamento_cartao_debito: typeof data.settings.pagamento_cartao_debito === 'boolean'
              ? data.settings.pagamento_cartao_debito
              : data.settings.pagamento_cartao !== false,
            pagamento_dinheiro: data.settings.pagamento_dinheiro !== false,
            pagamento_vale_alimentacao: data.settings.pagamento_vale_alimentacao === true,
            bandeiras_vale_alimentacao: Array.isArray(data.settings.bandeiras_vale_alimentacao) ? data.settings.bandeiras_vale_alimentacao : [],
            pagamento_vale_refeicao: data.settings.pagamento_vale_refeicao === true,
            bandeiras_vale_refeicao: Array.isArray(data.settings.bandeiras_vale_refeicao) ? data.settings.bandeiras_vale_refeicao : [],
            chave_pix: data.settings.chave_pix || '',
            instrucoes_pix: data.settings.instrucoes_pix || '',
            banner_ativo: data.settings.banner_ativo || false,
            banner_texto: data.settings.banner_texto || '',
            fidelidade_ativa: data.settings.fidelidade_ativa || false,
            pontos_por_real: data.settings.pontos_por_real || 1,
            valor_ponto_reais: data.settings.valor_ponto_reais || 0.05,
            cupom_global_ativo: data.settings.cupom_global_ativo || false
          };

          setInitialConfig(JSON.stringify(mappedConfig));

          let restoredConfig = mappedConfig;
          try {
            const savedDraft = sessionStorage.getItem(draftKey);
            if (savedDraft) {
              const parsedDraft = JSON.parse(savedDraft);
              if (isRecord(parsedDraft)) {
                restoredConfig = { ...mappedConfig, ...parsedDraft };
                restoredConfig.tipo_taxa_entrega = parsedDraft.tipo_taxa_entrega === 'fixa' ? 'fixa' : 'bairro_regiao';
                if (parsedDraft.tipo_taxa_entrega === 'regiao') {
                  restoredConfig.taxas_bairros = (Array.isArray(parsedDraft.taxas_bairros) ? parsedDraft.taxas_bairros : [])
                    .filter(isRecord).map((bairro) => ({ ...bairro, ativo: false }));
                  restoredConfig.taxa_bairro_padrao = null;
                  restoredConfig.bloquear_bairros_nao_atendidos = true;
                }
              }
            }
          } catch {
            // ignore
          }

          setConfig(restoredConfig);
        }
      } catch {
        showToast('Erro ao carregar configurações', 'error');
      }
    };
    fetchConfig();
    return () => {
      isMounted = false;
    };
  }, [token, draftKey]);

  useEffect(() => {
    if (!config || !initialConfig) return;
    try {
      const isChanged = JSON.stringify(config) !== initialConfig;
      if (isChanged) {
        sessionStorage.setItem(draftKey, JSON.stringify(config));
      } else {
        sessionStorage.removeItem(draftKey);
      }
    } catch {
      // ignore
    }
  }, [config, initialConfig, draftKey]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
    return () => onDirtyChange?.(false);
  }, [hasUnsavedChanges, onDirtyChange]);

  const lookupStorePostalCode = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    const requestId = ++storePostalCodeRequest.current;
    setStorePostalCodeLoading(true);
    setStorePostalCodeFeedback('Buscando endereço...');
    try {
      const result = await api.lookupDeliveryPostalCode(cleanCep);
      if (requestId !== storePostalCodeRequest.current) return;
      setConfig((prev: any) => ({
        ...prev,
        cep_loja: cleanCep,
        rua_loja: result.address.street || prev.rua_loja,
        bairro_loja: result.address.district || prev.bairro_loja,
        cidade_loja: result.address.city || prev.cidade_loja,
        estado_loja: result.address.state || prev.estado_loja,
      }));
      setStorePostalCodeFeedback(result.address.scope === 'street'
        ? 'Endereço encontrado. Informe somente o número.'
        : result.address.scope === 'district'
          ? `Este CEP abrange o bairro ${result.address.district}. Complete rua e número.`
          : `Este é um CEP geral de ${result.address.city}/${result.address.state}. Complete rua, bairro e número.`);
    } catch (error) {
      if (requestId !== storePostalCodeRequest.current) return;
      setStorePostalCodeFeedback(error instanceof Error ? error.message : 'Não foi possível consultar o CEP.');
    } finally {
      if (requestId === storePostalCodeRequest.current) setStorePostalCodeLoading(false);
    }
  };

  const handleDiscard = () => {
    if (initialConfig) {
      try {
        const restored = JSON.parse(initialConfig);
        setConfig(restored);
        setNeighborhoodError('');
        setMapDraft(savedMap);
        setMapError('');
        setMapResetKey((key) => key + 1);
        sessionStorage.removeItem(draftKey);
        showToast('Alterações descartadas.', 'info');
      } catch {
        // ignore
      }
    }
  };

  const handleSave = async () => {
    if (!config || loading) return;
    setSaveError(null);
    if (selectedSection === 'aparencia') {
      if (imageUploading.logo || imageUploading.cover) {
        showToast('Aguarde o processamento das imagens antes de salvar.', 'error');
        return;
      }
      if (String(config.nome_loja || '').trim().length < 2) {
        setSaveError({ message: 'Informe um nome de loja com pelo menos 2 caracteres.', fields: ['nome_loja'] });
        return;
      }
      if (!validUrlOrEmpty(config.logo_url) || !validUrlOrEmpty(config.capa_url)) {
        setSaveError({ message: 'A URL da logo ou da capa não é válida. Envie a imagem novamente.', fields: ['logo_url', 'capa_url'] });
        return;
      }
      if (!isValidHexColor(String(config.theme?.primaryColor || ''))) {
        setSaveError({ message: 'Informe uma cor principal válida no formato hexadecimal, como #059669.', fields: ['theme'] });
        return;
      }
    }
    if (selectedSection === 'entrega_pagamento') {
      if (mapLoading || (mapVisited && !mapDraft)) {
        showToast('Aguarde o carregamento do mapa ou tente novamente.', 'error');
        return;
      }
      if (mapError) { showToast(mapError, 'error'); return; }
      const timeError = validateEditorDeliveryTimes(config);
      const invalidNeighborhood = (config.taxas_bairros || []).some((b: any) =>
        !Number.isFinite(b.valor) || b.valor < 0 ||
        ((b.deliveryTimeMin != null || b.deliveryTimeMax != null) &&
          (!Number.isInteger(b.deliveryTimeMin) || !Number.isInteger(b.deliveryTimeMax) || b.deliveryTimeMin < 0 || b.deliveryTimeMax < b.deliveryTimeMin)));
      if (timeError || neighborhoodError || invalidNeighborhood) {
        showToast(timeError || neighborhoodError || 'Revise as taxas e os intervalos de prazo dos bairros.', 'error');
        return;
      }
    }
    setLoading(true);
    try {
      const rawHex = config.theme?.primaryColor?.trim() || '';
      const formattedHex = rawHex.startsWith('#') ? rawHex : (rawHex ? `#${rawHex}` : DEFAULT_STORE_THEME.primaryColor);
      const primaryColor = isValidHexColor(formattedHex) ? formattedHex : DEFAULT_STORE_THEME.primaryColor;

      const cleanedBairros = (config.taxas_bairros || [])
        .filter((b: any) => b && typeof b.nome === 'string' && b.nome.trim().length > 0)
        .map((b: any) => {
          const legacy = !b.cidade && b.nome.match(/^(.+?)\s*(?:\(([^)]+)\)| - (.+))$/);
          return {
            ...b,
            nome: legacy ? legacy[1].trim() : b.nome.trim(),
            cidade: String(b.cidade || legacy?.[2] || legacy?.[3] || config.cidade_loja || '').trim(),
            estado: String(b.estado || config.estado_loja || '').trim().toUpperCase().slice(0, 2),
            valor: typeof b.valor === 'number' ? b.valor : (parseFloat(b.valor) || 0),
            tempo_estimado: (b.tempo_estimado || '').trim(),
            ativo: b.ativo !== false,
          };
        });

      // Omission preserves an unvisited publication; the backend also handles
      // legacy bairro migration without activating its dormant map.
      const deliveryRegions = selectedSection === 'entrega_pagamento' && mapDirty && mapDraft
        ? normalizeDeliveryRegionsDraft(mapDraft)
        : undefined;
      if (selectedSection === 'entrega_pagamento' && config.tipo_taxa_entrega === 'bairro_regiao' && config.bloquear_bairros_nao_atendidos === false) {
        // Read coverage only when needed; this never mounts or geocodes the map.
        const coverage = deliveryRegions || (legacyMode.current === 'bairro' ? { regions: [] } : await api.getDeliveryRegions());
        if (!coverage.regions.some((region) => region.active) &&
            (config.taxa_bairro_padrao == null || !Number.isFinite(config.taxa_bairro_padrao) || config.taxa_bairro_padrao < 0)) {
          showToast('Informe uma taxa padrão válida. Para entrega grátis, digite 0.', 'error');
          return;
        }
      }
      const normalizedConfig = {
        ...config,
        taxas_bairros: cleanedBairros,
        nome_loja: String(config.nome_loja || '').trim(),
        whatsapp: String(config.whatsapp || '').trim(),
        instagram_url: String(config.instagram_url || '').trim(),
        pagamento_cartao: Boolean(config.pagamento_cartao_credito || config.pagamento_cartao_debito),
        theme: createStoreTheme({
          ...(typeof config.theme === 'object' ? config.theme : {}),
          primaryColor,
        }),
      };
      const payload = buildSettingsPayload(selectedSection as SettingsSection, normalizedConfig);

      const data = await api.updateSettings({ ...payload, expectedSettingsUpdatedAt: settingsUpdatedAt.current, ...(deliveryRegions ? { deliveryRegions } : {}) });
      if (data.success) {
        if (isRecord(data.settings) && typeof data.settings.updatedAt === 'string') settingsUpdatedAt.current = data.settings.updatedAt;
        const baseline = isRecord(initialConfig) ? initialConfig : JSON.parse(initialConfig || '{}');
        const nextBaseline = { ...baseline, ...payload };
        setConfig((current: typeof config) => current === config ? { ...current, ...payload } : current);
        if (selectedSection === 'entrega_pagamento') legacyMode.current = normalizedConfig.tipo_taxa_entrega;
        if (deliveryRegions) setSavedMap(deliveryRegions);
        setMapResetKey((key) => key + 1);
        setInitialConfig(JSON.stringify(nextBaseline));
        try {
          sessionStorage.removeItem(draftKey);
        } catch {
          // A storage failure must not undo a successful server save.
        }
        showToast('Configurações salvas com sucesso', 'success');
      } else {
        showToast('message' in data && typeof data.message === 'string' ? data.message : 'Erro ao salvar', 'error');
      }
    } catch (error) {
      const message = error instanceof ApiError ? settingsErrorMessage(error) : error instanceof Error ? error.message : 'Erro ao salvar';
      const fields = error instanceof ApiError ? Object.keys(error.fieldErrors || {}) : [];
      setSaveError({ message, requestId: error instanceof ApiError ? error.requestId : undefined, fields });
      if (fields.some((field) => field === 'storeLocation' || field.startsWith('deliveryRegions'))) visitMap();
      showToast(message.split('\n')[0], 'error');
      window.setTimeout(() => saveErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    } finally {
      setLoading(false);
    }
  };

  const toggleBenefitBrand = (field: 'bandeiras_vale_alimentacao' | 'bandeiras_vale_refeicao', brand: string) => {
    setConfig((current: any) => {
      const currentBrands = current[field] || [];
      const nextBrands = currentBrands.includes(brand)
        ? currentBrands.filter((item: string) => item !== brand)
        : [...currentBrands, brand];
      return { ...current, [field]: nextBrands };
    });
  };

  const copySundayScheduleToAll = () => {
    const sunday = config.horarios_funcionamento?.domingo;
    if (!sunday) return;

    setConfig((current: any) => ({
      ...current,
      horarios_funcionamento: Object.keys(current.horarios_funcionamento || {}).reduce((next, day) => ({
        ...next,
        [day]: { ...sunday },
      }), {}),
    }));
    showToast('Horário de domingo copiado para todos os dias.', 'success');
  };

  const selectedSection = focusSection || 'aparencia';
  const showOperationSection = selectedSection === 'operacao';
  const showAppearanceSection = selectedSection === 'aparencia';
  const showDeliverySection = selectedSection === 'entrega_pagamento';
  const showPromotionsSection = selectedSection === 'promocoes_fidelidade';
  const themePreview = createStoreTheme(config?.theme || DEFAULT_STORE_THEME);
  const updatePrimaryColor = (value: string) => {
    setConfig((prev) => ({
      ...prev,
      theme: isValidHexColor(value)
        ? createStoreTheme({ primaryColor: value })
        : { ...prev.theme, primaryColor: value },
    }));
  };
  const sectionMeta = {
    aparencia: {
      title: 'Aparência da Loja',
      subtitle: 'Identidade visual, contato e apresentação principal da loja.',
    },
    operacao: {
      title: 'Operação da Loja',
      subtitle: 'Status, horários e funcionamento do dia a dia da loja.',
    },
    entrega_pagamento: {
      title: 'Entrega e Pagamento',
      subtitle: 'Endereço, logística, taxas, pedido mínimo e meios de pagamento.',
    },
    promocoes_fidelidade: {
      title: 'Promoções e Fidelidade',
      subtitle: 'Pontos, banner promocional e comunicação comercial da loja.',
    },
    default: {
      title: 'Configurações',
      subtitle: 'Gestão operacional e visual da sua loja',
    },
  } as const;
  const currentMeta = sectionMeta[selectedSection] || sectionMeta.default;
  const saveDisabled = loading || imageUploading.logo || imageUploading.cover;

  if (!config) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-gray-500">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  const logoShapeClasses = config.logoShape === 'circle' ? 'rounded-full' : 'rounded-2xl';

  return (
    <fieldset disabled={loading} aria-busy={loading} className="min-w-0 pb-36 md:pb-28">
      <div inert={loading} className="min-w-0 space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
            <Settings className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold leading-5 text-slate-900">{currentMeta.title}</h2>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-slate-500 sm:text-xs">{currentMeta.subtitle}</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saveDisabled}
          className="hidden h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60 md:flex"
        >
          {saveDisabled ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
          {imageUploading.logo || imageUploading.cover ? 'Processando imagem...' : loading ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>

      {saveError && <div ref={saveErrorRef} role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-800 shadow-2xs">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Não foi possível salvar esta página.</p>
            <p className="mt-1 whitespace-pre-line text-xs leading-relaxed">{saveError.message}</p>
            {saveError.requestId && <details className="mt-2 text-[11px] text-red-700"><summary className="cursor-pointer font-semibold">Detalhes técnicos</summary><code className="mt-1 block">Request ID: {saveError.requestId}</code></details>}
          </div>
        </div>
      </div>}

      <div className="space-y-4">
        {/* SEÇÃO INTEGRADA: OPERAÇÃO & HORÁRIOS (STITCH) */}
        {showOperationSection && (() => {
          const statusDetails = config ? getStoreStatusDetails(config) : { isOpen: false, text: 'Carregando...', tone: 'neutral' };
          const effectiveIsOpen = statusDetails.isOpen;
          return (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-900">Status manual e prazos</h3>
                </div>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', effectiveIsOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                  <span className={cn('h-2 w-2 rounded-full', effectiveIsOpen ? 'bg-emerald-500' : 'bg-red-500')} />
                  {effectiveIsOpen ? 'Loja aberta' : 'Loja fechada'}
                  {config.abertura_automatica && (
                    <span className="text-[10px] text-slate-500 font-normal">({statusDetails.text})</span>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Status da loja</p>
                    <p className="mt-1 text-[11px] text-slate-500">Alterna a visibilidade da vitrine agora.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const willBeOpen = !effectiveIsOpen;
                      setConfig({
                        ...config,
                        is_open: willBeOpen,
                        // Se estiver fechando manualmente em horário programado, desativa automático para respeitar a decisão do lojista
                        abertura_automatica: willBeOpen ? config.abertura_automatica : false,
                      });
                    }}
                    className={cn(
                      'shrink-0 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors',
                      effectiveIsOpen ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                    )}
                  >
                    {effectiveIsOpen ? 'Fechar loja' : 'Abrir loja'}
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Tempo de entrega estimado</label>
                  <input type="text" value={config.tempo_entrega} onChange={(e) => setConfig({ ...config, tempo_entrega: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="Ex: 30-45 min" />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-700">Mensagem para clientes quando a loja estiver fechada</label>
                <textarea rows={2} value={config.mensagem_fechado} onChange={(e) => setConfig({ ...config, mensagem_fechado: e.target.value })} className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="Ex: Estamos fechados no momento. Abrimos às 18:00!" />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Horários de funcionamento semanal</h3>
                  <p className="mt-1 text-[11px] text-slate-500">Configure a grade de atendimento para cada dia. Horários que passam da meia-noite são identificados automaticamente.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={config.abertura_automatica} onChange={(e) => setConfig({ ...config, abertura_automatica: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                    <span className="text-xs font-medium text-slate-800">Abertura automática</span>
                  </label>
                  <button type="button" onClick={copySundayScheduleToAll} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100">
                    <Copy className="h-3 w-3" /> Copiar domingo p/ todos
                  </button>
                </div>
              </div>
              {config.abertura_automatica && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <span className="font-bold">Abertura automática ativa:</span> o sistema abre e fecha a loja seguindo a grade semanal abaixo.
                    <div className="mt-0.5 text-[11px] font-medium text-amber-800">
                      Status atual no horário de Brasília: <strong className={effectiveIsOpen ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>{statusDetails.text}</strong> ({effectiveIsOpen ? 'Vitrine aberta' : 'Vitrine fechada'}).
                    </div>
                  </div>
                </div>
              )}
              <div className="divide-y divide-slate-100">
                {[
                  { key: 'domingo', label: 'Domingo' }, { key: 'segunda', label: 'Segunda-feira' },
                  { key: 'terca', label: 'Terça-feira' }, { key: 'quarta', label: 'Quarta-feira' },
                  { key: 'quinta', label: 'Quinta-feira' }, { key: 'sexta', label: 'Sexta-feira' }, { key: 'sabado', label: 'Sábado' },
                ].map((day) => {
                  const dayConfig = config.horarios_funcionamento[day.key] || { aberto: false, inicio: '18:00', fim: '23:30' };
                  return (
                    <div key={day.key} className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center">
                      <label className="flex w-40 items-center gap-3">
                        <input type="checkbox" checked={dayConfig.aberto} onChange={(e) => setConfig((prev: any) => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [day.key]: { ...dayConfig, aberto: e.target.checked } } }))} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                        <span className={cn('text-xs font-semibold', dayConfig.aberto ? 'text-slate-900' : 'text-slate-400')}>{day.label}</span>
                      </label>
                      {dayConfig.aberto ? (
                        <div className="flex max-w-xs flex-1 flex-col items-stretch gap-1.5">
                          <div className="flex items-center gap-2">
                            <input type="time" value={dayConfig.inicio} onChange={(e) => setConfig((prev: any) => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [day.key]: { ...dayConfig, inicio: e.target.value } } }))} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-mono font-semibold text-slate-800 outline-none focus:border-emerald-500" />
                            <span className="text-xs font-medium text-slate-400">às</span>
                            <input type="time" value={dayConfig.fim} onChange={(e) => setConfig((prev: any) => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [day.key]: { ...dayConfig, fim: e.target.value } } }))} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-mono font-semibold text-slate-800 outline-none focus:border-emerald-500" />
                          </div>
                          {scheduleEndsNextDay(dayConfig) && (
                            <span className="self-end rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
                              Termina no dia seguinte
                            </span>
                          )}
                        </div>
                      ) : <span className="text-xs italic text-slate-400">Fechado neste dia</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
          );
        })()}
        {/* IDENTIDADE & CONTATO */}
        {showAppearanceSection && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-7">
              <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <Store className="h-3.5 w-3.5 text-emerald-600" />
                  <h3 className="text-xs font-bold text-slate-900">Informações básicas</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Nome fantasia da loja</label>
                    <input type="text" value={config.nome_loja} onChange={(e) => setConfig({ ...config, nome_loja: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="Ex: Burger House" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Subtítulo / tagline</label>
                    <input type="text" value={config.tagline} onChange={(e) => setConfig({ ...config, tagline: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="Ex: Sabor e qualidade em cada pedido" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Sobre a loja</label>
                    <textarea rows={3} value={config.sobre_texto} onChange={(e) => setConfig({ ...config, sobre_texto: e.target.value })} className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="Apresente sua história, valores ou diferenciais culinários..." />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <Phone className="h-3.5 w-3.5 text-emerald-600" />
                  <h3 className="text-xs font-bold text-slate-900">Contato e redes sociais</h3>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">WhatsApp de atendimento</label>
                    <input type="text" value={config.whatsapp} onChange={(e) => setConfig({ ...config, whatsapp: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="11 99999-8888" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Instagram da loja</label>
                    <input type="text" value={config.instagram_url} onChange={(e) => setConfig({ ...config, instagram_url: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="@sualoja" />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <Palette className="h-3.5 w-3.5 text-emerald-600" />
                    <h3 className="text-xs font-bold text-slate-900">Identidade visual e cores</h3>
                  </div>
                  <button type="button" onClick={() => setConfig((prev) => ({ ...prev, theme: DEFAULT_STORE_THEME }))} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900">
                    <RotateCcw className="h-3 w-3" /> Redefinir
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Formato do logo na vitrine</label>
                    <select value={config.logoShape} onChange={(e) => setConfig({ ...config, logoShape: e.target.value as 'circle' | 'squircle' })} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500">
                      <option value="squircle">Quadrado suave</option>
                      <option value="circle">Círculo perfeito</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-700">Cor principal (HEX)</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={isValidHexColor(config.theme.primaryColor) ? themePreview.primaryColor : DEFAULT_STORE_THEME.primaryColor} onChange={(e) => updatePrimaryColor(e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5" aria-label="Selecionar cor principal da loja" />
                      <input type="text" value={config.theme.primaryColor} onChange={(e) => updatePrimaryColor(e.target.value)} className={cn('h-9 flex-1 rounded-lg border px-3 text-xs font-mono font-semibold uppercase outline-none transition-all', isValidHexColor(config.theme.primaryColor) ? 'border-slate-200 bg-slate-50/50 focus:border-emerald-500 focus:bg-white' : 'border-red-300 bg-red-50 text-red-700')} placeholder="#059669" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Atalhos:</span>
                      {PRESET_COLORS.map((preset) => (
                        <button key={preset.hex} type="button" onClick={() => updatePrimaryColor(preset.hex)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50">
                          <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: preset.hex }} />
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="flex flex-col gap-4 lg:col-span-5">
              <section className="order-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">Prévia do topo da vitrine</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    <Sparkles className="h-3 w-3 text-amber-500" /> Ao vivo
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
                  <div className="relative h-28 overflow-hidden bg-slate-200">
                    {config.capa_url ? <img src={config.capa_url} alt="Prévia da capa da loja" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-linear-to-r from-slate-800 to-slate-900" />}
                    <span className={cn('absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm', computeIsStoreOpen(config) ? 'bg-emerald-600' : 'bg-red-600')}>{computeIsStoreOpen(config) ? 'Aberto' : 'Fechado'}</span>
                  </div>
                  <div className="relative p-4 pt-0">
                    <div className="-mt-8 mb-3 flex items-end justify-between">
                      <div className={cn('h-16 w-16 overflow-hidden border-2 border-white bg-white shadow-md', logoShapeClasses)}>
                        {config.logo_url ? <img src={config.logo_url} alt="Logo da loja" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-slate-100 text-xs font-semibold text-slate-400">Logo</div>}
                      </div>
                    </div>
                    <h4 className="text-base font-semibold leading-tight text-slate-900">{config.nome_loja || 'Nome da loja'}</h4>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{config.tagline || 'Sua frase comercial ou nicho'}</p>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-3">
                      <div className="text-[11px] text-slate-500">Entrega: <strong className="text-slate-800">{config.tempo_entrega}</strong></div>
                      <span style={{ backgroundColor: themePreview.primaryColor, color: themePreview.primaryTextColor }} className="rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm">Ver cardápio</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className={cn('rounded-xl border bg-white p-4 shadow-2xs', saveError?.fields.includes('logo_url') ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200/80')}>
                <label className="mb-1 block text-xs font-semibold text-slate-900">Logo da loja</label>
                <p className="mb-3 text-[11px] text-slate-500">Recomendado em formato quadrado (400 x 400 px).</p>
                <ImagePicker compact value={config.logo_url} onChange={(url) => setConfig({ ...config, logo_url: url })} onUploadStatus={(uploading) => setImageUploading((current) => ({ ...current, logo: uploading }))} width={400} height={400} aspect={1} bucket="loja" path="identidade" />
              </section>

              <section className={cn('rounded-xl border bg-white p-4 shadow-2xs', saveError?.fields.includes('capa_url') ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200/80')}>
                <label className="mb-1 block text-xs font-semibold text-slate-900">Banner de capa</label>
                <p className="mb-3 text-[11px] text-slate-500">Proporção recomendada: 1265 x 460 px.</p>
                <ImagePicker compact value={config.capa_url} onChange={(url) => setConfig({ ...config, capa_url: url })} onUploadStatus={(uploading) => setImageUploading((current) => ({ ...current, cover: uploading }))} width={1265} height={460} aspect={1265 / 460} bucket="loja" path="identidade" />
              </section>
            </div>
          </div>
        )}
        {showDeliverySection && (
          <div className="space-y-6">
          <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
           <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <Truck className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Modalidades de logística</h3>
           </div>

           <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="mb-4 flex items-center gap-2.5">
                 <Truck className="h-4 w-4 text-emerald-600" />
                 <div>
                    <h4 className="text-xs font-bold text-slate-900">Como a loja atende</h4>
                    <p className="mt-0.5 text-[11px] text-slate-500">Controla as opções disponíveis na sacola.</p>
                 </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                 <label className={cn(
                    "flex items-center justify-between rounded-xl border p-3.5 cursor-pointer transition-all",
                    config.logisticsOptions.allowPickup ? "border-emerald-500/40 bg-emerald-50/20" : "border-slate-200 bg-slate-50"
                 )}>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Retirada no balcão</p>
                      <p className="text-[10px] text-slate-500">Cliente retira no balcão da loja.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.logisticsOptions.allowPickup}
                      onChange={(e) => setConfig({
                        ...config,
                        logisticsOptions: {
                          ...config.logisticsOptions,
                          allowPickup: e.target.checked,
                        },
                      })}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                 </label>
                 <label className={cn(
                    "flex items-center justify-between rounded-xl border p-3.5 cursor-pointer transition-all",
                    config.logisticsOptions.allowDelivery ? "border-emerald-500/40 bg-emerald-50/20" : "border-slate-200 bg-slate-50"
                 )}>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Entrega em domicílio</p>
                      <p className="text-[10px] text-slate-500">Taxas por bairro, regiões no mapa ou valor fixo.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.logisticsOptions.allowDelivery}
                      onChange={(e) => setConfig({
                        ...config,
                        logisticsOptions: {
                          ...config.logisticsOptions,
                          allowDelivery: e.target.checked,
                        },
                      })}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                 </label>
                 <label className={cn(
                    "flex items-center justify-between rounded-xl border p-3.5 cursor-pointer transition-all",
                    config.logisticsOptions.allowDineIn ? "border-emerald-500/40 bg-emerald-50/20" : "border-slate-200 bg-slate-50"
                 )}>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Comer no local</p>
                      <p className="text-[10px] text-slate-500">Consumir nas mesas/salão.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(config.logisticsOptions.allowDineIn)}
                      onChange={(e) => setConfig({
                        ...config,
                        logisticsOptions: {
                          ...config.logisticsOptions,
                          allowDineIn: e.target.checked,
                        },
                      })}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                 </label>
              </div>
           </div>

           <div className="space-y-4 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-slate-900">Endereço de origem da loja</h4>
              </div>
           <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <div className="sm:col-span-2">
                 <label className="block text-[11px] font-semibold text-slate-700">CEP</label>
                 <input type="text" value={config.cep_loja} onChange={(e) => { const cep = e.target.value.replace(/\D/g, '').slice(0, 8); setConfig({ ...config, cep_loja: cep }); setStorePostalCodeFeedback(''); if (cep.length === 8) void lookupStorePostalCode(cep); }} inputMode="numeric" autoComplete="postal-code" maxLength={8} placeholder="00000000" className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500" />
              </div>
              <div className="sm:col-span-3">
                 <label className="block text-[11px] font-semibold text-slate-700">Rua / logradouro</label>
                 <input type="text" value={config.rua_loja} onChange={(e) => setConfig({ ...config, rua_loja: e.target.value })} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500" />
              </div>
              <div className="sm:col-span-1">
                 <label className="block text-[11px] font-semibold text-slate-700">Número</label>
                 <input type="text" value={config.numero_loja} onChange={(e) => setConfig({ ...config, numero_loja: e.target.value })} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500" />
              </div>
              <div className="sm:col-span-2">
                 <label className="block text-[11px] font-semibold text-slate-700">Bairro</label>
                 <input type="text" value={config.bairro_loja} onChange={(e) => setConfig({ ...config, bairro_loja: e.target.value })} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500" />
              </div>
              <div className="sm:col-span-3">
                 <label className="block text-[11px] font-semibold text-slate-700">Cidade</label>
                 <input type="text" value={config.cidade_loja} onChange={(e) => setConfig({ ...config, cidade_loja: e.target.value })} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500" />
              </div>
              <div className="sm:col-span-1">
                 <label className="block text-[11px] font-semibold text-slate-700">UF</label>
                 <input type="text" value={config.estado_loja} maxLength={2} onChange={(e) => setConfig({ ...config, estado_loja: e.target.value.toUpperCase() })} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-center text-xs font-medium uppercase text-slate-900 outline-none focus:border-emerald-500" />
              </div>
           </div>
           {storePostalCodeFeedback && <p aria-live="polite" className={cn('text-[11px] font-medium', storePostalCodeLoading ? 'text-slate-500' : 'text-sky-700')}>{storePostalCodeFeedback}</p>}
           </div>
           </div>

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="border-b border-slate-100 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-emerald-600" />
                  Modelo de Cobrança de Entrega
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">Escolha como o sistema calculará o valor do frete para os clientes.</p>
              </div>

              {/* Seletor de Modelo */}
              <div className="flex flex-wrap rounded-xl bg-slate-100 p-1 text-xs">
                <button type="button" onClick={() => setConfig({ ...config, tipo_taxa_entrega: 'bairro_regiao' })}
                  className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all cursor-pointer', config.tipo_taxa_entrega === 'bairro_regiao' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900')}>
                  <Building2 className="h-3.5 w-3.5" /> Bairros + mapa
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, tipo_taxa_entrega: 'fixa' })}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all cursor-pointer',
                    config.tipo_taxa_entrega === 'fixa'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Taxa Fixa
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-[11px] text-slate-600">
            {config.tipo_taxa_entrega === 'bairro_regiao' && <><strong className="text-slate-800">Bairros primeiro:</strong> a regra ativa do bairro vence, inclusive sobre bloqueios no mapa. Sem bairro correspondente, o mapa é consultado. Use só bairros, só mapa ou ambos. Trocar de aba não altera regras.</>}
            {config.tipo_taxa_entrega === 'fixa' && <><strong className="text-slate-800">Taxa única:</strong> cobre o mesmo valor nos endereços da cidade e UF da loja.</>}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h4 className="text-sm font-bold text-slate-800">Composição do prazo de entrega</h4>
            <p className="text-xs text-slate-600">Por padrão, os prazos cadastrados são totais. Antes de ativar preparo + deslocamento, revise os prazos existentes nos bairros e no mapa: eles passarão a representar apenas deslocamento. Não some preparo a um prazo que já o inclui.</p>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={config.prazo_entrega_modo === 'preparo_deslocamento'} onChange={(e) => {
                if (e.target.checked && !window.confirm('Você revisou os prazos existentes de bairros e regiões para que representem somente deslocamento? Ao ativar e salvar, o preparo será somado a esses prazos. Os valores antigos não serão convertidos automaticamente.')) return;
                setConfig({ ...config, prazo_entrega_modo: e.target.checked ? 'preparo_deslocamento' : 'total' });
              }} /> Usar preparo + deslocamento (ativação opcional)
            </label>
            {config.prazo_entrega_modo === 'preparo_deslocamento' ? <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['tempo_preparo_min', 'Preparo mínimo (min)'], ['tempo_preparo_max', 'Preparo máximo (min)'],
                  ['tempo_deslocamento_min', 'Deslocamento mínimo (min)'], ['tempo_deslocamento_max', 'Deslocamento máximo (min)'],
                ].map(([field, label]) => <label key={field} className="text-xs font-semibold text-slate-700">
                  {label}
                  <input type="number" min="0" step="1" value={config[field] ?? ''} onChange={(e) => setConfig({ ...config, [field]: e.target.value === '' ? null : Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" />
                </label>)}
              </div>
              <p className="text-xs text-slate-600">O total é preparo + deslocamento. O deslocamento padrão acima é usado na taxa fixa e em bairros sem prazo próprio. Os campos devem conter minutos inteiros; mínimo não pode superar máximo.</p>
              {validateEditorDeliveryTimes(config) && <p role="alert" className="text-sm text-red-700">{validateEditorDeliveryTimes(config)}</p>}
            </> : <p className="text-xs text-slate-600">Prazo total: os valores atuais continuam sem acréscimo de preparo.</p>}
          </div>

          {config.tipo_taxa_entrega === 'bairro_regiao' && <div role="tablist" aria-label="Regras de entrega" className="flex gap-2">
            {(['bairros', 'mapa'] as const).map((tab) => <button key={tab} type="button" role="tab"
              id={`delivery-tab-${tab}`} aria-controls={`delivery-panel-${tab}`} aria-selected={deliveryTab === tab}
              tabIndex={deliveryTab === tab ? 0 : -1}
              onKeyDown={(event) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  const next = event.key === 'Home' ? 'bairros' : event.key === 'End' ? 'mapa' : deliveryTab === 'bairros' ? 'mapa' : 'bairros';
                  if (next === 'mapa') visitMap(); else setDeliveryTab(next);
                  document.getElementById(`delivery-tab-${next}`)?.focus();
                }
              }}
              onClick={() => tab === 'mapa' ? visitMap() : setDeliveryTab(tab)}
              className={cn('rounded-lg px-4 py-2 text-sm font-bold', deliveryTab === tab ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700')}>
              {tab === 'bairros' ? 'Bairros' : 'Mapa'}
            </button>)}
          </div>}
          {/* 1. MODO POR BAIRRO */}
          {config.tipo_taxa_entrega === 'bairro_regiao' && (
            <div role="tabpanel" id="delivery-panel-bairros" aria-labelledby="delivery-tab-bairros" hidden={deliveryTab !== 'bairros'} className="space-y-4">
              <NeighborhoodTierEditor
                taxasBairros={config.taxas_bairros || []}
                onChange={(updated) => setConfig({ ...config, taxas_bairros: updated })}
                cidadeLoja={config.cidade_loja}
                estadoLoja={config.estado_loja}
                prazoModo={config.prazo_entrega_modo}
                onValidationChange={setNeighborhoodError}
              />

              {/* Regra para bairros não listados */}
              {<div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Bairros não listados na tabela</p>
                    <p className="text-[11px] text-slate-500">Sem mapa ativo, defina o que acontece fora da lista. Com mapa ativo, suas regiões determinam a cobertura.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label="Bloquear bairros não listados quando não houver mapa ativo"
                      checked={config.bloquear_bairros_nao_atendidos !== false}
                      onChange={(e) => setConfig({ ...config, bloquear_bairros_nao_atendidos: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {config.bloquear_bairros_nao_atendidos !== false ? (
                  <p className="text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200/60 rounded-lg p-2">
                    🔒 Pedidos de bairros não cadastrados serão <strong>bloqueados com mensagem de aviso</strong> para o cliente.
                  </p>
                ) : (
                  <div className="pt-2 border-t border-slate-200 flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-slate-700">Taxa padrão para outros bairros (R$)</label>
                      <p className="text-[10px] text-slate-500">Obrigatória ao liberar bairros sem mapa ativo. Digite 0 explicitamente para entrega grátis.</p>
                    </div>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={config.taxa_bairro_padrao ?? ''}
                      onChange={(e) => setConfig({ ...config, taxa_bairro_padrao: e.target.value === '' ? null : parseFloat(e.target.value) || 0 })}
                      placeholder="Ex.: 10.00"
                      className="h-8 w-28 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>}
            </div>
          )}

          {/* 2. MODO TAXA FIXA */}
          {config.tipo_taxa_entrega === 'fixa' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Taxa Fixa / Única de Entrega</h4>
                <p className="text-[11px] text-slate-500">Será cobrado o mesmo valor dentro de {config.cidade_loja || 'sua cidade'}/{config.estado_loja || 'UF'}.</p>
              </div>
              <div className="max-w-xs">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Valor da Taxa de Entrega (R$)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={config.taxa_entrega_fixa || 0}
                    onChange={(e) => setConfig({ ...config, taxa_entrega_fixa: parseFloat(e.target.value) || 0 })}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {mapVisited && (
            <div role="tabpanel" id="delivery-panel-mapa" aria-labelledby="delivery-tab-mapa" hidden={deliveryTab !== 'mapa' || config.tipo_taxa_entrega !== 'bairro_regiao'} className="space-y-3">
            <p className="text-xs text-slate-600">Prazos no mapa: <strong>{config.prazo_entrega_modo === 'preparo_deslocamento' ? 'somente deslocamento, sem preparo' : 'prazo total, incluindo preparo'}</strong>. Bairros e mapa são salvos juntos em Salvar alterações.</p>
            <React.Suspense fallback={<div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Carregando editor de regiões...</div>}>
              {mapLoadError && <p role="alert">{mapLoadError} <button type="button" onClick={visitMap}>Tentar novamente</button></p>}
              {mapLoading && <p role="status">Carregando mapa...</p>}
              {mapDraft && <DeliveryRegionMapEditor
                estimateMode={config.prazo_entrega_modo}
                value={mapDraft}
                onChange={setMapDraft}
                onValidationChange={setMapError}
                resetKey={mapResetKey}
                visible={deliveryTab === 'mapa' && config.tipo_taxa_entrega === 'bairro_regiao'}
                address={{
                  postalCode: config.cep_loja,
                  street: config.rua_loja,
                  number: config.numero_loja,
                  district: config.bairro_loja,
                  city: config.cidade_loja,
                  state: config.estado_loja,
                }}
              />}
            </React.Suspense>
            </div>
          )}
        </div>

        {/* REGRAS COMERCIAIS & PAYMENTS */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
           <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                 <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">Regras comerciais de pedido</h3>
                 </div>
                 <div className="space-y-4">
                    <div>
                       <label className="mb-2 ml-1 block text-sm font-medium text-slate-700">Pedido mínimo obrigatório</label>
                       <div className="relative mt-1">
                          <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
                          <input type="number" step="0.5" value={config.pedido_minimo} onChange={(e) => setConfig({ ...config, pedido_minimo: parseFloat(e.target.value) || 0 })} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500" />
                       </div>
                    </div>
                    <div>
                       <label className="mb-2 ml-1 block text-sm font-medium text-slate-700">Frete grátis a partir de</label>
                       <div className="relative mt-1">
                          <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
                          <input type="number" step="0.5" value={config.frete_gratis_acima_de} onChange={(e) => setConfig({ ...config, frete_gratis_acima_de: parseFloat(e.target.value) || 0 })} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500" />
                       </div>
                       <p className="text-[10px] text-gray-400 font-bold italic mt-2">* Deixe 0 para desativar benefícios de frete grátis.</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
                        <span>Oferecer talheres descartáveis</span>
                        <input type="checkbox" checked={config.talheres_ativo || false} onChange={(e) => setConfig({ ...config, talheres_ativo: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                      </label>
                      <p className="mt-1 text-[10px] text-slate-500">Só aparece para o cliente se a sacola tiver um produto marcado como elegível.</p>
                      {config.talheres_ativo && (
                        <div className="mt-3">
                          <label className="mb-1 block text-[11px] font-semibold text-slate-700">Valor cobrado pelo kit <span className="font-normal text-slate-500">(R$ 0,00 = grátis)</span></label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
                            <input type="number" min="0" step="0.01" value={config.talheres_valor || 0} onChange={(e) => setConfig({ ...config, talheres_valor: parseFloat(e.target.value) || 0 })} className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500" />
                          </div>
                        </div>
                      )}
                    </div>
                 </div>
              </div>
           </div>

           <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                 <CreditCard className="h-4 w-4 text-emerald-600" />
                 <h3 className="text-sm font-bold text-slate-900">Formas de pagamento aceitas</h3>
              </div>
              <div className="space-y-2">
                 {[
                   { id: 'pagamento_pix', label: 'PIX / Comprovante', icon: QrCode, color: 'text-emerald-500', activeClass: 'border-emerald-500 bg-emerald-50 text-emerald-900' },
                   { id: 'pagamento_cartao_credito', label: 'Cartão de crédito', icon: CreditCard, color: 'text-amber-500', activeClass: 'border-amber-500 bg-amber-50 text-amber-900' },
                   { id: 'pagamento_cartao_debito', label: 'Cartão de débito', icon: CreditCard, color: 'text-blue-500', activeClass: 'border-blue-500 bg-blue-50 text-blue-900' },
                   { id: 'pagamento_dinheiro', label: 'Dinheiro (Em mãos)', icon: Banknote, color: 'text-purple-500', activeClass: 'border-purple-500 bg-purple-50 text-purple-900' },
                   { id: 'pagamento_vale_alimentacao', label: 'Vale-alimentação', icon: Gift, color: 'text-orange-500', activeClass: 'border-orange-400 bg-orange-50 text-orange-950' },
                   { id: 'pagamento_vale_refeicao', label: 'Vale-refeição', icon: Gift, color: 'text-sky-500', activeClass: 'border-sky-400 bg-sky-50 text-sky-950' }
                 ].map(method => (
                    <label key={method.id} className={cn(
                       "flex items-center justify-between rounded-xl border p-3 transition-all cursor-pointer",
                       config[method.id] ? "border-emerald-500/40 bg-emerald-50/20 text-slate-900" : "border-slate-200 bg-slate-50/50 text-slate-500"
                    )}>
                       <input type="checkbox" checked={config[method.id]} onChange={(e) => setConfig({
                         ...config,
                         [method.id]: e.target.checked,
                         ...(method.id === 'pagamento_vale_alimentacao' && !e.target.checked ? { bandeiras_vale_alimentacao: [] } : {}),
                         ...(method.id === 'pagamento_vale_refeicao' && !e.target.checked ? { bandeiras_vale_refeicao: [] } : {}),
                       })} className="order-2 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                       <div className="flex items-center gap-2.5">
                         <method.icon className={cn("h-4 w-4", config[method.id] ? "text-emerald-600" : method.color)} />
                         <span className="text-xs font-semibold text-slate-800">{method.label}</span>
                       </div>
                    </label>
                 ))}
              </div>
              {config.pagamento_pix && (
                 <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-4 animate-in zoom-in-95 duration-200">
                    <div>
                       <label className="block text-[9px] font-black uppercase text-emerald-800 mb-2">Chave PIX Oficial</label>
                       <input type="text" value={config.chave_pix} onChange={(e) => setConfig({...config, chave_pix: e.target.value})} className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-2 text-xs font-bold outline-none" placeholder="Ex: CNPJ ou Celular" />
                    </div>
                    <div>
                       <label className="block text-[9px] font-black uppercase text-emerald-800 mb-2">Instruções Adicionais</label>
                       <input type="text" value={config.instrucoes_pix} onChange={(e) => setConfig({...config, instrucoes_pix: e.target.value})} className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-2 text-xs font-bold outline-none" placeholder="Ex: Enviar comprovante no WhatsApp" />
                    </div>
                 </div>
              )}
              {[
                { enabled: config.pagamento_vale_alimentacao, field: 'bandeiras_vale_alimentacao', title: 'Bandeiras de Vale-alimentação', tone: 'border-orange-100 bg-orange-50/70 text-orange-950' },
                { enabled: config.pagamento_vale_refeicao, field: 'bandeiras_vale_refeicao', title: 'Bandeiras de Vale-refeição', tone: 'border-sky-100 bg-sky-50/70 text-sky-950' },
              ].filter((benefit) => benefit.enabled).map((benefit) => (
                <div key={benefit.field} className={cn('rounded-2xl border p-5 animate-in zoom-in-95 duration-200', benefit.tone)}>
                  <div className="mb-4">
                    <p className="text-xs font-black uppercase tracking-wider">{benefit.title}</p>
                    <p className="mt-1 text-[11px] font-medium opacity-70">Marque somente as bandeiras realmente aceitas pela sua loja.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {BENEFIT_CARD_BRANDS.map((brand) => {
                      const selected = (config[benefit.field] || []).includes(brand.id);
                      return (
                        <button
                          key={brand.id}
                          type="button"
                          onClick={() => toggleBenefitBrand(benefit.field as 'bandeiras_vale_alimentacao' | 'bandeiras_vale_refeicao', brand.id)}
                          className={cn(
                            'rounded-xl border px-3 py-2 text-xs font-bold transition-colors cursor-pointer',
                            selected ? 'border-gray-900 bg-gray-900 text-white' : 'border-white bg-white/80 text-gray-600 hover:border-gray-300'
                          )}
                        >
                          {brand.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}

        {/* FIDELIDADE & MARKETING & CUPOM */}
        {showPromotionsSection && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Banner Promocional */}
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Gift className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">Banner Promocional</h3>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    checked={config.banner_ativo}
                    onChange={(e) => setConfig({ ...config, banner_ativo: e.target.checked })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Frase de Destaque no Topo</label>
                  <input
                    type="text"
                    value={config.banner_texto}
                    onChange={(e) => setConfig({ ...config, banner_texto: e.target.value })}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-emerald-500"
                    placeholder="Ex: 🔥 Frete Grátis em compras acima de R$ 90!"
                  />
                </div>
              </div>

              {/* Clube de Fidelidade */}
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Star className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">Clube de Fidelidade</h3>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    checked={config.fidelidade_ativa}
                    onChange={(e) => setConfig({ ...config, fidelidade_ativa: e.target.checked })}
                  />
                </div>

                {config.fidelidade_ativa ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Pontos por R$ gasto</label>
                      <input
                        type="number"
                        value={config.pontos_por_real}
                        onChange={(e) => setConfig({ ...config, pontos_por_real: parseFloat(e.target.value) || 0 })}
                        className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-bold text-slate-800 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Valor do Ponto (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={config.valor_ponto_reais}
                        onChange={(e) => setConfig({ ...config, valor_ponto_reais: parseFloat(e.target.value) || 0 })}
                        className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-bold text-slate-800 outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs italic text-slate-400">Ative o programa para premiar clientes frequentes com pontos.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {hasUnsavedChanges && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl shadow-slate-900/15 backdrop-blur-md sm:w-[calc(100%-2rem)] sm:gap-4 sm:p-3.5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <span className="hidden text-xs font-semibold text-slate-800 min-[430px]:inline sm:text-sm">
              Você possui alterações não salvas.
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button 
              type="button"
              onClick={handleDiscard}
              disabled={saveDisabled}
              className="rounded-xl px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Descartar
            </button>
            <button 
              type="button" 
              onClick={handleSave} 
              disabled={saveDisabled}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {saveDisabled ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>{imageUploading.logo || imageUploading.cover ? 'Processando...' : 'Salvando...'}</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
      </div>
    </fieldset>
  );
}
