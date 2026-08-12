// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Save,
  Search,
  Star,
  Tags,
  X,
  Trash2,
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
      className={`overflow-hidden rounded-xl border bg-white shadow-2xs transition-all ${
        isDragging ? 'border-emerald-300 shadow-md' : 'border-slate-200/80'
      }`}
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:p-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="inline-flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors active:cursor-grabbing"
            aria-label={`Arrastar categoria ${category.nome}`}
            title={`Arrastar categoria ${category.nome}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
              <Tags className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-xs font-bold text-slate-900">
                  {category.nome}
                </h3>
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200/50">
                  {category.produtos.length} produto{category.produtos.length !== 1 ? 's' : ''}
                </span>
              </div>
              {category.descricao && (
                <p className="line-clamp-1 text-[11px] text-slate-500 mt-0.5">
                  {category.descricao}
                </p>
              )}
            </div>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:text-slate-600">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-center">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Edit className="h-3.5 w-3.5 text-slate-500" />
            Editar
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
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
      className={`flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors border-b border-slate-100 last:border-b-0 ${
        isDragging ? 'bg-emerald-50/50' : 'hover:bg-slate-50/60'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-slate-400 hover:text-slate-600 active:cursor-grabbing"
          aria-label={`Arrastar produto ${product.nome}`}
          title={`Arrastar produto ${product.nome}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200/80 bg-slate-100">
          {product.imagem ? (
            <img src={product.imagem} alt={product.nome} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-4 w-4 text-slate-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-slate-900">
              {product.nome}
            </span>
            {product.destaque && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700" title="Em Destaque">
                <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-semibold text-slate-900">
              R$ {(Number(product.preco) || 0).toFixed(2).replace('.', ',')}
            </span>
            {isDiscounted && (
              <span className="text-[10px] text-slate-400 line-through">
                R$ {(Number(product.preco_antigo) || 0).toFixed(2).replace('.', ',')}
              </span>
            )}
            <span className={`inline-flex rounded-md px-1.5 py-0.2 text-[10px] font-medium ${product.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {product.ativo ? 'Ativo' : 'Oculto'}
            </span>
            {product.esgotado && (
              <span className="inline-flex rounded-md bg-amber-50 px-1.5 py-0.2 text-[10px] font-medium text-amber-800">
                Esgotado
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onToggleHighlight}
          className={`inline-flex h-7 px-2 items-center gap-1 rounded-md text-[11px] font-medium border transition-colors ${
            product.destaque
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
          title="Alternar Destaque"
        >
          <Star className={`h-3 w-3 ${product.destaque ? 'fill-amber-400 text-amber-500' : ''}`} />
          <span className="hidden sm:inline">{product.destaque ? 'Destaque' : 'Destacar'}</span>
        </button>
        <button
          type="button"
          onClick={onEditProduct}
          className="inline-flex h-7 px-2 items-center gap-1 rounded-md border border-slate-200 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          title="Editar Produto"
        >
          <Edit className="h-3 w-3 text-slate-500" />
          <span className="hidden sm:inline">Editar</span>
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
      <div className="px-4 py-3 text-xs text-slate-400 italic">
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
        <div className="bg-white">
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
      showToast('Erro ao carregar a estrutura do catálogo.', 'error');
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
      showToast('Estrutura do catálogo salva com sucesso!', 'success');
      fetchStructure();
    } catch (error: any) {
      setSaveFeedback('error');
      showToast(error?.message || 'Erro ao salvar a estrutura do catálogo.', 'error');
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
      <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="text-xs text-slate-500 font-medium">Carregando estrutura do cardápio...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isEditingCategory ? (
        <>
          {/* Header Bar */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xs font-bold text-slate-900">Organização e Hierarquia do Cardápio</h2>
                <p className="text-[11px] text-slate-500">
                  Arraste para reordenar categorias e produtos na vitrine da loja.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openNewCategory}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-slate-600" />
                  Nova Categoria
                </button>
                <button
                  type="button"
                  onClick={handleSaveStructure}
                  disabled={saving || !hasPendingChanges}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Salvando...' : 'Salvar Estrutura'}
                </button>
              </div>
            </div>

            {/* Search & Expansion Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  placeholder="Filtrar por categoria ou produto..."
                  className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold border ${
                    saveFeedback === 'error'
                      ? 'bg-rose-50 text-rose-700 border-rose-200/80'
                      : hasPendingChanges
                      ? 'bg-amber-50 text-amber-800 border-amber-200/80'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      saveFeedback === 'error' ? 'bg-rose-500' : hasPendingChanges ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                  />
                  {saveFeedback === 'error' ? 'Falha ao salvar' : hasPendingChanges ? 'Alterações pendentes' : 'Sincronizado'}
                </span>

                <button
                  type="button"
                  onClick={() => setExpandedIds(groups.map((group) => group._id || group.id))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  Expandir todas
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedIds([])}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  Recolher
                </button>
              </div>
            </div>
          </div>

          {/* Categories Drag-and-Drop Tree */}
          {groups.length === 0 && uncategorizedProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200/80 bg-white p-8 text-center shadow-2xs">
              <Tags className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-900">Nenhuma categoria cadastrada</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Categorias ajudam seus clientes a navegar pelo seu cardápio com facilidade.
              </p>
              <button
                type="button"
                onClick={openNewCategory}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" /> Criar Categoria
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleCategoryDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext items={groups.map((group) => group._id || group.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
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
                            emptyMessage="Nenhum produto nesta categoria. Crie ou edite um produto e selecione esta categoria."
                          />
                        </SortableCategoryCard>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Uncategorized Products */}
              {uncategorizedProducts.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-amber-200/80 bg-white shadow-2xs">
                  <div className="border-b border-amber-200/80 bg-amber-50/50 p-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-amber-900">Produtos Sem Categoria</h3>
                      <p className="text-[11px] text-amber-700/80">
                        Estes itens aparecem fora de um grupo específico no cardápio.
                      </p>
                    </div>
                    <span className="inline-flex rounded-md bg-amber-100/80 border border-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      {uncategorizedProducts.length} item{uncategorizedProducts.length !== 1 ? 's' : ''}
                    </span>
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
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* Category Edit Form Modal */
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md my-auto rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5">
              <h3 className="text-xs font-bold text-slate-900">
                {currentCategory?._id ? 'Editar Categoria' : 'Nova Categoria'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsEditingCategory(false);
                  setCurrentCategory(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Nome da Categoria *</label>
                <input
                  type="text"
                  value={currentCategory?.nome || ''}
                  onChange={(event) => setCurrentCategory({ ...currentCategory, nome: event.target.value })}
                  placeholder="Ex: Hambúrgueres, Bebidas, Sobremesas"
                  className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Descrição Curta <span className="text-[10px] text-slate-400">(Opcional)</span>
                </label>
                <textarea
                  value={currentCategory?.descricao || ''}
                  onChange={(event) => setCurrentCategory({ ...currentCategory, descricao: event.target.value })}
                  className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  placeholder="Texto explicativo para a categoria exibido no cardápio."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingCategory(false);
                    setCurrentCategory(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition-colors"
                >
                  Salvar Categoria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
