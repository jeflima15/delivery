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
}: HomeProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activePromoBlock, setActivePromoBlock] = useState<any>(null);

  const { showToast } = useToast();

  useEffect(() => {
    const logoShapeClass = storeInfo?.logoShape === 'circle' ? 'rounded-full' : 'rounded-2xl';
    const logoWrappers = Array.from(document.querySelectorAll('header img[alt="Logo"]'))
      .map((image) => image.parentElement)
      .filter(Boolean) as HTMLElement[];

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

  const renderProductCard = (product: any, key: string) => {
    const temDesconto = product.preco_antigo > product.preco;
    const badgeConfig = getBadgeConfig(product.selo_destaque);
    const percentualDesconto = temDesconto
      ? Math.max(1, Math.round(((product.preco_antigo - product.preco) / product.preco_antigo) * 100))
      : 0;

    return (
      <div
        key={key}
        onClick={() => !product.esgotado && handleProductClick(product)}
        className={`relative flex min-h-[164px] gap-3.5 overflow-hidden rounded-[1.45rem] border p-3.5 transition-all duration-300 sm:min-h-[172px] sm:gap-4 sm:p-4 ${
          product.destaque && !product.esgotado
            ? 'border-[#d8e9dd] bg-[linear-gradient(180deg,#fbfffc_0%,#ffffff_100%)] shadow-[0_10px_28px_rgba(16,185,129,0.08)]'
            : 'border-[#e7ebdf] bg-white shadow-[0_8px_22px_rgba(15,23,42,0.045)]'
        } ${
          product.esgotado ? 'cursor-not-allowed opacity-80 grayscale-[0.72] group' : 'cursor-pointer hover:-translate-y-[2px] hover:border-[#cfe0d3] hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)] group'
        }`}
      >
        {product.destaque && !product.esgotado && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[linear-gradient(180deg,rgba(16,185,129,0.07),transparent)]" />
            <div className="pointer-events-none absolute bottom-4 left-0 top-4 w-1 rounded-r-full bg-emerald-500/70" />
          </>
        )}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex min-h-[92px] flex-col sm:min-h-[98px]">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {product.destaque && product.selo_destaque && badgeConfig?.type === 'pill' && !product.esgotado && (
                <span className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] leading-none',
                  badgeConfig?.style
                )}>
                  {product.selo_destaque}
                </span>
              )}
              {temDesconto && !product.esgotado && (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700 shadow-[0_6px_18px_rgba(16,185,129,0.08)]">
                  -{percentualDesconto}% OFF
                </span>
              )}
            </div>
            <h3 className="mb-1 line-clamp-2 text-[16px] font-black leading-[1.12] tracking-tight text-[#1f2937] sm:text-[17px]">
              {product.nome}
            </h3>
            <p className="mb-2.5 line-clamp-2 text-[12px] sm:text-[13px] leading-[1.4] text-[#7c8698]">
              {product.descricao || 'Detalhes do produto indisponiveis no momento.'}
            </p>
          </div>

          <div className="mt-auto pt-1.5">
            {temDesconto && (
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-400 line-through">
                  R$ {product.preco_antigo.toFixed(2).replace('.', ',')}
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
                  oferta
                </span>
              </div>
            )}
            <div className="flex items-end gap-1.5">
              <span className={`text-[19px] font-black leading-none tracking-tight sm:text-[20px] ${temDesconto ? 'text-[#16a34a]' : 'text-[#27364a] dark:text-gray-200'}`}>
                R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex h-[100px] w-[100px] shrink-0 items-center justify-center overflow-hidden rounded-[1rem] border border-[#e4ebdf] bg-[linear-gradient(145deg,#f8fbf7,#ffffff)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:h-[112px] sm:w-[112px] xl:h-[116px] xl:w-[116px]">
          {product.imagem ? (
            <img src={product.imagem} alt={product.nome} className="h-full w-full rounded-[0.82rem] object-cover transition-transform duration-500 group-hover:scale-[1.045]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-[0.82rem] bg-[#f6faf6]"><Store className="h-7 w-7 text-[#b7c9bb]" /></div>
          )}

          {/* Ribbon Decorativo: Novidade */}
          {product.destaque && product.selo_destaque && badgeConfig?.type === 'ribbon' && !product.esgotado && (
            <div className="absolute top-0 right-0 h-full w-full overflow-hidden rounded-[0.82rem] pointer-events-none z-10">
              <div
                className={cn(
                  'absolute transform rotate-45 py-[4px] text-center text-[8px] sm:text-[9px] font-black uppercase tracking-[0.18em] shadow-sm',
                  badgeConfig?.style
                )}
                style={{ width: '145%', right: '-25%', top: '13%' }}
              >
                {product.selo_destaque}
              </div>
            </div>
          )}

          {/* Ribbon Esgotado B3X Style */}
          {product.esgotado && (
            <div className="absolute top-0 right-0 h-full w-full overflow-hidden rounded-[0.82rem] pointer-events-none z-20">
              <div
                className="absolute transform rotate-45 bg-[#9b7b58] py-[4px] text-center text-[9px] font-black uppercase tracking-[0.18em] text-white shadow-sm"
                style={{ width: '145%', right: '-25%', top: '13%' }}
              >
                Esgotado
              </div>
            </div>
          )}

          {isLoyaltyActive && product.pode_resgatar && (
            <div className="absolute top-2 right-2 rounded-full bg-gradient-to-br from-amber-700 via-amber-600 to-amber-500 p-1.5 text-white shadow-[0_8px_18px_rgba(180,120,45,0.28)] z-10">
              <Gift className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full animate-in fade-in duration-500">
      <div className="flex flex-col gap-6 lg:gap-7">
        {!normalizedQuery && activeHomeBlocks.length > 0 && (
          <BlockAreaRenderer
            blocos={activeHomeBlocks}
            position="below_hero"
            isLoyaltyActive={isLoyaltyActive}
            onBlockClick={handleBlockClick}
          />
        )}

        <div className="w-full rounded-[24px] border border-[#e0e6da] bg-white/95 px-3 py-3 shadow-[0_16px_32px_rgba(15,23,42,0.05)] backdrop-blur-sm lg:px-3.5 lg:py-3.5">
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

          <div className="hidden w-full items-center gap-4 lg:flex">
            <div className="w-[250px] shrink-0">
              <select
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                className="w-full h-11 bg-white border border-gray-200 rounded-xl px-4 text-[14px] font-medium text-gray-700 outline-none appearance-none cursor-pointer focus:border-emerald-500 hover:border-gray-300 transition-colors shadow-sm"
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

            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-[18px] h-[18px]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Busque por um produto"
                className="w-full h-11 bg-white border border-gray-200 pl-11 pr-4 rounded-xl focus:outline-none focus:border-emerald-500 hover:border-gray-300 text-[14px] font-medium text-gray-700 placeholder-gray-400 transition-colors shadow-sm"
              />
            </div>
          </div>
        </div>

        {(activeSecondaryBanners.length > 0 || (!normalizedQuery && activeHomeBlocks.length > 0)) && (
          <div className="space-y-5 lg:space-y-6">
            {activeSecondaryBanners.length > 0 && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
                {activeSecondaryBanners.map((banner) => {
                  const desktopSpan =
                    activeSecondaryBanners.length === 1
                      ? 'lg:col-span-12'
                      : activeSecondaryBanners.length === 2
                        ? 'lg:col-span-6'
                        : 'lg:col-span-4';

                  const card = (
                    <div className="overflow-hidden rounded-[28px] border border-[#e4e8de] bg-white p-1.5 shadow-[0_18px_36px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_22px_48px_rgba(15,23,42,0.08)]">
                      <img
                        src={banner.imageUrl}
                        alt={`Banner secundario ${banner.id}`}
                        className="h-44 w-full rounded-[22px] object-cover lg:h-[210px]"
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
          <div className="rounded-2xl border border-[#e4e8de] bg-white px-4 py-3 text-sm text-gray-500 shadow-[0_12px_26px_rgba(15,23,42,0.04)] dark:text-slate-400">
            Resultados para <span className="font-black text-gray-900 dark:text-white">"{searchQuery}"</span>
            <button
              onClick={() => setSearchQuery('')}
              className="ml-3 text-[11px] font-black uppercase tracking-widest text-red-500 hover:underline"
            >
              Limpar
            </button>
          </div>
        )}

        <div className="space-y-10 lg:space-y-12">
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
                  <div id={`categoria-${group.category._id || group.category.id}`} className="scroll-mt-28">
                  <div className="mb-5 lg:mb-6">
                    <span className="mb-3 block h-1.5 w-14 rounded-full bg-emerald-500/80" />
                    <h2 className="text-[25px] font-black uppercase tracking-tight text-gray-950 dark:text-white lg:text-[28px]">
                      {group.category.nome}
                    </h2>
                    <p className={cn('mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-slate-400', !group.category.descricao?.trim() && 'hidden')}>
                      {group.category.descricao || `${group.products.length} item(ns) prontos para pedido nessa seção.`}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 lg:gap-4">
                    {group.products.map((product: any) =>
                      renderProductCard(product, `${group.category._id || group.category.id}-${product._id || product.id}`)
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
                <div id="categoria-outros" className="scroll-mt-28">
                  <div className="mb-5 lg:mb-6">
                    <span className="mb-3 block h-1.5 w-14 rounded-full bg-emerald-500/80" />
                    <h2 className="text-[25px] font-black uppercase tracking-tight text-gray-950 dark:text-white lg:text-[28px]">
                      Outros
                    </h2>
                    <p className="hidden mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-slate-400">
                      Produtos sem categoria principal definida no momento.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 lg:gap-4">
                    {uncategorizedProducts.map((product: any) =>
                      renderProductCard(product, `outros-${product._id || product.id}`)
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

