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
} from 'lucide-react';
import {
  TenantAdminApi,
  type CatalogLabResponse,
  type ItemKind,
  type PhotoRelation,
  type VisualItem,
} from './api';
import { boxToPercent, cropImageToDataUrl, type BoundingBox } from '../../lib/cropBox';

interface AdminCatalogLabProps {
  slug: string;
}

const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MiB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

type LabTab = 'items' | 'photos' | 'overlay' | 'json';
type PhotoFilter = 'all' | 'with_photo' | 'without_photo' | 'ambiguous' | 'review' | 'products' | 'combos' | 'addons' | 'options';
type FeedbackVote = 'correct' | 'wrong' | 'uncertain';

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

export default function AdminCatalogLab({ slug }: AdminCatalogLabProps) {
  const api = useMemo(() => new TenantAdminApi(slug), [slug]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isPdf = selectedFile?.type?.toLowerCase() === 'application/pdf';
  const [dragActive, setDragActive] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<CatalogLabResponse | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

  // Navegação do laboratório
  const [activeTab, setActiveTab] = useState<LabTab>('items');
  const [jsonTab, setJsonTab] = useState<'textual' | 'visual'>('textual');
  const [copiedTextual, setCopiedTextual] = useState(false);
  const [copiedVisual, setCopiedVisual] = useState(false);

  // Estado da aba Fotos IA
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>('all');
  const [manualVotes, setManualVotes] = useState<Record<string, FeedbackVote>>({});
  const [localKinds, setLocalKinds] = useState<Record<string, ItemKind>>({});

  // Bounding box overlay & crop cache
  const [selectedOverlayKey, setSelectedOverlayKey] = useState<string | null>(null);
  const [cropPreviews, setCropPreviews] = useState<Record<string, string>>({});

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

  const handleSelectFile = (file: File) => {
    setErrorFeedback(null);
    setAnalysisResult(null);
    setCropPreviews({});
    setManualVotes({});
    setLocalKinds({});
    setSelectedOverlayKey(null);

    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      setErrorFeedback('Formato inválido. Por favor, envie uma imagem JPG, PNG, WEBP ou um arquivo PDF.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorFeedback(
        `O arquivo selecionado tem ${(file.size / (1024 * 1024)).toFixed(1)} MB. O limite máximo permitido é 3 MiB.`
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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleReset = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setErrorFeedback(null);
    setElapsedSeconds(0);
    setCropPreviews({});
    setManualVotes({});
    setLocalKinds({});
    setSelectedOverlayKey(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile || analyzing) return;

    setAnalyzing(true);
    setErrorFeedback(null);
    setAnalysisResult(null);
    setCropPreviews({});
    setManualVotes({});
    setLocalKinds({});
    setSelectedOverlayKey(null);

    try {
      const response = await api.analyzeMenuImageLab(selectedFile);
      setAnalysisResult(response);
      setActiveTab('items');
    } catch (err: any) {
      const message =
        err?.message || 'Falha ao processar a imagem do cardápio. Tente novamente.';
      setErrorFeedback(message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Mapeamento plano dos itens para visualização rápida e filtros
  const flatItems: FlatItemEntry[] = useMemo(() => {
    if (!analysisResult?.data || !analysisResult.data.isMenu) return [];

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

  // Dispara a geração de crops dos itens visíveis quando o resultado chega
  useEffect(() => {
    if (isPdf || !hiddenImgRef.current || !analysisResult || analysisResult.enrichment?.status !== 'ok') {
      return;
    }
    flatItems.forEach((entry) => {
      if (entry.visualItem?.photoBox) {
        ensureCrop(entry.itemKey, entry.visualItem.photoBox);
      }
    });
  }, [flatItems, analysisResult, ensureCrop, isPdf]);

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

    const categoriesCount = analysisResult.data.categories.length;
    let itemsCount = 0;
    let identifiedPrices = 0;
    let pendingPrices = 0;
    let suggestedPhotos = 0;
    let dataPendingCount = 0;

    flatItems.forEach((entry) => {
      itemsCount += 1;
      const prices = entry.product.prices || [];
      if (prices.length === 0) {
        pendingPrices += 1;
      } else {
        prices.forEach((p) => {
          if (p.amountCents !== null && p.amountCents !== undefined) {
            identifiedPrices += 1;
          } else {
            pendingPrices += 1;
          }
        });
      }

      const hasWarnings = entry.product.warnings && entry.product.warnings.length > 0;
      const isAmbiguous = entry.visualItem?.photoRelation === 'ambiguous';
      const hasPhotoWarning = Boolean(entry.visualItem?.photoWarning);
      const hasPendingPrice = prices.length === 0 || prices.some((p) => p.amountCents === null);

      if (hasWarnings || isAmbiguous || hasPhotoWarning || hasPendingPrice) {
        dataPendingCount += 1;
      }

      if (entry.visualItem?.photoBox !== null && entry.visualItem?.photoBox !== undefined) {
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
  }, [analysisResult, flatItems]);

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

    const totalWithPhoto = flatItems.filter((i) => i.visualItem?.photoBox).length;
    const pending = Math.max(0, totalWithPhoto - (correct + wrong + uncertain));

    return { correct, wrong, uncertain, pending, totalWithPhoto };
  }, [manualVotes, flatItems]);

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

  const handleCopyVisualJson = () => {
    if (analysisResult?.enrichment?.status !== 'ok' || !analysisResult.enrichment.rawJson) return;
    void navigator.clipboard.writeText(analysisResult.enrichment.rawJson).then(() => {
      setCopiedVisual(true);
      setTimeout(() => setCopiedVisual(false), 2000);
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
                  Formatos aceitos: JPG, PNG, WEBP ou PDF (máximo 3 MiB)
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
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleSelectFile(e.target.files[0]);
                      }
                    }}
                  />
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
                        ? `Analisando páginas do PDF... (${elapsedSeconds}s)`
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
                  {metrics.suggestedPhotos > 0 && (
                    <span className="rounded-full bg-teal-100 px-1.5 py-0.2 text-[10px] font-bold text-teal-800">
                      {metrics.suggestedPhotos}
                    </span>
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
                  {isPdf ? 'Arquivo original' : 'Imagem original'}
                </button>
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
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono">
                  <span className="flex items-center gap-1" title="Tempo total percebido">
                    <Clock className="h-3 w-3 text-slate-400" />
                    Total: {analysisResult.executionTimeMs < 1000
                      ? `${analysisResult.executionTimeMs}ms`
                      : `${(analysisResult.executionTimeMs / 1000).toFixed(1)}s`}
                  </span>
                  <span>•</span>
                  <span className="text-slate-400" title={isPdf ? 'Tempo de extração do PDF' : 'Extração / Visual'}>
                    {isPdf ? (
                      `Extração PDF: ${(analysisResult.extractionExecutionTimeMs / 1000).toFixed(1)}s`
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
              )}
            </div>

            {/* Aviso quando a chamada visual falhou isoladamente */}
            {analysisResult?.enrichment?.status === 'failed' && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <p className="font-bold">Análise visual não finalizada</p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    A leitura do cardápio foi concluída com sucesso, mas a análise visual das fotos não pôde ser finalizada.
                    ({analysisResult.enrichment.error.message || 'Erro no modelo visual'})
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
                          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center" title="Extração visual de fotos desativada para PDFs no laboratório">
                            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
                              <Camera className="h-3 w-3 text-slate-400" /> Fotos IA
                            </span>
                            <span className="text-xs font-semibold text-slate-500 mt-1 block">
                              Não aplicável
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
                                const effectiveKind = localKinds[itemKey] || vItem?.kind || 'product';
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

                                            {/* Badge de relação da foto */}
                                            {vItem && vItem.photoRelation !== 'none' && (
                                              <span
                                                className={`rounded-md ${PHOTO_RELATION_LABELS[vItem.photoRelation]?.tone || ''} text-[9px] font-bold px-1.5 py-0.2`}
                                              >
                                                {PHOTO_RELATION_LABELS[vItem.photoRelation]?.label}
                                              </span>
                                            )}
                                          </div>
                                          {prod.description && (
                                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                              {prod.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      {vItem?.photoBox && (
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
                                      {prod.prices?.map((price, priceIdx) => {
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
                                            <span className="font-bold text-slate-900">
                                              {formattedPrice || 'Preço pendente'}
                                            </span>
                                            {price.unit && (
                                              <span className="text-[10px] text-slate-500">
                                                /{price.unit}
                                              </span>
                                            )}
                                            {price.rawText && price.rawText !== formattedPrice && (
                                              <span
                                                className="text-[9px] text-slate-400 font-mono border-l border-slate-200 pl-1"
                                                title={`Texto visto na imagem: ${price.rawText}`}
                                              >
                                                Lido: "{price.rawText}"
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Warnings específicos deste produto */}
                                    {prod.warnings?.length > 0 && (
                                      <div className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800 space-y-0.5">
                                        {prod.warnings.map((pw, pwi) => (
                                          <p key={pwi} className="flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                                            {pw}
                                          </p>
                                        ))}
                                      </div>
                                    )}
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
                        ABA 2: FOTOS IA (Cards com recorte, relação e feedback)
                        ========================================================= */}
                    {activeTab === 'photos' && (
                      <div className="space-y-4">
                        {analysisResult.enrichment?.status === 'skipped' ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-8 text-center space-y-3">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                              <Camera className="h-6 w-6 stroke-1" />
                            </div>
                            <div className="max-w-md mx-auto space-y-1">
                              <p className="text-xs font-bold text-slate-800">
                                Extração visual de fotos desativada para PDFs
                              </p>
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                {analysisResult.enrichment.message ||
                                  'O processamento de cardápios em PDF foca na extração textual de categorias, produtos e preços ao longo das páginas. A identificação e recorte de fotos continuam disponíveis para arquivos de imagem (JPG, PNG e WEBP).'}
                              </p>
                            </div>
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
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div>
                                <span className="text-xs font-bold text-slate-800 block">
                                  Visualização do PDF original
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  Navegue pelas páginas do documento abaixo ou abra-o em uma nova aba do navegador.
                                </span>
                              </div>
                              {previewUrl && (
                                <a
                                  href={previewUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 transition-colors shadow-2xs cursor-pointer"
                                >
                                  <Eye className="h-3.5 w-3.5 text-purple-600" />
                                  Abrir PDF em nova aba
                                </a>
                              )}
                            </div>

                            {previewUrl && (
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
                            )}
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
                        ABA 4: JSON (Separado para extração textual e visual)
                        ========================================================= */}
                    {activeTab === 'json' && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                          <button
                            type="button"
                            onClick={() => setJsonTab('textual')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                              jsonTab === 'textual'
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                            }`}
                          >
                            1. Extração Textual
                          </button>
                          <button
                            type="button"
                            onClick={() => setJsonTab('visual')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                              jsonTab === 'visual'
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                            }`}
                          >
                            2. Análise Visual e Fotos
                          </button>
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
