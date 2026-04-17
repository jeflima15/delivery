import React, { useEffect, useState } from 'react';
import { X, Search, Store } from 'lucide-react';
import { cn } from '../lib/utils';

interface PromotionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
  onProductClick: (product: any) => void;
}

export default function PromotionsModal({ isOpen, onClose, products, onProductClick }: PromotionsModalProps) {
  const [promoProducts, setPromoProducts] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      const filtered = products.filter(p => {
        const precoAtual = Number(p.preco) || 0;
        const precoOriginal = Number(p.preco_antigo) || 0;
        return precoOriginal > precoAtual && p.ativo !== false;
      });
      setPromoProducts(filtered);
      window.location.hash = 'promocoes';
    } else {
      if (window.location.hash === '#promocoes') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, [isOpen, products]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 md:p-8">
      <div 
        className="relative w-full max-w-[1280px] h-full max-h-[90vh] flex flex-col bg-white rounded-[12px] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <header className="sticky top-0 z-10 flex h-[70px] shrink-0 items-center justify-between px-5 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)]">
          <h2 className="text-[20px] font-bold text-gray-800">Promoções</h2>
          <button 
            onClick={onClose}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto p-5">
          {promoProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-50 text-gray-300 mb-8">
                <Search className="h-12 w-12" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 uppercase tracking-wider mb-2">
                Nenhuma promoção encontrada
              </h3>
              <p className="text-gray-500 font-light">
                No momento não temos produtos com desconto ativo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {promoProducts.map((product) => (
                <div
                  key={product._id || product.id}
                  onClick={() => onProductClick(product)}
                  className="group relative flex w-full h-fit xl:h-[232px] min-h-[112px] p-2 bg-white border border-[rgba(0,0,0,0.12)] rounded-[8px] cursor-pointer hover:bg-gray-50/50 transition-colors"
                >
                  {/* Selos/Badges */}
                  <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                    {product.selo_destaque && (
                      <span className="inline-flex items-center rounded-[6px] bg-blue-100/70 px-2.5 py-1 text-[12px] font-medium leading-4 text-blue-600">
                        {product.selo_destaque}
                      </span>
                    )}
                  </div>

                  {/* Texto (Esquerda) */}
                  <div className="flex-1 flex flex-col justify-between p-2 h-full min-w-0">
                    <div>
                      <h3 className="text-base font-medium leading-6 text-gray-700 line-clamp-2">
                        {product.nome}
                      </h3>
                      {product.descricao && (
                        <p className="mt-2 text-sm font-light leading-5 text-gray-500 line-clamp-3">
                          {product.descricao}
                        </p>
                      )}
                    </div>
                    <div className="mt-auto pt-4 flex flex-col gap-1">
                      <span className="text-sm font-normal leading-5 text-gray-400 line-through">
                        R$ {(product.preco_antigo || 0).toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-base font-normal leading-6 text-emerald-500">
                        R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>

                  {/* Imagem (Direita) */}
                  <div className="shrink-0 w-[128px] h-[128px] md:w-[136px] md:h-[136px] p-1 ml-4 self-center">
                    <div className="w-full h-full relative rounded-[8px] overflow-hidden bg-gray-100">
                      {product.imagem ? (
                        <img 
                          src={product.imagem} 
                          alt={product.nome} 
                          className="h-full w-full object-cover object-center"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-300">
                          <Store className="h-8 w-8" />
                        </div>
                      )}
                      {product.esgotado && (
                        <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center z-20">
                          <div className="rounded-md bg-gray-900/80 px-2 py-1 text-[10px] font-black uppercase text-white -rotate-6">
                            Esgotado
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
