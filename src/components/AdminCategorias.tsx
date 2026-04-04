// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Tags, GripVertical, Save } from 'lucide-react';
import { useToast } from './Toast';

// DND Kit - Drag and Drop Profissional
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

// Componente de Linha Arrastável
function SortableCategoryRow({ cat, idx, onEdit, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: cat._id || cat.id });

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
      className={`transition-colors border-b border-gray-100 ${isDragging ? 'bg-emerald-50/20' : 'hover:bg-gray-50/50'}`}
    >
      <td className="p-4 w-12">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-2 hover:bg-gray-200 rounded text-gray-400">
          <GripVertical className="w-5 h-5" />
        </div>
      </td>
      <td className="p-4 w-16 text-center">
        <span className="font-bold text-gray-400 text-xs">{idx + 1}º</span>
      </td>
      <td className="p-4">
        <span className="font-bold text-gray-900">{cat.nome}</span>
      </td>
      <td className="p-4 text-right pr-6">
        <div className="flex items-center justify-end gap-2">
          <button 
            onClick={() => onEdit(cat)}
            className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
            title="Editar"
          >
            <Edit className="w-5 h-5" />
          </button>
          <button 
            onClick={() => onDelete(cat._id || cat.id)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminCategorias({ token, onUnauthorized }: { token: string, onUnauthorized: () => void }) {
  const [categorias, setCategorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCategoria, setCurrentCategoria] = useState<any>(null);
  const { showToast } = useToast();

  // Sensores DND
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchCategorias = async () => {
    try {
      const res = await fetch('/api/categorias');
      const data = await res.json();
      if (Array.isArray(data)) {
        // Ordenar pela propriedade 'ordem'
        const sorted = data.sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
        setCategorias(sorted);
      }
    } catch (error) {
      showToast('Erro ao buscar categorias', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategorias();
  }, []);

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setCategorias((items) => {
        const oldIndex = items.findIndex((i) => (i._id || i.id) === active.id);
        const newIndex = items.findIndex((i) => (i._id || i.id) === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    try {
      const updates = categorias.map((cat, idx) => ({
        id: cat._id || cat.id,
        ordem: idx
      }));

      const res = await fetch('/api/admin/categorias/batch-update', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ updates })
      });

      const data = await res.json();
      if (data.sucesso) {
        showToast('Ordem das categorias atualizada!', 'success');
        fetchCategorias();
      } else {
        throw new Error(data.erro);
      }
    } catch (error) {
      showToast('Erro ao salvar ordem', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = currentCategoria._id || currentCategoria.id;
    const url = id ? `/api/admin/categorias/${id}` : '/api/admin/categorias';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ nome: currentCategoria.nome })
      });
      const data = await res.json();
      if (data.sucesso || res.ok) {
        showToast(id ? 'Categoria atualizada!' : 'Categoria criada!', 'success');
        setIsEditing(false);
        setCurrentCategoria(null);
        fetchCategorias();
      } else {
        showToast(data.erro || 'Erro ao salvar categoria', 'error');
      }
    } catch (error) {
      showToast('Erro ao salvar categoria', 'error');
    }
  };

  const handleDeleteCategoria = async (id: string) => {
    if (!window.confirm('Excluir esta categoria? Isso falhará se houver produtos nela.')) return;
    try {
      const res = await fetch(`/api/admin/categorias/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.sucesso || res.ok) {
        showToast('Categoria excluída!', 'success');
        fetchCategorias();
      } else {
        showToast(data.erro || 'Erro ao excluir', 'error');
      }
    } catch (error) {
      showToast('Erro ao excluir', 'error');
    }
  };

  const openNewCategoria = () => {
    setCurrentCategoria({ nome: '' });
    setIsEditing(true);
  };

  const onEdit = (cat) => {
    setCurrentCategoria(cat);
    setIsEditing(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {!isEditing ? (
        <>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Tags className="text-emerald-600 w-8 h-8" />
                Categorias
              </h2>
              <p className="text-gray-500 mt-1">Clique e arraste para definir a ordem em que aparecem no cardápio.</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={handleSaveOrder}
                disabled={saving || categorias.length === 0}
                className="flex items-center gap-2 bg-white text-emerald-600 border border-emerald-100 px-6 py-3 rounded-2xl font-bold hover:bg-emerald-50 active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? 'Gravando...' : <><Save className="w-5 h-5" /> Salvar Ordem</>}
              </button>
              <button 
                onClick={openNewCategoria}
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl hover:bg-emerald-700 transition-all font-bold shadow-sm shadow-emerald-600/20 active:scale-95"
              >
                <Plus className="w-5 h-5" />
                Nova Categoria
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto p-4 md:p-6">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-400 font-semibold border-b border-gray-100 pb-4">
                    <th className="pb-4 w-12"></th>
                    <th className="pb-4 w-16 text-center">Posição</th>
                    <th className="pb-4">Nome da Categoria</th>
                    <th className="pb-4 text-right pr-6">Ações</th>
                  </tr>
                </thead>
                {loading ? (
                   <tbody>
                    <tr>
                      <td colSpan={4} className="p-12 text-center text-gray-500">
                        Carregando categorias...
                      </td>
                    </tr>
                   </tbody>
                ) : categorias.length === 0 ? (
                   <tbody>
                    <tr>
                      <td colSpan={4} className="p-12 text-center text-gray-500">
                        Nenhuma categoria encontrada.
                      </td>
                    </tr>
                   </tbody>
                ) : (
                  <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis]}
                  >
                    <SortableContext 
                      items={categorias.map(cat => cat._id || cat.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <tbody className="divide-y divide-gray-100">
                        {categorias.map((cat, idx) => (
                          <SortableCategoryRow 
                            key={cat._id || cat.id} 
                            cat={cat} 
                            idx={idx} 
                            onEdit={onEdit}
                            onDelete={handleDeleteCategoria}
                          />
                        ))}
                      </tbody>
                    </SortableContext>
                  </DndContext>
                )}
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden max-w-2xl mx-auto">
          <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                {currentCategoria._id || currentCategoria.id ? 'Editar Categoria' : 'Nova Categoria'}
              </h3>
              <p className="text-gray-500 text-sm">Defina o nome que o cliente verá no menu.</p>
            </div>
            <button 
              onClick={() => {
                setIsEditing(false);
                setCurrentCategoria(null);
              }}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-8 h-8" />
            </button>
          </div>
          
          <form onSubmit={handleSaveCategoria} className="p-8 space-y-8">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-3 tracking-wide uppercase">Nome da Categoria</label>
              <input 
                type="text" 
                value={currentCategoria.nome}
                onChange={(e) => setCurrentCategoria({...currentCategoria, nome: e.target.value})}
                className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all text-lg font-medium"
                placeholder="Ex: Pizzas, Bebidas..."
                required
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <button 
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setCurrentCategoria(null);
                }}
                className="px-8 py-4 text-gray-500 font-bold hover:bg-gray-100 rounded-2xl transition-all"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-8 py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-900/20 transition-all active:scale-95"
              >
                Salvar Categoria
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

