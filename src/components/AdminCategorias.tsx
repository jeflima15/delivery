// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Tags, GripVertical, Save, ArrowDownUp } from 'lucide-react';
import { useToast } from './Toast';

// DND Kit - Drag and Drop Profissional
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

function SortableCategoryRow({ cat, idx, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat._id || cat.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-gray-100 transition-colors ${isDragging ? 'bg-emerald-50/30' : 'hover:bg-gray-50/70'}`}
    >
      <td className="p-4 w-14">
        <div
          {...attributes}
          {...listeners}
          className="inline-flex cursor-grab items-center justify-center rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
          title={`Arrastar ${cat.nome}`}
          aria-label={`Arrastar categoria ${cat.nome}`}
        >
          <GripVertical className="w-5 h-5" />
        </div>
      </td>
      <td className="p-4 w-20 text-center">
        <span className="inline-flex min-w-[3rem] items-center justify-center rounded-full bg-gray-50 px-3 py-1 text-xs font-bold text-gray-500">
          {idx + 1}o
        </span>
      </td>
      <td className="p-4">
        <p className="font-bold text-gray-900">{cat.nome}</p>
      </td>
      <td className="p-4 text-right pr-6">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onEdit(cat)}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
            title="Editar categoria"
            aria-label={`Editar categoria ${cat.nome}`}
          >
            <Edit className="w-4 h-4" />
            <span className="hidden lg:inline">Editar</span>
          </button>
          <button
            onClick={() => onDelete(cat._id || cat.id)}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-700"
            title="Excluir categoria"
            aria-label={`Excluir categoria ${cat.nome}`}
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden lg:inline">Excluir</span>
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
  const [savedOrderSignature, setSavedOrderSignature] = useState('');
  const { showToast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const getOrderSignature = (items: any[]) =>
    JSON.stringify(items.map((cat, idx) => ({ id: cat._id || cat.id, ordem: idx })));

  const fetchCategorias = async () => {
    try {
      const res = await fetch('/api/categorias');
      const data = await res.json();

      if (Array.isArray(data)) {
        const sorted = data.sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
        setCategorias(sorted);
        setSavedOrderSignature(getOrderSignature(sorted));
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

  const hasPendingOrderChanges = categorias.length > 0 && getOrderSignature(categorias) !== savedOrderSignature;

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setCategorias((items) => {
      const oldIndex = items.findIndex((i) => (i._id || i.id) === active.id);
      const newIndex = items.findIndex((i) => (i._id || i.id) === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const handleSaveOrder = async () => {
    setSaving(true);

    try {
      const updates = categorias.map((cat, idx) => ({
        id: cat._id || cat.id,
        ordem: idx,
      }));

      const res = await fetch('/api/admin/categorias/batch-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ updates }),
      });

      const data = await res.json();
      if (data.sucesso) {
        setSavedOrderSignature(getOrderSignature(categorias));
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
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ nome: currentCategoria.nome }),
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
    if (!window.confirm('Excluir esta categoria? Isso falhara se houver produtos nela.')) return;

    try {
      const res = await fetch(`/api/admin/categorias/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const data = await res.json();
      if (data.sucesso || res.ok) {
        showToast('Categoria excluida!', 'success');
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
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
                <Tags className="w-8 h-8 text-emerald-600" />
                Categorias
              </h2>
              <p className="mt-1 text-sm text-gray-500">Estrutura e ordem das categorias exibidas no catalogo.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSaveOrder}
                disabled={saving || categorias.length === 0 || !hasPendingOrderChanges}
                className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-white px-5 py-3 font-bold text-emerald-600 transition-all hover:bg-emerald-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
              >
                {saving ? 'Gravando...' : <><Save className="w-5 h-5" /> Salvar Ordem</>}
              </button>
              <button
                onClick={openNewCategoria}
                className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-sm shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-95"
              >
                <Plus className="w-5 h-5" />
                Nova Categoria
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">
                Criar, editar e ordenar
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">
                  <ArrowDownUp className="w-4 h-4 text-gray-400" />
                  Arraste para reordenar
              </span>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${hasPendingOrderChanges ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${hasPendingOrderChanges ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
              {hasPendingOrderChanges ? 'Alteracoes pendentes' : 'Ordem sincronizada'}
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto p-4 md:p-6">
              <table className="min-w-[560px] w-full border-collapse text-left">
                <thead className="bg-gray-50">
                  <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                    <th className="pb-4 w-14"></th>
                    <th className="pb-4 w-20 text-center">Posicao</th>
                    <th className="pb-4">Categoria</th>
                    <th className="pb-4 text-right pr-6">Acoes</th>
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
                    <SortableContext items={categorias.map((cat) => cat._id || cat.id)} strategy={verticalListSortingStrategy}>
                      <tbody className="divide-y divide-gray-100">
                        {categorias.map((cat, idx) => (
                          <SortableCategoryRow key={cat._id || cat.id} cat={cat} idx={idx} onEdit={onEdit} onDelete={handleDeleteCategoria} />
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
        <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 p-8">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                {currentCategoria._id || currentCategoria.id ? 'Editar Categoria' : 'Nova Categoria'}
              </h3>
              <p className="text-sm text-gray-500">Defina o nome que o cliente vera no menu.</p>
            </div>
            <button
              onClick={() => {
                setIsEditing(false);
                setCurrentCategoria(null);
              }}
              className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="w-8 h-8" />
            </button>
          </div>

          <form onSubmit={handleSaveCategoria} className="space-y-8 p-8">
            <div>
              <label className="mb-3 block text-sm font-bold uppercase tracking-wide text-gray-700">Nome da Categoria</label>
              <input
                type="text"
                value={currentCategoria.nome}
                onChange={(e) => setCurrentCategoria({ ...currentCategoria, nome: e.target.value })}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-lg font-medium outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
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
                className="rounded-2xl px-8 py-4 font-bold text-gray-500 transition-all hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-2xl bg-emerald-600 px-8 py-4 font-bold text-white transition-all hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-900/20 active:scale-95"
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
