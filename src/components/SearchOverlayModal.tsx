import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';

export interface Product {
    id?: string;
    _id?: string;
    nome: string;
    descricao?: string;
    preco: number;
    preco_antigo?: number;
    imagem?: string;
    ativo: boolean;
    categoriaId?: string;
    categoriaNome?: string;
    [key: string]: any;
}

interface SearchOverlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  categories: any[];
  onProductClick?: (product: Product) => void;
}

export default function SearchOverlayModal({ isOpen, onClose, products, categories, onProductClick }: SearchOverlayModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Focar o input com um pequeno delay para garantir que o modal animou
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = '';
      setQuery(''); // Limpar busca ao fechar
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const normalizedQuery = query.trim().toLowerCase();
  
  // Limita a quantidade de resultados e faz a busca
  const filteredProducts = query.trim() !== '' 
    ? products.filter(p => 
        p.ativo && (
          p.nome.toLowerCase().includes(normalizedQuery) ||
          (p.descricao && p.descricao.toLowerCase().includes(normalizedQuery)) ||
          (p.categoriaNome && p.categoriaNome.toLowerCase().includes(normalizedQuery))
        )
      ).slice(0, 15) // Max 15 items no autocomplete
    : [];

  const handleSelectProduct = (product: Product) => {
    if (onProductClick) {
       onProductClick(product);
       onClose(); // Fechar o overlay apos clicar
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white sm:bg-black/40 sm:p-4 md:p-6 animate-in fade-in duration-200">
      
      {/* Clique fora (apenas no desktop) */}
      <div className="hidden sm:block absolute inset-0 cursor-pointer" onClick={onClose} />
      
      <div className="relative w-full sm:max-w-2xl sm:mx-auto bg-white sm:rounded-3xl shadow-2xl flex flex-col h-full sm:max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-5 sm:slide-in-from-top-8 sm:slide-in-from-bottom-auto duration-300">
        
        {/* Barra de Busca Exclusiva */}
        <div className="flex items-center px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="flex flex-1 items-center bg-gray-100 rounded-2xl h-[52px] px-4 shadow-inner ring-1 ring-emerald-500/0 focus-within:ring-emerald-500/50 focus-within:bg-white transition-all transition-colors duration-200">
            <Search className="w-5 h-5 text-gray-500 shrink-0 mr-3" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busque por um produto, categoria..."
              className="w-full h-full bg-transparent outline-none text-[15px] font-bold text-gray-800 placeholder:text-gray-400 placeholder:font-medium"
            />
            {query && (
              <button 
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
                title="Limpar"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <button 
             onClick={onClose}
             className="ml-4 font-bold text-gray-600 hover:text-gray-900 transition-colors text-sm"
          >
             Cancelar
          </button>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-2 sm:p-4">
          {!query.trim() ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] sm:min-h-[300px] text-gray-400">
              <Search className="w-12 h-12 mb-4 text-gray-200" />
              <p className="font-semibold text-[15px]">O que você está procurando?</p>
              <p className="text-[14px] mt-1 text-gray-400 max-w-xs text-center">Digite o nome do produto ou categoria para buscar.</p>
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <p className="px-3 py-1 font-bold text-gray-600 text-[11px] uppercase tracking-wider">Produtos recomendados</p>
              {filteredProducts.map(product => (
                <button
                  key={product.id || product._id}
                  onClick={() => handleSelectProduct(product)}
                  className="flex items-center text-left bg-white p-3 sm:p-4 rounded-2xl shadow-sm hover:shadow hover:bg-emerald-50 border border-gray-100/60 hover:border-emerald-100 transition-all group"
                >
                  {product.imagem ? (
                    <img src={product.imagem} alt={product.nome} className="w-14 h-14 rounded-xl object-cover bg-gray-100 shrink-0 border border-gray-100" />
                  ) : (
                     <div className="w-14 h-14 rounded-xl bg-gray-100 border border-gray-100 shrink-0 flex items-center justify-center">
                       <Search className="w-6 h-6 text-gray-300" />
                     </div>
                  )}
                  <div className="ml-4 flex-1 truncate pr-2">
                     <p className="font-bold text-gray-800 text-[15px] group-hover:text-emerald-700 transition-colors truncate">{product.nome}</p>
                     <p className="font-medium text-gray-500 text-[13px] mt-0.5 truncate">{product.descricao}</p>
                  </div>
                  <div className="flex flex-col items-end shrink-0 pl-2">
                     <p className="font-black text-gray-900 text-[15px]">
                       R$ {product.preco.toFixed(2).replace('.', ',')}
                     </p>
                     <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 mt-1" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] sm:min-h-[300px] text-gray-400">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                 <Search className="w-6 h-6 text-gray-300" />
              </div>
              <p className="font-bold text-[16px] text-gray-800">Nenhum resultado encontrado</p>
              <p className="text-[14px] mt-1 text-gray-500">Verifique a ortografia ou tente termos gerais.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
