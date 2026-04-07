// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { LayoutTemplate, Image as ImageIcon, Link, EyeOff, Save, GripVertical, Plus, Trash2, X, AlertCircle } from 'lucide-react';
import { useToast } from './Toast';

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

  const tipoLabel = {
    'banner_principal': 'Banner Principal (Especial)',
    'card_promocional': 'Card Promocional',
    'card_institucional': 'Card Institucional',
    'fidelidade': 'Fidelidade / Destaque',
    'texto': 'Apenas Texto'
  };

  const acaoLabel = {
    'nenhuma': 'Sem Ação',
    'link': 'Abrir Link',
    'modal': 'Abrir Modal'
  };

  const posLabel = {
    'below_hero': 'Topo',
    'before_products': 'Antes da Vitrine',
    'middle_home': 'Meio da Vitrine',
    'after_products': 'Fim da Página'
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
             <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-widest">{tipoLabel[bloco.tipo_bloco] || bloco.tipo_bloco}</span>
             <span className="text-[9px] font-black bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase tracking-widest">{posLabel[bloco.posicao_exibicao] || 'Topo'}</span>
             {bloco.acao_clique !== 'nenhuma' && (
               <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1">
                 {acaoLabel[bloco.acao_clique] || bloco.acao_clique}
                 {bloco.acao_clique === 'modal' && <AlertCircle className="w-2.5 h-2.5" />}
               </span>
             )}
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
           <button onClick={() => onDelete(bloco)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
         </div>
      </td>
    </tr>
  );
}

