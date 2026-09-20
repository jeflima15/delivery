import React from 'react';
import type { CatalogLabDomainResponse } from '../../../../lib/catalogImportDomain.js';

interface DomainNativePhotosTabProps {
  data: CatalogLabDomainResponse;
}

export const DomainNativePhotosTab: React.FC<DomainNativePhotosTabProps> = ({ data }) => {
  const photos = data.sourceEvidence.photos || [];
  const productImages = data.importPlan.productImages || [];
  const products = data.importPlan.products || {};

  return (
    <div className="space-y-6">
      {/* Cabeçalho informativo */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              Fotos & Imagens do Documento ({photos.length})
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Imagens e ilustrações detectadas pelo Gemini com bounding boxes normalizados (0-1000) e mapeamentos a produtos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200 font-medium">
              {productImages.length} associadas ao plano
            </span>
          </div>
        </div>
      </div>

      {/* Grid de Fotos da Fonte */}
      {photos.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
          Nenhuma foto ou imagem detectada no documento analisado.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {photos.map((photo, idx) => {
            const mappedProductImg = productImages.find((pi) => pi.sourcePhotoIndex === idx);
            const mappedProd = mappedProductImg ? products[mappedProductImg.productKey] : null;

            return (
              <div
                key={photo.id || idx}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col justify-between"
              >
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Foto #{idx + 1}</span>
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono">
                    Página {photo.pageNumber}
                  </span>
                </div>

                <div className="p-4 flex-1 space-y-3">
                  {/* Bounding Box Visual Placeholder */}
                  <div className="h-32 bg-slate-100 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center p-2 text-center">
                    <span className="text-xs text-slate-400 font-mono">
                      Box: [{photo.boundingBox.yMin}, {photo.boundingBox.xMin}] - [{photo.boundingBox.yMax}, {photo.boundingBox.xMax}]
                    </span>
                    <span className="text-[11px] text-slate-500 mt-1 line-clamp-2 px-2">
                      {photo.description || 'Sem descrição'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                      Status de Mapeamento
                    </span>
                    {mappedProd ? (
                      <div className="text-xs bg-emerald-50 text-emerald-800 p-2 rounded border border-emerald-200">
                        Associada a: <strong>{mappedProd.name}</strong>
                      </div>
                    ) : (
                      <div className="text-xs bg-amber-50 text-amber-700 p-2 rounded border border-amber-200">
                        Não vinculada a um produto final
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
                  <span>ID: {photo.id}</span>
                  {photo.associatedProductCandidateId && (
                    <span>Candidato: {photo.associatedProductCandidateId}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
