import React, { useState } from 'react';
import {
  Sparkles,
  Layers,
  ShoppingBag,
  GitFork,
  Package,
  ShieldCheck,
  Camera,
  AlertTriangle,
  FileSearch,
  Code2,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { CatalogLabDomainResponse, ComboProductPlan } from '../../../../lib/catalogImportDomain.js';
import { DomainNativeOverviewTab } from './DomainNativeOverviewTab.js';
import { DomainNativeProductsTab } from './DomainNativeProductsTab.js';
import { DomainNativeComplementsTab } from './DomainNativeComplementsTab.js';
import { DomainNativeCombosTab } from './DomainNativeCombosTab.js';
import { DomainNativeRulesTab } from './DomainNativeRulesTab.js';
import { DomainNativePhotosTab } from './DomainNativePhotosTab.js';
import { DomainNativeReviewQueueTab } from './DomainNativeReviewQueueTab.js';
import { DomainNativeEvidenceTab } from './DomainNativeEvidenceTab.js';
import { DomainNativeJsonTab } from './DomainNativeJsonTab.js';

export type DomainNativeTabKey =
  | 'overview'
  | 'products'
  | 'complements'
  | 'combos'
  | 'rules'
  | 'photos'
  | 'review'
  | 'evidence'
  | 'json';

interface DomainNativeLabViewProps {
  data: CatalogLabDomainResponse;
}

export const DomainNativeLabView: React.FC<DomainNativeLabViewProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<DomainNativeTabKey>('overview');

  const analysis = data.data;
  const { importPlan, sourceEvidence, reviewQueue } = analysis;
  const telemetry = data;
  const combos = (importPlan?.products || []).filter((p): p is ComboProductPlan => p.kind === 'combo');
  const productsCount = importPlan?.products?.length || 0;
  const groupsCount = importPlan?.complementGroups?.length || 0;
  const combosCount = combos.length;
  const photosCount = sourceEvidence?.photos?.length || 0;
  const rulesCount = sourceEvidence?.ruleBlocks?.length || 0;
  const candidatesCount = sourceEvidence?.productCandidates?.length || 0;

  const blockerCount = reviewQueue?.filter((i) => i.severity === 'blocker').length || 0;
  const isReady = blockerCount === 0;

  return (
    <div className="space-y-4">
      {/* Barra de Telemetria e Status Domain-Native */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-indigo-900 bg-indigo-200/80 px-2 py-0.5 rounded text-[10px]">
              <Sparkles className="h-3 w-3 text-indigo-700" />
              Pipeline: Domain-Native Contract (Padrão)
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">
              Requisições ao Modelo: {telemetry.modelRequestCount} (Única inferência)
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded text-[10px]">
              Transporte: {telemetry.inputTransport === 'signed_url' ? 'Signed URL (PDF)' : 'Inline base64 (Imagem)'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-slate-600">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-400" />
              Inferência: {(telemetry.inferenceTimeMs / 1000).toFixed(1)}s
            </span>
            <span>•</span>
            <span>Total: {(telemetry.executionTimeMs / 1000).toFixed(1)}s</span>
            {telemetry.usage && (
              <>
                <span>•</span>
                <span title="Tokens">
                  Tokens: {telemetry.usage.totalTokens ?? '-'} ({telemetry.usage.inputTokens ?? '-'} in / {telemetry.usage.outputTokens ?? '-'} out)
                </span>
              </>
            )}
            <span>•</span>
            <span className="font-semibold text-slate-700">{telemetry.model}</span>
          </div>
        </div>

        {/* Resumo de Contadores */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <ShoppingBag className="h-3 w-3 text-emerald-600" /> Produtos
            </span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{productsCount}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <GitFork className="h-3 w-3 text-indigo-600" /> Complementos
            </span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{groupsCount}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <Package className="h-3 w-3 text-teal-600" /> Combos
            </span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{combosCount}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <ShieldCheck className="h-3 w-3 text-amber-600" /> Regras
            </span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{rulesCount}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <Camera className="h-3 w-3 text-teal-600" /> Fotos
            </span>
            <span className="text-base font-bold text-teal-700 mt-0.5 block">{photosCount}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <FileSearch className="h-3 w-3 text-purple-600" /> Evidências
            </span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{candidatesCount}</span>
          </div>
          <div
            className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center"
            title={`${blockerCount} bloqueadores de importação`}
          >
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3 text-rose-600" /> Pendências
            </span>
            <span
              className={`text-base font-bold mt-0.5 block ${
                blockerCount > 0 ? 'text-rose-600 font-extrabold' : 'text-emerald-700'
              }`}
            >
              {reviewQueue?.length || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Navegação das 9 Abas */}
      <div className="border-b border-slate-200">
        <div className="flex flex-wrap gap-1 -mb-px">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 ${
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Visão Geral
            {isReady ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            ) : (
              <XCircle className="h-3 w-3 text-rose-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 ${
              activeTab === 'products'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5 text-emerald-600" />
            Produtos
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
              {productsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('complements')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 ${
              activeTab === 'complements'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <GitFork className="h-3.5 w-3.5 text-indigo-600" />
            Complementos
            <span className="rounded-full bg-indigo-100 px-1.5 py-0.2 text-[10px] font-bold text-indigo-800">
              {groupsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('combos')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 ${
              activeTab === 'combos'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Package className="h-3.5 w-3.5 text-teal-600" />
            Combos
            <span className="rounded-full bg-teal-100 px-1.5 py-0.2 text-[10px] font-bold text-teal-800">
              {combosCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 ${
              activeTab === 'rules'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
            Regras & Encomendas
            <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
              {rulesCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('photos')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 ${
              activeTab === 'photos'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Camera className="h-3.5 w-3.5 text-teal-600" />
            Fotos
            <span className="rounded-full bg-teal-100 px-1.5 py-0.2 text-[10px] font-bold text-teal-800">
              {photosCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('review')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 ${
              activeTab === 'review'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <AlertTriangle
              className={`h-3.5 w-3.5 ${blockerCount > 0 ? 'text-rose-600' : 'text-amber-500'}`}
            />
            Fila de Revisão
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                blockerCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {reviewQueue?.length || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('evidence')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 ${
              activeTab === 'evidence'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <FileSearch className="h-3.5 w-3.5 text-purple-600" />
            Evidências Fonte
            <span className="rounded-full bg-purple-100 px-1.5 py-0.2 text-[10px] font-bold text-purple-800">
              {candidatesCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('json')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 ${
              activeTab === 'json'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Code2 className="h-3.5 w-3.5 text-slate-700" />
            Técnico / JSON
          </button>
        </div>
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div className="pt-2">
        {activeTab === 'overview' && (
          <DomainNativeOverviewTab
            data={analysis}
            response={data}
            onNavigateTab={(tabKey) => setActiveTab(tabKey as DomainNativeTabKey)}
          />
        )}
        {activeTab === 'products' && (
          <DomainNativeProductsTab
            products={importPlan.products}
            categories={importPlan.categories}
            complementGroups={importPlan.complementGroups}
          />
        )}
        {activeTab === 'complements' && (
          <DomainNativeComplementsTab
            complementGroups={importPlan.complementGroups}
            products={importPlan.products}
            categories={importPlan.categories}
          />
        )}
        {activeTab === 'combos' && (
          <DomainNativeCombosTab
            combos={combos}
            allProducts={importPlan.products}
          />
        )}
        {activeTab === 'rules' && <DomainNativeRulesTab data={data} />}
        {activeTab === 'photos' && <DomainNativePhotosTab data={data} />}
        {activeTab === 'review' && <DomainNativeReviewQueueTab data={data} />}
        {activeTab === 'evidence' && <DomainNativeEvidenceTab data={data} />}
        {activeTab === 'json' && <DomainNativeJsonTab data={data} />}
      </div>
    </div>
  );
};
