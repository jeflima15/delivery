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
  setSearchQuery,
}: HomeProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [homeBlocks, setHomeBlocks] = useState<any[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { showToast } = useToast();

  // 1. Busca de Dados
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, prodRes, blocksRes] = await Promise.all([
          fetch('/api/categorias'),
          fetch('/api/produtos'),
          fetch('/api/blocos_home')
        ]);

        const catData = await catRes.json();
        const prodData = await prodRes.json();
        const blocksData = await blocksRes.json();

        setCategories(catData);
        setProducts(prodData);
        if (blocksData.sucesso) setHomeBlocks(blocksData.blocos);
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
        {/* FILTROS E BUSCA */}
        <div className="w-full">
          {/* Layout Mobile (Baseado no exemplo) */}
          <div className="flex lg:hidden gap-3 w-full items-center">
             <div className="flex-1">
                <select 
                   value={activeCategory} 
                   onChange={(e) => setActiveCategory(e.target.value)}
                   className="w-full h-14 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl px-5 text-sm font-black text-gray-500 dark:text-gray-400 shadow-sm outline-none appearance-none cursor-pointer"
                   style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 1.25rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
                >
                   <option value="all">Categorias</option>
                   {groupedProducts.map(g => <option key={g.category._id || g.category.id} value={g.category._id || g.category.id}>{g.category.nome}</option>)}
                </select>
             </div>
             <button className="w-14 h-14 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl flex items-center justify-center shadow-sm text-gray-400">
               <Search className="w-5 h-5" />
             </button>
          </div>

          {/* Layout Desktop (Original) */}
          <div className="hidden lg:flex gap-4 w-full">
             <div className="w-64 shrink-0">
                <select 
                   value={activeCategory} 
                   onChange={(e) => setActiveCategory(e.target.value)}
                   className="w-full h-14 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl px-5 text-sm font-bold text-gray-700 dark:text-gray-200 shadow-sm focus:border-emerald-500 outline-none appearance-none cursor-pointer"
                   style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 1.25rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
                >
                   <option value="all">Todas as categorias</option>
                   {groupedProducts.map(g => <option key={g.category._id || g.category.id} value={g.category._id || g.category.id}>{g.category.nome}</option>)}
                </select>
             </div>
             <div className="flex-1 relative group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-emerald-500 transition-colors" />
                <input
                   type="text"
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   placeholder="Busque por um produto"
                   className="w-full h-14 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 pl-14 pr-6 rounded-xl shadow-sm focus:outline-none focus:border-emerald-500 text-sm font-bold placeholder-gray-400"
                />
             </div>
          </div>
        </div>

        
        {searchQuery && (
          <div className="mb-2 text-sm text-gray-500 dark:text-slate-400 italic">
            Resultados para: <span className="font-black text-gray-900 dark:text-white uppercase">"{searchQuery}"</span> 
            <button onClick={() => setSearchQuery('')} className="text-red-500 text-[10px] font-black uppercase ml-3 hover:underline tracking-widest">Limpar busca</button>
          </div>
        )}

        {/* 5. SEÇÃO DE BLOCOS DA HOME (DINÂMICO) */}
        {!isLoading && !searchQuery && homeBlocks.length > 0 && (
           <div className="flex flex-col gap-6 mb-8">
              {homeBlocks.map(bloco => {
                 if (bloco.tipo_bloco === 'banner_principal') {
                    return (
                       <a key={bloco._id} href={bloco.link_destino || '#'} target={bloco.abrir_nova_aba ? '_blank' : '_self'} rel="noreferrer" className="block w-full overflow-hidden rounded-3xl shadow-sm hover:shadow-md transition-shadow relative group">
                          {bloco.imagem_desktop ? (
                             <img src={bloco.imagem_desktop} alt={bloco.titulo} className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-700" />
                          ) : (
                             <div className="w-full h-48 md:h-64 bg-gray-200 flex items-center justify-center font-bold text-gray-400">Banner Principal</div>
                          )}
                       </a>
                    );
                 }
                 
                 if (bloco.tipo_bloco === 'card_promocional') {
                    return (
                       <a key={bloco._id} href={bloco.link_destino || '#'} target={bloco.abrir_nova_aba ? '_blank' : '_self'} rel="noreferrer" className="block w-full overflow-hidden rounded-3xl shadow-sm hover:shadow-md transition-shadow">
                          {bloco.imagem_desktop ? (
                             <img src={bloco.imagem_desktop} alt={bloco.titulo} className="w-full h-auto object-cover" />
                          ) : (
                             <div className="w-full p-6" style={{ backgroundColor: bloco.cor_fundo || '#10b981' }}>
                                <h3 className="text-xl font-black text-white uppercase">{bloco.titulo}</h3>
                                {bloco.descricao && <p className="text-white/80 mt-1 font-medium">{bloco.descricao}</p>}
                             </div>
                          )}
                       </a>
                    );
                 }

                 if (bloco.tipo_bloco === 'fidelidade') {
                    return (
                       <a key={bloco._id} href={bloco.link_destino || '#'} target={bloco.abrir_nova_aba ? '_blank' : '_self'} rel="noreferrer" className="block w-full">
                          <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm flex items-start gap-4">
                             <div className="w-12 h-12 rounded-xl bg-amber-600/10 flex items-center justify-center shrink-0">
                                <Gift className="w-6 h-6 text-amber-600" />
                             </div>
                             <div className="flex-1 min-w-0">
                                <h4 className="text-base font-black text-gray-900 dark:text-white tracking-tight">{bloco.titulo || 'Programa de fidelidade'}</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
                                   {bloco.descricao || 'Faça login para ver seus pontos e resgatar prêmios.'}
                                </p>
                             </div>
                          </div>
                       </a>
                    );
                 }

                 if (bloco.tipo_bloco === 'card_institucional') {
                    return (
                       <a key={bloco._id} href={bloco.link_destino || '#'} target={bloco.abrir_nova_aba ? '_blank' : '_self'} rel="noreferrer" className="block w-full">
                          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-gray-100 dark:border-slate-700 shadow-sm text-center">
                             <h4 className="text-lg font-black text-gray-900 dark:text-white uppercase mb-2">{bloco.titulo}</h4>
                             <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                                {bloco.descricao}
                             </p>
                             {bloco.texto_botao && (
                                <span className="inline-block mt-4 text-emerald-600 font-bold uppercase text-xs tracking-widest">{bloco.texto_botao}</span>
                             )}
                          </div>
                       </a>
                    );
                 }

                 return null;
              })}
           </div>
        )}

        {/* 6. GRID DE PRODUTOS */}
        <div className="space-y-12">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => <div key={`skel-${i}`} className="h-32 bg-gray-100 dark:bg-slate-800 animate-pulse rounded-2xl"></div>)}
             </div>
          ) : (
            <>
              {groupedProducts.map(group => (
                 <div key={group.category._id || group.category.id} id={`categoria-${group.category._id || group.category.id}`} className="scroll-mt-28">
                   <div className="mb-6">
                      <h2 className="text-lg font-black text-gray-950 dark:text-white uppercase tracking-tighter">{group.category.nome}</h2>
                      {group.category.descricao && <p className="text-[11px] text-gray-400 font-medium -mt-1">{group.category.descricao}</p>}
                   </div>
                   
                   <div className="flex flex-col gap-3">
                     {group.products.map((product: any) => (
                        <div
                          key={product._id || product.id}
                          onClick={() => !product.esgotado && handleProductClick(product)}
                          className={`bg-white dark:bg-slate-800 rounded-3xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm flex gap-4 transition-all relative overflow-hidden ${product.esgotado ? 'opacity-60 grayscale' : 'hover:shadow-md cursor-pointer'}`}
                        >
                          <div className="flex-1 flex flex-col min-w-0 pr-2">
                             <div className="flex flex-col">
                                <h3 className="text-[14px] font-black text-gray-950 dark:text-slate-100 mb-1 leading-tight">{product.nome}</h3>
                                <p className="text-[11px] text-gray-500 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed font-medium">{product.descricao}</p>
                             </div>
                             <div className="mt-auto flex items-center justify-between">
                                <span className="text-[15px] font-black text-gray-950 dark:text-white">R$ {(product.preco || 0).toFixed(2).replace('.', ',')}</span>
                             </div>
                          </div>

                          <div className="w-24 h-24 shrink-0 bg-gray-50 dark:bg-slate-700/50 rounded-2xl relative flex items-center justify-center overflow-hidden">
                            {product.imagem ? (
                               <img src={product.imagem} alt={product.nome} className="w-full h-full object-cover" />
                            ) : (
                               <Store className="w-6 h-6 text-gray-300" />
                            )}
                            
                            {product.pode_resgatar && (
                              <div className="absolute top-2 right-2 bg-amber-600 text-white p-1.5 rounded-lg shadow-sm border border-white">
                                 <Gift className="w-3.5 h-3.5" />
                              </div>
                            )}

                            {product.esgotado && <div className="esgotado-badge">Esgotado</div>}
                          </div>
                        </div>
                     ))}
                   </div>
                 </div>
              ))}

              {uncategorizedProducts.length > 0 && (
                 <div id="categoria-outros" className="scroll-mt-28">
                   <div className="mb-6">
                      <h2 className="text-lg font-black text-gray-950 dark:text-white uppercase tracking-tighter">Outros</h2>
                   </div>
                   <div className="flex flex-col gap-3">
                     {uncategorizedProducts.map((product: any) => (
                        <div key={product._id || product.id} onClick={() => !product.esgotado && handleProductClick(product)} className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm flex gap-4 transition-all relative overflow-hidden cursor-pointer hover:shadow-md">
                           <div className="flex-1 flex flex-col min-w-0 pr-2">
                              <h3 className="text-[14px] font-black text-gray-950 dark:text-slate-100 mb-1 leading-tight">{product.nome}</h3>
                              <p className="text-[11px] text-gray-500 dark:text-slate-400 line-clamp-2 mb-3 font-medium leading-relaxed">{product.descricao}</p>
                              <div className="mt-auto">
                                 <span className="text-[15px] font-black text-gray-950 dark:text-white">R$ {(product.preco || 0).toFixed(2).replace('.', ',')}</span>
                              </div>
                           </div>
                           <div className="w-24 h-24 shrink-0 bg-gray-50 dark:bg-slate-700/50 rounded-2xl relative flex items-center justify-center overflow-hidden">
                              {product.imagem ? <img src={product.imagem} alt={product.nome} className="w-full h-full object-cover" /> : <Store className="w-6 h-6 text-gray-300" />}
                              {product.esgotado && <div className="esgotado-badge">Esgotado</div>}
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