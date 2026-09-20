import React, { useState } from 'react';
import type { CatalogLabDomainResponse } from '../../../../lib/catalogImportDomain.js';

interface DomainNativeEvidenceTabProps {
  data: CatalogLabDomainResponse;
}

export const DomainNativeEvidenceTab: React.FC<DomainNativeEvidenceTabProps> = ({ data }) => {
  const { sourceEvidence } = data.data;
  const [activeSubTab, setActiveSubTab] = useState<'candidates' | 'pricing' | 'combos' | 'residuals'>('candidates');

  const candidates = sourceEvidence.productCandidates || [];
  const pricingObs = sourceEvidence.pricingObservations || [];
  const comboEv = sourceEvidence.comboEvidence || [];
  const residuals = sourceEvidence.residualTexts || [];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800">
          Evidências Puras da Fonte (Source Evidence)
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          A primeira camada da inferência multimodal: transcrição e observações brutas do documento, sem viés ou imposição de catálogo.
        </p>

        {/* Sub-abas */}
        <div className="flex gap-2 mt-4 border-b border-slate-100 pb-2">
          <button
            onClick={() => setActiveSubTab('candidates')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'candidates'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Candidatos Brutos ({candidates.length})
          </button>
          <button
            onClick={() => setActiveSubTab('pricing')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'pricing'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Observações de Preço ({pricingObs.length})
          </button>
          <button
            onClick={() => setActiveSubTab('combos')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'combos'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Evidências de Combos ({comboEv.length})
          </button>
          <button
            onClick={() => setActiveSubTab('residuals')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'residuals'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Textos Residuais ({residuals.length})
          </button>
        </div>
      </div>

      {/* Conteúdo das Sub-abas */}
      {activeSubTab === 'candidates' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h4 className="text-sm font-bold text-slate-800 mb-4">
            Candidatos a Produto Detectados na Fonte ({candidates.length})
          </h4>
          {candidates.length === 0 ? (
            <p className="text-slate-400 text-xs">Nenhum candidato registrado.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {candidates.map((c, idx) => (
                <div key={c.candidateKey || idx} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-slate-800">{c.name}</span>
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                        Páginas: {c.sourcePages.join(', ')}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-3">{c.description}</p>
                    )}
                    {c.categoryHint && (
                      <span className="text-[10px] text-slate-500 block mt-2">
                        Categoria sugerida: <strong className="text-slate-700">{c.categoryHint}</strong>
                      </span>
                    )}
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Preços na fonte:</span>
                    <span className="font-mono font-bold text-slate-700">
                      {c.prices.map((p) => p.rawText).join(' | ') || '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'pricing' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h4 className="text-sm font-bold text-slate-800 mb-4">
            Padrões & Observações de Preço na Fonte ({pricingObs.length})
          </h4>
          {pricingObs.length === 0 ? (
            <p className="text-slate-400 text-xs">Nenhuma observação de preço registrada.</p>
          ) : (
            <div className="space-y-3">
              {pricingObs.map((po, idx) => (
                <div key={po.observationKey || idx} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Candidato: {po.candidateKey}</span>
                    <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-indigo-100 text-indigo-800">
                      R$ {(po.amountCents / 100).toFixed(2)}
                    </span>
                  </div>
                  {po.selectors && po.selectors.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {po.selectors.map((s, sIdx) => (
                        <span key={sIdx} className="text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-700">
                          {s.groupKey}: <strong>{s.optionKey}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                  {po.rawText && <p className="text-xs text-slate-500 mt-2 italic">&quot;{po.rawText}&quot;</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'combos' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h4 className="text-sm font-bold text-slate-800 mb-4">
            Evidências Estruturadas de Combos na Fonte ({comboEv.length})
          </h4>
          {comboEv.length === 0 ? (
            <p className="text-slate-400 text-xs">Nenhuma evidência de combo na fonte.</p>
          ) : (
            <div className="space-y-4">
              {comboEv.map((ce, idx) => (
                <div key={ce.comboKey || idx} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{ce.rawTitle}</span>
                    <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-amber-100 text-amber-800">
                      {ce.observedPriceCents !== null ? `R$ ${(ce.observedPriceCents / 100).toFixed(2)}` : 'Preço indefinido'}
                    </span>
                  </div>
                  {ce.rawDescription && (
                    <p className="text-xs text-slate-600 mt-1">{ce.rawDescription}</p>
                  )}
                  {ce.components && ce.components.length > 0 && (
                    <div className="mt-2 text-xs text-slate-700">
                      <span className="font-semibold text-slate-500">Componentes detectados:</span>
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        {ce.components.map((comp, cIdx) => (
                          <li key={cIdx}>
                            {comp.quantity}x {comp.name} {comp.isFixed ? '(Fixo)' : '(Etapa)'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ce.rawText && (
                    <p className="text-xs text-slate-500 mt-2 italic">&quot;{ce.rawText}&quot;</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'residuals' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h4 className="text-sm font-bold text-slate-800 mb-4">
            Textos Residuais Não Mapeados ({residuals.length})
          </h4>
          {residuals.length === 0 ? (
            <p className="text-slate-400 text-xs">Nenhum texto residual detectado. Cobertura documental excelente!</p>
          ) : (
            <div className="space-y-2">
              {residuals.map((r, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs flex justify-between items-center">
                  <span className="text-slate-700 font-sans">&quot;{r.text}&quot;</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                      Pág. {r.sourcePage}
                    </span>
                    {r.probableRole && (
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                        {r.probableRole}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
