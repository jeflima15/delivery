import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  X,
  Search,
  Layers,
  CheckCircle2,
  AlertCircle,
  FolderTree,
  Package,
  Power,
  Sparkles,
} from 'lucide-react';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { activeComplementItemCount, effectiveComplementMinimum, validateComplementGroupRules } from '../lib/complementRules';

interface ComplementItem {
  _id?: string;
  nome: string;
  descricao?: string;
  preco: number;
  preco_centavos?: number;
  maximo?: number;
  ativo: boolean;
}

interface ComplementGroupData {
  _id?: string;
  nome: string;
  obrigatorio: boolean;
  minimo: number;
  maximo: number;
  ativo: boolean;
  ordem?: number;
  itens: ComplementItem[];
  produtos_vinculados?: any[];
  categorias_vinculadas?: any[];
}

const DEFAULT_GROUP: ComplementGroupData = {
  nome: '',
  obrigatorio: false,
  minimo: 0,
  maximo: 1,
  ativo: true,
  itens: [
    { nome: '', descricao: '', preco: 0, maximo: 0, ativo: true },
  ],
  produtos_vinculados: [],
  categorias_vinculadas: [],
};

export default function AdminComplementGroups({
  token: _token,
  onUnauthorized: _onUnauthorized,
}: {
  token: string;
  onUnauthorized: () => void;
}) {
  const api = useTenantAdminApi();
  const { showToast } = useToast();

  const [groups, setGroups] = useState<ComplementGroupData[]>([]);
  const [categories, setCategorias] = useState<any[]>([]);
  const [products, setProdutos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<ComplementGroupData>(DEFAULT_GROUP);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<ComplementGroupData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const fetchDados = async () => {
    try {
      setLoading(true);
      const [groupsRes, catRes, prodRes] = await Promise.all([
        api.listComplementGroups(),
        api.listCategories(),
        api.listProducts(),
      ]);

      if (groupsRes && groupsRes.items) {
        setGroups(groupsRes.items as unknown as ComplementGroupData[]);
      }
      if (catRes && catRes.items) {
        setCategorias(catRes.items);
      }
      if (prodRes && prodRes.items) {
        setProdutos(prodRes.items);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao carregar grupos de complementos', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDados();
  }, [api]);

  const handleOpenNew = () => {
    setCurrentGroup({
      ...DEFAULT_GROUP,
      itens: [{ nome: '', descricao: '', preco: 0, maximo: 0, ativo: true }],
      produtos_vinculados: [],
      categorias_vinculadas: [],
    });
    setProductSearch('');
    setIsEditing(true);
  };

  const handleOpenEdit = (group: ComplementGroupData) => {
    const rawCatIds = (group.categorias_vinculadas || []).map((c: any) => c._id || c);
    const rawProdIds = (group.produtos_vinculados || []).map((p: any) => p._id || p);

    setCurrentGroup({
      ...group,
      categorias_vinculadas: rawCatIds,
      produtos_vinculados: rawProdIds,
      itens: Array.isArray(group.itens) && group.itens.length > 0
        ? group.itens.map((item) => ({
            ...item,
            descricao: item.descricao || '',
            preco: item.preco || 0,
            maximo: item.maximo || 0,
            ativo: item.ativo !== false,
          }))
        : [{ nome: '', descricao: '', preco: 0, maximo: 0, ativo: true }],
    });
    setProductSearch('');
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentGroup.nome.trim()) {
      showToast('Informe o nome do grupo de complementos.', 'info');
      return;
    }

    const validItens = (currentGroup.itens || []).filter((item) => item.nome.trim());
    if (validItens.length === 0) {
      showToast('Adicione pelo menos um item/adicional ao grupo.', 'info');
      return;
    }

    const effectiveMinimo = currentGroup.obrigatorio
      ? Math.max(1, Number(currentGroup.minimo || 1))
      : Number(currentGroup.minimo || 0);

    if (currentGroup.maximo < effectiveMinimo) {
      showToast('A quantidade máxima deve ser maior ou igual à mínima.', 'info');
      return;
    }
    const rulesError = validateComplementGroupRules({ ...currentGroup, minimo: effectiveMinimo, itens: validItens });
    if (rulesError) {
      showToast(rulesError, 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nome: currentGroup.nome.trim(),
        obrigatorio: Boolean(currentGroup.obrigatorio),
        minimo: effectiveMinimo,
        maximo: Math.max(effectiveMinimo, Number(currentGroup.maximo || 1)),
        ativo: currentGroup.ativo !== false,
        itens: validItens.map((item) => ({
          _id: item._id,
          nome: item.nome.trim(),
          descricao: (item.descricao || '').trim(),
          preco: Number(item.preco || 0),
          maximo: Number(item.maximo || 0),
          ativo: item.ativo !== false,
        })),
        categorias_vinculadas: currentGroup.categorias_vinculadas || [],
        produtos_vinculados: currentGroup.produtos_vinculados || [],
      };

      if (currentGroup._id) {
        await api.updateComplementGroup(currentGroup._id, payload);
        showToast('Grupo de complementos atualizado com sucesso!', 'success');
      } else {
        await api.createComplementGroup(payload);
        showToast('Grupo de complementos criado com sucesso!', 'success');
      }

      setIsEditing(false);
      fetchDados();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao salvar grupo', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (group: ComplementGroupData) => {
    if (!group._id) return;
    try {
      await api.toggleComplementGroup(group._id);
      setGroups((prev) =>
        prev.map((g) => (g._id === group._id ? { ...g, ativo: !g.ativo } : g))
      );
      showToast(`Grupo ${!group.ativo ? 'ativado' : 'desativado'} com sucesso.`, 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao alterar status', 'error');
    }
  };

  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});
  const [togglingGroupIds, setTogglingGroupIds] = useState<Record<string, boolean>>({});

  const handleToggleOptionActive = async (group: ComplementGroupData, itemIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!group._id || togglingGroupIds[group._id]) return;
    const item = group.itens[itemIndex];
    if (!item?._id) {
      showToast('Reabra o grupo antes de alterar esta opcao.', 'error');
      return;
    }

    const nextAtivo = item.ativo === false ? true : false;
    if (!nextAtivo && activeComplementItemCount(group) - 1 < effectiveComplementMinimum(group)) {
      showToast(`Este grupo exige pelo menos ${effectiveComplementMinimum(group)} opcao(oes) ativa(s).`, 'error');
      return;
    }
    setTogglingGroupIds((current) => ({ ...current, [group._id!]: true }));
    const updatedItens = group.itens.map((it, idx) =>
      idx === itemIndex ? { ...it, ativo: nextAtivo } : it
    );

    // Optimistic UI update
    setGroups((prev) =>
      prev.map((g) => (g._id === group._id ? { ...g, itens: updatedItens } : g))
    );

    try {
      await api.setComplementItemStatus(group._id, item._id, nextAtivo);
      showToast(
        `"${item.nome}" ${nextAtivo ? 'disponibilizado' : 'pausado / esgotado'} com sucesso.`,
        nextAtivo ? 'success' : 'info'
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao alterar status do item', 'error');
      setGroups((prev) => prev.map((candidate) => candidate._id === group._id
        ? { ...candidate, itens: candidate.itens.map((candidateItem) => candidateItem._id === item._id ? { ...candidateItem, ativo: item.ativo !== false } : candidateItem) }
        : candidate));
    } finally {
      setTogglingGroupIds((current) => {
        const next = { ...current };
        delete next[group._id!];
        return next;
      });
    }
  };

  const handleDelete = async () => {
    if (!groupToDelete?._id) return;
    setDeleting(true);
    try {
      await api.deleteComplementGroup(groupToDelete._id);
      showToast('Grupo de complementos excluído com sucesso.', 'success');
      setShowDeleteModal(false);
      setGroupToDelete(null);
      fetchDados();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao excluir grupo', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddItem = () => {
    setCurrentGroup({
      ...currentGroup,
      itens: [...(currentGroup.itens || []), { nome: '', descricao: '', preco: 0, maximo: 0, ativo: true }],
    });
  };

  const handleRemoveItem = (index: number) => {
    const updated = [...(currentGroup.itens || [])];
    updated.splice(index, 1);
    setCurrentGroup({ ...currentGroup, itens: updated });
  };

  const handleUpdateItem = (index: number, field: keyof ComplementItem, value: any) => {
    const updated = [...(currentGroup.itens || [])];
    updated[index] = { ...updated[index], [field]: value };
    setCurrentGroup({ ...currentGroup, itens: updated });
  };

  const handleToggleCategoryLink = (catId: string) => {
    const current = currentGroup.categorias_vinculadas || [];
    const exists = current.includes(catId);
    setCurrentGroup({
      ...currentGroup,
      categorias_vinculadas: exists ? current.filter((id) => id !== catId) : [...current, catId],
    });
  };

  const handleToggleProductLink = (prodId: string) => {
    const current = currentGroup.produtos_vinculados || [];
    const exists = current.includes(prodId);
    setCurrentGroup({
      ...currentGroup,
      produtos_vinculados: exists ? current.filter((id) => id !== prodId) : [...current, prodId],
    });
  };

  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return groups;
    const term = searchTerm.toLowerCase();
    return groups.filter((g) => {
      const matchName = g.nome.toLowerCase().includes(term);
      const matchItem = g.itens?.some((item) => item.nome.toLowerCase().includes(term));
      return matchName || matchItem;
    });
  }, [groups, searchTerm]);

  const filteredModalProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const term = productSearch.toLowerCase();
    return products.filter((p) => p.nome?.toLowerCase().includes(term));
  }, [products, productSearch]);

  const totalActiveGroups = groups.filter((g) => g.ativo !== false).length;
  const totalComplementItems = groups.reduce((acc, g) => acc + (g.itens?.length || 0), 0);

  return (
    <div className="space-y-4">
      {/* Top Banner & Action */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Layers className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-xs font-bold text-slate-900">Grupos de complementos</h2>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Crie opções reutilizáveis e escolha exatamente em quais categorias ou produtos elas aparecem.
          </p>
          </div>

          <button
            type="button"
            onClick={handleOpenNew}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-emerald-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo grupo
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">{groups.length} grupo{groups.length === 1 ? '' : 's'}</span>
            <span className="rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">{totalActiveGroups} ativo{totalActiveGroups === 1 ? '' : 's'}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">{totalComplementItems} opç{totalComplementItems === 1 ? 'ão' : 'ões'}</span>
          </div>
          <div className="relative min-w-0 flex-1 sm:ml-auto sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar grupo ou opção..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none transition-colors focus:border-emerald-500 focus:bg-white"
            />
          </div>
        </div>
      </div>

      {/* Groups List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--pv-primary)] border-t-transparent" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-2xs">
          <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Layers className="h-4.5 w-4.5" />
          </span>
          <h3 className="text-sm font-bold text-slate-800">Nenhum grupo de complementos encontrado</h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500">
            {searchTerm
              ? 'Tente buscar por outro termo ou limpe a barra de pesquisa.'
              : 'Cadastre seu primeiro grupo de complementos para reutilizar em múltiplos lanches e itens do cardápio.'}
          </p>
          {!searchTerm && (
            <button type="button"
              onClick={handleOpenNew}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              Criar Primeiro Grupo
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredGroups.map((group) => {
            const linkedCats = (group.categorias_vinculadas || []).map((c: any) => c.nome || categories.find((cat) => String(cat._id) === String(c._id || c))?.nome).filter(Boolean);
            const linkedProds = (group.produtos_vinculados || []).map((p: any) => p.nome || products.find((prod) => String(prod._id) === String(p._id || p))?.nome).filter(Boolean);

            return (
              <div
                key={group._id}
                className={`rounded-xl border bg-white p-3.5 shadow-2xs transition-colors ${
                  group.ativo !== false ? 'border-slate-200/90' : 'border-slate-200 bg-slate-50/60 opacity-70'
                }`}
              >
                <div className="space-y-2.5">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-900">{group.nome}</h4>
                        {group.obrigatorio ? (
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200/70">
                            Obrigatório
                          </span>
                        ) : (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            Opcional
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 font-medium">
                        Escolha de {group.minimo} até {group.maximo} {group.maximo === 1 ? 'item' : 'itens'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggleActive(group)}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          group.ativo !== false
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                        title={group.ativo !== false ? 'Desativar grupo' : 'Ativar grupo'}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(group)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                        title="Editar grupo"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setGroupToDelete(group);
                          setShowDeleteModal(true);
                        }}
                        className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Excluir grupo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Items List Preview com Toggle Rápido */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Itens do Grupo ({group.itens?.length || 0})
                      </p>
                      {(group.itens?.length || 0) > 6 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedGroupIds((prev) => ({
                              ...prev,
                              [group._id || '']: !prev[group._id || ''],
                            }))
                          }
                          className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                        >
                          {expandedGroupIds[group._id || '']
                            ? 'Recolher opções'
                            : `Ver todas as ${group.itens?.length} opções`}
                        </button>
                      )}
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {(expandedGroupIds[group._id || '']
                        ? group.itens || []
                        : (group.itens || []).slice(0, 6)
                      ).map((item, idx) => {
                        const isItemActive = item.ativo !== false;
                        const isToggling = Boolean(group._id && togglingGroupIds[group._id]);

                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] transition-all ${
                              isItemActive
                                ? 'bg-slate-50/80 border-slate-200/80 text-slate-800'
                                : 'bg-slate-100/70 border-slate-200 text-slate-400 opacity-75'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`font-semibold ${
                                    isItemActive
                                      ? 'text-slate-900'
                                      : 'text-slate-400 line-through'
                                  }`}
                                >
                                  {item.nome}
                                </span>
                                {item.maximo && item.maximo > 0 ? (
                                  <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 rounded px-1.5 py-0.2">
                                    máx: {item.maximo}
                                  </span>
                                ) : null}
                              </div>
                              {item.descricao ? (
                                <p className="text-[10px] text-slate-500 line-clamp-1 font-normal">
                                  {item.descricao}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`font-semibold ${
                                  isItemActive ? 'text-emerald-700' : 'text-slate-400'
                                }`}
                              >
                                {Number(item.preco || 0) > 0
                                  ? `+R$ ${Number(item.preco || 0)
                                      .toFixed(2)
                                      .replace('.', ',')}`
                                  : 'Grátis'}
                              </span>

                              {/* Toggle Rápido de 1 Toque */}
                              <button
                                type="button"
                                disabled={isToggling}
                                onClick={(e) => handleToggleOptionActive(group, idx, e)}
                                title={
                                  isItemActive
                                    ? 'Item disponível. Clique para pausar/esgotar'
                                    : 'Item pausado. Clique para disponibilizar'
                                }
                                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all cursor-pointer ${
                                  isItemActive
                                    ? 'bg-emerald-100/70 text-emerald-800 hover:bg-emerald-200/70 border border-emerald-300/50'
                                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300 border border-slate-300'
                                }`}
                              >
                                {isItemActive ? (
                                  <>
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    <span>Ativo</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                    <span>Pausado</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Linked Scope Preview */}
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Onde é exibido no cardápio
                    </p>
                    {linkedCats.length === 0 && linkedProds.length === 0 ? (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 border border-amber-200/60 font-medium flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Não vinculado a nenhuma categoria ou produto ainda.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {linkedCats.map((catName, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
                          >
                            <FolderTree className="h-3 w-3" />
                            Cat: {catName}
                          </span>
                        ))}
                        {linkedProds.map((prodName, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                          >
                            <Package className="h-3 w-3" />
                            {prodName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Create / Edit */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 backdrop-blur-xs sm:p-4" role="dialog" aria-modal="true" aria-labelledby="complement-group-editor-title">
          <div className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Layers className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h3 id="complement-group-editor-title" className="text-xs font-bold text-slate-900">
                    {currentGroup._id ? 'Editar Grupo de Complementos' : 'Novo Grupo de Complementos'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Configure os adicionais, limites individuais e selecione onde este grupo deve aparecer.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-600"
                aria-label="Fechar edição do grupo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSave} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              {/* Basic Fields */}
              <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nome do Grupo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={currentGroup.nome}
                    onChange={(e) => setCurrentGroup({ ...currentGroup, nome: e.target.value })}
                    placeholder="Ex: Ponto da Carne, Turbine seu Lanche, Escolha o Molho..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="obrigatorio"
                      checked={currentGroup.obrigatorio}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setCurrentGroup({
                          ...currentGroup,
                          obrigatorio: checked,
                          minimo: checked && (!currentGroup.minimo || currentGroup.minimo < 1) ? 1 : currentGroup.minimo,
                        });
                      }}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="obrigatorio" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      Seleção Obrigatória
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Qtd Mínima</label>
                    <input
                      type="number"
                      min={currentGroup.obrigatorio ? 1 : 0}
                      value={currentGroup.minimo}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setCurrentGroup({
                          ...currentGroup,
                          minimo: val,
                          obrigatorio: val > 0 ? true : currentGroup.obrigatorio,
                        });
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Qtd Máxima Total</label>
                    <input
                      type="number"
                      min={1}
                      value={currentGroup.maximo}
                      onChange={(e) => setCurrentGroup({ ...currentGroup, maximo: parseInt(e.target.value) || 1 })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Items / Options Builder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
                      Opções / Itens do Grupo
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      Defina os nomes, descrições, preços e limite máximo por item.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar Opção
                  </button>
                </div>

                <div className="space-y-2.5">
                  {(currentGroup.itens || []).map((item, index) => (
                    <div
                      key={index}
                      className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Nome do Adicional</label>
                          <input
                            type="text"
                            value={item.nome}
                            onChange={(e) => handleUpdateItem(index, 'nome', e.target.value)}
                            placeholder="Ex: Bacon Crocante, Hambúrguer Extra"
                            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                          />
                        </div>

                        <div className="w-full sm:w-28 relative">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Preço Extra</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                              R$
                            </span>
                            <input
                              type="number"
                              step="0.5"
                              min={0}
                              value={item.preco}
                              onChange={(e) => handleUpdateItem(index, 'preco', parseFloat(e.target.value) || 0)}
                              placeholder="0,00"
                              className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-1.5 pl-8 pr-2.5 text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                            />
                          </div>
                        </div>

                        <div className="w-full sm:w-28">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5" title="0 = sem limite individual (permite até o máximo do grupo)">
                            Máx. Individual
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={item.maximo || 0}
                            onChange={(e) => handleUpdateItem(index, 'maximo', parseInt(e.target.value) || 0)}
                            placeholder="0 (padrão)"
                            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                          />
                        </div>

                        <div className="flex items-center gap-1.5 pt-2 sm:pt-4">
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(index, 'ativo', item.ativo === false)}
                            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${
                              item.ativo !== false
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                            }`}
                            title={item.ativo !== false ? 'Opção Ativa' : 'Opção Pausada'}
                          >
                            {item.ativo !== false ? 'Ativo' : 'Pausado'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            disabled={(currentGroup.itens || []).length <= 1}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors disabled:opacity-30"
                            title="Remover opção"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <input
                          type="text"
                          value={item.descricao || ''}
                          onChange={(e) => handleUpdateItem(index, 'descricao', e.target.value)}
                          placeholder="Descrição breve do adicional (ex: Fatias crocantes e defumadas artesanalmente)..."
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-1.5 text-[11px] text-slate-600 outline-none focus:border-emerald-500 focus:bg-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linked Categories & Products Section */}
              <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/40 p-3.5">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <FolderTree className="h-3.5 w-3.5 text-emerald-700" />
                    Vinculação Automática por Categoria
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    Todos os produtos das categorias selecionadas herdarão este grupo de complementos automaticamente.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {categories.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhuma categoria cadastrada.</p>
                  ) : (
                    categories.map((cat) => {
                      const isLinked = (currentGroup.categorias_vinculadas || []).includes(String(cat._id));
                      return (
                        <button
                          key={cat._id}
                          type="button"
                          onClick={() => handleToggleCategoryLink(String(cat._id))}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            isLinked
                              ? 'border-emerald-600 bg-emerald-600 text-white shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {isLinked && <CheckCircle2 className="h-3.5 w-3.5" />}
                          {cat.nome}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-slate-200/80 pt-3 mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-sky-700" />
                        Ou vincular produtos específicos
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Marque produtos individuais caso não queira aplicar para a categoria inteira.
                      </p>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Filtrar produtos..."
                    className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-emerald-500"
                  />

                  <div className="max-h-36 overflow-y-auto space-y-1 rounded-xl border border-slate-200/80 bg-white p-2">
                    {filteredModalProducts.map((prod) => {
                      const isLinked = (currentGroup.produtos_vinculados || []).includes(String(prod._id));
                      return (
                        <label
                          key={prod._id}
                          className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs"
                        >
                          <span className="font-medium text-slate-800">{prod.nome}</span>
                          <input
                            type="checkbox"
                            checked={isLinked}
                            onChange={() => handleToggleProductLink(String(prod._id))}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.04)] backdrop-blur-sm sm:-mx-5 sm:-mb-5 sm:px-5">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : currentGroup._id ? 'Salvar Alterações' : 'Criar Grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && groupToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs" role="alertdialog" aria-modal="true" aria-labelledby="delete-complement-group-title">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xl">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h3 id="delete-complement-group-title" className="text-sm font-bold text-slate-900">Excluir grupo de complementos?</h3>
              <p className="mt-1 text-xs text-slate-500">
                Tem certeza que deseja excluir o grupo <strong>"{groupToDelete.nome}"</strong>? Ele deixará de aparecer em todos os produtos vinculados.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-lg bg-rose-600 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
