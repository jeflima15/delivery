// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Edit,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Package,
  Plus,
  Save,
  Search,
  ShoppingBag,
  Star,
  Tags,
  X,
} from 'lucide-react';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

function SortableCategoryCard({
  category,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  children,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category._id || category.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
      }}
      className={`overflow-hidden rounded-[1.75rem] border bg-white shadow-sm transition-all ${
        isDragging ? 'border-emerald-200 shadow-lg' : 'border-gray-100'
      }`}
    >
      <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-0.5 inline-flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-2xl bg-gray-50 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
            aria-label={`Arrastar categoria ${category.nome}`}
            title={`Arrastar categoria ${category.nome}`}
          >
            <GripVertical className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Tags className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-lg font-black tracking-tight text-gray-900">
                  {category.nome}
                </h3>
                <span className="inline-flex items-center rounded-full bg-gray-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                  {category.produtos.length} produto(s)
                </span>
              </div>
              {category.descricao ? (
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-500">
                  {category.descricao}
                </p>
              ) : (
                <p className="mt-2 text-sm text-gray-400">
                  Sem descricao curta. A ordem desta categoria e respeitada na loja publica.
                </p>
              )}
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gray-50 text-gray-500">
              {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </div>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm font-bold text-gray-600 transition-colors hover:border-emerald-100 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <Edit className="h-4 w-4" />
            Editar categoria
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"
          >
            <X className="h-4 w-4" />
            Excluir
          </button>
        </div>
      </div>

      {expanded && children}
    </div>
  );
}

