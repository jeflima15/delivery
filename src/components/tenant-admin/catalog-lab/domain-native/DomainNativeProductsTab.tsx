import React, { useState } from 'react';
import type {
  ProductPlan,
  CategoryPlan,
  ComplementGroupPlan,
  RegularProductPlan,
  ComboProductPlan,
} from '../../../../lib/catalogImportDomain.js';

interface DomainNativeProductsTabProps {
  products: ProductPlan[];
  categories: CategoryPlan[];
  complementGroups: ComplementGroupPlan[];
}

export const DomainNativeProductsTab: React.FC<DomainNativeProductsTabProps> = ({
  products,
  categories,
  complementGroups,
}) => {
  const [filter, setFilter] = useState<'all' | 'products' | 'combos' | 'exclusive' | 'missing_price'>('all');

  const categoryMap = new Map(categories.map((c) => [c.key, c]));

  // Mapa de grupos vinculados a cada produto (embedded ou shared)
  const productGroupsMap = new Map<string, ComplementGroupPlan[]>();
  for (const group of complementGroups) {
    if (group.placement.type === 'embedded_product') {
      const pKey = group.placement.productKey;
      const list = productGroupsMap.get(pKey) || [];
      list.push(group);
      productGroupsMap.set(pKey, list);
    } else if (group.placement.type === 'shared') {
      for (const pKey of group.placement.productKeys) {
        const list = productGroupsMap.get(pKey) || [];
        list.push(group);
        productGroupsMap.set(pKey, list);
      }
    }
  }

  const filteredProducts = products.filter((p) => {
    if (filter === 'products') return p.kind === 'product';
    if (filter === 'combos') return p.kind === 'combo';
    if (filter === 'exclusive') return p.exclusiveToCombo;
    if (filter === 'missing_price') {
      if (p.kind === 'product') {
        return (p as RegularProductPlan).basePriceCents === null;
      }
      return (p as ComboProductPlan).combo.comboBasePriceCents === null;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* BARRA DE FILTROS */}
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
            Todos ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('products')}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              filter === 'products'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Apenas Produtos ({products.filter((p) => p.kind === 'product').length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('combos')}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              filter === 'combos'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Apenas Combos ({products.filter((p) => p.kind === 'combo').length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('exclusive')}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              filter === 'exclusive'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Exclusivos de Combo ({products.filter((p) => p.exclusiveToCombo).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('missing_price')}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              filter === 'missing_price'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
          >
            Preço Ausente (
            {
              products.filter((p) =>
                p.kind === 'product'
                  ? (p as RegularProductPlan).basePriceCents === null
                  : (p as ComboProductPlan).combo.comboBasePriceCents === null
              ).length
            }
            )
          </button>
        </div>
      </div>

      {/* LISTA DE PRODUTOS */}
      <div className="grid gap-4">
        {filteredProducts.map((prod) => {
          const category = prod.categoryKey ? categoryMap.get(prod.categoryKey) : null;
          const linkedGroups = productGroupsMap.get(prod.key) || [];

          return (
            <div
              key={prod.key}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
                        prod.kind === 'combo'
                          ? 'bg-violet-100 text-violet-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {prod.kind === 'combo' ? 'Combo' : 'Produto'}
                    </span>
                    <span className="text-xs font-mono text-slate-400">[{prod.key}]</span>
                    {prod.exclusiveToCombo && (
                      <span className="inline-block rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                        Exclusivo de Combo
                      </span>
                    )}
                    {category ? (
                      <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        Categoria: {category.name}
                      </span>
                    ) : (
                      <span className="inline-block rounded-md bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-400 italic">
                        Sem categoria vinculada (null)
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-bold text-slate-900 mt-1">{prod.name}</h4>
                  {prod.description && (
                    <p className="text-xs text-slate-600 mt-1">{prod.description}</p>
                  )}
                </div>

                {/* PREÇO E PROVENIÊNCIA */}
                <div className="text-right">
                  {prod.kind === 'product' ? (
                    (() => {
                      const reg = prod as RegularProductPlan;
                      if (reg.priceOrigin === 'technical_zero_exclusive_combo') {
                        return (
                          <div className="space-y-1">
                            <span className="inline-block rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800 border border-slate-300">
                              Preço técnico R$ 0,00
                            </span>
                            <p className="text-[11px] text-slate-500 max-w-xs leading-tight">
                              Componente exclusivo de combo; não vendido avulso e não utilizado no
                              cálculo deste combo.
                            </p>
                          </div>
                        );
                      }
                      if (reg.basePriceCents === null) {
                        return (
                          <span className="inline-block rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 border border-rose-300">
                            Preço ausente no documento (BLOCKER)
                          </span>
                        );
                      }
                      return (
                        <div>
                          <div className="text-lg font-black text-slate-900">
                            R$ {(reg.basePriceCents / 100).toFixed(2)}
                          </div>
                          <span className="text-[10px] uppercase font-semibold text-slate-400">
                            origem: {reg.priceOrigin}
                          </span>
                        </div>
                      );
                    })()
                  ) : (
                    (() => {
                      const combo = prod as ComboProductPlan;
                      const base = combo.combo.comboBasePriceCents;
                      if (base === null) {
                        return (
                          <span className="inline-block rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 border border-rose-300">
                            Preço ausente no documento (BLOCKER)
                          </span>
                        );
                      }
                      return (
                        <div>
                          <div className="text-lg font-black text-violet-700">
                            R$ {(base / 100).toFixed(2)}
                          </div>
                          {combo.startingPriceCents !== null &&
                            combo.startingPriceCents !== base && (
                              <span className="text-[11px] text-slate-500 block">
                                A partir de R$ {(combo.startingPriceCents / 100).toFixed(2)}
                              </span>
                            )}
                          <span className="text-[10px] uppercase font-semibold text-slate-400">
                            modo: {combo.combo.mode}
                          </span>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>

              {/* REGRAS DE ANTECEDÊNCIA DO PRODUTO */}
              {prod.preorderPolicy && (
                <div className="rounded-lg bg-amber-50/60 border border-amber-200/80 p-3 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">Política de Encomenda:</span>
                    <span>
                      {prod.preorderPolicy.minLeadMinutes !== null
                        ? `Antecedência mínima de ${prod.preorderPolicy.minLeadMinutes} min (${(
                            prod.preorderPolicy.minLeadMinutes / 60
                          ).toFixed(1)}h)`
                        : 'Antecedência herdada'}
                    </span>
                  </div>
                  {prod.preorderPolicy.availability && (
                    <span className="font-semibold bg-amber-100 px-2 py-0.5 rounded text-[11px]">
                      Modo: {prod.preorderPolicy.availability}
                    </span>
                  )}
                </div>
              )}

              {/* TABELA DE RECONSTRUÇÃO DE DELTAS (TAMANHOS / PACOTES) */}
              {prod.kind === 'product' &&
                (prod as RegularProductPlan).basePriceCents !== null &&
                linkedGroups.some((g) => g.options.some((o) => o.priceDeltaCents > 0)) && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-2">
                    <div className="font-bold text-slate-800 flex items-center justify-between">
                      <span>Tabela de Reconstrução de Preços (Base + Deltas de Opções):</span>
                      <span className="text-slate-500 font-normal text-[11px]">
                        Base canônica: R$ {(((prod as RegularProductPlan).basePriceCents || 0) / 100).toFixed(2)}
                      </span>
                    </div>
                    {linkedGroups.map((group) => {
                      const basePrice = (prod as RegularProductPlan).basePriceCents || 0;
                      return (
                        <div key={group.key} className="space-y-1">
                          <div className="font-semibold text-slate-700 text-[11px]">
                            Grupo: {group.name} ({group.placement.type})
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs bg-white rounded border border-slate-200">
                              <thead className="bg-slate-100 text-slate-600 text-[11px]">
                                <tr>
                                  <th className="py-1.5 px-3">Opção</th>
                                  <th className="py-1.5 px-3">Acréscimo Delta</th>
                                  <th className="py-1.5 px-3 font-bold text-slate-900">
                                    Preço Total Reconstruído
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.options.map((opt) => (
                                  <tr key={opt.key}>
                                    <td className="py-1.5 px-3 font-medium text-slate-800">
                                      {opt.name}
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-600">
                                      {opt.priceDeltaCents === 0
                                        ? '+ R$ 0,00'
                                        : `+ R$ ${(opt.priceDeltaCents / 100).toFixed(2)}`}
                                    </td>
                                    <td className="py-1.5 px-3 font-bold text-emerald-700">
                                      R$ {((basePrice + opt.priceDeltaCents) / 100).toFixed(2)}
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
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
