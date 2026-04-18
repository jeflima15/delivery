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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 md:p-8">
      <div 
        className="relative w-full max-w-[1280px] h-full max-h-[90vh] flex flex-col bg-white rounded-[12px] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex h-[70px] shrink-0 items-center justify-between px-5 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)]">
          <h2 className="text-[20px] font-bold text-gray-800">Promoções</h2>
          <button 
            onClick={onClose}
            className="flex h-[30px] w-[30px] items-center justify-center p-[3px] rounded-full bg-[#e5e7eb] text-[#6b7280] hover:bg-gray-300 transition-colors"
          >
            <X className="h-full w-full" />
          </button>
        </header>

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto p-5">
          {promoProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <div className="flex h-[96px] w-[96px] items-center justify-center rounded-full bg-gray-50 text-gray-300 mb-8">
                <Search className="h-12 w-12" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 uppercase tracking-wider mb-2 mt-8">
                Nenhuma promoção encontrada
              </h3>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {promoProducts.map((product) => {
                // Configuração básica do badge existente
                const t = (product.selo_destaque || '').trim().toLowerCase();
                let badgeStyle = 'bg-blue-100/70 text-blue-600';
                if (t.includes('novo') || t.includes('lançamento')) badgeStyle = 'bg-teal-100/70 text-teal-700';
                if (t.includes('mais pedido') || t.includes('vendido') || t.includes('popular')) badgeStyle = 'bg-orange-100/70 text-orange-600';

                return (
                  <div
                    key={product._id || product.id}
                    onClick={() => onProductClick(product)}
                    className="group relative flex w-full min-h-[112px] p-2 bg-white border-[1.25px] border-[rgba(0,0,0,0.12)] rounded-[8px] cursor-pointer hover:bg-gray-50/50 transition-colors"
                  >
                    {/* Texto (Esquerda) */}
                    <div className="flex-1 flex flex-col justify-between p-2 h-full min-w-0">
                      <div>
                        {product.selo_destaque && (
                          <div className="mb-2">
                            <span className={cn("inline-flex items-center rounded-[6px] px-2.5 py-1 text-[12px] font-medium leading-[16px]", badgeStyle)}>
                              {product.selo_destaque}
                            </span>
                          </div>
                        )}
                        <h3 className="text-[16px] font-medium leading-[24px] text-[#374151] line-clamp-2">
                          {product.nome}
                        </h3>
                        {product.descricao && (
                          <p className="mt-2 text-[14px] font-light leading-[20px] text-[#6b7280] line-clamp-2">
                            {product.descricao}
                          </p>
                        )}
                      </div>
                      <div className="mt-4 pt-1 flex flex-col items-start justify-end gap-0.5">
                        <span className="text-[16px] font-normal leading-[24px] text-[#10b981]">
                          R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
                        </span>
                        <span className="text-[14px] font-normal leading-[20px] text-[#6b7280] line-through">
                          R$ {(product.preco_antigo || 0).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    </div>

                    {/* Imagem (Direita) */}
                    <div className="shrink-0 w-[128px] h-[128px] p-1 ml-4 self-center">
                      <div className="w-full h-full relative rounded-[8px] overflow-hidden bg-[#f3f4f6]">
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
