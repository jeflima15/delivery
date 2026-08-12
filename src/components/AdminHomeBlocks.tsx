// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { LayoutTemplate, Image as ImageIcon, Link, EyeOff, Save, GripVertical, Plus, Trash2, X, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import ImagePicker from './ImagePicker';

// DND Kit - Drag and Drop Profissional
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

// Componente de Linha Arrastável
function SortableRow({ bloco, idx, onEdit, onDelete, onToggleActive }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: bloco._id || `new-${idx}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.6 : 1
  };

  return (
    <tr 
      ref={setNodeRef} 
      style={style}
      className={`transition-colors border-b border-gray-50/50 ${isDragging ? 'bg-emerald-50/20' : 'hover:bg-gray-50/50'}`}
    >
      <td className="py-4 px-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-2 hover:bg-gray-100 rounded text-gray-400">
          <GripVertical className="w-5 h-5" />
        </div>
      </td>
      <td className="py-4 text-center">
        <span className="font-bold text-gray-400 text-xs">{idx + 1}º</span>
      </td>
      <td className="py-4 w-24">
         <div className="w-16 h-12 bg-gray-100 rounded-lg overflow-hidden shrink-0 border border-gray-100 flex items-center justify-center">
            {bloco.imagem_desktop || bloco.imagem_mobile ? (
              <img src={bloco.imagem_desktop || bloco.imagem_mobile} alt="Banner" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-5 h-5 text-gray-300" />
            )}
          </div>
      </td>
      <td className="py-4">
        <div>
          <p className="font-bold text-gray-900 leading-tight">{bloco.titulo || '(Sem título)'}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
             <span className="text-[10px] text-gray-500 line-clamp-1">{bloco.descricao || 'Sem descrição'}</span>
          </div>
        </div>
      </td>
      <td className="py-4 text-center">
         <button 
           onClick={() => onToggleActive(bloco)}
           className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${bloco.ativo ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}
         >
           {bloco.ativo ? 'Visível' : 'Oculto'}
         </button>
      </td>
      <td className="py-4 text-right pr-6">
         <div className="flex justify-end gap-2">
           <button onClick={() => onEdit(bloco)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-bold text-xs uppercase tracking-wider">Editar</button>
           <button aria-label={`Excluir bloco ${bloco.titulo || ''}`} onClick={() => onDelete(bloco)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
         </div>
      </td>
    </tr>
  );
}

export default function AdminHomeBlocks({ token, onUnauthorized }) {
  const api = useTenantAdminApi();
  const [blocos, setBlocos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBloco, setEditingBloco] = useState(null);
  
  const { showToast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchBlocos = async () => {
    try {
      const data = await api.listHomeBlocks();
      if (data.success) {
        setBlocos(data.items);
      }
    } catch (e) {
      showToast('Erro ao carregar layout', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBlocos(); }, [token]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setBlocos((items) => {
        const oldIndex = items.findIndex((i) => i._id === active.id);
        const newIndex = items.findIndex((i) => i._id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    try {
      const updates = blocos.map((b, idx) => ({ id: b._id, ordem: idx, ativo: b.ativo }));
      const data = await api.reorderHomeBlocks(updates);
      if (data.success) showToast('Ordem salva com sucesso!', 'success');
    } catch (e) {
      showToast('Erro ao salvar layout', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (bloco) => {
    const newVal = !bloco.ativo;
    try {
      await api.updateHomeBlock(bloco._id, { ativo: newVal });
      fetchBlocos();
    } catch(e) {}
  };

  const handleDelete = async (bloco) => {
    if (!window.confirm(`Excluir bloco ${bloco.titulo}?`)) return;
    try {
      await api.deleteHomeBlock(bloco._id);
      fetchBlocos();
    } catch(e) {}
  };

  const openForm = (bloco = null) => {
    setEditingBloco(bloco || {
      titulo: '', descricao: '',
      imagem_desktop: '', 
      modal_titulo: '', modal_texto_completo: '', modal_imagem: '',
      tipo_bloco: 'card_promocional', ativo: true,
      acao_clique: 'modal',
      posicao_exibicao: 'below_hero'
    });
    setIsModalOpen(true);
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const isNew = !editingBloco._id;
      if (isNew) await api.createHomeBlock(editingBloco);
      else await api.updateHomeBlock(editingBloco._id, editingBloco);
      showToast('Bloco salvo com sucesso!', 'success');
      setIsModalOpen(false);
      fetchBlocos();
    } catch (e) {
      showToast('Erro ao salvar bloco', 'error');
    } finally {
      setSaving(false);
    }
  };


  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Carregando layout da home...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <LayoutTemplate className="h-5 w-5 text-emerald-600" />
            Blocos e banners da home
          </h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">Gerencie o carrossel, banners e avisos exibidos na vitrine.</p>
        </div>
        <div className="flex items-center gap-2">
           <button
            onClick={() => openForm()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> Novo bloco
          </button>
          <button
            onClick={handleSaveOrder}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : <><Save className="h-4 w-4" /> Salvar layout</>}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        {blocos.length === 0 ? (
           <div className="p-12 text-center flex flex-col items-center">
              <LayoutTemplate className="w-16 h-16 text-gray-200 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Sua vitrine está vazia</h3>
              <p className="text-gray-500 mb-6">Comece adicionando um banner principal ou cards promocionais.</p>
              <button onClick={() => openForm()} className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-100 transition-colors">
                 <Plus className="w-5 h-5" /> Criar Primeiro Bloco
              </button>
           </div>
        ) : (
          <>
          <div className="space-y-3 p-3 md:hidden">{blocos.map((bloco, idx) => <article key={bloco._id} className="rounded-2xl border border-gray-200 bg-white p-4"><div className="flex gap-3"><div className="grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-gray-100">{bloco.imagem_desktop || bloco.imagem_mobile ? <img src={bloco.imagem_desktop || bloco.imagem_mobile} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-gray-300" />}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="line-clamp-1 font-bold text-gray-900">{bloco.titulo || '(Sem titulo)'}</h3><span className="text-xs font-bold text-gray-400">{idx + 1}º</span></div><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">{bloco.descricao || 'Sem descricao'}</p></div></div><div className="mt-3 flex items-center gap-2"><button aria-label="Mover bloco para cima" disabled={idx === 0} onClick={() => setBlocos((items) => arrayMove(items, idx, idx - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button aria-label="Mover bloco para baixo" disabled={idx === blocos.length - 1} onClick={() => setBlocos((items) => arrayMove(items, idx, idx + 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button><button onClick={() => handleToggleActive(bloco)} className={`h-9 rounded-lg px-3 text-xs font-bold ${bloco.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{bloco.ativo ? 'Visivel' : 'Oculto'}</button><button onClick={() => openForm(bloco)} className="ml-auto h-9 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700">Editar</button><button aria-label={`Excluir bloco ${bloco.titulo || ''}`} onClick={() => handleDelete(bloco)} className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-600"><Trash2 className="h-4 w-4" /></button></div></article>)}</div>
          <div className="hidden p-4 md:block md:p-6 md:overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 font-semibold border-b border-gray-100 pb-4">
                  <th className="pb-4 w-12"></th>
                  <th className="pb-4 w-16 text-center">Pos</th>
                  <th className="pb-4 w-24">Banner</th>
                  <th className="pb-4">Bloco & Tipo</th>
                  <th className="pb-4 text-center">Home</th>
                  <th className="pb-4 text-right pr-6">Ações</th>
                </tr>
              </thead>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
                <SortableContext items={blocos.map(p => p._id)} strategy={verticalListSortingStrategy}>
                  <tbody className="divide-y divide-gray-50">
                    {blocos.map((bloco, idx) => (
                      <SortableRow key={bloco._id} bloco={bloco} idx={idx} onEdit={openForm} onDelete={handleDelete} onToggleActive={handleToggleActive} />
                    ))}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>
          </div>
          </>
        )}
      </div>

      {/* MODAL DE EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
             
             <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                   {editingBloco._id ? 'Editar Bloco' : 'Novo Bloco da Home'}
                </h3>
                <button aria-label="Fechar editor" onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-50 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
             </div>

             <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                <form id="bloco-form" onSubmit={handleSaveForm} className="space-y-6">
                   
                   {/* 1. CONTEÚDO CAPA (O que aparece na HOME) */}
                   <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                         <LayoutTemplate className="w-4 h-4" /> Cartão da Home
                      </h4>
                      
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Título do Card</label>
                        <input type="text" value={editingBloco.titulo} onChange={e => setEditingBloco({...editingBloco, titulo: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold" required placeholder="Ex: Black Friday 50%" />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Resumo Curto (Abaixo do título)</label>
                        <input type="text" value={editingBloco.descricao} onChange={e => setEditingBloco({...editingBloco, descricao: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm" placeholder="Ex: Confira os lanches participantes" />
                      </div>
                      
                      <div>
                        <ImagePicker
                          label="Imagem do Card"
                          value={editingBloco.imagem_desktop || ''}
                          onChange={(url) => setEditingBloco({ ...editingBloco, imagem_desktop: url, imagem_mobile: url })}
                          aspect={16 / 9}
                          width={1200}
                          height={675}
                          bucket="loja"
                          path="home-blocks"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Posição na Home</label>
                        <select
                          value={editingBloco.posicao_exibicao || 'below_hero'}
                          onChange={e => setEditingBloco({...editingBloco, posicao_exibicao: e.target.value})}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-medium"
                        >
                          <option value="below_hero">Carrossel do Topo</option>
                          <option value="before_products">Antes dos Produtos</option>
                          <option value="middle_home">Entre Categorias</option>
                          <option value="after_products">Após os Produtos</option>
                        </select>
                      </div>
                   </div>

                   {/* 2. AÇÃO AO CLICAR */}
                   <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                         <AlertCircle className="w-4 h-4" /> Ação ao Clicar no Bloco
                      </h4>

                      <div>
                        <select
                          value={editingBloco.acao_clique || 'modal'}
                          onChange={e => setEditingBloco({...editingBloco, acao_clique: e.target.value})}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-bold"
                        >
                          <option value="nenhuma">Nenhuma (Apenas visual)</option>
                          <option value="modal">Abrir um Modal com mais informações</option>
                          <option value="link">Redirecionar para um Link ou Categoria</option>
                        </select>
                      </div>

                      {editingBloco.acao_clique === 'link' && (
                        <div className="pt-2 animate-in fade-in duration-200">
                          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">URL de Destino</label>
                          <input type="text" value={editingBloco.link_destino || ''} onChange={e => setEditingBloco({...editingBloco, link_destino: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-emerald-500 text-sm" placeholder="Ex: https://instagram.com/... ou #categoria-bebidas" />
                          <p className="text-[11px] text-gray-400 mt-2 ml-1">Use links começando com <strong className="text-gray-500">http</strong> para sites externos ou <strong className="text-gray-500">#categoria-id</strong> para rolar até uma sessão da loja.</p>
                        </div>
                      )}

                      {editingBloco.acao_clique === 'modal' && (
                        <div className="space-y-4 pt-2 animate-in fade-in duration-200">
                          <div>
                             <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Título Dentro do Modal</label>
                             <input type="text" value={editingBloco.modal_titulo || ''} onChange={e => setEditingBloco({...editingBloco, modal_titulo: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-emerald-500 font-bold" placeholder="Deixe em branco para usar o Título do Card" />
                          </div>

                          <div>
                             <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">A Imagem se Repete no Modal? (Opcional)</label>
                             <p className="text-xs text-gray-500 mb-3 ml-1">Se deixar vazio, vai reutilizar a imagem do Card principal.</p>
                             <ImagePicker
                              value={editingBloco.modal_imagem || ''}
                              onChange={(url) => setEditingBloco({ ...editingBloco, modal_imagem: url })}
                              aspect={16 / 9}
                              width={1200}
                              height={675}
                              bucket="loja"
                              path="home-blocks"
                            />
                          </div>

                          <div>
                             <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Regras / Texto Completo</label>
                             <textarea value={editingBloco.modal_texto_completo || ''} onChange={e => setEditingBloco({...editingBloco, modal_texto_completo: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-emerald-500 text-sm min-h-[140px] leading-relaxed" placeholder="Escreva todo o regulamento ou detalhes da novidade..." />
                          </div>
                        </div>
                      )}
                   </div>

                </form>
             </div>

             <div className="p-6 bg-white border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3.5 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancelar</button>
                <button type="submit" form="bloco-form" disabled={saving} className="px-8 py-3.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 flex items-center gap-2">
                   {saving && <svg className="animate-spin h-5 w-5 text-white" xmln="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>}
                   Salvar Bloco
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
