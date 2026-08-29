import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronLeft, Image as ImageIcon, PackagePlus, Plus, Search, Star, Tag, Trash2, UtensilsCrossed, X } from 'lucide-react';
import ImagePicker from './ImagePicker';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { useToast } from './Toast';

type ComboOption = { _id?: string; produtoId: string; acrescimo_centavos: number; ordem: number };
type ComboStage = {
  _id?: string;
  clientId: string;
  nome: string;
  ordem: number;
  valor_etapa_centavos: number;
  cobrar_complementos: boolean;
  opcoes: ComboOption[];
};

const cents = (value: unknown) => Math.max(0, Math.round(Number(value || 0) * 100));
const reais = (value: number) => (Number(value || 0) / 100).toFixed(2);
const persistentId = (value: unknown) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? value : undefined;
const clientId = () => globalThis.crypto?.randomUUID?.() || `stage-${Date.now()}-${Math.random()}`;

export default function AdminComboEditor({
  combo,
  categories,
  products,
  onClose,
  onSaved,
}: {
  combo?: any;
  categories: any[];
  products: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useTenantAdminApi();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerStage, setPickerStage] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerCategory, setPickerCategory] = useState('all');
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [form, setForm] = useState(() => ({
    nome: combo?.nome || '',
    descricao: combo?.descricao || '',
    imagem: combo?.imagem || '',
    categoriaId: combo?.categoriaId?._id || combo?.categoriaId || '',
    ativo: combo?.ativo !== false,
    destaque: Boolean(combo?.destaque),
    selo_destaque: combo?.selo_destaque || '',
    permite_talheres: Boolean(combo?.permite_talheres),
  }));
  const [stages, setStages] = useState<ComboStage[]>(() => (combo?.combo_etapas || []).map((stage: any, index: number) => ({
    _id: persistentId(stage._id), clientId: clientId(), nome: stage.nome || '', ordem: index,
    valor_etapa_centavos: Number(stage.valor_etapa_centavos || 0),
    cobrar_complementos: stage.cobrar_complementos !== false,
    opcoes: (stage.opcoes || []).map((option: any, optionIndex: number) => ({
      _id: persistentId(option._id), produtoId: String(option.produtoId?._id || option.produtoId),
      acrescimo_centavos: Number(option.acrescimo_centavos || 0), ordem: optionIndex,
    })),
  })));

  const normalProducts = useMemo(() => products.filter((product) => product.tipo !== 'combo'), [products]);
  const productById = useMemo(() => new Map(normalProducts.map((product) => [String(product._id), product])), [normalProducts]);
  const startingPrice = stages.reduce((total, stage) => total + stage.valor_etapa_centavos + (stage.opcoes.length ? Math.min(...stage.opcoes.map((option) => option.acrescimo_centavos)) : 0), 0);
  const filteredPickerProducts = normalProducts.filter((product) => {
    const categoryId = String(product.categoriaId?._id || product.categoriaId || '');
    return product.nome?.toLowerCase().includes(pickerSearch.toLowerCase()) && (pickerCategory === 'all' || categoryId === pickerCategory);
  });

  const updateStage = (index: number, patch: Partial<ComboStage>) => setStages((current) => current.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patch } : stage));
  const addStage = () => setStages((current) => [...current, {
    clientId: clientId(), nome: '', ordem: current.length, valor_etapa_centavos: 0,
    cobrar_complementos: true, opcoes: [],
  }]);
  const moveStage = (index: number, direction: -1 | 1) => setStages((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next.map((stage, stageIndex) => ({ ...stage, ordem: stageIndex }));
  });
  const openPicker = (index: number) => {
    setPickerStage(index);
    setPickerSelection(stages[index].opcoes.map((option) => option.produtoId));
    setPickerSearch('');
    setPickerCategory('all');
  };
  const applyPicker = () => {
    if (pickerStage === null) return;
    const previous = new Map(stages[pickerStage].opcoes.map((option) => [option.produtoId, option]));
    updateStage(pickerStage, { opcoes: pickerSelection.map((produtoId, index) => previous.get(produtoId) || { produtoId, acrescimo_centavos: 0, ordem: index }) });
    setPickerStage(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.nome.trim() || !form.categoriaId) return showToast('Informe nome e categoria do combo.', 'error');
    if (!stages.length || stages.some((stage) => stage.nome.trim().length < 2 || stage.opcoes.length === 0)) {
      return showToast('Todas as etapas precisam de nome e ao menos um produto.', 'error');
    }
    setSaving(true);
    try {
      const payload = {
        tipo: 'combo', ...form, preco: startingPrice / 100, preco_antigo: 0,
        personalizavel: false, quantidade_total_opcoes: 0, opcoes_disponiveis: [],
        controlar_estoque: false, estoque: 0, estoque_minimo: 0, esgotado: false,
        pode_resgatar: false, pontos_resgate: 0, grupos_adicionais: [],
        combo_etapas: stages.map((stage, index) => ({
          ...(stage._id ? { _id: stage._id } : {}), nome: stage.nome.trim(), ordem: index,
          valor_etapa_centavos: stage.valor_etapa_centavos, cobrar_complementos: stage.cobrar_complementos,
          opcoes: stage.opcoes.map((option, optionIndex) => ({
            ...(option._id ? { _id: option._id } : {}), produtoId: option.produtoId,
            acrescimo_centavos: option.acrescimo_centavos, ordem: optionIndex,
          })),
        })),
      };
      const response = combo?._id ? await api.updateProduct(combo._id, payload) : await api.createProduct(payload);
      if (response.success) {
        showToast(combo?._id ? 'Combo atualizado!' : 'Combo criado!', 'success');
        onSaved();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Nao foi possivel salvar o combo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-5" role="dialog" aria-modal="true">
      <div className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-white sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Voltar"><ChevronLeft className="h-5 w-5" /></button>
            <div><p className="text-sm font-bold text-slate-900">{combo?._id ? 'Editar combo' : 'Novo combo por etapas'}</p><p className="text-xs text-slate-500">Monte uma escolha obrigatoria por etapa.</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </header>

        <form id="admin-combo-form" onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-5">
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">Informacoes</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-700">Nome<input required value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500" /></label>
                  <label className="text-xs font-medium text-slate-700">Categoria<select required value={form.categoriaId} onChange={(event) => setForm({ ...form, categoriaId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"><option value="">Selecione</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.nome}</option>)}</select></label>
                  <label className="sm:col-span-2 text-xs font-medium text-slate-700">Descricao<textarea rows={3} value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500" /></label>
                  <div className="sm:col-span-2 pt-2 border-t border-slate-100 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })} className="h-4 w-4 rounded text-emerald-600" />
                        Combo ativo no cardapio
                      </label>

                      <label className="flex items-center gap-2 text-xs font-medium text-amber-900 cursor-pointer">
                        <input type="checkbox" checked={form.destaque} onChange={(event) => setForm({ ...form, destaque: event.target.checked })} className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500" />
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                        Exibir no topo (Destaques)
                      </label>
                    </div>

                    <div className="rounded-xl border border-teal-200/80 bg-teal-50/40 p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <UtensilsCrossed className="h-4 w-4 text-teal-700 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-teal-950">Talheres descartáveis</p>
                            <p className="text-[10px] text-teal-800/80">Oferecer opção de talheres na sacola quando este combo for adicionado</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={form.permite_talheres || false}
                          onChange={(e) => setForm({ ...form, permite_talheres: e.target.checked })}
                          className="h-4 w-4 rounded border-teal-300 text-teal-700 focus:ring-teal-600 cursor-pointer shrink-0"
                        />
                      </div>
                      {form.permite_talheres && (
                        <p className="text-[10px] text-teal-700/90 font-medium bg-white/70 rounded-lg p-2 border border-teal-200/60">
                          💡 O valor cobrado pelo talher (ou se é gratuito) é configurado para a loja toda em <strong>Loja → Entrega e Pagamento</strong>.
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5 text-slate-500" />
                          Etiqueta no Card (Selo)
                        </label>
                        {form.selo_destaque && (
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, selo_destaque: '' })}
                            className="text-[10px] font-semibold text-rose-600 hover:underline cursor-pointer"
                          >
                            Remover etiqueta
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {[
                          { label: 'Sem etiqueta', value: '' },
                          { label: 'Mais pedido', value: 'Mais pedido' },
                          { label: 'Mais vendido', value: 'Mais vendido' },
                          { label: 'Recomendado', value: 'Recomendado' },
                          { label: 'Novidade', value: 'Novidade' },
                          { label: 'Especial', value: 'Especial' },
                        ].map((preset) => {
                          const isSelected = (form.selo_destaque || '').trim().toLowerCase() === preset.value.toLowerCase();
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => setForm({ ...form, selo_destaque: preset.value })}
                              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors border cursor-pointer ${
                                isSelected
                                  ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        value={form.selo_destaque}
                        onChange={(event) => setForm({ ...form, selo_destaque: event.target.value })}
                        placeholder="Ou digite um texto personalizado (ex: Sugestão do Chef)"
                        maxLength={40}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-end justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900">Etapas</h3><p className="text-xs text-slate-500">O cliente escolhe exatamente um produto em cada etapa.</p></div><button type="button" onClick={addStage} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><Plus className="h-3.5 w-3.5" /> Adicionar etapa</button></div>
                {stages.length === 0 && <button type="button" onClick={addStage} className="flex w-full flex-col items-center rounded-xl border border-dashed border-slate-300 py-10 text-slate-500 hover:border-emerald-400 hover:bg-emerald-50/30"><PackagePlus className="mb-2 h-7 w-7" /><span className="text-sm font-semibold">Crie a primeira etapa</span></button>}
                {stages.map((stage, index) => (
                  <article key={stage.clientId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">{index + 1}</span>
                      <div className="min-w-0 flex-1 space-y-3">
                        <input value={stage.nome} onChange={(event) => updateStage(index, { nome: event.target.value })} placeholder="Ex.: Escolha seu hamburguer" className="w-full border-0 border-b border-slate-200 px-0 pb-2 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500" />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-medium text-slate-700">Valor da etapa (R$)<input type="number" min="0" step="0.01" value={reais(stage.valor_etapa_centavos)} onChange={(event) => updateStage(index, { valor_etapa_centavos: cents(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /><span className="mt-1 block text-[11px] font-normal text-slate-500">Parte fixa que esta etapa soma ao combo.</span></label>
                          <fieldset><legend className="text-xs font-medium text-slate-700">Cobranca de adicionais</legend><div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs"><button type="button" onClick={() => updateStage(index, { cobrar_complementos: true })} className={`rounded-md px-2 py-2 font-medium ${stage.cobrar_complementos ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>Cobrar normalmente</button><button type="button" onClick={() => updateStage(index, { cobrar_complementos: false })} className={`rounded-md px-2 py-2 font-medium ${!stage.cobrar_complementos ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>Incluir sem custo</button></div></fieldset>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                          {stage.opcoes.map((option, optionIndex) => {
                            const product = productById.get(option.produtoId);
                            return <div key={option.produtoId} className="flex items-center gap-3 border-b border-slate-100 p-2.5 last:border-0">
                              {product?.imagem ? <img src={product.imagem} alt="" className="h-10 w-10 rounded-md object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100"><ImageIcon className="h-4 w-4 text-slate-400" /></span>}
                              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-900">{product?.nome || 'Produto indisponivel'}</p><p className="text-[11px] text-slate-500">Avulso: R$ {Number(product?.preco || 0).toFixed(2).replace('.', ',')}</p></div>
                              <label className="w-28 text-[10px] font-medium text-slate-500">Acrescimo da opcao<input type="number" min="0" step="0.01" value={reais(option.acrescimo_centavos)} onChange={(event) => updateStage(index, { opcoes: stage.opcoes.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, acrescimo_centavos: cents(event.target.value) } : item) })} className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-900" /></label>
                              <button type="button" onClick={() => updateStage(index, { opcoes: stage.opcoes.filter((_, itemIndex) => itemIndex !== optionIndex) })} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remover produto"><Trash2 className="h-4 w-4" /></button>
                            </div>;
                          })}
                          <button type="button" onClick={() => openPicker(index)} className="flex w-full items-center justify-center gap-1.5 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><Plus className="h-3.5 w-3.5" /> Adicionar produtos</button>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col"><button type="button" disabled={index === 0} onClick={() => moveStage(index, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button type="button" disabled={index === stages.length - 1} onClick={() => moveStage(index, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button><button type="button" onClick={() => setStages((current) => current.filter((_, stageIndex) => stageIndex !== index).map((item, stageIndex) => ({ ...item, ordem: stageIndex })))} className="mt-1 rounded p-1 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div>
                    </div>
                  </article>
                ))}
              </section>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">Preco exibido no catalogo</p><p className="mt-1 text-xl font-bold text-emerald-700">A partir de R$ {reais(startingPrice).replace('.', ',')}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">Calculado pela soma das etapas e do menor acrescimo disponivel. O total final inclui as escolhas e adicionais do cliente.</p></div>
              <ImagePicker label="Foto do combo" value={form.imagem} onChange={(imagem) => setForm({ ...form, imagem })} onUploadStatus={setUploading} />
            </aside>
          </div>
        </form>
        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700">Cancelar</button><button type="submit" form="admin-combo-form" disabled={saving || uploading} className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar combo'}</button></footer>
      </div>

      {pickerStage !== null && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5" onMouseDown={(event) => event.stopPropagation()}><div className="flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-white sm:rounded-2xl"><header className="flex items-center justify-between border-b border-slate-200 p-4"><div><h3 className="text-sm font-bold text-slate-900">Adicionar produtos</h3><p className="text-xs text-slate-500">Selecione varios produtos normais de uma vez.</p></div><button type="button" onClick={() => setPickerStage(null)} className="rounded-full bg-slate-100 p-2"><X className="h-4 w-4" /></button></header><div className="grid gap-2 border-b border-slate-200 p-3 sm:grid-cols-[1fr_220px]"><label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Buscar produto" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm" /></label><select value={pickerCategory} onChange={(event) => setPickerCategory(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="all">Todas as categorias</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.nome}</option>)}</select></div><div className="min-h-0 flex-1 overflow-y-auto p-3">{filteredPickerProducts.map((product) => { const selected = pickerSelection.includes(String(product._id)); return <button type="button" key={product._id} onClick={() => setPickerSelection((current) => selected ? current.filter((id) => id !== String(product._id)) : [...current, String(product._id)])} className={`mb-2 flex w-full items-center gap-3 rounded-lg border p-2.5 text-left ${selected ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>{product.imagem ? <img src={product.imagem} alt="" className="h-11 w-11 rounded-md object-cover" /> : <span className="h-11 w-11 rounded-md bg-slate-100" />}<span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{product.nome}</strong><span className="text-[11px] text-slate-500">{product.categoriaId?.nome || 'Sem categoria'} · R$ {Number(product.preco || 0).toFixed(2).replace('.', ',')}</span></span><span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>{selected && <Check className="h-3.5 w-3.5" />}</span></button>; })}</div><footer className="flex items-center justify-between border-t border-slate-200 p-4"><span className="text-xs text-slate-500">{pickerSelection.length} selecionado(s)</span><button type="button" onClick={applyPicker} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Adicionar selecionados</button></footer></div></div>}
    </div>
  );
}
