import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Sparkles,
  UploadCloud,
  FileImage,
  AlertTriangle,
  Copy,
  Check,
  RotateCcw,
  Clock,
  Layers,
  ShoppingBag,
  Tag,
  FileText,
  AlertCircle,
  Eye,
  Camera,
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  HelpCircle,
  GitFork,
  Package,
  FolderTree,
  ListTree,
  Filter,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  FileSearch,
  Bookmark,
  Compass,
  Zap,
} from 'lucide-react';
import {
  TenantAdminApi,
  type CatalogLabResponse,
  type CatalogLabLegacyResponse,
  type CatalogLabV4Response,
  type CatalogLabPipeline,
  type ItemKind,
  type PhotoRelation,
  type VisualItem,
  type SemanticItemAssignment,
  type SemanticGroup,
  type BusinessRuleType,
  type IgnoredTextReason,
  type AuditIssueSeverity,
  type AuditIssueType,
  type UnifiedProduct,
  type UnifiedPhoto,
} from './api';
import { boxToPercent, cropImageToDataUrl, type BoundingBox } from '../../lib/cropBox';
import {
  isCatalogPhotoCandidate,
  extractPdfCrops,
  type PdfPhotoCandidateItem,
} from '../../lib/pdfCrop';
import { supabase } from '../../lib/supabase';

interface AdminCatalogLabProps {
  slug: string;
}

const MAX_IMAGE_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MiB
const MAX_PDF_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MiB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

type LabTab = 'items' | 'structure' | 'photos' | 'overlay' | 'audit' | 'json';
type PhotoFilter = 'all' | 'with_photo' | 'without_photo' | 'ambiguous' | 'review' | 'products' | 'combos' | 'addons' | 'options';
type FeedbackVote = 'correct' | 'wrong' | 'uncertain';

