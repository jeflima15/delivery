// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Search, Store, Gift } from 'lucide-react';
import ProductModal, { Product } from './ProductModal';
import { useToast } from './Toast';
import DynamicModal from './vitrine/DynamicModal';
import BlockAreaRenderer from './vitrine/BlockAreaRenderer';
import { cn } from '../lib/utils';

const DEFAULT_SECONDARY_BANNERS = [
  { id: 'secondary-banner-1', imageUrl: '', active: false, link: '' },
  { id: 'secondary-banner-2', imageUrl: '', active: false, link: '' },
  { id: 'secondary-banner-3', imageUrl: '', active: false, link: '' },
];

function normalizeSecondaryBanners(banners: any[] = []) {
  return DEFAULT_SECONDARY_BANNERS.map((fallback, index) => {
    const current = banners[index] || banners.find((item) => item?.id === fallback.id) || {};
    return {
      id: current.id || fallback.id,
      imageUrl: current.imageUrl || '',
      active: Boolean(current.active),
      link: current.link || '',
    };
  });
}

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
  const activeSecondaryBanners = normalizeSecondaryBanners(storeInfo?.secondaryBanners).filter(
    (banner) => banner.active && banner.imageUrl
  );
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
    if (bloco.acao_clique === 'modal') setActivePromoBlock(bloco);
  };

  const getBadgeConfig = (label: string) => {
    if (!label) return null;
    const t = label.trim().toLowerCase();
    
    if (t.includes('novo') || t.includes('novidade') || t.includes('lançamento')) {
      return { type: 'ribbon', style: 'bg-[#0f766e] text-white' };
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
      return { type: 'pill', style: 'border border-[#bbf7d0] bg-[#ecfdf5] text-[#047857] shadow-[0_6px_18px_rgba(5,150,105,0.08)]' };
    }
    return { type: 'pill', style: 'border border-stone-200 bg-stone-50 text-stone-700' };
  };

  const destaqueProducts = products.filter((p: any) => p.destaque && !p.esgotado);

  const renderVerticalCard = (product: any, key: string) => {
    const temDesconto = product.preco_antigo > product.preco;
    const percentualDesconto = temDesconto
      ? Math.max(1, Math.round(((product.preco_antigo - product.preco) / product.preco_antigo) * 100))
      : 0;

    return (
      <div
        key={key}
        onClick={() => !product.esgotado && handleProductClick(product)}
        className={`group relative flex w-[165px] sm:w-full shrink-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg ${
          product.esgotado ? 'opacity-70 grayscale-[0.8] cursor-not-allowed' : ''
        }`}
      >
        <div className="relative h-[150px] sm:h-[180px] md:h-[200px] w-full shrink-0 bg-gray-50 overflow-hidden">
          {product.imagem ? (
            <img
              src={product.imagem}
              alt={product.nome}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Store className="h-8 w-8 text-gray-300" />
            </div>
          )}
          
          {product.esgotado && (
            <div className="absolute inset-0 bg-white/20 backdrop-blur-[1px] flex items-center justify-center">
              <div className="rounded-md bg-gray-900/80 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-sm">
                Esgotado
              </div>
            </div>
          )}

          {temDesconto && !product.esgotado && (
            <div className="absolute left-2 top-2 z-10 flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black tracking-widest text-white shadow-sm">
              -{percentualDesconto}%
            </div>
          )}
          
          {isLoyaltyActive && product.pode_resgatar && !product.esgotado && (
            <div className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-700 via-amber-600 to-amber-500 text-white shadow-md">
              <Gift className="h-3 w-3" />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-3.5 sm:p-4">
          <h3 className="mb-1 line-clamp-2 min-h-[36px] sm:min-h-[40px] text-[14px] font-black leading-tight tracking-tight text-gray-900 sm:text-[15px]">
            {product.nome}
          </h3>
          {product.descricao ? (
            <p className="mb-2.5 line-clamp-2 min-h-[28px] text-[11px] leading-snug text-gray-500 sm:text-[12px]">
              {product.descricao}
            </p>
          ) : (
            <div className="mb-2.5 min-h-[28px]"></div>
          )}
          <div className="mt-auto flex flex-col pt-1">
            {temDesconto ? (
              <div className="flex items-end gap-1.5 align-bottom">
                <span className="text-[11px] font-semibold text-gray-400 line-through pb-[1px]">
                  R$ {product.preco_antigo.toFixed(2).replace('.', ',')}
                </span>
                <span className="text-[16px] xl:text-[17px] font-black leading-none tracking-tight text-emerald-600">
                  R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
                </span>
              </div>
            ) : (
              <span className="text-[16px] xl:text-[17px] font-black leading-none tracking-tight text-gray-900">
                R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
              </span>
            )}
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
          "relative flex w-full lg:w-[458px] h-[154px] min-h-[112px] p-2 bg-white border border-[rgba(0,0,0,0.12)] rounded-[8px] cursor-pointer transition-colors group",
          product.destaque && !product.esgotado ? "bg-emerald-50/5" : "hover:bg-gray-50/50",
          product.esgotado && "opacity-75 grayscale-[0.6] cursor-not-allowed" 
        )}
      >
        {/* Coluna Texto (Esquerda) */}
        <div className="flex-1 flex flex-col justify-between p-2 h-full min-w-0">
          <div>
            <h3 className="text-base font-medium leading-6 text-[#374151] line-clamp-1">
              {product.nome}
            </h3>
            
            {product.descricao && (
              <p className="mt-2 text-sm font-light leading-5 text-[#6b7280] line-clamp-2">
                {product.descricao}
              </p>
            )}
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-2">
              <span className="text-base font-normal leading-6 text-[#374151]">
                R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
              </span>
              {temDesconto && (
                <span className="text-[11px] font-normal text-gray-400 line-through">
                  R$ {product.preco_antigo.toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bloco Imagem (Direita) */}
        <div className="relative shrink-0 w-[136px] h-[136px] p-1 ml-4 flex items-center justify-center">
          <div className="w-full h-full relative rounded-lg overflow-hidden bg-gray-50 border border-gray-100/50">
             {product.imagem ? (
              <img src={product.imagem} alt={product.nome} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
             ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-300"><Store className="h-6 w-6" /></div>
             )}
             
             {product.esgotado && (
              <div className="absolute inset-0 bg-white/30 backdrop-blur-[1px] flex items-center justify-center z-20">
                <div className="rounded-md bg-gray-900/80 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-sm -rotate-6">
                  Esgotado
                </div>
              </div>
             )}

          {/* Badge Redondo do Presente (Fidelidade) */}
          {isLoyaltyActive && product.pode_resgatar && !product.esgotado && (
            <div className="absolute top-2.5 right-2.5 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-[#975E24] text-white shadow-sm">
              <Gift className="h-4 w-4" />
            </div>
          )}
          </div>
        </div>
      </div>
    );
  };

  const categorySelectStyle = {
    backgroundImage:
      'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2.5\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
    backgroundPosition: 'right 0.5rem center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '1.2rem',
  };

  const renderCategoryOptions = (allLabel = 'Todas as categorias') => (
    <>
      <option value="all">{allLabel}</option>
      {groupedProducts.map((g) => (
        <option key={g.category._id || g.category.id} value={g.category._id || g.category.id}>
          {g.category.nome}
        </option>
      ))}
    </>
  );

  return (
    <div className="w-full min-w-0 lg:max-w-[932px] animate-in fade-in duration-500">
      <div className="flex flex-col">
        {/* 1. ESTRUTURA DE BUSCA E CATEGORIA (EXATA REFERÊNCIA) */}
        {/* 1. ESTRUTURA DE BUSCA E CATEGORIA (EXATA REFERÊNCIA) */}
        <div id="main-search-menu-original" className="mt-3 px-2 pt-2 sm:mt-0 sm:px-0 sm:pt-0">
          <div className="flex w-full max-w-full items-center justify-between space-x-2 truncate">
            
            {/* Seletor Categoria (Mais Compacto) */}
            <div className="relative inline-block w-full min-w-0 text-left sm:w-[190px] sm:shrink-0">
              <select
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                className="inline-flex h-10 w-full max-w-full appearance-none items-center justify-center truncate rounded-md border border-gray-200/80 bg-white pl-2.5 pr-8 text-sm font-medium text-gray-500 shadow-sm outline-none hover:bg-gray-50 cursor-pointer sm:hidden"
                style={categorySelectStyle}
              >
                {renderCategoryOptions('Lista de categorias')}
              </select>
              <select
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                className="hidden h-10 w-full max-w-full appearance-none items-center justify-center truncate rounded-md border border-gray-200/80 bg-white pl-2.5 pr-8 text-sm font-medium text-gray-500 shadow-sm outline-none hover:bg-gray-50 sm:inline-flex sm:h-11 md:px-4 cursor-pointer"
                style={categorySelectStyle}
              >
                {renderCategoryOptions()}
              </select>
            </div>

            {/* Busca Clicável (Proporção Exata da Referência) */}
            <div 
               onClick={onOpenSearch}
               className="flex h-10 w-[42px] shrink-0 items-center justify-center space-x-2 rounded-md border border-gray-200/80 bg-white px-2 text-sm text-gray-500 shadow-sm hover:bg-gray-50 sm:h-11 sm:w-[306px] sm:justify-start cursor-pointer"
            >
              <div className="flex items-center">
                <Search className="h-5 w-5 shrink-0 text-gray-500" strokeWidth={1.5} />
              </div>
              <div className="hidden sm:flex items-center w-full max-w-xs min-w-64 text-[14px] font-normal truncate">
                 Busque por um produto
              </div>
              <div className="hidden">
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
            <div className="hide-scrollbar flex snap-x gap-4 overflow-x-auto pb-4 px-1 sm:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible" style={{ scrollbarWidth: 'none' }}>
               {destaqueProducts.map((product) => (
                  <div key={`destaque-${product._id || product.id}`} className="snap-start shrink-0 lg:shrink">
                     {renderVerticalCard(product, `vc-${product._id || product.id}`)}
                  </div>
               ))}
            </div>
          </div>
        )}

        {(activeSecondaryBanners.length > 0 || (!normalizedQuery && activeHomeBlocks.length > 0)) && (
          <div className="space-y-3.5 lg:space-y-4">
            {activeSecondaryBanners.length > 0 && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-3.5">
                {activeSecondaryBanners.map((banner) => {
                  const desktopSpan =
                    activeSecondaryBanners.length === 1
                      ? 'lg:col-span-12'
                      : activeSecondaryBanners.length === 2
                        ? 'lg:col-span-6'
                        : 'lg:col-span-4';

                  const card = (
                    <div className="overflow-hidden rounded-[18px] border border-[#e4e8de] bg-white p-1 shadow-[0_10px_22px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_16px_30px_rgba(15,23,42,0.07)]">
                      <img
                        src={banner.imageUrl}
                        alt={`Banner secundario ${banner.id}`}
                        className="h-32 w-full rounded-[14px] object-cover lg:h-[150px]"
                      />
                    </div>
                  );

                  if (banner.link) {
                    return (
                      <a
                        key={banner.id}
                        href={banner.link}
                        className={cn('block', desktopSpan)}
                        target={banner.link.startsWith('http') ? '_blank' : undefined}
                        rel={banner.link.startsWith('http') ? 'noreferrer' : undefined}
                      >
                        {card}
                      </a>
                    );
                  }

                  return <div key={banner.id} className={desktopSpan}>{card}</div>;
                })}
              </div>
            )}

            {!normalizedQuery && activeHomeBlocks.length > 0 && (
              <BlockAreaRenderer
                blocos={activeHomeBlocks}
                position="before_products"
                isLoyaltyActive={isLoyaltyActive}
                onBlockClick={handleBlockClick}
              />
            )}
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
                  <div id={`categoria-${group.category._id || group.category.id}`} className="scroll-mt-32 w-full max-w-[932px] mt-10">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div id="categoria-outros" className="scroll-mt-32 w-full max-w-[932px] mt-10">
                  <div className="mb-5">
                    <h2 className="text-[18px] font-semibold tracking-tight text-[#374151] lg:text-[20px]">
                      Outros
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

