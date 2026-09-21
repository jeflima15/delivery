import React, { useState } from 'react';
import {
  Split,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';
import type {
  CatalogLabDomainResponse,
  ReviewQueueItem,
  ModelingChoiceType,
} from '../../../../lib/catalogImportDomain.js';

interface DomainNativeReviewQueueTabProps {
  data: CatalogLabDomainResponse;
}

export const DomainNativeReviewQueueTab: React.FC<DomainNativeReviewQueueTabProps> = ({ data }) => {
  const reviewQueue = data.data.reviewQueue || [];
  const modelingChoices = data.data.modelingChoices || [];

  const [activeSection, setActiveSection] = useState<'all' | 'choices' | 'issues'>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterProvenance, setFilterProvenance] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredIssues = reviewQueue.filter((item) => {
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

  const filteredChoices = modelingChoices.filter((item) => {
    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchStrategy = item.recommendedStrategy.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchStrategy) return false;
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

  const getChoiceTypeLabel = (type: ModelingChoiceType) => {
    switch (type) {
      case 'product_option_boundary':
        return 'Fronteira Produto vs Opções';
      case 'configuration_structure':
        return 'Estrutura de Configuração';
      case 'shared_group_scope':
        return 'Escopo de Grupo Compartilhado';
      case 'category_structure':
        return 'Estrutura de Categorias';
      default:
        return 'Decisão de Organização';
    }
  };

  const blockerCount = reviewQueue.filter((i) => i.severity === 'blocker').length;
  const warningCount = reviewQueue.filter((i) => i.severity === 'warning').length;

  return (
    <div className="space-y-6">
      {/* Resumo Consolidado e Seletor de Visão */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span>Revisão & Decisões de Modelagem</span>
              <span className="text-sm font-mono font-normal text-slate-500">
                ({modelingChoices.length} decisões • {reviewQueue.length} pendências)
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Separação estrutural entre decisões legítimas de organização (não bloqueantes) e pendências reais de domínio.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
              <Split className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-xs font-bold text-indigo-900">{modelingChoices.length} Decisões</span>
            </div>
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

        {/* Barra de Alternância de Seção e Busca */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              type="button"
              onClick={() => setActiveSection('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeSection === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Visão Completa ({modelingChoices.length + reviewQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('choices')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeSection === 'choices'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
              }`}
            >
              <Split className="w-3 h-3" />
              Decisões de Modelagem ({modelingChoices.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('issues')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeSection === 'issues'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              Pendências & Bloqueadores ({reviewQueue.length})
            </button>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Buscar em decisões e pendências..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* 1. SEÇÃO DE DECISÕES DE MODELAGEM (MODELING CHOICES) */}
      {(activeSection === 'all' || activeSection === 'choices') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Split className="h-4 w-4 text-indigo-600" />
              <span>Decisões de Modelagem Legítimas</span>
              <span className="text-xs font-normal text-slate-500">
                (Mais de uma representação digital válida preserva a fonte)
              </span>
            </h4>
            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              Não Bloqueia Importação
            </span>
          </div>

          {filteredChoices.length === 0 ? (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-500">
              {modelingChoices.length === 0
                ? 'Nenhuma decisão concorrente identificada: o documento foi mapeado diretamente para uma única estrutura canônica recomendada.'
                : 'Nenhuma decisão de modelagem corresponde ao termo de busca.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredChoices.map((choice) => (
                <div
                  key={choice.key}
                  className="bg-white rounded-xl border border-indigo-200 p-5 shadow-sm space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                        {getChoiceTypeLabel(choice.type)}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Recomendação Aplicada no Plano
                      </span>
                      {choice.affectedEvidenceKeys.length > 0 && (
                        <span className="text-xs text-slate-500">
                          Evidências:{' '}
                          <strong className="text-slate-700 font-mono">
                            {choice.affectedEvidenceKeys.join(', ')}
                          </strong>
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">ID: {choice.key}</span>
                  </div>

                  <div>
                    <h5 className="text-sm font-bold text-slate-900">{choice.title}</h5>
                    <p className="text-xs text-slate-600 mt-1">{choice.description}</p>
                  </div>

                  {/* Estratégia Recomendada vs Alternativas */}
                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-slate-800">Estratégia Recomendada: </span>
                        <span className="text-indigo-900 font-medium">{choice.recommendedStrategy}</span>
                      </div>
                    </div>

                    {choice.alternatives.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/60">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1.5">
                          Alternativas Válidas Reconhecidas:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {choice.alternatives.map((alt, aIdx) => (
                            <div
                              key={aIdx}
                              className="rounded bg-white p-2.5 border border-slate-200 shadow-xs"
                            >
                              <div className="font-semibold text-slate-800 text-[11px] flex items-center gap-1">
                                <Lightbulb className="w-3 h-3 text-amber-500 shrink-0" />
                                {alt.label}
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5">{alt.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. SEÇÃO DE PENDÊNCIAS E BLOQUEADORES */}
      {(activeSection === 'all' || activeSection === 'issues') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>Pendências de Validação & Bloqueadores</span>
              <span className="text-xs font-normal text-slate-500">
                (Inconformidades de domínio apuradas pela IA e pelo validador determinístico)
              </span>
            </h4>
            <div className="flex items-center gap-2">
              <select
                aria-label="Filtrar por severidade"
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="text-xs font-medium border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
              >
                <option value="all">Todas as Severidades</option>
                <option value="blocker">Apenas Bloqueadores ({blockerCount})</option>
                <option value="warning">Apenas Avisos ({warningCount})</option>
              </select>

              <select
                aria-label="Filtrar por origem"
                value={filterProvenance}
                onChange={(e) => setFilterProvenance(e.target.value)}
                className="text-xs font-medium border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
              >
                <option value="all">Todas as Origens</option>
                <option value="deterministic">Validador Determinístico</option>
                <option value="model">IA (Gemini)</option>
                <option value="both">Ambos (Convergência)</option>
              </select>
            </div>
          </div>

          {filteredIssues.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
              Nenhuma pendência encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIssues.map((item) => (
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
      )}
    </div>
  );
};