export const AUDIT_ISSUE_TYPE_LABELS: Record<AuditIssueType, { label: string; tone: string }> = {
  missing_product: { label: 'Produto comercial ausente', tone: 'bg-rose-100 text-rose-800 border-rose-200' },
  missing_choice_group: { label: 'Grupo de escolhas ausente', tone: 'bg-amber-100 text-amber-900 border-amber-200' },
  missing_option: { label: 'Opção/sabor ausente', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  missing_rule: { label: 'Regra comercial ausente', tone: 'bg-rose-100 text-rose-900 border-rose-200' },
  missing_price: { label: 'Preço ausente', tone: 'bg-orange-100 text-orange-900 border-orange-200' },
  wrong_category: { label: 'Classificação inadequada', tone: 'bg-purple-100 text-purple-900 border-purple-200' },
  missing_related_page: { label: 'Página relacionada ausente', tone: 'bg-blue-100 text-blue-900 border-blue-200' },
  photo_candidate_gap: { label: 'Página de foto omitida', tone: 'bg-teal-100 text-teal-900 border-teal-200' },
  possible_noise: { label: 'Possível ruído em produto', tone: 'bg-slate-100 text-slate-800 border-slate-200' },
  overpromoted_product: { label: 'Opção/adicional promovido a produto', tone: 'bg-indigo-100 text-indigo-900 border-indigo-200' },
  fragmented_product_family: { label: 'Tabela/família de produto fragmentada', tone: 'bg-violet-100 text-violet-900 border-violet-200' },
  unsupported_domain_rule: { label: 'Regra fora do domínio suportado', tone: 'bg-amber-100 text-amber-900 border-amber-200' },
  other: { label: 'Outro apontamento', tone: 'bg-gray-100 text-gray-800 border-gray-200' },
};

export const AUDIT_SEVERITY_META: Record<AuditIssueSeverity, { label: string; badge: string }> = {
  high: { label: 'Alta Severidade', badge: 'bg-rose-600 text-white' },
  medium: { label: 'Média Severidade', badge: 'bg-amber-500 text-white' },
  low: { label: 'Baixa Severidade', badge: 'bg-blue-500 text-white' },
};

interface FlatItemEntry {
  itemKey: string;
  categoryIndex: number;
  productIndex: number;
  categoryName: string | null;
  product: {
    name: string;
    sourcePage?: number | null;
    description: string | null;
    prices: Array<{
      label: string | null;
      amountCents: number | null;
      prefix: string | null;
      unit: string | null;
      rawText: string;
    }>;
    warnings: string[];
  };
  visualItem?: VisualItem;
}

const KIND_LABELS: Record<ItemKind, { label: string; tone: string }> = {
  product: { label: 'Produto', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  combo: { label: 'Combo', tone: 'bg-teal-100 text-teal-800 border-teal-200' },
  addon: { label: 'Adicional', tone: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  option: { label: 'Opção', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  informational: { label: 'Informativo', tone: 'bg-slate-100 text-slate-800 border-slate-200' },
  unknown: { label: 'Desconhecido', tone: 'bg-gray-100 text-gray-700 border-gray-200' },
};

const BUSINESS_RULE_LABELS: Record<BusinessRuleType, { label: string; tone: string }> = {
  minimum_order: { label: 'Pedido mínimo', tone: 'bg-amber-100 text-amber-900 border-amber-200' },
  advance_notice: { label: 'Antecedência', tone: 'bg-blue-100 text-blue-900 border-blue-200' },
  serving_guidance: { label: 'Recomendação / Rendimento', tone: 'bg-indigo-100 text-indigo-900 border-indigo-200' },
  packaging: { label: 'Embalagem / Forminhas', tone: 'bg-purple-100 text-purple-900 border-purple-200' },
  customer_supplied_material: { label: 'Material fornecido', tone: 'bg-slate-100 text-slate-800 border-slate-200' },
  product_specification: { label: 'Especificação do produto', tone: 'bg-teal-100 text-teal-900 border-teal-200' },
  ordering_instruction: { label: 'Instrução de pedido', tone: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  other: { label: 'Outra regra', tone: 'bg-gray-100 text-gray-800 border-gray-200' },
};

const IGNORED_TEXT_REASONS: Record<IgnoredTextReason, { label: string; tone: string }> = {
  placeholder: { label: 'Placeholder / Template', tone: 'bg-rose-100 text-rose-800 border-rose-200' },
  marketing: { label: 'Slogan / Marketing', tone: 'bg-blue-100 text-blue-800 border-blue-200' },
  contact: { label: 'Contato / Redes', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  decorative: { label: 'Texto decorativo', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  duplicate: { label: 'Duplicado', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  irrelevant: { label: 'Irrelevante', tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  other: { label: 'Outro', tone: 'bg-gray-100 text-gray-700 border-gray-200' },
};

export const PHOTO_RELATION_LABELS: Record<PhotoRelation, { label: string; tone: string }> = {
  direct: {
    label: 'Foto correspondente',
    tone: 'bg-emerald-600/90 text-white',
  },
  shared: {
    label: 'Foto compartilhada',
    tone: 'bg-blue-600/90 text-white',
  },
  ambiguous: {
    label: 'Foto ambígua',
    tone: 'bg-amber-600/90 text-white',
  },
  none: {
    label: 'Sem foto',
    tone: 'bg-slate-700/80 text-white',
  },
};

const PRICING_MODEL_LABELS: Record<string, string> = {
  single: 'Preço único',
  quantity_tiers: 'Faixas de quantidade',
  size_variants: 'Variações de tamanho',
  multiple_prices: 'Múltiplos preços',
  unknown: 'Padrão',
};

const GROUP_KIND_LABELS: Record<string, { label: string; tone: string }> = {
  option_group: { label: 'Grupo de Opções', tone: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  variant_group: { label: 'Variações de Tamanho', tone: 'bg-purple-100 text-purple-800 border-purple-200' },
  addon_group: { label: 'Adicionais Extras', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  unknown: { label: 'Grupo', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const GROUP_PRICING_LABELS: Record<string, string> = {
  inherits_parent: 'Herda preço do produto',
  own_price_per_item: 'Preço individual por item',
  mixed: 'Preço misto',
  no_price: 'Sem custo adicional',
  unknown: 'Padrão',
};

interface V4LabViewProps {
  v4Result: CatalogLabV4Response;
  isPdf: boolean;
  activeTab: LabTab;
  cropPreviews: Record<string, string>;
  pdfPagePreviews: Record<number, string>;
  v4JsonTab: 'normalized' | 'raw' | 'validation';
  setV4JsonTab: (tab: 'normalized' | 'raw' | 'validation') => void;
  copiedV4Json: boolean;
  handleCopyV4Json: () => void;
}

function V4LabView({
  v4Result,
  isPdf,
  activeTab,
  cropPreviews,
  pdfPagePreviews,
  v4JsonTab,
  setV4JsonTab,
  copiedV4Json,
  handleCopyV4Json,
}: V4LabViewProps) {
  const { data, localIssues, reviewFlags, usage, modelRequestCount, inputTransport } = v4Result;
  const products = data.catalog?.products || [];
  const groups = data.catalog?.groups || [];
  const businessRules = data.catalog?.businessRules || [];
  const photos = data.photos || [];

  const [photoFilter, setPhotoFilter] = useState<'all' | 'direct' | 'shared' | 'ambiguous' | 'none'>('all');
  const [selectedOverlayPage, setSelectedOverlayPage] = useState<number>(1);

  // Mapa de produtos para busca rápida por productKey
  const productMap = useMemo(() => {
    const map = new Map<string, UnifiedProduct>();
    products.forEach((p) => map.set(p.productKey, p));
    return map;
  }, [products]);

  // Agrupamento de produtos por categoria higienizada
  const categoryGroups = useMemo(() => {
    const map = new Map<string, UnifiedProduct[]>();
    products.forEach((p) => {
      const cat = p.categoryName || 'Geral';
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(p);
    });
    return Array.from(map.entries()).map(([name, prods]) => ({ name, products: prods }));
  }, [products]);

  // Mapa de fotos por productKey
  const photoByProductKey = useMemo(() => {
    const map = new Map<string, UnifiedPhoto>();
    photos.forEach((p) => map.set(p.productKey, p));
    return map;
  }, [photos]);

  // Contadores
  const productsCount = products.filter((p) => p.kind === 'product').length;
  const combosCount = products.filter((p) => p.kind === 'combo').length;
  const totalOptions = groups.reduce((acc, g) => acc + (g.options?.length || 0), 0);
  const matchedPhotos = photos.filter((p) => p.photoRelation !== 'none').length;
  const nonePhotos = photos.filter((p) => p.photoRelation === 'none').length;
  const totalIssuesCount = localIssues.length + reviewFlags.length;

  const filteredPhotos = useMemo(() => {
    if (photoFilter === 'all') return photos;
    return photos.filter((p) => p.photoRelation === photoFilter);
  }, [photos, photoFilter]);

  const distinctPages = useMemo(() => {
    const pages = new Set<number>();
    products.forEach((p) => p.sourcePages.forEach((pg) => pages.add(pg)));
    photos.forEach((p) => {
      if (typeof p.pageNumber === 'number') pages.add(p.pageNumber);
    });
    return Array.from(pages).sort((a, b) => a - b);
  }, [products, photos]);

  return (
    <div className="space-y-4">
      {/* Barra de Métricas V4 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-purple-200 bg-purple-50/70 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-purple-900 bg-purple-200/80 px-2 py-0.5 rounded text-[10px]">
              <Zap className="h-3 w-3 text-purple-700" />
              Pipeline: V4 Unified
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">
              Chamadas de Modelo: {modelRequestCount} (Única inferência)
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded text-[10px]">
              Transporte: {inputTransport === 'signed_url' ? 'Signed URL (PDF)' : 'Inline base64 (Imagem)'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-slate-600">
            <span>Inferência: {(v4Result.inferenceTimeMs / 1000).toFixed(1)}s</span>
            <span>•</span>
            <span>Total: {(v4Result.executionTimeMs / 1000).toFixed(1)}s</span>
            {usage && (
              <>
                <span>•</span>
                <span title="Tokens de entrada e saída">
                  Tokens: {usage.totalTokens ?? '-'} ({usage.inputTokens ?? '-'} in / {usage.outputTokens ?? '-'} out)
                </span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <ShoppingBag className="h-3 w-3 text-emerald-600" /> Produtos
            </span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{productsCount}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <Package className="h-3 w-3 text-teal-600" /> Combos
            </span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{combosCount}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <GitFork className="h-3 w-3 text-indigo-600" /> Grupos
            </span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{groups.length}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <ListTree className="h-3 w-3 text-purple-600" /> Opções
            </span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{totalOptions}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <ShieldCheck className="h-3 w-3 text-amber-600" /> Regras
            </span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">{businessRules.length}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center" title={`${matchedPhotos} produtos com foto correspondente ou compartilhada (${nonePhotos} sem foto)`}>
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <Camera className="h-3 w-3 text-teal-600" /> Fotos Mapeadas
            </span>
            <span className="text-base font-bold text-teal-700 mt-0.5 block">{matchedPhotos}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center" title="Sinais do modelo e validações determinísticas locais">
            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3 text-rose-600" /> Validações
            </span>
            <span className={`text-base font-bold mt-0.5 block ${totalIssuesCount > 0 ? 'text-amber-700 font-extrabold' : 'text-emerald-700'}`}>
              {totalIssuesCount}
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================
          ABA 1: ITENS (Produtos & Combos com Grupos Associados)
          ========================================================= */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          {categoryGroups.map((cat, catIdx) => (
            <div key={catIdx} className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
              <div className="bg-slate-50/80 px-3.5 py-2 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-purple-600" />
                  {cat.name}
                </h3>
                <span className="text-[10px] font-semibold text-slate-500">
                  {cat.products.length} produto{cat.products.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {cat.products.map((prod) => {
                  const photo = photoByProductKey.get(prod.productKey);
                  const cropUrl = cropPreviews[prod.productKey];
                  const linkedGroups = groups.filter((g) => g.parentProductKey === prod.productKey);
                  const relationMeta = photo
                    ? PHOTO_RELATION_LABELS[photo.photoRelation] || PHOTO_RELATION_LABELS.none
                    : PHOTO_RELATION_LABELS.none;

                  return (
                    <div key={prod.productKey} className="p-3.5 space-y-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {/* Miniatura da foto recortada via Canvas */}
                          {cropUrl ? (
                            <div
                              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center p-0.5"
                              title={`Foto de ${prod.name}`}
                            >
                              <img src={cropUrl} alt={prod.name} className="max-h-full max-w-full h-auto w-auto object-contain rounded" />
                              <span className={`absolute bottom-0.5 left-0.5 right-0.5 rounded text-[8px] font-bold text-center truncate ${relationMeta.tone}`}>
                                {relationMeta.label}
                              </span>
                            </div>
                          ) : (
                            <div
                              className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400 p-1 text-center"
                              title="Sem foto detectada"
                            >
                              <Camera className="h-5 w-5 stroke-1" />
                              <span className="text-[8px] font-semibold uppercase mt-0.5">Sem foto</span>
                            </div>
                          )}

                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                                {prod.productKey}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${
                                  prod.kind === 'combo'
                                    ? 'bg-teal-100 text-teal-800 border-teal-200'
                                    : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                {prod.kind === 'combo' ? 'Combo' : 'Produto'}
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-medium text-slate-600 border border-slate-200">
                                {PRICING_MODEL_LABELS[prod.pricingModel] || prod.pricingModel}
                              </span>
                              {prod.sourcePages?.length > 0 && (
                                <span className="font-mono text-[10px] text-slate-500">
                                  Pág. {prod.sourcePages.join(', ')}
                                </span>
                              )}
                              {prod.relatedPages?.length > 0 && (
                                <span className="font-mono text-[10px] text-blue-600" title="Páginas com tabelas, complementos ou regras adicionais">
                                  (Relacionada: pág. {prod.relatedPages.join(', ')})
                                </span>
                              )}
                            </div>

                            <h4 className="text-xs font-bold text-slate-900 leading-snug">{prod.name}</h4>
                            {prod.description && (
                              <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">{prod.description}</p>
                            )}
                          </div>
                        </div>

                        {/* Preços do produto */}
                        <div className="text-right shrink-0 space-y-1">
                          {prod.prices && prod.prices.length > 0 ? (
                            prod.prices.map((p, pIdx) => {
                              const formattedAmount =
                                p.amountCents !== null && p.amountCents !== undefined
                                  ? (p.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                  : p.rawText;
                              return (
                                <div key={pIdx} className="flex items-center justify-end gap-1 text-xs">
                                  {p.label && <span className="text-[10px] text-slate-500 font-medium">{p.label}:</span>}
                                  {p.prefix && <span className="text-[10px] text-slate-500 font-normal">{p.prefix}</span>}
                                  <span className="font-bold text-slate-900">{formattedAmount}</span>
                                  {p.unit && <span className="text-[10px] text-slate-500">/{p.unit}</span>}
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-xs font-bold text-amber-600">Preço sob consulta / herda</span>
                          )}
                        </div>
                      </div>

                      {/* Grupos de escolhas / complementos associados a este produto */}
                      {linkedGroups.length > 0 && (
                        <div className="rounded-lg bg-slate-50 border border-slate-200/70 p-2 space-y-1.5 mt-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                            <GitFork className="h-3 w-3 text-indigo-600" />
                            Grupos de Escolhas & Complementos ({linkedGroups.length}):
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                            {linkedGroups.map((g) => (
                              <div key={g.groupKey} className="rounded border border-slate-200 bg-white p-2 text-xs space-y-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-slate-800 truncate">{g.name}</span>
                                  <span className={`text-[9px] font-semibold px-1 rounded border ${g.required ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                    {g.required ? 'Obrigatório' : 'Opcional'} (min: {g.minimum}, max: {g.maximum})
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {g.options.map((opt) => (
                                    <span key={opt.optionKey} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 font-medium">
                                      {opt.name}
                                      {opt.amountCents ? ` (+${(opt.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : ''}
                                    </span>
                                  ))}
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
          ))}
        </div>
      )}

      {/* =========================================================
          ABA 2: ESTRUTURA (Grupos de Opções, Regras, Seções)
          ========================================================= */}
      {activeTab === 'structure' && (
        <div className="space-y-6">
          {/* Grupos de Opções */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <GitFork className="h-4 w-4 text-indigo-600" />
                Grupos de Escolhas & Complementos ({groups.length})
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">
                {totalOptions} opções / sabores catalogados
              </span>
            </div>

            {groups.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                Nenhum grupo de escolhas ou complementos foi identificado.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groups.map((g) => {
                  const parentProduct = g.parentProductKey ? productMap.get(g.parentProductKey) : null;
                  const kindMeta = GROUP_KIND_LABELS[g.kind] || GROUP_KIND_LABELS.unknown;

                  return (
                    <div key={g.groupKey} className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-2xs">
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                              {g.groupKey}
                            </span>
                            <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${kindMeta.tone}`}>
                              {kindMeta.label}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 mt-0.5">{g.name}</h4>
                          {parentProduct ? (
                            <p className="text-[10px] text-slate-500">
                              Vinculado a: <span className="font-semibold text-slate-700">{parentProduct.name}</span> ({g.parentProductKey})
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-400 italic">Grupo global / sem produto pai direto</p>
                          )}
                        </div>

                        <div className="text-right space-y-0.5 shrink-0">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${g.required ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>
                            {g.required ? 'Obrigatório' : 'Opcional'}
                          </span>
                          <p className="text-[10px] text-slate-500 font-mono">
                            min: {g.minimum} | max: {g.maximum}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-[10px] text-slate-600 bg-slate-50 p-2 rounded-lg">
                        <span>Preço: <strong>{GROUP_PRICING_LABELS[g.pricingBehavior] || g.pricingBehavior}</strong></span>
                        <span>•</span>
                        <span>Seleção: <strong>{g.selectionMode === 'single' ? 'Única' : g.selectionMode === 'multiple' ? 'Múltipla' : 'Livre'}</strong></span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block">Opções disponíveis ({g.options.length}):</span>
                        <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                          {g.options.map((opt) => (
                            <div key={opt.optionKey} className="p-1.5 px-2 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                              <span className="font-medium text-slate-800 truncate">{opt.name}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="rounded bg-slate-100 px-1 py-0.2 text-[9px] font-medium text-slate-600">
                                  {opt.semanticKind}
                                </span>
                                <span className="font-mono text-xs font-bold text-slate-900">
                                  {opt.amountCents
                                    ? `+${(opt.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                                    : opt.rawPrice || 'R$ 0,00'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Regras Comerciais */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-amber-600" />
                Regras de Negócio do Cardápio ({businessRules.length})
              </h3>
            </div>

            {businessRules.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                Nenhuma regra de negócio comercial foi identificada.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {businessRules.map((rule) => {
                  const ruleTypeMeta = BUSINESS_RULE_LABELS[rule.type as BusinessRuleType] || {
                    label: rule.type,
                    tone: 'bg-slate-100 text-slate-800 border-slate-200',
                  };

                  return (
                    <div key={rule.ruleKey} className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                            {rule.ruleKey}
                          </span>
                          <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${ruleTypeMeta.tone}`}>
                            {ruleTypeMeta.label}
                          </span>
                        </div>
                        {typeof rule.sourcePage === 'number' && (
                          <span className="font-mono text-[10px] text-slate-500">Pág. {rule.sourcePage}</span>
                        )}
                      </div>

                      <p className="text-xs text-slate-800 leading-relaxed font-medium bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                        "{rule.rawText}"
                      </p>

                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                        {rule.parentProductKey && (
                          <span>Vinculada ao produto: <strong>{rule.parentProductKey}</strong></span>
                        )}
                        {rule.groupKey && (
                          <span>Vinculada ao grupo: <strong>{rule.groupKey}</strong></span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Seções e Cobertura do Documento */}
          {data.document && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Compass className="h-4 w-4 text-blue-600" />
                  Estrutura do Documento & Cobertura de Páginas
                </h3>
                {data.document.globalTitle && (
                  <span className="text-xs font-bold text-slate-800">
                    Título: <span className="text-purple-700">{data.document.globalTitle}</span> ({data.document.globalTitleRole})
                  </span>
                )}
              </div>

              {data.document.pageCoverage && data.document.pageCoverage.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-100 text-[10px] uppercase font-bold">
                      <tr>
                        <th className="p-2.5">Página</th>
                        <th className="p-2.5">Papel</th>
                        <th className="p-2.5">Evidência de Catálogo</th>
                        <th className="p-2.5">Observações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.document.pageCoverage.map((pc) => (
                        <tr key={pc.pageNumber} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-2.5 font-mono font-bold text-slate-900">Pág. {pc.pageNumber}</td>
                          <td className="p-2.5">
                            <span className="rounded bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 text-[10px] font-semibold">
                              {pc.role}
                            </span>
                          </td>
                          <td className="p-2.5">
                            {pc.hasCatalogEvidence ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Sim
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Não</span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-600 text-[11px]">{pc.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          ABA 3: FOTOS (Galeria de Fotos Mapeadas com Crops)
          ========================================================= */}
      {activeTab === 'photos' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5">
              {(['all', 'direct', 'shared', 'ambiguous', 'none'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPhotoFilter(mode)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    photoFilter === mode
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {mode === 'all'
                    ? `Todas (${photos.length})`
                    : mode === 'direct'
                    ? `Diretas (${photos.filter((p) => p.photoRelation === 'direct').length})`
                    : mode === 'shared'
                    ? `Compartilhadas (${photos.filter((p) => p.photoRelation === 'shared').length})`
                    : mode === 'ambiguous'
                    ? `Ambíguas (${photos.filter((p) => p.photoRelation === 'ambiguous').length})`
                    : `Sem Foto (${photos.filter((p) => p.photoRelation === 'none').length})`}
                </button>
              ))}
            </div>
          </div>

          {filteredPhotos.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-400">
              Nenhuma foto encontrada para o filtro selecionado.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredPhotos.map((photo) => {
                const prod = productMap.get(photo.productKey);
                const cropUrl = cropPreviews[photo.productKey];
                const relationMeta = PHOTO_RELATION_LABELS[photo.photoRelation] || PHOTO_RELATION_LABELS.none;

                return (
                  <div key={photo.productKey} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs flex flex-col">
                    <div className="relative h-44 bg-slate-100 flex items-center justify-center border-b border-slate-100 p-2">
                      {cropUrl ? (
                        <img src={cropUrl} alt={prod?.name || photo.productKey} className="max-h-full max-w-full object-contain rounded" />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <Camera className="h-8 w-8 stroke-1" />
                          <span className="text-[10px] font-semibold mt-1">Sem recorte visual</span>
                        </div>
                      )}
                      <span className={`absolute top-2 right-2 rounded-md ${relationMeta.tone} text-[10px] font-bold px-2 py-0.5 shadow-xs`}>
                        {relationMeta.label}
                      </span>
                      {typeof photo.pageNumber === 'number' && (
                        <span className="absolute bottom-2 left-2 rounded bg-slate-900/70 text-white font-mono text-[10px] px-1.5 py-0.5">
                          Pág. {photo.pageNumber}
                        </span>
                      )}
                    </div>

                    <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-purple-700 font-bold">
                          {photo.productKey} • {prod?.categoryName || 'Geral'}
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 leading-snug mt-0.5">
                          {prod?.name || `Item ${photo.productKey}`}
                        </h4>
                      </div>

                      {photo.photoWarning && (
                        <p className="rounded bg-amber-50 border border-amber-200 p-1.5 text-[10px] text-amber-800 leading-snug">
                          ⚠ {photo.photoWarning}
                        </p>
                      )}

                      {photo.photoBox && (
                        <div className="pt-1 text-[10px] font-mono text-slate-500 border-t border-slate-100">
                          Box: [{photo.photoBox.join(', ')}]
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          ABA 4: OVERLAY (Ver na Página)
          ========================================================= */}
      {activeTab === 'overlay' && (
        <div className="space-y-3">
          {isPdf ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-700 mr-2">Páginas com itens:</span>
                {distinctPages.map((pg) => (
                  <button
                    key={pg}
                    type="button"
                    onClick={() => setSelectedOverlayPage(pg)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                      selectedOverlayPage === pg
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Pág. {pg}
                  </button>
                ))}
              </div>

              {pdfPagePreviews[selectedOverlayPage] ? (
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900/5 max-h-[600px] flex items-center justify-center p-2">
                  <img
                    src={pdfPagePreviews[selectedOverlayPage]}
                    alt={`Página ${selectedOverlayPage}`}
                    className="max-h-[580px] w-auto object-contain rounded"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-12 text-center text-xs text-slate-400">
                  Pré-visualização renderizada do PDF não disponível para a página selecionada.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-500">
              Para imagens, visualize a imagem original no painel lateral esquerdo.
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          ABA 5: VALIDAÇÃO IA (Review Flags + Local Issues)
          ========================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-5">
          {totalIssuesCount === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
              <h4 className="text-xs font-bold text-emerald-900">Cardápio Validado com Sucesso!</h4>
              <p className="text-[11px] text-emerald-700">
                Todas as validações determinísticas locais e os sinais de revisão do modelo passaram sem pendências.
              </p>
            </div>
          ) : null}

          {/* Validações Locais Determinísticas (Backend) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                Validações Determinísticas Locais ({localIssues.length})
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">Backend Pode Vir</span>
            </div>

            {localIssues.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Nenhum apontamento determinístico do backend.</p>
            ) : (
              <div className="space-y-2">
                {localIssues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3 text-xs space-y-1 ${
                      issue.severity === 'high'
                        ? 'border-rose-200 bg-rose-50/60 text-rose-950'
                        : issue.severity === 'medium'
                        ? 'border-amber-200 bg-amber-50/60 text-amber-950'
                        : 'border-blue-200 bg-blue-50/60 text-blue-950'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                            issue.severity === 'high'
                              ? 'bg-rose-600 text-white'
                              : issue.severity === 'medium'
                              ? 'bg-amber-600 text-white'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          {issue.severity}
                        </span>
                        <span className="font-mono text-[10px] font-semibold text-slate-700">
                          {issue.type}
                        </span>
                      </div>
                      {typeof issue.sourcePage === 'number' && (
                        <span className="font-mono text-[10px] text-slate-500">Pág. {issue.sourcePage}</span>
                      )}
                    </div>

                    <p className="font-medium leading-relaxed">{issue.message}</p>
                    {issue.evidence && (
                      <p className="text-[10px] text-slate-600 font-mono bg-white/70 p-1 rounded border border-slate-200/50">
                        Evidência: {issue.evidence}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sinais do Modelo (Review Flags) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Sinais do Modelo Gemini ({reviewFlags.length})
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">Interactions API</span>
            </div>

            {reviewFlags.length === 0 ? (
              <p className="text-xs text-slate-500 italic">O modelo não reportou dúvidas ou incertezas.</p>
            ) : (
              <div className="space-y-2">
                {reviewFlags.map((flag, idx) => (
                  <div key={idx} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs space-y-1 text-amber-950">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-amber-600 text-white px-1.5 py-0.2 text-[9px] font-bold uppercase">
                          {flag.severity}
                        </span>
                        <span className="font-mono text-[10px] font-semibold text-slate-700">
                          {flag.type}
                        </span>
                      </div>
                      {typeof flag.sourcePage === 'number' && (
                        <span className="font-mono text-[10px] text-slate-500">Pág. {flag.sourcePage}</span>
                      )}
                    </div>
                    <p className="font-medium leading-relaxed">{flag.message}</p>
                    {flag.evidence && (
                      <p className="text-[10px] text-slate-600 font-mono bg-white/70 p-1 rounded border border-amber-200/50">
                        Evidência: {flag.evidence}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          ABA 6: JSON (Normalizado / Raw Gemini / Validação)
          ========================================================= */}
      {activeTab === 'json' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setV4JsonTab('normalized')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  v4JsonTab === 'normalized'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Normalizado Backend
              </button>
              <button
                type="button"
                onClick={() => setV4JsonTab('raw')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  v4JsonTab === 'raw'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Raw Gemini (Interactions)
              </button>
              <button
                type="button"
                onClick={() => setV4JsonTab('validation')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  v4JsonTab === 'validation'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Validações & Metadados
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyV4Json}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {copiedV4Json ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                  Copiar JSON
                </>
              )}
            </button>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-3 text-slate-100">
            <pre className="max-h-[500px] overflow-auto text-[11px] font-mono leading-relaxed">
              {v4JsonTab === 'normalized'
                ? JSON.stringify(data, null, 2)
                : v4JsonTab === 'raw'
                ? v4Result.rawJson
                : JSON.stringify(
                    {
                      localIssues,
                      reviewFlags,
                      usage,
                      modelRequestCount,
                      inputTransport,
                      executionTimeMs: v4Result.executionTimeMs,
                      inferenceTimeMs: v4Result.inferenceTimeMs,
                      warnings: v4Result.warnings,
                    },
                    null,
                    2
                  )}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminCatalogLab({ slug }: AdminCatalogLabProps) {
  const api = useMemo(() => new TenantAdminApi(slug), [slug]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isPdf = selectedFile?.type?.toLowerCase() === 'application/pdf';
  const [dragActive, setDragActive] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<'idle' | 'uploading' | 'analyzing'>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<CatalogLabResponse | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
  const [, setTempPdfUpload] = useState<{ bucket: string; path: string } | null>(null);

  const analysisStartedRef = useRef(false);
  const tempPdfUploadRef = useRef<{ bucket: string; path: string } | null>(null);

  // Pipeline A/B (V4 Unified padrão vs V3.2 Legacy)
  const [selectedPipeline, setSelectedPipeline] = useState<CatalogLabPipeline>('v4_unified');
  const [v4JsonTab, setV4JsonTab] = useState<'normalized' | 'raw' | 'validation'>('normalized');
  const [copiedV4Json, setCopiedV4Json] = useState(false);

  // Navegação do laboratório
  const [activeTab, setActiveTab] = useState<LabTab>('items');
  const [jsonTab, setJsonTab] = useState<'textual' | 'semantic' | 'photo' | 'audit' | 'visual'>('textual');
  const [copiedTextual, setCopiedTextual] = useState(false);
  const [copiedSemantic, setCopiedSemantic] = useState(false);
  const [copiedPhoto, setCopiedPhoto] = useState(false);
  const [copiedAudit, setCopiedAudit] = useState(false);
  const [copiedVisual, setCopiedVisual] = useState(false);

  // Estado da aba Estrutura IA (avaliação manual da estrutura)
  const [structureVote, setStructureVote] = useState<'correct' | 'partial' | 'wrong' | null>(null);

  // Estado da aba Fotos IA
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>('all');
  const [manualVotes, setManualVotes] = useState<Record<string, FeedbackVote>>({});
  const [localKinds, setLocalKinds] = useState<Record<string, ItemKind>>({});

  // Bounding box overlay & crop cache
  const [selectedOverlayKey, setSelectedOverlayKey] = useState<string | null>(null);
  const [cropPreviews, setCropPreviews] = useState<Record<string, string>>({});
  const [pdfPagePreviews, setPdfPagePreviews] = useState<Record<number, string>>({});
  const [pdfCropErrors, setPdfCropErrors] = useState<Record<string, string>>({});
  const [isRenderingPdfCrops, setIsRenderingPdfCrops] = useState(false);
  const [pdfOverlayMode, setPdfOverlayMode] = useState<'annotated' | 'native'>('annotated');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hiddenImgRef = useRef<HTMLImageElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Limpeza de ObjectURL para evitar memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Limpeza de PDF temporário pendente no unmount se a análise ainda não começou
  useEffect(() => {
    return () => {
      const pending = tempPdfUploadRef.current;
      if (pending && !analysisStartedRef.current) {
        api.deletePdfTempUpload(pending.bucket, pending.path).catch(() => {});
      }
    };
  }, [api]);

  // Função de cleanup do frontend apenas para arquivos pendentes não enviados para o analyze
  const cleanupPendingTempPdf = useCallback(async () => {
    const pending = tempPdfUploadRef.current;
    if (pending && !analysisStartedRef.current) {
      tempPdfUploadRef.current = null;
      setTempPdfUpload(null);
      try {
        await api.deletePdfTempUpload(pending.bucket, pending.path);
      } catch (err) {
        console.warn('[lab] Falha na limpeza de PDF temporário pendente:', err);
      }
    }
  }, [api]);

  // Cronômetro do tempo decorrido
  useEffect(() => {
    if (analyzing) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [analyzing]);

  const handleSelectFile = async (file: File) => {
    if (analyzing) return;
    await cleanupPendingTempPdf();

    setErrorFeedback(null);
    setAnalysisResult(null);
    setCropPreviews({});
    setPdfPagePreviews({});
    setPdfCropErrors({});
    setIsRenderingPdfCrops(false);
    setPdfOverlayMode('annotated');
    setManualVotes({});
    setLocalKinds({});
    setSelectedOverlayKey(null);

    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      setErrorFeedback('Formato inválido. Por favor, envie uma imagem JPG, PNG, WEBP ou um arquivo PDF.');
      return;
    }

    const isSelectedFilePdf = file.type.toLowerCase() === 'application/pdf';
    const maxAllowedBytes = isSelectedFilePdf ? MAX_PDF_FILE_SIZE_BYTES : MAX_IMAGE_FILE_SIZE_BYTES;

    if (file.size > maxAllowedBytes) {
      const maxMb = isSelectedFilePdf ? 20 : 3;
      const kindLabel = isSelectedFilePdf ? 'arquivo PDF selecionado' : 'imagem selecionada';
      setErrorFeedback(
        `O ${kindLabel} tem ${(file.size / (1024 * 1024)).toFixed(1)} MB. O limite máximo permitido é ${maxMb} MiB.`
      );
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const newUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(newUrl);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (analyzing) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void handleSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleReset = async () => {
    if (analyzing) return;
    await cleanupPendingTempPdf();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setErrorFeedback(null);
    setElapsedSeconds(0);
    setCropPreviews({});
    setPdfPagePreviews({});
    setPdfCropErrors({});
    setIsRenderingPdfCrops(false);
    setPdfOverlayMode('annotated');
    setManualVotes({});
    setLocalKinds({});
    setStructureVote(null);
    setSelectedOverlayKey(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile || analyzing) return;

    setAnalyzing(true);
    setAnalysisStage('idle');
    analysisStartedRef.current = false;
    setErrorFeedback(null);
    setAnalysisResult(null);
    setCropPreviews({});
    setPdfPagePreviews({});
    setPdfCropErrors({});
    setIsRenderingPdfCrops(false);
    setPdfOverlayMode('annotated');
    setManualVotes({});
    setLocalKinds({});
    setStructureVote(null);
    setSelectedOverlayKey(null);

    try {
      if (isPdf) {
        setAnalysisStage('uploading');
        const signData = await api.signPdfTempUpload(selectedFile.size);
        const currentTemp = { bucket: signData.bucket, path: signData.path };
        tempPdfUploadRef.current = currentTemp;
        setTempPdfUpload(currentTemp);

        if (!supabase) {
          throw new Error('Armazenamento do Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
        }

        const { error: uploadError } = await supabase.storage
          .from(signData.bucket)
          .uploadToSignedUrl(signData.path, signData.token, selectedFile, {
            contentType: 'application/pdf',
            cacheControl: '0',
          });

        if (uploadError) {
          await cleanupPendingTempPdf();
          throw new Error(`Falha ao enviar o PDF para o armazenamento: ${uploadError.message}`);
        }

        // Backend passa a ser o dono exclusivo da exclusão via bloco finally
        analysisStartedRef.current = true;
        setAnalysisStage('analyzing');

        const response = await api.analyzePdfTempLab(signData.bucket, signData.path, selectedPipeline);
        setAnalysisResult(response);
        setActiveTab('items');
      } else {
        setAnalysisStage('analyzing');
        const response = await api.analyzeMenuImageLab(selectedFile, selectedPipeline);
        setAnalysisResult(response);
        setActiveTab('items');
      }
    } catch (err: any) {
      const message =
        err?.message || 'Falha ao processar o cardápio. Tente novamente.';
      setErrorFeedback(message);
    } finally {
      setAnalyzing(false);
      setAnalysisStage('idle');
      analysisStartedRef.current = false;
      tempPdfUploadRef.current = null;
      setTempPdfUpload(null);
    }
  };

  // Mapeamento plano dos itens para visualização rápida e filtros
  const flatItems: FlatItemEntry[] = useMemo(() => {
    if (!analysisResult?.data || !analysisResult.data.isMenu) return [];

    if (analysisResult.pipeline === 'v4_unified') {
      const v4Data = analysisResult.data;
      const photosMap = new Map<string, UnifiedPhoto>();
      v4Data.photos.forEach((p) => photosMap.set(p.productKey, p));

      return (v4Data.catalog.products || []).map((prod, prodIdx) => {
        const photo = photosMap.get(prod.productKey);
        const visualItem: VisualItem | undefined = photo
          ? {
              itemKey: prod.productKey,
              kind: prod.kind,
              sourceBox: null,
              photoBox: photo.photoBox,
              photoRelation: photo.photoRelation,
              photoWarning: photo.photoWarning || null,
            }
          : undefined;

        return {
          itemKey: prod.productKey,
          categoryIndex: 0,
          productIndex: prodIdx,
          categoryName: prod.categoryName,
          product: {
            name: prod.name,
            sourcePage: prod.sourcePages?.[0] || null,
            description: prod.description,
            prices: (prod.prices || []).map((p) => ({
              label: p.label,
              amountCents: p.amountCents,
              prefix: p.prefix,
              unit: p.unit,
              rawText: p.rawText,
            })),
            warnings: [],
          },
          visualItem,
        };
      });
    }

    const visualItemsMap = new Map<string, VisualItem>();
    if (analysisResult.enrichment?.status === 'ok') {
      analysisResult.enrichment.data.items.forEach((item) => {
        visualItemsMap.set(item.itemKey, item);
      });
    }

    const list: FlatItemEntry[] = [];
    (analysisResult.data.categories || []).forEach((cat, catIdx) => {
      (cat.products || []).forEach((prod, prodIdx) => {
        const itemKey = `c${catIdx}-p${prodIdx}`;
        list.push({
          itemKey,
          categoryIndex: catIdx,
          productIndex: prodIdx,
          categoryName: cat.name,
          product: prod,
          visualItem: visualItemsMap.get(itemKey),
        });
      });
    });

    return list;
  }, [analysisResult]);

  // Geração memoizada de crops de imagem no Canvas
  const ensureCrop = useCallback(
    (itemKey: string, box: BoundingBox) => {
      if (cropPreviews[itemKey] || !hiddenImgRef.current) return;
      const dataUrl = cropImageToDataUrl(hiddenImgRef.current, box, 400);
      if (dataUrl) {
        setCropPreviews((prev) => ({ ...prev, [itemKey]: dataUrl }));
      }
    },
    [cropPreviews]
  );

  const legacyResult: CatalogLabLegacyResponse | null =
    analysisResult && analysisResult.pipeline !== 'v4_unified'
      ? (analysisResult as CatalogLabLegacyResponse)
      : null;

  // Dispara a geração de crops dos itens visíveis quando o resultado chega (modo imagem)
  useEffect(() => {
    if (isPdf || !hiddenImgRef.current || !analysisResult) {
      return;
    }
    const hasVisuals =
      analysisResult.pipeline === 'v4_unified'
        ? analysisResult.data.photos.length > 0
        : legacyResult?.enrichment?.status === 'ok';
    if (!hasVisuals) return;

    flatItems.forEach((entry) => {
      if (entry.visualItem?.photoBox) {
        ensureCrop(entry.itemKey, entry.visualItem.photoBox);
      }
    });
  }, [flatItems, analysisResult, legacyResult, ensureCrop, isPdf]);

  // Dados de enriquecimento semântico de PDF quando disponíveis
  const semanticData =
    legacyResult?.pdfSemanticEnrichment?.status === 'ok'
      ? legacyResult.pdfSemanticEnrichment.data
      : null;

  const semanticItemMap = useMemo(() => {
    const map = new Map<string, SemanticItemAssignment>();
    semanticData?.items.forEach((item) => map.set(item.itemKey, item));
    return map;
  }, [semanticData]);

  const semanticGroupMap = useMemo(() => {
    const map = new Map<string, SemanticGroup>();
    semanticData?.groups.forEach((group) => map.set(group.groupKey, group));
    return map;
  }, [semanticData]);

  // Métricas da interpretação semântica de PDF
  const semanticMetrics = useMemo(() => {
    if (!semanticData) return null;
    const mainProducts = semanticData.items.filter(
      (i) => i.kind === 'product' || i.parentItemKey === null
    ).length;
    const groupsCount = semanticData.groups.length;
    const optionsCount = semanticData.items.filter((i) => i.kind === 'option').length;
    const rulesCount = semanticData.businessRules.length;
    const ignoredCount = semanticData.ignoredTexts.length;

    return {
      mainProducts,
      groupsCount,
      optionsCount,
      rulesCount,
      ignoredCount,
    };
  }, [semanticData]);

  // Dados de detecção visual de fotos em PDF (T3)
  const pdfPhotoData =
    legacyResult?.pdfPhotoEnrichment?.status === 'ok'
      ? legacyResult.pdfPhotoEnrichment.data
      : null;

  const pdfPhotoItemMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof pdfPhotoData>['items'][0]>();
    pdfPhotoData?.items.forEach((item) => map.set(item.itemKey, item));
    return map;
  }, [pdfPhotoData]);

  // Candidatos de catálogo para fotos no PDF (apenas produtos principais e combos)
  const pdfCatalogCandidates = useMemo(() => {
    if (!isPdf) return [];
    return flatItems.filter((entry) => {
      const sItem = semanticItemMap.get(entry.itemKey);
      const kind = localKinds[entry.itemKey] || sItem?.kind || 'product';
      return isCatalogPhotoCandidate(kind);
    });
  }, [isPdf, flatItems, semanticItemMap, localKinds]);

  const candidatePhotosCount = useMemo(() => {
    if (!isPdf || !analysisResult) return 0;
    if (analysisResult.pipeline === 'v4_unified') {
      return analysisResult.data.photos.filter(
        (p) => p.photoRelation !== 'none' && Array.isArray(p.photoBox)
      ).length;
    }
    return pdfCatalogCandidates.filter((entry) => {
      const pPhoto = pdfPhotoItemMap.get(entry.itemKey);
      return pPhoto && pPhoto.photoRelation !== 'none' && Array.isArray(pPhoto.photoBox);
    }).length;
  }, [isPdf, analysisResult, pdfCatalogCandidates, pdfPhotoItemMap]);

  // Dispara a extração e recorte de fotos em PDF (apenas para candidatos elegíveis de catálogo)
  useEffect(() => {
    if (!isPdf || !selectedFile || !analysisResult) {
      return;
    }

    if (analysisResult.pipeline === 'v4_unified') {
      const photos = analysisResult.data.photos || [];
      const candidates: PdfPhotoCandidateItem[] = [];

      photos.forEach((photo) => {
        if (
          photo.photoRelation !== 'none' &&
          Array.isArray(photo.photoBox) &&
          photo.photoBox.length === 4 &&
          typeof photo.pageNumber === 'number' &&
          photo.pageNumber >= 1
        ) {
          const prod = analysisResult.data.catalog.products.find(
            (p) => p.productKey === photo.productKey
          );
          candidates.push({
            itemKey: photo.productKey,
            name: prod?.name || `Item ${photo.productKey}`,
            kind: prod?.kind || 'product',
            categoryName: prod?.categoryName || undefined,
            pageNumber: photo.pageNumber,
            photoBox: photo.photoBox as [number, number, number, number],
            photoRelation: photo.photoRelation,
            photoWarning: photo.photoWarning || undefined,
          });
        }
      });

      if (candidates.length === 0) return;

      let isCancelled = false;
      setIsRenderingPdfCrops(true);

      extractPdfCrops(selectedFile, candidates)
        .then((result) => {
          if (isCancelled) return;
          setCropPreviews((prev) => ({ ...prev, ...result.crops }));
          setPdfPagePreviews((prev) => ({ ...prev, ...result.pagePreviews }));
          setPdfCropErrors(result.failedItemKeys);
        })
        .catch((err) => {
          if (isCancelled) return;
          console.error('Erro ao recortar fotos do PDF V4:', err);
        })
        .finally(() => {
          if (!isCancelled) {
            setIsRenderingPdfCrops(false);
          }
        });

      return () => {
        isCancelled = true;
      };
    }

    if (analysisResult.pdfPhotoEnrichment?.status !== 'ok') {
      return;
    }

    const items = analysisResult.pdfPhotoEnrichment.data?.items;
    if (!items || items.length === 0) return;

    const candidates: PdfPhotoCandidateItem[] = [];
    items.forEach((item) => {
      const flatEntry = flatItems.find((f) => f.itemKey === item.itemKey);
      const sItem = semanticItemMap.get(item.itemKey);
      const kind = localKinds[item.itemKey] || sItem?.kind || 'product';

      if (
        isCatalogPhotoCandidate(kind) &&
        item.photoRelation !== 'none' &&
        Array.isArray(item.photoBox) &&
        item.photoBox.length === 4 &&
        typeof item.pageNumber === 'number' &&
        item.pageNumber >= 1
      ) {
        candidates.push({
          itemKey: item.itemKey,
          name: flatEntry?.product.name || `Item ${item.itemKey}`,
          kind,
          categoryName: flatEntry?.categoryName,
          pageNumber: item.pageNumber,
          photoBox: item.photoBox as [number, number, number, number],
          photoRelation: item.photoRelation,
          photoWarning: item.photoWarning,
        });
      }
    });

    if (candidates.length === 0) return;

    let isCancelled = false;
    setIsRenderingPdfCrops(true);

    extractPdfCrops(selectedFile, candidates)
      .then((result) => {
        if (isCancelled) return;
        setCropPreviews((prev) => ({ ...prev, ...result.crops }));
        setPdfPagePreviews((prev) => ({ ...prev, ...result.pagePreviews }));
        setPdfCropErrors(result.failedItemKeys);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('Erro ao recortar fotos do PDF:', err);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsRenderingPdfCrops(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isPdf, selectedFile, analysisResult, flatItems, semanticItemMap, localKinds]);

  const pdfPhotoMetrics = useMemo(() => {
    if (!pdfPhotoData) return null;
    const found = pdfPhotoData.items.filter((i) => i.photoRelation !== 'none').length;
    const direct = pdfPhotoData.items.filter((i) => i.photoRelation === 'direct').length;
    const shared = pdfPhotoData.items.filter((i) => i.photoRelation === 'shared').length;
    const ambiguous = pdfPhotoData.items.filter((i) => i.photoRelation === 'ambiguous').length;
    const none = pdfPhotoData.items.filter((i) => i.photoRelation === 'none').length;
    return {
      found,
      direct,
      shared,
      ambiguous,
      none,
      total: pdfPhotoData.items.length,
    };
  }, [pdfPhotoData]);

  // Contadores analíticos avançados da V2
  const metrics = useMemo(() => {
    if (!analysisResult?.data || !analysisResult.data.isMenu) {
      return {
        categoriesCount: 0,
        itemsCount: 0,
        identifiedPrices: 0,
        pendingPrices: 0,
        suggestedPhotos: 0,
        dataPendingCount: 0,
      };
    }

    if (analysisResult.pipeline === 'v4_unified') {
      const prods = analysisResult.data.catalog.products || [];
      const cats = new Set(prods.map((p) => p.categoryName || 'Geral'));
      const identifiedPrices = prods.reduce(
        (acc, p) => acc + (p.prices || []).filter((pr) => pr.amountCents !== null).length,
        0
      );
      const pendingPrices = prods.reduce(
        (acc, p) => acc + (p.prices || []).filter((pr) => pr.amountCents === null).length,
        0
      );
      const suggestedPhotos = analysisResult.data.photos.filter((p) => p.photoRelation !== 'none').length;
      return {
        categoriesCount: cats.size,
        itemsCount: prods.length,
        identifiedPrices,
        pendingPrices,
        suggestedPhotos,
        dataPendingCount: analysisResult.localIssues.length + analysisResult.reviewFlags.length,
      };
    }

    const categoriesCount = analysisResult.data.categories.length;
    let itemsCount = 0;
    let identifiedPrices = 0;
    let pendingPrices = 0;
    let suggestedPhotos = 0;
    let dataPendingCount = 0;

    flatItems.forEach((entry) => {
      itemsCount += 1;
      const prices = entry.product.prices || [];

      // Verifica se é uma opção de grupo com preço herdado do produto principal
      const sItem = semanticItemMap.get(entry.itemKey);
      const sGroup = sItem?.groupKey ? semanticGroupMap.get(sItem.groupKey) : null;
      const inheritsParentPrice =
        sItem?.kind === 'option' && sGroup?.pricingBehavior === 'inherits_parent';

      if (prices.length === 0) {
        if (!inheritsParentPrice) {
          pendingPrices += 1;
        }
      } else {
        prices.forEach((p) => {
          if (p.amountCents !== null && p.amountCents !== undefined) {
            identifiedPrices += 1;
          } else if (!inheritsParentPrice) {
            pendingPrices += 1;
          }
        });
      }

      // Ignora warnings de preço caso o item herde preço do produto principal
      const nonPriceWarnings = (entry.product.warnings || []).filter(
        (w) => !w.toLowerCase().includes('preço') && !w.toLowerCase().includes('preco')
      );
      const hasWarnings = inheritsParentPrice
        ? nonPriceWarnings.length > 0
        : (entry.product.warnings || []).length > 0;

      const isAmbiguous = isPdf
        ? pdfPhotoItemMap.get(entry.itemKey)?.photoRelation === 'ambiguous'
        : entry.visualItem?.photoRelation === 'ambiguous';

      const hasPhotoWarning = isPdf
        ? Boolean(pdfPhotoItemMap.get(entry.itemKey)?.photoWarning)
        : Boolean(entry.visualItem?.photoWarning);

      const hasPendingPrice =
        !inheritsParentPrice &&
        (prices.length === 0 || prices.some((p) => p.amountCents === null));

      if (hasWarnings || isAmbiguous || hasPhotoWarning || hasPendingPrice) {
        dataPendingCount += 1;
      }

      if (!isPdf && entry.visualItem?.photoBox !== null && entry.visualItem?.photoBox !== undefined) {
        suggestedPhotos += 1;
      }
    });

    return {
      categoriesCount,
      itemsCount,
      identifiedPrices,
      pendingPrices,
      suggestedPhotos,
      dataPendingCount,
    };
  }, [analysisResult, flatItems, isPdf, pdfPhotoItemMap, semanticItemMap, semanticGroupMap]);

  // Contadores da sessão de votação manual
  const voteStats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let uncertain = 0;

    Object.values(manualVotes).forEach((v) => {
      if (v === 'correct') correct += 1;
      if (v === 'wrong') wrong += 1;
      if (v === 'uncertain') uncertain += 1;
    });

    const totalWithPhoto = isPdf
      ? candidatePhotosCount
      : flatItems.filter((i) => i.visualItem?.photoBox).length;
    const pending = Math.max(0, totalWithPhoto - (correct + wrong + uncertain));

    return { correct, wrong, uncertain, pending, totalWithPhoto };
  }, [manualVotes, isPdf, candidatePhotosCount, flatItems]);

  // Contagem de páginas distintas do PDF referenciadas pela IA
  const distinctPagesCount = useMemo(() => {
    const pages = new Set<number>();
    flatItems.forEach((entry) => {
      if (typeof entry.product.sourcePage === 'number' && entry.product.sourcePage >= 1) {
        pages.add(entry.product.sourcePage);
      }
    });
    return pages.size;
  }, [flatItems]);

  // Filtro de itens na aba Fotos IA
  const filteredPhotoItems = useMemo(() => {
    return flatItems.filter((entry) => {
      const v = entry.visualItem;
      const effectiveKind = localKinds[entry.itemKey] || v?.kind || 'product';

      if (photoFilter === 'with_photo') return Boolean(v?.photoBox);
      if (photoFilter === 'without_photo') return !v?.photoBox;
      if (photoFilter === 'ambiguous') return v?.photoRelation === 'ambiguous';
      if (photoFilter === 'review') {
        return (
          v?.photoRelation === 'ambiguous' ||
          Boolean(v?.photoWarning) ||
          (entry.product.warnings && entry.product.warnings.length > 0)
        );
      }
      if (photoFilter === 'products') return effectiveKind === 'product';
      if (photoFilter === 'combos') return effectiveKind === 'combo';
      if (photoFilter === 'addons') return effectiveKind === 'addon';
      if (photoFilter === 'options') return effectiveKind === 'option';
      return true;
    });
  }, [flatItems, photoFilter, localKinds]);

  const handleCopyTextualJson = () => {
    if (!analysisResult?.rawJson) return;
    void navigator.clipboard.writeText(analysisResult.rawJson).then(() => {
      setCopiedTextual(true);
      setTimeout(() => setCopiedTextual(false), 2000);
    });
  };

  const handleCopySemanticJson = () => {
    if (
      legacyResult?.pdfSemanticEnrichment?.status !== 'ok' ||
      !legacyResult.pdfSemanticEnrichment.rawJson
    )
      return;
    void navigator.clipboard.writeText(legacyResult.pdfSemanticEnrichment.rawJson).then(() => {
      setCopiedSemantic(true);
      setTimeout(() => setCopiedSemantic(false), 2000);
    });
  };

  const handleCopyPhotoJson = () => {
    if (
      legacyResult?.pdfPhotoEnrichment?.status !== 'ok' ||
      !legacyResult.pdfPhotoEnrichment.rawJson
    )
      return;
    void navigator.clipboard.writeText(legacyResult.pdfPhotoEnrichment.rawJson).then(() => {
      setCopiedPhoto(true);
      setTimeout(() => setCopiedPhoto(false), 2000);
    });
  };

  const handleCopyAuditJson = () => {
    if (
      legacyResult?.pdfAudit?.status !== 'ok' ||
      !legacyResult.pdfAudit.rawJson
    )
      return;
    void navigator.clipboard.writeText(legacyResult.pdfAudit.rawJson).then(() => {
      setCopiedAudit(true);
      setTimeout(() => setCopiedAudit(false), 2000);
    });
  };

  const handleCopyVisualJson = () => {
    if (legacyResult?.enrichment?.status !== 'ok' || !legacyResult.enrichment.rawJson) return;
    void navigator.clipboard.writeText(legacyResult.enrichment.rawJson).then(() => {
      setCopiedVisual(true);
      setTimeout(() => setCopiedVisual(false), 2000);
    });
  };

  const handleCopyV4Json = () => {
    if (!analysisResult || analysisResult.pipeline !== 'v4_unified') return;
    const textToCopy =
      v4JsonTab === 'normalized'
        ? JSON.stringify(analysisResult.data, null, 2)
        : v4JsonTab === 'raw'
        ? analysisResult.rawJson
        : JSON.stringify(
            {
              localIssues: analysisResult.localIssues,
              reviewFlags: analysisResult.reviewFlags,
              usage: analysisResult.usage,
              modelRequestCount: analysisResult.modelRequestCount,
              inputTransport: analysisResult.inputTransport,
              executionTimeMs: analysisResult.executionTimeMs,
              inferenceTimeMs: analysisResult.inferenceTimeMs,
              warnings: analysisResult.warnings,
            },
            null,
            2
          );
    void navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedV4Json(true);
      setTimeout(() => setCopiedV4Json(false), 2000);
    });
  };

  // Item selecionado para inspeção de overlay
  const selectedOverlayEntry = useMemo(() => {
    if (!selectedOverlayKey) return flatItems[0] || null;
    return flatItems.find((i) => i.itemKey === selectedOverlayKey) || flatItems[0] || null;
  }, [flatItems, selectedOverlayKey]);

  return (
    <div className="space-y-6">
      {/* Imagem invisível para geração de crops sob demanda (apenas para imagens) */}
      {previewUrl && !isPdf && (
        <img
          ref={hiddenImgRef}
          src={previewUrl}
          alt=""
          className="hidden"
          onLoad={() => {
            flatItems.forEach((entry) => {
              if (entry.visualItem?.photoBox) {
                ensureCrop(entry.itemKey, entry.visualItem.photoBox);
              }
            });
          }}
        />
      )}

      {/* Header Experimental */}
      <div className="rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 via-white to-pink-50 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-800">
                🧪 Lab IA V2 (Experimental)
              </span>
              <h1 className="text-base font-bold text-slate-900">
                Laboratório de leitura de cardápio por IA
              </h1>
            </div>
            <p className="text-xs font-medium text-slate-600">
              Extração textual com IA #1 (imagens ou PDFs) + classificação semântica e fotos com IA #2 (em imagens). Nada será salvo no banco.
            </p>
          </div>
          {selectedFile && (
            <button
              type="button"
              onClick={handleReset}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              Recomeçar
            </button>
          )}
        </div>
      </div>

      {/* Grid Principal: Upload/Arquivo e Resultado */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Upload e Visualização Original (4 cols) */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                {isPdf ? (
                  <FileText className="h-4 w-4 text-rose-500" />
                ) : (
                  <FileImage className="h-4 w-4 text-slate-500" />
                )}
                {isPdf ? 'Cardápio em PDF' : 'Imagem do Cardápio'}
              </h2>
              {selectedFile && (
                <span className="text-[11px] font-mono text-slate-500">
                  {selectedFile.size > 1024 * 1024
                    ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`
                    : `${(selectedFile.size / 1024).toFixed(0)} KB`}
                </span>
              )}
            </div>

            {!previewUrl ? (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-purple-500 bg-purple-50/50'
                    : 'border-slate-300 hover:border-purple-400 hover:bg-slate-50/70'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleSelectFile(e.target.files[0]);
                    }
                  }}
                />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 mb-3">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  Clique para escolher ou arraste o arquivo aqui
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Formatos aceitos: JPG, PNG, WEBP (máx. 3 MiB) ou PDF (máx. 20 MiB)
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {isPdf ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="inline-block rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold uppercase text-rose-800">
                          PDF selecionado
                        </span>
                        <h3 className="truncate text-xs font-bold text-slate-900 mt-0.5" title={selectedFile?.name}>
                          {selectedFile?.name}
                        </h3>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {((selectedFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>

                    {/* Preview com object e fallback amigável */}
                    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white h-[260px]">
                      <object
                        data={previewUrl}
                        type="application/pdf"
                        className="h-full w-full"
                      >
                        <div className="flex h-full flex-col items-center justify-center p-4 text-center text-xs text-slate-500">
                          <FileText className="h-8 w-8 text-slate-400 mb-2" />
                          <p className="font-semibold text-slate-700">Pré-visualização do PDF</p>
                          <p className="text-[11px] text-slate-400 mt-1">Clique abaixo para abrir o documento em nova aba.</p>
                        </div>
                      </object>
                    </div>

                    <div className="flex items-center justify-between pt-0.5">
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5 text-purple-600" />
                        Abrir PDF
                      </a>
                      <span className="text-[10px] text-slate-400">Visualização segura</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900/5 max-h-[460px] flex items-center justify-center">
                    <img
                      src={previewUrl}
                      alt="Preview do cardápio"
                      className="max-h-[440px] w-full object-contain"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                  <span className="truncate max-w-[200px] font-medium" title={selectedFile?.name}>
                    {selectedFile?.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={analyzing}
                    className="text-purple-600 font-semibold hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    {isPdf ? 'Trocar PDF' : 'Trocar imagem'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    disabled={analyzing}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        void handleSelectFile(e.target.files[0]);
                      }
                    }}
                  />
                </div>

                {/* Seletor de Pipeline A/B */}
                <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs px-0.5">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-purple-600" />
                      Pipeline IA
                    </span>
                    <span className="text-[10px] font-mono text-purple-700 font-semibold">
                      {selectedPipeline === 'v4_unified'
                        ? '1 inferência (Interactions)'
                        : 'Multi-pass (Legacy)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedPipeline('v4_unified')}
                      className={`rounded-lg py-1.5 px-2 text-xs font-bold transition-all cursor-pointer text-center ${
                        selectedPipeline === 'v4_unified'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      ⚡ V4 Unified
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPipeline('v3_2_legacy')}
                      className={`rounded-lg py-1.5 px-2 text-xs font-bold transition-all cursor-pointer text-center ${
                        selectedPipeline === 'v3_2_legacy'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      🧪 V3.2 Legacy
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 py-3 text-xs font-bold text-white shadow-md shadow-purple-600/20 transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Sparkles className="h-4 w-4" />
                  {analyzing
                    ? (isPdf
                        ? (analysisStage === 'uploading'
                            ? `Enviando PDF... (${elapsedSeconds}s)`
                            : `Analisando cardápio... (${elapsedSeconds}s)`)
                        : `Analisando cardápio e procurando fotos... (${elapsedSeconds}s)`)
                    : '✨ Analisar cardápio com IA'}
                </button>
              </div>
            )}

            {errorFeedback && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="font-bold">Não foi possível processar</p>
                  <p className="text-[11px] leading-relaxed">{errorFeedback}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Coluna Direita: Resultados e Abas V2 (8 cols) */}
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-4 min-h-[460px]">
            {/* Header de Navegação das 4 Abas */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('items')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'items'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 text-purple-600" />
                  Itens
                </button>

                {((isPdf && legacyResult?.pdfSemanticEnrichment) || analysisResult?.pipeline === 'v4_unified') && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('structure')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      activeTab === 'structure'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <GitFork className="h-3.5 w-3.5 text-indigo-600" />
                    Estrutura IA
                    {analysisResult?.pipeline === 'v4_unified' ? (
                      <span className="rounded-full bg-indigo-100 px-1.5 py-0.2 text-[10px] font-bold text-indigo-800">
                        {analysisResult.data.catalog.groups.length +
                          analysisResult.data.catalog.businessRules.length}
                      </span>
                    ) : (
                      legacyResult?.pdfSemanticEnrichment?.status === 'ok' && (
                        <span className="rounded-full bg-indigo-100 px-1.5 py-0.2 text-[10px] font-bold text-indigo-800">
                          {legacyResult.pdfSemanticEnrichment.data.groups.length +
                            legacyResult.pdfSemanticEnrichment.data.businessRules.length}
                        </span>
                      )
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveTab('photos')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'photos'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Camera className="h-3.5 w-3.5 text-teal-600" />
                  Fotos IA
                  {analysisResult?.pipeline === 'v4_unified' ? (
                    candidatePhotosCount > 0 ? (
                      <span className="rounded-full bg-teal-100 px-1.5 py-0.2 text-[10px] font-bold text-teal-800">
                        {candidatePhotosCount}
                      </span>
                    ) : null
                  ) : isPdf ? (
                    candidatePhotosCount > 0 ? (
                      <span
                        className="rounded-full bg-teal-100 px-1.5 py-0.2 text-[10px] font-bold text-teal-800"
                        title={`${candidatePhotosCount} produtos/combos com foto (${pdfPhotoMetrics?.found ?? 0} no PDF)`}
                      >
                        {candidatePhotosCount}
                      </span>
                    ) : null
                  ) : (
                    metrics.suggestedPhotos > 0 ? (
                      <span className="rounded-full bg-teal-100 px-1.5 py-0.2 text-[10px] font-bold text-teal-800">
                        {metrics.suggestedPhotos}
                      </span>
                    ) : null
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('overlay')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'overlay'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5 text-blue-600" />
                  {isPdf ? 'Ver na página' : 'Imagem original'}
                </button>
                {((isPdf && legacyResult?.pdfAudit) || analysisResult?.pipeline === 'v4_unified') && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('audit')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      activeTab === 'audit'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                    {analysisResult?.pipeline === 'v4_unified' ? 'Validação IA' : 'Auditoria IA'}
                    {analysisResult?.pipeline === 'v4_unified' ? (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                          analysisResult.localIssues.length + analysisResult.reviewFlags.length === 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {analysisResult.localIssues.length + analysisResult.reviewFlags.length}
                      </span>
                    ) : (
                      legacyResult?.pdfAudit?.status === 'ok' && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                            legacyResult.pdfAudit.data.issues.length === 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {legacyResult.pdfAudit.data.issues.length}
                        </span>
                      )
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('json')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'json'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <code className="text-xs font-bold text-slate-700">{'{}'}</code>
                  JSON
                </button>
              </div>

              {analysisResult && (
                analysisResult.pipeline === 'v4_unified' ? (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono">
                    <span className="inline-flex items-center gap-1 font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded text-[10px]" title="Pipeline experimental V4">
                      ⚡ V4 Unified (1 req)
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1" title="Tempo total percebido">
                      <Clock className="h-3 w-3 text-slate-400" />
                      Total: {analysisResult.executionTimeMs < 1000
                        ? `${analysisResult.executionTimeMs}ms`
                        : `${(analysisResult.executionTimeMs / 1000).toFixed(1)}s`}
                    </span>
                    <span>•</span>
                    <span className="text-slate-600 font-medium" title="Tempo de inferência no Gemini">
                      Inferência: {(analysisResult.inferenceTimeMs / 1000).toFixed(1)}s
                    </span>
                    <span>•</span>
                    <span className="text-slate-500" title="Transporte de entrada">
                      {analysisResult.inputTransport === 'signed_url' ? 'Signed URL (PDF)' : 'Inline base64'}
                    </span>
                    {analysisResult.usage && (
                      <>
                        <span>•</span>
                        <span className="text-slate-500" title="Tokens utilizados">
                          Tokens: {analysisResult.usage.totalTokens ?? '-'} ({analysisResult.usage.inputTokens ?? '-'} in / {analysisResult.usage.outputTokens ?? '-'} out)
                        </span>
                      </>
                    )}
                    <span>•</span>
                    <span className="font-semibold text-slate-700">{analysisResult.model}</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono">
                    <span className="flex items-center gap-1" title="Tempo total percebido">
                      <Clock className="h-3 w-3 text-slate-400" />
                      Total: {analysisResult.executionTimeMs < 1000
                        ? `${analysisResult.executionTimeMs}ms`
                        : `${(analysisResult.executionTimeMs / 1000).toFixed(1)}s`}
                    </span>
                    <span>•</span>
                    <span className="text-slate-400" title={isPdf ? 'Tempo de extração, estrutura semântica, fotos e auditoria' : 'Extração / Visual'}>
                      {isPdf ? (
                        <>
                          Extração: {(analysisResult.extractionExecutionTimeMs / 1000).toFixed(1)}s
                          {analysisResult.pdfSemanticEnrichment?.status === 'ok'
                            ? ` | Estrutura: ${(analysisResult.pdfSemanticEnrichment.executionTimeMs / 1000).toFixed(1)}s`
                            : ''}
                          {analysisResult.pdfPhotoEnrichment?.status === 'ok'
                            ? ` | Fotos: ${(analysisResult.pdfPhotoEnrichment.executionTimeMs / 1000).toFixed(1)}s`
                            : ''}
                          {analysisResult.pdfAudit?.status === 'ok'
                            ? ` | Auditoria: ${(analysisResult.pdfAudit.executionTimeMs / 1000).toFixed(1)}s`
                            : ''}
                        </>
                      ) : (
                        <>
                          T1: {(analysisResult.extractionExecutionTimeMs / 1000).toFixed(1)}s
                          {analysisResult.enrichment?.status === 'ok'
                            ? ` | T2: ${(analysisResult.enrichment.executionTimeMs / 1000).toFixed(1)}s`
                            : ''}
                        </>
                      )}
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-slate-700">{analysisResult.model}</span>
                  </div>
                )
              )}
            </div>

            {/* Aviso quando a chamada semântica de PDF falhou isoladamente */}
            {legacyResult?.pdfSemanticEnrichment?.status === 'failed' && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <p className="font-bold">Interpretação da estrutura comercial não finalizada</p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    A leitura do PDF foi concluída com sucesso, mas a interpretação da estrutura comercial não pôde ser finalizada.
                    ({legacyResult.pdfSemanticEnrichment.error.message || 'Erro no modelo semântico'})
                  </p>
                </div>
              </div>
            )}

            {/* Aviso quando a detecção de fotos de PDF falhou isoladamente */}
            {legacyResult?.pdfPhotoEnrichment?.status === 'failed' && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <p className="font-bold">Detecção de fotos no PDF não finalizada</p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    A leitura e estrutura do PDF foram concluídas com sucesso, mas a detecção visual de fotos não pôde ser finalizada.
                    ({legacyResult.pdfPhotoEnrichment.error.message || 'Erro no modelo visual de fotos'})
                  </p>
                </div>
              </div>
            )}

            {/* Aviso quando a auditoria de PDF falhou isoladamente */}
            {legacyResult?.pdfAudit?.status === 'failed' && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <p className="font-bold">Auditoria de cobertura não concluída</p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    A extração do cardápio e fotos foi concluída com sucesso, mas a auditoria de cobertura encontrou uma instabilidade.
                    ({legacyResult.pdfAudit.error.message || 'Erro no serviço de auditoria'})
                  </p>
                </div>
              </div>
            )}

            {/* Aviso quando a chamada visual de imagem falhou isoladamente */}
            {legacyResult?.enrichment?.status === 'failed' && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <p className="font-bold">Análise visual não finalizada</p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    A leitura do cardápio foi concluída com sucesso, mas a análise visual das fotos não pôde ser finalizada.
                    ({legacyResult.enrichment.error.message || 'Erro no modelo visual'})
                  </p>
                </div>
              </div>
            )}

            {/* Estado de Carregamento */}
            {analyzing && (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                <div className="relative">
                  <div className="h-10 w-10 animate-spin rounded-full border-3 border-purple-200 border-t-purple-600" />
                  <Sparkles className="h-4 w-4 text-purple-600 absolute inset-0 m-auto" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    {isPdf
                      ? 'O Gemini está processando as páginas do PDF...'
                      : 'O Gemini está processando a leitura e a análise visual...'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Tempo decorrido: {elapsedSeconds} segundo{elapsedSeconds !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}

            {/* Estado Vazio */}
            {!analyzing && !analysisResult && (
              <div className="flex flex-col items-center justify-center py-24 text-center space-y-2 text-slate-400">
                <FileText className="h-12 w-12 stroke-1 text-slate-300" />
                <p className="text-xs font-medium text-slate-500">
                  Envie uma imagem e clique em "Analisar cardápio com IA" para avaliar a extração e fotos.
                </p>
              </div>
            )}

            {/* Conteúdo com Resultado */}
            {!analyzing && analysisResult && (
              <>
                {/* Caso Imagem Não Seja Cardápio */}
                {!analysisResult.data.isMenu ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Não foi possível identificar um cardápio nesta imagem.
                    </div>
                    {analysisResult.data.warnings?.length > 0 && (
                      <ul className="text-xs text-amber-700 list-disc list-inside space-y-1 pl-1">
                        {analysisResult.data.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : analysisResult.pipeline === 'v4_unified' ? (
                  <V4LabView
                    v4Result={analysisResult}
                    isPdf={isPdf}
                    activeTab={activeTab}
                    cropPreviews={cropPreviews}
                    pdfPagePreviews={pdfPagePreviews}
                    v4JsonTab={v4JsonTab}
                    setV4JsonTab={setV4JsonTab}
                    copiedV4Json={copiedV4Json}
                    handleCopyV4Json={handleCopyV4Json}
                  />
                ) : (
                  <>
                    {/* Barra de Métricas Aprimoradas da V2 */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
                        <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
                          <Layers className="h-3 w-3 text-purple-600" /> Categorias
                        </span>
                        <span className="text-base font-bold text-slate-900 mt-0.5 block">
                          {metrics.categoriesCount}
                        </span>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
                        <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
                          <ShoppingBag className="h-3 w-3 text-emerald-600" /> Itens
                        </span>
                        <span className="text-base font-bold text-slate-900 mt-0.5 block">
                          {metrics.itemsCount}
                        </span>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
                        <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
                          <Tag className="h-3 w-3 text-blue-600" /> Preços OK
                        </span>
                        <span className="text-base font-bold text-slate-900 mt-0.5 block">
                          {metrics.identifiedPrices}
                        </span>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center" title="Itens com alertas textuais, fotos ambíguas ou preços a confirmar">
                        <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-amber-600" /> Pendências dados
                        </span>
                        <span className={`text-base font-bold mt-0.5 block ${metrics.dataPendingCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                          {metrics.dataPendingCount}
                        </span>
                      </div>
                      {isPdf ? (
                        <>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center" title="Páginas do PDF onde itens foram identificados pela IA">
                            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
                              <FileText className="h-3 w-3 text-purple-600" /> Páginas c/ itens
                            </span>
                            <span className="text-base font-bold text-purple-700 mt-0.5 block">
                              {distinctPagesCount} {distinctPagesCount === 1 ? 'pág.' : 'págs.'}
                            </span>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center"
                            title={`Fotos de produtos/combos: ${candidatePhotosCount} | Total detectado no PDF: ${pdfPhotoMetrics?.found ?? 0}`}
                          >
                            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
                              <Camera className="h-3 w-3 text-teal-600" /> Fotos Produtos
                            </span>
                            <span className="text-base font-bold text-teal-700 mt-0.5 block">
                              {analysisResult.pdfPhotoEnrichment?.status === 'failed'
                                ? 'Falha'
                                : candidatePhotosCount}
                            </span>
                            {pdfPhotoMetrics && pdfPhotoMetrics.found > 0 && (
                              <span
                                className="text-[10px] text-slate-500 font-medium block"
                                title="Sabores secundários e opções não geram fotos de catálogo"
                              >
                                de {pdfPhotoMetrics.found} no PDF
                              </span>
                            )}
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center"
                            title="Fotos de produtos que ainda não receberam voto manual nesta sessão"
                          >
                            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
                              <HelpCircle className="h-3 w-3 text-purple-600" /> Não avaliadas
                            </span>
                            <span
                              className={`text-base font-bold mt-0.5 block ${
                                voteStats.pending > 0 ? 'text-purple-700 font-extrabold' : 'text-slate-700'
                              }`}
                            >
                              {voteStats.pending}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center" title="Total de fotos identificadas pelo Gemini">
                            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
                              <Camera className="h-3 w-3 text-teal-600" /> Fotos sugeridas
                            </span>
                            <span className="text-base font-bold text-teal-700 mt-0.5 block">
                              {metrics.suggestedPhotos}
                            </span>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center" title="Fotos sugeridas que ainda não receberam voto manual nesta sessão">
                            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
                              <HelpCircle className="h-3 w-3 text-purple-600" /> Não avaliadas
                            </span>
                            <span className={`text-base font-bold mt-0.5 block ${voteStats.pending > 0 ? 'text-purple-700 font-extrabold' : 'text-slate-700'}`}>
                              {voteStats.pending}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* =========================================================
                        ABA 1: ITENS (Com classificação semântica e badges)
                        ========================================================= */}
                    {activeTab === 'items' && (
                      <div className="space-y-4">
                        {analysisResult.data.categories.map((cat, catIdx) => (
                          <div
                            key={catIdx}
                            className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs"
                          >
                            <div className="bg-slate-50/80 px-3.5 py-2 border-b border-slate-100 flex items-center justify-between">
                              <h3 className="text-xs font-bold text-slate-900">
                                {cat.name || (
                                  <span className="text-slate-400 italic font-normal">
                                    Itens sem categoria definida
                                  </span>
                                )}
                              </h3>
                              <span className="text-[10px] font-semibold text-slate-500">
                                {cat.products?.length || 0} produto
                                {(cat.products?.length || 0) !== 1 ? 's' : ''}
                              </span>
                            </div>

                            <div className="divide-y divide-slate-100">
                              {cat.products?.map((prod, prodIdx) => {
                                const itemKey = `c${catIdx}-p${prodIdx}`;
                                const vItem = flatItems.find((i) => i.itemKey === itemKey)?.visualItem;
                                const sItem = semanticItemMap.get(itemKey);
                                const sGroup = sItem?.groupKey ? semanticGroupMap.get(sItem.groupKey) : null;
                                const inheritsParentPrice =
                                  sItem?.kind === 'option' && sGroup?.pricingBehavior === 'inherits_parent';
                                const effectiveKind =
                                  localKinds[itemKey] || sItem?.kind || vItem?.kind || 'product';
                                const kindMeta = KIND_LABELS[effectiveKind] || KIND_LABELS.product;

                                return (
                                  <div key={prodIdx} className="p-3 space-y-2">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="flex items-start gap-3">
                                        {/* Miniatura do recorte da foto (object-contain sem segundo crop) */}
                                        {cropPreviews[itemKey] ? (
                                          <div
                                            className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center p-0.5"
                                            title={`Foto recortada de ${prod.name}`}
                                          >
                                            <img
                                              src={cropPreviews[itemKey]}
                                              alt={prod.name}
                                              className="max-h-full max-w-full h-auto w-auto object-contain rounded"
                                            />
                                          </div>
                                        ) : isPdf && isRenderingPdfCrops && pdfPhotoItemMap.get(itemKey)?.photoBox && isCatalogPhotoCandidate(effectiveKind) ? (
                                          <div
                                            className="h-12 w-12 shrink-0 rounded-lg border border-dashed border-purple-200 bg-purple-50/50 flex flex-col items-center justify-center text-[9px] text-purple-600"
                                            title="Recortando foto da página do PDF..."
                                          >
                                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
                                          </div>
                                        ) : vItem?.photoBox ? (
                                          <div
                                            className="h-12 w-12 shrink-0 rounded-lg border border-dashed border-purple-200 bg-purple-50/50 flex flex-col items-center justify-center text-[9px] text-purple-600"
                                            title="Recortando foto..."
                                          >
                                            <Camera className="h-3.5 w-3.5" />
                                          </div>
                                        ) : null}

                                        <div className="space-y-0.5">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-xs font-bold text-slate-900">
                                              {prod.name}
                                            </p>
                                            {typeof prod.sourcePage === 'number' && prod.sourcePage >= 1 && (
                                              <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                                                Pág. {prod.sourcePage}
                                              </span>
                                            )}
                                            {/* Badge do tipo sugerido com select local */}
                                            <select
                                              value={effectiveKind}
                                              onChange={(e) =>
                                                setLocalKinds((prev) => ({
                                                  ...prev,
                                                  [itemKey]: e.target.value as ItemKind,
                                                }))
                                              }
                                              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold cursor-pointer transition-colors ${kindMeta.tone}`}
                                              title="Classificação sugerida pela IA (você pode alterar nesta sessão de teste)"
                                            >
                                              <option value="product">Produto</option>
                                              <option value="combo">Combo</option>
                                              <option value="addon">Adicional</option>
                                              <option value="option">Opção</option>
                                              <option value="informational">Informativo</option>
                                              <option value="unknown">Desconhecido</option>
                                            </select>

                                            {/* Badge de opção vinculada a grupo semântico */}
                                            {sItem?.kind === 'option' && sGroup && (
                                              <span
                                                className="rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-medium px-1.5 py-0.5 flex items-center gap-1"
                                                title={`Opção vinculada ao grupo "${sGroup.name}"`}
                                              >
                                                <ListTree className="h-3 w-3 text-blue-600" />
                                                {sGroup.name}
                                              </span>
                                            )}

                                            {/* Badge de relação da foto */}
                                            {(() => {
                                              const rel = isPdf
                                                ? pdfPhotoItemMap.get(itemKey)?.photoRelation
                                                : vItem?.photoRelation;
                                              if (rel && rel !== 'none') {
                                                return (
                                                  <span
                                                    className={`rounded-md ${PHOTO_RELATION_LABELS[rel]?.tone || ''} text-[9px] font-bold px-1.5 py-0.2`}
                                                  >
                                                    {PHOTO_RELATION_LABELS[rel]?.label}
                                                  </span>
                                                );
                                              }
                                              return null;
                                            })()}
                                          </div>
                                          {prod.description && (
                                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                              {prod.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      {((!isPdf && vItem?.photoBox) ||
                                        (isPdf &&
                                          pdfPhotoItemMap.get(itemKey)?.photoBox &&
                                          isCatalogPhotoCandidate(effectiveKind))) && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedOverlayKey(itemKey);
                                            setActiveTab('overlay');
                                          }}
                                          className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-bold text-purple-700 hover:bg-purple-100 transition-colors cursor-pointer"
                                        >
                                          <Eye className="h-3 w-3" />
                                          Ver foto
                                        </button>
                                      )}
                                    </div>

                                    {/* Badges de Preços e Variações */}
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                      {prod.prices && prod.prices.length > 0 ? (
                                        prod.prices.map((price, priceIdx) => {
                                          const formattedPrice =
                                            price.amountCents !== null && price.amountCents !== undefined
                                              ? (price.amountCents / 100).toLocaleString('pt-BR', {
                                                  style: 'currency',
                                                  currency: 'BRL',
                                                })
                                              : null;

                                          return (
                                            <div
                                              key={priceIdx}
                                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                                            >
                                              {price.prefix && (
                                                <span className="text-[10px] text-slate-500 font-medium">
                                                  {price.prefix}
                                                </span>
                                              )}
                                              {price.label && (
                                                <span className="font-bold text-purple-700 bg-purple-100/60 rounded px-1 text-[10px]">
                                                  {price.label}
                                                </span>
                                              )}
                                              <span
                                                className={`font-bold ${
                                                  formattedPrice
                                                    ? 'text-slate-900'
                                                    : inheritsParentPrice
                                                    ? 'text-blue-700 font-medium'
                                                    : 'text-amber-700 font-medium'
                                                }`}
                                              >
                                                {formattedPrice ||
                                                  (inheritsParentPrice
                                                    ? 'Preço herdado do produto'
                                                    : 'Preço pendente')}
                                              </span>
                                              {price.unit && (
                                                <span className="text-[10px] text-slate-500">
                                                  /{price.unit}
                                                </span>
                                              )}
                                              {price.rawText && price.rawText !== formattedPrice && (
                                                <span
                                                  className="text-[9px] text-slate-400 font-mono border-l border-slate-200 pl-1"
                                                  title={`Texto visto no cardápio: ${price.rawText}`}
                                                >
                                                  Lido: "{price.rawText}"
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })
                                      ) : inheritsParentPrice ? (
                                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/80 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                          <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                                          Preço herdado do produto principal
                                        </div>
                                      ) : (
                                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                          Preço pendente
                                        </div>
                                      )}
                                    </div>

                                    {/* Warnings específicos deste produto */}
                                    {(() => {
                                      const visibleWarnings = (prod.warnings || []).filter((pw) => {
                                        if (inheritsParentPrice) {
                                          const lower = pw.toLowerCase();
                                          if (lower.includes('preço') || lower.includes('preco')) return false;
                                        }
                                        return true;
                                      });
                                      if (visibleWarnings.length === 0) return null;
                                      return (
                                        <div className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800 space-y-0.5">
                                          {visibleWarnings.map((pw, pwi) => (
                                            <p key={pwi} className="flex items-center gap-1">
                                              <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                                              {pw}
                                            </p>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        {/* Textos Não Mapeados */}
                        {analysisResult.data.unmappedTexts?.length > 0 && (
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                            <p className="text-xs font-bold text-slate-700">
                              Textos não associados a produtos ({analysisResult.data.unmappedTexts.length}):
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {analysisResult.data.unmappedTexts.map((text, i) => (
                                <span
                                  key={i}
                                  className="inline-block rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 font-mono"
                                >
                                  {text}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* =========================================================
                        ABA 2: ESTRUTURA IA (Hierarquia Comercial, Grupos e Regras)
                        ========================================================= */}
                    {activeTab === 'structure' && (
                      <div className="space-y-5">
                        {!isPdf ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-8 text-center space-y-3">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                              <FolderTree className="h-6 w-6 stroke-1" />
                            </div>
                            <div className="max-w-md mx-auto space-y-1">
                              <p className="text-xs font-bold text-slate-800">
                                Interpretação semântica ativada para cardápios em PDF
                              </p>
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                A estruturação de produtos principais, grupos de opções (sabores com preço herdado), regras comerciais e descarte de ruídos é exclusiva para PDFs. Para imagens, utilize a aba Fotos IA.
                              </p>
                            </div>
                          </div>
                        ) : analysisResult.pdfSemanticEnrichment?.status === 'failed' ? (
                          <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-6 text-center space-y-2">
                            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                              <AlertCircle className="h-5 w-5" />
                            </div>
                            <p className="text-xs font-bold text-rose-800">
                              Falha na interpretação da estrutura semântica
                            </p>
                            <p className="text-[11px] text-rose-700 max-w-lg mx-auto leading-relaxed">
                              {analysisResult.pdfSemanticEnrichment.error?.message ||
                                'A IA não conseguiu interpretar a hierarquia de grupos e regras com segurança. A leitura textual literal dos itens foi preservada intacta na aba "Itens".'}
                            </p>
                          </div>
                        ) : semanticData ? (
                          <>
                            {/* Cards de Métricas da Estrutura */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                              <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 text-center">
                                <p className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider">
                                  Produtos Principais
                                </p>
                                <p className="mt-0.5 text-lg font-bold text-purple-900">
                                  {semanticMetrics?.mainProducts ?? 0}
                                </p>
                              </div>
                              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-center">
                                <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">
                                  Grupos de Opções
                                </p>
                                <p className="mt-0.5 text-lg font-bold text-blue-900">
                                  {semanticMetrics?.groupsCount ?? 0}
                                </p>
                              </div>
                              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-center">
                                <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wider">
                                  Opções / Sabores
                                </p>
                                <p className="mt-0.5 text-lg font-bold text-indigo-900">
                                  {semanticMetrics?.optionsCount ?? 0}
                                </p>
                              </div>
                              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-center">
                                <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">
                                  Regras Comerciais
                                </p>
                                <p className="mt-0.5 text-lg font-bold text-amber-900">
                                  {semanticMetrics?.rulesCount ?? 0}
                                </p>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-center">
                                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                                  Ruídos Descartados
                                </p>
                                <p className="mt-0.5 text-lg font-bold text-slate-800">
                                  {semanticMetrics?.ignoredCount ?? 0}
                                </p>
                              </div>
                            </div>

                            {/* Barra de Avaliação Manual da Sessão */}
                            <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-purple-50/40 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                              <div>
                                <span className="font-bold text-slate-900 block">
                                  Avaliação manual da estrutura hierárquica (sessão local):
                                </span>
                                <span className="text-[11px] text-slate-600">
                                  A IA agrupou corretamente os produtos pais, grupos de sabores e regras deste cardápio?
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setStructureVote('correct')}
                                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                                    structureVote === 'correct'
                                      ? 'bg-emerald-600 text-white shadow-sm'
                                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                                  }`}
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Estrutura Correta
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setStructureVote('partial')}
                                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                                    structureVote === 'partial'
                                      ? 'bg-amber-500 text-white shadow-sm'
                                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-amber-50 hover:text-amber-700'
                                  }`}
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Parcial
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setStructureVote('wrong')}
                                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                                    structureVote === 'wrong'
                                      ? 'bg-rose-600 text-white shadow-sm'
                                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-700'
                                  }`}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Errada
                                </button>
                              </div>
                            </div>

                            {/* Hierarquia Comercial: Produtos Principais, Grupos e Opções */}
                            <div className="space-y-4">
                              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                <Package className="h-4 w-4 text-purple-600" />
                                Produtos Principais e Opções Vinculadas
                              </h3>

                              {semanticData.items
                                .filter(
                                  (item) =>
                                    item.kind === 'product' ||
                                    item.kind === 'combo' ||
                                    item.parentItemKey === null
                                )
                                .map((sItem) => {
                                  const flatItem = flatItems.find((f) => f.itemKey === sItem.itemKey);
                                  if (!flatItem) return null;
                                  const prod = flatItem.product;
                                  const groups = semanticData.groups.filter(
                                    (g) => g.parentItemKey === sItem.itemKey
                                  );

                                  return (
                                    <div
                                      key={sItem.itemKey}
                                      className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden"
                                    >
                                      {/* Header do Produto Principal */}
                                      <div className="bg-slate-50/80 border-b border-slate-100 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-bold text-slate-900">
                                              {prod.name}
                                            </span>
                                            {typeof prod.sourcePage === 'number' && prod.sourcePage >= 1 && (
                                              <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                                                Pág. {prod.sourcePage}
                                              </span>
                                            )}
                                            {flatItem.categoryName && (
                                              <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                                {flatItem.categoryName}
                                              </span>
                                            )}
                                            {sItem.normalizedCategoryName && (
                                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200" title="Família/Categoria semântica normalizada">
                                                Família: {sItem.normalizedCategoryName}
                                              </span>
                                            )}
                                            {sItem.photoCandidatePages && sItem.photoCandidatePages.length > 0 && (
                                              <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200" title="Páginas onde o modelo buscou fotos">
                                                📷 Págs Foto: [{sItem.photoCandidatePages.join(', ')}]
                                              </span>
                                            )}
                                            {sItem.relatedPages && sItem.relatedPages.length > 0 && (
                                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200" title="Páginas de contexto do item">
                                                Págs: [{sItem.relatedPages.join(', ')}]
                                              </span>
                                            )}
                                            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">
                                              Produto Principal
                                            </span>
                                          </div>
                                          {prod.description && (
                                            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                              {prod.description}
                                            </p>
                                          )}
                                        </div>

                                        {/* Preços lidos do produto principal */}
                                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                          {prod.prices && prod.prices.length > 0 ? (
                                            prod.prices.map((price, pIdx) => {
                                              const formatted =
                                                price.amountCents !== null && price.amountCents !== undefined
                                                  ? (price.amountCents / 100).toLocaleString('pt-BR', {
                                                      style: 'currency',
                                                      currency: 'BRL',
                                                    })
                                                  : null;
                                              return (
                                                <span
                                                  key={pIdx}
                                                  className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-white px-2 py-1 text-xs font-bold text-purple-900"
                                                >
                                                  {price.label && (
                                                    <span className="text-[10px] font-medium text-purple-600">
                                                      {price.label}:
                                                    </span>
                                                  )}
                                                  {formatted || price.rawText || 'Sob consulta'}
                                                </span>
                                              );
                                            })
                                          ) : (
                                            <span className="text-xs text-slate-400 italic">
                                              Preço sob consulta
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Grupos de Opções deste Produto */}
                                      {groups.length > 0 ? (
                                        <div className="p-3.5 space-y-3 bg-slate-50/30">
                                          {groups.map((group) => {
                                            const options = group.itemKeys
                                              .map((optKey) => flatItems.find((f) => f.itemKey === optKey))
                                              .filter(Boolean);

                                            return (
                                              <div
                                                key={group.groupKey}
                                                className="rounded-lg border border-blue-200/70 bg-white p-3 space-y-2.5"
                                              >
                                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-50 pb-2">
                                                  <div className="flex flex-wrap items-center gap-2">
                                                    <FolderTree className="h-4 w-4 text-blue-600 shrink-0" />
                                                    <span className="text-xs font-bold text-slate-900">
                                                      {group.name}
                                                    </span>
                                                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-100">
                                                      {group.itemKeys.length} {group.itemKeys.length === 1 ? 'opção/sabor' : 'opções/sabores'}
                                                    </span>
                                                    {group.pricingBehavior === 'inherits_parent' && (
                                                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                                                        Preço herdado do produto
                                                      </span>
                                                    )}
                                                    {group.pricingBehavior === 'own_price_per_item' && (
                                                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                                                        Preço próprio por item
                                                      </span>
                                                    )}
                                                    {group.sourceGroupKeys && group.sourceGroupKeys.length > 0 && (
                                                      <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-mono text-purple-700 border border-purple-200" title="Chaves de evidência T1">
                                                        T1: [{group.sourceGroupKeys.join(', ')}]
                                                      </span>
                                                    )}
                                                    {group.selectionMode && group.selectionMode !== 'unknown' && (
                                                      <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-200">
                                                        Modo: {group.selectionMode === 'single' ? 'Única' : group.selectionMode === 'multiple' ? 'Múltipla' : 'Quantidade'}
                                                      </span>
                                                    )}
                                                    {group.required !== null && group.required !== undefined && (
                                                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                                                        group.required ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-700 border-slate-200'
                                                      }`}>
                                                        {group.required ? 'Obrigatório' : 'Opcional'}
                                                      </span>
                                                    )}
                                                    {(group.minimum !== null && group.minimum !== undefined) || (group.maximum !== null && group.maximum !== undefined) ? (
                                                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                                                        {group.minimum !== null && group.minimum !== undefined ? `Mín: ${group.minimum}` : ''}
                                                        {group.minimum !== null && group.minimum !== undefined && group.maximum !== null && group.maximum !== undefined ? ' • ' : ''}
                                                        {group.maximum !== null && group.maximum !== undefined ? `Máx: ${group.maximum}` : ''}
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                </div>

                                                {/* Grid de Opções / Sabores */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                  {options.map((opt) => {
                                                    if (!opt) return null;
                                                    return (
                                                      <div
                                                        key={opt.itemKey}
                                                        className="rounded-md border border-slate-200 bg-slate-50/50 p-2 text-xs space-y-0.5"
                                                      >
                                                        <div className="flex items-center justify-between gap-1">
                                                          <div className="flex items-center gap-1.5 min-w-0">
                                                            <span className="text-[9px] font-mono text-purple-700 font-bold bg-purple-50 px-1 rounded shrink-0">
                                                              {opt.itemKey}
                                                            </span>
                                                            <span className="font-bold text-slate-800 truncate">
                                                              {opt.product.name}
                                                            </span>
                                                          </div>
                                                          {typeof opt.product.sourcePage === 'number' && (
                                                            <span className="text-[9px] text-slate-400 font-mono shrink-0">
                                                              p.{opt.product.sourcePage}
                                                            </span>
                                                          )}
                                                        </div>
                                                        {opt.product.description && (
                                                          <p className="text-[10px] text-slate-500 leading-tight">
                                                            {opt.product.description}
                                                          </p>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <div className="p-3 text-[11px] text-slate-500 italic bg-white">
                                          Nenhum grupo de opções associado a este item (item simples).
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>

                            {/* Regras Comerciais e Operacionais Identificadas */}
                            {semanticData.businessRules.length > 0 && (
                              <div className="space-y-3">
                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                  <FileText className="h-4 w-4 text-amber-600" />
                                  Regras Comerciais e Operacionais Identificadas ({semanticData.businessRules.length})
                                </h3>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {semanticData.businessRules.map((rule, rIdx) => {
                                    const meta =
                                      BUSINESS_RULE_LABELS[rule.type] || {
                                        label: rule.type,
                                        tone: 'bg-slate-100 text-slate-800 border-slate-200',
                                      };

                                    return (
                                      <div
                                        key={rIdx}
                                        className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5 shadow-xs"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-1.5">
                                            <span
                                              className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${meta.tone}`}
                                            >
                                              {meta.label}
                                            </span>
                                            {rule.sourceRuleKey && (
                                              <span className="font-mono text-[9px] bg-purple-100 text-purple-800 px-1 py-0.5 rounded font-bold" title="Chave do bloco de regra na T1">
                                                {rule.sourceRuleKey}
                                              </span>
                                            )}
                                          </div>
                                          {typeof rule.sourcePage === 'number' && (
                                            <span className="text-[10px] font-mono text-slate-400">
                                              Pág. {rule.sourcePage}
                                            </span>
                                          )}
                                        </div>

                                        <p className="text-xs font-semibold text-slate-800 leading-snug">
                                          {rule.rawText ? `"${rule.rawText}"` : meta.label}
                                        </p>

                                        {rule.relatedItemKey && (
                                          <p className="text-[10px] text-blue-600">
                                            Vinculada ao item: {rule.relatedItemKey}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Ruídos Descartados / Textos Decorativos */}
                            {semanticData.ignoredTexts.length > 0 && (
                              <div className="space-y-3">
                                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                  <Filter className="h-4 w-4 text-slate-500" />
                                  Textos Ignorados / Ruídos Descartados ({semanticData.ignoredTexts.length})
                                </h3>

                                <div className="flex flex-wrap gap-2">
                                  {semanticData.ignoredTexts.map((item, ignIdx) => {
                                    const meta =
                                      IGNORED_TEXT_REASONS[item.reason] || {
                                        label: item.reason,
                                        tone: 'bg-slate-100 text-slate-700',
                                      };

                                    return (
                                      <div
                                        key={ignIdx}
                                        className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs flex items-center gap-2"
                                      >
                                        <span className="font-mono text-slate-700 text-[11px]">
                                          "{item.rawText}"
                                        </span>
                                        <span
                                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${meta.tone}`}
                                        >
                                          {meta.label}
                                        </span>
                                        {typeof item.sourcePage === 'number' && (
                                          <span className="text-[9px] text-slate-400 font-mono">
                                            p.{item.sourcePage}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Listas de Escolhas / Evidências T1 (candidateGroups) */}
                            {analysisResult.data.candidateGroups && analysisResult.data.candidateGroups.length > 0 && (
                              <div className="space-y-3">
                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                  <ListTree className="h-4 w-4 text-purple-600" />
                                  Listas de Escolhas e Sabores da T1 ({analysisResult.data.candidateGroups.length})
                                </h3>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {analysisResult.data.candidateGroups.map((cg) => (
                                    <div
                                      key={cg.groupKey}
                                      className="rounded-xl border border-purple-200/80 bg-white p-3.5 space-y-2 shadow-2xs"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-purple-50 pb-2">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-mono text-[10px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">
                                            {cg.groupKey}
                                          </span>
                                          <span className="text-xs font-bold text-slate-900">
                                            {cg.title || 'Lista de Opções'}
                                          </span>
                                        </div>
                                        <span className="text-[10px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                                          Pág. {cg.sourcePage}
                                        </span>
                                      </div>

                                      {cg.instruction && (
                                        <p className="text-[11px] text-slate-600 italic">
                                          "{cg.instruction}"
                                        </p>
                                      )}

                                      {cg.parentProductHint && (
                                        <p className="text-[10px] text-purple-700 font-medium">
                                          Produto associado: {cg.parentProductHint}
                                        </p>
                                      )}

                                      <div className="flex flex-wrap gap-1.5 pt-1">
                                        {cg.options.map((opt) => (
                                          <span
                                            key={opt.optionKey}
                                            className="inline-flex items-center gap-1 rounded bg-slate-50 border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 font-medium"
                                          >
                                            <span className="font-mono text-[9px] text-purple-700">
                                              {opt.optionKey}
                                            </span>
                                            <span>{opt.name}</span>
                                            {opt.amountCents !== null && (
                                              <span className="text-[10px] font-bold text-emerald-700">
                                                +{(opt.amountCents / 100).toLocaleString('pt-BR', {
                                                  style: 'currency',
                                                  currency: 'BRL',
                                                })}
                                              </span>
                                            )}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Cabeçalhos e Capas de Seção T1 (sectionHeadings) */}
                            {analysisResult.data.sectionHeadings && analysisResult.data.sectionHeadings.length > 0 && (
                              <div className="space-y-3">
                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                  <Bookmark className="h-4 w-4 text-indigo-600" />
                                  Títulos e Capas de Seção T1 ({analysisResult.data.sectionHeadings.length})
                                </h3>

                                <div className="flex flex-wrap gap-2">
                                  {analysisResult.data.sectionHeadings.map((sh) => (
                                    <div
                                      key={sh.headingKey}
                                      className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-1.5 text-xs flex items-center gap-2"
                                    >
                                      <span className="font-mono text-[10px] font-bold bg-indigo-100 text-indigo-800 px-1 rounded">
                                        {sh.headingKey}
                                      </span>
                                      <span className="font-semibold text-slate-800">
                                        {sh.text}
                                      </span>
                                      <span className="text-[10px] font-mono text-indigo-600">
                                        p.{sh.sourcePage}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Mapeamento de Cobertura de Páginas T1 (pageCoverage) */}
                            {analysisResult.data.pageCoverage && analysisResult.data.pageCoverage.length > 0 && (
                              <div className="space-y-3">
                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                  <Compass className="h-4 w-4 text-blue-600" />
                                  Cobertura de Páginas do Documento ({analysisResult.data.pageCoverage.length} páginas)
                                </h3>

                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                  {analysisResult.data.pageCoverage.map((pc) => (
                                    <div
                                      key={pc.pageNumber}
                                      className={`rounded-xl border p-2.5 text-center space-y-1 ${
                                        pc.hasCatalogEvidence
                                          ? 'border-emerald-200 bg-emerald-50/60'
                                          : 'border-slate-200 bg-slate-50/60'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold font-mono text-slate-700">
                                          Pág. {pc.pageNumber}
                                        </span>
                                        {pc.hasCatalogEvidence ? (
                                          <span className="rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1">
                                            Catálogo
                                          </span>
                                        ) : (
                                          <span className="rounded bg-slate-200 text-slate-600 text-[9px] font-semibold px-1">
                                            {pc.role}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] font-medium text-slate-700 truncate" title={pc.role}>
                                        Papel: {pc.role}
                                      </p>
                                      {pc.notes && (
                                        <p className="text-[9px] text-slate-500 truncate" title={pc.notes}>
                                          {pc.notes}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}

                    {/* =========================================================
                        ABA 3: FOTOS IA (Cards com recorte, relação e feedback)
                        ========================================================= */}
                    {activeTab === 'photos' && (
                      <div className="space-y-4">
                        {isPdf ? (
                          <div className="space-y-4">
                            {analysisResult.pdfPhotoEnrichment?.status === 'failed' ? (
                              <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-center space-y-3">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                                  <AlertTriangle className="h-6 w-6 stroke-1" />
                                </div>
                                <div className="max-w-md mx-auto space-y-1">
                                  <p className="text-xs font-bold text-amber-900">
                                    Detecção de fotos no PDF não pôde ser finalizada
                                  </p>
                                  <p className="text-[11px] text-amber-800 leading-relaxed">
                                    {analysisResult.pdfPhotoEnrichment.error.message ||
                                      'Falha ao processar a visão visual do documento pelo Gemini.'}
                                  </p>
                                  <p className="text-[10px] text-amber-700 mt-2">
                                    A extração textual (T1) e a interpretação estrutural (T2) foram preservadas com sucesso e estão acessíveis nas outras abas.
                                  </p>
                                </div>
                              </div>
                            ) : analysisResult.pdfPhotoEnrichment?.status === 'ok' && pdfPhotoData ? (
                              <>
                                {/* Banner explicativo de produto com regra de domínio */}
                                <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3.5 flex items-start gap-3 text-xs">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-600 text-white font-bold">
                                    <Camera className="h-4 w-4" />
                                  </div>
                                  <div className="space-y-1 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <h4 className="font-bold text-purple-950">
                                        Fotos de Produtos e Combos no PDF (Recorte com PDF.js)
                                      </h4>
                                      <span className="rounded-md bg-purple-200/80 px-2 py-0.5 text-[10px] font-bold text-purple-900">
                                        Regra de Domínio: Produtos Elegíveis
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-purple-800 leading-relaxed">
                                      Conforme regras de catálogo do Pode Vir, apenas <strong>produtos principais e combos</strong> possuem foto própria. As fotos de opções e sabores secundários ({pdfPhotoMetrics?.found ?? 0} detectadas pelo Gemini no documento) são mantidas no JSON bruto da T3 e não poluem a visão do catálogo.
                                    </p>
                                  </div>
                                </div>

                                {/* Barra de Avaliação Manual da Sessão no PDF */}
                                <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-purple-50/40 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                                  <div>
                                    <span className="font-bold text-slate-900 block">
                                      Avaliação manual desta sessão (salva apenas no browser):
                                    </span>
                                    <div className="flex flex-wrap items-center gap-3 mt-1 text-slate-600 text-[11px]">
                                      <span className="font-bold text-emerald-700 flex items-center gap-1">
                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                                        {voteStats.correct} corretas
                                      </span>
                                      <span>•</span>
                                      <span className="font-bold text-rose-700 flex items-center gap-1">
                                        <XCircle className="h-3.5 w-3.5 text-rose-600" />
                                        {voteStats.wrong} erradas
                                      </span>
                                      <span>•</span>
                                      <span className="font-bold text-amber-700 flex items-center gap-1">
                                        <HelpCircle className="h-3.5 w-3.5 text-amber-600" />
                                        {voteStats.uncertain} incertas
                                      </span>
                                      <span>•</span>
                                      <span className="text-slate-500">
                                        {voteStats.pending} ainda não avaliadas
                                      </span>
                                    </div>
                                  </div>

                                  {Object.keys(manualVotes).length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setManualVotes({})}
                                      className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                                    >
                                      Limpar avaliações
                                    </button>
                                  )}
                                </div>

                                {/* Grid de Cards Visuais dos Produtos e Combos Elegíveis */}
                                {pdfCatalogCandidates.length === 0 ? (
                                  <div className="py-12 text-center text-xs text-slate-400">
                                    Nenhum produto ou combo elegível a foto foi identificado no cardápio.
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {pdfCatalogCandidates.map((entry) => {
                                      const t3Item = pdfPhotoItemMap.get(entry.itemKey);
                                      const effectiveKind =
                                        localKinds[entry.itemKey] ||
                                        semanticItemMap.get(entry.itemKey)?.kind ||
                                        'product';
                                      const kindMeta = KIND_LABELS[effectiveKind] || KIND_LABELS.product;
                                      const currentVote = manualVotes[entry.itemKey];
                                      const cropUrl = cropPreviews[entry.itemKey];
                                      const cropError = pdfCropErrors[entry.itemKey];
                                      const isRenderingThis =
                                        isRenderingPdfCrops &&
                                        !cropUrl &&
                                        !cropError &&
                                        t3Item &&
                                        t3Item.photoRelation !== 'none';

                                      const firstPrice = entry.product.prices?.[0];
                                      const priceText =
                                        firstPrice?.amountCents !== null && firstPrice?.amountCents !== undefined
                                          ? (firstPrice.amountCents / 100).toLocaleString('pt-BR', {
                                              style: 'currency',
                                              currency: 'BRL',
                                            })
                                          : 'Preço pendente';

                                      const relationMeta = t3Item
                                        ? PHOTO_RELATION_LABELS[t3Item.photoRelation] || PHOTO_RELATION_LABELS.none
                                        : PHOTO_RELATION_LABELS.none;

                                      return (
                                        <div
                                          key={entry.itemKey}
                                          className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 shadow-2xs flex flex-col justify-between"
                                        >
                                          <div className="space-y-2">
                                            {/* Área do Recorte Visual */}
                                            <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-950/5 flex items-center justify-center p-1.5">
                                              {cropUrl ? (
                                                <img
                                                  src={cropUrl}
                                                  alt={entry.product.name}
                                                  className="max-h-full max-w-full h-auto w-auto object-contain rounded"
                                                />
                                              ) : isRenderingThis ? (
                                                <div className="flex flex-col items-center justify-center text-purple-600 text-[11px] gap-1 p-3 text-center">
                                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
                                                  Recortando foto da Pág. {t3Item?.pageNumber ?? 1}...
                                                </div>
                                              ) : cropError ? (
                                                <div className="flex flex-col items-center justify-center text-amber-700 text-[11px] gap-1 p-3 text-center">
                                                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                                                  <span className="font-semibold">{cropError}</span>
                                                </div>
                                              ) : t3Item && t3Item.photoRelation !== 'none' ? (
                                                <div className="flex flex-col items-center justify-center text-slate-400 text-[11px] gap-1 p-2 text-center">
                                                  <Camera className="h-6 w-6 stroke-1 text-slate-300" />
                                                  Foto identificada (Pág. {t3Item.pageNumber})
                                                </div>
                                              ) : (
                                                <div className="flex flex-col items-center justify-center text-slate-400 text-[11px] gap-1 p-2 text-center">
                                                  <ImageIcon className="h-6 w-6 stroke-1 text-slate-300" />
                                                  Nenhuma foto identificada
                                                </div>
                                              )}

                                              {/* Badges Flutuantes: Relação e Página */}
                                              <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                                                {t3Item && typeof t3Item.pageNumber === 'number' && (
                                                  <span className="rounded bg-slate-900/70 text-white text-[9px] font-mono font-semibold px-1.5 py-0.5 shadow-xs">
                                                    Pág. {t3Item.pageNumber}
                                                  </span>
                                                )}
                                                <span
                                                  className={`rounded-md ${relationMeta.tone} text-[9px] font-bold px-1.5 py-0.5 shadow-xs`}
                                                >
                                                  {relationMeta.label}
                                                </span>
                                              </div>
                                            </div>

                                            {/* Dados do Item */}
                                            <div className="space-y-1">
                                              <div className="flex items-center justify-between gap-1.5">
                                                <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${kindMeta.tone}`}>
                                                  {kindMeta.label}
                                                </span>
                                                <span className="text-xs font-bold text-slate-900">
                                                  {priceText}
                                                </span>
                                              </div>
                                              <h4 className="text-xs font-bold text-slate-900 truncate" title={entry.product.name}>
                                                {entry.product.name}
                                              </h4>
                                              {entry.categoryName && (
                                                <p className="text-[10px] text-slate-500 truncate">
                                                  {entry.categoryName}
                                                </p>
                                              )}
                                            </div>

                                            {/* Alerta de Foto se houver */}
                                            {t3Item?.photoWarning && (
                                              <div className="rounded-md bg-amber-50 p-1.5 text-[10px] text-amber-800 leading-tight">
                                                ⚠ {t3Item.photoWarning}
                                              </div>
                                            )}
                                          </div>

                                          {/* Ações e Feedback Manual */}
                                          <div className="pt-2 border-t border-slate-100 space-y-2">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSelectedOverlayKey(entry.itemKey);
                                                setActiveTab('overlay');
                                              }}
                                              className="w-full inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                            >
                                              <Eye className="h-3 w-3 text-purple-600" />
                                              Ver na página do PDF
                                            </button>

                                            {/* Botões de Voto da Sessão */}
                                            <div className="grid grid-cols-3 gap-1 pt-1">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setManualVotes((prev) => ({
                                                    ...prev,
                                                    [entry.itemKey]: 'correct',
                                                  }))
                                                }
                                                className={`rounded-md py-1 text-[10px] font-bold border transition-colors cursor-pointer ${
                                                  currentVote === 'correct'
                                                    ? 'bg-emerald-600 text-white border-emerald-700'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                                                }`}
                                              >
                                                ✓ Correta
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setManualVotes((prev) => ({
                                                    ...prev,
                                                    [entry.itemKey]: 'wrong',
                                                  }))
                                                }
                                                className={`rounded-md py-1 text-[10px] font-bold border transition-colors cursor-pointer ${
                                                  currentVote === 'wrong'
                                                    ? 'bg-rose-600 text-white border-rose-700'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                                                }`}
                                              >
                                                ✕ Errada
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setManualVotes((prev) => ({
                                                    ...prev,
                                                    [entry.itemKey]: 'uncertain',
                                                  }))
                                                }
                                                className={`rounded-md py-1 text-[10px] font-bold border transition-colors cursor-pointer ${
                                                  currentVote === 'uncertain'
                                                    ? 'bg-amber-600 text-white border-amber-700'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                                                }`}
                                              >
                                                ? Incerta
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Seção Expansível de Auditoria Completa da T3 */}
                                <details className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs group">
                                  <summary className="bg-slate-50/80 px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between cursor-pointer select-none">
                                    <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                      <span>🔍</span>
                                      Auditoria técnica da T3: todas as {pdfPhotoData.items.length} fotos detectadas no PDF
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-medium group-open:rotate-180 transition-transform">
                                      ▼
                                    </span>
                                  </summary>

                                  <div className="p-3 space-y-3">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
                                      <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
                                        <span className="text-[10px] font-semibold uppercase text-slate-500 block">Total avaliado</span>
                                        <span className="text-sm font-bold text-slate-900 mt-0.5 block">{pdfPhotoMetrics?.total ?? 0}</span>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
                                        <span className="text-[10px] font-semibold uppercase text-slate-500 block">Fotos no PDF</span>
                                        <span className="text-sm font-bold text-teal-700 mt-0.5 block">{pdfPhotoMetrics?.found ?? 0}</span>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
                                        <span className="text-[10px] font-semibold uppercase text-slate-500 block">Diretas</span>
                                        <span className="text-sm font-bold text-emerald-700 mt-0.5 block">{pdfPhotoMetrics?.direct ?? 0}</span>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
                                        <span className="text-[10px] font-semibold uppercase text-slate-500 block">Compartilhadas</span>
                                        <span className="text-sm font-bold text-blue-700 mt-0.5 block">{pdfPhotoMetrics?.shared ?? 0}</span>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
                                        <span className="text-[10px] font-semibold uppercase text-slate-500 block">Ambíguas</span>
                                        <span className="text-sm font-bold text-amber-700 mt-0.5 block">{pdfPhotoMetrics?.ambiguous ?? 0}</span>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
                                        <span className="text-[10px] font-semibold uppercase text-slate-500 block">Sem foto</span>
                                        <span className="text-sm font-bold text-slate-600 mt-0.5 block">{pdfPhotoMetrics?.none ?? 0}</span>
                                      </div>
                                    </div>

                                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                                      {pdfPhotoData.items.map((item) => {
                                        const flatEntry = flatItems.find((f) => f.itemKey === item.itemKey);
                                        const sItem = semanticItemMap.get(item.itemKey);
                                        const kind = localKinds[item.itemKey] || sItem?.kind || 'product';
                                        const kindMeta = KIND_LABELS[kind] || KIND_LABELS.product;
                                        const relationMeta = PHOTO_RELATION_LABELS[item.photoRelation] || PHOTO_RELATION_LABELS.none;
                                        const hasBox = Array.isArray(item.photoBox) && item.photoBox.length === 4;

                                        return (
                                          <div
                                            key={item.itemKey}
                                            className="p-2.5 hover:bg-slate-50/60 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs"
                                          >
                                            <div className="space-y-0.5 flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-[10px] font-semibold text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200">
                                                  {item.itemKey}
                                                </span>
                                                <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${kindMeta.tone}`}>
                                                  {kindMeta.label}
                                                </span>
                                                <h4 className="font-bold text-slate-900 truncate">
                                                  {flatEntry?.product.name || `Item ${item.itemKey}`}
                                                </h4>
                                              </div>
                                              {item.photoWarning && (
                                                <p className="text-[10px] text-amber-700 bg-amber-50 p-1 rounded border border-amber-200 mt-0.5">
                                                  ⚠ {item.photoWarning}
                                                </p>
                                              )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                              <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                                {item.pageNumber !== null ? `Pág. ${item.pageNumber}` : 'Pág. —'}
                                              </span>
                                              <span className={`rounded-md ${relationMeta.tone} text-[9px] font-bold px-1.5 py-0.5 shadow-2xs`}>
                                                {relationMeta.label}
                                              </span>
                                              <div className="font-mono text-[10px] text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded min-w-[120px] text-center">
                                                {hasBox ? `[${item.photoBox!.join(', ')}]` : '—'}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </details>
                              </>
                            ) : (
                              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-8 text-center space-y-2">
                                <Camera className="h-8 w-8 mx-auto text-slate-400" />
                                <p className="text-xs font-bold text-slate-700">Detecção de fotos não disponível</p>
                                <p className="text-[11px] text-slate-500">
                                  A detecção visual de fotos é executada após a interpretação estrutural do PDF.
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            {/* Barra de Avaliação Manual da Sessão */}
                            <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-purple-50/40 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                              <div>
                                <span className="font-bold text-slate-900 block">
                                  Avaliação manual desta sessão (salva apenas no browser):
                                </span>
                                <div className="flex flex-wrap items-center gap-3 mt-1 text-slate-600 text-[11px]">
                                  <span className="font-bold text-emerald-700 flex items-center gap-1">
                                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                                    {voteStats.correct} corretas
                                  </span>
                                  <span>•</span>
                                  <span className="font-bold text-rose-700 flex items-center gap-1">
                                    <XCircle className="h-3.5 w-3.5 text-rose-600" />
                                    {voteStats.wrong} erradas
                                  </span>
                                  <span>•</span>
                                  <span className="font-bold text-amber-700 flex items-center gap-1">
                                    <HelpCircle className="h-3.5 w-3.5 text-amber-600" />
                                    {voteStats.uncertain} incertas
                                  </span>
                                  <span>•</span>
                                  <span className="text-slate-500">
                                    {voteStats.pending} ainda não avaliadas
                                  </span>
                                </div>
                              </div>

                              {Object.keys(manualVotes).length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setManualVotes({})}
                                  className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                                >
                                  Limpar avaliações
                                </button>
                              )}
                            </div>

                        {/* Filtros Rápidos */}
                        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-2">
                          {[
                            { id: 'all', label: 'Todos' },
                            { id: 'with_photo', label: 'Com foto' },
                            { id: 'without_photo', label: 'Sem foto' },
                            { id: 'ambiguous', label: 'Foto ambígua' },
                            { id: 'review', label: 'Pendências' },
                            { id: 'products', label: 'Produtos' },
                            { id: 'combos', label: 'Combos' },
                            { id: 'addons', label: 'Adicionais' },
                            { id: 'options', label: 'Opções' },
                          ].map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setPhotoFilter(f.id as PhotoFilter)}
                              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                                photoFilter === f.id
                                  ? 'bg-purple-600 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>

                        {/* Grid de Cards de Fotos */}
                        {filteredPhotoItems.length === 0 ? (
                          <div className="py-12 text-center text-xs text-slate-400">
                            Nenhum item corresponde ao filtro selecionado.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {filteredPhotoItems.map((entry) => {
                              const v = entry.visualItem;
                              const effectiveKind = localKinds[entry.itemKey] || v?.kind || 'product';
                              const kindMeta = KIND_LABELS[effectiveKind] || KIND_LABELS.product;
                              const currentVote = manualVotes[entry.itemKey];
                              const cropUrl = cropPreviews[entry.itemKey];

                              const firstPrice = entry.product.prices?.[0];
                              const priceText =
                                firstPrice?.amountCents !== null && firstPrice?.amountCents !== undefined
                                  ? (firstPrice.amountCents / 100).toLocaleString('pt-BR', {
                                      style: 'currency',
                                      currency: 'BRL',
                                    })
                                  : 'Preço pendente';

                              return (
                                <div
                                  key={entry.itemKey}
                                  className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 shadow-2xs flex flex-col justify-between"
                                >
                                  {/* Área do Recorte Visual - object-contain para não aplicar segundo crop */}
                                  <div className="space-y-2">
                                    <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-950/5 flex items-center justify-center p-1.5">
                                      {cropUrl ? (
                                        <img
                                          src={cropUrl}
                                          alt={entry.product.name}
                                          className="max-h-full max-w-full h-auto w-auto object-contain rounded"
                                        />
                                      ) : v?.photoBox ? (
                                        <div className="flex flex-col items-center justify-center text-purple-600 text-[11px] gap-1">
                                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
                                          Recortando...
                                        </div>
                                      ) : (
                                        <div className="flex flex-col items-center justify-center text-slate-400 text-[11px] gap-1 p-2 text-center">
                                          <ImageIcon className="h-6 w-6 stroke-1 text-slate-300" />
                                          Nenhuma foto identificada
                                        </div>
                                      )}

                                      {/* Badge de Relação da Foto */}
                                      {v && (
                                        <div className="absolute top-1.5 right-1.5">
                                          <span
                                            className={`rounded-md ${PHOTO_RELATION_LABELS[v.photoRelation]?.tone || 'bg-slate-700/80 text-white'} text-[9px] font-bold px-1.5 py-0.5 shadow-xs`}
                                          >
                                            {PHOTO_RELATION_LABELS[v.photoRelation]?.label || 'Sem foto'}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Dados do Item */}
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between gap-1.5">
                                        <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${kindMeta.tone}`}>
                                          {kindMeta.label}
                                        </span>
                                        <span className="text-xs font-bold text-slate-900">
                                          {priceText}
                                        </span>
                                      </div>
                                      <h4 className="text-xs font-bold text-slate-900 truncate" title={entry.product.name}>
                                        {entry.product.name}
                                      </h4>
                                      {entry.categoryName && (
                                        <p className="text-[10px] text-slate-500 truncate">
                                          {entry.categoryName}
                                        </p>
                                      )}
                                    </div>

                                    {/* Alerta de Foto se houver */}
                                    {v?.photoWarning && (
                                      <div className="rounded-md bg-amber-50 p-1.5 text-[10px] text-amber-800 leading-tight">
                                        ⚠ {v.photoWarning}
                                      </div>
                                    )}
                                  </div>

                                  {/* Ações e Feedback Manual */}
                                  <div className="pt-2 border-t border-slate-100 space-y-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedOverlayKey(entry.itemKey);
                                        setActiveTab('overlay');
                                      }}
                                      className="w-full inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                    >
                                      <Eye className="h-3 w-3 text-purple-600" />
                                      Ver na imagem original
                                    </button>

                                    {/* Botões de Voto da Sessão */}
                                    <div className="grid grid-cols-3 gap-1 pt-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setManualVotes((prev) => ({
                                            ...prev,
                                            [entry.itemKey]: 'correct',
                                          }))
                                        }
                                        className={`rounded-md py-1 text-[10px] font-bold border transition-colors cursor-pointer ${
                                          currentVote === 'correct'
                                            ? 'bg-emerald-600 text-white border-emerald-700'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                                        }`}
                                      >
                                        ✓ Correta
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setManualVotes((prev) => ({
                                            ...prev,
                                            [entry.itemKey]: 'wrong',
                                          }))
                                        }
                                        className={`rounded-md py-1 text-[10px] font-bold border transition-colors cursor-pointer ${
                                          currentVote === 'wrong'
                                            ? 'bg-rose-600 text-white border-rose-700'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                                        }`}
                                      >
                                        ✕ Errada
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setManualVotes((prev) => ({
                                            ...prev,
                                            [entry.itemKey]: 'uncertain',
                                          }))
                                        }
                                        className={`rounded-md py-1 text-[10px] font-bold border transition-colors cursor-pointer ${
                                          currentVote === 'uncertain'
                                            ? 'bg-amber-600 text-white border-amber-700'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                                        }`}
                                      >
                                        ? Incerta
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                    {/* =========================================================
                        ABA 3: ARQUIVO ORIGINAL / OVERLAY (PDF viewer ou bounding boxes)
                        ========================================================= */}
                    {activeTab === 'overlay' && (
                      <div className="space-y-4">
                        {isPdf ? (
                          <div className="space-y-3">
                            {/* Barra de Controles e Seletor do Item para PDF */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-slate-700">
                                  Item em destaque:
                                </span>
                                <select
                                  value={selectedOverlayKey || ''}
                                  onChange={(e) => setSelectedOverlayKey(e.target.value)}
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none"
                                >
                                  {pdfCatalogCandidates.map((item) => {
                                    const pPhoto = pdfPhotoItemMap.get(item.itemKey);
                                    const relLabel = pPhoto
                                      ? PHOTO_RELATION_LABELS[pPhoto.photoRelation]?.label || 'Sem foto'
                                      : 'Sem foto';
                                    const pageLabel = pPhoto?.pageNumber ? `Pág. ${pPhoto.pageNumber}` : '';
                                    return (
                                      <option key={item.itemKey} value={item.itemKey}>
                                        {item.product.name} {pageLabel ? `(${pageLabel} - ${relLabel})` : `(${relLabel})`}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {pdfPagePreviews[selectedOverlayEntry?.product.sourcePage || pdfPhotoItemMap.get(selectedOverlayEntry?.itemKey || '')?.pageNumber || 1] && (
                                  <div className="flex items-center rounded-lg border border-slate-300 bg-white p-0.5 text-xs">
                                    <button
                                      type="button"
                                      onClick={() => setPdfOverlayMode('annotated')}
                                      className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                                        pdfOverlayMode === 'annotated'
                                          ? 'bg-purple-600 text-white shadow-2xs'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      Página anotada
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPdfOverlayMode('native')}
                                      className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                                        pdfOverlayMode === 'native'
                                          ? 'bg-purple-600 text-white shadow-2xs'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      PDF completo
                                    </button>
                                  </div>
                                )}

                                {previewUrl && (
                                  <a
                                    href={previewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 transition-colors shadow-2xs cursor-pointer"
                                  >
                                    <Eye className="h-3.5 w-3.5 text-purple-600" />
                                    Abrir em nova aba
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Visualizador Anotado da Página do PDF */}
                            {(() => {
                              const t3Photo = pdfPhotoItemMap.get(selectedOverlayEntry?.itemKey || '');
                              const targetPage = t3Photo?.pageNumber ?? selectedOverlayEntry?.product.sourcePage ?? 1;
                              const pageDataUrl = pdfPagePreviews[targetPage];

                              if (pdfOverlayMode === 'annotated' && pageDataUrl) {
                                return (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between px-1 text-xs text-slate-600">
                                      <span className="font-semibold">
                                        Página {targetPage} renderizada em alta resolução via Canvas (PDF.js):
                                      </span>
                                      {t3Photo?.photoRelation !== 'none' && t3Photo?.photoBox && (
                                        <span className="inline-flex items-center gap-1 font-semibold text-purple-700">
                                          <span className="h-2.5 w-2.5 rounded border border-purple-600 bg-purple-600/30" />
                                          Região detectada pela IA (photoBox)
                                        </span>
                                      )}
                                    </div>

                                    <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-slate-900/5 max-h-[640px] flex items-center justify-center">
                                      <div className="relative inline-block max-h-[620px] max-w-full">
                                        <img
                                          src={pageDataUrl}
                                          alt={`Página ${targetPage} do PDF`}
                                          className="max-h-[620px] w-auto object-contain block"
                                        />

                                        {/* Bounding Box da Foto no PDF */}
                                        {t3Photo?.photoBox && (() => {
                                          const pos = boxToPercent(t3Photo.photoBox);
                                          return (
                                            <div
                                              style={{
                                                top: pos.top,
                                                left: pos.left,
                                                width: pos.width,
                                                height: pos.height,
                                              }}
                                              className="absolute border-2 border-purple-600 bg-purple-600/25 pointer-events-none transition-all z-20 shadow-md"
                                            >
                                              <span className="absolute -bottom-5 left-0 rounded bg-purple-700 text-white text-[9px] font-bold px-1 py-0.2 whitespace-nowrap shadow-xs">
                                                Foto: {selectedOverlayEntry?.product.name} (Pág. {targetPage})
                                              </span>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              // Fallback ou modo nativo
                              return previewUrl ? (
                                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-100 min-h-[500px]">
                                  <object
                                    data={previewUrl}
                                    type="application/pdf"
                                    className="w-full h-[620px] border-none"
                                  >
                                    <div className="p-10 text-center space-y-3">
                                      <p className="text-xs text-slate-600">
                                        Seu navegador não exibiu a prévia do PDF diretamente.
                                      </p>
                                      <a
                                        href={previewUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        Abrir PDF no navegador
                                      </a>
                                    </div>
                                  </object>
                                </div>
                              ) : null;
                            })()}
                          </div>
                        ) : (
                          <>
                            {/* Seletor do Item em foco */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-700">
                                  Item em destaque:
                                </span>
                                <select
                                  value={selectedOverlayKey || ''}
                                  onChange={(e) => setSelectedOverlayKey(e.target.value)}
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none"
                                >
                                  {flatItems.map((item) => {
                                    const relLabel = item.visualItem
                                      ? PHOTO_RELATION_LABELS[item.visualItem.photoRelation]?.label || 'Sem foto'
                                      : 'Sem foto';
                                    return (
                                      <option key={item.itemKey} value={item.itemKey}>
                                        {item.product.name} ({relLabel})
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              <div className="flex items-center gap-3 text-[11px]">
                                <span className="flex items-center gap-1 font-semibold text-blue-700">
                                  <span className="h-2.5 w-2.5 rounded border border-blue-500 border-dashed bg-blue-500/20" />
                                  sourceBox (Bloco do Item)
                                </span>
                                <span className="flex items-center gap-1 font-semibold text-purple-700">
                                  <span className="h-2.5 w-2.5 rounded border border-purple-600 bg-purple-600/30" />
                                  photoBox (Foto Sugerida)
                                </span>
                              </div>
                            </div>

                            {/* Visualizador da Imagem com Caixas */}
                            {previewUrl && selectedOverlayEntry && (
                              <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-slate-900/5 max-h-[640px] flex items-center justify-center">
                                <div className="relative inline-block max-h-[620px] max-w-full">
                                  <img
                                    src={previewUrl}
                                    alt="Cardápio com overlay"
                                    className="max-h-[620px] w-auto object-contain block"
                                  />

                                  {/* Caixa sourceBox (azul tracejado) */}
                                  {selectedOverlayEntry.visualItem?.sourceBox && (() => {
                                    const pos = boxToPercent(selectedOverlayEntry.visualItem.sourceBox);
                                    return (
                                      <div
                                        style={{
                                          top: pos.top,
                                          left: pos.left,
                                          width: pos.width,
                                          height: pos.height,
                                        }}
                                        className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none transition-all z-10"
                                      >
                                        <span className="absolute -top-5 left-0 rounded bg-blue-600 text-white text-[9px] font-bold px-1 py-0.2 whitespace-nowrap shadow-xs">
                                          Bloco: {selectedOverlayEntry.product.name}
                                        </span>
                                      </div>
                                    );
                                  })()}

                                  {/* Caixa photoBox (roxo sólido) */}
                                  {selectedOverlayEntry.visualItem?.photoBox && (() => {
                                    const pos = boxToPercent(selectedOverlayEntry.visualItem.photoBox);
                                    return (
                                      <div
                                        style={{
                                          top: pos.top,
                                          left: pos.left,
                                          width: pos.width,
                                          height: pos.height,
                                        }}
                                        className="absolute border-2 border-purple-600 bg-purple-600/25 pointer-events-none transition-all z-20 shadow-md"
                                      >
                                        <span className="absolute -bottom-5 left-0 rounded bg-purple-700 text-white text-[9px] font-bold px-1 py-0.2 whitespace-nowrap shadow-xs">
                                          Foto Sugerida
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* =========================================================
                        ABA 4: AUDITORIA IA (Validação conservadora da T4)
                        ========================================================= */}
                    {activeTab === 'audit' && (
                      <div className="space-y-6">
                        {!analysisResult.pdfAudit ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
                            <ShieldCheck className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                            <p className="text-sm font-medium">Auditoria não executada para este arquivo.</p>
                            <p className="text-xs text-slate-400 mt-1">A auditoria multipágina requer processamento de PDF com extração textual válida.</p>
                          </div>
                        ) : analysisResult.pdfAudit.status === 'failed' ? (
                          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-rose-800">
                            <div className="flex items-start gap-3">
                              <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                              <div>
                                <h4 className="text-sm font-semibold">Falha na execução da Auditoria IA</h4>
                                <p className="text-xs mt-1 text-rose-700">
                                  {analysisResult.pdfAudit.error.message || 'Não foi possível concluir a auditoria do PDF.'}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (() => {
                          const auditData = analysisResult.pdfAudit.data;
                          const issues = auditData.issues || [];
                          return (
                            <>
                              {/* Header de Métricas da Auditoria */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                                  <span className="text-[11px] font-medium text-slate-500 block">Total de Apontamentos</span>
                                  <span className="text-xl font-bold text-slate-900 mt-1 block">
                                    {issues.length}
                                  </span>
                                </div>
                                <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3.5 shadow-xs">
                                  <span className="text-[11px] font-medium text-rose-700 block">Severidade Alta</span>
                                  <span className="text-xl font-bold text-rose-800 mt-1 block">
                                    {issues.filter((i) => i.severity === 'high').length}
                                  </span>
                                </div>
                                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3.5 shadow-xs">
                                  <span className="text-[11px] font-medium text-amber-700 block">Severidade Média</span>
                                  <span className="text-xl font-bold text-amber-800 mt-1 block">
                                    {issues.filter((i) => i.severity === 'medium').length}
                                  </span>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 shadow-xs">
                                  <span className="text-[11px] font-medium text-slate-600 block">Severidade Baixa</span>
                                  <span className="text-xl font-bold text-slate-700 mt-1 block">
                                    {issues.filter((i) => i.severity === 'low').length}
                                  </span>
                                </div>
                              </div>

                              {/* Informação contextual */}
                              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600 flex items-center gap-2">
                                <FileSearch className="h-4 w-4 text-purple-600 shrink-0" />
                                <span>
                                  A Auditoria IA funciona como uma ferramenta de conferência independente e conservadora. Ela identifica potenciais omissões ou discrepâncias entre o arquivo original e o catálogo sem alterar os dados extraídos.
                                </span>
                              </div>

                              {/* Lista de Apontamentos */}
                              {issues.length === 0 ? (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-8 text-center">
                                  <ShieldCheck className="mx-auto h-10 w-10 text-emerald-600 mb-2" />
                                  <h4 className="text-sm font-semibold text-emerald-900">
                                    Nenhum problema detectado na auditoria
                                  </h4>
                                  <p className="text-xs text-emerald-700 mt-1 max-w-md mx-auto">
                                    O modelo avaliou a coerência entre o PDF e as estruturas extraídas e não identificou omissões críticas, conflitos de preços ou seções ausentes.
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                    Apontamentos Identificados ({issues.length})
                                  </h4>
                                  <div className="space-y-2.5">
                                    {issues.map((issue, idx) => {
                                      const meta = AUDIT_SEVERITY_META[issue.severity] || AUDIT_SEVERITY_META.low;
                                      const label = AUDIT_ISSUE_TYPE_LABELS[issue.type]?.label || issue.type;
                                      return (
                                        <div
                                          key={idx}
                                          className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs transition-shadow hover:shadow-sm"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                              <span
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}
                                              >
                                                {issue.severity === 'high' ? (
                                                  <AlertTriangle className="h-3 w-3" />
                                                ) : (
                                                  <ShieldCheck className="h-3 w-3" />
                                                )}
                                                {meta.label}
                                              </span>
                                              <span className="text-xs font-semibold text-slate-800">
                                                {label}
                                              </span>
                                              {issue.origin === 'deterministic' ? (
                                                <span className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                                                  Validação local
                                                </span>
                                              ) : (
                                                <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                                                  IA
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[11px]">
                                              {typeof issue.sourcePage === 'number' && (
                                                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                                                  Página {issue.sourcePage}
                                                </span>
                                              )}
                                              {issue.relatedItemKey && (
                                                <span className="rounded-md bg-purple-50 px-2 py-0.5 font-mono text-purple-700 font-semibold">
                                                  {issue.relatedItemKey}
                                                </span>
                                              )}
                                              {issue.relatedGroupKey && (
                                                <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-blue-700 font-semibold">
                                                  {issue.relatedGroupKey}
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          <p className="mt-2 text-xs text-slate-700 leading-relaxed">
                                            {issue.message}
                                          </p>

                                          {issue.evidence && (
                                            <div className="mt-2.5 rounded-lg border-l-2 border-slate-300 bg-slate-50 px-3 py-1.5 text-[11px] font-mono italic text-slate-600">
                                              &ldquo;{issue.evidence}&rdquo;
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* =========================================================
                        ABA 5: JSON (Separado para textual, semântica, fotos e auditoria)
                        ========================================================= */}
                    {activeTab === 'json' && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
                          <button
                            type="button"
                            onClick={() => setJsonTab('textual')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                              jsonTab === 'textual'
                                ? 'bg-purple-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                            }`}
                          >
                            1. Extração Textual
                          </button>
                          {isPdf ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setJsonTab('semantic')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                                  jsonTab === 'semantic'
                                    ? 'bg-purple-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                                }`}
                              >
                                2. Estrutura Semântica
                              </button>
                              <button
                                type="button"
                                onClick={() => setJsonTab('photo')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                                  jsonTab === 'photo'
                                    ? 'bg-purple-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                                }`}
                              >
                                3. Fotos PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => setJsonTab('audit')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                                  jsonTab === 'audit'
                                    ? 'bg-purple-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                                }`}
                              >
                                4. Auditoria IA
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setJsonTab('visual')}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                                jsonTab === 'visual'
                                  ? 'bg-purple-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                              }`}
                            >
                              2. Análise Visual e Fotos
                            </button>
                          )}
                        </div>

                        {jsonTab === 'textual' ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500">
                                Resposta estruturada da Chamada #1 (Cardápio e Preços):
                              </span>
                              <button
                                type="button"
                                onClick={handleCopyTextualJson}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                {copiedTextual ? (
                                  <>
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    Copiado!
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3.5 w-3.5 text-slate-500" />
                                    Copiar JSON Textual
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-3 text-slate-100">
                              <pre className="max-h-[500px] overflow-auto text-[11px] font-mono leading-relaxed">
                                {analysisResult.rawJson}
                              </pre>
                            </div>
                          </div>
                        ) : jsonTab === 'semantic' ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500">
                                Resposta estruturada da Chamada #2 (Interpretação Semântica para PDF):
                              </span>
                              {analysisResult.pdfSemanticEnrichment?.status === 'ok' &&
                                analysisResult.pdfSemanticEnrichment.rawJson && (
                                  <button
                                    type="button"
                                    onClick={handleCopySemanticJson}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                  >
                                    {copiedSemantic ? (
                                      <>
                                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                                        Copiado!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                                        Copiar JSON Semântico
                                      </>
                                    )}
                                  </button>
                                )}
                            </div>

                            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-3 text-slate-100">
                              <pre className="max-h-[500px] overflow-auto text-[11px] font-mono leading-relaxed">
                                {analysisResult.pdfSemanticEnrichment?.status === 'ok'
                                  ? analysisResult.pdfSemanticEnrichment.rawJson
                                  : JSON.stringify(
                                      analysisResult.pdfSemanticEnrichment || { status: 'skipped' },
                                      null,
                                      2
                                    )}
                              </pre>
                            </div>
                          </div>
                        ) : jsonTab === 'photo' ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500">
                                Resposta estruturada da Chamada #3 (Detecção Visual de Fotos no PDF):
                              </span>
                              {analysisResult.pdfPhotoEnrichment?.status === 'ok' &&
                                analysisResult.pdfPhotoEnrichment.rawJson && (
                                  <button
                                    type="button"
                                    onClick={handleCopyPhotoJson}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                  >
                                    {copiedPhoto ? (
                                      <>
                                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                                        Copiado!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                                        Copiar JSON de Fotos
                                      </>
                                    )}
                                  </button>
                                )}
                            </div>

                            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-3 text-slate-100">
                              <pre className="max-h-[500px] overflow-auto text-[11px] font-mono leading-relaxed">
                                {analysisResult.pdfPhotoEnrichment?.status === 'ok'
                                  ? analysisResult.pdfPhotoEnrichment.rawJson
                                  : JSON.stringify(
                                      analysisResult.pdfPhotoEnrichment || { status: 'skipped' },
                                      null,
                                      2
                                    )}
                              </pre>
                            </div>
                          </div>
                        ) : jsonTab === 'audit' ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500">
                                Resposta estruturada da Chamada #4 (Auditoria de Cobertura e Omissões):
                              </span>
                              {analysisResult.pdfAudit?.status === 'ok' &&
                                analysisResult.pdfAudit.rawJson && (
                                  <button
                                    type="button"
                                    onClick={handleCopyAuditJson}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                  >
                                    {copiedAudit ? (
                                      <>
                                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                                        Copiado!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                                        Copiar JSON de Auditoria
                                      </>
                                    )}
                                  </button>
                                )}
                            </div>

                            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-3 text-slate-100">
                              <pre className="max-h-[500px] overflow-auto text-[11px] font-mono leading-relaxed">
                                {analysisResult.pdfAudit?.status === 'ok'
                                  ? analysisResult.pdfAudit.rawJson
                                  : JSON.stringify(
                                      analysisResult.pdfAudit || { status: 'skipped' },
                                      null,
                                      2
                                    )}
                              </pre>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500">
                                Resposta estruturada da Chamada #2 (Classificação e Bounding Boxes):
                              </span>
                              {analysisResult.enrichment?.status === 'ok' && (
                                <button
                                  type="button"
                                  onClick={handleCopyVisualJson}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                >
                                  {copiedVisual ? (
                                    <>
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                      Copiado!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5 text-slate-500" />
                                      Copiar JSON Visual
                                    </>
                                  )}
                                </button>
                              )}
                            </div>

                            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-3 text-slate-100">
                              <pre className="max-h-[500px] overflow-auto text-[11px] font-mono leading-relaxed">
                                {analysisResult.enrichment?.status === 'ok'
                                  ? analysisResult.enrichment.rawJson
                                  : JSON.stringify(analysisResult.enrichment || { status: 'skipped' }, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
