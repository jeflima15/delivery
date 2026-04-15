// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { LayoutTemplate, Star, Tag, EyeOff, Save, GripVertical, Eye, ShoppingBag } from 'lucide-react';
import { useToast } from './Toast';

// DND Kit - Drag and Drop Profissional
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

function SortableRow({ produto, idx, toggleField }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: produto._id });

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
      className={`border-b border-gray-100 transition-colors ${isDragging ? 'bg-emerald-50/30' : 'hover:bg-gray-50/60'}`}
    >
      <td className="px-2 py-4">
        <div
          {...attributes}
          {...listeners}
          className="inline-flex cursor-grab items-center justify-center rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
          title={`Arrastar ${produto.nome}`}
          aria-label={`Arrastar produto ${produto.nome}`}
        >
          <GripVertical className="w-5 h-5" />
        </div>
      </td>
      <td className="py-4 text-center">
        <span className="inline-flex min-w-[3rem] items-center justify-center rounded-full bg-gray-50 px-3 py-1 text-xs font-bold text-gray-500">
          {idx + 1}o
        </span>
      </td>
      <td className="py-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-100">
            {produto.imagem ? (
              <img src={produto.imagem} alt={produto.nome} className="h-full w-full object-cover" />
            ) : (
              <LayoutTemplate className="m-auto mt-3 h-6 w-6 text-gray-300" />
            )}
          </div>
          <div className="space-y-1">
            <p className="font-bold text-gray-900">{produto.nome}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>{produto.categoriaId?.nome || 'Sem categoria'}</span>
              <span className="h-1 w-1 rounded-full bg-gray-300"></span>
              <span className="font-semibold text-emerald-600">R$ {(produto.preco || 0).toFixed(2).replace('.', ',')}</span>
            </div>
          </div>
        </div>
      </td>
      <td className="py-4">
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => toggleField(idx, 'destaque')}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all ${produto.destaque ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
            title="Destacar este produto como mais vendido na vitrine"
            aria-label={`Destacar ${produto.nome} como mais vendido`}
          >
            <Star className={`w-3.5 h-3.5 ${produto.destaque ? 'fill-orange-600' : ''}`} />
            Mais vendido
          </button>
          <button
            onClick={() => toggleField(idx, 'promocao')}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all ${produto.promocao ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
            title="Sinalizar este produto como promocional na exibicao"
            aria-label={`Marcar ${produto.nome} como promocao`}
          >
            <Tag className="w-3.5 h-3.5" />
            Promocao
          </button>
        </div>
      </td>
      <td className="py-4 pr-6">
        <div className="flex flex-wrap justify-end gap-2">
          <span className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-[11px] font-bold ${produto.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            {produto.ativo ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {produto.ativo ? 'Visivel na loja' : 'Oculto na loja'}
          </span>
          {produto.esgotado && (
            <span
              className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700"
              title="Continua visivel na loja, mas o cliente nao consegue selecionar ou comprar"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Esgotado
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AdminVitrine({ token, onUnauthorized }: { token: string, onUnauthorized: () => void }) {
  const [produtos, setProdutos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedLayoutSignature, setSavedLayoutSignature] = useState('');
  const { showToast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const getLayoutSignature = (items: any[]) =>
    JSON.stringify(
      items.map((item, idx) => ({
        id: item._id,
        ordem: idx,
        destaque: !!item.destaque,
        promocao: !!item.promocao,
      }))
    );

  const fetchProdutos = async () => {
    try {
      const res = await fetch('/api/admin/produtos', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        onUnauthorized();
        return;
      }

      const data = await res.json();
      if (data.sucesso) {
        const sorted = data.produtos.sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
        setProdutos(sorted);
        setSavedLayoutSignature(getLayoutSignature(sorted));
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

  const hasPendingChanges = produtos.length > 0 && getLayoutSignature(produtos) !== savedLayoutSignature;

  const toggleField = (index: number, field: 'destaque' | 'promocao') => {
    const newProds = [...produtos];
    newProds[index] = { ...newProds[index], [field]: !newProds[index][field] };
    setProdutos(newProds);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setProdutos((items) => {
      const oldIndex = items.findIndex((i) => i._id === active.id);
      const newIndex = items.findIndex((i) => i._id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    try {
      const updates = produtos.map((p, idx) => ({
        id: p._id,
        ordem: idx,
        destaque: p.destaque,
        promocao: p.promocao,
      }));

      const res = await fetch('/api/admin/produtos/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ updates }),
      });

      const data = await res.json();
      if (data.sucesso) {
        setSavedLayoutSignature(getLayoutSignature(produtos));
        showToast('Exibicao salva com sucesso!', 'success');
        fetchProdutos();
      } else {
        throw new Error(data.erro);
      }
    } catch (e) {
      console.error(e);
      showToast('Erro ao atualizar exibicao', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Carregando exibicao...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
            <LayoutTemplate className="w-8 h-8 text-emerald-600" />
            Exibicao do Catalogo
          </h2>
          <p className="mt-1 text-gray-500">Aqui voce controla ordem, destaque comercial e sinais visuais de promocao para o cliente.</p>
        </div>

        <button
          onClick={handleSaveOrder}
          disabled={saving || !hasPendingChanges}
          className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-8 py-3.5 font-bold text-white transition-all hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-900/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Salvando...' : <><Save className="w-5 h-5" /> Salvar Exibicao</>}
        </button>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-900">Produtos, Categorias e Exibicao cumprem papeis diferentes.</p>
            <p className="text-sm text-gray-600">Produtos cuidam do cadastro, Categorias da estrutura do cardapio e Exibicao da ordem e dos destaques comerciais mostrados ao cliente.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2 text-gray-600">
              <GripVertical className="w-4 h-4 text-gray-400" />
              Arraste para mudar a ordem
            </span>
            <span className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 font-medium ${hasPendingChanges ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${hasPendingChanges ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
              {hasPendingChanges ? 'Ha alteracoes aguardando salvar' : 'Exibicao sincronizada'}
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto p-4 md:p-6">
          <table className="min-w-[860px] w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                <th className="pb-4 w-12"></th>
                <th className="pb-4 w-16 text-center">Ordem</th>
                <th className="pb-4">Produto na vitrine</th>
                <th className="pb-4 text-center">Destaques comerciais</th>
                <th className="pb-4 text-right pr-6">Visibilidade e compra</th>
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
              <SortableContext items={produtos.map((p) => p._id)} strategy={verticalListSortingStrategy}>
                <tbody className="divide-y divide-gray-100">
                  {produtos.map((produto, idx) => (
                    <SortableRow key={produto._id} produto={produto} idx={idx} toggleField={toggleField} />
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
