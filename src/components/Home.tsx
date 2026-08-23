import React, { useCallback, useState } from 'react';
import { Search } from 'lucide-react';
import ProductModal from './ProductModal';
import ComboModal from './ComboModal';
import { useToast } from './Toast';
import DynamicModal from './vitrine/DynamicModal';
import BlockAreaRenderer from './vitrine/BlockAreaRenderer';
import CategoryDropdown from './CategoryDropdown';
import ProductCardVertical from './vitrine/ProductCardVertical';
import ProductCardHorizontal from './vitrine/ProductCardHorizontal';
import { isComboProduct } from '../lib/combo';
import type { CartItem, Category, HomeBlock, Product, StoreSettings } from '../types/storefront';

interface HomeProps {
  onAddToCart: (item: CartItem) => void;
  isScrolled?: boolean;
  storeInfo?: StoreSettings;
  isLoyaltyActive?: boolean;
  currentView?: string;
  setCurrentView?: (v: string) => void;
  activeCategory: string;
  setActiveCategory: (v: string) => void;
  categories: Category[];
  products: Product[];
  homeBlocks: HomeBlock[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onOpenSearch: () => void;
}

export default function Home({
  onAddToCart,
  isLoyaltyActive = false,
  activeCategory,
  setActiveCategory,
  categories,
  products,
  homeBlocks,
  searchQuery,
  setSearchQuery,
  onOpenSearch,
}: HomeProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activePromoBlock, setActivePromoBlock] = useState<HomeBlock | null>(null);

  const { showToast } = useToast();

  const handleProductClick = useCallback((product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  }, []);

