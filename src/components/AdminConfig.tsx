// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Settings, Store, Clock, Phone, Save, Truck, Plus, Trash2, MapPin, Star, AlertCircle, DollarSign, CreditCard, QrCode, Banknote, Gift, Palette, RotateCcw, Copy, Sparkles } from 'lucide-react';
import ImagePicker from './ImagePicker';
import { cn } from '../lib/utils';
import { useToast } from './Toast';
import { DEFAULT_STORE_THEME, createStoreTheme, isValidHexColor } from '../lib/theme';
import { BENEFIT_CARD_BRANDS } from '../lib/paymentMethods';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

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
  onUnauthorized,
  focusSection,
}: {
  token: string,
  onUnauthorized: () => void,
  focusSection?: 'aparencia' | 'operacao' | 'entrega_pagamento' | 'promocoes_fidelidade'
}) {
  const api = useTenantAdminApi();
  const [config, setConfig] = useState<any>(null);
  const [initialConfig, setInitialConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await api.getSettings();
        if (data.success && data.settings) {
          const mappedConfig = {
            is_open: data.settings.is_open,
            tempo_entrega: data.settings.tempo_entrega || '45-60 min',
            nome_loja: data.settings.nome_loja || 'Minha Loja',
            tagline: data.settings.tagline || 'Sabor & Qualidade',
            logo_url: data.settings.logo_url || '',
            capa_url: data.settings.capa_url || '',
            logoShape: data.settings.logoShape || 'squircle',
            theme: createStoreTheme(data.settings.theme),
            logisticsOptions: {
              allowPickup: data.settings.logisticsOptions?.allowPickup !== false,
              allowDelivery: data.settings.logisticsOptions?.allowDelivery !== false,
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
            faixas_entrega: data.settings.faixas_entrega || [],
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
            pagamento_pix: data.settings.pagamento_pix !== false,
            pagamento_cartao: data.settings.pagamento_cartao !== false,
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
          setConfig(mappedConfig);
          setInitialConfig(JSON.stringify(mappedConfig));
        }
      } catch (error) {
        showToast('Erro ao carregar configurações', 'error');
      }
    };
    fetchConfig();
  }, [token]);

  const handleCepBlur = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setConfig(prev => ({
            ...prev,
            rua_loja: data.logradouro,
            bairro_loja: data.bairro,
            cidade_loja: data.localidade,
            estado_loja: data.uf
          }));
          showToast('Endereço encontrado!', 'success');
        } else {
          showToast('CEP não encontrado', 'error');
        }
      } catch (error) {
        showToast('Erro ao buscar CEP', 'error');
      }
    }
  };

  const handleSave = async () => {
    if (!isValidHexColor(config.theme.primaryColor)) {
      showToast('Informe uma cor principal em HEX válida. Ex: #059669', 'error');
      return;
    }
    
    if (!config.logisticsOptions.allowPickup && !config.logisticsOptions.allowDelivery) {
      showToast('É necessário ativar pelo menos uma opção de logística (Retirada ou Entrega).', 'error');
      return;
    }
    
    if (config.logisticsOptions.allowDelivery && (!config.rua_loja || !config.numero_loja)) {
      showToast('Para habilitar entregas, é necessário preencher o endereço da loja.', 'error');
      return;
    }
    
    if (config.logisticsOptions.allowDelivery && config.faixas_entrega.length === 0) {
      showToast('Para habilitar entregas, adicione pelo menos uma faixa de frete.', 'error');
      return;
    }
    
    if (!config.pagamento_pix && !config.pagamento_cartao && !config.pagamento_dinheiro && !config.pagamento_vale_alimentacao && !config.pagamento_vale_refeicao) {
      showToast('É necessário habilitar pelo menos uma forma de pagamento.', 'error');
      return;
    }

    if (config.pagamento_vale_alimentacao && config.bandeiras_vale_alimentacao.length === 0) {
      showToast('Selecione ao menos uma bandeira para o Vale-alimentação.', 'error');
      return;
    }

    if (config.pagamento_vale_refeicao && config.bandeiras_vale_refeicao.length === 0) {
      showToast('Selecione ao menos uma bandeira para o Vale-refeição.', 'error');
      return;
    }
    
    if (config.pagamento_pix && !config.chave_pix) {
      showToast('Para aceitar PIX, informe a sua Chave PIX.', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...config,
        theme: createStoreTheme(config.theme),
      };
      const data = await api.updateSettings(payload);
      if (data.success) {
        setConfig(payload);
        setInitialConfig(JSON.stringify(payload));
        showToast('Configurações salvas com sucesso', 'success');
      }
    } catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao salvar', 'error'); }
    finally { setLoading(false); }
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
      title: 'Aparencia da Loja',
      subtitle: 'Identidade visual, contato e apresentacao principal da loja.',
    },
    operacao: {
      title: 'Operacao da Loja',
      subtitle: 'Status, horarios e funcionamento do dia a dia da loja.',
    },
    entrega_pagamento: {
      title: 'Entrega e Pagamento',
      subtitle: 'Endereco, logistica, taxas, pedido minimo e meios de pagamento.',
    },
    promocoes_fidelidade: {
      title: 'Promocoes e Fidelidade',
      subtitle: 'Pontos, banner promocional e comunicacao comercial da loja.',
    },
    default: {
      title: 'Configuracoes',
      subtitle: 'Gestao operacional e visual da sua loja',
    },
  } as const;
  const currentMeta = sectionMeta[selectedSection] || sectionMeta.default;
  const hasUnsavedChanges = initialConfig !== null && JSON.stringify(config) !== initialConfig;

  if (!config) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-gray-500">Carregando configuracoes...</p>
        </div>
      </div>
    );
  }

  const logoShapeClasses = config.logoShape === 'circle' ? 'rounded-full' : 'rounded-2xl';

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-28">
      <div className="flex flex-col items-start justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold text-emerald-700">Configuracoes da loja</p>
          <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            <Settings className="h-5 w-5 shrink-0 text-emerald-600" />
            {currentMeta.title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{currentMeta.subtitle}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className="hidden h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60 md:flex"
        >
          {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
          Salvar Alterações
        </button>
      </div>

      <div className="space-y-6">
        
        {/* SEÇÃO INTEGRADA: OPERAÇÃO & HORÁRIOS (STITCH) */}
        {showOperationSection && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-900">Status manual e prazos</h3>
                </div>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', config.is_open ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                  <span className={cn('h-2 w-2 rounded-full', config.is_open ? 'bg-emerald-500' : 'bg-red-500')} />
                  {config.is_open ? 'Loja aberta' : 'Loja fechada'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Status da loja</p>
                    <p className="mt-1 text-[11px] text-slate-500">Alterna a visibilidade da vitrine agora.</p>
                  </div>
                  <button type="button" onClick={() => setConfig({ ...config, is_open: !config.is_open })} className={cn('shrink-0 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors', config.is_open ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700')}>
                    {config.is_open ? 'Fechar loja' : 'Abrir loja'}
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
                  <p className="mt-1 text-[11px] text-slate-500">Configure a grade de atendimento para cada dia.</p>
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
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>Com a abertura automática ativa, o sistema segue a grade abaixo para atualizar o status da loja.</span>
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
                        <div className="flex max-w-xs flex-1 items-center gap-2">
                          <input type="time" value={dayConfig.inicio} onChange={(e) => setConfig((prev: any) => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [day.key]: { ...dayConfig, inicio: e.target.value } } }))} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-mono font-semibold text-slate-800 outline-none focus:border-emerald-500" />
                          <span className="text-xs font-medium text-slate-400">às</span>
                          <input type="time" value={dayConfig.fim} onChange={(e) => setConfig((prev: any) => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [day.key]: { ...dayConfig, fim: e.target.value } } }))} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-mono font-semibold text-slate-800 outline-none focus:border-emerald-500" />
                        </div>
                      ) : <span className="text-xs italic text-slate-400">Fechado neste dia</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
        {/* IDENTIDADE & CONTATO */}
        {showAppearanceSection && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
                  <Store className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-900">Informações básicas</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Nome fantasia da loja</label>
                    <input type="text" value={config.nome_loja} onChange={(e) => setConfig({ ...config, nome_loja: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="Ex: Burger House" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Subtítulo / tagline</label>
                    <input type="text" value={config.tagline} onChange={(e) => setConfig({ ...config, tagline: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="Ex: Sabor e qualidade em cada pedido" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Sobre a loja</label>
                    <textarea rows={3} value={config.sobre_texto} onChange={(e) => setConfig({ ...config, sobre_texto: e.target.value })} className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="Apresente sua história, valores ou diferenciais culinários..." />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
                  <Phone className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-900">Contato e redes sociais</h3>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">WhatsApp de atendimento</label>
                    <input type="text" value={config.whatsapp} onChange={(e) => setConfig({ ...config, whatsapp: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="11 99999-8888" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Instagram da loja</label>
                    <input type="text" value={config.instagram_url} onChange={(e) => setConfig({ ...config, instagram_url: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" placeholder="@sualoja" />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Palette className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-semibold text-slate-900">Identidade visual e cores</h3>
                  </div>
                  <button type="button" onClick={() => setConfig((prev) => ({ ...prev, theme: DEFAULT_STORE_THEME }))} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900">
                    <RotateCcw className="h-3 w-3" /> Redefinir
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Formato do logo na vitrine</label>
                    <select value={config.logoShape} onChange={(e) => setConfig({ ...config, logoShape: e.target.value as 'circle' | 'squircle' })} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500">
                      <option value="squircle">Quadrado suave</option>
                      <option value="circle">Círculo perfeito</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-700">Cor principal (HEX)</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={isValidHexColor(config.theme.primaryColor) ? themePreview.primaryColor : DEFAULT_STORE_THEME.primaryColor} onChange={(e) => updatePrimaryColor(e.target.value)} className="h-10 w-10 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-0.5" aria-label="Selecionar cor principal da loja" />
                      <input type="text" value={config.theme.primaryColor} onChange={(e) => updatePrimaryColor(e.target.value)} className={cn('h-10 flex-1 rounded-xl border px-3 text-sm font-mono font-semibold uppercase outline-none transition-all', isValidHexColor(config.theme.primaryColor) ? 'border-slate-200 bg-slate-50/50 focus:border-emerald-500 focus:bg-white' : 'border-red-300 bg-red-50 text-red-700')} placeholder="#059669" />
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

            <div className="flex flex-col gap-6 lg:col-span-5">
              <section className="order-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">Prévia do topo da vitrine</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    <Sparkles className="h-3 w-3 text-amber-500" /> Ao vivo
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
                  <div className="relative h-28 overflow-hidden bg-slate-200">
                    {config.capa_url ? <img src={config.capa_url} alt="Prévia da capa da loja" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-linear-to-r from-slate-800 to-slate-900" />}
                    <span className={cn('absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm', config.is_open ? 'bg-emerald-600' : 'bg-red-600')}>{config.is_open ? 'Aberto' : 'Fechado'}</span>
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

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <label className="mb-1 block text-xs font-semibold text-slate-900">Logo da loja</label>
                <p className="mb-3 text-[11px] text-slate-500">Recomendado em formato quadrado (400 x 400 px).</p>
                <ImagePicker value={config.logo_url} onChange={(url) => setConfig({ ...config, logo_url: url })} width={400} height={400} aspect={1} bucket="loja" path="identidade" />
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <label className="mb-1 block text-xs font-semibold text-slate-900">Banner de capa</label>
                <p className="mb-3 text-[11px] text-slate-500">Proporção recomendada: 1265 x 460 px.</p>
                <ImagePicker value={config.capa_url} onChange={(url) => setConfig({ ...config, capa_url: url })} width={1265} height={460} aspect={1265 / 460} bucket="loja" path="identidade" />
              </section>
            </div>
          </div>
        )}
        {showDeliverySection && (
        <>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <label className={cn(
                    "flex items-center justify-between rounded-xl border p-3.5 cursor-pointer transition-all",
                    config.logisticsOptions.allowPickup ? "border-emerald-500/40 bg-emerald-50/20" : "border-slate-200 bg-slate-50"
                 )}>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Retirada no balcão</p>
                      <p className="text-[10px] text-slate-500">Cliente retira o pedido no local.</p>
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
                      <p className="text-[10px] text-slate-500">Cálculo por distância e taxa configurada.</p>
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
                 <input type="text" value={config.cep_loja} onChange={(e) => setConfig({ ...config, cep_loja: e.target.value.replace(/\D/g, '') })} onBlur={(e) => handleCepBlur(e.target.value)} maxLength={8} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500" />
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
           </div>

        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Taxas de entrega por distância</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">Defina o valor da entrega baseado no raio em KM.</p>
                </div>
                <button onClick={() => setConfig(prev => ({ ...prev, faixas_entrega: [...prev.faixas_entrega, { km_ate: 0, valor: 0 }] }))} className="hidden items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 md:inline-flex">
                  <Plus className="h-3.5 w-3.5" /> Adicionar faixa
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {config.faixas_entrega.map((faixa, idx) => (
                    <div key={idx} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                       <div className="grid flex-1 grid-cols-2 gap-2">
                          <div>
                             <label className="block text-[9px] font-black uppercase text-gray-400 mb-1">Até (KM)</label>
                             <input type="number" step="0.1" value={faixa.km_ate} onChange={(e) => { const n = [...config.faixas_entrega]; n[idx].km_ate = parseFloat(e.target.value) || 0; setConfig({...config, faixas_entrega: n})}} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-emerald-500" />
                          </div>
                          <div>
                             <label className="block text-[9px] font-black uppercase text-gray-400 mb-1">Valor (R$)</label>
                             <input type="number" step="0.1" value={faixa.valor} onChange={(e) => { const n = [...config.faixas_entrega]; n[idx].valor = parseFloat(e.target.value) || 0; setConfig({...config, faixas_entrega: n})}} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-emerald-500" />
                          </div>
                       </div>
                       <button onClick={() => setConfig({...config, faixas_entrega: config.faixas_entrega.filter((_, i) => i !== idx)})} className="p-1.5 text-slate-400 transition-colors hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                       </button>
                    </div>
                 ))}
                 <button onClick={() => setConfig(prev => ({ ...prev, faixas_entrega: [...prev.faixas_entrega, { km_ate: 0, valor: 0 }] }))} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-3 text-xs font-semibold text-slate-500 md:hidden">
                    <Plus className="w-4 h-4" /> Adicionar Faixa
                 </button>
              </div>
           </div>
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
                   { id: 'pagamento_cartao', label: 'Cartão na Entrega', icon: CreditCard, color: 'text-amber-500', activeClass: 'border-amber-500 bg-amber-50 text-amber-900' },
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
                      return <button key={brand.id} type="button" onClick={() => toggleBenefitBrand(benefit.field as 'bandeiras_vale_alimentacao' | 'bandeiras_vale_refeicao', brand.id)} className={cn(
                        'rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
                        selected ? 'border-gray-900 bg-gray-900 text-white' : 'border-white bg-white/80 text-gray-600 hover:border-gray-300'
                      )}>{brand.label}</button>;
                    })}
                  </div>
                </div>
              ))}
           </div>
        </div>
        </>
        )}

        {/* FIDELIDADE & MARKETING & CUPOM (COMPACT) */}
        {showPromotionsSection && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
           <div className="order-2 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
             <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                   <Star className="h-4 w-4 text-emerald-600" />
                   <h3 className="text-sm font-bold text-slate-900">Clube de fidelidade</h3>
                </div>
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked={config.fidelidade_ativa} onChange={(e) => setConfig({...config, fidelidade_ativa: e.target.checked})} />
             </div>
             
             <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Programa ativo</p>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">Clientes acumulam pontos nos pedidos.</p>
                </div>
                <span className="text-[11px] font-semibold text-slate-500">{config.fidelidade_ativa ? 'Ativo' : 'Inativo'}</span>
             </div>

             {config.fidelidade_ativa && (
               <div className="grid grid-cols-2 gap-4 animate-in fade-in">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2">Pontos / Real</label>
                    <input type="number" value={config.pontos_por_real} onChange={(e) => setConfig({...config, pontos_por_real: parseFloat(e.target.value) || 0})} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 font-black text-gray-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2">Resgate (R$)</label>
                    <input type="number" step="0.01" value={config.valor_ponto_reais} onChange={(e) => setConfig({...config, valor_ponto_reais: parseFloat(e.target.value) || 0})} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 font-black text-gray-800" />
                  </div>
               </div>
             )}
           </div>

           <div className="order-1 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
             <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                   <Gift className="h-4 w-4 text-emerald-600" />
                   <h3 className="text-sm font-bold text-slate-900">Banner promocional</h3>
                </div>
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked={config.banner_ativo} onChange={(e) => setConfig({...config, banner_ativo: e.target.checked})} />
             </div>

             <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Exibir aviso</p>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">Destaque no topo da vitrine do cliente.</p>
                </div>
                <span className="text-[11px] font-semibold text-slate-500">{config.banner_ativo ? 'Ativo' : 'Inativo'}</span>
             </div>

             <div className="space-y-4">
               <label className="block text-xs font-semibold text-gray-400 mb-1 ml-1">Frase Chamativa</label>
               <input type="text" value={config.banner_texto} onChange={e => setConfig({ ...config, banner_texto: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 font-bold text-gray-800 italic" placeholder="Ex: Aproveite o cupom de primeira compra!" />
             </div>
           </div>
          </div>
           <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
             <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                   <AlertCircle className="h-4 w-4 text-emerald-600" />
                   <h3 className="text-sm font-bold text-slate-900">Cupom global</h3>
                </div>
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked={config.cupom_global_ativo} onChange={(e) => setConfig({...config, cupom_global_ativo: e.target.checked})} />
             </div>

             <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Alerta ativo</p>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">Exibe um aviso na sacola ("Tem um cupom?").</p>
                </div>
                <span className="text-[11px] font-semibold text-slate-500">{config.cupom_global_ativo ? 'Ativo' : 'Inativo'}</span>
             </div>
             
             <p className="text-xs text-gray-400 font-bold italic leading-relaxed">
               Use isto para alertar os clientes que existem cupons disponíveis (ex: Primeira Compra). Um aviso vermelho '1' aparecerá na sacola para chamar a atenção.
             </p>
           </div>
        </div>
        )}

      </div>

      {hasUnsavedChanges && (
        <div className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="text-sm font-bold text-gray-700">Você possui alterações não salvas</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={() => {
                if (initialConfig) setConfig(JSON.parse(initialConfig));
              }}
              className="text-gray-500 font-bold text-sm px-4 py-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Descartar
            </button>
            <button 
              type="button" 
              onClick={handleSave} 
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar Agora'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
