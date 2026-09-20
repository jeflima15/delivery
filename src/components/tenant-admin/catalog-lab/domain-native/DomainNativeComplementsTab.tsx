import React, { useState } from 'react';
import type {
  ComplementGroupPlan,
  ProductPlan,
  CategoryPlan,
} from '../../../lib/catalogImportDomain';

interface DomainNativeComplementsTabProps {
  complementGroups: ComplementGroupPlan[];
  products: ProductPlan[];
  categories: CategoryPlan[];
}

export const DomainNativeComplementsTab: React.FC<DomainNativeComplementsTabProps> = ({
  complementGroups,
  products,
  categories,
}) => {
  const [filter, setFilter] = useState<'all' | 'embedded' | 'shared'>('all');

  const productMap = new Map(products.map((p) => [p.key, p]));
  const categoryMap = new Map(categories.map((c) => [c.key, c]));

  const filteredGroups = complementGroups.filter((g) => {
    if (filter === 'embedded') return g.placement.type === 'embedded_product';
    if (filter === 'shared') return g.placement.type === 'shared';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* FILTRO DE PLACEMENT */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              filter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Todos ({complementGroups.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('embedded')}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              filter === 'embedded'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Apenas Embedded ({complementGroups.filter((g) => g.placement.type === 'embedded_product').length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('shared')}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              filter === 'shared'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Apenas Compartilhados ({complementGroups.filter((g) => g.placement.type === 'shared').length})
          </button>
        </div>
      </div>

      {/* LISTA DE GRUPOS */}
      <div className="grid gap-4">
        {filteredGroups.map((group) => {
          let placementInfo: string;
          if (group.placement.type === 'embedded_product') {
            const targetProd = productMap.get(group.placement.productKey);
            placementInfo = `Embedded em produto exclusivo: ${targetProd ? targetProd.name : group.placement.productKey}`;
          } else {
            const targetProds = group.placement.productKeys.map((k) => productMap.get(k)?.name || k);
            const targetCats = group.placement.categoryKeys.map((k) => categoryMap.get(k)?.name || k);
            const parts: string[] = [];
            if (targetProds.length > 0) parts.push(`Produtos (${targetProds.length}): ${targetProds.join(', ')}`);
            if (targetCats.length > 0) parts.push(`Categorias (${targetCats.length}): ${targetCats.join(', ')}`);
            placementInfo = `Compartilhado: ${parts.join(' | ') || 'Nenhum alvo vinculado'}`;
          }

          return (
            <div
              key={group.key}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
                        group.placement.type === 'embedded_product'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-teal-100 text-teal-800'
                      }`}
                    >
                      {group.placement.type === 'embedded_product' ? 'Embedded' : 'Shared'}
                    </span>
                    <span className="text-xs font-mono text-slate-400">[{group.key}]</span>
                    <h4 className="font-bold text-slate-900 text-base">{group.name}</h4>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{placementInfo}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded px-2 py-1 font-semibold ${
                      group.required
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {group.required ? 'Obrigatório' : 'Opcional'}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-1 text-slate-700 font-medium">
                    Mín: {group.minimum} / Máx: {group.maximum}
                  </span>
                </div>
              </div>

              {/* TABELA DE OPÇÕES */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs bg-slate-50 rounded border border-slate-200">
                  <thead className="bg-slate-100 text-slate-600 text-[11px]">
                    <tr>
                      <th className="py-2 px-3">Opção</th>
                      <th className="py-2 px-3">Acréscimo (Delta)</th>
                      <th className="py-2 px-3">Máx por Item</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {group.options.map((opt) => (
                      <tr key={opt.key} className="bg-white hover:bg-slate-50/80">
                        <td className="py-2 px-3">
                          <span className="font-semibold text-slate-800">{opt.name}</span>
                          {opt.description && (
                            <span className="block text-[11px] text-slate-500">
                              {opt.description}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-medium">
                          {opt.priceDeltaCents === 0 ? (
                            <span className="text-slate-400">Grátis (+ R$ 0,00)</span>
                          ) : (
                            <span className="text-emerald-700 font-bold">
                              + R$ {(opt.priceDeltaCents / 100).toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {opt.maximumPerItem > 0 ? `Até ${opt.maximumPerItem} un.` : 'Ilimitado'}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              opt.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {opt.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
