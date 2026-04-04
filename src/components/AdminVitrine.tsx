// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { LayoutTemplate, Star, Tag, EyeOff, Save, GripVertical } from 'lucide-react';
import { useToast } from './Toast';

// DND Kit - Drag and Drop Profissional
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

// Componente de Linha Arrastável
function SortableRow({ produto, idx, toggleField }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: produto._id });

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
      <td className="py-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 rounded-xl overflow-hidden shrink-0 border border-gray-100">
            {produto.imagem ? (
              <img src={produto.imagem} alt={produto.nome} className="w-full h-full object-cover" />
            ) : (
              <LayoutTemplate className="w-6 h-6 text-gray-300 m-auto mt-3" />
            )}
          </div>
          <div>
            <p className="font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">{produto.nome}</p>
            <p className="text-sm font-semibold text-emerald-600">R$ {(produto.preco || 0).toFixed(2).replace('.', ',')}</p>
          </div>
        </div>
      </td>
      <td className="py-4">
        <div className="flex justify-center gap-3">
          <button 
            onClick={() => toggleField(idx, 'destaque')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${produto.destaque ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}
          >
            <Star className={`w-3.5 h-3.5 ${produto.destaque ? 'fill-orange-600' : ''}`} /> Mais Vendido
          </button>
          <button 
            onClick={() => toggleField(idx, 'promocao')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${produto.promocao ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}
          >
            <Tag className="w-3.5 h-3.5" /> Promoção
          </button>
        </div>
      </td>
      <td className="py-4 text-right pr-6">
        {!produto.ativo && <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-lg"><EyeOff className="w-3 h-3" /> Inativo</span>}
        {produto.ativo && <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 text-[11px] font-bold rounded-lg">Visível</span>}
      </td>
    </tr>
  );
}

export default function AdminVitrine({ token, onUnauthorized }: { token: string, onUnauthorized: () => void }) {
  const [produtos, setProdutos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  // Sensores para DND (Mouse + Teclado + Touch)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchProdutos = async () => {
    try {
      const res = await fetch('/api/admin/produtos', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 401 || res.status === 403) {
        onUnauthorized();
        return;
      }

      const data = await res.json();
      if (data.sucesso) {
        // Ordenação ascendente por 'ordem' ou data de criação
        const sorted = data.produtos.sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
        setProdutos(sorted);
      }
    } catch (error) {
      showToast('Erro ao buscar produtos', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProdutos();
  }, [token]);

  const toggleField = (index: number, field: 'destaque' | 'promocao') => {
    const newProds = [...produtos];
    newProds[index] = { ...newProds[index], [field]: !newProds[index][field] };
    setProdutos(newProds);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setProdutos((items) => {
        const oldIndex = items.findIndex((i) => i._id === active.id);
        const newIndex = items.findIndex((i) => i._id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    try {
      const updates = produtos.map((p, idx) => ({
        id: p._id,
        ordem: idx,
        destaque: p.destaque,
        promocao: p.promocao
      }));

      // 🔥 BATCH UPDATE: Envia tudo de uma vez para alta performance e estabilidade
      const res = await fetch('/api/admin/produtos/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ updates })
      });

      const data = await res.json();
      if (data.sucesso) {
        showToast('Vitrine salva com sucesso!', 'success');
        fetchProdutos(); // Recarrega para confirmar
      } else {
        throw new Error(data.erro);
      }
    } catch (e) {
      console.error(e);
      showToast('Erro ao atualizar vitrine', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Carregando vitrine...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <LayoutTemplate className="text-emerald-600 w-8 h-8" />
            Vitrine Estratégica
          </h2>
          <p className="text-gray-500 mt-1">Clique e arraste os produtos para mudar a ordem. Os do topo aparecem primeiro.</p>
        </div>
        <button
          onClick={handleSaveOrder}
          disabled={saving}
          className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-3.5 rounded-2xl font-bold hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-900/20 active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? 'Guardando Layout...' : <><Save className="w-5 h-5" /> Salvar Vitrine</>}
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6 overflow-x-auto">
          <table className="w-full min-w-[700px]">
             <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-400 font-semibold border-b border-gray-100 pb-4">
                <th className="pb-4 w-12"></th>
                <th className="pb-4 w-16 text-center">Posição</th>
                <th className="pb-4">Produto</th>
                <th className="pb-4 text-center">Configurações Rápidas</th>
                <th className="pb-4 text-right pr-6">Status</th>
              </tr>
            </thead>
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext 
                items={produtos.map(p => p._id)}
                strategy={verticalListSortingStrategy}
              >
                <tbody className="divide-y divide-gray-50">
                  {produtos.map((produto, idx) => (
                    <SortableRow 
                      key={produto._id} 
                      produto={produto} 
                      idx={idx} 
                      toggleField={toggleField} 
                    />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>
      </div>
    </div>
  );
}

