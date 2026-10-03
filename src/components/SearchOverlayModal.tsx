import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { isComboProduct } from '../lib/combo';
import { catalogItemUnavailable, normalizeCatalogSearch } from '../lib/catalogPresentation';
import { useDialogFocus } from '../hooks/useDialogFocus';
import type { Category, Product } from '../types/storefront';
import ProductPreorderNotice from './ProductPreorderNotice';

interface SearchOverlayModalProps {
  isOpen: boolean; onClose: () => void; products: Product[]; categories: Category[];
  onProductClick?: (product: Product) => void;
}
export default function SearchOverlayModal({ isOpen, onClose, products, categories, onProductClick }: SearchOverlayModalProps) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(15);
  const dialogRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef(0);
  useDialogFocus(isOpen, dialogRef, onClose);
  useEffect(() => { if (isOpen && resultsRef.current) resultsRef.current.scrollTop = scrollPosition.current; }, [isOpen]);
  if (!isOpen) return null;
  const term = normalizeCatalogSearch(query);
  const filtered = products.filter(product => product.ativo !== false && !product.exclusivo_combo && (
    term ? normalizeCatalogSearch([product.nome, product.descricao, product.categoriaNome].join(' ')).includes(term) : product.destaque
  ));
  const suggestions = filtered.length ? filtered : products.filter(product => product.ativo !== false && !product.exclusivo_combo).slice(0, 6);
  const results = term ? filtered : suggestions;
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Buscar no cardápio" tabIndex={-1} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[85dvh] sm:max-w-3xl sm:rounded-2xl">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <Search className="h-5 w-5 shrink-0 text-gray-400" />
        <input data-dialog-autofocus aria-label="Pesquisar produto" value={query} onChange={event => { setQuery(event.target.value); setLimit(15); scrollPosition.current = 0; if (resultsRef.current) resultsRef.current.scrollTop = 0; }} placeholder="Produto, ingrediente ou categoria" className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none" />
        <button type="button" aria-label="Fechar busca" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
      </div>
      <div ref={resultsRef} onScroll={event => { scrollPosition.current = event.currentTarget.scrollTop; }} className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:min-h-80">
        <p role="status" className="px-4 py-3 text-sm text-gray-500">{term ? results.length + ' resultado(s)' : 'Sugestões do cardápio'}</p>
        {results.slice(0, limit).map(product => {
          const unavailable = catalogItemUnavailable(product, products);
          return <button key={product._id || product.id} type="button" disabled={unavailable} onClick={() => onProductClick?.(product)} className="flex w-full items-center gap-3 border-b border-gray-100 p-4 text-left hover:bg-gray-50 disabled:opacity-60">
            {product.imagem ? <img src={product.imagem} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gray-100"><Search className="h-5 w-5 text-gray-300" /></div>}
            <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold text-gray-800">{product.nome}</p><p className="mt-1 line-clamp-1 text-xs text-gray-500">{product.descricao}</p><ProductPreorderNotice value={product.preorder} />{unavailable && <p className="mt-1 text-xs font-semibold text-gray-500">Indisponível no momento</p>}</div>
            <span className="shrink-0 text-sm font-semibold">{isComboProduct(product) ? 'Desde ' : ''}{product.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </button>;
        })}
        {results.length > limit && <button type="button" onClick={() => setLimit(value => value + 15)} className="min-h-11 w-full p-4 text-sm font-semibold store-text-primary">Mostrar mais resultados</button>}
        {term && !results.length && <div className="px-6 py-8 text-center"><p className="font-semibold text-gray-800">Não encontramos esse produto</p><p className="mt-2 text-sm text-gray-500">Tente outro nome ou explore uma categoria.</p><div className="mt-4 flex flex-wrap justify-center gap-2">{categories.map(category => <button key={category._id || category.id} type="button" onClick={() => { setQuery(category.nome); setLimit(15); }} className="min-h-11 rounded-full border px-4 text-sm">{category.nome}</button>)}</div></div>}
      </div>
    </div>
  </div>;
}
