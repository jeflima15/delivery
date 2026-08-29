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

    if (currentGroup.maximo < currentGroup.minimo) {
      showToast('A quantidade máxima deve ser maior ou igual à mínima.', 'info');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nome: currentGroup.nome.trim(),
        obrigatorio: Boolean(currentGroup.obrigatorio),
        minimo: Number(currentGroup.minimo || 0),
        maximo: Number(currentGroup.maximo || 1),
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
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Layers className="h-4 w-4" />
            </span>
            <h2 className="text-base font-bold text-slate-900">Biblioteca Global de Complementos</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Crie adicionais reutilizáveis (como pontos da carne, molhos e acompanhamentos) e vincule a categorias inteiras ou produtos específicos.
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--pv-primary)] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:brightness-105 active:scale-95 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Novo Grupo de Complementos
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500">Total de Grupos</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{groups.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-emerald-800">Grupos Ativos no Cardápio</p>
          <p className="mt-1 text-xl font-bold text-emerald-950">{totalActiveGroups}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500">Total de Opções Cadastradas</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{totalComplementItems}</p>
        </div>
      </div>

      {/* Search Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por grupo ou nome do adicional..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2 text-xs outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
          />
        </div>
      </div>

      {/* Groups List */}
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--pv-primary)] border-t-transparent" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-xs">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 mb-3">
            <Layers className="h-6 w-6" />
          </span>
          <h3 className="text-sm font-bold text-slate-800">Nenhum grupo de complementos encontrado</h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500">
            {searchTerm
              ? 'Tente buscar por outro termo ou limpe a barra de pesquisa.'
              : 'Cadastre seu primeiro grupo de complementos para reutilizar em múltiplos lanches e itens do cardápio.'}
          </p>
          {!searchTerm && (
            <button
              onClick={handleOpenNew}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--pv-primary)] px-4 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105"
            >
              <Plus className="h-4 w-4" />
              Criar Primeiro Grupo
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredGroups.map((group) => {
            const linkedCats = (group.categorias_vinculadas || []).map((c: any) => c.nome || categories.find((cat) => String(cat._id) === String(c._id || c))?.nome).filter(Boolean);
            const linkedProds = (group.produtos_vinculados || []).map((p: any) => p.nome || products.find((prod) => String(prod._id) === String(p._id || p))?.nome).filter(Boolean);

            return (
              <div
                key={group._id}
                className={`flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-xs transition-all ${
                  group.ativo !== false ? 'border-slate-200/90' : 'border-slate-200 bg-slate-50/60 opacity-70'
                }`}
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">{group.nome}</h4>
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

                  {/* Items List Preview */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Itens do Grupo ({group.itens?.length || 0})
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {(group.itens || []).map((item, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-xs border ${
                            item.ativo !== false
                              ? 'bg-slate-50/80 border-slate-200/80 text-slate-800'
                              : 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900">{item.nome}</span>
                              {item.maximo && item.maximo > 0 ? (
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 rounded px-1.5 py-0.2">
                                  máx: {item.maximo}
                                </span>
                              ) : null}
                            </div>
                            {item.descricao ? (
                              <p className="text-[10px] text-slate-500 line-clamp-1 font-normal">{item.descricao}</p>
                            ) : null}
                          </div>
                          <span className="font-bold text-teal-700 shrink-0">
                            {Number(item.preco || 0) > 0
                              ? `+R$ ${Number(item.preco || 0).toFixed(2).replace('.', ',')}`
                              : 'Grátis'}
                          </span>
                        </div>
                      ))}
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
                            className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-200/80"
                          >
                            <FolderTree className="h-3 w-3" />
                            Cat: {catName}
                          </span>
                        ))}
                        {linkedProds.map((prodName, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-200/80"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Layers className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {currentGroup._id ? 'Editar Grupo de Complementos' : 'Novo Grupo de Complementos'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Configure os adicionais, limites individuais e selecione onde este grupo deve aparecer.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Basic Fields */}
              <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="obrigatorio"
                      checked={currentGroup.obrigatorio}
                      onChange={(e) => setCurrentGroup({ ...currentGroup, obrigatorio: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                    />
                    <label htmlFor="obrigatorio" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      Seleção Obrigatória
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Qtd Mínima</label>
                    <input
                      type="number"
                      min={0}
                      value={currentGroup.minimo}
                      onChange={(e) => setCurrentGroup({ ...currentGroup, minimo: parseInt(e.target.value) || 0 })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Qtd Máxima Total</label>
                    <input
                      type="number"
                      min={1}
                      value={currentGroup.maximo}
                      onChange={(e) => setCurrentGroup({ ...currentGroup, maximo: parseInt(e.target.value) || 1 })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Items / Options Builder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-teal-700" />
                      Opções / Itens do Grupo
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      Defina os nomes, descrições, preços e limite máximo por item.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar Opção
                  </button>
                </div>

                <div className="space-y-2.5">
                  {(currentGroup.itens || []).map((item, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2 shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Nome do Adicional</label>
                          <input
                            type="text"
                            value={item.nome}
                            onChange={(e) => handleUpdateItem(index, 'nome', e.target.value)}
                            placeholder="Ex: Bacon Crocante, Hambúrguer Extra"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-teal-500"
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
                              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-8 pr-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-teal-500"
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
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-teal-500"
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
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-1.5 text-[11px] text-slate-600 outline-none focus:bg-white focus:border-teal-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linked Categories & Products Section */}
              <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/40 p-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <FolderTree className="h-3.5 w-3.5 text-teal-700" />
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
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${
                            isLinked
                              ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-teal-500 mb-2"
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
                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[var(--pv-primary)] px-5 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 transition-all disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Excluir Grupo de Complementos?</h3>
              <p className="mt-1 text-xs text-slate-500">
                Tem certeza que deseja excluir o grupo <strong>"{groupToDelete.nome}"</strong>? Ele deixará de aparecer em todos os produtos vinculados.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50"
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
