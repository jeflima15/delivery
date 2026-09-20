import React from 'react';
import type { CatalogLabDomainResponse } from '../../../../lib/catalogImportDomain.js';

interface DomainNativeRulesTabProps {
  data: CatalogLabDomainResponse;
}

export const DomainNativeRulesTab: React.FC<DomainNativeRulesTabProps> = ({ data }) => {
  const storePolicy = data.importPlan.storePolicy;
  const ruleBlocks = data.sourceEvidence.ruleBlocks || [];

  const getAvailabilityLabel = (avail: string | null) => {
    switch (avail) {
      case 'immediate_only':
        return 'Apenas Pronta Entrega';
      case 'scheduled_only':
        return 'Apenas Sob Encomenda';
      case 'both':
        return 'Pronta Entrega e Encomenda';
      case null:
      default:
        return 'Não especificado na fonte (null)';
    }
  };

  const getDayName = (day: number) => {
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return days[day] || `Dia ${day}`;
  };

  const formatLeadTime = (minutes: number | null) => {
    if (minutes === null || minutes === undefined) return 'Não informado';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (hours < 24) {
      return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days} dia(s)`;
  };

  return (
    <div className="space-y-6">
      {/* Resumo da Política de Loja */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          Política de Encomendas & Regras Estruturadas da Loja
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          Mapeamento determinístico das regras da fonte para as capacidades de políticas do Pode Vir.
        </p>

        {storePolicy ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Disponibilidade Padrão
              </span>
              <span className="text-sm font-bold text-slate-800">
                {getAvailabilityLabel(storePolicy.preorderPolicy.availability)}
              </span>
              <p className="text-xs text-slate-500 mt-2">
                Antecedência mínima:{' '}
                <strong className="text-slate-700">{formatLeadTime(storePolicy.preorderPolicy.minLeadMinutes)}</strong>
              </p>
              {storePolicy.preorderPolicy.notes && (
                <p className="text-xs text-slate-600 mt-2 italic bg-white p-2 rounded border border-slate-100">
                  &quot;{storePolicy.preorderPolicy.notes}&quot;
                </p>
              )}
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Sinal & Pagamento
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                    storePolicy.depositRequired ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {storePolicy.depositRequired ? 'Exige Sinal' : 'Não exige sinal prévio'}
                </span>
              </div>
              {storePolicy.depositPercentage !== null && storePolicy.depositPercentage !== undefined && (
                <p className="text-xs text-slate-600 mt-2">
                  Percentual de sinal:{' '}
                  <strong className="text-slate-800">{storePolicy.depositPercentage}%</strong>
                </p>
              )}
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Horários de Corte (Cutoff)
              </span>
              {storePolicy.cutoffTimes && storePolicy.cutoffTimes.length > 0 ? (
                <ul className="text-xs space-y-1 mt-1 text-slate-700">
                  {storePolicy.cutoffTimes.map((co, idx) => (
                    <li key={idx} className="flex justify-between border-b border-slate-100 pb-1">
                      <span>{getDayName(co.dayOfWeek)}</span>
                      <span className="font-mono font-bold text-slate-800">{co.cutoffTime}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 mt-1">Nenhum horário de corte específico detectado.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 text-slate-500 text-sm rounded-lg">
            Nenhuma política estruturada identificada na fonte.
          </div>
        )}

        {storePolicy?.generalNotes && storePolicy.generalNotes.length > 0 && (
          <div className="mt-6 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Observações Gerais de Operação
            </h4>
            <ul className="list-disc list-inside text-xs text-slate-600 space-y-1">
              {storePolicy.generalNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Blocos de Regras Brutas da Fonte (Source Evidence) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-md font-bold text-slate-800 mb-3 flex items-center justify-between">
          <span>Evidências de Regras na Fonte ({ruleBlocks.length})</span>
          <span className="text-xs font-normal text-slate-500">Extraídas diretamente do documento</span>
        </h3>

        {ruleBlocks.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm bg-slate-50 rounded-lg">
            Nenhum bloco de texto classificado como regra na fonte.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ruleBlocks.map((rb, idx) => (
              <div key={idx} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-slate-800">{rb.title || `Regra #${idx + 1}`}</span>
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-slate-200 text-slate-700">
                      {rb.category || 'geral'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed font-sans bg-white p-2.5 rounded border border-slate-100">
                    {rb.rawText}
                  </p>
                </div>
                {rb.appliesTo && rb.appliesTo.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                    Aplica-se a: <span className="text-slate-700 font-medium">{rb.appliesTo.join(', ')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
