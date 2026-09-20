import React from 'react';
import { Camera, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import type { CatalogLabDomainResponse } from '../../../../lib/catalogImportDomain.js';

interface DomainNativePhotosTabProps {
  data: CatalogLabDomainResponse;
  cropPreviews?: Record<string, string>;
  cropErrors?: Record<string, string>;
  isRenderingCrops?: boolean;
}

export const DomainNativePhotosTab: React.FC<DomainNativePhotosTabProps> = ({
  data,
  cropPreviews = {},
  cropErrors = {},
  isRenderingCrops = false,
}) => {
  const photos = data.data.sourceEvidence.photos || [];
  const productImages = data.data.importPlan.productImages || [];
  const productMap = new Map((data.data.importPlan.products || []).map((p) => [p.key, p]));

  const directCount = photos.filter((p) => p.photoRelation === 'direct').length;
  const sharedCount = photos.filter((p) => p.photoRelation === 'shared').length;
  const ambiguousCount = photos.filter((p) => p.photoRelation === 'ambiguous').length;
  const noneCount = photos.filter((p) => p.photoRelation === 'none').length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho informativo com estatísticas de cobertura */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              Cobertura Visual de Produtos ({photos.length} avaliações)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Avaliações visuais 1:1 por candidato comercial com bounding boxes normalizados (0-1000) e crops locais em tempo real.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {directCount} Diretas
            </span>
            {sharedCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">
                {sharedCount} Compartilhadas
              </span>
            )}
            {ambiguousCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg border border-amber-200">
                {ambiguousCount} Ambíguas
              </span>
            )}
            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg border border-slate-200">
              {noneCount} Sem foto (none)
            </span>
          </div>
        </div>
      </div>

      {/* Grid de Fotos */}
      {photos.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
          Nenhuma avaliação visual registrada neste cardápio.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {photos.map((photo, idx) => {
            const mappedProductImg = productImages.find((pi) => pi.sourcePhotoKey === photo.photoKey);
            const mappedProd = mappedProductImg ? productMap.get(mappedProductImg.productKey) : null;

            // Busca pelo crop em photoKey, candidateKey ou productKey
            const cropUrl =
              cropPreviews[photo.photoKey] ||
              (photo.candidateKey && cropPreviews[photo.candidateKey]) ||
              (mappedProductImg && cropPreviews[mappedProductImg.productKey]);

            const cropError =
              cropErrors[photo.photoKey] ||
              (photo.candidateKey && cropErrors[photo.candidateKey]) ||
              (mappedProductImg && cropErrors[mappedProductImg.productKey]);

            const relationBadge = {
              direct: 'bg-emerald-100 text-emerald-800 border-emerald-200',
              shared: 'bg-blue-100 text-blue-800 border-blue-200',
              ambiguous: 'bg-amber-100 text-amber-800 border-amber-200',
              none: 'bg-slate-100 text-slate-600 border-slate-200',
            }[photo.photoRelation] || 'bg-slate-100 text-slate-600 border-slate-200';

            const relationLabel = {
              direct: 'Direta (Produto)',
              shared: 'Compartilhada',
              ambiguous: 'Ambígua / Ilustrativa',
              none: 'Sem Foto Comercial',
            }[photo.photoRelation] || photo.photoRelation;

            return (
              <div
                key={photo.photoKey || idx}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col justify-between"
              >
                <div className="p-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">Foto #{idx + 1}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${relationBadge}`}>
                      {relationLabel}
                    </span>
                  </div>
                  {photo.pageNumber && (
                    <span className="text-[10px] bg-white text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-mono">
                      Pág. {photo.pageNumber}
                    </span>
                  )}
                </div>

                <div className="p-4 flex-1 space-y-3">
                  {/* Área Visual (Crop Real ou Estado) */}
                  {photo.photoRelation === 'none' ? (
                    <div className="h-36 bg-slate-50 rounded-lg border border-dashed border-slate-200 flex flex-col items-center justify-center p-3 text-center text-slate-500">
                      <Camera className="h-6 w-6 text-slate-300 mb-1" />
                      <span className="text-xs font-semibold text-slate-600">Sem fotografia comercial</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        Avaliação visual concluída: oferta não possui imagem comercial adequada na fonte.
                      </span>
                    </div>
                  ) : cropUrl ? (
                    <div className="relative h-44 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center">
                      <img
                        src={cropUrl}
                        alt={mappedProd?.name || photo.photoKey}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                      <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                        Crop Real
                      </span>
                    </div>
                  ) : isRenderingCrops ? (
                    <div className="h-44 bg-slate-50 rounded-lg border border-slate-200 flex flex-col items-center justify-center p-4 text-center text-slate-500">
                      <Loader2 className="h-6 w-6 text-indigo-500 animate-spin mb-2" />
                      <span className="text-xs font-medium text-slate-600">Recortando imagem localmente...</span>
                      <span className="text-[10px] text-slate-400 mt-1">Renderização sem re-upload</span>
                    </div>
                  ) : cropError ? (
                    <div className="h-44 bg-rose-50 rounded-lg border border-rose-200 flex flex-col items-center justify-center p-3 text-center text-rose-700">
                      <AlertCircle className="h-6 w-6 text-rose-500 mb-1" />
                      <span className="text-xs font-semibold">Falha na renderização do crop local</span>
                      <span className="text-[10px] text-rose-600 mt-1 line-clamp-2">{cropError}</span>
                    </div>
                  ) : (
                    <div className="h-44 bg-slate-100 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center p-2 text-center">
                      <span className="text-xs text-slate-400 font-mono">
                        Box: {photo.photoBox ? `[${photo.photoBox.join(', ')}]` : 'Sem coordenadas'}
                      </span>
                      <span className="text-[11px] text-slate-500 mt-1">
                        Aguardando arquivo original para recorte
                      </span>
                    </div>
                  )}

                  {/* Warning visual se houver */}
                  {photo.photoWarning && (
                    <div className="text-[11px] bg-amber-50 text-amber-800 p-2 rounded border border-amber-200 flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <span>{photo.photoWarning}</span>
                    </div>
                  )}

                  {/* Status de Mapeamento ao Plano */}
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Status de Mapeamento
                    </span>
                    {mappedProd ? (
                      <div className="text-xs bg-emerald-50 text-emerald-800 p-2.5 rounded-lg border border-emerald-200">
                        <div className="font-semibold text-emerald-900">{mappedProd.name}</div>
                        <div className="text-[10px] text-emerald-700 mt-0.5 flex items-center justify-between">
                          <span>Confiança: {((mappedProductImg?.confidence ?? 1) * 100).toFixed(0)}%</span>
                          <span>Modo: {mappedProductImg?.transformation || 'use_crop'}</span>
                        </div>
                      </div>
                    ) : photo.photoRelation !== 'none' ? (
                      <div className="text-xs bg-amber-50 text-amber-700 p-2 rounded border border-amber-200">
                        Imagem detectada, mas não vinculada a um produto final
                      </div>
                    ) : (
                      <div className="text-xs bg-slate-50 text-slate-600 p-2 rounded border border-slate-200">
                        Produto comercializado sem foto no cardápio
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 flex justify-between font-mono">
                  <span>Evidência: {photo.photoKey}</span>
                  {photo.candidateKey && <span>Alvo: {photo.candidateKey}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
