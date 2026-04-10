// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Search, Store, Gift } from 'lucide-react';
import ProductModal, { Product } from './ProductModal';
import { useToast } from './Toast';
import PromoCard from './vitrine/PromoCard';
import DynamicModal from './vitrine/DynamicModal';
import { cn } from '../lib/utils';

interface Category {
  id: string;
  _id?: string;
  nome: string;
  descricao?: string;
}

interface HomeProps {
  onAddToCart: (item: any) => void;
  isScrolled?: boolean;
  storeInfo?: any;
  currentView?: string;
  setCurrentView?: (v: string) => void;
}

export default function Home({
  onAddToCart,
  isScrolled = false,
  storeInfo,
  currentView,
  setCurrentView,
  activeCategory,
  setActiveCategory,
  categories,
  setCategories,
  products,
  setProducts,
  searchQuery,
  setSearchQuery,
}: HomeProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [homeBlocks, setHomeBlocks] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activePromoBlock, setActivePromoBlock] = useState<any>(null);

  const { showToast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, prodRes, blocksRes] = await Promise.all([
          fetch('/api/categorias'),
          fetch('/api/produtos'),
          fetch('/api/blocos_home'),
        ]);

        const catData = await catRes.json();
        const prodData = await prodRes.json();
        const blocksData = await blocksRes.json();

        setCategories(catData);
        setProducts(prodData);
        if (blocksData.sucesso) setHomeBlocks(blocksData.blocos);
      } catch (error) {
        console.error('Erro ao buscar dados da API:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleAddToCartWrapper = (item: any) => {
    onAddToCart(item);
    showToast(`${item.nome} adicionado à sacola!`, 'success');
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const groupedProducts = categories
    .map((cat) => {
      let catProducts = products.filter((p) => (p as any).categoriaId === (cat._id || cat.id));
      if (normalizedQuery) {
        catProducts = catProducts.filter(
          (p) =>
            p.nome.toLowerCase().includes(normalizedQuery) ||
            p.descricao.toLowerCase().includes(normalizedQuery)
        );
      }
      return { category: cat, products: catProducts };
    })
    .filter((group) => group.products.length > 0);

  let uncategorizedProducts = products.filter((p) => !(p as any).categoriaId);
  if (normalizedQuery) {
    uncategorizedProducts = uncategorizedProducts.filter(
      (p) =>
        p.nome.toLowerCase().includes(normalizedQuery) ||
        p.descricao.toLowerCase().includes(normalizedQuery)
    );
  }

  const handleBlockClick = (bloco: any) => {
    if (bloco.acao_clique === 'modal') setActivePromoBlock(bloco);
  };

  const renderProductCard = (product: any, key: string) => (
    <div
      key={key}
      onClick={() => !product.esgotado && handleProductClick(product)}
      className={`bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm flex min-h-[156px] gap-4 transition-all relative overflow-hidden ${
        product.esgotado ? 'opacity-60 grayscale cursor-not-allowed' : 'cursor-pointer hover:shadow-md'
      }`}
    >
      <div className="flex-1 flex flex-col min-w-0 pr-2">
        <div className="flex flex-col">
          <h3 className="text-[15px] font-black text-gray-950 dark:text-slate-100 mb-1 leading-tight">
            {product.nome}
          </h3>
          <p className="text-[12px] text-gray-500 dark:text-slate-400 line-clamp-2 mb-4 leading-relaxed">
            {product.descricao}
          </p>
        </div>

        <div className="mt-auto">
          <span className="text-[11px] uppercase tracking-[0.24em] text-gray-400 font-bold block mb-1">
            cardápio
          </span>
          <span className="text-[18px] font-black text-gray-950 dark:text-white">
            R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
          </span>
        </div>
      </div>

      <div className="w-32 h-28 shrink-0 bg-gray-50 dark:bg-slate-700/50 rounded-2xl relative flex items-center justify-center overflow-hidden border border-gray-100 dark:border-slate-700">
        {product.imagem ? (
          <img src={product.imagem} alt={product.nome} className="w-full h-full object-cover" />
        ) : (
          <Store className="w-6 h-6 text-gray-300" />
        )}

        {product.pode_resgatar && (
          <div className="absolute top-2 right-2 bg-[#a66a2b] text-white p-1.5 rounded-full shadow-sm">
            <Gift className="w-3.5 h-3.5" />
          </div>
        )}

        {product.esgotado && <div className="esgotado-badge">Esgotado</div>}
      </div>
    </div>
  );

  return (
    <div className="w-full animate-in fade-in duration-500">
      <div className="flex flex-col gap-8">
        <div className="w-full">
          <div className="flex lg:hidden gap-3 w-full items-center">
            <div className="flex-1">
              <select
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                className="w-full h-14 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-5 text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm outline-none appearance-none cursor-pointer"
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
                  backgroundPosition: 'right 1.25rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1rem',
                }}
              >
                <option value="all">Categorias</option>
                {groupedProducts.map((g) => (
                  <option key={g.category._id || g.category.id} value={g.category._id || g.category.id}>
                    {g.category.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-14 h-14 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl flex items-center justify-center shadow-sm text-gray-400">
              <Search className="w-5 h-5" />
            </div>
          </div>

          <div className="hidden lg:flex gap-4 w-full items-center">
            <div className="w-48 shrink-0">
              <select
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                className="w-full h-11 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-4 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm outline-none appearance-none cursor-pointer"
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
                  backgroundPosition: 'right 1rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1rem',
                }}
              >
                <option value="all">Lista de categorias</option>
                {groupedProducts.map((g) => (
                  <option key={g.category._id || g.category.id} value={g.category._id || g.category.id}>
                    {g.category.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Busque por um produto"
                className="w-full h-11 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 pl-12 pr-4 rounded-lg shadow-sm focus:outline-none focus:border-emerald-500 text-sm font-medium text-gray-700 dark:text-gray-200 placeholder-gray-400"
              />
            </div>
          </div>
        </div>

        {normalizedQuery && (
          <div className="text-sm text-gray-500 dark:text-slate-400">
            Resultados para <span className="font-black text-gray-900 dark:text-white">"{searchQuery}"</span>
            <button
              onClick={() => setSearchQuery('')}
              className="ml-3 text-[11px] font-black uppercase tracking-widest text-red-500 hover:underline"
            >
              Limpar
            </button>
          </div>
        )}

        {!isLoading && !normalizedQuery && homeBlocks.length > 0 && (
          <div
            className={cn(
              'gap-4',
              homeBlocks.length === 1
                ? 'grid max-w-[304px] grid-cols-1'
                : homeBlocks.length === 2
                ? 'grid grid-cols-1 md:grid-cols-2'
                : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
            )}
          >
            {homeBlocks.map((bloco) => (
              <PromoCard key={bloco._id || bloco.titulo} bloco={bloco} onClick={handleBlockClick} />
            ))}
          </div>
        )}

        <div className="space-y-12">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={`skel-${i}`} className="h-32 bg-gray-100 dark:bg-slate-800 animate-pulse rounded-2xl"></div>
              ))}
            </div>
          ) : groupedProducts.length === 0 && uncategorizedProducts.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-10 text-center shadow-sm">
              <p className="text-lg font-black text-gray-900 dark:text-white">Nenhum produto encontrado</p>
              <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
                Tente outro termo de busca ou escolha uma categoria diferente.
              </p>
            </div>
          ) : (
            <>
              {groupedProducts.map((group) => (
                <div key={group.category._id || group.category.id} id={`categoria-${group.category._id || group.category.id}`} className="scroll-mt-28">
                  <div className="mb-6">
                    <h2 className="text-2xl font-black text-gray-950 dark:text-white uppercase tracking-tight">
                      {group.category.nome}
                    </h2>
                    <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
                      {group.category.descricao || `${group.products.length} item(ns) prontos para pedido nessa seção.`}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {group.products.map((product: any) =>
                      renderProductCard(product, `${group.category._id || group.category.id}-${product._id || product.id}`)
                    )}
                  </div>
                </div>
              ))}

              {uncategorizedProducts.length > 0 && (
                <div id="categoria-outros" className="scroll-mt-28">
                  <div className="mb-6">
                    <h2 className="text-2xl font-black text-gray-950 dark:text-white uppercase tracking-tight">Outros</h2>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {uncategorizedProducts.map((product: any) =>
                      renderProductCard(product, `outros-${product._id || product.id}`)
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ProductModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddToCart={handleAddToCartWrapper}
      />

      <DynamicModal
        isOpen={!!activePromoBlock}
        onClose={() => setActivePromoBlock(null)}
        bloco={activePromoBlock}
      />
    </div>
  );
}