  const handleAddToCartWrapper = useCallback((item: CartItem) => {
    onAddToCart(item);
    showToast(`${item.nome} adicionado à sacola!`, 'success');
  }, [onAddToCart, showToast]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const activeHomeBlocks = (homeBlocks || []).filter((bloco) => bloco?.ativo !== false);

  const groupedProducts: Array<{ category: Category; products: Product[] }> = categories
    .map((cat) => {
      let catProducts = products.filter((p) => p.categoriaId === (cat._id || cat.id));
      if (normalizedQuery) {
        catProducts = catProducts.filter(
          (p) =>
            p.nome.toLowerCase().includes(normalizedQuery) ||
            p.descricao?.toLowerCase().includes(normalizedQuery)
        );
      }
      return { category: cat, products: catProducts };
    })
    .filter((group) => group.products.length > 0);

  let uncategorizedProducts = products.filter((p) => !p.categoriaId);
  if (normalizedQuery) {
    uncategorizedProducts = uncategorizedProducts.filter(
      (p) =>
        p.nome.toLowerCase().includes(normalizedQuery) ||
        p.descricao?.toLowerCase().includes(normalizedQuery)
    );
  }

  const handleBlockClick = (bloco: HomeBlock) => {
    if (bloco.acao_clique === 'modal') {
      setActivePromoBlock(bloco);
    } else if (bloco.acao_clique === 'link' && bloco.link_destino) {
      const rawLink = bloco.link_destino.trim();
      if (!rawLink) return;
      
      const isExternal = rawLink.startsWith('http://') || rawLink.startsWith('https://');
      const formattedHref = isExternal
        ? rawLink
        : rawLink.startsWith('/') || rawLink.startsWith('#')
          ? rawLink
          : `/#${encodeURIComponent(rawLink)}`;
          
      if (isExternal) {
        window.open(formattedHref, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = formattedHref;
      }
    }
  };

  const catalogOrderedProducts = [
    ...groupedProducts.flatMap((group) => group.products),
    ...uncategorizedProducts,
  ];
  const destaqueProducts = catalogOrderedProducts.filter((p) => p.destaque && !p.esgotado);

  return (
    <div className="w-full min-w-0 animate-in fade-in duration-500">
        {/* Busca e navegação do catálogo */}
        <div id="main-search-menu-original" className="mt-3 px-2 pt-2 sm:mt-0 sm:px-0 sm:pt-0">
          <div className="flex w-full max-w-full items-center justify-between space-x-2">
            
            {/* Seletor Categoria (Mais Elegante estilo B3X) */}
            <div className="relative inline-block w-full min-w-0 text-left sm:w-[220px] sm:shrink-0">
              <CategoryDropdown
                categories={categories}
                activeCategory={activeCategory}
                onSelectCategory={setActiveCategory}
                defaultLabel="Lista de categorias"
                className="w-full"
              />
            </div>

            {/* Busca Clicável (Proporção Exata da Referência) */}
            <div 
               onClick={onOpenSearch}
               className="flex h-10 w-[42px] shrink-0 cursor-pointer items-center justify-center space-x-2 rounded-md border border-gray-200/80 bg-white px-2 text-sm text-gray-500 shadow-sm hover:bg-gray-50 sm:h-11 sm:w-[306px] sm:justify-start"
            >
              <div className="flex items-center">
                <Search className="h-5 w-5 shrink-0 text-gray-500" strokeWidth={1.5} />
              </div>
              <div className="hidden sm:flex items-center w-full max-w-xs min-w-64 text-[14px] font-normal truncate">
                 Busque por um produto
              </div>
            </div>

          </div>
        </div>

        {/* Blocos do topo */}
        {!normalizedQuery && activeHomeBlocks.length > 0 && (
          <div className="mt-2 px-1 text-left sm:px-0">
            <BlockAreaRenderer
              blocos={activeHomeBlocks}
              position="below_hero"
              isLoyaltyActive={isLoyaltyActive}
              onBlockClick={handleBlockClick}
            />
          </div>
        )}

        {/* 2. AREA DE DESTAQUES (Vitrine) */}
        {!normalizedQuery && (destaqueProducts.length > 0) && (
          <div className="mb-0 mt-6 md:mt-8 pb-8 border-b border-gray-100">
            <h2 className="mb-4 px-1 text-[22px] font-black tracking-tight text-gray-900 sm:px-0">
               Destaques da casa
            </h2>
            {/* Grid no desktop, scroll no mobile */}
            <div className="hide-scrollbar flex snap-x gap-3 overflow-x-auto px-1 pb-4 sm:px-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible" style={{ scrollbarWidth: 'none' }}>
               {destaqueProducts.map((product) => (
                  <div key={`destaque-${product._id || product.id}`} className="snap-start shrink-0 lg:shrink">
                     <ProductCardVertical
                        product={product}
                        products={products}
                        isLoyaltyActive={isLoyaltyActive}
                        onClick={handleProductClick}
                     />
                  </div>
               ))}
            </div>
          </div>
        )}

        {!normalizedQuery && activeHomeBlocks.length > 0 && (
          <div className="space-y-3.5 lg:space-y-4">
            <BlockAreaRenderer
              blocos={activeHomeBlocks}
              position="before_products"
              isLoyaltyActive={isLoyaltyActive}
              onBlockClick={handleBlockClick}
            />
          </div>
        )}

        {normalizedQuery && (
          <div className="mb-6 px-2 sm:px-0">
            <div className="rounded-2xl border border-[#e4e8de] bg-white px-4 py-3 text-sm text-gray-500 shadow-[0_12px_26px_rgba(15,23,42,0.04)] dark:text-slate-400">
              Resultados para <span className="font-black text-gray-900 dark:text-white">"{searchQuery}"</span>
              <button
                onClick={() => setSearchQuery('')}
                className="ml-3 text-[11px] font-black uppercase tracking-widest text-red-500 hover:underline"
              >
                Limpar
              </button>
            </div>
          </div>
        )}

        <div className="space-y-7 lg:space-y-8">
          {groupedProducts.length === 0 && uncategorizedProducts.length === 0 ? (
            <div className="rounded-[28px] border border-[#e4e8de] bg-white p-12 text-center shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
              <p className="text-xl font-black tracking-tight text-gray-900">Nenhum produto encontrado</p>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                Tente outro termo de busca ou escolha uma categoria diferente.
              </p>
            </div>
          ) : (
            <>
              {groupedProducts.map((group, index) => (
                <React.Fragment key={group.category._id || group.category.id}>
                  <div id={`categoria-${group.category._id || group.category.id}`} className="mt-8 w-full scroll-mt-32 sm:mt-10">
                    <div className="mb-5">
                      <h2 className="text-[18px] font-semibold tracking-tight text-[#374151] lg:text-[20px]">
                        {group.category.nome}
                      </h2>
                      {group.category.descricao?.trim() ? (
                        <p className="mt-1 text-sm font-light leading-5 text-gray-500">
                          {group.category.descricao}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:gap-4">
                      {group.products.map((product) =>
                        <ProductCardHorizontal
                          key={`${group.category._id || group.category.id}-${product._id || product.id}`}
                          product={product}
                          products={products}
                          onClick={handleProductClick}
                          isLoyaltyActive={isLoyaltyActive}
                        />
                      )}
                    </div>
                  </div>

                  {!normalizedQuery && index === 0 && activeHomeBlocks.length > 0 && (
                    <BlockAreaRenderer
                      blocos={activeHomeBlocks}
                      position="middle_home"
                      isLoyaltyActive={isLoyaltyActive}
                      onBlockClick={handleBlockClick}
                    />
                  )}
                </React.Fragment>
              ))}

              {uncategorizedProducts.length > 0 && (
                <div id="categoria-outros" className="mt-8 w-full scroll-mt-32 sm:mt-10">
                  <div className="mb-5">
                    <h2 className="text-[18px] font-semibold tracking-tight text-[#374151] lg:text-[20px]">
                      Outros
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:gap-4">
                    {uncategorizedProducts.map((product) =>
                      <ProductCardHorizontal
                         key={`outros-${product._id || product.id}`}
                         product={product}
                         products={products}
                         isLoyaltyActive={isLoyaltyActive}
                         onClick={handleProductClick}
                      />
                    )}
                  </div>
                </div>
              )}

              {!normalizedQuery && activeHomeBlocks.length > 0 && (
                <BlockAreaRenderer
                  blocos={activeHomeBlocks}
                  position="after_products"
                  isLoyaltyActive={isLoyaltyActive}
                  onBlockClick={handleBlockClick}
                />
              )}
            </>
          )}
        </div>

      {isComboProduct(selectedProduct) ? <ComboModal product={selectedProduct} products={products} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAddToCart={handleAddToCartWrapper} /> : <ProductModal product={selectedProduct} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAddToCart={handleAddToCartWrapper} isLoyaltyActive={isLoyaltyActive} />}

      <DynamicModal
        isOpen={!!activePromoBlock}
        onClose={() => setActivePromoBlock(null)}
        bloco={activePromoBlock}
      />
    </div>
  );
}
