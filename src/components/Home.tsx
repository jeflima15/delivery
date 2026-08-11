// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Search, Store, Gift } from 'lucide-react';
import ProductModal, { Product } from './ProductModal';
import { useToast } from './Toast';
import DynamicModal from './vitrine/DynamicModal';
import BlockAreaRenderer from './vitrine/BlockAreaRenderer';
import CategoryDropdown from './CategoryDropdown';
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
  isLoyaltyActive?: boolean;
  currentView?: string;
  setCurrentView?: (v: string) => void;
  activeCategory: string;
  setActiveCategory: (v: string) => void;
  categories: any[];
  products: any[];
  homeBlocks: any[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onOpenSearch: () => void;
}

export default function Home({
  onAddToCart,
  isScrolled = false,
  storeInfo,
  isLoyaltyActive = false,
  currentView,
  setCurrentView,
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
  const [activePromoBlock, setActivePromoBlock] = useState<any>(null);

  const { showToast } = useToast();

  useEffect(() => {
    const logoShapeClass = storeInfo?.logoShape === 'circle' ? 'rounded-full' : 'rounded-2xl';
    const logoWrappers = Array.from(document.querySelectorAll('header img[alt="Logo"]'))
      .map((image) => image.parentElement)
      .filter((wrapper) => wrapper && !wrapper.hasAttribute('data-mobile-store-logo')) as HTMLElement[];

    logoWrappers.forEach((wrapper) => {
      wrapper.classList.remove('rounded-full', 'rounded-2xl', 'rounded-[1.4rem]', 'rounded-[1.5rem]');
      wrapper.classList.add(logoShapeClass);
    });
  }, [storeInfo?.logoShape, currentView]);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleAddToCartWrapper = (item: any) => {
    onAddToCart(item);
    showToast(`${item.nome} adicionado à sacola!`, 'success');
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const activeHomeBlocks = (homeBlocks || []).filter((bloco) => bloco?.ativo !== false);

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

  const getBadgeConfig = (label: string) => {
    if (!label) return null;
    const t = label.trim().toLowerCase();
    
    if (t.includes('novo') || t.includes('novidade') || t.includes('lançamento')) {
      return { type: 'ribbon', style: 'store-bg-primary' };
    }
    if (t.includes('mais pedido') || t.includes('popular') || t.includes('vendido')) {
      return { type: 'pill', style: 'border border-[#fed7aa] bg-[#fff7ed] text-[#c2410c] shadow-[0_6px_18px_rgba(234,88,12,0.08)]' };
    }
    if (t.includes('recomendado') || t.includes('sugestão') || t.includes('chef')) {
      return { type: 'pill', style: 'border border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8] shadow-[0_6px_18px_rgba(59,130,246,0.08)]' };
    }
    if (t.includes('limitada') || t.includes('esgotando')) {
      return { type: 'pill', style: 'border border-[#fbcfe8] bg-[#fdf2f8] text-[#be185d] shadow-[0_6px_18px_rgba(190,24,93,0.08)]' };
    }
    if (t.includes('promoção') || t.includes('oferta') || t.includes('imperdível')) {
      return { type: 'pill', style: 'border store-border-soft store-bg-soft store-text-primary' };
    }
    return { type: 'pill', style: 'border border-stone-200 bg-stone-50 text-stone-700' };
  };

  const catalogOrderedProducts = [
    ...groupedProducts.flatMap((group) => group.products),
    ...uncategorizedProducts,
  ];
  const destaqueProducts = catalogOrderedProducts.filter((p: any) => p.destaque && !p.esgotado);

  const renderVerticalCard = (product: any, key: string) => {
    const temDesconto = product.preco_antigo > product.preco;
    const percentualDesconto = temDesconto
      ? Math.max(1, Math.round(((product.preco_antigo - product.preco) / product.preco_antigo) * 100))
      : 0;

    return (
      <div
        key={key}
        onClick={() => !product.esgotado && handleProductClick(product)}
        className={cn(
          'group relative flex h-[262px] w-44 shrink-0 cursor-pointer flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:store-border-soft sm:h-auto sm:w-full',
          product.esgotado && 'cursor-not-allowed opacity-70 grayscale-[0.8]'
        )}
      >
        <div className="relative h-[148px] w-full shrink-0 bg-white p-1 sm:h-[180px] md:h-[200px]">
          <div className="relative h-full w-full overflow-hidden rounded-lg bg-gray-50">
            {product.imagem ? (
              <img
                src={product.imagem}
                alt={product.nome}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Store className="h-8 w-8 text-gray-300" />
              </div>
            )}

            {product.esgotado ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/35 backdrop-blur-[1px]">
                <span className="rounded-md bg-gray-900/80 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                  Esgotado
                </span>
              </div>
            ) : null}

            {temDesconto && !product.esgotado ? (
              <span className="absolute left-2 top-2 z-10 rounded-md bg-red-500 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white">
                -{percentualDesconto}%
              </span>
            ) : null}

            {isLoyaltyActive && product.pode_resgatar && !product.esgotado ? (
              <span className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full store-bg-primary store-text-on-primary shadow-sm">
                <Gift className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-2.5 sm:p-3">
          <h3 className="line-clamp-2 text-[14px] font-medium leading-5 text-gray-700 sm:text-[15px]">
            {product.nome}
          </h3>
          {product.descricao ? (
            <p className="mt-1 line-clamp-2 text-[12px] font-light leading-4 text-gray-500 sm:text-[13px]">
              {product.descricao}
            </p>
          ) : null}
          <div className="mt-auto flex items-center gap-1.5 pt-2">
            <span className="text-[15px] font-normal leading-5 text-gray-700">
              R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
            </span>
            {temDesconto ? (
              <span className="text-[10px] font-normal text-gray-400 line-through">
                R$ {product.preco_antigo.toFixed(2).replace('.', ',')}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderHorizontalCard = (product: any, key: string) => {
    const temDesconto = product.preco_antigo > product.preco;
    const badgeConfig = getBadgeConfig(product.selo_destaque);
    const percentualDesconto = temDesconto
      ? Math.max(1, Math.round(((product.preco_antigo - product.preco) / product.preco_antigo) * 100))
      : 0;

    return (
      <div
        key={key}
        onClick={() => !product.esgotado && handleProductClick(product)}
        className={cn(
          "relative flex h-[146px] min-h-[112px] w-full overflow-hidden rounded-lg border border-[rgba(0,0,0,0.12)] bg-white p-2 transition-colors group sm:h-[154px]",
          product.destaque && !product.esgotado ? "store-bg-soft" : "hover:bg-gray-50/50",
          product.esgotado
            ? "cursor-not-allowed opacity-75 grayscale-[0.6]"
            : "cursor-pointer"
        )}
      >
        {/* Coluna Texto (Esquerda) */}
        <div className={cn('flex h-full min-w-0 flex-1 flex-col justify-between p-2', badgeConfig && 'pt-7')}>
          {badgeConfig && !product.esgotado ? (
            <span className={cn('absolute left-4 top-3 max-w-[55%] truncate rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wide', badgeConfig.style)}>
              {product.selo_destaque}
            </span>
          ) : null}
          <div>
            <h3 className="line-clamp-1 text-[15px] font-medium leading-5 text-[#374151] sm:text-base sm:leading-6">
              {product.nome}
            </h3>
            
            {product.descricao && (
              <p className="mt-1.5 line-clamp-2 text-[13px] font-light leading-[18px] text-[#6b7280] sm:mt-2 sm:text-sm sm:leading-5">
                {product.descricao}
              </p>
            )}
          </div>

          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className="text-base font-normal leading-6 text-[#374151]">
                R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
              </span>
              {temDesconto && (
                <span className="text-[11px] font-normal text-gray-400 line-through">
                  R$ {product.preco_antigo.toFixed(2).replace('.', ',')}
                </span>
              )}
              {temDesconto && !product.esgotado ? (
                <span className="rounded-md store-bg-soft px-1.5 py-0.5 text-[9px] font-bold store-text-primary">
                  -{percentualDesconto}%
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Bloco Imagem (Direita) */}
        <div className="relative ml-2 flex h-[128px] w-[128px] shrink-0 items-center justify-center p-1 sm:ml-4 sm:h-[136px] sm:w-[136px]">
          <div className="w-full h-full relative rounded-lg overflow-hidden bg-gray-50 border border-gray-100/50">
             {product.imagem ? (
              <img src={product.imagem} alt={product.nome} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
             ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-300"><Store className="h-6 w-6" /></div>
             )}
             
             {product.esgotado ? <div className="absolute inset-0 z-20 bg-white/35 backdrop-blur-[1px]" /> : null}
             {product.esgotado ? (
               <div className="absolute -right-8 top-4 z-30 w-28 rotate-45 bg-gray-700 py-1 text-center text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">
                 Esgotado
               </div>
             ) : null}

          {/* Badge Redondo do Presente (Fidelidade) */}
          {isLoyaltyActive && product.pode_resgatar && !product.esgotado && (
            <div className="absolute right-2.5 top-2.5 z-30 flex h-9 w-9 items-center justify-center rounded-full store-bg-primary store-text-on-primary shadow-sm">
              <Gift className="h-4 w-4" />
            </div>
          )}
          </div>
        </div>
      </div>
    );
  };

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
                     {renderVerticalCard(product, `vc-${product._id || product.id}`)}
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
                      {group.products.map((product: any) =>
                        renderHorizontalCard(product, `${group.category._id || group.category.id}-${product._id || product.id}`)
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
                    {uncategorizedProducts.map((product: any) =>
                      renderHorizontalCard(product, `outros-${product._id || product.id}`)
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

      <ProductModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddToCart={handleAddToCartWrapper}
        isLoyaltyActive={isLoyaltyActive}
      />

      <DynamicModal
        isOpen={!!activePromoBlock}
        onClose={() => setActivePromoBlock(null)}
        bloco={activePromoBlock}
      />
    </div>
  );
}

