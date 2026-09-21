import React from 'react';
import type {
  CatalogImportDomainAnalysis,
  CatalogLabDomainResponse,
} from '../../../../lib/catalogImportDomain.js';

interface DomainNativeOverviewTabProps {
  data: CatalogImportDomainAnalysis;
  response: CatalogLabDomainResponse;
  onNavigateTab: (tabKey: string) => void;
}

export const DomainNativeOverviewTab: React.FC<DomainNativeOverviewTabProps> = ({
  data,
  response,
  onNavigateTab,
}) => {
  const blockersCount = data.reviewQueue.filter((rq) => rq.severity === 'blocker').length;
  const warningsCount = data.reviewQueue.filter((rq) => rq.severity === 'warning').length;

  const regularProducts = data.importPlan.products.filter((p) => p.kind === 'product');
  const combos = data.importPlan.products.filter((p) => p.kind === 'combo');
  const exclusiveProducts = data.importPlan.products.filter((p) => p.exclusiveToCombo);
  const embeddedGroups = data.importPlan.complementGroups.filter(
    (g) => g.placement.type === 'embedded_product'
  );
  const sharedGroups = data.importPlan.complementGroups.filter(
    (g) => g.placement.type === 'shared'
  );

  return (
    <div className="space-y-6">
      {/* 1. BANNER DE STATUS DE SIMULAÇÃO */}
      {blockersCount > 0 ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white font-black text-sm">
              !
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-rose-900 text-base">
                {blockersCount} pendência{blockersCount > 1 ? 's' : ''} bloqueante
                {blockersCount > 1 ? 's' : ''} requer{blockersCount > 1 ? 'em' : ''} revisão
              </h3>
              <p className="mt-1 text-sm text-rose-800">
                O cardápio foi interpretado e modelado nas capacidades do Pode Vir, mas contém
                inconsistências que impedem uma importação direta (ex: preços ausentes ou regras
                não suportadas).
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab('review_queue')}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700"
                >
                  Ver Fila de Pendências ({blockersCount} blockers)
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : warningsCount > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white font-black text-sm">
              i
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-amber-900 text-base">
                Simulação concluída com {warningsCount} alerta{warningsCount > 1 ? 's' : ''}{' '}
                recomendado{warningsCount > 1 ? 's' : ''}
              </h3>
              <p className="mt-1 text-sm text-amber-800">
                Todas as entidades principais foram modeladas com sucesso. Há pontos não
                bloqueantes sugeridos para conferência visual.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white font-black text-sm">
              ✓
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-emerald-900 text-base">
                Pronto para simulação de importação (0 pendências)
              </h3>
              <p className="mt-1 text-sm text-emerald-800">
                O cardápio foi 100% interpretado e validado matematicamente contra as capacidades
                reais do Pode Vir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AVISO DE READ-ONLY */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <span className="font-bold text-slate-800">Modo de Simulação / Pré-visualização:</span> O
        Laboratório IA opera estritamente em modo de leitura. Nenhuma alteração foi persistida no
        banco de dados real do catálogo.
      </div>

      {/* 2. GRID DE ENTIDADES PROJETADAS */}
      <div>
        <h3 className="font-bold text-slate-900 text-sm mb-3">Entidades Projetadas no Domínio</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div
            onClick={() => onNavigateTab('products')}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
          >
            <div className="text-2xl font-black text-slate-900">
              {data.importPlan.categories.length}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Categorias</div>
          </div>

          <div
            onClick={() => onNavigateTab('products')}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
          >
            <div className="text-2xl font-black text-indigo-600">{regularProducts.length}</div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Produtos Comerciais</div>
          </div>

          <div
            onClick={() => onNavigateTab('combos')}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
          >
            <div className="text-2xl font-black text-violet-600">{combos.length}</div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Combos (Fixed/Stages)</div>
          </div>

          <div
            onClick={() => onNavigateTab('products')}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
          >
            <div className="text-2xl font-black text-blue-600">{exclusiveProducts.length}</div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Exclusivos de Combo</div>
          </div>

          <div
            onClick={() => onNavigateTab('complements')}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
          >
            <div className="text-2xl font-black text-emerald-600">{embeddedGroups.length}</div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Grupos Embedded</div>
          </div>

          <div
            onClick={() => onNavigateTab('complements')}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
          >
            <div className="text-2xl font-black text-teal-600">{sharedGroups.length}</div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Grupos Compartilhados</div>
          </div>

          <div
            onClick={() => onNavigateTab('photos')}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
          >
            <div className="text-2xl font-black text-amber-600">
              {data.importPlan.productImages.length}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Fotos Atribuídas</div>
          </div>

          <div
            onClick={() => onNavigateTab('review_queue')}
            className={`cursor-pointer rounded-xl border p-4 shadow-sm transition-colors ${
              blockersCount > 0
                ? 'border-rose-300 bg-rose-50/50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div
              className={`text-2xl font-black ${
                blockersCount > 0 ? 'text-rose-700' : 'text-slate-900'
              }`}
            >
              {data.reviewQueue.length}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">
              Pendências ({blockersCount} blockers)
            </div>
          </div>
        </div>
      </div>

      {/* 3. TELEMETRIA E EXECUÇÃO */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900 text-sm mb-3">Telemetria da Inferência Única</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block">Modelo Gemini</span>
            <span className="font-semibold text-slate-900">{response.model}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Requisições ao Modelo</span>
            <span className="font-semibold text-emerald-700">
              {response.modelRequestCount} (exatamente 1 inferência)
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Transporte de Entrada</span>
            <span className="font-semibold text-slate-900">
              {response.inputTransport === 'signed_url'
                ? 'Signed HTTPS URL (PDF)'
                : 'Base64 Inline (Imagem)'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Thinking Configurado</span>
            <span className="font-semibold text-purple-700">
              {(response.thinkingLevel || 'medium').toUpperCase()}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Seed Determinística</span>
            <span className="font-semibold text-slate-900">
              {response.seed ?? 424242}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Tempo Total / Inferência</span>
            <span className="font-semibold text-slate-900">
              {response.executionTimeMs} ms ({response.inferenceTimeMs} ms IA)
            </span>
          </div>
          <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-100 flex flex-wrap gap-4 text-slate-600">
            <span>
              Tokens de Entrada:{' '}
              <strong className="text-slate-900">
                {response.usage?.inputTokens !== undefined
                  ? response.usage.inputTokens.toLocaleString('pt-BR')
                  : 'não informado'}
              </strong>
            </span>
            <span>
              Tokens de Saída:{' '}
              <strong className="text-slate-900">
                {response.usage?.outputTokens !== undefined
                  ? response.usage.outputTokens.toLocaleString('pt-BR')
                  : 'não informado'}
              </strong>
            </span>
            <span>
              Tokens Totais:{' '}
              <strong className="text-slate-900">
                {response.usage?.totalTokens !== undefined
                  ? response.usage.totalTokens.toLocaleString('pt-BR')
                  : 'não informado'}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
