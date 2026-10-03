import ProductEditorPage from './tenant-admin/catalog/ProductEditorPage';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { adminAvailabilityLabel } from '../lib/catalogPresentation';
import { catalogEditorPath, parseCatalogEditor } from '../lib/adminNavigation';
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, Image as ImageIcon, X, Eye, EyeOff, Gift, Star, Search, FilterX, Package, AlertTriangle, Tag, Layers, UtensilsCrossed, Copy, CheckCircle2, Sparkles, ExternalLink } from 'lucide-react';
import { useToast } from './Toast';
import ImagePicker from './ImagePicker';
import AdminComboEditor from './AdminComboEditor';
import ProductPreorderEditor, { productPreorderError } from './tenant-admin/ProductPreorderEditor';
import BulkProductSalesMode, { productSalesLabel } from './tenant-admin/BulkProductSalesMode';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { activeComplementItemCount, effectiveComplementMinimum, validateComplementGroupRules } from '../lib/complementRules';

function normalizeCatalogSearch(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function AdminProducts({
  token,
  onUnauthorized: _onUnauthorized,
  onNavigateToComplementGroups,
  onNavigateToImport,
  onDirtyChange,
}: {
  token: string;
  onUnauthorized: () => void;
  onNavigateToComplementGroups?: () => void;
  onNavigateToImport?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const api = useTenantAdminApi();
  const [produtos, setProdutos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const initialParams = React.useRef(new URLSearchParams(window.location.search));
  const [editorLocation, setEditorLocation] = useState(() => parseCatalogEditor(window.location.search));
  const [editorError, setEditorError] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const editorBase = React.useRef('');
  const [isEditing, setIsEditing] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<any>(null);
  const [editingCombo, setEditingCombo] = useState<any | null | undefined>(undefined);
  const [showNewItemMenu, setShowNewItemMenu] = useState(false);
  const [optionsString, setOptionsString] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<any>(null);

  const [deleting, setDeleting] = useState(false);
  const [globalGroups, setGlobalGroups] = useState<any[]>([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySearchTerm, setCopySearchTerm] = useState('');

  const [searchTerm, setSearchTerm] = useState(initialParams.current.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState(initialParams.current.get('category') || 'all');
  const [statusFilter, setStatusFilter] = useState(initialParams.current.get('status') || 'all');
  const [availabilityFilter, setAvailabilityFilter] = useState(initialParams.current.get('stock') || 'all');
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'produto' | 'combo' | 'exclusivo'>((initialParams.current.get('type') as 'all' | 'produto' | 'combo' | 'exclusivo') || 'all');
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [bulkSalesOpen, setBulkSalesOpen] = useState(false);
  const [defaultSalesMode, setDefaultSalesMode] = useState<'immediate_only' | 'scheduled_only'>('immediate_only');
  const [canWriteCatalog, setCanWriteCatalog] = useState(false);

  const { showToast } = useToast();
  const productDirty = isEditing && JSON.stringify([currentProduct, optionsString]) !== editorBase.current;
  const confirmLeave = useUnsavedChanges(productDirty || isUploadingImage || isSavingProduct, onDirtyChange);
  const setEditorUrl = (editor: { kind: 'produto' | 'combo'; id: string } | null, replace = false) => {
    const path = catalogEditorPath(window.location.pathname, window.location.search, editor);
    window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
    setEditorLocation(editor);
    window.dispatchEvent(new Event('catalog-editor-location'));
  };
  const closeProductEditor = (saved = false) => {
    if (!saved && (isSavingProduct || isUploadingImage || !confirmLeave())) return;
    setIsEditing(false); setCurrentProduct(null); setEditingCombo(undefined); setEditorError(''); setEditorUrl(null);
  };
  const [sortOrder, setSortOrder] = useState(initialParams.current.get('sort') || 'catalog');
  const [page, setPage] = useState(Math.max(1, Number(initialParams.current.get('page')) || 1));
  const [pageSize, setPageSize] = useState(initialParams.current.get('limit') === '50' ? 50 : 25);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [batchMessage, setBatchMessage] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries({ q: searchTerm, category: categoryFilter, status: statusFilter, stock: availabilityFilter, type: itemTypeFilter, sort: sortOrder, page: String(page), limit: String(pageSize) })) params.set(key, value);
    window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());
    window.dispatchEvent(new Event('catalog-editor-location'));
  }, [searchTerm, categoryFilter, statusFilter, availabilityFilter, itemTypeFilter, sortOrder, page, pageSize]);
  useEffect(() => {
    const sync = () => setEditorLocation(parseCatalogEditor(window.location.search));
    window.addEventListener('catalog-editor-location', sync);
    return () => window.removeEventListener('catalog-editor-location', sync);
  }, []);

  useEffect(() => {
    void api.getSession().then((session) => {
      if (session?.success && Array.isArray(session.permissions)) {
        setCanWriteCatalog(session.permissions.includes('catalog:write'));
      }
    }).catch(() => undefined);
  }, [api]);

  const exclusiveUsageMap = useMemo(() => {
    const map = new Map<string, number>();
    const combos = produtos.filter((p) => p.tipo === 'combo');
    for (const combo of combos) {
      if (Array.isArray(combo.combo_itens_fixos)) {
        for (const item of combo.combo_itens_fixos) {
          const id = String(item.produtoId?._id || item.produtoId);
          map.set(id, (map.get(id) || 0) + 1);
        }
      }
      if (Array.isArray(combo.combo_etapas)) {
        for (const stage of combo.combo_etapas) {
          if (Array.isArray(stage.opcoes)) {
            for (const opt of stage.opcoes) {
              const id = String(opt.produtoId?._id || opt.produtoId);
              map.set(id, (map.get(id) || 0) + 1);
            }
          }
        }
      }
    }
    return map;
  }, [produtos]);

  const counts = useMemo(() => ({
    all: produtos.length,
    produto: produtos.filter((p) => p.tipo !== 'combo' && !p.exclusivo_combo).length,
    combo: produtos.filter((p) => p.tipo === 'combo').length,
    exclusivo: produtos.filter((p) => Boolean(p.exclusivo_combo)).length,
  }), [produtos]);

  const handleDuplicateCombo = async (combo: any) => {
    if (duplicatingId) return;
    const cid = String(combo._id || combo.id);
    setDuplicatingId(cid);
    try {
      const clonePayload = {
        ...combo,
        _id: undefined,
        id: undefined,
        nome: `${combo.nome} (Cópia)`,
        ativo: false,
        createdAt: undefined,
        updatedAt: undefined,
      };

      if (Array.isArray(clonePayload.combo_itens_fixos)) {
        clonePayload.combo_itens_fixos = clonePayload.combo_itens_fixos.map((item: any) => ({
          produtoId: item.produtoId?._id || item.produtoId,
          quantidade: item.quantidade || 1,
        }));
      }

      if (Array.isArray(clonePayload.combo_etapas)) {
        clonePayload.combo_etapas = clonePayload.combo_etapas.map((stage: any) => ({
          nome: stage.nome,
          ordem: stage.ordem || 0,
          valor_etapa_centavos: stage.valor_etapa_centavos || 0,
          cobrar_complementos: stage.cobrar_complementos !== false,
          opcoes: (stage.opcoes || []).map((opt: any) => ({
            produtoId: opt.produtoId?._id || opt.produtoId,
            acrescimo_centavos: opt.acrescimo_centavos || 0,
          })),
        }));
      }

      const res = await api.createProduct(clonePayload);
      if (res.success) {
        showToast(`Combo clonado como "${clonePayload.nome}" (Inativo)`, 'success');
        fetchDados();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao clonar combo', 'error');
    } finally {
      setDuplicatingId(null);
    }
  };

  const categoryName = (produto: any) => {
    if (produto.categoriaId?.nome) return produto.categoriaId.nome;
    const categoryId = produto.categoriaId?._id || produto.categoriaId;
    return categorias.find((category) => String(category._id) === String(categoryId))?.nome || 'Sem categoria';
  };

  const openProductEditor = (produto: any, fromUrl = false) => {
    if (!fromUrl) setEditorUrl({ kind: produto.tipo === 'combo' ? 'combo' : 'produto', id: String(produto._id || produto.id) });
    editorBase.current = JSON.stringify([{ ...produto, categoriaId: produto.categoriaId?._id || produto.categoriaId || '' }, produto.opcoes_disponiveis?.join(', ') || '']);
    if (produto.tipo === 'combo') {
      setIsEditing(false);
      setEditingCombo(produto);
      return;
    }
    setEditingCombo(undefined);
    setCurrentProduct({
      ...produto,
      categoriaId: produto.categoriaId?._id || produto.categoriaId || '',
    });
    setOptionsString(produto.opcoes_disponiveis?.join(', ') || '');
    setIsEditing(true);
  };

  const fetchDados = async () => {
    setLoadError(''); setLoading(true);
    try {
      const [prodData, catData, groupsData, settingsData] = await Promise.all([
        api.listProducts(),
        api.listCategories(),
        api.listComplementGroups().catch(() => ({ items: [] })),
        api.getSettings().catch(() => ({ settings: null })),
      ]);
      setProdutos(prodData.items);
      setDefaultSalesMode(settingsData.settings?.preorderEnabled && (settingsData.settings.preorderDraft as any)?.salesMode === 'scheduled_only' ? 'scheduled_only' : 'immediate_only');
      setCategorias(catData.items);
      if (groupsData && groupsData.items) {
        setGlobalGroups(groupsData.items);
      }
    } catch {
      setLoadError('Não foi possível carregar o catálogo.');
      showToast('Erro ao buscar produtos', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDados();
  }, [token]);

  useEffect(() => {
    if (!showDeleteModal && !showCopyModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [showDeleteModal, showCopyModal]);

  useEffect(() => {
    if (loading) return;
    let active = true;
    if (!editorLocation) { setIsEditing(false); setEditingCombo(undefined); setEditorError(''); return; }
    if (editorLocation.id === 'novo') {
      if (editorLocation.kind === 'combo') { setIsEditing(false); setEditingCombo(null); }
      else if (!isEditing) openNewProduct(true);
      return;
    }
    if (String(currentProduct?._id || editingCombo?._id || '') === editorLocation.id) return;
    setEditorLoading(true); setEditorError('');
    void api.getProduct(editorLocation.id).then(result => { if (active) openProductEditor(result.product, true); }).catch(error => { if (active) setEditorError(error instanceof Error ? error.message : 'Não foi possível abrir o item.'); }).finally(() => { if (active) setEditorLoading(false); });
    return () => { active = false; };
  }, [editorLocation?.id, editorLocation?.kind, loading]);

  const toggleProductActive = async (id: string) => {
    const previous = produtos.find((product) => product._id === id);
    if (!previous) return;
    setProdutos((items: any[]) => items.map((product) => product._id === id ? { ...product, ativo: !product.ativo } : product));
    try {
      const data = await api.toggleProductActive(id);
      if (data.success) {
        showToast('Status do produto atualizado', 'success');
        setProdutos((items: any[]) => items.map((product) => product._id === id ? { ...product, ...data.product } : product));
      }
    } catch {
      setProdutos((items: any[]) => items.map((product) => product._id === id ? previous : product));
      showToast('Erro ao alterar status', 'error');
    }
  };

  const handleDeletePermanent = async () => {
    setDeleting(true);
    try {
      const data = await api.deleteProduct(productToDelete._id);
      if (data.success) {
        showToast('Produto excluido!', 'success');
        setShowDeleteModal(false);
        fetchDados();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Falha na comunicacao com o servidor', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const toggleProductEsgotado = async (id: string) => {
    const previous = produtos.find((product) => product._id === id);
    if (!previous) return;
    setProdutos((items: any[]) => items.map((product) => product._id === id ? { ...product, esgotado: !product.esgotado } : product));
    try {
      const data = await api.toggleProductSoldOut(id);
      if (data.success) {
        showToast('Disponibilidade do produto atualizada', 'success');
        setProdutos((items: any[]) => items.map((product) => product._id === id ? { ...product, ...data.product } : product));
      }
    } catch {
      setProdutos((items: any[]) => items.map((product) => product._id === id ? previous : product));
      showToast('Erro ao alternar disponibilidade', 'error');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingProduct || !canWriteCatalog) return;
    if (currentProduct.preorderDraft !== undefined) {
      const error = productPreorderError(currentProduct.preorderDraft);
      if (error) { showToast(error, 'error'); return; }
    }

    if (currentProduct.preco_antigo && Number(currentProduct.preco_antigo) > 0 && Number(currentProduct.preco_antigo) <= Number(currentProduct.preco)) {
      showToast('O preço original deve ser estritamente maior que o preço atual.', 'error');
      return;
    }

    const normalizedGroups = (currentProduct.grupos_adicionais || []).map((group: any) => {
      const minimo = effectiveComplementMinimum(group);
      return { ...group, minimo, maximo: Math.max(minimo, Number(group.maximo || 1)) };
    });
    const invalidGroup = normalizedGroups.find((group: any) => validateComplementGroupRules(group));
    if (invalidGroup) {
      showToast(`${invalidGroup.nome || 'Grupo de adicionais'}: ${validateComplementGroupRules(invalidGroup)}`, 'error');
      return;
    }

    try {
      setIsSavingProduct(true);
      const productToSave = {
        ...currentProduct,
        ...(currentProduct._id && currentProduct.updatedAt ? { expectedUpdatedAt: new Date(currentProduct.updatedAt).toISOString() } : {}),
        grupos_adicionais: normalizedGroups,
        destaque: Boolean(currentProduct.destaque),
        selo_destaque: currentProduct.destaque ? (currentProduct.selo_destaque || '').trim() : '',
        exclusivo_combo: Boolean(currentProduct.exclusivo_combo),
        opcoes_disponiveis: optionsString.split(',').map((s) => s.trim()).filter(Boolean),
      };

      const data = currentProduct._id
        ? await api.updateProduct(currentProduct._id, productToSave)
        : await api.createProduct(productToSave);
      if (data.success) {
        showToast(currentProduct._id ? 'Produto atualizado!' : 'Produto criado!', 'success');
        closeProductEditor(true);
        fetchDados();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao salvar produto', 'error');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const openNewProduct = (fromUrl = false) => {
    if (!fromUrl) setEditorUrl({ kind: "produto", id: "novo" });
    const newProduct = {
      preorderDraft: { availability: defaultSalesMode, minLeadMinutes: null },
      nome: '',
      tipo: 'produto',
      preco: 0,
      descricao: '',
      imagem: '',
      personalizavel: false,
      quantidade_total_opcoes: 0,
      opcoes_disponiveis: [],
      controlar_estoque: false,
      estoque: 0,
      estoque_minimo: 0,
      categoriaId: '',
      grupos_adicionais: [],
      destaque: false,
      selo_destaque: '',
      pode_resgatar: false,
      pontos_resgate: 0,
      permite_talheres: false,
      exclusivo_combo: false,
    };
    editorBase.current = JSON.stringify([newProduct, ""]);
    setCurrentProduct(newProduct);
    setOptionsString('');
    setIsEditing(true);
    setShowNewItemMenu(false);
  };

  const handleUpdateGrupo = (index: number, key: string, value: any) => {
    const newGroups = [...(currentProduct.grupos_adicionais || [])];
    const updated = { ...newGroups[index], [key]: value };
    if (key === 'obrigatorio' && value === true) {
      updated.minimo = Math.max(1, Number(updated.minimo || 0));
      updated.maximo = Math.max(updated.minimo, Number(updated.maximo || 1));
    }
    if (key === 'minimo') updated.maximo = Math.max(Number(value || 0), Number(updated.maximo || 1));
    newGroups[index] = updated;
    setCurrentProduct({ ...currentProduct, grupos_adicionais: newGroups });
  };

  const filteredProducts = produtos.filter((p) => {
    const matchType =
      itemTypeFilter === 'all' ||
      (itemTypeFilter === 'produto' && p.tipo !== 'combo' && !p.exclusivo_combo) ||
      (itemTypeFilter === 'combo' && p.tipo === 'combo') ||
      (itemTypeFilter === 'exclusivo' && Boolean(p.exclusivo_combo));
    const categoryName = typeof p.categoriaId === 'object'
      ? p.categoriaId?.nome
      : categorias.find((category) => category._id === p.categoriaId)?.nome;
    const haystack = normalizeCatalogSearch([p.nome, p.descricao, categoryName].filter(Boolean).join(' '));
    const matchSearch = haystack.includes(normalizeCatalogSearch(searchTerm.trim()));
    const matchCat =
      categoryFilter === 'all' ||
      (p.categoriaId && (p.categoriaId._id === categoryFilter || p.categoriaId.id === categoryFilter || p.categoriaId === categoryFilter));
    const matchStatus = statusFilter === 'all' || (statusFilter === 'ativo' && p.ativo) || (statusFilter === 'inativo' && !p.ativo);
    const matchAvailability =
      availabilityFilter === 'all' ||
      (availabilityFilter === 'disponivel' && !p.esgotado && (!p.controlar_estoque || p.estoque > Number(p.estoque_minimo || 0))) ||
      (availabilityFilter === 'baixo' && p.controlar_estoque && p.estoque > 0 && p.estoque <= Number(p.estoque_minimo || 0)) ||
      (availabilityFilter === 'esgotado' && (!!p.esgotado || (p.controlar_estoque && p.estoque <= 0)));

    return matchType && matchSearch && matchCat && matchStatus && matchAvailability;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => sortOrder === 'name' ? a.nome.localeCompare(b.nome, 'pt-BR') : sortOrder === 'price' ? Number(a.preco || 0) - Number(b.preco || 0) : sortOrder === 'recent' ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() : 0);
  const pages = Math.max(1, Math.ceil(sortedProducts.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageProducts = sortedProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filtersInitialized = React.useRef(false);
  useEffect(() => {
    if (!filtersInitialized.current) { filtersInitialized.current = true; return; }
    setPage(1); setSelectedIds([]);
  }, [searchTerm, categoryFilter, statusFilter, availabilityFilter, itemTypeFilter, pageSize]);
  const applyBatch = async (field: 'ativo' | 'esgotado', value: boolean) => {
    if (batchBusy || !selectedIds.length || !canWriteCatalog) return;
    if (!window.confirm('Aplicar esta alteração a ' + selectedIds.length + ' item(ns)?')) return;
    setBatchBusy(true); setBatchMessage('');
    const failed: string[] = []; const errors: string[] = [];
    for (const id of selectedIds) {
      const product = produtos.find(item => String(item._id) === id);
      try {
        if (!product?.updatedAt) throw new Error('Atualize o catálogo antes de alterar este item.');
        await api.updateProduct(id, { [field]: value, expectedUpdatedAt: new Date(product.updatedAt).toISOString() });
      } catch (error) { failed.push(id); errors.push((product?.nome || 'Item') + ': ' + (error instanceof Error ? error.message : 'Não foi possível salvar.')); }
    }
    setSelectedIds(failed); await fetchDados(); setBatchBusy(false);
    setBatchMessage((selectedIds.length - failed.length) + ' item(ns) atualizado(s).' + (errors.length ? ' Revise os itens selecionados: ' + errors.join(' · ') : ''));
  };
  const activeFilterCount = [
    itemTypeFilter !== 'all',
    searchTerm.trim() !== '',
    categoryFilter !== 'all',
    statusFilter !== 'all',
    availabilityFilter !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setItemTypeFilter('all');
    setSearchTerm('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setAvailabilityFilter('all');
  };
  return (
    <div className="space-y-4">{editorLoading && <p role="status" className="rounded-xl border bg-white p-5">Abrindo cadastro…</p>}{editorError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5"><p>{editorError}</p><button type="button" onClick={() => closeProductEditor(true)} className="mt-3 min-h-10 underline">Voltar ao catálogo</button></div>}{loadError && <div role="alert" className="rounded-xl bg-amber-50 p-4">{loadError}<button type="button" onClick={() => void fetchDados()} className="ml-3 min-h-10 underline">Tentar novamente</button></div>}
      {!isEditing && editingCombo === undefined && (
        <>
          {/* Action & Filter Toolbar */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-900">
                  {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''}
                </span>
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200/60">
                    {activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''} ativo{activeFilterCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {canWriteCatalog && onNavigateToImport && (
                  <button
                    type="button"
                    onClick={onNavigateToImport}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 shadow-2xs hover:bg-emerald-100/70 transition-colors"
                    title="Importar um cardápio existente com revisão assistida"
                  >
                    <Sparkles className="h-4 w-4" />
                    Importar cardápio
                  </button>
                )}
                <div className="relative">
                <button type="button" onClick={() => setShowNewItemMenu((visible) => !visible)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition-colors">
                  <Plus className="h-4 w-4" /> Novo item
                </button>
                {showNewItemMenu && <div className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <button type="button" onClick={() => openNewProduct()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Package className="h-4 w-4 text-slate-500" /> Produto</button>
                  <button type="button" onClick={() => { setEditorUrl({ kind: "combo", id: "novo" }); setEditingCombo(null); setShowNewItemMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"><Layers className="h-4 w-4" /> Combo</button>
                </div>}
              </div>
              </div>
            </div>

            {/* Quick Type Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-2.5">
              <button
                type="button"
                onClick={() => setItemTypeFilter('all')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  itemTypeFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                Todos
                <span className={`rounded-full px-1.5 py-0.2 text-xs ${
                  itemTypeFilter === 'all' ? 'bg-slate-800 text-slate-200' : 'bg-slate-200/80 text-slate-700'
                }`}>
                  {counts.all}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setItemTypeFilter('produto')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  itemTypeFilter === 'produto'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                Produtos
                <span className={`rounded-full px-1.5 py-0.2 text-xs ${
                  itemTypeFilter === 'produto' ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-200/80 text-slate-700'
                }`}>
                  {counts.produto}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setItemTypeFilter('combo')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  itemTypeFilter === 'combo'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Combos
                <span className={`rounded-full px-1.5 py-0.2 text-xs ${
                  itemTypeFilter === 'combo' ? 'bg-teal-700 text-teal-100' : 'bg-slate-200/80 text-slate-700'
                }`}>
                  {counts.combo}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setItemTypeFilter('exclusivo')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  itemTypeFilter === 'exclusivo'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                🔒 Itens exclusivos
                <span className={`rounded-full px-1.5 py-0.2 text-xs ${
                  itemTypeFilter === 'exclusivo' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200/80 text-slate-700'
                }`}>
                  {counts.exclusivo}
                </span>
              </button>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, descrição ou categoria..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={`w-full appearance-none rounded-lg border py-1.5 px-3 text-xs outline-none transition-colors ${
                  categoryFilter !== 'all'
                    ? 'border-emerald-300 bg-emerald-50/60 text-emerald-900 font-medium'
                    : 'border-slate-200/80 bg-slate-50/50 text-slate-700 focus:bg-white'
                }`}
              >
                <option value="all">Todas as categorias</option>
                {categorias.map((c) => (
                  <option key={c.id || c._id} value={c.id || c._id}>
                    {c.nome}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`w-full appearance-none rounded-lg border py-1.5 px-3 text-xs outline-none transition-colors ${
                  statusFilter !== 'all'
                    ? 'border-emerald-300 bg-emerald-50/60 text-emerald-900 font-medium'
                    : 'border-slate-200/80 bg-slate-50/50 text-slate-700 focus:bg-white'
                }`}
              >
                <option value="all">Status: Todos</option>
                <option value="ativo">Status: Ativo na loja</option>
                <option value="inativo">Status: Inativo/Oculto</option>
              </select>

              <div className="flex items-center gap-2">
                <select
                  value={availabilityFilter}
                  onChange={(e) => setAvailabilityFilter(e.target.value)}
                  className={`w-full appearance-none rounded-lg border py-1.5 px-3 text-xs outline-none transition-colors ${
                    availabilityFilter !== 'all'
                      ? 'border-amber-300 bg-amber-50/60 text-amber-900 font-medium'
                      : 'border-slate-200/80 bg-slate-50/50 text-slate-700 focus:bg-white'
                  }`}
                >
                  <option value="all">Disponibilidade: Todas</option>
                  <option value="disponivel">Disponível para compra</option>
                  <option value="baixo">Estoque Baixo</option>
                  <option value="esgotado">Esgotado</option>
                </select>

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                    title="Limpar filtros"
                  >
                    <FilterX className="h-3.5 w-3.5 text-slate-500" />
                    Limpar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Operational Legend / Status helper bar */}
          <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
              <Eye className="h-3 w-3 text-emerald-600" />
              <strong>Ativo/Inativo:</strong> Visibilidade no cardápio público
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              <strong>Esgotado:</strong> Visível na loja, mas bloqueia adição ao carrinho
            </span>
          </div>

          {/* Mobile Product List */}
          <div className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <button type="button" onClick={() => setBulkSalesOpen(true)} className="min-h-11 rounded-lg border px-3 text-sm font-semibold">Alterar forma de venda em lote</button>
            {produtos.some((p) => !p.preorderDraft?.availability || p.preorderDraft.availability === 'inherit') && <p className="text-sm text-amber-800">Revise os produtos antigos: os que seguiam a loja agora aceitam apenas pedidos para agora. Selecione em lote os que devem aceitar encomendas.</p>}
          </div>
          {bulkSalesOpen && <BulkProductSalesMode products={filteredProducts} onClose={() => setBulkSalesOpen(false)} onSaved={() => { void fetchDados(); }} />}
          <div className="grid gap-2.5 sm:hidden">
            {loading ? (
              <div className="rounded-xl border border-slate-200/80 bg-white p-6 text-center text-xs text-slate-500">
                Carregando produtos do catálogo...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200/80 bg-white p-8 text-center">
                <Package className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-900">Nenhum produto encontrado</p>
                <p className="text-xs text-slate-500 mt-0.5">Tente ajustar os termos de busca ou filtros.</p>
                <button
                  type="button"
                  onClick={() => openNewProduct()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Cadastrar produto
                </button>
              </div>
            ) : (
              pageProducts.map((produto) => (
                <div key={produto._id} className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-emerald-800">{productSalesLabel(produto)}</p>{canWriteCatalog && <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" aria-label={"Selecionar " + produto.nome} disabled={batchBusy} checked={selectedIds.includes(String(produto._id))} onChange={event => setSelectedIds(event.target.checked ? [...new Set([...selectedIds, String(produto._id)])] : selectedIds.filter(id => id !== String(produto._id)))} />Selecionar</label>}</div>
                  <div className="flex gap-2.5">
                    {produto.imagem ? (
                      <img
                        src={produto.imagem}
                        alt={produto.nome}
                        className="h-12 w-12 shrink-0 rounded-lg object-cover border border-slate-200/80"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 border border-slate-200/80">
                        <ImageIcon className="h-5 w-5 text-slate-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1.5">
                        <p className="font-semibold text-xs text-slate-900 truncate">{produto.nome}</p>
                        {produto.destaque && (
                          <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Em destaque" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                        {produto.descricao || 'Sem descrição cadastrada.'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-slate-900">
                          {produto.tipo === 'combo' ? 'A partir de ' : ''}R$ {(produto.preco || 0).toFixed(2).replace('.', ',')}
                        </span>
                        {produto.preco_antigo > 0 && (
                          <span className="text-xs text-slate-400 line-through">
                            R$ {(produto.preco_antigo || 0).toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {produto.tipo === 'combo' && (
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        {produto.combo_mode === 'fixed'
                          ? `Combo Fixo · ${produto.combo_itens_fixos?.length || 0} ite${(produto.combo_itens_fixos?.length || 0) === 1 ? 'm' : 'ns'}`
                          : `Combo com Escolhas · ${produto.combo_etapas?.length || 0} etapa${(produto.combo_etapas?.length || 0) === 1 ? '' : 's'}`
                        }
                      </span>
                    )}
                    {produto.exclusivo_combo && (() => {
                      const usageCount = exclusiveUsageMap.get(String(produto._id)) || 0;
                      return (
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold border ${
                            usageCount > 0
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                          }`}
                        >
                          🔒 Exclusivo {usageCount > 0 ? `(em ${usageCount} combo${usageCount > 1 ? 's' : ''})` : '(sem uso)'}
                        </span>
                      );
                    })()}
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 border border-slate-200/50">
                      {categoryName(produto)}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 font-semibold border ${
                        produto.ativo
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {produto.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                    {produto.esgotado || (produto.controlar_estoque && produto.estoque <= 0) ? (
                      <span className="rounded-md bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 border border-rose-200/60">
                        Esgotado
                      </span>
                    ) : produto.controlar_estoque && produto.estoque <= Number(produto.estoque_minimo || 0) ? (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 border border-amber-200/60">
                        Estoque Baixo ({produto.estoque})
                      </span>
                    ) : null}
                    {produto.controlar_estoque && produto.estoque > Number(produto.estoque_minimo || 0) && (
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 border border-blue-200/60">
                        Estoque: {produto.estoque} un
                      </span>
                    )}
                  </div>

                  <div className={`grid ${produto.tipo === 'combo' ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5 pt-1 border-t border-slate-100`}>
                    <button
                      type="button"
                      onClick={() => openProductEditor(produto)}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Edit className="h-3.5 w-3.5 text-slate-500" />
                      Editar
                    </button>
                    {produto.tipo === 'combo' && (
                      <button
                        type="button"
                        disabled={duplicatingId === String(produto._id)}
                        onClick={() => handleDuplicateCombo(produto)}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                        title="Duplicar combo"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Clonar
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!canWriteCatalog || (produto.controlar_estoque && produto.estoque <= 0 && !produto.esgotado)} onClick={() => toggleProductEsgotado(produto._id)}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {produto.esgotado ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5 text-amber-600" />}
                      {produto.esgotado ? 'Liberar' : 'Esgotar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleProductActive(produto._id)}
                      className={`inline-flex h-8 items-center justify-center gap-1 rounded-lg text-xs font-medium ${
                        produto.ativo ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {produto.ativo ? 'Ocultar' : 'Publicar'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-3"><label className="text-sm text-slate-600">Ordenar <select aria-label="Ordenar produtos" value={sortOrder} onChange={event => { setSortOrder(event.target.value); setPage(1); }} className="ml-2 min-h-10 rounded-lg border px-2"><option value="catalog">Ordem do cardápio</option><option value="name">Nome</option><option value="price">Preço</option><option value="recent">Atualizados recentemente</option></select></label><label className="text-sm text-slate-600">Por página <select aria-label="Produtos por página" value={pageSize} onChange={event => setPageSize(Number(event.target.value))} className="ml-2 min-h-10 rounded-lg border px-2"><option value="25">25</option><option value="50">50</option></select></label></div>
            <div className="flex items-center gap-2 text-sm"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Anterior</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Próxima</button></div>
            {canWriteCatalog && <div className="flex w-full flex-wrap items-center gap-2 border-t pt-3"><span className="mr-2 text-sm text-slate-600">{selectedIds.length} selecionado(s)</span><button type="button" disabled={batchBusy} onClick={() => setSelectedIds(filteredProducts.map(product => String(product._id)))} className="min-h-10 rounded-lg border px-3 text-xs">Selecionar todos os resultados ({filteredProducts.length})</button><button type="button" disabled={batchBusy} onClick={() => setSelectedIds([])} className="min-h-10 px-2 text-xs">Limpar seleção</button>{(['Publicar', 'Ocultar', 'Esgotar', 'Liberar esgotamento'] as const).map((label, index) => <button key={label} type="button" disabled={batchBusy || !selectedIds.length} onClick={() => void applyBatch(index < 2 ? 'ativo' : 'esgotado', index === 0 || index === 2)} className="min-h-10 rounded-lg border px-3 text-xs font-semibold disabled:opacity-40">{batchBusy ? 'Salvando…' : label}</button>)}</div>}
            {selectedIds.length > 0 && <p className="w-full text-xs text-slate-500">Liberar esgotamento manual não repõe estoque. Itens sem estoque continuam indisponíveis.</p>}
            {batchMessage && <p role="status" className="w-full rounded-lg bg-slate-50 p-3 text-sm">{batchMessage}</p>}
          </section>
          {/* Desktop High-Density SaaS Table */}
          <div className="hidden sm:block overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3.5">{canWriteCatalog && <input type="checkbox" aria-label="Selecionar esta página" disabled={batchBusy} checked={pageProducts.length > 0 && pageProducts.every(product => selectedIds.includes(String(product._id)))} onChange={event => setSelectedIds(event.target.checked ? [...new Set([...selectedIds, ...pageProducts.map(product => String(product._id))])] : selectedIds.filter(id => !pageProducts.some(product => String(product._id) === id)))} className="mr-3 h-4 w-4 align-middle" />}Produto</th>
                    <th className="py-2.5 px-3.5">Categoria</th>
                    <th className="py-2.5 px-3.5">Preço</th>
                    <th className="py-2.5 px-3.5">Estoque</th>
                    <th className="py-2.5 px-3.5">Compra</th>
                    <th className="py-2.5 px-3.5">Status</th>
                    <th className="py-2.5 px-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Carregando produtos...
                      </td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center">
                        <Package className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                        <p className="font-semibold text-slate-900 text-sm">{produtos.length ? "Nenhum produto corresponde aos filtros" : "Seu cardápio está vazio"}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Adicione o primeiro produto que seus clientes poderão pedir.</p>
                        <button
                          type="button"
                          onClick={() => openNewProduct()}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700"
                        >
                          <Plus className="h-3.5 w-3.5" /> Cadastrar produto
                        </button>
                      </td>
                    </tr>
                  ) : (
                    pageProducts.map((produto) => (
                      <tr key={produto._id} className="transition-colors hover:bg-slate-50/60">
                        <td className="py-2.5 px-3.5">
                          {canWriteCatalog && <input type="checkbox" aria-label={"Selecionar " + produto.nome} disabled={batchBusy} checked={selectedIds.includes(String(produto._id))} onChange={event => setSelectedIds(event.target.checked ? [...new Set([...selectedIds, String(produto._id)])] : selectedIds.filter(id => id !== String(produto._id)))} className="float-left mr-3 mt-3 h-4 w-4" />}
                          <p className="mb-1 text-xs font-semibold text-emerald-800">{productSalesLabel(produto)}</p>
                          <div className="flex items-center gap-3">
                            {produto.imagem ? (
                              <img
                                src={produto.imagem}
                                alt={produto.nome}
                                className="h-10 w-10 shrink-0 rounded-lg object-cover border border-slate-200/80"
                              />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 border border-slate-200/80">
                                <ImageIcon className="h-4 w-4 text-slate-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900 truncate max-w-[18rem]">
                                  {produto.nome}
                                </span>
                                {produto.destaque && (
                                  <span title="Produto em destaque" className="inline-flex">
                                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                                  </span>
                                )}
                                {produto.tipo === 'combo' && (
                                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                    {produto.combo_mode === 'fixed'
                                      ? `Combo Fixo · ${produto.combo_itens_fixos?.length || 0} ite${(produto.combo_itens_fixos?.length || 0) === 1 ? 'm' : 'ns'}`
                                      : `Combo com Escolhas · ${produto.combo_etapas?.length || 0} etapa${(produto.combo_etapas?.length || 0) === 1 ? '' : 's'}`
                                    }
                                  </span>
                                )}
                                {produto.exclusivo_combo && (() => {
                                  const usageCount = exclusiveUsageMap.get(String(produto._id)) || 0;
                                  return (
                                    <span
                                      className={`rounded-md px-1.5 py-0.5 text-xs font-semibold border ${
                                        usageCount > 0
                                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                          : 'border-amber-200 bg-amber-50 text-amber-700'
                                      }`}
                                      title={usageCount > 0 ? `Em uso por ${usageCount} combo(s)` : 'Item exclusivo sem nenhum combo vinculado'}
                                    >
                                      🔒 Exclusivo {usageCount > 0 ? `(em ${usageCount} combo${usageCount > 1 ? 's' : ''})` : '(sem uso)'}
                                    </span>
                                  );
                                })()}
                              </div>
                              <p className="line-clamp-1 text-xs text-slate-500 max-w-[20rem]">
                                {produto.descricao || 'Sem descrição'}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-3.5">
                          <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200/50 whitespace-nowrap">
                            {categoryName(produto)}
                          </span>
                        </td>

                        <td className="py-2.5 px-3.5">
                          <div className="whitespace-nowrap">
                            <span className="font-semibold text-slate-900">
                              {produto.tipo === 'combo' ? 'A partir de ' : ''}R$ {(produto.preco || 0).toFixed(2).replace('.', ',')}
                            </span>
                            {produto.preco_antigo > 0 && (
                              <span className="block text-xs text-slate-400 line-through">
                                R$ {(produto.preco_antigo || 0).toFixed(2).replace('.', ',')}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          {produto.tipo === 'combo' ? <span className="text-xs text-slate-500">Componentes</span> : produto.controlar_estoque ? (
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border ${
                                  produto.estoque <= 0
                                    ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                                    : produto.estoque <= Number(produto.estoque_minimo || 0)
                                    ? 'bg-amber-50 text-amber-800 border-amber-200/60'
                                    : 'bg-blue-50 text-blue-700 border-blue-200/60'
                                }`}
                              >
                                {produto.estoque} un.
                              </span>
                              {produto.estoque_minimo > 0 && (
                                <span className="text-xs text-slate-400">Min: {produto.estoque_minimo}</span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex rounded-md bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 border border-slate-200/60">
                              Ilimitado
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleProductEsgotado(produto._id)}
                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border transition-all ${
                              adminAvailabilityLabel(produto) !== "Disponível"
                                ? 'bg-amber-50 text-amber-800 border-amber-200/80 hover:bg-amber-100'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100'
                            }`}
                            title={produto.controlar_estoque && produto.estoque <= 0 ? "Sem estoque. Reponha o estoque no cadastro; liberar a marcação manual não repõe unidades." : "Alternar marcação manual de esgotamento"}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                adminAvailabilityLabel(produto) !== "Disponível" ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                            />
                            {adminAvailabilityLabel(produto)}
                          </button>
                        </td>

                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleProductActive(produto._id)}
                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border transition-all ${
                              produto.ativo
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                            title="Clique para publicar ou ocultar na loja"
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                produto.ativo ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            {produto.ativo ? 'Ativo' : 'Inativo'}
                          </button>
                        </td>

                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openProductEditor(produto)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                              title="Editar produto"
                            >
                              <Edit className="h-3.5 w-3.5 text-slate-600" />
                            </button>
                            {produto.tipo === 'combo' && (
                              <button
                                type="button"
                                disabled={duplicatingId === String(produto._id)}
                                onClick={() => handleDuplicateCombo(produto)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-700 transition-colors disabled:opacity-50"
                                title="Duplicar combo"
                              >
                                <Copy className="h-3.5 w-3.5 text-teal-600" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setProductToDelete(produto);
                                setShowDeleteModal(true);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 transition-colors"
                              title="Excluir produto"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Product Editor Form / Modal */}
      {isEditing && currentProduct && (
<ProductEditorPage title={currentProduct._id ? "Editar produto" : "Novo produto"} name={currentProduct.nome} image={currentProduct.imagem} price={currentProduct.preco} formId="admin-product-form" busy={isSavingProduct || isUploadingImage} readOnly={!canWriteCatalog} onClose={() => closeProductEditor()}>
          <div>
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 sm:px-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {currentProduct._id ? 'Editar Produto' : 'Novo Produto'}
                </h3>
                <p className="text-xs text-slate-500">Preencha os detalhes e configurações do item do cardápio.</p>
              </div>
              <button
                type="button"
                aria-label="Fechar editor de produto"
                onClick={() => closeProductEditor()}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form id="admin-product-form" onSubmit={handleSaveProduct} className="p-4 sm:p-6 space-y-5">
              {/* Basic Info */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-emerald-600" />
                  Informações Básicas
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-700">Nome do Produto *</label>
                    <input
                      type="text"
                      required
                      value={currentProduct.nome}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, nome: e.target.value })}
                      placeholder="Ex: Hambúrguer Artesanal"
                      className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Categoria *</label>
                    <select
                      value={currentProduct.categoriaId?._id || currentProduct.categoriaId}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, categoriaId: e.target.value })}
                      className="w-full appearance-none rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                    >
                      <option value="">Selecione...</option>
                      {categorias.map((c) => (
                        <option key={c.id || c._id} value={c.id || c._id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Descrição do Item</label>
                  <textarea
                    value={currentProduct.descricao}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, descricao: e.target.value })}
                    placeholder="Ingredientes, porção, modo de preparo..."
                    className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                    rows={2}
                  />
                </div>
              </div>

              {/* Price & Image */}
              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-600" />
                  Preço e Imagem
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Preço Atual (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={currentProduct.preco}
                      onChange={(e) =>
                        setCurrentProduct({
                          ...currentProduct,
                          preco: e.target.value === '' ? '' : parseFloat(e.target.value),
                        })
                      }
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-xs font-bold text-emerald-700 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                    />
                  </div>

                  <div className="rounded-xl border border-teal-200/80 bg-teal-50/40 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <UtensilsCrossed className="h-4 w-4 text-teal-700 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-teal-950">Talheres descartáveis</p>
                          <p className="text-xs text-teal-800/80">Oferecer opção de talheres na sacola quando este item for adicionado</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentProduct.permite_talheres || false}
                        onChange={(e) => setCurrentProduct({ ...currentProduct, permite_talheres: e.target.checked })}
                        className="h-4 w-4 rounded border-teal-300 text-teal-700 focus:ring-teal-600 cursor-pointer shrink-0"
                      />
                    </div>
                    {currentProduct.permite_talheres && (
                      <p className="text-xs text-teal-700/90 font-medium bg-white/70 rounded-lg p-2 border border-teal-200/60">
                        💡 O valor cobrado pelo talher (ou se é gratuito) é configurado para a loja toda em <strong>Loja → Entrega e Pagamento</strong>.
                      </p>
                    )}
                  </div>

                  {/* Exclusivo para Combos */}
                  <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-indigo-700 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-indigo-950">Exclusivo para Combos</p>
                          <p className="text-xs text-indigo-800/80">Ocultar da vitrine principal da loja (disponível apenas dentro das etapas de combos)</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentProduct.exclusivo_combo || false}
                        onChange={(e) => setCurrentProduct({ ...currentProduct, exclusivo_combo: e.target.checked })}
                        className="h-4 w-4 rounded border-indigo-300 text-indigo-700 focus:ring-indigo-600 cursor-pointer shrink-0"
                      />
                    </div>
                    {currentProduct.exclusivo_combo && (
                      <p className="text-xs text-indigo-700/90 font-medium bg-white/70 rounded-lg p-2 border border-indigo-200/60">
                        🔒 Este item <strong>não aparecerá no cardápio avulso</strong>. Ele estará disponível para ser selecionado como opção dentro dos seus combos com controle de estoque e adicionais normais.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Preço Original Rabiscado (R$) <span className="text-xs text-slate-400">(Opcional)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={currentProduct.preco_antigo || ''}
                      onChange={(e) =>
                        setCurrentProduct({
                          ...currentProduct,
                          preco_antigo: e.target.value === '' ? 0 : parseFloat(e.target.value),
                        })
                      }
                      placeholder="Ex: 35.00"
                      className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-xs text-slate-500 line-through outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <ImagePicker
                    label="Foto do Produto"
                    value={currentProduct.imagem || ''}
                    onChange={(url) => setCurrentProduct({ ...currentProduct, imagem: url })}
                    onUploadStatus={setIsUploadingImage}
                  />
                </div>
              </div>

              {/* Destaque no Topo, Selo Decorativo e Fidelidade */}
              <div className="space-y-3 pt-2">
                {/* Grid 2 colunas: Destaque no Topo e Fidelidade */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Destaque no Topo da Home */}
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                        <div>
                          <p className="text-xs font-semibold text-amber-900">Destaque no Topo</p>
                          <p className="text-xs text-amber-700/80">Exibir no carrossel do topo da Home</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentProduct.destaque || false}
                        onChange={(e) => setCurrentProduct({ ...currentProduct, destaque: e.target.checked })}
                        className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Fidelidade */}
                  <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-emerald-600" />
                        <div>
                          <p className="text-xs font-semibold text-emerald-900">Programa de Fidelidade</p>
                          <p className="text-xs text-emerald-700/80">Permitir resgate por pontos</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentProduct.pode_resgatar || false}
                        onChange={(e) => setCurrentProduct({ ...currentProduct, pode_resgatar: e.target.checked })}
                        className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-purple-500 cursor-pointer"
                      />
                    </div>

                    {currentProduct.pode_resgatar && (
                      <div className="pt-1">
                        <label className="mb-1 block text-xs font-medium text-emerald-900">
                          Pontos para Resgate
                        </label>
                        <input
                          type="number"
                          value={currentProduct.pontos_resgate || 0}
                          onChange={(e) =>
                            setCurrentProduct({
                              ...currentProduct,
                              pontos_resgate: parseInt(e.target.value) || 0,
                            })
                          }
                          placeholder="Ex: 200"
                          className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-bold text-emerald-900 outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Selo / Etiqueta Decorativa do Card (100% Independente) */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-slate-600" />
                      <div>
                        <p className="text-xs font-semibold text-slate-900">Etiqueta no Card (Selo)</p>
                        <p className="text-xs text-slate-500">Exibe uma pílula decorativa no card deste produto na sua categoria</p>
                      </div>
                    </div>
                    {currentProduct.selo_destaque && (
                      <button
                        type="button"
                        onClick={() => setCurrentProduct({ ...currentProduct, selo_destaque: '' })}
                        className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                      >
                        Remover etiqueta
                      </button>
                    )}
                  </div>

                  {/* Atalhos Rápidos */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { label: 'Sem etiqueta', value: '' },
                      { label: 'Mais pedido', value: 'Mais pedido' },
                      { label: 'Mais vendido', value: 'Mais vendido' },
                      { label: 'Recomendado', value: 'Recomendado' },
                      { label: 'Novidade', value: 'Novidade' },
                      { label: 'Especial', value: 'Especial' },
                    ].map((preset) => {
                      const isSelected = (currentProduct.selo_destaque || '').trim().toLowerCase() === preset.value.toLowerCase();
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setCurrentProduct({ ...currentProduct, selo_destaque: preset.value })}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors border cursor-pointer ${
                            isSelected
                              ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Input Livre */}
                  <div>
                    <input
                      type="text"
                      value={currentProduct.selo_destaque || ''}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, selo_destaque: e.target.value })}
                      placeholder="Ou digite um texto personalizado (ex: Sugestão do Chef)"
                      maxLength={40}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Controle de Estoque */}
              <ProductPreorderEditor value={currentProduct.preorderDraft} disabled={isSavingProduct} onChange={(preorderDraft) => setCurrentProduct((current: typeof currentProduct) => ({ ...current, preorderDraft }))} />
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 space-y-2.5">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={currentProduct.controlar_estoque}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, controlar_estoque: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-slate-900">Controlar Estoque de Unidades</span>
                </label>

                {currentProduct.controlar_estoque && (
                  <div className="grid gap-3 pt-1 sm:grid-cols-2 pl-6">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Quantidade Disponível</label>
                      <input
                        min="0"
                        type="number"
                        value={currentProduct.estoque}
                        onChange={(e) =>
                          setCurrentProduct({
                            ...currentProduct,
                            estoque: e.target.value === '' ? '' : parseInt(e.target.value),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Alerta de Estoque Baixo</label>
                      <input
                        min="0"
                        type="number"
                        value={currentProduct.estoque_minimo || 0}
                        onChange={(e) =>
                          setCurrentProduct({
                            ...currentProduct,
                            estoque_minimo: e.target.value === '' ? '' : parseInt(e.target.value),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Grupos de Adicionais / Upsell */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 space-y-3">
                {(() => {
                  const prodId = String(currentProduct?._id || currentProduct?.id || '');
                  const catId = String(currentProduct?.categoriaId || '');
                  const matchingGlobals = globalGroups.filter((g: any) => {
                    if (g.ativo === false) return false;
                    const matchProd = Array.isArray(g.produtos_vinculados) && g.produtos_vinculados.some((p: any) => String(p._id || p) === prodId);
                    const matchCat = catId && Array.isArray(g.categorias_vinculadas) && g.categorias_vinculadas.some((c: any) => String(c._id || c) === catId);
                    return matchProd || matchCat;
                  });

                  if (matchingGlobals.length === 0) return null;

                  return (
                    <div className="rounded-xl border border-teal-200/90 bg-teal-50/60 p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-teal-700" />
                          Complementos Globais Ativos ({matchingGlobals.length})
                        </span>
                        {onNavigateToComplementGroups && (
                          <button
                            type="button"
                            onClick={onNavigateToComplementGroups}
                            className="text-xs font-bold text-teal-700 hover:underline inline-flex items-center gap-1"
                          >
                            Gerenciar na biblioteca <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-teal-800/80">
                        Este produto já herda os seguintes grupos globais na vitrine do cliente:
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {matchingGlobals.map((g: any) => (
                          <span key={g._id} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-xs font-bold text-teal-900 border border-teal-200 shadow-2xs">
                            <CheckCircle2 className="h-3 w-3 text-teal-600" />
                            {g.nome} ({g.itens?.length || 0} opções)
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-emerald-600" />
                      Adicionais Próprios deste Produto
                    </span>
                    <p className="text-xs text-slate-500">
                      Adicione opções exclusivas ou copie grupos de outro produto já cadastrado.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCopySearchTerm('');
                        setShowCopyModal(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                    >
                      <Copy className="h-3.5 w-3.5 text-slate-500" /> Copiar de outro produto
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const g = [...(currentProduct.grupos_adicionais || [])];
                        g.push({ nome: 'Novo Grupo', obrigatorio: false, minimo: 0, maximo: 1, itens: [] });
                        setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar Grupo
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {(currentProduct.grupos_adicionais || []).map((grupo: any, gIndex: number) => (
                    <div key={gIndex} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2.5">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 items-end">
                        <div className="sm:col-span-5">
                          <label className="block text-xs font-medium text-slate-500">Nome do Grupo</label>
                          <input
                            type="text"
                            value={grupo.nome}
                            onChange={(e) => handleUpdateGrupo(gIndex, 'nome', e.target.value)}
                            placeholder="Ex: Escolha o Recheio"
                            className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs outline-none focus:bg-white"
                          />
                        </div>

                        <div className="sm:col-span-3 flex items-center gap-1.5 py-1">
                          <input
                            type="checkbox"
                            checked={grupo.obrigatorio}
                            onChange={(e) => handleUpdateGrupo(gIndex, 'obrigatorio', e.target.checked)}
                            className="h-3.5 w-3.5 rounded text-emerald-600"
                          />
                          <span className="text-xs font-medium text-slate-700">Obrigatório</span>
                        </div>

                        <div className="sm:col-span-3 flex gap-2">
                          <div>
                            <label className="block text-xs font-medium text-slate-500">Mín</label>
                            <input
                              type="number"
                              min={grupo.obrigatorio ? 1 : 0}
                              value={grupo.minimo}
                              onChange={(e) => handleUpdateGrupo(gIndex, 'minimo', parseInt(e.target.value) || 0)}
                              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none focus:bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500">Máx</label>
                            <input
                              type="number"
                              min={1}
                              value={grupo.maximo}
                              onChange={(e) => handleUpdateGrupo(gIndex, 'maximo', parseInt(e.target.value) || 1)}
                              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none focus:bg-white"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              const g = [...currentProduct.grupos_adicionais];
                              g.splice(gIndex, 1);
                              setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                            }}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                            title="Remover grupo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Items inside group */}
                      <div className="border-t border-slate-100 pt-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-600">Opções do Grupo</span>
                          <button
                            type="button"
                            onClick={() => {
                              const g = [...currentProduct.grupos_adicionais];
                              g[gIndex].itens = [...(g[gIndex].itens || []), { nome: '', descricao: '', preco: 0, maximo: 0, ativo: true }];
                              setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            <Plus className="h-3.5 w-3.5" /> Adicionar Opção
                          </button>
                        </div>

                        {(grupo.itens || []).map((item: any, iIndex: number) => (
                          <div key={iIndex} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5 space-y-1.5">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <input
                                type="text"
                                value={item.nome}
                                onChange={(e) => {
                                  const g = [...currentProduct.grupos_adicionais];
                                  g[gIndex].itens[iIndex].nome = e.target.value;
                                  setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                                }}
                                placeholder="Nome do adicional (ex: Hambúrguer Extra)"
                                className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs outline-none focus:border-emerald-500"
                              />
                              <div className="relative w-24">
                                <span className="absolute left-2 top-1 text-xs text-slate-400 font-bold">R$</span>
                                <input
                                  type="number"
                                  step="0.5"
                                  min={0}
                                  value={item.preco}
                                  onChange={(e) => {
                                    const g = [...currentProduct.grupos_adicionais];
                                    g[gIndex].itens[iIndex].preco = parseFloat(e.target.value) || 0;
                                    setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                                  }}
                                  placeholder="0,00"
                                  className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs font-semibold outline-none focus:border-emerald-500"
                                />
                              </div>
                              <div className="w-24">
                                <input
                                  type="number"
                                  min={0}
                                  value={item.maximo || 0}
                                  onChange={(e) => {
                                    const g = [...currentProduct.grupos_adicionais];
                                    g[gIndex].itens[iIndex].maximo = parseInt(e.target.value) || 0;
                                    setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                                  }}
                                  placeholder="Máx: 0"
                                  title="Limite individual deste item (0 = sem limite individual)"
                                  className="w-full rounded-lg border border-slate-200 bg-white py-1 px-2 text-xs outline-none focus:border-emerald-500"
                                />
                              </div>
                              <button
                                type="button"
                                 onClick={() => {
                                   const g = [...currentProduct.grupos_adicionais];
                                   const isCurrentlyActive = g[gIndex].itens[iIndex].ativo !== false;
                                   if (isCurrentlyActive && activeComplementItemCount(g[gIndex]) - 1 < effectiveComplementMinimum(g[gIndex])) {
                                     showToast(`O grupo exige pelo menos ${effectiveComplementMinimum(g[gIndex])} opcao(oes) ativa(s).`, 'error');
                                     return;
                                   }
                                   g[gIndex].itens[iIndex].ativo = !isCurrentlyActive;
                                  setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                                }}
                                className={`p-1 rounded-lg border transition-colors ${
                                  item.ativo !== false
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                                }`}
                                title={
                                  item.ativo !== false
                                    ? 'Opção ativa (clique para pausar)'
                                    : 'Opção pausada (clique para ativar)'
                                }
                              >
                                {item.ativo !== false ? (
                                  <Eye className="h-3.5 w-3.5" />
                                ) : (
                                  <EyeOff className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const g = [...currentProduct.grupos_adicionais];
                                  g[gIndex].itens.splice(iIndex, 1);
                                  setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                                }}
                                className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Remover opção"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <input
                              type="text"
                              value={item.descricao || ''}
                              onChange={(e) => {
                                const g = [...currentProduct.grupos_adicionais];
                                g[gIndex].itens[iIndex].descricao = e.target.value;
                                setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                              }}
                              placeholder="Descrição breve do adicional (ex: Blend bovino de 150g assado na brasa)..."
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 outline-none focus:border-emerald-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => closeProductEditor()}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploadingImage || isSavingProduct}
                  className={`rounded-lg px-5 py-2 text-xs font-semibold text-white shadow-2xs transition-all ${
                    isUploadingImage || isSavingProduct
                      ? 'cursor-not-allowed bg-slate-400'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isUploadingImage ? 'Enviando Imagem...' : isSavingProduct ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </div>
        </ProductEditorPage>
      )}

      {editingCombo !== undefined && (
        <AdminComboEditor
          pageMode onDirtyChange={onDirtyChange}
          defaultSalesMode={defaultSalesMode}
          combo={editingCombo || undefined}
          categories={categorias}
          products={produtos}
          onClose={() => closeProductEditor(true)}
          onSaved={() => { closeProductEditor(true); fetchDados(); }}
        />
      )}

      {/* Copy Additional Groups Modal */}
      {showCopyModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md my-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Copy className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Copiar Adicionais de Outro Produto</h3>
                  <p className="text-xs text-slate-500">Selecione o produto modelo para clonar seus grupos.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCopyModal(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar produto modelo..."
                value={copySearchTerm}
                onChange={(e) => setCopySearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs outline-none focus:bg-white focus:border-teal-500"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {(() => {
                const currentId = String(currentProduct?._id || currentProduct?.id || '');
                const sourceCandidates = produtos.filter((p) => {
                  const isDiff = String(p._id || p.id) !== currentId;
                  const hasGroups = Array.isArray(p.grupos_adicionais) && p.grupos_adicionais.length > 0;
                  const matchSearch = !copySearchTerm || p.nome?.toLowerCase().includes(copySearchTerm.toLowerCase());
                  return isDiff && hasGroups && matchSearch;
                });

                if (sourceCandidates.length === 0) {
                  return (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Nenhum outro produto com adicionais configurados foi encontrado.
                    </div>
                  );
                }

                return sourceCandidates.map((srcProd) => {
                  const groupsCount = srcProd.grupos_adicionais?.length || 0;
                  const itemsCount = srcProd.grupos_adicionais?.reduce((acc: number, g: any) => acc + (g.itens?.length || 0), 0) || 0;

                  return (
                    <button
                      key={srcProd._id || srcProd.id}
                      type="button"
                      onClick={() => {
                        const cloned = JSON.parse(JSON.stringify(srcProd.grupos_adicionais || [])).map((group: any) => {
                          delete group._id;
                          if (Array.isArray(group.itens)) {
                            group.itens = group.itens.map((item: any) => {
                              delete item._id;
                              return item;
                            });
                          }
                          return group;
                        });

                        setCurrentProduct({
                          ...currentProduct,
                          grupos_adicionais: [...(currentProduct.grupos_adicionais || []), ...cloned],
                        });
                        setShowCopyModal(false);
                        showToast(`${cloned.length} grupo(s) de adicionais copiados de "${srcProd.nome}"!`, 'success');
                      }}
                      className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-teal-50/60 hover:border-teal-300 transition-all cursor-pointer group"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-900 group-hover:text-teal-950">{srcProd.nome}</p>
                        <p className="text-xs text-slate-500 font-medium">
                          {groupsCount} grupo{groupsCount === 1 ? '' : 's'} • {itemsCount} opç{itemsCount === 1 ? 'ão' : 'ões'}
                        </p>
                      </div>
                      <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-teal-700 border border-slate-200 group-hover:border-teal-300 shadow-2xs">
                        Copiar
                      </span>
                    </button>
                  );
                });
              })()}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCopyModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm my-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Excluir Produto?</h3>
              <p className="mt-1 text-xs text-slate-500">
                A ação irá remover permanentemente o produto{' '}
                <strong className="text-slate-900">{productToDelete?.nome}</strong> do seu catálogo.
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeletePermanent}
                disabled={deleting}
                className="flex-1 rounded-lg bg-rose-600 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-rose-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