export default function AdminHomeBlocks({ token, onUnauthorized }) {
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
      const res = await fetch('/api/admin/blocos_home', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) return onUnauthorized();
      const data = await res.json();
      if (data.sucesso) {
        setBlocos(data.blocos);
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
      const res = await fetch('/api/admin/blocos_home/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ updates })
      });
      const data = await res.json();
      if (data.sucesso) showToast('Ordem salva com sucesso!', 'success');
    } catch (e) {
      showToast('Erro ao salvar layout', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (bloco) => {
    const newVal = !bloco.ativo;
    try {
      const res = await fetch(`/api/admin/blocos_home/${bloco._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ativo: newVal })
      });
      if (res.ok) fetchBlocos();
    } catch(e) {}
  };

  const handleDelete = async (bloco) => {
    if (!window.confirm(`Excluir bloco ${bloco.titulo}?`)) return;
    try {
      const res = await fetch(`/api/admin/blocos_home/${bloco._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchBlocos();
    } catch(e) {}
  };

  const openForm = (bloco = null) => {
    setEditingBloco(bloco || {
      titulo: '', subtitulo: '', descricao: '',
      imagem_desktop: '', imagem_mobile: '', link_destino: '', texto_botao: '',
      tipo_bloco: 'card_promocional', ativo: true,
      posicao_exibicao: 'before_products',
      acao_clique: 'nenhuma',
      modal_titulo: '', modal_texto_completo: '', modal_imagem: '', modal_cta_texto: '', modal_cta_link: ''
    });
    setIsModalOpen(true);
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const isNew = !editingBloco._id;
      const url = isNew ? '/api/admin/blocos_home' : `/api/admin/blocos_home/${editingBloco._id}`;
      const method = isNew ? 'POST' : 'PUT';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(editingBloco)
      });
      
      if (res.ok) {
        showToast('Bloco salvo com sucesso!', 'success');
        setIsModalOpen(false);
        fetchBlocos();
      } else {
        const d = await res.json();
        showToast(d.erro || 'Erro ao salvar', 'error');
      }
    } catch (e) {
      showToast('Erro ao salvar bloco', 'error');
    } finally {
      setSaving(false);
    }
  };


  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Carregando layout da home...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <LayoutTemplate className="text-emerald-600 w-8 h-8" />
            Layout da Home
          </h2>
          <p className="text-gray-500 mt-1 max-w-2xl font-medium">Crie banners, cards e gerencie tudo o que aparece na tela principal do cliente. Arraste para reordenar.</p>
        </div>
        <div className="flex gap-3">
           <button
            onClick={() => openForm()}
            className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-6 py-3.5 rounded-2xl font-bold hover:bg-gray-50 active:scale-95 transition-all shadow-sm"
          >
            <Plus className="w-5 h-5" /> Adicionar Bloco
          </button>
          <button
            onClick={handleSaveOrder}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-3.5 rounded-2xl font-bold hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-900/20 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? 'Guardando Layout...' : <><Save className="w-5 h-5" /> Salvar Layout</>}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
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
          <div className="p-4 md:p-6 overflow-x-auto">
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
                <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-50 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
             </div>

             <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                <form id="bloco-form" onSubmit={handleSaveForm} className="space-y-6">
                   
                   {/* Abas Superiores Form */}
                   
                   {/* 1. ESTILO E POSIÇÃO */}
                   <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-6">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Estilo Visual do Bloco</label>
                        <div className="grid grid-cols-2 gap-3">
                           {[
                             {id: 'banner_principal', label: 'Banner Grande', desc: 'Destaque visual max'},
                             {id: 'card_promocional', label: 'Card Promocional', desc: 'Grade de ofertas'},
                             {id: 'card_institucional', label: 'Info Box', desc: 'Destaque a textos'},
                             {id: 'fidelidade', label: 'Fidelidade', desc: 'Layout VIP'}
                           ].map(t => (
                              <div 
                                key={t.id}
                                onClick={() => setEditingBloco({...editingBloco, tipo_bloco: t.id})}
                                className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${editingBloco.tipo_bloco === t.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 bg-white hover:border-gray-300'}`}
                              >
                                 <div className="text-xs font-bold text-gray-900 leading-tight">{t.label}</div>
                                 <div className="text-[9px] text-gray-500 mt-0.5 leading-tight">{t.desc}</div>
                              </div>
                           ))}
                        </div>
                      </div>

                      <div className="md:w-56 shrink-0">
                         <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Posição Exibição</label>
                         <select 
                           value={editingBloco.posicao_exibicao}
                           onChange={e => setEditingBloco({...editingBloco, posicao_exibicao: e.target.value})}
                           className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-4 text-xs font-bold text-gray-700 outline-none focus:border-emerald-500 shadow-sm"
                         >
                            <option value="below_hero">Logo Após o Banner Inicial</option>
                            <option value="before_products">Antes da Vitrine de Produtos</option>
                            <option value="middle_home">No Meio do Cardápio</option>
                            <option value="after_products">No Fim da Página</option>
                         </select>
                      </div>
                   </div>

                   {/* 2. CONTEÚDO CAPA */}
                   <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex justify-between items-center">
                         Aparência do Card / Banner
                      </h4>
                      
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Título Principal</label>
                        <input type="text" value={editingBloco.titulo} onChange={e => setEditingBloco({...editingBloco, titulo: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium" placeholder="Ex: Cupom PRIMEIRA10" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                           <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Subtítulo (Opcional)</label>
                           <input type="text" value={editingBloco.subtitulo} onChange={e => setEditingBloco({...editingBloco, subtitulo: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm" placeholder="Ex: Aproveite hoje" />
                         </div>
                         <div>
                           <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Descrição Curta (No Card)</label>
                           <input type="text" value={editingBloco.descricao} onChange={e => setEditingBloco({...editingBloco, descricao: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm" placeholder="Ex: Confira os descontos!" />
                         </div>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5"/> Imagem do Card / URL</label>
                          <input type="url" value={editingBloco.imagem_desktop} onChange={e => setEditingBloco({...editingBloco, imagem_desktop: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm" placeholder="https://..." />
                      </div>
                   </div>

                   {/* 3. AÇÃO & COMPORTAMENTO (O GRANDE DIFERENCIAL) */}
                   <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 shadow-sm space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                         <h4 className="text-xs font-black text-emerald-800 uppercase tracking-widest flex items-center gap-2">
                            <Link className="w-4 h-4" /> Comportamento ao Clicar no Bloco
                         </h4>
                         
                         <div className="flex bg-white rounded-xl p-1 shadow-sm border border-emerald-100">
                           {['nenhuma', 'link', 'modal'].map(ac => (
                              <button
                                key={ac} type="button"
                                onClick={() => setEditingBloco({...editingBloco, acao_clique: ac})}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${editingBloco.acao_clique === ac ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                              >
                                {ac}
                              </button>
                           ))}
                         </div>
                      </div>

                      {editingBloco.acao_clique === 'link' && (
                         <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                            <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 flex items-center gap-1.5">Link de Destino</label>
                            <input type="url" value={editingBloco.link_destino} onChange={e => setEditingBloco({...editingBloco, link_destino: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-emerald-500 text-sm" placeholder="URL para onde será redirecionado..." />
                            
                            <label className="flex items-center gap-2 mt-3 ml-1 cursor-pointer">
                               <input type="checkbox" checked={editingBloco.abrir_nova_aba} onChange={e => setEditingBloco({...editingBloco, abrir_nova_aba: e.target.checked})} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                               <span className="text-xs font-bold text-gray-600">Abrir em uma nova aba do navegador</span>
                            </label>
                         </div>
                      )}

                      {editingBloco.acao_clique === 'modal' && (
                         <div className="p-5 bg-white rounded-xl border border-emerald-200 shadow-sm animate-in fade-in zoom-in-95 duration-200 space-y-4">
                            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs font-medium flex items-start gap-2">
                               <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                               <p>O Modal permite que você crie uma experiência completa com textão, cupons ou regras sem tirar o cliente da página.</p>
                            </div>

                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Título do Modal</label>
                               <input type="text" value={editingBloco.modal_titulo} onChange={e => setEditingBloco({...editingBloco, modal_titulo: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-emerald-500 font-bold" placeholder="Ex: Regras da Black Friday" />
                            </div>

                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Imagem Destaque (Modal)</label>
                               <input type="url" value={editingBloco.modal_imagem} onChange={e => setEditingBloco({...editingBloco, modal_imagem: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-emerald-500 text-sm" placeholder="Opcional. Uma imagem maior pra ilustrar." />
                            </div>

                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Texto Institucional Completo</label>
                               <textarea value={editingBloco.modal_texto_completo} onChange={e => setEditingBloco({...editingBloco, modal_texto_completo: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-emerald-500 text-sm min-h-[120px]" placeholder="Escreva todo o conteúdo, regras..." />
                            </div>

                            <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                               <div>
                                  <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Texto Botão CTA (Rodapé)</label>
                                  <input type="text" value={editingBloco.modal_cta_texto} onChange={e => setEditingBloco({...editingBloco, modal_cta_texto: e.target.value})} className="w-full px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl focus:border-emerald-500 text-sm text-emerald-900 font-bold" placeholder="Ex: Aproveitar Oferta" />
                               </div>
                               <div>
                                  <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">Link Botão CTA</label>
                                  <input type="url" value={editingBloco.modal_cta_link} onChange={e => setEditingBloco({...editingBloco, modal_cta_link: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="Link (Opcional)" />
                               </div>
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
