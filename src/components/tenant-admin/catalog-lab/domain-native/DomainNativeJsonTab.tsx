import React, { useState } from 'react';
import type { CatalogLabDomainResponse } from '../../../../lib/catalogImportDomain.js';

interface DomainNativeJsonTabProps {
  data: CatalogLabDomainResponse;
}

export const DomainNativeJsonTab: React.FC<DomainNativeJsonTabProps> = ({ data }) => {
  const [selectedSection, setSelectedSection] = useState<'all' | 'plan' | 'evidence' | 'queue' | 'telemetry'>('all');
  const [copied, setCopied] = useState(false);

  const getContentToDisplay = () => {
    switch (selectedSection) {
      case 'plan':
        return data.data.importPlan;
      case 'evidence':
        return data.data.sourceEvidence;
      case 'queue':
        return data.data.reviewQueue;
      case 'telemetry':
        return {
          model: data.model,
          modelRequestCount: data.modelRequestCount,
          inputTransport: data.inputTransport,
          executionTimeMs: data.executionTimeMs,
          inferenceTimeMs: data.inferenceTimeMs,
          usage: data.usage,
        };
      case 'all':
      default:
        return data;
    }
  };

  const jsonString = JSON.stringify(getContentToDisplay(), null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Visualizador Técnico & JSON</h3>
          <p className="text-xs text-slate-500 mt-1">
            Inspeção detalhada de todos os nós do contrato Domain-Native e metadados de telemetria da inferência.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
          >
            {copied ? 'Copiado!' : 'Copiar JSON'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedSection('all')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg ${
            selectedSection === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Resposta Completa ({Math.round(JSON.stringify(data).length / 1024)} KB)
        </button>
        <button
          onClick={() => setSelectedSection('plan')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg ${
            selectedSection === 'plan' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Plano de Importação (importPlan)
        </button>
        <button
          onClick={() => setSelectedSection('evidence')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg ${
            selectedSection === 'evidence' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Evidências (sourceEvidence)
        </button>
        <button
          onClick={() => setSelectedSection('queue')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg ${
            selectedSection === 'queue' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Fila de Revisão ({data.data.reviewQueue?.length || 0})
        </button>
        <button
          onClick={() => setSelectedSection('telemetry')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg ${
            selectedSection === 'telemetry' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Telemetria
        </button>
      </div>

      <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto shadow-inner border border-slate-800">
        <pre className="text-xs font-mono text-emerald-400 whitespace-pre leading-relaxed">
          {jsonString}
        </pre>
      </div>
    </div>
  );
};
