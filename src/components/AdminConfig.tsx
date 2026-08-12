// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Settings, Store, Clock, Phone, Save, Truck, Plus, Trash2, MapPin, Star, Image as ImageIcon, AlertCircle, DollarSign, CreditCard, QrCode, Banknote, Gift, Palette, RotateCcw, Copy, Sparkles } from 'lucide-react';
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
  const [activeSection, setActiveSection] = useState<'aparencia' | 'operacao' | 'entrega_pagamento' | 'promocoes_fidelidade'>('aparencia');
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

  const selectedSection = focusSection || activeSection;
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

      {!focusSection && (
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Secoes de configuracao">
          {[
            { id: 'aparencia', label: 'Aparencia', icon: Palette },
            { id: 'operacao', label: 'Horarios e operacao', icon: Clock },
            { id: 'entrega_pagamento', label: 'Entrega e pagamento', icon: Truck },
            { id: 'promocoes_fidelidade', label: 'Promocoes e fidelidade', icon: Star },
          ].map((section) => {
            const Icon = section.icon;
            const selected = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id as typeof activeSection)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors',
                  selected ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {section.label}
              </button>
            );
          })}
        </nav>
      )}

      <div className="space-y-6">
        
        {/* SEÇÃO INTEGRADA: OPERAÇÃO & HORÁRIOS (STITCH) */}
        {showOperationSection && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">
              <Clock className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Operação & Horários</h3>
              <p className="text-sm text-gray-500 font-bold italic mt-0.5">Controle quando sua loja está visível e aceitando pedidos.</p>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* STATUS MANUAL */}
              <div className={cn(
                "flex min-h-[148px] flex-col justify-between rounded-xl border p-4 transition-all",
                config.is_open ? "border-emerald-500/20 bg-emerald-50/30" : "border-red-500/20 bg-red-50/30"
              )}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-400">Status Atual</span>
                    <div className={cn("w-2 h-2 rounded-full animate-pulse", config.is_open ? "bg-emerald-500" : "bg-red-500")} />
                  </div>
                  <h4 className="text-lg font-black text-gray-900 uppercase italic">
                    Loja {config.is_open ? 'Aberta' : 'Fechada'}
                  </h4>
                  <p className="text-xs text-gray-400 font-bold mt-1">Clique para alternar o status manualmente.</p>
                </div>
                <button 
                  onClick={() => setConfig({ ...config, is_open: !config.is_open })}
                  className={cn(
                    "mt-4 h-10 w-full rounded-lg text-xs font-semibold shadow-sm transition-all active:scale-[0.98]",
                    config.is_open ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-red-600 text-white hover:bg-red-700"
                  )}
                >
                  {config.is_open ? 'Fechar Loja Agora' : 'Abrir Loja Agora'}
                </button>
              </div>

              {/* TEMPO DE ENTREGA */}
              <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <span className="text-xs font-semibold text-gray-400 mb-2 block">Rapidez</span>
                  <h4 className="text-lg font-black text-gray-800 uppercase italic leading-none">Tempo de Entrega</h4>
                  <p className="text-xs text-gray-400 font-bold mt-2">Visível para o cliente no topo da vitrine.</p>
                </div>
                <div className="relative mt-4">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                  <input 
                    type="text" 
                    value={config.tempo_entrega} 
                    onChange={(e) => setConfig({ ...config, tempo_entrega: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-gray-700"
                    placeholder="Ex: 45-60 min"
                  />
                </div>
              </div>

              {/* MODO AUTOMÁTICO TOGGLE */}
              <div className={cn(
                "flex items-center gap-4 rounded-xl border p-4 transition-all",
                config.abertura_automatica ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50"
              )}>
                <div className="flex-1">
                  <h4 className="text-sm font-black text-gray-900 uppercase italic">Abertura Automática</h4>
                  <p className="text-[10px] text-gray-400 font-bold mt-1">A loja abre e fecha sozinha nos horários definidos.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={config.abertura_automatica} onChange={(e) => setConfig({ ...config, abertura_automatica: e.target.checked })} />
                  <div className="w-14 h-7 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>

            {config.abertura_automatica && (
              <div className="space-y-5 border-t border-slate-100 pt-5 animate-in fade-in slide-in-from-top-4">
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-4 items-center">
                  <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-800 font-bold italic leading-tight">
                    Com o <span className="underline">Modo Automático</span> ativado, a sua loja mudará o status para <span className="font-black">Aberta</span> ou <span className="font-black">Fechada</span> automaticamente seguindo a tabela abaixo. O botão manual de status será ignorado.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <h5 className="text-xs font-black uppercase tracking-widest text-gray-400 ml-1">Escala Semanal</h5>
                    <button
                      type="button"
                      onClick={copySundayScheduleToAll}
                      className="ml-1 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-800"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar domingo para todos
                    </button>
                    {['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'].map(dia => (
                      <div key={dia} className={cn(
                        "flex items-center gap-4 rounded-xl border p-3 transition-all",
                        config.horarios_funcionamento[dia].aberto ? "border-slate-200 bg-white shadow-sm" : "border-slate-100 bg-slate-50 opacity-70"
                      )}>
                        <div className="w-8 flex justify-center">
                          <input type="checkbox" checked={config.horarios_funcionamento[dia].aberto} 
                              onChange={(e) => setConfig(prev => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [dia]: { ...prev.horarios_funcionamento[dia], aberto: e.target.checked } } }))}
                              className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </div>
                        <span className="w-20 font-black text-[11px] uppercase text-gray-700">{dia}</span>
                        
                        {config.horarios_funcionamento[dia].aberto ? (
                          <div className="flex items-center gap-4 flex-1">
                            <input type="time" value={config.horarios_funcionamento[dia].inicio} onChange={(e) => setConfig(prev => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [dia]: { ...prev.horarios_funcionamento[dia], inicio: e.target.value } } }))} className="w-full px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-purple-500" />
                            <span className="text-[10px] font-black text-gray-300">ATÉ</span>
                            <input type="time" value={config.horarios_funcionamento[dia].fim} onChange={(e) => setConfig(prev => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [dia]: { ...prev.horarios_funcionamento[dia], fim: e.target.value } } }))} className="w-full px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-purple-500" />
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-400 italic">Folga semanal (Fechado)</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div>
                    <h5 className="text-xs font-black uppercase tracking-widest text-gray-400 ml-1 mb-3">Comunicação</h5>
                    <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                       <label className="block text-xs font-semibold text-gray-400 mb-4">Mensagem ao Fechar</label>
                       <textarea 
                          rows={3} 
                          value={config.mensagem_fechado} 
                          onChange={(e) => setConfig({ ...config, mensagem_fechado: e.target.value })} 
                          placeholder="Ex: Estamos fechados agora. Voltamos em breve!" 
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm italic font-bold text-gray-700 outline-none focus:border-purple-500 transition-all resize-none"
                       />
                       <p className="text-[9px] text-gray-400 mt-4 font-bold italic leading-tight">
                         * Essa mensagem aparece para o cliente na vitrine caso a loja esteja fora do horário automático ou fechada manualmente.
                       </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* IDENTIDADE & CONTATO */}
        {showAppearanceSection && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
           <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
              <div className="flex items-center gap-3 mb-4">
                 <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <Store className="w-5 h-5 text-emerald-600" />
                 </div>
                 <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Identidade Visual</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-4">Logo da Loja (Quadradra)</label>
                    <ImagePicker value={config.logo_url} onChange={(url) => setConfig({ ...config, logo_url: url })} width={400} height={400} aspect={1/1} bucket="loja" path="identidade" />
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-4">Banner de Capa (Recomendado: 1265 x 460px)</label>
                    <ImagePicker value={config.capa_url} onChange={(url) => setConfig({ ...config, capa_url: url })} width={1265} height={460} aspect={1265 / 460} bucket="loja" path="identidade" />
                 </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-black text-gray-700 uppercase italic mb-2 ml-1">Formato do logo</label>
                    <select
                      value={config.logoShape}
                      onChange={(e) => setConfig({ ...config, logoShape: e.target.value as 'circle' | 'squircle' })}
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-gray-800 outline-none"
                    >
                      <option value="circle">Redondo</option>
                      <option value="squircle">Quadrado arredondado</option>
                    </select>
                 </div>
                 <div className="rounded-[1.75rem] border border-gray-100 bg-gray-50 p-5">
                    <p className="text-xs font-semibold text-gray-400 mb-2">Ajuste visual</p>
                    <p className="text-sm text-gray-500 font-medium leading-relaxed">
                      O formato do logo afeta a vitrine mobile, o topo desktop e os pontos onde a marca aparece para o cliente.
                    </p>
                 </div>
              </div>
              <div className="rounded-[2rem] border border-gray-100 bg-gray-50/70 p-5 md:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm"
                      style={{ backgroundColor: themePreview.primaryColor, color: themePreview.primaryTextColor }}
                    >
                      <Palette className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase italic tracking-tight text-gray-900">Tema da loja</h4>
                      <p className="mt-1 text-xs font-bold text-gray-500">Define a cor principal da vitrine, CTAs e estados ativos.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, theme: DEFAULT_STORE_THEME }))}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Padrao
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[160px_1fr]">
                  <div
                    className="flex min-h-[132px] flex-col justify-between rounded-2xl border p-4"
                    style={{ backgroundColor: themePreview.primarySoftColor, borderColor: themePreview.primaryBorderColor }}
                  >
                    <div>
                      <span className="text-xs font-semibold text-gray-500">Preview</span>
                      <p className="mt-2 text-sm font-black text-gray-900">Botao principal</p>
                    </div>
                    <div
                      className="rounded-xl px-4 py-3 text-center text-xs font-black uppercase tracking-widest shadow-sm"
                      style={{ backgroundColor: themePreview.primaryColor, color: themePreview.primaryTextColor }}
                    >
                      Adicionar
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-[56px_1fr] gap-3">
                      <input
                        type="color"
                        value={isValidHexColor(config.theme.primaryColor) ? createStoreTheme(config.theme).primaryColor : DEFAULT_STORE_THEME.primaryColor}
                        onChange={(e) => updatePrimaryColor(e.target.value)}
                        className="h-14 w-14 cursor-pointer rounded-2xl border border-gray-200 bg-white p-1"
                        aria-label="Selecionar cor principal da loja"
                      />
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-gray-400">Cor principal (HEX)</label>
                        <input
                          type="text"
                          value={config.theme.primaryColor}
                          onChange={(e) => updatePrimaryColor(e.target.value)}
                          className={cn(
                            "w-full rounded-2xl border bg-white px-5 py-4 font-black uppercase text-gray-800 outline-none transition-all",
                            isValidHexColor(config.theme.primaryColor) ? "border-gray-200 focus:border-gray-400" : "border-red-200 bg-red-50 text-red-700"
                          )}
                          placeholder="#059669"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((preset) => (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => updatePrimaryColor(preset.hex)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.hex }} />
                          {preset.name}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs font-semibold text-gray-400 md:grid-cols-4">
                      <div className="rounded-xl bg-white p-3">
                        <span>Hover</span>
                        <div className="mt-2 h-3 rounded-full" style={{ backgroundColor: themePreview.primaryHoverColor }} />
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <span>Suave</span>
                        <div className="mt-2 h-3 rounded-full" style={{ backgroundColor: themePreview.primarySoftColor }} />
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <span>Borda</span>
                        <div className="mt-2 h-3 rounded-full" style={{ backgroundColor: themePreview.primaryBorderColor }} />
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <span>Texto</span>
                        <div className="mt-2 h-3 rounded-full border border-gray-100" style={{ backgroundColor: themePreview.primaryTextColor }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                 <label className="block text-sm font-black text-gray-700 uppercase italic mb-2 ml-1">Nome Fantasia</label>
                 <input type="text" value={config.nome_loja} onChange={(e) => setConfig({ ...config, nome_loja: e.target.value })} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-gray-800" />
              </div>
              <div>
                 <label className="block text-sm font-black text-gray-700 uppercase italic mb-2 ml-1">Subtítulo / Slogan</label>
                 <input type="text" value={config.tagline} onChange={(e) => setConfig({ ...config, tagline: e.target.value })} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-gray-800" placeholder="Ex: Sabor & Qualidade" />
              </div>
              <div>
                 <label className="block text-sm font-black text-gray-700 uppercase italic mb-2 ml-1">Sobre a Loja</label>
                 <textarea rows={3} value={config.sobre_texto} onChange={(e) => setConfig({ ...config, sobre_texto: e.target.value })} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-medium text-gray-600 resize-none" placeholder="Fale sobre seus ingredientes, história..." />
              </div>
           </div>

           <div className="flex flex-col justify-between space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <div
                  className="relative h-24 bg-slate-200 bg-cover bg-center"
                  style={config.capa_url ? { backgroundImage: `url(${config.capa_url})` } : { backgroundColor: themePreview.primarySoftColor }}
                />
                <div className="relative px-4 pb-4">
                  <div
                    className={cn('absolute -top-7 flex h-14 w-14 items-center justify-center overflow-hidden border-4 border-white bg-white shadow-sm', logoShapeClasses)}
                  >
                    {config.logo_url ? (
                      <img src={config.logo_url} alt="Logo da loja" className="h-full w-full object-cover" />
                    ) : (
                      <Store className="h-5 w-5" style={{ color: themePreview.primaryColor }} />
                    )}
                  </div>
                  <div className="pt-9">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{config.nome_loja || 'Sua loja'}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{config.tagline || 'Preview da vitrine'}</p>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold"
                        style={{ backgroundColor: themePreview.primarySoftColor, color: themePreview.primaryColor }}
                      >
                        {config.is_open ? 'Aberta' : 'Fechada'}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <Sparkles className="h-3.5 w-3.5" style={{ color: themePreview.primaryColor }} />
                      <span>{config.tempo_entrega || 'Tempo de entrega'}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-6">
                   <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                      <Phone className="w-5 h-5 text-emerald-600" />
                   </div>
                   <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight italic">Contato Digital</h3>
                </div>
                <div className="space-y-6">
                   <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2">WhatsApp de Atendimento</label>
                      <input type="text" value={config.whatsapp} onChange={(e) => setConfig({ ...config, whatsapp: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-gray-800 outline-none focus:border-emerald-500 transition-all" placeholder="55 11 99999-9999" />
                   </div>
                   <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2">Instagram (ex: @loja)</label>
                      <input type="text" value={config.instagram_url} onChange={(e) => setConfig({ ...config, instagram_url: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-gray-800 outline-none focus:border-emerald-500 transition-all" placeholder="@sua_loja" />
                   </div>
                </div>
              </div>
              <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 mt-8">
                 <p className="text-[10px] text-emerald-800/60 font-bold uppercase tracking-widest italic leading-relaxed text-center">
                   Esses dados serão exibidos em <span className="text-emerald-500 underline">Mais informações</span> para o seu cliente final.
                 </p>
              </div>
           </div>
        </div>
        )}

        {/* LOGÍSTICA & DISTÂNCIA */}
        {showDeliverySection && (
        <>
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center shadow-sm">
                    <MapPin className="w-6 h-6 text-blue-600" />
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Logística & Distância</h3>
                    <p className="text-sm text-gray-500 font-bold italic mt-0.5">Endereço da loja e taxas por KM.</p>
                 </div>
              </div>
              <button 
                onClick={() => setConfig(prev => ({ ...prev, faixas_entrega: [...prev.faixas_entrega, { km_ate: 0, valor: 0 }] }))}
                className="hidden h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 md:flex"
              >
                <Plus className="w-4 h-4" /> Adicionar Faixa
              </button>
           </div>

           <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50/60 p-5">
              <div className="flex items-center gap-3 mb-4">
                 <Truck className="w-5 h-5 text-blue-600" />
                 <div>
                    <h4 className="text-sm font-black text-gray-900 uppercase italic">Modalidades de logistica</h4>
                    <p className="text-[10px] text-gray-500 font-bold mt-1">Controla as abas de Retirada e Entrega na sacola.</p>
                 </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <label className={cn(
                    "flex items-center justify-between rounded-2xl border-2 p-4 cursor-pointer transition-all",
                    config.logisticsOptions.allowPickup ? "border-blue-500 bg-white" : "border-gray-100 bg-gray-50"
                 )}>
                    <div>
                      <p className="text-sm font-black text-gray-800 uppercase italic">Habilitar retirada</p>
                      <p className="text-[10px] text-gray-400 font-bold mt-1">Exibe a aba Retirar no local.</p>
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
                      className="w-5 h-5 rounded border-gray-300 text-blue-600"
                    />
                 </label>
                 <label className={cn(
                    "flex items-center justify-between rounded-2xl border-2 p-4 cursor-pointer transition-all",
                    config.logisticsOptions.allowDelivery ? "border-blue-500 bg-white" : "border-gray-100 bg-gray-50"
                 )}>
                    <div>
                      <p className="text-sm font-black text-gray-800 uppercase italic">Habilitar entrega</p>
                      <p className="text-[10px] text-gray-400 font-bold mt-1">Exibe a aba Entrega e o calculo de taxa.</p>
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
                      className="w-5 h-5 rounded border-gray-300 text-blue-600"
                    />
                 </label>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-5">
              <div className="lg:col-span-1">
                 <label className="block text-xs font-semibold text-gray-400 mb-2">CEP</label>
                 <input type="text" value={config.cep_loja} onChange={(e) => setConfig({ ...config, cep_loja: e.target.value.replace(/\D/g, '') })} onBlur={(e) => handleCepBlur(e.target.value)} maxLength={8} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold" />
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                 <label className="block text-xs font-semibold text-gray-400 mb-2">Logradouro</label>
                 <input type="text" value={config.rua_loja} onChange={(e) => setConfig({ ...config, rua_loja: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold" />
              </div>
              <div className="lg:col-span-1">
                 <label className="block text-xs font-semibold text-gray-400 mb-2">Número</label>
                 <input type="text" value={config.numero_loja} onChange={(e) => setConfig({ ...config, numero_loja: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold" />
              </div>
              <div className="lg:col-span-1">
                 <label className="block text-xs font-semibold text-gray-400 mb-2">Estado</label>
                 <input type="text" value={config.estado_loja} maxLength={2} onChange={(e) => setConfig({ ...config, estado_loja: e.target.value.toUpperCase() })} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-center" />
              </div>
           </div>

           <div className="mt-8 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600 ml-1">Taxas de Entrega Reais (Calculado por KM)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {config.faixas_entrega.map((faixa, idx) => (
                    <div key={idx} className="bg-gray-50/50 border border-gray-100 p-4 rounded-2xl flex items-center gap-4 group">
                       <div className="flex-1 space-y-3">
                          <div>
                             <label className="block text-[9px] font-black uppercase text-gray-400 mb-1">Até (KM)</label>
                             <input type="number" step="0.1" value={faixa.km_ate} onChange={(e) => { const n = [...config.faixas_entrega]; n[idx].km_ate = parseFloat(e.target.value) || 0; setConfig({...config, faixas_entrega: n})}} className="w-full bg-white border border-gray-100 rounded-lg px-3 py-1.5 text-xs font-bold font-mono outline-none focus:border-blue-500" />
                          </div>
                          <div>
                             <label className="block text-[9px] font-black uppercase text-gray-400 mb-1">Valor (R$)</label>
                             <input type="number" step="0.1" value={faixa.valor} onChange={(e) => { const n = [...config.faixas_entrega]; n[idx].valor = parseFloat(e.target.value) || 0; setConfig({...config, faixas_entrega: n})}} className="w-full bg-white border border-gray-100 rounded-lg px-3 py-1.5 text-xs font-bold font-mono outline-none focus:border-blue-500" />
                          </div>
                       </div>
                       <button onClick={() => setConfig({...config, faixas_entrega: config.faixas_entrega.filter((_, i) => i !== idx)})} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-5 h-5" />
                       </button>
                    </div>
                 ))}
                 <button onClick={() => setConfig(prev => ({ ...prev, faixas_entrega: [...prev.faixas_entrega, { km_ate: 0, valor: 0 }] }))} className="md:hidden w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-100 p-4 rounded-2xl text-gray-400 font-black text-[10px] uppercase tracking-widest">
                    <Plus className="w-4 h-4" /> Adicionar Faixa
                 </button>
              </div>
           </div>
        </div>

        {/* REGRAS COMERCIAIS & PAYMENTS */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
           <div className="flex flex-col justify-between space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                 <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                       <DollarSign className="w-5 h-5 text-amber-600" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Finanças da Loja</h3>
                 </div>
                 <div className="space-y-6">
                    <div>
                       <label className="block text-sm font-black text-gray-700 uppercase italic mb-2 ml-1">Pedido Mínimo Obrigatório</label>
                       <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">R$</span>
                          <input type="number" step="0.5" value={config.pedido_minimo} onChange={(e) => setConfig({ ...config, pedido_minimo: parseFloat(e.target.value) || 0 })} className="w-full pl-12 pr-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-black text-gray-800" />
                       </div>
                    </div>
                    <div>
                       <label className="block text-sm font-black text-gray-700 uppercase italic mb-2 ml-1">Frete Grátis a partir de</label>
                       <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">R$</span>
                          <input type="number" step="0.5" value={config.frete_gratis_acima_de} onChange={(e) => setConfig({ ...config, frete_gratis_acima_de: parseFloat(e.target.value) || 0 })} className="w-full pl-12 pr-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-black text-gray-800" />
                       </div>
                       <p className="text-[10px] text-gray-400 font-bold italic mt-2">* Deixe 0 para desativar benefícios de frete grátis.</p>
                    </div>
                 </div>
              </div>
           </div>

           <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                 <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-emerald-600" />
                 </div>
                 <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Pagamentos Aceitos</h3>
              </div>
              <div className="space-y-4">
                 {[
                   { id: 'pagamento_pix', label: 'PIX / Comprovante', icon: QrCode, color: 'text-emerald-500', activeClass: 'border-emerald-500 bg-emerald-50 text-emerald-900' },
                   { id: 'pagamento_cartao', label: 'Cartão na Entrega', icon: CreditCard, color: 'text-amber-500', activeClass: 'border-amber-500 bg-amber-50 text-amber-900' },
                   { id: 'pagamento_dinheiro', label: 'Dinheiro (Em mãos)', icon: Banknote, color: 'text-purple-500', activeClass: 'border-purple-500 bg-purple-50 text-purple-900' },
                   { id: 'pagamento_vale_alimentacao', label: 'Vale-alimentação', icon: Gift, color: 'text-orange-500', activeClass: 'border-orange-400 bg-orange-50 text-orange-950' },
                   { id: 'pagamento_vale_refeicao', label: 'Vale-refeição', icon: Gift, color: 'text-sky-500', activeClass: 'border-sky-400 bg-sky-50 text-sky-950' }
                 ].map(method => (
                    <label key={method.id} className={cn(
                       "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer",
                       config[method.id] ? method.activeClass : "border-gray-50 bg-gray-50 text-gray-400"
                    )}>
                       <input type="checkbox" checked={config[method.id]} onChange={(e) => setConfig({
                         ...config,
                         [method.id]: e.target.checked,
                         ...(method.id === 'pagamento_vale_alimentacao' && !e.target.checked ? { bandeiras_vale_alimentacao: [] } : {}),
                         ...(method.id === 'pagamento_vale_refeicao' && !e.target.checked ? { bandeiras_vale_refeicao: [] } : {}),
                       })} className="w-5 h-5 rounded border-transparent focus:ring-0 cursor-pointer" />
                       <method.icon className={cn("w-5 h-5", config[method.id] ? "text-gray-900" : method.color)} />
                       <span className="font-black text-[11px] uppercase tracking-widest">{method.label}</span>
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
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
           <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
             <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-[100px] -z-10 opacity-60"></div>
             <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                   <Star className="w-5 h-5 text-purple-600 fill-purple-600" />
                </div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Clube de Fidelidade</h3>
             </div>
             
             <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-6">
                <div>
                  <p className="font-black text-gray-800 uppercase italic text-sm">Programa Ativo</p>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">Clientes acumulam pontos nos pedidos.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={config.fidelidade_ativa} onChange={(e) => setConfig({...config, fidelidade_ativa: e.target.checked})} />
                  <div className="w-14 h-7 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
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

           <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
             <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-bl-[100px] -z-10 opacity-60"></div>
             <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                   <Gift className="w-5 h-5 text-orange-600" />
                </div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Banner Promocional</h3>
             </div>

             <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-6">
                <div>
                  <p className="font-black text-gray-800 uppercase italic text-sm">Exibir Aviso</p>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">Destaque no topo da vitrine do cliente.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={config.banner_ativo} onChange={(e) => setConfig({...config, banner_ativo: e.target.checked})} />
                  <div className="w-14 h-7 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-orange-600"></div>
                </label>
             </div>

             <div className="space-y-4">
               <label className="block text-xs font-semibold text-gray-400 mb-1 ml-1">Frase Chamativa</label>
               <input type="text" value={config.banner_texto} onChange={e => setConfig({ ...config, banner_texto: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 font-bold text-gray-800 italic" placeholder="Ex: Aproveite o cupom de primeira compra!" />
             </div>
           </div>
           <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
             <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-bl-[100px] -z-10 opacity-60"></div>
             <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                   <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Cupom Global</h3>
             </div>

             <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-6">
                <div>
                  <p className="font-black text-gray-800 uppercase italic text-sm">Alerta Ativo</p>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">Exibe um aviso na sacola ("Tem um cupom?").</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={config.cupom_global_ativo} onChange={(e) => setConfig({...config, cupom_global_ativo: e.target.checked})} />
                  <div className="w-14 h-7 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-red-600"></div>
                </label>
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
