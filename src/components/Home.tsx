// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { Gift, Search, Sparkles, Store } from 'lucide-react';
import ProductModal, { Product } from './ProductModal';
import { useToast } from './Toast';
import PromoCard from './vitrine/PromoCard';
import DynamicModal from './vitrine/DynamicModal';

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
    showToast(`${item.nome} adicionado a sacola!`, 'success');
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const groupedProducts = categories
    .map((cat: Category) => {
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

  const belowHeroBlocks = homeBlocks.filter((bloco) => bloco.posicao_exibicao === 'below_hero');
  const beforeProductsBlocks = homeBlocks.filter(
    (bloco) => !bloco.posicao_exibicao || bloco.posicao_exibicao === 'before_products'
  );
  const middleHomeBlocks = homeBlocks.filter((bloco) => bloco.posicao_exibicao === 'middle_home');
  const afterProductsBlocks = homeBlocks.filter((bloco) => bloco.posicao_exibicao === 'after_products');

  const totalVisibleProducts =
    groupedProducts.reduce((acc, group) => acc + group.products.length, 0) +
    uncategorizedProducts.length;

  const handleBlockClick = (bloco: any) => {
    if (bloco.acao_clique === 'modal') setActivePromoBlock(bloco);
  };

  const renderBlocksSection = (items: any[], title: string, subtitle: string) => {
    if (isLoading || normalizedQuery || items.length === 0) return null;

    return (
      <section className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-400">
              vitrine
            </p>
            <h2 className="text-2xl font-black tracking-tight text-gray-950 dark:text-white">{title}</h2>
          </div>
          <p className="max-w-2xl text-sm text-gray-500 dark:text-slate-400">{subtitle}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((bloco) => (
            <PromoCard key={bloco._id || `${title}-${bloco.titulo}`} bloco={bloco} onClick={handleBlockClick} />
          ))}
        </div>
      </section>
    );
  };

  const renderProductCard = (product: any, key: string) => (
    <article
      key={key}
      onClick={() => !product.esgotado && handleProductClick(product)}
      className={`group flex min-h-[180px] gap-4 rounded-[28px] border border-gray-200/70 bg-white p-4 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.45)] transition-all dark:border-slate-700 dark:bg-slate-900 ${
        product.esgotado
          ? 'cursor-not-allowed opacity-60 grayscale'
          : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-36px_rgba(15,23,42,0.42)]'
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-black tracking-tight text-gray-950 dark:text-white">{product.nome}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-500 dark:text-slate-400">
              {product.descricao || 'Toque para ver detalhes, adicionais e formas de compra.'}
            </p>
          </div>

          {product.pode_resgatar && (
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-sm">
              <Gift className="h-5 w-5" />
            </span>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-4 pt-6">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-gray-400 dark:text-slate-500">
              {product.esgotado ? 'indisponivel' : 'cardapio'}
            </p>
            <p className="text-2xl font-black tracking-tight text-gray-950 dark:text-white">
              R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
            </p>
          </div>

          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[24px] border border-gray-100 bg-gray-50 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            {product.imagem ? (
              <img
                src={product.imagem}
                alt={product.nome}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Store className="h-8 w-8 text-gray-300 dark:text-slate-600" />
              </div>
            )}

            {product.esgotado && <div className="esgotado-badge">Esgotado</div>}
          </div>
        </div>
      </div>
    </article>
  );

  return (
    <div className="w-full animate-in fade-in duration-500">
      <div className="flex flex-col gap-8 lg:gap-10">
        <section className="space-y-4">
          <div className="flex gap-3 lg:hidden">
            <div className="flex-1">
              <select
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                className="h-14 w-full cursor-pointer appearance-none rounded-2xl border border-gray-200 bg-white px-5 text-sm font-black text-gray-700 shadow-sm outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
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

            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar"
                className="h-14 w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-4 text-sm font-semibold text-gray-700 shadow-sm outline-none placeholder:text-gray-400 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="rounded-[30px] border border-gray-200/70 bg-white/95 p-5 shadow-[0_18px_55px_-40px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              <div className="flex items-center gap-4">
                <div className="w-72 shrink-0">
                  <select
                    value={activeCategory}
                    onChange={(e) => setActiveCategory(e.target.value)}
                    className="h-16 w-full cursor-pointer appearance-none rounded-2xl border border-gray-200 bg-white px-5 text-sm font-black text-gray-700 shadow-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    style={{
                      backgroundImage:
                        'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
                      backgroundPosition: 'right 1.25rem center',
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
                  <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Busque por um produto"
                    className="h-16 w-full rounded-2xl border border-gray-200 bg-white pl-14 pr-6 text-sm font-semibold text-gray-700 shadow-sm outline-none placeholder:text-gray-400 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  />
                </div>

                <div className="hidden xl:flex min-w-[240px] items-center gap-3 rounded-[24px] border border-emerald-100 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-emerald-950 dark:text-emerald-200">
                      {totalVisibleProducts} itens visiveis
                    </p>
                    <p className="text-xs font-medium text-emerald-700/80 dark:text-emerald-300/80">
                      {normalizedQuery ? 'Resultados filtrados na vitrine' : 'Cardapio organizado por categorias'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {normalizedQuery && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              Resultados para <span className="font-black uppercase">"{searchQuery}"</span>
              <button
                onClick={() => setSearchQuery('')}
                className="ml-3 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 hover:underline dark:text-emerald-300"
              >
                limpar
              </button>
            </div>
          )}
        </section>

        {renderBlocksSection(
          belowHeroBlocks,
          'Destaques da loja',
          'Blocos institucionais e campanhas que ajudam a abrir a pagina com mais contexto comercial.'
        )}

        {renderBlocksSection(
          beforeProductsBlocks,
          'Promocoes e campanhas',
          'Area pensada para banners, beneficios e comunicados configurados pelo painel administrativo.'
        )}

        <section className="space-y-14">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={`skel-${i}`}
                  className="h-44 rounded-[28px] bg-gray-100 animate-pulse dark:bg-slate-800"
                />
              ))}
            </div>
          ) : totalVisibleProducts === 0 ? (
            <div className="rounded-[28px] border border-dashed border-gray-300 bg-white px-6 py-14 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                Nenhum produto encontrado
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
                Ajuste a busca ou escolha outra categoria para continuar explorando o cardapio.
              </p>
            </div>
          ) : (
            <>
              {groupedProducts.map((group, index) => (
                <React.Fragment key={group.category._id || group.category.id}>
                  <section
                    id={`categoria-${group.category._id || group.category.id}`}
                    className="scroll-mt-32 space-y-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-400">
                          categoria
                        </p>
                        <h2 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white">
                          {group.category.nome}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                          {group.category.descricao ||
                            `${group.products.length} item(ns) prontos para pedido nessa secao.`}
                        </p>
                      </div>
                      <span className="inline-flex w-fit rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                        {group.products.length} itens
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {group.products.map((product: any) =>
                        renderProductCard(product, `${group.category._id || group.category.id}-${product._id || product.id}`)
                      )}
                    </div>
                  </section>

                  {index === 0 &&
                    renderBlocksSection(
                      middleHomeBlocks,
                      'Mais da experiencia',
                      'Espaco para reforcar diferenciais, campanhas ou informacoes extras entre as secoes do cardapio.'
                    )}
                </React.Fragment>
              ))}

              {uncategorizedProducts.length > 0 && (
                <section id="categoria-outros" className="scroll-mt-32 space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-400">
                        categoria
                      </p>
                      <h2 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white">Outros</h2>
                      <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                        Produtos sem categoria definida, ainda visiveis para facilitar a operacao da loja.
                      </p>
                    </div>
                    <span className="inline-flex w-fit rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                      {uncategorizedProducts.length} itens
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {uncategorizedProducts.map((product: any) =>
                      renderProductCard(product, `outros-${product._id || product.id}`)
                    )}
                  </div>
                </section>
              )}

              {renderBlocksSection(
                afterProductsBlocks,
                'Comunicados finais',
                'Area reservada para reforcar beneficios, novidades ou campanhas que fecham a home com mais contexto.'
              )}
            </>
          )}
        </section>
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
