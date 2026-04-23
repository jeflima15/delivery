// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Settings, Store, Clock, Phone, Save, Truck, Plus, Trash2, MapPin, Star, Image as ImageIcon, AlertCircle, DollarSign, CreditCard, QrCode, Banknote, Gift, Palette, RotateCcw } from 'lucide-react';
import ImagePicker from './ImagePicker';
import { cn } from '../lib/utils';
import { useToast } from './Toast';
import { DEFAULT_STORE_THEME, createStoreTheme, isValidHexColor } from '../lib/theme';

const DEFAULT_SECONDARY_BANNERS = [
  { id: 'secondary-banner-1', imageUrl: '', active: false, link: '' },
  { id: 'secondary-banner-2', imageUrl: '', active: false, link: '' },
  { id: 'secondary-banner-3', imageUrl: '', active: false, link: '' },
];

function normalizeSecondaryBanners(banners: any[] = []) {
  return DEFAULT_SECONDARY_BANNERS.map((fallback, index) => {
    const current = banners[index] || banners.find((item) => item?.id === fallback.id) || {};
    return {
      id: current.id || fallback.id,
      imageUrl: current.imageUrl || '',
      active: Boolean(current.active),
      link: current.link || '',
    };
  });
}

export default function AdminConfig({
  token,
  onUnauthorized,
  focusSection,
}: {
  token: string,
  onUnauthorized: () => void,
  focusSection?: 'aparencia' | 'operacao' | 'entrega_pagamento' | 'promocoes_fidelidade'
}) {
  const [config, setConfig] = useState({
    is_open: true,
    tempo_entrega: '45-60 min',
    nome_loja: 'Stitch Delivery',
    tagline: 'Sabor & Qualidade',
    logo_url: '',
    capa_url: '',
    logoShape: 'squircle' as 'circle' | 'squircle',
    theme: DEFAULT_STORE_THEME,
    secondaryBanners: normalizeSecondaryBanners(),
    logisticsOptions: {
      allowPickup: true,
      allowDelivery: true,
    },
    sobre_texto: '',
    instagram_url: '',
    whatsapp: '',
    cep_loja: '',
    rua_loja: '',
    numero_loja: '',
    bairro_loja: '',
    cidade_loja: '',
    estado_loja: '',
    faixas_entrega: [] as { km_ate: number, valor: number }[],
    abertura_automatica: false,
    mensagem_fechado: 'Estamos fechados no momento.',
    horarios_funcionamento: {
      domingo: { aberto: false, inicio: '18:00', fim: '23:30' },
      segunda: { aberto: false, inicio: '18:00', fim: '23:30' },
      terca:   { aberto: false, inicio: '18:00', fim: '23:30' },
      quarta:  { aberto: false, inicio: '18:00', fim: '23:30' },
      quinta:  { aberto: false, inicio: '18:00', fim: '23:30' },
      sexta:   { aberto: false, inicio: '18:00', fim: '23:30' },
      sabado:  { aberto: false, inicio: '18:00', fim: '23:30' }
    } as any,
    pedido_minimo: 0,
    frete_gratis_acima_de: 0,
    pagamento_pix: true,
    pagamento_cartao: true,
    pagamento_dinheiro: true,
    chave_pix: '',
    instrucoes_pix: '',
    banner_ativo: false,
    banner_texto: 'Hoje frete grátis acima de R$ 60',
    fidelidade_ativa: false,
    pontos_por_real: 1,
    valor_ponto_reais: 0.05,
    cupom_global_ativo: false
  });

  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/admin/configuracoes', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
           onUnauthorized();
           return;
        }

        const data = await res.json();
        if (data.sucesso && data.settings) {
          setConfig({
            is_open: data.settings.is_open,
            tempo_entrega: data.settings.tempo_entrega || '45-60 min',
            nome_loja: data.settings.nome_loja || 'Stitch Delivery',
            tagline: data.settings.tagline || 'Sabor & Qualidade',
            logo_url: data.settings.logo_url || '',
            capa_url: data.settings.capa_url || '',
            logoShape: data.settings.logoShape || 'squircle',
            theme: createStoreTheme(data.settings.theme),
            secondaryBanners: normalizeSecondaryBanners(data.settings.secondaryBanners),
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
            horarios_funcionamento: data.settings.horarios_funcionamento || config.horarios_funcionamento,
            pedido_minimo: data.settings.pedido_minimo || 0,
            frete_gratis_acima_de: data.settings.frete_gratis_acima_de || 0,
            pagamento_pix: data.settings.pagamento_pix !== false,
            pagamento_cartao: data.settings.pagamento_cartao !== false,
            pagamento_dinheiro: data.settings.pagamento_dinheiro !== false,
            chave_pix: data.settings.chave_pix || '',
            instrucoes_pix: data.settings.instrucoes_pix || '',
            banner_ativo: data.settings.banner_ativo || false,
            banner_texto: data.settings.banner_texto || '',
            fidelidade_ativa: data.settings.fidelidade_ativa || false,
            pontos_por_real: data.settings.pontos_por_real || 1,
            valor_ponto_reais: data.settings.valor_ponto_reais || 0.05,
            cupom_global_ativo: data.settings.cupom_global_ativo || false
          });
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

    setLoading(true);
    try {
      const payload = {
        ...config,
        theme: createStoreTheme(config.theme),
      };
      const res = await fetch('/api/admin/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.sucesso) {
        setConfig(payload);
        showToast('Configurações salvas com sucesso', 'success');
      }
      else showToast(data.erro || 'Erro ao salvar', 'error');
    } catch (error) { showToast('Erro ao salvar', 'error'); } 
    finally { setLoading(false); }
  };

  const showOperationSection = !focusSection || focusSection === 'operacao';
  const showAppearanceSection = !focusSection || focusSection === 'aparencia';
  const showDeliverySection = !focusSection || focusSection === 'entrega_pagamento';
  const showPromotionsSection = !focusSection || focusSection === 'promocoes_fidelidade';
  const themePreview = createStoreTheme(config.theme);
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
  const currentMeta = focusSection ? sectionMeta[focusSection] : sectionMeta.default;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 max-w-5xl mx-auto pb-10 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
        <div>
          <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <Settings className="w-8 h-8 text-emerald-600" />
            Configurações
          </h2>
          <p className="text-gray-500 mt-1 font-medium italic">Gestão operacional e visual da sua loja</p>
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full md:w-auto flex items-center justify-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-2xl hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-900/10 active:scale-[0.98]"
        >
          {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save className="w-5 h-5" />}
          Salvar Alterações
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8">
        
        {/* SEÇÃO INTEGRADA: OPERAÇÃO & HORÁRIOS (STITCH) */}
        {showOperationSection && (
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8 border-b border-gray-50 flex items-center gap-4 bg-gray-50/30">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
              <Clock className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Operação & Horários</h3>
              <p className="text-sm text-gray-500 font-bold italic mt-0.5">Controle quando sua loja está visível e aceitando pedidos.</p>
            </div>
          </div>

          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* STATUS MANUAL */}
              <div className={cn(
                "p-6 rounded-3xl border-2 transition-all flex flex-col justify-between min-h-[160px]",
                config.is_open ? "border-emerald-500/20 bg-emerald-50/30" : "border-red-500/20 bg-red-50/30"
              )}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status Atual</span>
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
                    "mt-4 w-full py-3 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-md transition-all active:scale-[0.98]",
                    config.is_open ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-red-600 text-white hover:bg-red-700"
                  )}
                >
                  {config.is_open ? 'Fechar Loja Agora' : 'Abrir Loja Agora'}
                </button>
              </div>

              {/* TEMPO DE ENTREGA */}
              <div className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">Rapidez</span>
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
                "p-6 rounded-3xl border-2 transition-all flex items-center gap-4",
                config.abertura_automatica ? "border-purple-500/20 bg-purple-50/30" : "border-gray-100 bg-gray-50/50"
              )}>
                <div className="flex-1">
                  <h4 className="text-sm font-black text-gray-900 uppercase italic">Abertura Automática</h4>
                  <p className="text-[10px] text-gray-400 font-bold mt-1">A loja abre e fecha sozinha nos horários definidos.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={config.abertura_automatica} onChange={(e) => setConfig({ ...config, abertura_automatica: e.target.checked })} />
                  <div className="w-14 h-7 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
            </div>

            {config.abertura_automatica && (
              <div className="pt-8 border-t border-gray-50 animate-in fade-in slide-in-from-top-4 space-y-6">
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-4 items-center">
                  <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-800 font-bold italic leading-tight">
                    Com o <span className="underline">Modo Automático</span> ativado, a sua loja mudará o status para <span className="font-black">Aberta</span> ou <span className="font-black">Fechada</span> automaticamente seguindo a tabela abaixo. O botão manual de status será ignorado.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <h5 className="text-xs font-black uppercase tracking-widest text-gray-400 ml-1">Escala Semanal</h5>
                    {['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'].map(dia => (
                      <div key={dia} className={cn(
                        "flex items-center gap-4 p-3 rounded-2xl border transition-all",
                        config.horarios_funcionamento[dia].aberto ? "bg-white border-purple-100 shadow-sm" : "bg-gray-50 border-gray-100 opacity-60"
                      )}>
                        <div className="w-8 flex justify-center">
                          <input type="checkbox" checked={config.horarios_funcionamento[dia].aberto} 
                              onChange={(e) => setConfig(prev => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [dia]: { ...prev.horarios_funcionamento[dia], aberto: e.target.checked } } }))}
                              className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500 border-gray-300 cursor-pointer"
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
                       <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Mensagem ao Fechar</label>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           <div className="md:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-8 space-y-6">
              <div className="flex items-center gap-3 mb-4">
                 <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <Store className="w-5 h-5 text-emerald-600" />
                 </div>
                 <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Identidade Visual</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Logo da Loja (Quadradra)</label>
                    <ImagePicker value={config.logo_url} onChange={(url) => setConfig({ ...config, logo_url: url })} width={400} height={400} aspect={1/1} bucket="loja" path="identidade" />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Banner de Capa (Panorâmica)</label>
                    <ImagePicker value={config.capa_url} onChange={(url) => setConfig({ ...config, capa_url: url })} width={1400} height={350} aspect={4/1} bucket="loja" path="identidade" />
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
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Ajuste visual</p>
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
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 transition-colors hover:bg-gray-50"
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
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Preview</span>
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
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-gray-400">Cor principal (HEX)</label>
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
                    <div className="grid grid-cols-2 gap-3 text-[10px] font-black uppercase tracking-widest text-gray-400 md:grid-cols-4">
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
              <div className="space-y-4">
                 <div>
                    <label className="block text-sm font-black text-gray-700 uppercase italic mb-1 ml-1">Banners secundarios</label>
                    <p className="text-xs text-gray-400 font-bold ml-1">Use 3 slots de imagem para montar o bloco de cards abaixo da busca e das categorias.</p>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {config.secondaryBanners.map((banner, index) => (
                      <div key={banner.id} className="rounded-[1.75rem] border border-gray-100 bg-gray-50 p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Slot {index + 1}</span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={banner.active}
                              onChange={(e) => {
                                const nextBanners = [...config.secondaryBanners];
                                nextBanners[index] = { ...nextBanners[index], active: e.target.checked };
                                setConfig({ ...config, secondaryBanners: nextBanners });
                              }}
                            />
                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                          </label>
                        </div>
                        <ImagePicker
                          value={banner.imageUrl}
                          onChange={(url) => {
                            const nextBanners = [...config.secondaryBanners];
                            nextBanners[index] = { ...nextBanners[index], imageUrl: url };
                            setConfig({ ...config, secondaryBanners: nextBanners });
                          }}
                          width={1200}
                          height={800}
                          aspect={4 / 3}
                          bucket="loja"
                          path="banners-secundarios"
                        />
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Link opcional</label>
                          <input
                            type="text"
                            value={banner.link || ''}
                            onChange={(e) => {
                              const nextBanners = [...config.secondaryBanners];
                              nextBanners[index] = { ...nextBanners[index], link: e.target.value };
                              setConfig({ ...config, secondaryBanners: nextBanners });
                            }}
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 outline-none"
                            placeholder="https:// ou /rota"
                          />
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
           </div>

           <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-8 space-y-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-6">
                   <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                      <Phone className="w-5 h-5 text-emerald-600" />
                   </div>
                   <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight italic">Contato Digital</h3>
                </div>
                <div className="space-y-6">
                   <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">WhatsApp de Atendimento</label>
                      <input type="text" value={config.whatsapp} onChange={(e) => setConfig({ ...config, whatsapp: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-gray-800 outline-none focus:border-emerald-500 transition-all" placeholder="55 11 99999-9999" />
                   </div>
                   <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Instagram (ex: @loja)</label>
                      <input type="text" value={config.instagram_url} onChange={(e) => setConfig({ ...config, instagram_url: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-gray-800 outline-none focus:border-emerald-500 transition-all" placeholder="@stitch_delivery" />
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
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-8 space-y-8">
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
                className="hidden md:flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md"
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
                 <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">CEP</label>
                 <input type="text" value={config.cep_loja} onChange={(e) => setConfig({ ...config, cep_loja: e.target.value.replace(/\D/g, '') })} onBlur={(e) => handleCepBlur(e.target.value)} maxLength={8} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold" />
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                 <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Logradouro</label>
                 <input type="text" value={config.rua_loja} onChange={(e) => setConfig({ ...config, rua_loja: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold" />
              </div>
              <div className="lg:col-span-1">
                 <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Número</label>
                 <input type="text" value={config.numero_loja} onChange={(e) => setConfig({ ...config, numero_loja: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold" />
              </div>
              <div className="lg:col-span-1">
                 <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Estado</label>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-8 space-y-6 flex flex-col justify-between">
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

           <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-8 space-y-6">
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
                   { id: 'pagamento_dinheiro', label: 'Dinheiro (Em mãos)', icon: Banknote, color: 'text-purple-500', activeClass: 'border-purple-500 bg-purple-50 text-purple-900' }
                 ].map(method => (
                    <label key={method.id} className={cn(
                       "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer",
                       config[method.id] ? method.activeClass : "border-gray-50 bg-gray-50 text-gray-400"
                    )}>
                       <input type="checkbox" checked={config[method.id]} onChange={(e) => setConfig({...config, [method.id]: e.target.checked})} className="w-5 h-5 rounded border-transparent focus:ring-0 cursor-pointer" />
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
           </div>
        </div>
        </>
        )}

        {/* FIDELIDADE & MARKETING & CUPOM (COMPACT) */}
        {showPromotionsSection && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-8 relative overflow-hidden">
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
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Pontos / Real</label>
                    <input type="number" value={config.pontos_por_real} onChange={(e) => setConfig({...config, pontos_por_real: parseFloat(e.target.value) || 0})} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 font-black text-gray-800" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Resgate (R$)</label>
                    <input type="number" step="0.01" value={config.valor_ponto_reais} onChange={(e) => setConfig({...config, valor_ponto_reais: parseFloat(e.target.value) || 0})} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 font-black text-gray-800" />
                  </div>
               </div>
             )}
           </div>

           <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-8 relative overflow-hidden">
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
               <label className="block text-[10px] font-black uppercase text-gray-400 mb-1 ml-1">Frase Chamativa</label>
               <input type="text" value={config.banner_texto} onChange={e => setConfig({ ...config, banner_texto: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 font-bold text-gray-800 italic" placeholder="Ex: Aproveite o cupom de primeira compra!" />
             </div>
           </div>
           <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-8 relative overflow-hidden">
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
    </div>
  );
}
