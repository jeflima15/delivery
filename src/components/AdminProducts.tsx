import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, CheckCircle, Image as ImageIcon, X, Eye, EyeOff, Trash, Gift, Star } from 'lucide-react';
import { useToast } from './Toast';
import ImagePicker from './ImagePicker';

export default function AdminProducts({ token, onUnauthorized }: { token: string, onUnauthorized: () => void }) {
  const [produtos, setProdutos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<any>(null);
  const [optionsString, setOptionsString] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false); // Bloqueia o salvar se estiver fazendo upload
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [confirmAuth, setConfirmAuth] = useState({ email: '', senha: '' });
  const [deleting, setDeleting] = useState(false);
  
  // Filtros restaurados
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const { showToast } = useToast();

  const fetchDados = async () => {
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch('/api/admin/produtos', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/categorias')
      ]);
      const prodData = await prodRes.json();
      
      if (prodRes.status === 401 || prodRes.status === 403) {
        onUnauthorized();
        return;
      }

      const catData = await catRes.json();
      
      if (prodData.sucesso) setProdutos(prodData.produtos);
      setCategorias(catData);
    } catch (error) {
      showToast('Erro ao buscar produtos', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDados();
  }, [token]);

  const toggleProductActive = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/produtos/${id}/toggle-ativo`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.sucesso) {
        showToast('Status do produto atualizado', 'success');
        fetchDados();
      }
    } catch (error) {
      showToast('Erro ao alterar status', 'error');
    }
  };

  const handleDeletePermanent = async () => {
    if (!confirmAuth.email || !confirmAuth.senha) {
      showToast('Preencha seu e-mail e senha de admin.', 'error');
      return;
    }

    setDeleting(true);
    try {
       const res = await fetch(`/api/admin/produtos/${productToDelete._id}`, {
         method: 'DELETE',
         headers: { 
           'Authorization': `Bearer ${token}`,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify(confirmAuth)
       });
       const data = await res.json();
       if (data.sucesso) {
         showToast('Produto excluído para sempre!', 'success');
         setShowDeleteModal(false);
         setConfirmAuth({ email: '', senha: '' });
         fetchDados();
       } else {
         showToast(data.erro || 'Credenciais inválidas ou erro ao excluir', 'error');
       }
    } catch (e) {
      showToast('Falha na comunicação com o servidor', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const toggleProductEsgotado = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/produtos/${id}/toggle-esgotado`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.sucesso) {
        showToast('Disponibilidade do produto atualizada', 'success');
        fetchDados();
      }
    } catch (error) {
      showToast('Erro ao alternar disponibilidade', 'error');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = currentProduct._id ? `/api/admin/produtos/${currentProduct._id}` : '/api/admin/produtos';
    const method = currentProduct._id ? 'PUT' : 'POST';

    try {
      const productToSave = {
        ...currentProduct,
        opcoes_disponiveis: optionsString.split(',').map(s => s.trim()).filter(Boolean)
      };

      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(productToSave)
      });
      const data = await res.json();
      if (data.sucesso) {
        showToast(currentProduct._id ? 'Produto atualizado!' : 'Produto criado!', 'success');
        setIsEditing(false);
        setCurrentProduct(null);
        fetchDados();
      } else {
        showToast(data.erro || 'Erro ao salvar', 'error');
      }
    } catch (error) {
      showToast('Erro ao salvar produto', 'error');
    }
  };

  const openNewProduct = () => {
    setCurrentProduct({ 
      nome: '', preco: 0, descricao: '', imagem: '', 
      personalizavel: false, quantidade_total_opcoes: 0, opcoes_disponiveis: [], 
      controlar_estoque: false, estoque: 0, categoriaId: '',
      grupos_adicionais: [],
      pode_resgatar: false, pontos_resgate: 0
    });
    setOptionsString('');
    setIsEditing(true);
  };

  const handleUpdateGrupo = (index: number, key: string, value: any) => {
    const newGroups = [...(currentProduct.grupos_adicionais || [])];
    newGroups[index] = { ...newGroups[index], [key]: value };
    setCurrentProduct({ ...currentProduct, grupos_adicionais: newGroups });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {!isEditing ? (
        <>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Cardápio</h2>
              <p className="text-gray-500 mt-1">Gerencie seus produtos, preços e disponibilidade.</p>
            </div>
            <button 
              onClick={openNewProduct}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl hover:bg-emerald-700 transition-colors font-bold shadow-sm shadow-emerald-600/20"
            >
              <Plus className="w-5 h-5" /> Novo Produto
            </button>
          </div>

          {/* Barra de Filtros Inteligente */}
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <input 
                type="text" 
                placeholder="Buscar produto por nome..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              />
            </div>
            <div className="w-full md:w-64">
              <select 
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="all">Todas as Categorias</option>
                {categorias.map(c => <option key={c.id || c._id} value={c.id || c._id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="w-full md:w-48">
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="all">Status: Todos</option>
                <option value="ativo">Status: Ativo</option>
                <option value="inativo">Status: Inativo</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider font-semibold">
                    <th className="p-5">Produto</th>
                    <th className="p-5">Preço</th>
                    <th className="p-5">Estoque</th>
                    <th className="p-5">Esgotado?</th>
                    <th className="p-5">Status</th>
                    <th className="p-5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-500">Carregando...</td></tr>
                  ) : produtos.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-500">Nenhum produto cadastrado.</td></tr>
                  ) : (
                    produtos.filter(p => {
                      const matchSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase());
                      const matchCat = categoryFilter === 'all' || (p.categoriaId && (p.categoriaId._id === categoryFilter || p.categoriaId.id === categoryFilter || p.categoriaId === categoryFilter));
                      const matchStatus = statusFilter === 'all' || (statusFilter === 'ativo' && p.ativo) || (statusFilter === 'inativo' && !p.ativo);
                      return matchSearch && matchCat && matchStatus;
                    }).map(produto => (
                      <tr key={produto._id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-5">
                          <div className="flex items-center gap-4">
                            {produto.imagem ? (
                              <img src={produto.imagem} alt={produto.nome} className="w-12 h-12 rounded-xl object-cover shadow-sm" />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                                <ImageIcon className="w-6 h-6 text-gray-400" />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-gray-900">{produto.nome}</p>
                                {produto.destaque && (
                                  <div className="bg-amber-100 text-amber-600 p-0.5 rounded-full" title="Em Destaque">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">{produto.categoriaId?.nome || 'Sem Categoria'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-5 font-bold text-gray-900">
                          R$ {(produto.preco || 0).toFixed(2).replace('.', ',')}
                        </td>
                        <td className="p-5">
                          {produto.controlar_estoque ? (
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${produto.estoque > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                              {produto.estoque} un
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm font-medium">Ilimitado</span>
                          )}
                        </td>
                        <td className="p-5">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={produto.esgotado || false} onChange={() => toggleProductEsgotado(produto._id)} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                          </label>
                        </td>
                        <td className="p-5">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${produto.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {produto.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="p-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => { 
                                setCurrentProduct(produto); 
                                setOptionsString(produto.opcoes_disponiveis?.join(', ') || '');
                                setIsEditing(true); 
                              }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                              title="Editar"
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => toggleProductActive(produto._id)}
                              className={`p-2 rounded-xl transition-colors ${produto.ativo ? 'text-orange-600 hover:bg-orange-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                              title={produto.ativo ? "Ocultar do Cardápio" : "Mostrar no Cardápio"}
                            >
                              {produto.ativo ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                            <button 
                              onClick={() => {
                                setProductToDelete(produto);
                                setShowDeleteModal(true);
                                setConfirmAuth({ email: '', senha: '' });
                              }}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                              title="EXCLUIR DEFINITIVAMENTE"
                            >
                              <Trash2 className="w-5 h-5" />
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
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden max-w-3xl mx-auto animate-in slide-in-from-bottom-4 duration-300">
          <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-gray-900">{currentProduct._id ? 'Editar Produto' : 'Novo Produto'}</h3>
              <p className="text-sm text-gray-500 mt-1">Preencha os detalhes do item do cardápio.</p>
            </div>
            <button onClick={() => setIsEditing(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <form onSubmit={handleSaveProduct} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1">
                <label className="block text-sm font-bold text-gray-700 mb-2">Nome do Produto</label>
                <input type="text" required value={currentProduct.nome} onChange={e => setCurrentProduct({...currentProduct, nome: e.target.value})} placeholder="Ex: Hambúrguer Artesanal" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Preço Atual (R$)</label>
                <input type="number" step="0.01" required value={currentProduct.preco} onChange={e => setCurrentProduct({...currentProduct, preco: e.target.value === '' ? '' : parseFloat(e.target.value)})} placeholder="0.00" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-emerald-600" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2 italic">Preço Original (R$)</label>
                <input type="number" step="0.01" value={currentProduct.preco_antigo || ''} onChange={e => setCurrentProduct({...currentProduct, preco_antigo: e.target.value === '' ? 0 : parseFloat(e.target.value)})} placeholder="Ex: 35.00" className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-gray-300 outline-none text-gray-400 line-through decoration-gray-300" />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Descrição</label>
              <textarea value={currentProduct.descricao} onChange={e => setCurrentProduct({...currentProduct, descricao: e.target.value})} placeholder="Ingredientes e detalhes do produto..." className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none" rows={3}></textarea>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-1">
                <ImagePicker 
                  label="Imagem do Produto"
                  value={currentProduct.imagem || ''} 
                  onChange={(url) => setCurrentProduct({...currentProduct, imagem: url})} 
                  onUploadStatus={setIsUploadingImage}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Categoria</label>
                <select value={currentProduct.categoriaId?._id || currentProduct.categoriaId} onChange={e => setCurrentProduct({...currentProduct, categoriaId: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none appearance-none">
                  <option value="">Selecione uma categoria...</option>
                  {categorias.map(c => <option key={c.id || c._id} value={c.id || c._id}>{c.nome}</option>)}
                </select>
              </div>
            </div>

            {/* Configurações de Destaque e Vitrine */}
            <div className="p-5 bg-amber-50/50 rounded-3xl border border-amber-100 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.54 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.784.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-amber-900">Destaque Especial</h4>
                    <p className="text-xs text-amber-700/70">Aparecerá no topo do cardápio com cards maiores.</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={currentProduct.destaque || false} onChange={e => setCurrentProduct({...currentProduct, destaque: e.target.checked})} />
                  <div className="w-14 h-7 bg-amber-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>
              
              {currentProduct.destaque && (
                <div className="pl-12 space-y-3 pt-2 border-t border-amber-200/50 animate-in fade-in zoom-in duration-300">
                  <div>
                    <label className="block text-xs font-bold text-amber-800 mb-1">Texto do Selo Decorativo</label>
                    <input 
                      type="text" 
                      value={currentProduct.selo_destaque || ''} 
                      onChange={e => setCurrentProduct({...currentProduct, selo_destaque: e.target.value})} 
                      placeholder="Ex: Mais Pedido, Recomendado, Edição Especial" 
                      className="w-full px-4 py-2 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 text-amber-900 placeholder:text-amber-300" 
                    />
                  </div>
                </div>
              )}
            </div>
            
            {/* Fidelidade Clube Stitch (SaaS Standard) */}
            <div className="p-5 bg-purple-50/50 rounded-[2rem] border border-purple-100 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-100 p-2.5 rounded-2xl text-purple-600 shadow-sm">
                    <Gift className="w-6 h-6 fill-current" />
                  </div>
                  <div>
                    <h4 className="font-black text-purple-900 uppercase text-xs tracking-widest italic">Fidelidade Clube Stitch</h4>
                    <p className="text-[10px] text-purple-500 font-bold italic">Permitir resgate deste item por pontos acumulados.</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={currentProduct.pode_resgatar || false} onChange={e => setCurrentProduct({...currentProduct, pode_resgatar: e.target.checked})} />
                  <div className="w-14 h-7 bg-purple-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
              
              {currentProduct.pode_resgatar && (
                <div className="pl-12 space-y-3 pt-2 border-t border-purple-200/50 animate-in fade-in zoom-in duration-300">
                  <div>
                    <label className="block text-xs font-bold text-purple-800 mb-1">Pontos Necessários para Resgate</label>
                    <input 
                      type="number" 
                      value={currentProduct.pontos_resgate || 0} 
                      onChange={e => setCurrentProduct({...currentProduct, pontos_resgate: parseInt(e.target.value) || 0})} 
                      placeholder="Ex: 200, 500" 
                      className="w-full px-4 py-2 bg-white border border-purple-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 text-purple-900 font-bold" 
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Configurações Avançadas */}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <h4 className="font-bold text-gray-900">Configurações Avançadas</h4>
              
              <div className="p-5 bg-gray-50 rounded-2xl border border-gray-200">
                <label className="flex items-center gap-3 cursor-pointer mb-4">
                  <input type="checkbox" checked={currentProduct.controlar_estoque} onChange={e => setCurrentProduct({...currentProduct, controlar_estoque: e.target.checked})} className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                  <span className="font-bold text-gray-900">Controlar Estoque</span>
                </label>
                {currentProduct.controlar_estoque && (
                  <div className="pl-8">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quantidade Disponível</label>
                    <input type="number" value={currentProduct.estoque} onChange={e => setCurrentProduct({...currentProduct, estoque: e.target.value === '' ? '' : parseInt(e.target.value)})} className="w-full md:w-1/2 px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                )}
              </div>

              <div className="p-5 bg-gray-50 rounded-2xl border border-gray-200">
                <label className="flex items-center gap-3 cursor-pointer mb-4">
                  <input type="checkbox" checked={currentProduct.personalizavel} onChange={e => setCurrentProduct({...currentProduct, personalizavel: e.target.checked})} className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                  <span className="font-bold text-gray-900">Personalização em Grade (Ex: Cento de Salgado)</span>
                </label>
                {currentProduct.personalizavel && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-8">
                    <p className="md:col-span-2 text-xs text-gray-500 mb-2">Ideal para produtos onde o cliente deve escolher exatamente o limite especificado sem cobrança adicional (ex: "Escolha seus 100 salgados").</p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Qtd. Exigida de Opções</label>
                      <input type="number" value={currentProduct.quantidade_total_opcoes} onChange={e => setCurrentProduct({...currentProduct, quantidade_total_opcoes: e.target.value === '' ? '' : parseInt(e.target.value)})} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Opções (separadas por vírgula)</label>
                      <input type="text" value={optionsString} onChange={e => setOptionsString(e.target.value)} placeholder="Ex: Queijo, Presunto, Frango" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* GRUPOS DE ADICIONAIS COMPLEXOS */}
              <div className="p-5 bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <span className="font-bold text-gray-900 block">Grupos de Complementos e Adicionais (Upsell)</span>
                    <p className="text-xs text-gray-500">Ideal para montagens complexas com custos adicionais (Ex: Adicionais de Queijo + R$ 3,00) ou escolhas opcionais.</p>
                  </div>
                  <button type="button" onClick={() => {
                      const g = [...(currentProduct.grupos_adicionais || [])];
                      g.push({ nome: 'Novo Grupo', obrigatorio: false, minimo: 0, maximo: 1, itens: [] });
                      setCurrentProduct({...currentProduct, grupos_adicionais: g});
                  }} className="text-sm font-bold text-emerald-600 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                      <Plus className="w-4 h-4" /> Novo Grupo
                  </button>
                </div>

                <div className="space-y-4">
                  {(currentProduct.grupos_adicionais || []).map((grupo: any, gIndex: number) => (
                    <div key={gIndex} className="bg-white border text-sm border-gray-200 rounded-xl p-4 shadow-sm animate-in fade-in">
                      <div className="flex flex-col md:flex-row gap-4 mb-4">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-gray-700 mb-1">Nome do Grupo</label>
                          <input type="text" value={grupo.nome} onChange={e => handleUpdateGrupo(gIndex, 'nome', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none" placeholder="Ex: Escolha o Recheio" />
                        </div>
                        <div className="w-32 flex items-center mt-6 gap-2">
                           <input type="checkbox" checked={grupo.obrigatorio} onChange={e => handleUpdateGrupo(gIndex, 'obrigatorio', e.target.checked)} className="w-4 h-4 text-emerald-600 rounded" />
                           <label className="text-xs font-bold text-gray-700">Obrigatório?</label>
                        </div>
                        <div className="w-24">
                          <label className="block text-xs font-bold text-gray-700 mb-1">Mínimo</label>
                          <input type="number" value={grupo.minimo} onChange={e => handleUpdateGrupo(gIndex, 'minimo', parseInt(e.target.value)||0)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none" min={0} />
                        </div>
                        <div className="w-24">
                          <label className="block text-xs font-bold text-gray-700 mb-1">Máximo</label>
                          <input type="number" value={grupo.maximo} onChange={e => handleUpdateGrupo(gIndex, 'maximo', parseInt(e.target.value)||1)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none" min={1} />
                        </div>
                        <button type="button" onClick={() => {
                           const g = [...currentProduct.grupos_adicionais];
                           g.splice(gIndex, 1);
                           setCurrentProduct({...currentProduct, grupos_adicionais: g});
                        }} className="mt-6 p-2 text-red-500 hover:bg-red-50 rounded-lg h-9"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      
                      {/* Itens do Grupo */}
                      <div className="pl-4 border-l-2 border-emerald-100 space-y-2">
                        <div className="flex justify-between items-center mb-2">
                           <h5 className="text-xs font-bold text-gray-700 uppercase">Itens Disponíveis</h5>
                           <button type="button" onClick={() => {
                               const g = [...currentProduct.grupos_adicionais];
                               g[gIndex].itens = [...(g[gIndex].itens || []), { nome: '', preco: 0 }];
                               setCurrentProduct({...currentProduct, grupos_adicionais: g});
                           }} className="text-xs font-bold text-blue-600 flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar Item</button>
                        </div>
                        {(grupo.itens || []).map((item: any, iIndex: number) => (
                           <div key={iIndex} className="flex gap-2">
                              <input type="text" value={item.nome} onChange={e => {
                                 const g = [...currentProduct.grupos_adicionais];
                                 g[gIndex].itens[iIndex].nome = e.target.value;
                                 setCurrentProduct({...currentProduct, grupos_adicionais: g});
                              }} className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg outline-none text-xs" placeholder="Ex: Nutella" />
                              <div className="relative">
                                 <span className="absolute left-2 top-2 text-xs text-gray-400">R$</span>
                                 <input type="number" step="0.5" value={item.preco} onChange={e => {
                                    const g = [...currentProduct.grupos_adicionais];
                                    g[gIndex].itens[iIndex].preco = parseFloat(e.target.value) || 0;
                                    setCurrentProduct({...currentProduct, grupos_adicionais: g});
                                 }} className="w-24 pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg outline-none text-xs" />
                              </div>
                              <button type="button" onClick={() => {
                                 const g = [...currentProduct.grupos_adicionais];
                                 g[gIndex].itens.splice(iIndex, 1);
                                 setCurrentProduct({...currentProduct, grupos_adicionais: g});
                              }} className="p-1.5 text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                           </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={() => setIsEditing(false)} className="px-6 py-3 rounded-2xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
              <button 
                type="submit" 
                disabled={isUploadingImage}
                className={`px-8 py-3 rounded-2xl font-bold text-white transition-all shadow-sm ${isUploadingImage ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'}`}
              >
                {isUploadingImage ? 'Enviando Foto...' : 'Salvar Produto'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Modal Profissional de Exclusão Definitiva */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 pb-0">
               <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
                 <Trash2 className="w-8 h-8 text-red-500" />
               </div>
               <h3 className="text-2xl font-black text-gray-900 mb-2 mt-2 leading-tight">Excluir Produto?</h3>
               <p className="text-gray-500 font-medium leading-relaxed">
                 Esta ação apagará permanentemente <span className="text-red-600 font-bold">{productToDelete?.nome}</span> e todos os seus dados. Não há como desfazer.
               </p>
            </div>

            <div className="p-8 space-y-4">
              <div className="bg-gray-50 p-6 rounded-3xl space-y-4 border border-gray-100">
                 <div className="space-y-1.5 focus-within:text-emerald-600 transition-colors">
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">E-mail Administrativo</label>
                   <input
                     type="email"
                     placeholder="Confirmar seu e-mail"
                     value={confirmAuth.email}
                     onChange={(e) => setConfirmAuth({ ...confirmAuth, email: e.target.value })}
                     className="w-full bg-white border border-gray-200 p-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-bold text-gray-900"
                   />
                 </div>
                 <div className="space-y-1.5 focus-within:text-emerald-600 transition-colors">
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Senha de Autorização</label>
                   <input
                     type="password"
                     placeholder="Sua senha master"
                     value={confirmAuth.senha}
                     onChange={(e) => setConfirmAuth({ ...confirmAuth, senha: e.target.value })}
                     className="w-full bg-white border border-gray-200 p-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-bold text-gray-900"
                   />
                 </div>
              </div>

              <div className="flex flex-col gap-3">
                 <button
                   onClick={handleDeletePermanent}
                   disabled={deleting}
                   className="w-full bg-red-600 hover:bg-red-700 text-white p-5 rounded-2xl font-bold transition-all shadow-xl shadow-red-900/10 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                 >
                   {deleting ? 'Removendo do Banco...' : <><Trash className="w-5 h-5" /> Confirmar Exclusão</>}
                 </button>
                 <button
                   onClick={() => setShowDeleteModal(false)}
                   disabled={deleting}
                   className="w-full bg-white text-gray-400 p-5 rounded-2xl font-bold hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50"
                 >
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
