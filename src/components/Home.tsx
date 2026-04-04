// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Plus, Search, Home as HomeIcon, Store, Receipt, Gift, Star } from 'lucide-react';
import ProductModal, { Product } from './ProductModal';
import { useToast } from './Toast';

interface Category {
  id: string;
  _id?: string;
  nome: string;
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
  setSearchQuery
}: HomeProps) {
  const [isLoading, setIsLoading] = useState(true);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { showToast } = useToast();

  // 1. Busca de Dados
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, prodRes] = await Promise.all([
          fetch('/api/categorias'),
          fetch('/api/produtos')
        ]);

        const catData = await catRes.json();
        const prodData = await prodRes.json();

        setCategories(catData);
        setProducts(prodData);
      } catch (error) {
        console.error("Erro ao buscar dados da API:", error);
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
    showToast(`✅ ${item.nome} adicionado à sacola!`, 'success');
  };

  // 2. Agrupamento de Produtos
  const groupedProducts = categories.map(cat => {
    let catProducts = products.filter(p => (p as any).categoriaId === (cat._id || cat.id));
    if (searchQuery) {
      catProducts = catProducts.filter(p => p.nome.toLowerCase().includes(searchQuery.toLowerCase()) || p.descricao.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return { category: cat, products: catProducts };
  }).filter(group => group.products.length > 0);

  // Produtos sem categoria
  let uncategorizedProducts = products.filter(p => !(p as any).categoriaId);
  if (searchQuery) {
    uncategorizedProducts = uncategorizedProducts.filter(p => p.nome.toLowerCase().includes(searchQuery.toLowerCase()) || p.descricao.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  return (
    <div className="w-full animate-in fade-in duration-500">
      
      <div className="flex flex-col gap-6">
        
        {/* FILTROS E BUSCA (LADO A LADO COMO NO PRINT) */}
        <div className="flex flex-col md:flex-row gap-4 w-full">
          {/* SELECT DE CATEGORIAS */}
          <div className="w-full md:w-64 shrink-0">
            <select 
               value={activeCategory} 
               onChange={(e) => setActiveCategory(e.target.value)}
               className="w-full h-14 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl px-6 text-sm font-bold text-gray-700 dark:text-gray-200 shadow-sm focus:border-emerald-500 outline-none appearance-none cursor-pointer"
               style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 1.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.2rem' }}
            >
               <option value="all">Lista de categorias</option>
               {groupedProducts.map(g => (
                 <option key={g.category._id || g.category.id} value={g.category._id || g.category.id}>
                    {g.category.nome}
                 </option>
               ))}
            </select>
          </div>

          {/* BARRA DE BUSCA */}
          <div className="flex-1 relative group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 transition-colors group-focus-within:text-emerald-600" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Busque por um produto"
              className="w-full h-14 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-gray-900 dark:text-white pl-16 pr-6 rounded-2xl shadow-sm focus:outline-none focus:border-emerald-500 font-bold placeholder-gray-400 transition-all font-sans"
            />
          </div>
        </div>
        
        {/* Espaçador Mobile Scrolled */}
        {isScrolled && (
          <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 shadow-xl z-[60] flex items-center px-4 gap-2 animate-in fade-in slide-in-from-top-4 border-b border-gray-100 dark:border-slate-800">
             <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-gray-100 dark:border-slate-700">
                {storeInfo?.logo_url ? <img src={storeInfo.logo_url} alt="Logo" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-emerald-600 flex items-center justify-center"><Store className="w-5 h-5 text-white" /></div>}
             </div>
             
             <div className="flex-1 min-w-0">
                <select 
                   value={activeCategory} 
                   onChange={(e) => setActiveCategory(e.target.value)}
                   className="w-full h-10 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl px-3 text-[10px] font-black text-gray-700 dark:text-gray-200 outline-none appearance-none"
                   style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '0.8rem' }}
                >
                   <option value="all">Categorias</option>
                   {groupedProducts.map(g => (
                     <option key={g.category._id || g.category.id} value={g.category._id || g.category.id}>
                        {g.category.nome}
                     </option>
                   ))}
                </select>
             </div>

             <div className="flex items-center gap-2">
                <button onClick={() => { setSearchQuery(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200 dark:shadow-none">
                  <Search className="w-4 h-4" />
                </button>
                <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="w-10 h-10 bg-gray-100 dark:bg-slate-800 text-gray-400 rounded-xl flex items-center justify-center">
                  <HomeIcon className="w-4 h-4" />
                </button>
             </div>
          </div>
        )}

        {searchQuery && (
          <div className="mb-2 text-sm text-gray-500 dark:text-slate-400 italic">
            Resultados para: <span className="font-black text-gray-900 dark:text-white uppercase">"{searchQuery}"</span> 
            <button onClick={() => setSearchQuery('')} className="text-red-500 text-[10px] font-black uppercase ml-3 hover:underline tracking-widest">Limpar busca</button>
          </div>
        )}

        {/* 5. SEÇÃO DE DESTAQUES */}
        {!isLoading && !searchQuery && products.some(p => (p as any).destaque) && (
          <div className="mb-10">
             <div className="mb-6">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight italic uppercase">Sugestões do Chef</h2>
                <div className="h-1 bg-emerald-500 w-12 rounded-full mt-1"></div>
             </div>
             
             <div className="flex overflow-x-auto gap-5 pb-4 scrollbar-hide">
               {products.filter(p => (p as any).destaque).map((product: any) => (
                 <div 
                   key={`destaque-${product._id || product.id}`}
                   onClick={() => !product.esgotado && handleProductClick(product)}
                   className="flex-none w-[280px] bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden cursor-pointer hover:shadow-md transition-all group shrink-0"
                 >
                   <div className="aspect-video overflow-hidden relative">
                     {product.imagem ? (
                       <img src={product.imagem} alt={product.nome} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                     ) : (
                       <div className="w-full h-full bg-gray-100 flex items-center justify-center"><Store className="w-10 h-10 text-gray-300" /></div>
                     )}
                     {product.pode_resgatar && (
                        <div className="absolute top-3 right-3 bg-purple-600 text-white p-2 rounded-full shadow-lg border border-white/20">
                          <Gift className="w-4 h-4 fill-current" />
                        </div>
                     )}
                   </div>
                   <div className="p-4">
                     <h3 className="font-black text-gray-900 dark:text-white uppercase italic text-sm mb-1">{product.nome}</h3>
                     <p className="text-[10px] text-gray-500 line-clamp-1 mb-3">{product.descricao}</p>
                     <p className="text-lg font-black text-emerald-600 italic">R$ {(product.preco || 0).toFixed(2).replace('.', ',')}</p>
                   </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {/* 6. GRID DE PRODUTOS */}
        <div className="space-y-10">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => <div key={`skel-${i}`} className="h-32 bg-gray-100 dark:bg-slate-800 animate-pulse rounded-2xl"></div>)}
             </div>
          ) : (
            <>
              {groupedProducts.map(group => (
                 <div key={group.category._id || group.category.id} id={`categoria-${group.category._id || group.category.id}`} className="scroll-mt-28">
                   <div className="flex items-center gap-4 mb-5">
                      <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tighter italic">{group.category.nome}</h2>
                      <div className="flex-1 h-[1px] bg-gray-100 dark:border-slate-700"></div>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {group.products.map((product: any) => (
                        <div
                          key={product._id || product.id}
                          onClick={() => !product.esgotado && handleProductClick(product)}
                          className={`bg-white dark:bg-slate-800 rounded-3xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm flex gap-4 transition-all relative ${product.esgotado ? 'opacity-60 grayscale' : 'hover:shadow-md cursor-pointer'}`}
                        >
                          <div className="flex-1 flex flex-col min-w-0">
                            <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase italic mb-1 truncate">{product.nome}</h3>
                            <p className="text-[10px] text-gray-500 dark:text-slate-400 line-clamp-2 mb-2 font-medium italic">{product.descricao}</p>
                            <div className="mt-auto">
                               <span className="text-base font-black text-emerald-600 italic">R$ {(product.preco || 0).toFixed(2).replace('.', ',')}</span>
                            </div>
                          </div>

                          <div className="w-24 h-24 shrink-0 bg-gray-50 dark:bg-slate-700/50 rounded-2xl relative flex items-center justify-center overflow-hidden">
                            {product.imagem ? (
                               <img src={product.imagem} alt={product.nome} className="w-full h-full object-cover" />
                            ) : (
                               <Store className="w-6 h-6 text-gray-300" />
                            )}
                            
                            {product.pode_resgatar && (
                              <div className="absolute top-2 right-2 bg-purple-600 text-white p-1 rounded-full shadow-lg border border-white">
                                 <Gift className="w-2.5 h-2.5 fill-current" />
                              </div>
                            )}
                          </div>
                        </div>
                     ))}
                   </div>
                 </div>
              ))}

              {uncategorizedProducts.length > 0 && (
                 <div id="categoria-outros" className="scroll-mt-28">
                   <div className="flex items-center gap-4 mb-5">
                      <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tighter italic">Outros</h2>
                      <div className="flex-1 h-[1px] bg-gray-100 dark:border-slate-700"></div>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {uncategorizedProducts.map((product: any) => (
                        <div key={product._id || product.id} onClick={() => !product.esgotado && handleProductClick(product)} className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm flex gap-4 transition-all lg:hover:shadow-md cursor-pointer">
                           <div className="flex-1 flex flex-col min-w-0">
                              <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase italic mb-1 truncate">{product.nome}</h3>
                              <p className="text-[10px] text-gray-500 dark:text-slate-400 line-clamp-2 mb-2 font-medium italic">{product.descricao}</p>
                              <div className="mt-auto">
                                 <span className="text-base font-black text-emerald-600 italic">R$ {(product.preco || 0).toFixed(2).replace('.', ',')}</span>
                              </div>
                           </div>
                           <div className="w-24 h-24 shrink-0 bg-gray-50 dark:bg-slate-700/50 rounded-2xl relative flex items-center justify-center overflow-hidden">
                              {product.imagem ? <img src={product.imagem} alt={product.nome} className="w-full h-full object-cover" /> : <Store className="w-6 h-6 text-gray-300" />}
                           </div>
                        </div>
                     ))}
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
    </div>
  );
}