function SortableProductRow({ product, onToggleHighlight, onEditProduct }) {
  const sortableId = product.sortableId || product._id || product.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });

  const isDiscounted = Number(product.preco_antigo || 0) > Number(product.preco || 0);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
      }}
      className={`flex flex-col gap-4 px-5 py-4 transition-colors md:flex-row md:items-center md:justify-between ${
        isDragging ? 'bg-emerald-50/50' : 'hover:bg-gray-50/70'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 inline-flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-2xl bg-gray-50 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
          aria-label={`Arrastar produto ${product.nome}`}
          title={`Arrastar produto ${product.nome}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
            {product.imagem ? (
              <img src={product.imagem} alt={product.nome} className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-5 w-5 text-gray-300" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-sm font-black uppercase tracking-wide text-gray-900">
                {product.nome}
              </h4>
              {product.destaque && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
                  <Star className="h-3 w-3 fill-current" />
                  Destaque
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-gray-900">
                R$ {(Number(product.preco) || 0).toFixed(2).replace('.', ',')}
              </span>
              {isDiscounted && (
                <span className="text-xs font-medium text-gray-400 line-through">
                  R$ {(Number(product.preco_antigo) || 0).toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${product.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {product.ativo ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {product.ativo ? 'Ativo' : 'Oculto'}
              </span>
              {product.esgotado && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">
                  <ShoppingBag className="h-3 w-3" />
                  Esgotado
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <button
          type="button"
          onClick={onToggleHighlight}
          className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] transition-colors ${
            product.destaque
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-gray-200 bg-white text-gray-500 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${product.destaque ? 'fill-current' : ''}`} />
          {product.destaque ? 'Em destaque' : 'Destacar'}
        </button>
        <button
          type="button"
          onClick={onEditProduct}
          className="inline-flex items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-gray-600 transition-colors hover:border-emerald-100 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <Edit className="h-3.5 w-3.5" />
          Editar
        </button>
      </div>
    </div>
  );
}

function CategoryProductsList({
  groupId,
  products,
  sensors,
  onDragEnd,
  onToggleHighlight,
  onEditProduct,
  emptyMessage,
}) {
  if (!products.length) {
    return (
      <div className="px-5 py-5 text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => onDragEnd(groupId, event)}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext items={products.map((product) => product.sortableId || product._id || product.id)} strategy={verticalListSortingStrategy}>
        <div className="divide-y divide-gray-100">
          {products.map((product) => (
            <SortableProductRow
              key={product.sortableId || product._id || product.id}
              product={product}
              onToggleHighlight={() => onToggleHighlight(groupId, product._id || product.id)}
              onEditProduct={() => onEditProduct(product._id || product.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default function AdminCategorias({
  token,
  onUnauthorized,
  onNavigateToProducts,
}: {
  token: string;
  onUnauthorized: () => void;
  onNavigateToProducts?: () => void;
}) {
  const api = useTenantAdminApi();
  const [groups, setGroups] = useState<any[]>([]);
  const [uncategorizedProducts, setUncategorizedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [savedSignature, setSavedSignature] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saved' | 'error'>('idle');
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [currentCategory, setCurrentCategory] = useState<any>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const { showToast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const getStructureSignature = (currentGroups: any[], currentUncategorized: any[]) =>
    JSON.stringify({
      categories: currentGroups.map((group, categoryIndex) => ({
        id: group._id || group.id,
        ordem: categoryIndex,
        produtos: group.produtos.map((product, productIndex) => ({
          id: product._id || product.id,
          ordem_categoria: productIndex,
          destaque: !!product.destaque,
        })),
      })),
      semCategoria: currentUncategorized.map((product, index) => ({
        id: product._id || product.id,
        ordem_categoria: index,
        destaque: !!product.destaque,
      })),
    });

  const hasPendingChanges = useMemo(
    () => groups.length > 0 || uncategorizedProducts.length > 0
      ? getStructureSignature(groups, uncategorizedProducts) !== savedSignature
      : false,
    [groups, uncategorizedProducts, savedSignature]
  );

  const markPendingChange = () => {
    setSaveFeedback('idle');
  };

  const normalizeProductList = (products: any[], prefix: string) =>
    [...(products || [])].map((product, index) => ({
      ...product,
      ordem_categoria: product.ordem_categoria ?? product.ordem ?? index,
      sortableId: `${prefix}-${product._id || product.id}`,
    }));

  const fetchStructure = async () => {
    setLoading(true);
    try {
      const data = await api.getCatalogStructure();

      const nextGroups = (data.categories || []).map((category, index) => ({
        ...category,
        ordem: category.ordem ?? index,
        produtos: normalizeProductList(category.produtos || [], category._id || category.id || `categoria-${index}`),
      }));

      const nextUncategorized = normalizeProductList(data.uncategorized || [], 'sem-categoria');

      setGroups(nextGroups);
      setUncategorizedProducts(nextUncategorized);
      let remembered: string[] = [];
      try { remembered = JSON.parse(localStorage.getItem('admin-catalog-expanded') || '[]'); } catch { remembered = []; }
      const validRemembered = remembered.filter((id) => nextGroups.some((category) => String(category._id || category.id) === String(id)));
      setExpandedIds(validRemembered.length ? validRemembered : nextGroups.slice(0, 1).map((category) => category._id || category.id));
      setSavedSignature(getStructureSignature(nextGroups, nextUncategorized));
      setSaveFeedback('idle');
    } catch (error) {
      showToast('Erro ao carregar a estrutura do catalogo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStructure();
  }, [token]);

  useEffect(() => {
    localStorage.setItem('admin-catalog-expanded', JSON.stringify(expandedIds));
  }, [expandedIds]);

  const visibleGroups = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((group) => String(group.nome || '').toLowerCase().includes(query) || group.produtos.some((product: any) => String(product.nome || '').toLowerCase().includes(query)));
  }, [groups, catalogSearch]);

  const toggleCategoryExpansion = (categoryId: string) => {
    setExpandedIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    );
  };

  const handleCategoryDragEnd = (event: any) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    setGroups((current) => {
      const oldIndex = current.findIndex((item) => (item._id || item.id) === active.id);
      const newIndex = current.findIndex((item) => (item._id || item.id) === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
    markPendingChange();
  };

  const handleProductDragEnd = (groupId: string, event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (groupId === 'sem-categoria') {
      setUncategorizedProducts((current) => {
        const oldIndex = current.findIndex((item) => (item.sortableId || item._id || item.id) === active.id);
        const newIndex = current.findIndex((item) => (item.sortableId || item._id || item.id) === over.id);
        if (oldIndex < 0 || newIndex < 0) return current;
        return arrayMove(current, oldIndex, newIndex);
      });
    } else {
      setGroups((current) =>
        current.map((group) => {
          if ((group._id || group.id) !== groupId) return group;
          const oldIndex = group.produtos.findIndex((item) => (item.sortableId || item._id || item.id) === active.id);
          const newIndex = group.produtos.findIndex((item) => (item.sortableId || item._id || item.id) === over.id);
          if (oldIndex < 0 || newIndex < 0) return group;

          return {
            ...group,
            produtos: arrayMove(group.produtos, oldIndex, newIndex),
          };
        })
      );
    }

    markPendingChange();
  };

  const handleToggleHighlight = (groupId: string, productId: string) => {
    if (groupId === 'sem-categoria') {
      setUncategorizedProducts((current) =>
        current.map((product) =>
          (product._id || product.id) === productId
            ? { ...product, destaque: !product.destaque }
            : product
        )
      );
    } else {
      setGroups((current) =>
        current.map((group) => {
          if ((group._id || group.id) !== groupId) return group;
          return {
            ...group,
            produtos: group.produtos.map((product) =>
              (product._id || product.id) === productId
                ? { ...product, destaque: !product.destaque }
                : product
            ),
          };
        })
      );
    }

    markPendingChange();
  };

  const handleSaveStructure = async () => {
    setSaving(true);
    setSaveFeedback('idle');

    try {
      const payload = {
        categories: groups.map((group, categoryIndex) => ({
          id: group._id || group.id,
          ordem: categoryIndex,
        })),
        productOrders: [
          ...groups.flatMap((group) =>
            group.produtos.map((product, productIndex) => ({
              id: product._id || product.id,
              ordem_categoria: productIndex,
              destaque: !!product.destaque,
              categoriaId: group._id || group.id,
            }))
          ),
          ...uncategorizedProducts.map((product, productIndex) => ({
            id: product._id || product.id,
            ordem_categoria: productIndex,
            destaque: !!product.destaque,
            categoriaId: null,
          })),
        ],
      };

      await api.saveCatalogStructure(payload);

      setSavedSignature(getStructureSignature(groups, uncategorizedProducts));
      setSaveFeedback('saved');
      showToast('Estrutura do catalogo salva com sucesso!', 'success');
      fetchStructure();
    } catch (error: any) {
      setSaveFeedback('error');
      showToast(error?.message || 'Erro ao salvar a estrutura do catalogo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openNewCategory = () => {
    setCurrentCategory({ nome: '', descricao: '' });
    setIsEditingCategory(true);
  };

  const openEditCategory = (category: any) => {
    setCurrentCategory({
      _id: category._id || category.id,
      nome: category.nome,
      descricao: category.descricao || '',
    });
    setIsEditingCategory(true);
  };

  const handleSaveCategory = async (event: React.FormEvent) => {
    event.preventDefault();

    const categoryId = currentCategory?._id || currentCategory?.id;
    try {
      const payload = { nome: currentCategory.nome, descricao: currentCategory.descricao || '' };
      if (categoryId) await api.updateCategory(categoryId, payload);
      else await api.createCategory(payload);

      showToast(categoryId ? 'Categoria atualizada com sucesso!' : 'Categoria criada com sucesso!', 'success');
      setIsEditingCategory(false);
      setCurrentCategory(null);
      fetchStructure();
    } catch (error: any) {
      showToast(error?.message || 'Erro ao salvar categoria.', 'error');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!window.confirm('Excluir esta categoria? Produtos vinculados impedem a exclusao.')) {
      return;
    }

    try {
      await api.deleteCategory(categoryId);

      showToast('Categoria excluida com sucesso!', 'success');
      fetchStructure();
    } catch (error: any) {
      showToast(error?.message || 'Erro ao excluir categoria.', 'error');
    }
  };

  const handleEditProduct = (productId: string) => {
    sessionStorage.setItem('admin_edit_product_id', String(productId));
    onNavigateToProducts?.();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[2rem] border border-gray-100 bg-white shadow-sm">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {!isEditingCategory ? (
        <>
          <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">
                  Estrutura do catalogo
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-gray-900">
                  Organize a loja por categoria e depois por produto
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-gray-500">
                  A vitrine publica segue exatamente a ordem das categorias e, dentro de cada uma, a ordem dos produtos.
                  Arraste categorias, abra cada bloco e reordene apenas os itens daquela secao.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={openNewCategory}
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-100 bg-white px-5 py-3 text-sm font-black text-emerald-700 transition-colors hover:bg-emerald-50"
                >
                  <Plus className="h-4 w-4" />
                  Nova categoria
                </button>
                <button
                  type="button"
                  onClick={handleSaveStructure}
                  disabled={saving || !hasPendingChanges}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Salvando
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Salvar estrutura
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">
                <ArrowDownUp className="h-4 w-4 text-gray-400" />
                Primeiro as categorias, depois os produtos da categoria
              </span>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                saveFeedback === 'error'
                  ? 'bg-red-50 text-red-700'
                  : hasPendingChanges
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700'
              }`}>
                <span className={`h-2.5 w-2.5 rounded-full ${
                  saveFeedback === 'error'
                    ? 'bg-red-500'
                    : hasPendingChanges
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}></span>
                {saveFeedback === 'error'
                  ? 'Falha ao salvar'
                  : hasPendingChanges
                    ? 'Alteracoes pendentes'
                    : 'Estrutura sincronizada'}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"><label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3"><Search className="h-4 w-4 text-gray-400" /><input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Buscar categoria ou produto" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><div className="flex gap-2"><button type="button" onClick={() => setExpandedIds(groups.map((group) => group._id || group.id))} className="h-11 flex-1 rounded-xl border border-gray-200 px-3 text-xs font-bold text-gray-600 sm:flex-none">Expandir todas</button><button type="button" onClick={() => setExpandedIds([])} className="h-11 flex-1 rounded-xl border border-gray-200 px-3 text-xs font-bold text-gray-600 sm:flex-none">Recolher todas</button></div></div>
          </section>

          {groups.length === 0 && uncategorizedProducts.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-gray-200 bg-white p-12 text-center shadow-sm">
              <Tags className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
              <h3 className="text-xl font-black tracking-tight text-gray-900">Organize seu cardápio</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500 max-w-md mx-auto">
                Categorias ajudam seus clientes a encontrar os produtos com mais facilidade quando seu cardápio crescer. Categorias são opcionais.
              </p>
              <button
                type="button"
                onClick={openNewCategory}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-emerald-900/10 hover:bg-emerald-700 transition-colors"
              >
                <Plus className="h-4 w-4" /> Criar categoria
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleCategoryDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext items={groups.map((group) => group._id || group.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-5">
                    {visibleGroups.map((group) => {
                      const groupId = group._id || group.id;
                      return (
                        <SortableCategoryCard
                          key={groupId}
                          category={group}
                          expanded={expandedIds.includes(groupId)}
                          onToggle={() => toggleCategoryExpansion(groupId)}
                          onEdit={() => openEditCategory(group)}
                          onDelete={() => handleDeleteCategory(groupId)}
                        >
                          <CategoryProductsList
                            groupId={groupId}
                            products={group.produtos}
                            sensors={sensors}
                            onDragEnd={handleProductDragEnd}
                            onToggleHighlight={handleToggleHighlight}
                            onEditProduct={handleEditProduct}
                            emptyMessage="Nenhum produto nesta categoria ainda. Cadastre ou mova um item pelo formulario de produto."
                          />
                        </SortableCategoryCard>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>

              {uncategorizedProducts.length > 0 && (
                <section className="overflow-hidden rounded-[1.75rem] border border-amber-100 bg-white shadow-sm">
                  <div className="border-b border-amber-100 bg-amber-50/80 px-5 py-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-lg font-black tracking-tight text-amber-900">Produtos sem categoria</h3>
                        <p className="mt-1 text-sm text-amber-800/80">
                          Estes itens aparecem fora da hierarquia principal. O ideal e editar o produto e associar a uma categoria.
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                        {uncategorizedProducts.length} item(ns)
                      </span>
                    </div>
                  </div>

                  <CategoryProductsList
                    groupId="sem-categoria"
                    products={uncategorizedProducts}
                    sensors={sensors}
                    onDragEnd={handleProductDragEnd}
                    onToggleHighlight={handleToggleHighlight}
                    onEditProduct={handleEditProduct}
                    emptyMessage=""
                  />
                </section>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mx-auto max-w-2xl overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gray-50/70 p-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">
                Categoria
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-gray-900">
                {currentCategory?._id ? 'Editar categoria' : 'Nova categoria'}
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Defina o nome da secao e uma descricao curta para facilitar a leitura na loja.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsEditingCategory(false);
                setCurrentCategory(null);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSaveCategory} className="space-y-6 p-8">
            <div>
              <label className="mb-3 block text-sm font-black uppercase tracking-[0.18em] text-gray-500">
                Nome da categoria
              </label>
              <input
                type="text"
                value={currentCategory?.nome || ''}
                onChange={(event) => setCurrentCategory({ ...currentCategory, nome: event.target.value })}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-lg font-medium text-gray-900 outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                placeholder="Ex: Hamburgueres, Bebidas, Sobremesas"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="mb-3 block text-sm font-black uppercase tracking-[0.18em] text-gray-500">
                Descricao curta
              </label>
              <textarea
                value={currentCategory?.descricao || ''}
                onChange={(event) => setCurrentCategory({ ...currentCategory, descricao: event.target.value })}
                className="min-h-[140px] w-full rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-base font-medium text-gray-900 outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                placeholder="Texto opcional exibido logo abaixo do titulo da categoria na home."
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-6">
              <button
                type="button"
                onClick={() => {
                  setIsEditingCategory(false);
                  setCurrentCategory(null);
                }}
                className="rounded-2xl px-6 py-3 text-sm font-black text-gray-500 transition-colors hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-700"
              >
                Salvar categoria
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
