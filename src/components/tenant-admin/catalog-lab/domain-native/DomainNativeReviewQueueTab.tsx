import React, { useState } from 'react';
import type { CatalogLabDomainResponse, ReviewQueueItem } from '../../../../lib/catalogImportDomain.js';

interface DomainNativeReviewQueueTabProps {
  data: CatalogLabDomainResponse;
}

export const DomainNativeReviewQueueTab: React.FC<DomainNativeReviewQueueTabProps> = ({ data }) => {
  const reviewQueue = data.data.reviewQueue || [];
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterProvenance, setFilterProvenance] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredItems = reviewQueue.filter((item) => {
    if (filterSeverity !== 'all' && item.severity !== filterSeverity) return false;
    if (filterProvenance !== 'all' && item.provenance !== filterProvenance) return false;
    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchEntity = item.affectedEntityKeys.some((k) => k.toLowerCase().includes(q));
      if (!matchTitle && !matchDesc && !matchEntity) return false;
    }
    return true;
  });

  const getSeverityBadge = (severity: ReviewQueueItem['severity']) => {
    switch (severity) {
      case 'blocker':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            Bloqueador
          </span>
        );
      case 'warning':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            Aviso
          </span>
        );
      default:
        return null;
    }
  };

  const getProvenanceBadge = (provenance: ReviewQueueItem['provenance']) => {
    switch (provenance) {
      case 'both':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            IA + Validador
          </span>
        );
      case 'deterministic':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Validador Determinístico
          </span>
        );
      case 'model':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
            IA (Gemini)
          </span>
        );
      default:
        return null;
    }
  };

  const blockerCount = reviewQueue.filter((i) => i.severity === 'blocker').length;
  const warningCount = reviewQueue.filter((i) => i.severity === 'warning').length;

  return (
    <div className="space-y-6">
      {/* Resumo e Contadores */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span>Fila Unificada de Revisão & Pendências</span>
              <span className="text-sm font-mono font-normal text-slate-500">({reviewQueue.length} itens)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Deduplicação estrutural entre observações do modelo multimodal e validações determinísticas de domínio do Pode Vir.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
              <span className="w-2 h-2 rounded-full bg-rose-600"></span>
              <span className="text-xs font-bold text-rose-800">{blockerCount} Bloqueadores</span>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-600"></span>
              <span className="text-xs font-bold text-amber-800">{warningCount} Avisos</span>
            </div>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              aria-label="Filtrar por severidade"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
            >
              <option value="all">Todas as Severidades</option>
              <option value="blocker">Apenas Bloqueadores ({blockerCount})</option>
              <option value="warning">Apenas Avisos ({warningCount})</option>
            </select>

            <select
              aria-label="Filtrar por origem"
              value={filterProvenance}
              onChange={(e) => setFilterProvenance(e.target.value)}
              className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
            >
              <option value="all">Todas as Origens</option>
              <option value="deterministic">Validador Determinístico</option>
              <option value="model">IA (Gemini)</option>
              <option value="both">Ambos (Convergência)</option>
            </select>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="Buscar em pendências..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Lista de Itens da Fila */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
          Nenhuma pendência encontrada para os filtros selecionados.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <div
              key={item.key}
              className={`bg-white rounded-xl border p-5 shadow-sm transition-all ${
                item.severity === 'blocker'
                  ? 'border-rose-300 bg-rose-50/20'
                  : 'border-amber-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {getSeverityBadge(item.severity)}
                  {getProvenanceBadge(item.provenance)}
                  <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {item.type}
                  </span>
                  {item.affectedEntityKeys.length > 0 && (
                    <span className="text-xs text-slate-500">
                      Entidades: <strong className="text-slate-700">{item.affectedEntityKeys.join(', ')}</strong>
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px] text-slate-400">Chave: {item.key}</span>
              </div>

              <p className="text-sm font-semibold text-slate-800 mt-2">{item.title}</p>
              <p className="text-xs text-slate-600 mt-1">{item.description}</p>

              {item.possibleResolutions.length > 0 && (
                <div className="mt-2.5 p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                  <span className="font-semibold text-slate-500 uppercase text-[10px] block mb-0.5">
                    Resoluções Sugeridas:
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {item.possibleResolutions.map((res, idx) => (
                      <li key={idx}>{res}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
