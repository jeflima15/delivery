import React from 'react';
import type {
  ComboProductPlan,
  ProductPlan,
  FixedComboPlanConfig,
  StagedComboPlanConfig,
} from '../../../../lib/catalogImportDomain.js';

interface DomainNativeCombosTabProps {
  combos: ComboProductPlan[];
  allProducts: ProductPlan[];
}

export const DomainNativeCombosTab: React.FC<DomainNativeCombosTabProps> = ({
  combos,
  allProducts,
}) => {
  const productMap = new Map(allProducts.map((p) => [p.key, p]));

  if (combos.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 text-sm">
        Nenhum combo (fixo ou em etapas) foi identificado neste cardápio.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5">
        {combos.map((combo) => {
          const comboConfig = combo.combo;

          return (
            <div
              key={combo.key}
              className="rounded-xl border border-violet-200 bg-white p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block rounded-md bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
                      Combo {comboConfig.mode === 'fixed' ? 'Fixo' : 'em Etapas'}
                    </span>
                    <span className="text-xs font-mono text-slate-400">[{combo.key}]</span>
                    <h4 className="font-bold text-slate-900 text-base">{combo.name}</h4>
                  </div>
                  {combo.description && (
                    <p className="text-xs text-slate-600 mt-1">{combo.description}</p>
                  )}
                </div>

                <div className="text-right">
                  {comboConfig.comboBasePriceCents === null ? (
                    <span className="inline-block rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 border border-rose-300">
                      Preço base ausente (BLOCKER)
                    </span>
                  ) : (
                    <div>
                      <div className="text-lg font-black text-violet-900">
                        R$ {(comboConfig.comboBasePriceCents / 100).toFixed(2)}
                      </div>
                      {combo.startingPriceCents !== null &&
                        combo.startingPriceCents !== comboConfig.comboBasePriceCents && (
                          <span className="text-xs text-slate-500 font-medium block">
                            A partir de R$ {(combo.startingPriceCents / 100).toFixed(2)}
                          </span>
                        )}
                    </div>
                  )}
                </div>
              </div>

              {/* DETALHAMENTO DO MODO FIXO */}
              {comboConfig.mode === 'fixed' && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Itens Componentes Fixos:
                  </h5>
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/60">
                    {((comboConfig as FixedComboPlanConfig).items || []).map((item, idx) => {
                      const targetProd = productMap.get(item.productKey);
                      return (
                        <div
                          key={idx}
                          className="flex flex-wrap items-center justify-between p-3 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-800 bg-white border border-slate-200 rounded px-1.5 py-0.5">
                              {item.quantity}×
                            </span>
                            <span className="font-semibold text-slate-900">
                              {targetProd ? targetProd.name : item.productKey}
                            </span>
                            {targetProd?.exclusiveToCombo && (
                              <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                                Exclusivo de Combo
                              </span>
                            )}
                          </div>
                          <span className="text-slate-400 font-mono text-[11px]">
                            [{item.productKey}]
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* DETALHAMENTO DO MODO STAGES */}
              {comboConfig.mode === 'stages' && (
                <div className="space-y-3">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Etapas de Escolha (Stages):
                  </h5>
                  <div className="grid gap-3">
                    {((comboConfig as StagedComboPlanConfig).stages || []).map((stage) => (
                      <div
                        key={stage.key}
                        className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between font-bold text-slate-800">
                          <span>
                            {stage.order + 1}. {stage.name}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-600 font-normal">
                              Valor da etapa:{' '}
                              <strong>
                                {stage.stageValueCents === 0
                                  ? 'R$ 0,00'
                                  : `+ R$ ${(stage.stageValueCents / 100).toFixed(2)}`}
                              </strong>
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                stage.chargeComplements
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {stage.chargeComplements
                                ? 'Cobra complementos'
                                : 'Complementos inclusos'}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1 pl-2 border-l-2 border-slate-200">
                          {stage.options.map((opt) => {
                            const targetProd = productMap.get(opt.productKey);
                            return (
                              <div
                                key={opt.productKey}
                                className="flex items-center justify-between text-[11px] text-slate-700"
                              >
                                <span>
                                  • {targetProd ? targetProd.name : opt.productKey}
                                  {targetProd?.exclusiveToCombo && (
                                    <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.2 text-[9px] font-bold text-blue-800">
                                      Exclusivo
                                    </span>
                                  )}
                                </span>
                                <span>
                                  {opt.extraCents > 0
                                    ? `+ R$ ${(opt.extraCents / 100).toFixed(2)}`
                                    : 'Sem acréscimo'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
