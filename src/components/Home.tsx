// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Search, Store, Gift } from 'lucide-react';
import ProductModal, { Product } from './ProductModal';
import { useToast } from './Toast';
import PromoCard from './vitrine/PromoCard';
import DynamicModal from './vitrine/DynamicModal';
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

  const getBadgeStyle = (label: string) => {
    const t = label.trim().toLowerCase();
    if (t === 'mais pedido' || t === 'mais pedidos' || t === 'popular') {
      return 'bg-[#fef3c7] text-[#d97706]';
    }
    if (t === 'recomendado' || t === 'sugestão' || t === 'chef') {
      return 'bg-[#e0f2fe] text-[#0284c7]';
    }
    if (t === 'edição limitada' || t === 'novo' || t === 'lançamento') {
      return 'bg-[#fce7f3] text-[#db2777]';
    }
    if (t === 'promoção' || t === 'oferta') {
      return 'bg-[#d1fae5] text-[#059669]';
    }
    return 'bg-gray-100 text-gray-600';
  };

  const renderProductCard = (product: any, key: string) => {
    const temDesconto = product.preco_antigo > product.preco;

    return (
      <div
        key={key}
        onClick={() => !product.esgotado && handleProductClick(product)}
        className={`bg-white dark:bg-slate-800 rounded-[1.25rem] p-4 sm:p-5 border border-gray-100 dark:border-slate-700 shadow-sm flex min-h-[160px] gap-4 sm:gap-5 transition-all duration-300 relative overflow-hidden ${
          product.esgotado ? 'opacity-60 grayscale cursor-not-allowed group' : 'cursor-pointer hover:shadow-md hover:border-emerald-100 hover:-translate-y-0.5 group'
        }`}
      >
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex flex-col">
            {product.destaque && product.selo_destaque && (
              <div className="mb-2">
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-[10px] font-bold uppercase tracking-wide leading-none',
                  getBadgeStyle(product.selo_destaque)
                )}>
                  {product.selo_destaque}
                </span>
              </div>
            )}
            <h3 className="text-base sm:text-[17px] font-bold text-gray-900 dark:text-white mb-1.5 leading-tight transition-colors">
              {product.nome}
            </h3>
            <p className="text-xs sm:text-[13px] text-gray-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4 font-medium">
              {product.descricao}
            </p>
          </div>

          <div className="mt-auto">
            <div className="flex items-center gap-2">
              <span className={`text-[14px] font-black ${temDesconto ? 'text-[#22c55e]' : 'text-gray-600 dark:text-gray-300'}`}>
                R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
              </span>
              {temDesconto && (
                <span className="text-[12px] font-bold text-gray-400 line-through">
                  R$ {product.preco_antigo.toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="w-28 h-28 sm:w-[136px] sm:h-[136px] shrink-0 bg-gray-50 dark:bg-slate-700/50 rounded-2xl relative flex items-center justify-center overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
          {product.imagem ? (
            <img src={product.imagem} alt={product.nome} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
          ) : (
            <Store className="w-8 h-8 text-gray-300" />
          )}

          {product.pode_resgatar && (
            <div className="absolute top-2 right-2 bg-gradient-to-br from-purple-500 to-indigo-600 text-white p-1.5 rounded-full shadow-md shadow-purple-500/20">
              <Gift className="w-4 h-4" />
            </div>
          )}

          {product.esgotado && (
            <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] flex items-center justify-center">
              <span className="bg-black text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg">Esgotado</span>
            </div>
          )}
        </div>
      </div>
    );
  };

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

          <div className="hidden lg:flex gap-5 w-full items-center">
            <div className="w-[280px] shrink-0">
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

            <div className="flex-1 relative max-w-xl">
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

        {activeSecondaryBanners.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {activeSecondaryBanners.map((banner) => {
              const card = (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <img
                    src={banner.imageUrl}
                    alt={`Banner secundario ${banner.id}`}
                    className="h-44 w-full object-cover md:h-48"
                  />
                </div>
              );

              if (banner.link) {
                return (
                  <a
                    key={banner.id}
                    href={banner.link}
                    className="block"
                    target={banner.link.startsWith('http') ? '_blank' : undefined}
                    rel={banner.link.startsWith('http') ? 'noreferrer' : undefined}
                  >
                    {card}
                  </a>
                );
              }

              return <div key={banner.id}>{card}</div>;
            })}
          </div>
        )}

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

        {!normalizedQuery && homeBlocks && homeBlocks.length > 0 && (
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
          {groupedProducts.length === 0 && uncategorizedProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-sm">
              <p className="text-lg font-black text-gray-900">Nenhum produto encontrado</p>
              <p className="mt-2 text-sm text-gray-500">
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

