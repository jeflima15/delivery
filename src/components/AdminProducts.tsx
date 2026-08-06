import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Image as ImageIcon, X, Eye, EyeOff, Trash, Gift, Star, Search, FilterX } from 'lucide-react';
import { useToast } from './Toast';
import ImagePicker from './ImagePicker';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

export default function AdminProducts({ token, onUnauthorized }: { token: string, onUnauthorized: () => void }) {
  const api = useTenantAdminApi();
  const [produtos, setProdutos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<any>(null);
  const [optionsString, setOptionsString] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<any>(null);

  const [deleting, setDeleting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');

  const { showToast } = useToast();

  const categoryName = (produto: any) => {
    if (produto.categoriaId?.nome) return produto.categoriaId.nome;
    const categoryId = produto.categoriaId?._id || produto.categoriaId;
    return categorias.find((category) => String(category._id) === String(categoryId))?.nome || 'Sem categoria';
  };

  const openProductEditor = (produto: any) => {
    setCurrentProduct({
      ...produto,
      categoriaId: produto.categoriaId?._id || produto.categoriaId || '',
    });
    setOptionsString(produto.opcoes_disponiveis?.join(', ') || '');
    setIsEditing(true);
  };

  const fetchDados = async () => {
    try {
      const [prodData, catData] = await Promise.all([api.listProducts(), api.listCategories()]);
      setProdutos(prodData.items);
      setCategorias(catData.items);
    } catch (error) {
      showToast('Erro ao buscar produtos', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDados();
  }, [token]);

  useEffect(() => {
    if (!isEditing && !showDeleteModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isEditing, showDeleteModal]);

  useEffect(() => {
    const productId = sessionStorage.getItem('admin_edit_product_id');
    if (!productId || !produtos.length || isEditing) return;

    const productToEdit = produtos.find((produto) => String(produto._id || produto.id) === productId);
    if (!productToEdit) {
      sessionStorage.removeItem('admin_edit_product_id');
      return;
    }

    sessionStorage.removeItem('admin_edit_product_id');
    openProductEditor(productToEdit);
  }, [produtos, isEditing]);

  const toggleProductActive = async (id: string) => {
    try {
      const data = await api.toggleProductActive(id);
      if (data.success) {
        showToast('Status do produto atualizado', 'success');
        fetchDados();
      }
    } catch (error) {
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
    try {
      const data = await api.toggleProductSoldOut(id);
      if (data.success) {
        showToast('Disponibilidade do produto atualizada', 'success');
        fetchDados();
      }
    } catch (error) {
      showToast('Erro ao alternar disponibilidade', 'error');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentProduct.preco_antigo && Number(currentProduct.preco_antigo) > 0 && Number(currentProduct.preco_antigo) <= Number(currentProduct.preco)) {
      showToast('O preço original deve ser estritamente maior que o preço atual.', 'error');
      return;
    }

    try {
      const productToSave = {
        ...currentProduct,
        opcoes_disponiveis: optionsString.split(',').map((s) => s.trim()).filter(Boolean),
      };

      const data = currentProduct._id
        ? await api.updateProduct(currentProduct._id, productToSave)
        : await api.createProduct(productToSave);
      if (data.success) {
        showToast(currentProduct._id ? 'Produto atualizado!' : 'Produto criado!', 'success');
        setIsEditing(false);
        setCurrentProduct(null);
        fetchDados();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao salvar produto', 'error');
    }
  };

  const openNewProduct = () => {
    setCurrentProduct({
      nome: '',
      preco: 0,
      descricao: '',
      imagem: '',
      personalizavel: false,
      quantidade_total_opcoes: 0,
      opcoes_disponiveis: [],
      controlar_estoque: false,
      estoque: 0,
      categoriaId: '',
      grupos_adicionais: [],
      pode_resgatar: false,
      pontos_resgate: 0,
    });
    setOptionsString('');
    setIsEditing(true);
  };

  const handleUpdateGrupo = (index: number, key: string, value: any) => {
    const newGroups = [...(currentProduct.grupos_adicionais || [])];
    newGroups[index] = { ...newGroups[index], [key]: value };
    setCurrentProduct({ ...currentProduct, grupos_adicionais: newGroups });
  };

  const filteredProducts = produtos.filter((p) => {
    const matchSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat =
      categoryFilter === 'all' ||
      (p.categoriaId && (p.categoriaId._id === categoryFilter || p.categoriaId.id === categoryFilter || p.categoriaId === categoryFilter));
    const matchStatus = statusFilter === 'all' || (statusFilter === 'ativo' && p.ativo) || (statusFilter === 'inativo' && !p.ativo);
    const matchAvailability =
      availabilityFilter === 'all' ||
      (availabilityFilter === 'disponivel' && !p.esgotado) ||
      (availabilityFilter === 'esgotado' && !!p.esgotado);

    return matchSearch && matchCat && matchStatus && matchAvailability;
  });

  const activeFilterCount = [
    searchTerm.trim() !== '',
    categoryFilter !== 'all',
    statusFilter !== 'all',
    availabilityFilter !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setAvailabilityFilter('all');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {!isEditing ? (
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Produtos</h2>
              <p className="mt-1 text-sm text-gray-500">Cadastro, publicacao e disponibilidade de compra dos itens do catalogo.</p>
            </div>
            <button
              onClick={openNewProduct}
              className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-700"
            >
              <Plus className="w-5 h-5" /> Novo Produto
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              Status publica ou oculta o item
            </span>
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
              Esgotado mantem visivel, mas bloqueia a compra
            </span>
          </div>

          <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar produto"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-11 pr-4 text-sm outline-none transition-all focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3 xl:w-[42rem]">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className={`w-full cursor-pointer appearance-none rounded-xl border px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 ${categoryFilter !== 'all' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}
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
                  className={`w-full cursor-pointer appearance-none rounded-xl border px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 ${statusFilter !== 'all' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}
                >
                  <option value="all">Status: todos</option>
                  <option value="ativo">Status: ativo</option>
                  <option value="inativo">Status: inativo</option>
                </select>
                <select
                  value={availabilityFilter}
                  onChange={(e) => setAvailabilityFilter(e.target.value)}
                  className={`w-full cursor-pointer appearance-none rounded-xl border px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 ${availabilityFilter !== 'all' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}
                >
                  <option value="all">Compra: todos</option>
                  <option value="disponivel">Compra: disponivel</option>
                  <option value="esgotado">Compra: esgotado</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center rounded-full bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">
                  {filteredProducts.length} produto(s) encontrado(s)
                </span>
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                    {activeFilterCount} filtro(s) ativo(s)
                  </span>
                )}
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 self-start rounded-xl px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100"
                >
                  <FilterX className="w-4 h-4" />
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {loading ? <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Carregando produtos...</div> : filteredProducts.length === 0 ? <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Nenhum produto encontrado.</div> : filteredProducts.map((produto) => (
              <article key={produto._id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex gap-3">
                  {produto.imagem ? <img src={produto.imagem} alt={produto.nome} className="h-20 w-20 shrink-0 rounded-xl object-cover" /> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-gray-100"><ImageIcon className="h-6 w-6 text-gray-400" /></div>}
                  <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="font-bold text-gray-900">{produto.nome}</h3>{produto.destaque && <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />}</div><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">{produto.descricao || 'Sem descricao cadastrada.'}</p><p className="mt-2 text-sm font-black text-gray-900">R$ {(produto.preco || 0).toFixed(2).replace('.', ',')}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-gray-600">{categoryName(produto)}</span><span className={`rounded-full px-2.5 py-1 font-semibold ${produto.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{produto.ativo ? 'Ativo' : 'Inativo'}</span>{produto.esgotado && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">Esgotado</span>}{produto.controlar_estoque && <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">{produto.estoque} un.</span>}</div>
                <div className="mt-4 grid grid-cols-3 gap-2"><button onClick={() => openProductEditor(produto)} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-gray-200 text-xs font-bold text-gray-700"><Edit className="h-4 w-4" />Editar</button><button onClick={() => toggleProductEsgotado(produto._id)} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-gray-200 text-xs font-bold text-gray-700">{produto.esgotado ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{produto.esgotado ? 'Liberar' : 'Esgotar'}</button><button onClick={() => toggleProductActive(produto._id)} className={`inline-flex h-10 items-center justify-center rounded-xl text-xs font-bold ${produto.ativo ? 'bg-gray-100 text-gray-600' : 'bg-emerald-600 text-white'}`}>{produto.ativo ? 'Desativar' : 'Ativar'}</button></div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                    <th className="p-4">Produto</th>
                    <th className="p-4">Categoria</th>
                    <th className="p-4">Preco</th>
                    <th className="p-4">Estoque</th>
                    <th className="p-4">
                      <div className="space-y-1">
                        <span className="block">Disponibilidade de compra</span>
                        <span className="block normal-case text-[10px] font-medium tracking-normal text-amber-700">Visivel na loja, indisponivel para compra quando esgotado</span>
                      </div>
                    </th>
                    <th className="p-4">
                      <div className="space-y-1">
                        <span className="block">Status de publicacao</span>
                        <span className="block normal-case text-[10px] font-medium tracking-normal text-emerald-700">Controla se o item fica ativo na operacao</span>
                      </div>
                    </th>
                    <th className="p-4 text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={7} className="p-8 text-center text-gray-500">Carregando...</td></tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-gray-500">Nenhum produto encontrado com os filtros atuais.</td></tr>
                  ) : (
                    filteredProducts.map((produto) => (
                      <tr key={produto._id} className="align-top transition-colors hover:bg-gray-50/50">
                        <td className="p-4">
                          <div className="flex items-start gap-4">
                            {produto.imagem ? (
                              <img src={produto.imagem} alt={produto.nome} className="h-12 w-12 rounded-xl object-cover shadow-sm" />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
                                <ImageIcon className="h-6 w-6 text-gray-400" />
                              </div>
                            )}
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-gray-900">{produto.nome}</p>
                                {produto.destaque && (
                                  <div className="rounded-full bg-amber-100 p-0.5 text-amber-600" title="Em destaque no catalogo">
                                    <Star className="h-3 w-3 fill-current" />
                                  </div>
                                )}
                              </div>
                              <p className="line-clamp-2 max-w-[24rem] text-sm text-gray-500">{produto.descricao || 'Sem descricao cadastrada.'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="inline-flex items-center rounded-full bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600">{categoryName(produto)}</span>
                        </td>
                        <td className="p-4">
                          <div className="space-y-1">
                            <p className="font-bold text-gray-900">R$ {(produto.preco || 0).toFixed(2).replace('.', ',')}</p>
                            <p className="text-xs text-gray-400">{produto.preco_antigo ? <span className="line-through">R$ {(produto.preco_antigo || 0).toFixed(2).replace('.', ',')}</span> : 'Preco base'}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          {produto.controlar_estoque ? (
                            <div className="space-y-1">
                              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${produto.estoque > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{produto.estoque} un</span>
                              <p className="text-[11px] text-gray-400">Controle ativo</p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">Ilimitado</span>
                              <p className="text-[11px] text-gray-400">Sem controle</p>
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <label className="relative inline-flex cursor-pointer items-center" title="O produto continua visivel na loja, mas o cliente nao consegue seleciona-lo">
                                <input type="checkbox" className="peer sr-only" checked={produto.esgotado || false} onChange={() => toggleProductEsgotado(produto._id)} />
                                <div className="h-6 w-11 rounded-full bg-gray-200 peer-focus:outline-none peer-checked:bg-orange-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-['']"></div>
                              </label>
                              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${produto.esgotado ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{produto.esgotado ? 'Esgotado' : 'Disponivel'}</span>
                            </div>
                            <p className="max-w-[15rem] text-[11px] text-gray-400">
                              {produto.esgotado ? 'Bloqueia compra, sem ocultar.' : 'Liberado para compra.'}
                            </p>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="space-y-1.5">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${produto.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{produto.ativo ? 'Ativo' : 'Inativo'}</span>
                            <p className="max-w-[12rem] text-[11px] text-gray-400">
                              {produto.ativo ? 'Publicado.' : 'Oculto da operacao.'}
                            </p>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              onClick={() => openProductEditor(produto)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-blue-700 transition-colors hover:bg-blue-50"
                              title="Editar produto"
                              aria-label={`Editar produto ${produto.nome}`}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => toggleProductActive(produto._id)}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${produto.ativo ? 'text-orange-700 hover:bg-orange-50' : 'text-emerald-700 hover:bg-emerald-50'}`}
                              title={produto.ativo ? 'Tornar inativo' : 'Tornar ativo'}
                              aria-label={produto.ativo ? `Tornar ${produto.nome} inativo` : `Tornar ${produto.nome} ativo`}
                            >
                              {produto.ativo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => {
                                setProductToDelete(produto);
                                setShowDeleteModal(true);
                              }}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-700 transition-colors hover:bg-red-50"
                              title="Excluir definitivamente"
                              aria-label={`Excluir produto ${produto.nome}`}
                            >
                              <Trash2 className="w-4 h-4" />
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
      ) : (
        <div className="fixed inset-0 z-50 overflow-y-auto border border-gray-100 bg-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300 sm:inset-4 sm:rounded-3xl lg:left-[calc(18rem+1rem)] xl:left-[calc(20rem+1rem)]">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-gray-50/95 p-4 backdrop-blur sm:p-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">{currentProduct._id ? 'Editar Produto' : 'Novo Produto'}</h3>
              <p className="mt-1 text-sm text-gray-500">Preencha os detalhes do item do cardapio.</p>
            </div>
            <button aria-label="Fechar editor de produto" onClick={() => setIsEditing(false)} className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSaveProduct} className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="md:col-span-1">
                <label className="mb-2 block text-sm font-bold text-gray-700">Nome do Produto</label>
                <input type="text" required value={currentProduct.nome} onChange={(e) => setCurrentProduct({ ...currentProduct, nome: e.target.value })} placeholder="Ex: Hamburguer Artesanal" className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">Preco Atual (R$)</label>
                <input type="number" step="0.01" required value={currentProduct.preco} onChange={(e) => setCurrentProduct({ ...currentProduct, preco: e.target.value === '' ? '' : parseFloat(e.target.value) })} placeholder="0.00" className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-bold text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold italic text-gray-500">Preco Original (R$)</label>
                <input type="number" step="0.01" value={currentProduct.preco_antigo || ''} onChange={(e) => setCurrentProduct({ ...currentProduct, preco_antigo: e.target.value === '' ? 0 : parseFloat(e.target.value) })} placeholder="Ex: 35.00" className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-gray-400 line-through decoration-gray-300 outline-none focus:ring-2 focus:ring-gray-300" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Descricao</label>
              <textarea value={currentProduct.descricao} onChange={(e) => setCurrentProduct({ ...currentProduct, descricao: e.target.value })} placeholder="Ingredientes e detalhes do produto..." className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500" rows={3}></textarea>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-1">
                <ImagePicker label="Imagem do Produto" value={currentProduct.imagem || ''} onChange={(url) => setCurrentProduct({ ...currentProduct, imagem: url })} onUploadStatus={setIsUploadingImage} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">Categoria</label>
                <select value={currentProduct.categoriaId?._id || currentProduct.categoriaId} onChange={(e) => setCurrentProduct({ ...currentProduct, categoriaId: e.target.value })} className="w-full appearance-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Selecione uma categoria...</option>
                  {categorias.map((c) => (
                    <option key={c.id || c._id} value={c.id || c._id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-amber-100 bg-amber-50/50 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-amber-100 p-2 text-amber-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.54 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.784.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-amber-900">Em destaque no catalogo</h4>
                    <p className="text-xs text-amber-700/70">Aparece na secao de destaques da loja quando o produto estiver ativo.</p>
                  </div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" className="peer sr-only" checked={currentProduct.destaque || false} onChange={(e) => setCurrentProduct({ ...currentProduct, destaque: e.target.checked })} />
                  <div className="h-7 w-14 rounded-full bg-amber-200 peer-focus:outline-none peer-checked:bg-amber-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:left-[2px] after:top-[2px] after:h-6 after:w-6 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-['']"></div>
                </label>
              </div>

              {currentProduct.destaque && (
                <div className="animate-in space-y-3 border-t border-amber-200/50 pl-12 pt-2 fade-in zoom-in duration-300">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-amber-800">Texto do Selo Decorativo</label>
                    <input type="text" value={currentProduct.selo_destaque || ''} onChange={(e) => setCurrentProduct({ ...currentProduct, selo_destaque: e.target.value })} placeholder="Ex: Mais Pedido, Recomendado, Edicao Especial" className="w-full rounded-xl border border-amber-200 bg-white px-4 py-2 text-amber-900 outline-none placeholder:text-amber-300 focus:ring-2 focus:ring-amber-500" />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-[2rem] border border-purple-100 bg-purple-50/50 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-purple-100 p-2.5 text-purple-600 shadow-sm">
                    <Gift className="w-6 h-6 fill-current" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase italic tracking-widest text-purple-900">Fidelidade Clube Stitch</h4>
                    <p className="text-[10px] font-bold italic text-purple-500">Permitir resgate deste item por pontos acumulados.</p>
                  </div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" className="peer sr-only" checked={currentProduct.pode_resgatar || false} onChange={(e) => setCurrentProduct({ ...currentProduct, pode_resgatar: e.target.checked })} />
                  <div className="h-7 w-14 rounded-full bg-purple-200 peer-focus:outline-none peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:left-[2px] after:top-[2px] after:h-6 after:w-6 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-['']"></div>
                </label>
              </div>

              {currentProduct.pode_resgatar && (
                <div className="animate-in space-y-3 border-t border-purple-200/50 pl-12 pt-2 fade-in zoom-in duration-300">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-purple-800">Pontos Necessarios para Resgate</label>
                    <input type="number" value={currentProduct.pontos_resgate || 0} onChange={(e) => setCurrentProduct({ ...currentProduct, pontos_resgate: parseInt(e.target.value) || 0 })} placeholder="Ex: 200, 500" className="w-full rounded-xl border border-purple-200 bg-white px-4 py-2 font-bold text-purple-900 outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 border-t border-gray-100 pt-4">
              <h4 className="font-bold text-gray-900">Configuracoes Avancadas</h4>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <label className="mb-4 flex cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={currentProduct.controlar_estoque} onChange={(e) => setCurrentProduct({ ...currentProduct, controlar_estoque: e.target.checked })} className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                  <span className="font-bold text-gray-900">Controlar Estoque</span>
                </label>
                {currentProduct.controlar_estoque && (
                  <div className="pl-8">
                    <label className="mb-2 block text-sm font-medium text-gray-700">Quantidade Disponivel</label>
                    <input type="number" value={currentProduct.estoque} onChange={(e) => setCurrentProduct({ ...currentProduct, estoque: e.target.value === '' ? '' : parseInt(e.target.value) })} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 md:w-1/2" />
                  </div>
                )}
              </div>


              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <span className="block font-bold text-gray-900">Grupos de Complementos e Adicionais (Upsell)</span>
                    <p className="text-xs text-gray-500">Ideal para montagens complexas com custos adicionais ou escolhas opcionais.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const g = [...(currentProduct.grupos_adicionais || [])];
                      g.push({ nome: 'Novo Grupo', obrigatorio: false, minimo: 0, maximo: 1, itens: [] });
                      setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                    }}
                    className="flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-600 transition-colors hover:bg-emerald-200"
                  >
                    <Plus className="w-4 h-4" /> Novo Grupo
                  </button>
                </div>

                <div className="space-y-4">
                  {(currentProduct.grupos_adicionais || []).map((grupo: any, gIndex: number) => (
                    <div key={gIndex} className="animate-in rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm fade-in">
                      <div className="mb-4 flex flex-col gap-4 md:flex-row">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-bold text-gray-700">Nome do Grupo</label>
                          <input type="text" value={grupo.nome} onChange={(e) => handleUpdateGrupo(gIndex, 'nome', e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 outline-none" placeholder="Ex: Escolha o Recheio" />
                        </div>
                        <div className="mt-6 flex w-32 items-center gap-2">
                          <input type="checkbox" checked={grupo.obrigatorio} onChange={(e) => handleUpdateGrupo(gIndex, 'obrigatorio', e.target.checked)} className="h-4 w-4 rounded text-emerald-600" />
                          <label className="text-xs font-bold text-gray-700">Obrigatorio?</label>
                        </div>
                        <div className="w-24">
                          <label className="mb-1 block text-xs font-bold text-gray-700">Minimo</label>
                          <input type="number" value={grupo.minimo} onChange={(e) => handleUpdateGrupo(gIndex, 'minimo', parseInt(e.target.value) || 0)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 outline-none" min={0} />
                        </div>
                        <div className="w-24">
                          <label className="mb-1 block text-xs font-bold text-gray-700">Maximo</label>
                          <input type="number" value={grupo.maximo} onChange={(e) => handleUpdateGrupo(gIndex, 'maximo', parseInt(e.target.value) || 1)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 outline-none" min={1} />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const g = [...currentProduct.grupos_adicionais];
                            g.splice(gIndex, 1);
                            setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                          }}
                          className="mt-6 h-9 rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-2 border-l-2 border-emerald-100 pl-4">
                        <div className="mb-2 flex items-center justify-between">
                          <h5 className="text-xs font-bold uppercase text-gray-700">Itens Disponiveis</h5>
                          <button
                            type="button"
                            onClick={() => {
                              const g = [...currentProduct.grupos_adicionais];
                              g[gIndex].itens = [...(g[gIndex].itens || []), { nome: '', preco: 0 }];
                              setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                            }}
                            className="flex items-center gap-1 text-xs font-bold text-blue-600"
                          >
                            <Plus className="w-3 h-3" /> Adicionar Item
                          </button>
                        </div>

                        {(grupo.itens || []).map((item: any, iIndex: number) => (
                          <div key={iIndex} className="flex gap-2">
                            <input
                              type="text"
                              value={item.nome}
                              onChange={(e) => {
                                const g = [...currentProduct.grupos_adicionais];
                                g[gIndex].itens[iIndex].nome = e.target.value;
                                setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                              }}
                              className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs outline-none"
                              placeholder="Ex: Nutella"
                            />
                            <div className="relative">
                              <span className="absolute left-2 top-2 text-xs text-gray-400">R$</span>
                              <input
                                type="number"
                                step="0.5"
                                value={item.preco}
                                onChange={(e) => {
                                  const g = [...currentProduct.grupos_adicionais];
                                  g[gIndex].itens[iIndex].preco = parseFloat(e.target.value) || 0;
                                  setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                                }}
                                className="w-24 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-7 pr-3 text-xs outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const g = [...currentProduct.grupos_adicionais];
                                g[gIndex].itens.splice(iIndex, 1);
                                setCurrentProduct({ ...currentProduct, grupos_adicionais: g });
                              }}
                              className="p-1.5 text-red-400 transition-colors hover:text-red-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-3 border-t border-gray-100 bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
              <button type="button" onClick={() => setIsEditing(false)} className="rounded-2xl bg-gray-100 px-6 py-3 font-bold text-gray-600 transition-colors hover:bg-gray-200">
                Cancelar
              </button>
              <button type="submit" disabled={isUploadingImage} className={`rounded-2xl px-8 py-3 font-bold text-white shadow-sm transition-all ${isUploadingImage ? 'cursor-not-allowed bg-gray-400' : 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700'}`}>
                {isUploadingImage ? 'Enviando Foto...' : 'Salvar Produto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="flex w-full max-w-md flex-col overflow-hidden rounded-[2.5rem] border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-8 pb-0">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
                <Trash2 className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="mb-2 mt-2 text-2xl font-black leading-tight text-gray-900">Excluir Produto?</h3>
              <p className="font-medium leading-relaxed text-gray-500">
                Esta acao apagará permanentemente <span className="font-bold text-red-600">{productToDelete?.nome}</span> e todos os seus dados. Nao ha como desfazer.
              </p>
            </div>

            <div className="space-y-4 p-8">

              <div className="flex flex-col gap-3">
                <button onClick={handleDeletePermanent} disabled={deleting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 p-5 font-bold text-white shadow-xl shadow-red-900/10 transition-all hover:bg-red-700 active:scale-95 disabled:opacity-50">
                  {deleting ? 'Removendo do Banco...' : <><Trash className="w-5 h-5" /> Confirmar Exclusao</>}
                </button>
                <button onClick={() => setShowDeleteModal(false)} disabled={deleting} className="w-full rounded-2xl bg-white p-5 font-bold text-gray-400 transition-all hover:bg-gray-100 active:scale-95 disabled:opacity-50">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
