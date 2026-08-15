import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';
import { comboIsPurchasable, isComboProduct } from '../lib/combo';

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
    <div className="fixed inset-0 z-[200] flex flex-col justify-center bg-black/45 sm:p-4 md:p-6 animate-in fade-in duration-200">
      
      {/* Clique fora */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />
      
      <div className="relative w-full sm:max-w-[1280px] sm:mx-auto bg-white shadow-xl flex flex-col h-full sm:h-auto sm:max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Barra Superior */}
        <div className="z-20 flex items-center justify-between shrink-0 px-3 py-3 h-[68px] space-x-3 shadow sm:py-4 md:px-5">
          <div className="flex flex-1 items-center space-x-4 truncate">
             <Search className="w-7 h-7 sm:w-8 sm:h-8 text-gray-400 shrink-0" strokeWidth={1.5} />
             <input
               ref={inputRef}
               type="text"
               value={query}
               onChange={(e) => setQuery(e.target.value)}
               placeholder="Pesquise por um produto"
               className="flex-1 w-full bg-transparent border-0 outline-none truncate text-[16px] sm:text-[20px] font-normal text-gray-600 placeholder:text-gray-400 leading-[28px]"
             />
          </div>
          <button 
             onClick={onClose}
             className="p-1 sm:p-2 text-gray-400 transition-colors hover:text-gray-700 font-bold"
          >
             <X className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.5} />
          </button>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto bg-white">
          {!query.trim() ? (
            <div className="flex flex-col items-center justify-center flex-1 h-full sm:h-[448px] p-8 sm:p-16 space-y-8 text-gray-300">
               <Search className="w-28 h-28 sm:w-52 sm:h-52 text-gray-300 shrink-0" strokeWidth={1} />
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="flex flex-col gap-0 border-t border-gray-100">
              {filteredProducts.map(product => (
                <button
                  key={product.id || product._id}
                  disabled={isComboProduct(product) && !comboIsPurchasable(product, products)}
                  onClick={() => handleSelectProduct(product)}
                  className="flex items-center text-left bg-white p-3 sm:p-4 hover:bg-gray-50 border-b border-gray-100 transition-all group disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {product.imagem ? (
                    <img src={product.imagem} alt={product.nome} className="w-14 h-14 rounded-md object-cover bg-gray-100 shrink-0 border border-gray-100" />
                  ) : (
                     <div className="w-14 h-14 rounded-md bg-gray-100 border border-gray-100 shrink-0 flex items-center justify-center">
                       <Search className="w-6 h-6 text-gray-300" />
                     </div>
                  )}
                  <div className="ml-4 flex-1 truncate pr-2">
                     <div className="flex items-center gap-2"><p className="truncate text-[16px] font-normal text-gray-800 transition-colors group-hover:store-text-primary">{product.nome}</p>{isComboProduct(product) && <span className="rounded store-bg-soft px-1.5 py-0.5 text-[9px] font-bold uppercase store-text-primary">Combo</span>}</div>
                     <p className="font-normal text-gray-500 text-[14px] mt-0.5 truncate">{product.descricao}</p>
                  </div>
                  <div className="flex flex-col items-end shrink-0 pl-2">
                     <p className="font-medium text-gray-900 text-[16px]">
                       {isComboProduct(product) ? 'A partir de R$ ' : 'R$ '}{product.preco.toFixed(2).replace('.', ',')}
                     </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 h-full sm:h-[448px] p-8 sm:p-16 text-gray-300 space-y-4">
              <Search className="w-16 h-16 sm:w-24 sm:h-24 text-gray-300 shrink-0" strokeWidth={1.5} />
              <p className="font-medium text-[20px] text-gray-500">Nenhum produto encontrado</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
