import React, { useState, useEffect, useRef, useMemo } from 'react';
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
} from 'lucide-react';
import { TenantAdminApi, type CatalogLabResponse } from './api';

interface AdminCatalogLabProps {
  slug: string;
}

const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MiB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function AdminCatalogLab({ slug }: AdminCatalogLabProps) {
  const api = useMemo(() => new TenantAdminApi(slug), [slug]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<CatalogLabResponse | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

  const [resultTab, setResultTab] = useState<'interpreted' | 'raw'>('interpreted');
  const [copiedJson, setCopiedJson] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
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

    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      setErrorFeedback('Formato inválido. Por favor, envie uma imagem JPG, PNG ou WEBP.');
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile || analyzing) return;

    setAnalyzing(true);
    setErrorFeedback(null);
    setAnalysisResult(null);

    try {
      const response = await api.analyzeMenuImageLab(selectedFile);
      setAnalysisResult(response);
    } catch (err: any) {
      const message =
        err?.message || 'Falha ao processar a imagem do cardápio. Tente novamente.';
      setErrorFeedback(message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCopyJson = () => {
    if (!analysisResult?.rawJson) return;
    void navigator.clipboard.writeText(analysisResult.rawJson).then(() => {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    });
  };

  // Contadores analíticos
  const metrics = useMemo(() => {
    if (!analysisResult?.data || !analysisResult.data.isMenu) {
      return { categoriesCount: 0, productsCount: 0, pricesCount: 0 };
    }
    const categories = analysisResult.data.categories || [];
    let productsCount = 0;
    let pricesCount = 0;

    for (const cat of categories) {
      const products = cat.products || [];
      productsCount += products.length;
      for (const prod of products) {
        pricesCount += (prod.prices || []).length;
      }
    }

    return {
      categoriesCount: categories.length,
      productsCount,
      pricesCount,
    };
  }, [analysisResult]);

  return (
    <div className="space-y-6">
      {/* Header Experimental */}
      <div className="rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 via-white to-pink-50 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-800">
                🧪 Experimental
              </span>
              <h1 className="text-base font-bold text-slate-900">
                Laboratório de leitura de cardápio por IA
              </h1>
            </div>
            <p className="text-xs font-medium text-slate-600">
              Este teste não altera seu catálogo e nenhum produto será criado.
            </p>
          </div>
          {selectedFile && (
            <button
              type="button"
              onClick={handleReset}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              Recomeçar
            </button>
          )}
        </div>
      </div>

      {/* Grid Principal: Upload/Imagem e Resultado */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Upload e Imagem Original (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <FileImage className="h-4 w-4 text-slate-500" />
                Imagem do Cardápio
              </h2>
              {selectedFile && (
                <span className="text-[11px] font-mono text-slate-500">
                  {(selectedFile.size / 1024).toFixed(0)} KB
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
                  accept="image/jpeg,image/png,image/webp"
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
                  Clique para escolher ou arraste a imagem aqui
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Formatos aceitos: JPG, PNG ou WEBP (máximo 3 MiB)
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900/5 max-h-[500px] flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt="Preview do cardápio"
                    className="max-h-[480px] w-full object-contain"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                  <span className="truncate max-w-[220px] font-medium" title={selectedFile?.name}>
                    {selectedFile?.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={analyzing}
                    className="text-purple-600 font-semibold hover:underline disabled:opacity-50"
                  >
                    Trocar imagem
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
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
                    ? `Analisando com Gemini... (${elapsedSeconds}s)`
                    : '✨ Analisar cardápio'}
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

        {/* Coluna Direita: Resultado da Análise (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-4 min-h-[380px]">
            {/* Header do Resultado & Abas */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setResultTab('interpreted')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                    resultTab === 'interpreted'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 text-purple-600" />
                  Resultado interpretado
                </button>
                <button
                  type="button"
                  onClick={() => setResultTab('raw')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                    resultTab === 'raw'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <code className="text-xs font-bold text-slate-700">{'{}'}</code>
                  JSON bruto
                </button>
              </div>

              {analysisResult && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-slate-400" />
                    {analysisResult.executionTimeMs < 1000
                      ? `${analysisResult.executionTimeMs}ms`
                      : `${(analysisResult.executionTimeMs / 1000).toFixed(1)}s`}
                  </span>
                  <span>•</span>
                  <span className="font-semibold text-slate-700">{analysisResult.model}</span>
                </div>
              )}
            </div>

            {/* Estado Vazio ou Loading */}
            {analyzing && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="relative">
                  <div className="h-10 w-10 animate-spin rounded-full border-3 border-purple-200 border-t-purple-600" />
                  <Sparkles className="h-4 w-4 text-purple-600 absolute inset-0 m-auto" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    O Gemini está lendo e estruturando o cardápio...
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Tempo decorrido: {elapsedSeconds} segundo{elapsedSeconds !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}

            {!analyzing && !analysisResult && (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-2 text-slate-400">
                <FileText className="h-10 w-10 stroke-1 text-slate-300" />
                <p className="text-xs font-medium text-slate-500">
                  Envie uma imagem e clique em "Analisar cardápio" para ver a interpretação da IA aqui.
                </p>
              </div>
            )}

            {/* Conteúdo do Resultado */}
            {!analyzing && analysisResult && (
              <>
                {resultTab === 'interpreted' ? (
                  <div className="space-y-5">
                    {/* Alerta caso NÃO seja um cardápio */}
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
                        {/* Métricas Resumidas */}
                        <div className="grid grid-cols-3 gap-2">
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
                              <ShoppingBag className="h-3 w-3 text-emerald-600" /> Produtos
                            </span>
                            <span className="text-base font-bold text-slate-900 mt-0.5 block">
                              {metrics.productsCount}
                            </span>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center">
                            <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
                              <Tag className="h-3 w-3 text-blue-600" /> Preços
                            </span>
                            <span className="text-base font-bold text-slate-900 mt-0.5 block">
                              {metrics.pricesCount}
                            </span>
                          </div>
                        </div>

                        {/* Avisos Globais */}
                        {analysisResult.data.warnings?.length > 0 && (
                          <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 space-y-1.5">
                            <p className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                              Avisos gerais de leitura da imagem:
                            </p>
                            <ul className="text-xs text-amber-800 list-disc list-inside space-y-0.5 pl-1">
                              {analysisResult.data.warnings.map((warn, i) => (
                                <li key={i}>{warn}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Categorias e Produtos */}
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
                                {cat.products?.map((prod, prodIdx) => (
                                  <div key={prodIdx} className="p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="space-y-0.5">
                                        <p className="text-xs font-bold text-slate-900">
                                          {prod.name}
                                        </p>
                                        {prod.description && (
                                          <p className="text-[11px] text-slate-600 leading-relaxed">
                                            {prod.description}
                                          </p>
                                        )}
                                      </div>
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
                                              {formattedPrice || 'Preço indeterminado'}
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
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

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
                      </>
                    )}
                  </div>
                ) : (
                  /* Aba JSON Bruto */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        Payload JSON retornado pelo modelo:
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyJson}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        {copiedJson ? (
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
                        {analysisResult.rawJson}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
