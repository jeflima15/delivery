// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Settings, Store, Clock, Phone, Save, Truck, Plus, Trash2, MapPin, Star, Image as ImageIcon } from 'lucide-react';
import ImagePicker from './ImagePicker';

import { useToast } from './Toast';

export default function AdminConfig({ token, onUnauthorized }: { token: string, onUnauthorized: () => void }) {
  const [config, setConfig] = useState({
    is_open: true,
    tempo_entrega: '45-60 min',
    nome_loja: 'Stitch Delivery',
    logo_url: '',
    capa_url: '',
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
    valor_ponto_reais: 0.05
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
            logo_url: data.settings.logo_url || '',
            capa_url: data.settings.capa_url || '',
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
            valor_ponto_reais: data.settings.valor_ponto_reais || 0.05
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

  const handleAddFaixa = () => {
    setConfig(prev => ({
      ...prev,
      faixas_entrega: [...prev.faixas_entrega, { km_ate: 0, valor: 0 }]
    }));
  };

  const handleUpdateFaixa = (index: number, field: 'km_ate' | 'valor', value: string) => {
    const novasFaixas = [...config.faixas_entrega];
    novasFaixas[index][field] = parseFloat(value) || 0;
    setConfig(prev => ({ ...prev, faixas_entrega: novasFaixas }));
  };

  const handleRemoveFaixa = (index: number) => {
    const novasFaixas = config.faixas_entrega.filter((_, i) => i !== index);
    setConfig(prev => ({ ...prev, faixas_entrega: novasFaixas }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/configuracoes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.sucesso) {
        showToast('Configurações salvas com sucesso', 'success');
      } else {
        showToast(data.erro || 'Erro ao salvar', 'error');
      }
    } catch (error) {
      showToast('Erro ao salvar', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 max-w-4xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Settings className="w-8 h-8 text-emerald-600" />
            Configurações
          </h2>
          <p className="text-gray-500 mt-1">Gerencie as informações e operação da sua loja.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl hover:bg-emerald-700 transition-colors font-bold shadow-sm"
        >
          {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save className="w-5 h-5" />}
          Salvar Alterações
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cartão de Operação e Identidade omitidos por brevidade... mas estão aqui! */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Store className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Operação</h3>
          </div>
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <div>
                <p className="font-semibold text-gray-900">Status da Loja</p>
                <p className="text-sm text-gray-500">Abre ou fecha o delivery.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={config.is_open} onChange={(e) => setConfig({ ...config, is_open: e.target.checked })} />
                <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Clock className="w-4 h-4 text-gray-400" /> Tempo de Entrega
              </label>
              <input type="text" value={config.tempo_entrega} onChange={(e) => setConfig({ ...config, tempo_entrega: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Identidade & Contato</h3>
          </div>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nome da Loja</label>
              <input type="text" value={config.nome_loja} onChange={(e) => setConfig({ ...config, nome_loja: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
                <label className="block text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-emerald-600" /> Logo da Loja (1:1)
                </label>
                <ImagePicker 
                  value={config.logo_url} 
                  onChange={(url) => setConfig({ ...config, logo_url: url })}
                  width={400}
                  height={400}
                  aspect={1/1}
                  bucket="loja"
                  path="identidade"
                />
                <p className="text-[10px] text-gray-500 mt-2 italic">* Imagem quadrada recomendada.</p>
              </div>

              <div className="bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
                <label className="block text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-emerald-600" /> Banner / Capa (3:1)
                </label>
                <ImagePicker 
                  value={config.capa_url} 
                  onChange={(url) => setConfig({ ...config, capa_url: url })}
                  width={1400}
                  height={350}
                  aspect={4/1}
                  bucket="loja"
                  path="identidade"
                />
                <p className="text-[10px] text-gray-500 mt-2 italic">* Imagem larga otimizada (4:1).</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">WhatsApp</label>
              <input type="text" value={config.whatsapp} onChange={(e) => setConfig({ ...config, whatsapp: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Instagram (ex: @sua_loja)</label>
              <input type="text" value={config.instagram_url} onChange={(e) => setConfig({ ...config, instagram_url: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="@b3xburger" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Texto "Sobre a Loja"</label>
              <textarea rows={4} value={config.sobre_texto} onChange={(e) => setConfig({ ...config, sobre_texto: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none" placeholder="Conte um pouco sobre sua loja, experiência, etc..." />
            </div>
          </div>
        </div>

        {/* 👇 Endereço Base da Loja 👇 */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Endereço de Origem (Sua Loja)</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
              <input
                type="text"
                value={config.cep_loja}
                onChange={(e) => setConfig({ ...config, cep_loja: e.target.value.replace(/\D/g, '') })}
                onBlur={(e) => handleCepBlur(e.target.value)}
                maxLength={8}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"
                placeholder="Apenas números"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Rua / Avenida</label>
              <input type="text" value={config.rua_loja} onChange={(e) => setConfig({ ...config, rua_loja: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
              <input type="text" value={config.numero_loja} onChange={(e) => setConfig({ ...config, numero_loja: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
              <input type="text" value={config.bairro_loja} onChange={(e) => setConfig({ ...config, bairro_loja: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input type="text" value={config.cidade_loja} onChange={(e) => setConfig({ ...config, cidade_loja: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <input type="text" value={config.estado_loja} maxLength={2} onChange={(e) => setConfig({ ...config, estado_loja: e.target.value.toUpperCase() })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl" />
            </div>
          </div>
        </div>

        {/* 👇 Faixas de Entrega Dinâmicas 👇 */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Truck className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Faixas de Entrega</h3>
                <p className="text-sm text-gray-500">Defina o valor cobrado pela distância.</p>
              </div>
            </div>
            <button onClick={handleAddFaixa} className="flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl hover:bg-emerald-100">
              <Plus className="w-4 h-4" /> Adicionar Faixa
            </button>
          </div>

          <div className="space-y-3">
            {config.faixas_entrega.length === 0 ? (
              <div className="text-center p-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-500">
                Nenhuma faixa de entrega configurada. O frete será grátis.
              </div>
            ) : (
              config.faixas_entrega.map((faixa, index) => (
                <div key={index} className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Entregar Até (KM)</label>
                    <input
                      type="number" step="0.1" min="0" value={faixa.km_ate}
                      onChange={(e) => handleUpdateFaixa(index, 'km_ate', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Valor do Frete (R$)</label>
                    <input
                      type="number" step="0.1" min="0" value={faixa.valor}
                      onChange={(e) => handleUpdateFaixa(index, 'valor', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button onClick={() => handleRemoveFaixa(index)} className="mt-5 p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))
            )}
            <p className="text-xs text-gray-400 mt-4">* Dica: Se a distância do cliente for maior que o KM máximo cadastrado, o sistema dirá "Não entregamos nesta região".</p>
          </div>
        </div>

        {/* 👇 Gestão de Horários 👇 */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Horário de Funcionamento</h3>
              <p className="text-sm text-gray-500">Configure a abertura automática da loja.</p>
            </div>
          </div>

          <div className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">Modo Automático</p>
              <p className="text-sm text-gray-500">A loja abre e fecha sozinha conforme a tabela de horários abaixo.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={config.abertura_automatica} onChange={(e) => setConfig({ ...config, abertura_automatica: e.target.checked })} />
              <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-500"></div>
            </label>
          </div>

          {config.abertura_automatica && (
            <div className="animate-in fade-in slide-in-from-top-4">
              <div className="grid grid-cols-1 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mensagem Exibida ao Fechar</label>
                  <input type="text" value={config.mensagem_fechado} onChange={(e) => setConfig({ ...config, mensagem_fechado: e.target.value })} placeholder="Ex: Voltamos apenas às 18h..." className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none" />
                </div>
              </div>

              <div className="space-y-3">
                {['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'].map(dia => (
                  <div key={dia} className="flex flex-col md:flex-row items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div className="w-32 flex items-center gap-2">
                      <input type="checkbox" checked={config.horarios_funcionamento[dia].aberto} 
                          onChange={(e) => setConfig(prev => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [dia]: { ...prev.horarios_funcionamento[dia], aberto: e.target.checked } } }))}
                          className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500 border-gray-300 cursor-pointer"
                      />
                      <span className="font-semibold text-gray-700 capitalize cursor-pointer" onClick={() => setConfig(prev => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [dia]: { ...prev.horarios_funcionamento[dia], aberto: !prev.horarios_funcionamento[dia].aberto } } }))}>{dia}</span>
                    </div>
                    
                    {config.horarios_funcionamento[dia].aberto ? (
                      <div className="flex items-center gap-4 flex-1 w-full animate-in fade-in">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1 font-semibold">Abre às</label>
                          <input type="time" value={config.horarios_funcionamento[dia].inicio} onChange={(e) => setConfig(prev => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [dia]: { ...prev.horarios_funcionamento[dia], inicio: e.target.value } } }))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1 font-semibold">Fecha às</label>
                          <input type="time" value={config.horarios_funcionamento[dia].fim} onChange={(e) => setConfig(prev => ({ ...prev, horarios_funcionamento: { ...prev.horarios_funcionamento, [dia]: { ...prev.horarios_funcionamento[dia], fim: e.target.value } } }))} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 text-sm text-gray-400 italic bg-gray-100 px-4 py-3 rounded-xl border border-dashed border-gray-200 w-full md:w-auto mt-2 md:mt-0">Loja fechada (Não opera neste dia)</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 👇 Regras Comerciais e Pagamentos 👇 */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:col-span-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-bl-[100px] -z-10 opacity-50"></div>
          
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Store className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Regras Comerciais e Pagamentos</h3>
              <p className="text-sm text-gray-500">Configure métricas de vendas e meios de recebimento.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Pedido Mínimo (R$)</label>
              <input type="number" step="0.5" value={config.pedido_minimo} onChange={(e) => setConfig({ ...config, pedido_minimo: parseFloat(e.target.value) || 0 })} placeholder="0.00" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all" />
              <p className="text-xs text-gray-500 mt-1">Valor mínimo que o cliente precisa gastar para finalizar.</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Frete Grátis Acima De (R$)</label>
              <input type="number" step="0.5" value={config.frete_gratis_acima_de} onChange={(e) => setConfig({ ...config, frete_gratis_acima_de: parseFloat(e.target.value) || 0 })} placeholder="0 para desabilitar" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all" />
              <p className="text-xs text-gray-500 mt-1">Acima deste valor, o frete da faixa será zerado (Deixe 0 para não usar).</p>
            </div>
          </div>

          <hr className="border-gray-100 my-6" />
          
          <h4 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Métodos de Pagamento Permitidos</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer ${config.pagamento_pix ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 bg-gray-50'}`}>
              <input type="checkbox" checked={config.pagamento_pix} onChange={(e) => setConfig({...config, pagamento_pix: e.target.checked})} className="w-5 h-5 mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
              <div className="flex-1">
                <p className="font-bold text-gray-900 leading-tight">PIX / Transferência</p>
                <p className="text-xs text-gray-500 mt-1">Paga no final do pedido e envia comprovante</p>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer ${config.pagamento_cartao ? 'border-amber-500 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
              <input type="checkbox" checked={config.pagamento_cartao} onChange={(e) => setConfig({...config, pagamento_cartao: e.target.checked})} className="w-5 h-5 mt-0.5 rounded text-amber-600 focus:ring-amber-500" />
              <div className="flex-1">
                <p className="font-bold text-gray-900 leading-tight">Cartão na Entrega</p>
                <p className="text-xs text-gray-500 mt-1">Motoqueiro leva a maquininha</p>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer ${config.pagamento_dinheiro ? 'border-purple-500 bg-purple-50' : 'border-gray-100 bg-gray-50'}`}>
              <input type="checkbox" checked={config.pagamento_dinheiro} onChange={(e) => setConfig({...config, pagamento_dinheiro: e.target.checked})} className="w-5 h-5 mt-0.5 rounded text-purple-600 focus:ring-purple-500" />
              <div className="flex-1">
                <p className="font-bold text-gray-900 leading-tight">Dinheiro Físico</p>
                <p className="text-xs text-gray-500 mt-1">Exigirá cálculo de troco no app</p>
              </div>
            </label>
          </div>

          {config.pagamento_pix && (
             <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 animate-in fade-in slide-in-from-top-4">
                <h4 className="text-sm font-bold text-emerald-900 mb-4 flex items-center gap-2">Configuração do PIX</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-emerald-800 mb-1">Chave PIX (Telefone, CPF, Email ou Aleatória)</label>
                    <input type="text" value={config.chave_pix} onChange={(e) => setConfig({...config, chave_pix: e.target.value})} placeholder="Sua chave aqui" className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-emerald-800 mb-1">Instruções para o Cliente (Opcional)</label>
                    <input type="text" value={config.instrucoes_pix} onChange={(e) => setConfig({...config, instrucoes_pix: e.target.value})} placeholder="Ex: Envie o comprovante no nosso WhatsApp" className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                </div>
             </div>
          )}

          </div>
        </div>

        {/* 👇 PROGRAMA DE FIDELIDADE 👇 */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:col-span-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-[100px] -z-10 opacity-40"></div>
          
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Star className="w-5 h-5 text-purple-600 fill-purple-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Programa de Fidelidade Clube Stitch</h3>
              <p className="text-sm text-gray-500 font-medium italic">Transforme compras em recompensas exclusivas e fidelize seus clientes.</p>
            </div>
          </div>

          <div className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">Ativar Programa de Fidelidade</p>
              <p className="text-xs text-gray-500 mt-1">Clientes ganham pontos a cada pedido concluído.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={config.fidelidade_ativa} onChange={(e) => setConfig({...config, fidelidade_ativa: e.target.checked})} />
              <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {config.fidelidade_ativa && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Pontos por cada R$ 1,00 gasto</label>
                <div className="flex items-center gap-3">
                  <input type="number" value={config.pontos_por_real} onChange={(e) => setConfig({...config, pontos_por_real: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                  <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">Pts / Real</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">Ex: 1 ponto por real. Gastou R$ 50,00, ganha 50 pontos.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Valor de cada 1 ponto (R$)</label>
                <div className="flex items-center gap-3">
                   <span className="text-sm font-bold text-emerald-600">R$</span>
                   <input type="number" step="0.01" value={config.valor_ponto_reais} onChange={(e) => setConfig({...config, valor_ponto_reais: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <p className="text-xs text-gray-400 mt-2">Ex: 0,05 (R$ 0,05). 100 pontos darão R$ 5,00 de desconto.</p>
              </div>
            </div>
          )}
        </div>

        {/* SEÇÃO 6: MARKETING E COMUNICAÇÃO PROMOCIONAL */}

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-emerald-50/50 p-6 border-b border-gray-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
            <Store className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Marketing e Vitrine</h2>
            <p className="text-sm text-gray-500">Banner promocional no topo da sua loja.</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-200">
            <div>
              <p className="font-bold text-gray-900">Exibir Banner Promocional</p>
              <p className="text-xs text-gray-500 mt-1">Acende uma faixa chamativa no topo do menu do cliente.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={config.banner_ativo} onChange={(e) => setConfig({...config, banner_ativo: e.target.checked})} />
              <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Texto do Banner (Aviso)</label>
            <input 
              type="text" 
              value={config.banner_texto} 
              onChange={e => setConfig({ ...config, banner_texto: e.target.value })} 
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none"
              placeholder="Ex: Hoje frete grátis nas compras acima de R$ 60!" 
            />
          </div>
        </div>
      </div>
    </div>
  );
}