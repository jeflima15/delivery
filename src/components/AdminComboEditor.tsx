import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Copy,
  Eye,
  Image as ImageIcon,
  Info,
  Layers,
  ListOrdered,
  Minus,
  PackageCheck,
  PackagePlus,
  Plus,
  Search,
  Sparkles,
  Star,
  Tag,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import ImagePicker from './ImagePicker';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { useToast } from './Toast';
import type { Category, ComboMode, Product } from '../types/storefront';

interface InternalOption {
  _id?: string;
  produtoId: string;
  acrescimo_centavos: number;
  ordem: number;
}

interface InternalStage {
  _id?: string;
  clientId: string;
  nome: string;
  ordem: number;
  valor_etapa_centavos: number;
  cobrar_complementos: boolean;
  opcoes: InternalOption[];
}

interface InternalFixedItem {
  produtoId: string;
  quantidade: number;
}

const cents = (value: unknown) => Math.max(0, Math.round(Number(value || 0) * 100));
const reais = (value: number) => (Number(value || 0) / 100).toFixed(2);
const persistentId = (value: unknown) => (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? value : undefined);
const clientId = () => globalThis.crypto?.randomUUID?.() || `stage-${Date.now()}-${Math.random()}`;

export default function AdminComboEditor({
  combo,
  categories,
  products,
  onClose,
  onSaved,
}: {
  combo?: Product;
  categories: Category[];
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useTenantAdminApi();
  const { showToast } = useToast();

  const [availableProducts, setAvailableProducts] = useState<Product[]>(products);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Initial mode resolution
  const initialMode: ComboMode | null = useMemo(() => {
    if (!combo?._id) return null;
    if (combo.combo_mode === 'fixed' || (Array.isArray(combo.combo_itens_fixos) && combo.combo_itens_fixos.length > 0 && (!combo.combo_etapas || combo.combo_etapas.length === 0))) {
      return 'fixed';
    }
    return 'stages';
  }, [combo]);

  const [comboMode, setComboMode] = useState<ComboMode | null>(initialMode);
  const [showSwitchModeConfirm, setShowSwitchModeConfirm] = useState<ComboMode | null>(null);

  // Forms
  const [form, setForm] = useState(() => ({
    nome: combo?.nome || '',
    descricao: combo?.descricao || '',
    imagem: combo?.imagem || '',
    categoriaId: typeof combo?.categoriaId === 'object' && combo?.categoriaId ? (combo.categoriaId as any)._id : (combo?.categoriaId || ''),
    ativo: combo?.ativo !== false,
    destaque: Boolean(combo?.destaque),
    selo_destaque: combo?.selo_destaque || '',
    permite_talheres: Boolean(combo?.permite_talheres),
    preco_base_centavos: typeof combo?.combo_preco_base_centavos === 'number'
      ? combo.combo_preco_base_centavos
      : (typeof combo?.preco_centavos === 'number' ? combo.preco_centavos : cents(combo?.preco)),
  }));

  // Fixed items state
  const [fixedItems, setFixedItems] = useState<InternalFixedItem[]>(() => {
    if (combo?.combo_itens_fixos && combo.combo_itens_fixos.length > 0) {
      return combo.combo_itens_fixos.map((item) => ({
        produtoId: String((item as any).produtoId?._id || item.produtoId),
        quantidade: Number(item.quantidade || 1),
      }));
    }
    return [];
  });

  // Stages state
  const [stages, setStages] = useState<InternalStage[]>(() =>
    (combo?.combo_etapas || []).map((stage: any, index: number) => ({
      _id: persistentId(stage._id),
      clientId: clientId(),
      nome: stage.nome || '',
      ordem: index,
      valor_etapa_centavos: Number(stage.valor_etapa_centavos || 0),
      cobrar_complementos: stage.cobrar_complementos !== false,
      opcoes: (stage.opcoes || []).map((option: any, optionIndex: number) => ({
        _id: persistentId(option._id),
        produtoId: String(option.produtoId?._id || option.produtoId),
        acrescimo_centavos: Number(option.acrescimo_centavos || 0),
        ordem: optionIndex,
      })),
    }))
  );

  const [collapsedStages, setCollapsedStages] = useState<Record<string, boolean>>({});

  // Product Picker Modal state
  const [pickerTarget, setPickerTarget] = useState<'fixed' | number | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerCategory, setPickerCategory] = useState('all');
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);

  // Quick Exclusive Item Modal state
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [creatingQuick, setCreatingQuick] = useState(false);
  const [quickForm, setQuickForm] = useState(() => ({
    nome: '',
    descricao: '',
    preco: 0,
    categoriaId: categories[0]?._id || '',
    imagem: '',
    controlar_estoque: false,
    estoque: 0,
  }));

  // Simulator / Customer Preview Modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [simulatedStageSelections, setSimulatedStageSelections] = useState<Record<string, string>>({});
  const [simulatedQuantity, setSimulatedQuantity] = useState(1);

  // Unsaved Changes Discard Confirmation
  const [showConfirmDiscard, setShowConfirmDiscard] = useState(false);

  const normalProducts = useMemo(
    () => availableProducts.filter((product) => product.tipo !== 'combo'),
    [availableProducts]
  );
  const productById = useMemo(
    () => new Map(normalProducts.map((product) => [String(product._id || product.id), product])),
    [normalProducts]
  );

  // Filtered products inside picker
  const filteredPickerProducts = useMemo(() => {
    return normalProducts.filter((product) => {
      const categoryId = String((product.categoriaId as any)?._id || product.categoriaId || '');
      const matchesSearch = product.nome?.toLowerCase().includes(pickerSearch.toLowerCase());
      const matchesCategory = pickerCategory === 'all' || categoryId === pickerCategory;
      return matchesSearch && matchesCategory;
    });
  }, [normalProducts, pickerSearch, pickerCategory]);

  // Price calculations
  const startingPrice = useMemo(() => {
    if (comboMode === 'fixed') {
      return form.preco_base_centavos || 0;
    }
    const base = form.preco_base_centavos || 0;
    const stagesMin = stages.reduce((total, stage) => {
      const minExtra = stage.opcoes.length ? Math.min(...stage.opcoes.map((option) => option.acrescimo_centavos)) : 0;
      return total + stage.valor_etapa_centavos + (isFinite(minExtra) ? minExtra : 0);
    }, 0);
    return base + stagesMin;
  }, [comboMode, form.preco_base_centavos, stages]);

  // Fixed combo single reference price sum
  const fixedReferenceSumCents = useMemo(() => {
    if (comboMode !== 'fixed') return 0;
    return fixedItems.reduce((acc, item) => {
      const prod = productById.get(item.produtoId);
      const prodPriceCents = typeof prod?.preco_centavos === 'number' ? prod.preco_centavos : cents(prod?.preco);
      return acc + prodPriceCents * item.quantidade;
    }, 0);
  }, [comboMode, fixedItems, productById]);

  // Status helper for any product
  const getProductHealth = (prod?: Product, requiredQty = 1) => {
    if (!prod) return { status: 'error', label: 'Item excluído', color: 'text-rose-600 bg-rose-50 border-rose-200' };
    if (prod.ativo === false) return { status: 'error', label: 'Inativo', color: 'text-slate-600 bg-slate-100 border-slate-200' };
    if (prod.esgotado) return { status: 'error', label: 'Esgotado', color: 'text-rose-700 bg-rose-50 border-rose-200' };
    if (prod.controlar_estoque) {
      const stock = Number(prod.estoque || 0);
      if (stock < requiredQty) return { status: 'error', label: `Estoque insuficiente (${stock}/${requiredQty})`, color: 'text-rose-700 bg-rose-50 border-rose-200' };
      if (stock <= Number(prod.estoque_minimo || 0)) return { status: 'warning', label: `Estoque baixo (${stock})`, color: 'text-amber-800 bg-amber-50 border-amber-200' };
      return { status: 'success', label: `Estoque: ${stock} un`, color: 'text-blue-700 bg-blue-50 border-blue-200' };
    }
    return { status: 'success', label: 'Disponível', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  };

  // Stage health helper
  const getStageHealth = (stage: InternalStage) => {
    if (stage.opcoes.length === 0) return { status: 'empty', label: 'Incompleta (sem itens)', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    const availableCount = stage.opcoes.filter((opt) => {
      const p = productById.get(opt.produtoId);
      return p && p.ativo !== false && !p.esgotado && (!p.controlar_estoque || Number(p.estoque || 0) > 0);
    }).length;

    if (availableCount === 0) return { status: 'error', label: 'Indisponível (todas esgotadas)', color: 'text-rose-700 bg-rose-50 border-rose-200' };
    if (availableCount < stage.opcoes.length) return { status: 'warning', label: `${availableCount} disp. · ${stage.opcoes.length - availableCount} esgotada(s)`, color: 'text-amber-800 bg-amber-50 border-amber-200' };
    return { status: 'success', label: `Pronta (${stage.opcoes.length} opções)`, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  };

  // Fixed items actions
  const updateFixedItemQuantity = (produtoId: string, delta: number) => {
    setFixedItems((prev) =>
      prev
        .map((item) => (item.produtoId === produtoId ? { ...item, quantidade: Math.max(1, item.quantidade + delta) } : item))
        .filter((item) => item.quantidade > 0)
    );
  };

  const removeFixedItem = (produtoId: string) => {
    setFixedItems((prev) => prev.filter((item) => item.produtoId !== produtoId));
  };

  // Stage actions
  const updateStage = (index: number, patch: Partial<InternalStage>) => {
    setStages((current) => current.map((stage, stageIndex) => (stageIndex === index ? { ...stage, ...patch } : stage)));
  };

  const addStage = () => {
    setStages((current) => [
      ...current,
      {
        clientId: clientId(),
        nome: '',
        ordem: current.length,
        valor_etapa_centavos: 0,
        cobrar_complementos: true,
        opcoes: [],
      },
    ]);
  };

  const duplicateStage = (index: number) => {
    const original = stages[index];
    if (!original) return;
    const duplicated: InternalStage = {
      clientId: clientId(),
      nome: `${original.nome} (Cópia)`.trim(),
      ordem: stages.length,
      valor_etapa_centavos: original.valor_etapa_centavos,
      cobrar_complementos: original.cobrar_complementos,
      opcoes: original.opcoes.map((opt, optIndex) => ({
        ...opt,
        _id: undefined,
        ordem: optIndex,
      })),
    };
    setStages((current) => [...current, duplicated]);
    showToast(`Etapa "${original.nome}" duplicada!`, 'success');
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    setStages((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((stage, stageIndex) => ({ ...stage, ordem: stageIndex }));
    });
  };

  const deleteStage = (index: number) => {
    setStages((current) =>
      current.filter((_, stageIndex) => stageIndex !== index).map((item, stageIndex) => ({ ...item, ordem: stageIndex }))
    );
  };

  // Picker modal controls
  const openPickerForFixed = () => {
    setPickerTarget('fixed');
    setPickerSelection(fixedItems.map((item) => item.produtoId));
    setPickerSearch('');
    setPickerCategory('all');
  };

  const openPickerForStage = (stageIndex: number) => {
    setPickerTarget(stageIndex);
    setPickerSelection(stages[stageIndex].opcoes.map((option) => option.produtoId));
    setPickerSearch('');
    setPickerCategory('all');
  };

  const applyPicker = () => {
    if (pickerTarget === 'fixed') {
      const previousMap = new Map(fixedItems.map((item) => [item.produtoId, item.quantidade]));
      setFixedItems(pickerSelection.map((produtoId) => ({ produtoId, quantidade: previousMap.get(produtoId) || 1 })));
    } else if (typeof pickerTarget === 'number') {
      const previous = new Map(stages[pickerTarget].opcoes.map((option) => [option.produtoId, option]));
      updateStage(pickerTarget, {
        opcoes: pickerSelection.map((produtoId, index) => previous.get(produtoId) || { produtoId, acrescimo_centavos: 0, ordem: index }),
      });
    }
    setPickerTarget(null);
  };

  const selectAllFilteredPicker = () => {
    const visibleIds = filteredPickerProducts.map((p) => String(p._id || p.id));
    const allSelected = visibleIds.every((id) => pickerSelection.includes(id));
    if (allSelected) {
      setPickerSelection((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setPickerSelection((prev) => [...new Set([...prev, ...visibleIds])]);
    }
  };

  // Quick Exclusive Product Creation
  const handleCreateQuickProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickForm.nome.trim()) return showToast('Informe o nome do item.', 'error');
    if (!quickForm.categoriaId) return showToast('Selecione uma categoria para o item.', 'error');
    setCreatingQuick(true);
    try {
      const payload = {
        ...quickForm,
        tipo: 'produto',
        exclusivo_combo: true,
        ativo: true,
      };
      const res = await api.createProduct(payload);
      const newProduct = (res as any)?.product || res;
      if (newProduct && (newProduct._id || newProduct.id)) {
        const prodId = String(newProduct._id || newProduct.id);
        setAvailableProducts((prev) => [newProduct, ...prev]);
        setPickerSelection((prev) => [...prev, prodId]);
        showToast(`Item exclusivo "${newProduct.nome}" criado e selecionado!`, 'success');
        setShowQuickModal(false);
        setQuickForm({
          nome: '',
          descricao: '',
          preco: 0,
          categoriaId: categories[0]?._id || '',
          imagem: '',
          controlar_estoque: false,
          estoque: 0,
        });
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao criar item.', 'error');
    } finally {
      setCreatingQuick(false);
    }
  };

  // Safe Close Request
  const handleRequestClose = () => {
    const isModified = Boolean(
      form.nome.trim() ||
      form.descricao.trim() ||
      form.imagem ||
      fixedItems.length > 0 ||
      stages.length > 0
    );
    if (isModified) {
      setShowConfirmDiscard(true);
    } else {
      onClose();
    }
  };

  // Submit Handler
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!comboMode) return showToast('Selecione o tipo de combo.', 'error');
    if (!form.nome.trim() || !form.categoriaId) return showToast('Informe o nome e a categoria do combo.', 'error');

    if (comboMode === 'fixed') {
      if (fixedItems.length === 0) return showToast('Adicione ao menos um item ao combo fixo.', 'error');
      if (form.preco_base_centavos <= 0) return showToast('Informe o preço de venda do combo fixo.', 'error');
    } else {
      if (!stages.length) return showToast('Adicione ao menos uma etapa ao combo.', 'error');
      if (stages.some((stage) => stage.nome.trim().length < 2 || stage.opcoes.length === 0)) {
        return showToast('Todas as etapas precisam de título e ao menos um produto selecionado.', 'error');
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        tipo: 'combo',
        combo_mode: comboMode,
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        imagem: form.imagem,
        categoriaId: form.categoriaId,
        ativo: form.ativo,
        destaque: form.destaque,
        selo_destaque: form.destaque ? form.selo_destaque.trim() : '',
        permite_talheres: form.permite_talheres,
        preco: startingPrice / 100,
        preco_centavos: startingPrice,
        combo_preco_base_centavos: form.preco_base_centavos,
        preco_antigo: 0,
        personalizavel: false,
        quantidade_total_opcoes: 0,
        opcoes_disponiveis: [],
        controlar_estoque: false,
        estoque: 0,
        estoque_minimo: 0,
        esgotado: combo?.esgotado || false,
        pode_resgatar: false,
        pontos_resgate: 0,
        grupos_adicionais: [],
      };

      if (comboMode === 'fixed') {
        payload.combo_itens_fixos = fixedItems.map((item) => ({
          produtoId: item.produtoId,
          quantidade: item.quantidade,
        }));
        payload.combo_etapas = [];
      } else {
        payload.combo_itens_fixos = [];
        payload.combo_etapas = stages.map((stage, index) => ({
          ...(stage._id ? { _id: stage._id } : {}),
          nome: stage.nome.trim(),
          ordem: index,
          valor_etapa_centavos: stage.valor_etapa_centavos || 0,
          cobrar_complementos: stage.cobrar_complementos,
          opcoes: stage.opcoes.map((option, optionIndex) => ({
            ...(option._id ? { _id: option._id } : {}),
            produtoId: option.produtoId,
            acrescimo_centavos: option.acrescimo_centavos,
            ordem: optionIndex,
          })),
        }));
      }

      const response = combo?._id ? await api.updateProduct(combo._id, payload) : await api.createProduct(payload);
      if (response.success) {
        showToast(combo?._id ? 'Combo atualizado com sucesso!' : 'Combo criado com sucesso!', 'success');
        onSaved();
      }
    } catch (error: any) {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar o combo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Screen 1: Initial Mode Selector for New Combos
  if (!comboMode) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Novo Combo</h2>
              <p className="text-xs text-slate-500 mt-0.5">Escolha o formato comercial deste combo.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setComboMode('fixed')}
              className="flex flex-col text-left rounded-2xl border-2 border-slate-200 p-5 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all group cursor-pointer"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 group-hover:scale-105 transition-transform mb-3">
                <PackageCheck className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-950">Combo Fixo</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Você define os produtos e quantidades fechadas (ex: 2 Burgers + 1 Batata + 2 Refris).
              </p>
              <div className="mt-3 inline-flex items-center text-[11px] font-semibold text-emerald-700">
                O cliente adiciona com 1 clique →
              </div>
            </button>

            <button
              type="button"
              onClick={() => setComboMode('stages')}
              className="flex flex-col text-left rounded-2xl border-2 border-slate-200 p-5 hover:border-indigo-500 hover:bg-indigo-50/20 transition-all group cursor-pointer"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 group-hover:scale-105 transition-transform mb-3">
                <ListOrdered className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-950">Combo com Escolhas</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                O cliente escolhe 1 opção em cada etapa (ex: Escolha seu Lanche, Bebida e Acompanhamento).
              </p>
              <div className="mt-3 inline-flex items-center text-[11px] font-semibold text-indigo-700">
                Com acréscimos e opções →
              </div>
            </button>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-5" role="dialog" aria-modal="true">
      <div className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-white sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRequestClose}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/80 transition-colors"
              aria-label="Voltar"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-900">{combo?._id ? 'Editar combo' : 'Novo combo'}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    comboMode === 'fixed'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                  }`}
                >
                  {comboMode === 'fixed' ? 'Fixo' : 'Com Escolhas'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {comboMode === 'fixed'
                  ? 'Itens e quantidades fechadas por preço único.'
                  : 'Preço-base transparente com escolhas por etapa.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSimulatedStageSelections({});
                setSimulatedQuantity(1);
                setShowPreviewModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Visualizar como cliente</span>
            </button>

            <button
              type="button"
              onClick={handleRequestClose}
              className="rounded-full bg-slate-100 p-2 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Form Body */}
        <form id="admin-combo-form" onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-5">
              {/* Informações Básicas */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Informações Principais</h3>
                  {!combo?._id && (
                    <button
                      type="button"
                      onClick={() => setShowSwitchModeConfirm(comboMode === 'fixed' ? 'stages' : 'fixed')}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                    >
                      Alterar para {comboMode === 'fixed' ? 'Combo com Escolhas' : 'Combo Fixo'}
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-700 sm:col-span-2">
                    Nome do Combo *
                    <input
                      required
                      value={form.nome}
                      onChange={(event) => setForm({ ...form, nome: event.target.value })}
                      placeholder="Ex.: Combo Casal Smash Burger, Combo Festa 30 Pessoas"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </label>

                  <label className="text-xs font-medium text-slate-700">
                    Categoria no Cardápio *
                    <select
                      required
                      value={form.categoriaId}
                      onChange={(event) => setForm({ ...form, categoriaId: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white"
                    >
                      <option value="">Selecione uma categoria</option>
                      {categories.map((category) => (
                        <option key={category._id || category.id} value={category._id || category.id}>
                          {category.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-medium text-slate-700">
                    {comboMode === 'fixed' ? 'Preço de Venda do Combo (R$) *' : 'Preço Base do Combo (R$) *'}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={reais(form.preco_base_centavos)}
                      onChange={(e) => setForm({ ...form, preco_base_centavos: cents(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500"
                    />
                    <span className="mt-1 block text-[11px] font-normal text-slate-500">
                      {comboMode === 'fixed'
                        ? 'Valor total cobrado do cliente por este combo.'
                        : 'Valor inicial do combo. Opções sem acréscimo estão inclusas neste preço.'}
                    </span>
                  </label>

                  <label className="sm:col-span-2 text-xs font-medium text-slate-700">
                    Descrição do Combo
                    <textarea
                      rows={2}
                      value={form.descricao}
                      onChange={(event) => setForm({ ...form, descricao: event.target.value })}
                      placeholder="Descreva os itens ou atrativos deste combo..."
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-emerald-500"
                    />
                  </label>
                </div>

                {/* Opções de Visibilidade, Destaques e Talheres */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.ativo}
                        onChange={(event) => setForm({ ...form, ativo: event.target.checked })}
                        className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      Combo ativo e visível no cardápio
                    </label>

                    <label className="flex items-center gap-2 text-xs font-medium text-amber-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.destaque}
                        onChange={(event) => setForm({ ...form, destaque: event.target.checked })}
                        className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500"
                      />
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                      Exibir no topo em Destaques
                    </label>
                  </div>

                  <div className="rounded-xl border border-teal-200/80 bg-teal-50/40 p-3 space-y-2">
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
                        checked={form.permite_talheres}
                        onChange={(e) => setForm({ ...form, permite_talheres: e.target.checked })}
                        className="h-4 w-4 rounded border-teal-300 text-teal-700 focus:ring-teal-600 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Selo / Tagline */}
                  <div>
                    <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5 mb-1.5">
                      <Tag className="h-3.5 w-3.5 text-slate-500" />
                      Selo Promocional no Card (opcional)
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {['Mais pedido', 'Mais vendido', 'Recomendado', 'Novidade', 'Economize'].map((selo) => (
                        <button
                          key={selo}
                          type="button"
                          onClick={() => setForm({ ...form, selo_destaque: form.selo_destaque === selo ? '' : selo })}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors border cursor-pointer ${
                            form.selo_destaque === selo
                              ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {selo}
                        </button>
                      ))}
                    </div>
                    <input
                      value={form.selo_destaque}
                      onChange={(e) => setForm({ ...form, selo_destaque: e.target.value })}
                      placeholder="Ou digite um selo customizado (ex: Sugestão do Chef)"
                      maxLength={40}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </section>

              {/* SEÇÃO DO COMBO FIXO */}
              {comboMode === 'fixed' && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Itens Incluídos no Combo</h3>
                      <p className="text-xs text-slate-500">Defina os produtos e quantidades que compõem este combo.</p>
                    </div>
                    <button
                      type="button"
                      onClick={openPickerForFixed}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar itens
                    </button>
                  </div>

                  {fixedItems.length === 0 ? (
                    <button
                      type="button"
                      onClick={openPickerForFixed}
                      className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 py-10 text-slate-500 hover:border-emerald-400 hover:bg-emerald-50/20 transition-all cursor-pointer"
                    >
                      <PackagePlus className="mb-2 h-8 w-8 text-slate-400" />
                      <span className="text-sm font-semibold text-slate-800">Selecione os itens do combo</span>
                      <span className="text-xs text-slate-400 mt-0.5">Clique para buscar produtos ou cadastrar itens exclusivos</span>
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs divide-y divide-slate-100">
                      {fixedItems.map((item) => {
                        const product = productById.get(item.produtoId);
                        const health = getProductHealth(product, item.quantidade);
                        const singlePriceCents = typeof product?.preco_centavos === 'number' ? product.preco_centavos : cents(product?.preco);

                        return (
                          <div key={item.produtoId} className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 sm:p-4">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {product?.imagem ? (
                                <img src={product.imagem} alt="" className="h-12 w-12 rounded-lg object-cover border border-slate-200 shrink-0" />
                              ) : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-400 shrink-0">
                                  <ImageIcon className="h-5 w-5" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-xs font-bold text-slate-900">{product?.nome || 'Produto não encontrado'}</p>
                                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold border ${health.color}`}>
                                    {health.label}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Ref. avulso: R$ {reais(singlePriceCents).replace('.', ',')} un.
                                  {item.quantidade > 1 && ` · Total: R$ ${reais(singlePriceCents * item.quantidade).replace('.', ',')}`}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                                <button
                                  type="button"
                                  onClick={() => updateFixedItemQuantity(item.produtoId, -1)}
                                  disabled={item.quantidade <= 1}
                                  className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-white disabled:opacity-30 cursor-pointer"
                                  title="Diminuir quantidade"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="w-8 text-center text-xs font-bold text-slate-900">{item.quantidade}x</span>
                                <button
                                  type="button"
                                  onClick={() => updateFixedItemQuantity(item.produtoId, 1)}
                                  className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-white cursor-pointer"
                                  title="Aumentar quantidade"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => removeFixedItem(item.produtoId)}
                                className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                                title="Remover item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Informação sobre adicionais em combo fixo */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] text-slate-600 flex items-start gap-2">
                    <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Nota sobre complementos:</strong> Se algum produto incluído possuir grupos de adicionais ou acompanhamentos avulsos,
                      eles não serão exibidos nem cobrados do cliente neste formato de combo fixo.
                    </span>
                  </div>
                </section>
              )}

              {/* SEÇÃO DO COMBO COM ESCOLHAS (STAGES) */}
              {comboMode === 'stages' && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Etapas de Escolha</h3>
                      <p className="text-xs text-slate-500">O cliente escolhe 1 produto em cada etapa (ex: Lanche, Bebida).</p>
                    </div>
                    <button
                      type="button"
                      onClick={addStage}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar etapa
                    </button>
                  </div>

                  {stages.length === 0 ? (
                    <button
                      type="button"
                      onClick={addStage}
                      className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 py-10 text-slate-500 hover:border-indigo-400 hover:bg-indigo-50/20 transition-all cursor-pointer"
                    >
                      <ListOrdered className="mb-2 h-8 w-8 text-slate-400" />
                      <span className="text-sm font-semibold text-slate-800">Crie a primeira etapa</span>
                      <span className="text-xs text-slate-400 mt-0.5">Ex: Escolha o Hambúrguer, Escolha a Bebida...</span>
                    </button>
                  ) : (
                    stages.map((stage, index) => {
                      const stageHealth = getStageHealth(stage);
                      const isCollapsed = Boolean(collapsedStages[stage.clientId]);

                      return (
                        <article key={stage.clientId} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs transition-all">
                          {/* Cabeçalho da Etapa com Accordion */}
                          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 p-3 sm:px-4">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                                {index + 1}
                              </span>
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {stage.nome.trim() || `Etapa ${index + 1} (sem título)`}
                              </p>
                              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${stageHealth.color} shrink-0`}>
                                {stageHealth.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => duplicateStage(index)}
                                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                                title="Duplicar etapa"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => moveStage(index, -1)}
                                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                                title="Mover para cima"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === stages.length - 1}
                                onClick={() => moveStage(index, 1)}
                                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                                title="Mover para baixo"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteStage(index)}
                                className="rounded-lg p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Excluir etapa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setCollapsedStages((prev) => ({ ...prev, [stage.clientId]: !prev[stage.clientId] }))
                                }
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/80 transition-colors ml-1 cursor-pointer"
                                title={isCollapsed ? 'Expandir etapa' : 'Recolher etapa'}
                              >
                                {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Corpo Expandido da Etapa */}
                          {!isCollapsed && (
                            <div className="p-4 space-y-4">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                                  Título da Etapa *
                                  <input
                                    value={stage.nome}
                                    onChange={(e) => updateStage(index, { nome: e.target.value })}
                                    placeholder="Ex.: Escolha o seu Hambúrguer, Escolha o Acompanhamento"
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                                  />
                                </label>

                                <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                                  <p className="text-xs font-semibold text-slate-800">Cobrança de adicionais desta etapa</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => updateStage(index, { cobrar_complementos: true })}
                                      className={`rounded-lg p-2 text-left border text-xs font-medium transition-all cursor-pointer ${
                                        stage.cobrar_complementos
                                          ? 'border-indigo-500 bg-indigo-50/50 text-indigo-950 font-semibold shadow-2xs'
                                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                      }`}
                                    >
                                      Cobrar complementos (+ R$)
                                      <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                                        Adicionais escolhidos somarão ao valor final.
                                      </span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => updateStage(index, { cobrar_complementos: false })}
                                      className={`rounded-lg p-2 text-left border text-xs font-medium transition-all cursor-pointer ${
                                        !stage.cobrar_complementos
                                          ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950 font-semibold shadow-2xs'
                                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                      }`}
                                    >
                                      Grátis no combo (R$ 0)
                                      <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                                        Todos os complementos inclusos sem custo extra.
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Lista de Opções da Etapa */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-bold text-slate-800">
                                    Opções Disponíveis ({stage.opcoes.length})
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => openPickerForStage(index)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                  >
                                    <Plus className="h-3 w-3" /> Adicionar opções
                                  </button>
                                </div>

                                {stage.opcoes.length === 0 ? (
                                  <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                                    Nenhum produto adicionado nesta etapa ainda.{' '}
                                    <button
                                      type="button"
                                      onClick={() => openPickerForStage(index)}
                                      className="font-bold text-indigo-600 hover:underline cursor-pointer"
                                    >
                                      Clique aqui para adicionar opções
                                    </button>
                                  </div>
                                ) : (
                                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-white">
                                    {stage.opcoes.map((option, optionIndex) => {
                                      const product = productById.get(option.produtoId);
                                      const health = getProductHealth(product, 1);

                                      return (
                                        <div
                                          key={option.produtoId}
                                          className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3"
                                        >
                                          <div className="flex items-center gap-3 min-w-0 flex-1">
                                            {product?.imagem ? (
                                              <img
                                                src={product.imagem}
                                                alt=""
                                                className="h-10 w-10 rounded-lg object-cover border border-slate-200 shrink-0"
                                              />
                                            ) : (
                                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-400 shrink-0">
                                                <ImageIcon className="h-4 w-4" />
                                              </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-2">
                                                <p className="truncate text-xs font-bold text-slate-900">
                                                  {product?.nome || 'Produto não encontrado'}
                                                </p>
                                                <span
                                                  className={`rounded px-1.5 py-0.5 text-[9px] font-semibold border ${health.color}`}
                                                >
                                                  {health.label}
                                                </span>
                                              </div>
                                              <p className="text-[11px] text-slate-500">
                                                Avulso: R$ {Number(product?.preco || 0).toFixed(2).replace('.', ',')}
                                              </p>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-3">
                                            <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                                              <span>Acréscimo:</span>
                                              <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={reais(option.acrescimo_centavos)}
                                                onChange={(e) =>
                                                  updateStage(index, {
                                                    opcoes: stage.opcoes.map((item, i) =>
                                                      i === optionIndex ? { ...item, acrescimo_centavos: cents(e.target.value) } : item
                                                    ),
                                                  })
                                                }
                                                className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 text-right"
                                              />
                                              {option.acrescimo_centavos === 0 ? (
                                                <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 border border-emerald-200">
                                                  Incluso
                                                </span>
                                              ) : (
                                                <span className="rounded bg-amber-100 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 border border-amber-200">
                                                  + R$ {reais(option.acrescimo_centavos).replace('.', ',')}
                                                </span>
                                              )}
                                            </label>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateStage(index, {
                                                  opcoes: stage.opcoes.filter((_, i) => i !== optionIndex),
                                                })
                                              }
                                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                                              title="Remover opção"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </section>
              )}
            </div>

            {/* Coluna Lateral: Resumo de Precificação & Foto */}
            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3 shadow-2xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Resumo de Precificação</p>
                <div>
                  <p className="text-2xl font-black text-emerald-700">
                    {comboMode === 'stages' ? 'A partir de ' : ''}R$ {reais(startingPrice).replace('.', ',')}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    {comboMode === 'fixed'
                      ? 'Preço único que será cobrado na sacola pelo conjunto de todos os itens.'
                      : 'Preço base do combo somado aos menores acréscimos das opções de cada etapa.'}
                  </p>
                </div>

                {comboMode === 'fixed' && fixedReferenceSumCents > 0 && (
                  <div className="pt-2 border-t border-slate-200 space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Soma dos itens avulsos:</span>
                      <span className="font-semibold line-through text-slate-400">
                        R$ {reais(fixedReferenceSumCents).replace('.', ',')}
                      </span>
                    </div>
                    {form.preco_base_centavos < fixedReferenceSumCents && (
                      <div className="flex items-center gap-1.5 rounded-lg bg-emerald-100/70 p-2 text-xs font-bold text-emerald-800 border border-emerald-200">
                        <Sparkles className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>
                          Economia de R$ {reais(fixedReferenceSumCents - form.preco_base_centavos).replace('.', ',')} (
                          {Math.round(((fixedReferenceSumCents - form.preco_base_centavos) / fixedReferenceSumCents) * 100)}% de desconto)
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Upload de Foto */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                <ImagePicker
                  label="Foto de Capa do Combo"
                  value={form.imagem}
                  onChange={(imagem) => setForm({ ...form, imagem })}
                  onUploadStatus={setUploading}
                />
              </div>
            </aside>
          </div>
        </form>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={handleRequestClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSimulatedStageSelections({});
                setSimulatedQuantity(1);
                setShowPreviewModal(true);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
            >
              Pré-visualizar
            </button>

            <button
              type="submit"
              form="admin-combo-form"
              disabled={saving || uploading}
              className="rounded-lg bg-emerald-600 px-6 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-2xs cursor-pointer"
            >
              {saving ? 'Salvando...' : combo?._id ? 'Salvar Alterações' : 'Publicar Combo'}
            </button>
          </div>
        </footer>
      </div>

      {/* Modal de Confirmação para Descartar Alterações */}
      {showConfirmDiscard && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-100 p-2 text-amber-700 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Descartar alterações?</h3>
                <p className="text-xs text-slate-500 mt-0.5">As alterações feitas neste combo serão perdidas.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmDiscard(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmDiscard(false);
                  onClose();
                }}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 shadow-2xs cursor-pointer"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Troca de Modo */}
      {showSwitchModeConfirm && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-indigo-100 p-2 text-indigo-700 shrink-0">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Alterar formato do combo?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Alternar para {showSwitchModeConfirm === 'fixed' ? 'Combo Fixo' : 'Combo com Escolhas'} adaptará as configurações atuais.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSwitchModeConfirm(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setComboMode(showSwitchModeConfirm);
                  setShowSwitchModeConfirm(null);
                }}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-2xs cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Seletor de Produtos (Picker) */}
      {pickerTarget !== null && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-white sm:rounded-2xl shadow-2xl overflow-hidden">
            <header className="flex items-center justify-between border-b border-slate-200 p-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {pickerTarget === 'fixed' ? 'Adicionar produtos ao combo fixo' : `Adicionar produtos à etapa ${Number(pickerTarget) + 1}`}
                </h3>
                <p className="text-xs text-slate-500">Selecione os produtos disponíveis para esta configuração.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-2xs cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Criar item exclusivo
                </button>
                <button
                  type="button"
                  onClick={() => setPickerTarget(null)}
                  className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* Barra de Filtros e Busca */}
            <div className="grid gap-2 border-b border-slate-200 p-3 sm:grid-cols-[1fr_200px]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={pickerSearch}
                  onChange={(event) => setPickerSearch(event.target.value)}
                  placeholder="Buscar produto por nome..."
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-emerald-500"
                />
              </div>
              <select
                value={pickerCategory}
                onChange={(event) => setPickerCategory(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-emerald-500 bg-white"
              >
                <option value="all">Todas as categorias</option>
                {categories.map((category) => (
                  <option key={category._id || category.id} value={category._id || category.id}>
                    {category.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Ação rápida de marcar todos */}
            {filteredPickerProducts.length > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[11px]">
                <span className="text-slate-500">{filteredPickerProducts.length} produto(s) listado(s)</span>
                <button
                  type="button"
                  onClick={selectAllFilteredPicker}
                  className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                >
                  {filteredPickerProducts.every((p) => pickerSelection.includes(String(p._id || p.id)))
                    ? 'Desmarcar resultados visíveis'
                    : 'Marcar todos os resultados visíveis'}
                </button>
              </div>
            )}

            {/* Lista com Checkboxes */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
              {filteredPickerProducts.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Nenhum produto encontrado. Use o botão <strong>"Criar item exclusivo"</strong> acima para cadastrar um item direto para este combo.
                </div>
              ) : (
                filteredPickerProducts.map((product) => {
                  const prodId = String(product._id || product.id);
                  const selected = pickerSelection.includes(prodId);
                  const health = getProductHealth(product, 1);

                  return (
                    <button
                      type="button"
                      key={prodId}
                      onClick={() =>
                        setPickerSelection((current) =>
                          selected ? current.filter((id) => id !== prodId) : [...current, prodId]
                        )
                      }
                      className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-2xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      {product.imagem ? (
                        <img src={product.imagem} alt="" className="h-11 w-11 rounded-lg object-cover border border-slate-200 shrink-0" />
                      ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-400 shrink-0">
                          <ImageIcon className="h-5 w-5" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <strong className="block truncate text-xs text-slate-900">{product.nome}</strong>
                          {product.exclusivo_combo && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700 border border-indigo-200/60 shrink-0">
                              🔒 Exclusivo
                            </span>
                          )}
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold border ${health.color} shrink-0`}>
                            {health.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {product.categoriaNome || (product.categoriaId as any)?.nome || 'Sem categoria'} · Avulso: R${' '}
                          {Number(product.preco || 0).toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                          selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <footer className="flex items-center justify-between border-t border-slate-200 p-4 bg-slate-50">
              <span className="text-xs font-medium text-slate-600">{pickerSelection.length} selecionado(s)</span>
              <button
                type="button"
                onClick={applyPicker}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer"
              >
                Aplicar seleção
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal de Criação Rápida de Item Exclusivo */}
      {showQuickModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={(e) => e.stopPropagation()}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-indigo-50/60">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-indigo-600 p-1.5 text-white">
                  <PackagePlus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Novo Item Exclusivo de Combo</h3>
                  <p className="text-[11px] text-slate-500">Ficará oculto da vitrine avulsa e disponível para este combo.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickModal(false)}
                className="rounded-full bg-white p-1.5 text-slate-400 hover:text-slate-600 shadow-2xs cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form onSubmit={handleCreateQuickProduct} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Item *</label>
                <input
                  type="text"
                  required
                  value={quickForm.nome}
                  onChange={(e) => setQuickForm({ ...quickForm, nome: e.target.value })}
                  placeholder="Ex: Mini Refrigerante 220ml, Batata Frita Pequena"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria *</label>
                  <select
                    required
                    value={quickForm.categoriaId}
                    onChange={(e) => setQuickForm({ ...quickForm, categoriaId: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500 bg-white"
                  >
                    {categories.map((cat) => (
                      <option key={cat._id || cat.id} value={cat._id || cat.id}>
                        {cat.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Preço de Referência (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quickForm.preco}
                    onChange={(e) => setQuickForm({ ...quickForm, preco: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição (opcional)</label>
                <textarea
                  rows={2}
                  value={quickForm.descricao}
                  onChange={(e) => setQuickForm({ ...quickForm, descricao: e.target.value })}
                  placeholder="Ex: Lata 220ml gelada. Porção individual exclusiva."
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <ImagePicker
                label="Foto do Item (opcional)"
                value={quickForm.imagem}
                onChange={(imagem) => setQuickForm({ ...quickForm, imagem })}
                onUploadStatus={setUploading}
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Controlar Estoque</p>
                    <p className="text-[10px] text-slate-500">Baixar estoque automaticamente quando o combo for vendido</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={quickForm.controlar_estoque}
                    onChange={(e) => setQuickForm({ ...quickForm, controlar_estoque: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
                {quickForm.controlar_estoque && (
                  <div className="pt-1">
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">Quantidade em Estoque</label>
                    <input
                      type="number"
                      min="0"
                      value={quickForm.estoque}
                      onChange={(e) => setQuickForm({ ...quickForm, estoque: parseInt(e.target.value, 10) || 0 })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[11px] text-amber-900 leading-relaxed">
                ⚠️ <strong>Aviso:</strong> Este item exclusivo será salvo imediatamente no catálogo do estabelecimento, mesmo se você cancelar a edição deste combo depois.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowQuickModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingQuick || uploading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-2xs cursor-pointer"
                >
                  {creatingQuick ? 'Criando...' : 'Salvar e Adicionar ao Combo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Prévia Interativa como Cliente */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/75 p-4" onMouseDown={(e) => e.stopPropagation()}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-emerald-600" />
                <div>
                  <h3 className="text-xs font-bold text-slate-900">Prévia: Como o Cliente Visualiza</h3>
                  <p className="text-[10px] text-slate-500">Simulação em tempo real da tela de compra.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="rounded-full bg-white p-1.5 text-slate-400 hover:text-slate-600 shadow-2xs cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Foto de Capa */}
              {form.imagem && (
                <img src={form.imagem} alt="" className="h-44 w-full rounded-xl object-cover border border-slate-100 shadow-2xs" />
              )}

              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">{form.nome || 'Nome do Combo'}</h2>
                  {form.selo_destaque && (
                    <span className="rounded-full bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5">
                      {form.selo_destaque}
                    </span>
                  )}
                </div>
                {form.descricao && <p className="text-xs text-slate-500 mt-1">{form.descricao}</p>}
              </div>

              {/* Prévia: Combo Fixo */}
              {comboMode === 'fixed' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                    <p className="text-xs font-bold text-slate-900">Itens Inclusos neste Combo:</p>
                    {fixedItems.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Nenhum produto incluído ainda.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {fixedItems.map((item) => {
                          const p = productById.get(item.produtoId);
                          return (
                            <li key={item.produtoId} className="flex items-center gap-2 text-xs text-slate-700">
                              <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                                {item.quantidade}x
                              </span>
                              <span className="font-medium">{p?.nome || 'Item do combo'}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Prévia: Combo com Escolhas (Stages) */}
              {comboMode === 'stages' && (
                <div className="space-y-4">
                  {stages.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhuma etapa configurada ainda.</p>
                  ) : (
                    stages.map((stage, sIdx) => {
                      const selectedOptId = simulatedStageSelections[stage.clientId] || stage.opcoes[0]?.produtoId;

                      return (
                        <div key={stage.clientId} className="rounded-xl border border-slate-200 p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-900">
                              {sIdx + 1}. {stage.nome || 'Etapa sem título'}
                            </p>
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Obrigatório (1 opção)
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {stage.opcoes.map((opt) => {
                              const p = productById.get(opt.produtoId);
                              const isSelected = selectedOptId === opt.produtoId;

                              return (
                                <button
                                  type="button"
                                  key={opt.produtoId}
                                  onClick={() =>
                                    setSimulatedStageSelections((prev) => ({ ...prev, [stage.clientId]: opt.produtoId }))
                                  }
                                  className={`flex w-full items-center justify-between rounded-lg border p-2.5 text-xs text-left transition-all cursor-pointer ${
                                    isSelected
                                      ? 'border-emerald-600 bg-emerald-50/60 font-semibold text-emerald-950'
                                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                                        isSelected ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                                      }`}
                                    >
                                      {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                    </span>
                                    <span>{p?.nome || 'Opção'}</span>
                                  </div>

                                  <span className="text-[11px]">
                                    {opt.acrescimo_centavos === 0 ? (
                                      <span className="text-emerald-700 font-semibold">Incluso</span>
                                    ) : (
                                      <span className="text-amber-800 font-semibold">+ R$ {reais(opt.acrescimo_centavos).replace('.', ',')}</span>
                                    )}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Rodapé Simulado com Total */}
            <footer className="border-t border-slate-200 p-4 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setSimulatedQuantity((q) => Math.max(1, q - 1))}
                  className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-8 text-center text-xs font-bold text-slate-900">{simulatedQuantity}</span>
                <button
                  type="button"
                  onClick={() => setSimulatedQuantity((q) => q + 1)}
                  className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">Total calculado na prévia:</span>
                <span className="text-sm font-black text-emerald-700">
                  R$ {reais(startingPrice * simulatedQuantity).replace('.', ',')}
                </span>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
