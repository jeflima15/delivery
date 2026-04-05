// @ts-nocheck
import React, { useState, useEffect } from 'react';
import Home from './components/Home';
import Login from './components/Login';
import Register from './components/Register';
import CartDrawer from './components/CartDrawer';
import Orders from './components/Orders';
import Profile from './components/Profile';
import AdminDashboard from './components/AdminDashboard';
import StoreInfoModal from './components/StoreInfoModal';
import OrderTracking from './components/OrderTracking';
import ProductModal from './components/ProductModal';
import { cn } from './lib/utils';
import { Search, ShoppingBag, Home as HomeIcon, Receipt, User, Store, Moon, Sun, Star, Gift, Truck, MapPin, Phone, CreditCard, QrCode, Banknote, ShoppingCart } from 'lucide-react';
import { ToastProvider } from './components/Toast';

export default function App() {
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('stitch_cart');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch { return []; }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isStoreInfoOpen, setIsStoreInfoOpen] = useState(false);
  const [currentView, setCurrentView] = useState('home');
  const [user, setUser] = useState(null);
  const [trackingOrderId, setTrackingOrderId] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [storeInfo, setStoreInfo] = useState({
    nome_loja: '',
    logo_url: '',
    capa_url: '',
    is_open: true,
    tempo_entrega: '',
    whatsapp: '',
  });
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [banner, setBanner] = useState({ ativo: false, texto: '' });
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isAdminRoute = window.location.pathname.startsWith('/admin');

  const [activeCategory, setActiveCategory] = useState('all');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [editingItemInfo, setEditingItemInfo] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 400);

      // ScrollSpy Logic
      const categoriesSections = document.querySelectorAll('[id^="categoria-"]');
      let current = 'all';
      
      categoriesSections.forEach((section) => {
        const sectionTop = section.offsetTop;
        if (window.scrollY >= sectionTop - 150) {
          current = section.id.replace('categoria-', '');
        }
      });
      
      setActiveCategory(current);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (darkMode) {
       document.documentElement.classList.add('dark');
       localStorage.setItem('theme', 'dark');
    } else {
       document.documentElement.classList.remove('dark');
       localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const fetchPublicConfig = async () => {
      try {
        const res = await fetch('/api/configuracoes/publica');
        const data = await res.json();
        if (data.sucesso && data.nome_loja) {
          setStoreInfo({
            ...data,
            is_open: data.is_open !== false,
            tempo_entrega: data.tempo_entrega || '45-60 min',
          });
          document.title = data.nome_loja;
          if (data.banner_ativo) setBanner({ ativo: true, texto: data.banner_texto });
        }
      } catch (error) {
        console.error("Erro ao buscar config pública", error);
      } finally {
        setIsConfigLoaded(true);
      }
    };
    fetchPublicConfig();
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('stitch_token');
      if (token) {
        try {
          const res = await fetch('/api/auth/perfil', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.sucesso) setUser(data.user);
        } catch (e) { localStorage.removeItem('stitch_token'); }
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    localStorage.setItem('stitch_cart', JSON.stringify(cart));
  }, [cart]);

  const handleAddToCart = (item) => {
    setCart(prev => {
      const exists = prev.findIndex(i => i.produtoId === item.produtoId && JSON.stringify(i.opcoes_escolhidas) === JSON.stringify(item.opcoes_escolhidas));
      if (exists >= 0) {
        const newCart = [...prev];
        newCart[exists].quantidade += item.quantidade;
        newCart[exists].subtotal += item.subtotal;
        return newCart;
      }
      return [...prev, item];
    });
  };

  const handleUpdateQuantity = (index, delta) => {
    setCart(prev => {
      const newCart = [...prev];
      newCart[index].quantidade += delta;
      if (newCart[index].quantidade <= 0) newCart.splice(index, 1);
      else newCart[index].subtotal = newCart[index].preco_unitario * newCart[index].quantidade;
      return newCart;
    });
  };

  const handleToggleRedemption = (index) => {
    setCart(prev => {
      const newCart = [...prev];
      newCart[index].is_resgate = !newCart[index].is_resgate;
      return newCart;
    });
  };

  const handleClearCart = () => {
    setCart([]);
    localStorage.removeItem('stitch_cart');
  };

  const handleReorder = (items) => {
    setCart(items.map(item => ({
      produtoId: item.produtoId,
      nome: item.nome,
      preco_unitario: item.preco_unitario,
      quantidade: item.quantidade,
      subtotal: item.subtotal,
      opcoes_escolhidas: item.opcoes_escolhidas || []
    })));
    setCurrentView('home');
    setIsCartOpen(true);
  };

  const handleEditItem = (index) => {
    const item = cart[index];
    const product = products.find(p => (p._id || p.id) === item.produtoId);
    if (product) {
      setEditingItemInfo({ product, item, index });
    }
  };

  const handleUpdateItem = (newItem) => {
    setCart(prev => {
      const newCart = [...prev];
      if (editingItemInfo) {
        newCart[editingItemInfo.index] = { ...newItem, produtoId: editingItemInfo.product._id || editingItemInfo.product.id };
      }
      return newCart;
    });
    setEditingItemInfo(null);
  };

  const scrollToCategory = (val) => {
    setActiveCategory(val);
    if (val !== 'all') {
      const el = document.getElementById(`categoria-${val}`);
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (isAdminRoute) return <ToastProvider><AdminDashboard /></ToastProvider>;

  if (!isConfigLoaded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f8f9fa', gap: '20px' }}>
        <div style={{ width: '52px', height: '52px', border: '5px solid #e5e7eb', borderTopColor: '#059669', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: '#9ca3af', fontSize: '14px', fontWeight: '600', letterSpacing: '0.05em', margin: 0 }}>Carregando cardápio...</p>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-white dark:bg-slate-950 font-sans pb-24 lg:pb-0 transition-colors duration-300">
        
        <nav className="hidden lg:flex w-full bg-white dark:bg-slate-900 h-20 items-center border-b border-gray-100 dark:border-slate-800 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto w-full px-6 flex items-center justify-between">
             <div className="flex items-center gap-10">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('home')}>
                   <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-200 dark:shadow-none">
                      <Store className="w-5 h-5" />
                   </div>
                   <span className="font-black text-lg tracking-tighter text-gray-950 dark:text-white uppercase">{storeInfo.nome_loja}</span>
                </div>

                <div className="flex items-center gap-1">
                   <button onClick={() => setCurrentView('home')} className={cn(
                     "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                     currentView === 'home' ? 'bg-gray-100 dark:bg-slate-800 text-emerald-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                   )}>Início</button>
                   <button onClick={() => setCurrentView('home')} className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all">Promoções</button>
                   <button onClick={() => setCurrentView('orders')} className={cn(
                     "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                     currentView === 'orders' ? 'bg-gray-100 dark:bg-slate-800 text-emerald-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                   )}>Pedidos</button>
                </div>
             </div>

             <div className="flex items-center gap-4">
                <div className="relative w-64 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 group-focus-within:text-emerald-600 transition-colors" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="O que você procura?"
                    className="w-full h-11 bg-gray-50 dark:bg-slate-800 border-none rounded-xl pl-10 pr-4 text-xs font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                  />
                </div>

                <div className="h-6 w-[1px] bg-gray-100 dark:bg-slate-800 mx-2"></div>

                <button onClick={() => setDarkMode(!darkMode)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-500 hover:text-emerald-600 transition-all">
                   {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>

                <button onClick={() => setCurrentView('profile')} className={cn(
                  "flex items-center gap-3 px-4 py-2 rounded-xl border border-gray-100 dark:border-slate-800 transition-all",
                  (currentView === 'profile' || currentView === 'register') ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                )}>
                   <User className="w-4 h-4" />
                   <span className="text-xs font-black uppercase tracking-widest">{user ? user.nome.split(' ')[0] : 'Minha Conta'}</span>
                </button>
             </div>
          </div>
        </nav>

        {/* Floating Scroll Header for categories on Desktop */}
        <div className={`hidden lg:flex fixed top-0 left-0 right-0 h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-50 shadow-sm border-b border-gray-100 dark:border-slate-800 transition-all duration-300 transform ${isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
           <div className="max-w-7xl mx-auto w-full px-6 flex items-center gap-8">
              <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-emerald-200">
                 <Store className="w-5 h-5" />
              </div>

              <div className="flex-1 overflow-x-auto hide-scrollbar flex items-center gap-1">
                 <button 
                   onClick={() => scrollToCategory('all')}
                   className={cn(
                     "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all",
                     activeCategory === 'all' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-800'
                   )}
                 >Todos</button>
                 {categories.map(c => (
                   <button 
                     key={c._id || c.id} 
                     onClick={() => scrollToCategory(c._id || c.id)}
                     className={cn(
                       "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all",
                       activeCategory === (c._id || c.id) ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-800'
                     )}
                   >{c.nome}</button>
                 ))}
              </div>

              <div className="flex items-center gap-3">
                 <button onClick={() => setIsCartOpen(true)} className="flex items-center gap-3 bg-gray-950 text-white px-5 py-2.5 rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all">
                    <ShoppingBag className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Ver Sacola • {cart.reduce((acc, i) => acc + i.quantidade, 0)}</span>
                 </button>
              </div>
           </div>
        </div>

        <header className="relative z-30 pt-0 lg:pt-6">
          <div className="max-w-7xl mx-auto px-0 lg:px-4 relative mb-0 lg:mb-6">
             {/* Capa com bordas arredondadas apenas no desktop, no mobile é full */}
             <div className="w-full h-44 md:h-60 lg:h-72 bg-cover bg-center lg:rounded-3xl relative shadow-md" style={{ backgroundImage: `url(${storeInfo.capa_url || ''})` }}>
                {!storeInfo.capa_url && <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800 lg:rounded-3xl"></div>}
                
                {/* Botões flutuantes para Mobile */}
                <div className="absolute top-4 right-4 z-40 lg:hidden flex gap-2">
                  <button onClick={() => setDarkMode(!darkMode)} className="w-9 h-9 flex items-center justify-center bg-black/20 backdrop-blur-md rounded-full text-white">
                     {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setIsCartOpen(true)} className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full text-white">
                    <ShoppingBag className="w-4 h-4" />
                    <span className="font-bold text-sm">{cart.reduce((acc, i) => acc + i.quantidade, 0)}</span>
                  </button>
                </div>
             </div>
             
             <div className="px-5 lg:px-6 flex flex-col items-center lg:items-start lg:flex-row relative pt-1">
                <div className="flex flex-col lg:flex-row items-center lg:items-start gap-4 lg:gap-6 w-full">
                   {/* Logo Circular sobrepondo a capa */}
                   <div className="relative -mt-16 lg:-mt-20 z-20 w-32 h-32 lg:w-40 lg:h-40 rounded-full border-4 border-white dark:border-slate-900 shadow-xl bg-white dark:bg-slate-800 overflow-hidden shrink-0">
                      {storeInfo.logo_url ? <img src={storeInfo.logo_url} alt="Logo" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Store className="w-10 h-10 text-gray-300" /></div>}
                   </div>
                   
                   <div className="text-center lg:text-left flex-1">
                      <h1 className="text-xl lg:text-3xl font-black text-gray-950 dark:text-white uppercase tracking-tight mb-1">{storeInfo.nome_loja} | {storeInfo.tagline || 'O melhor sabor!'}</h1>
                      
                      <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-2 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">
                         <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-gray-400" />
                            <span>{storeInfo.cidade_loja || 'Resende - RJ'}</span>
                         </div>
                         <div className="w-1 h-1 bg-gray-300 rounded-full hidden sm:block"></div>
                         <button onClick={() => setIsStoreInfoOpen(true)} className="hover:underline flex items-center gap-1">
                            <span>Mais informações</span>
                         </button>
                      </div>

                      <div className="flex items-center justify-center lg:justify-start mb-4">
                         <span className={cn(
                           "text-sm font-black uppercase tracking-wider",
                           storeInfo.is_open ? 'text-emerald-600' : 'text-red-500'
                         )}>
                            {storeInfo.is_open ? `Aberto agora • Entrega em ${storeInfo.tempo_entrega}` : `Fechado • Abrimos às 18h00`}
                         </span>
                      </div>
                   </div>
                </div>
             </div>

             {/* Loyalty Card modernizado */}
             {storeInfo?.fidelidade_ativa && (
                <div className="mx-4 lg:mx-6 mt-4 bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm flex items-start gap-4">
                   <div className="w-10 h-10 rounded-xl bg-amber-600/10 flex items-center justify-center shrink-0">
                      <Gift className="w-5 h-5 text-amber-600" />
                   </div>
                   <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-black text-gray-900 dark:text-white mb-0.5 tracking-tight">Programa de fidelidade</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
                         A cada <span className="text-gray-900 dark:text-white font-black">R$ 1,00</span> em compras você ganha <span className="text-gray-900 dark:text-white font-black">1 ponto</span> que pode ser trocado por prêmios.
                      </p>
                   </div>
                </div>
             )}
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 mt-6 relative pb-12">
            <div className="flex flex-col lg:flex-row gap-8">
               <div className="flex-1">
                  {currentView === 'home' && (
                    <Home 
                      onAddToCart={handleAddToCart} 
                      isScrolled={isScrolled} 
                      storeInfo={storeInfo} 
                      currentView={currentView} 
                      setCurrentView={setCurrentView}
                      activeCategory={activeCategory}
                      setActiveCategory={scrollToCategory}
                      categories={categories}
                      setCategories={setCategories}
                      products={products}
                      setProducts={setProducts}
                      searchQuery={searchQuery}
                      setSearchQuery={setSearchQuery}
                    />
                  )}
                  {currentView === 'tracking' && trackingOrderId && <OrderTracking orderId={trackingOrderId} storePhone={storeInfo.whatsapp} onBack={() => setCurrentView('home')} />}
                  {currentView === 'orders' && (user ? <Orders onReorder={handleReorder} onTrackingRequest={(id) => { setTrackingOrderId(id); setCurrentView('tracking'); }} /> : <Login onLoginSuccess={setUser} onNavigateToRegister={() => setCurrentView('register')} />)}
                  {currentView === 'profile' && (
                    user ? <Profile user={user} onLogout={() => { localStorage.removeItem('stitch_token'); setUser(null); setCurrentView('home'); }} onUpdateUser={setUser} />
                      : <Login onLoginSuccess={setUser} onNavigateToRegister={() => setCurrentView('register')} />
                  )}
                  {currentView === 'register' && <Register onRegisterSuccess={(u) => { setUser(u); setCurrentView('home'); }} onNavigateToLogin={() => setCurrentView('profile')} />}
                  
                  {!['home', 'orders', 'profile', 'register', 'tracking'].includes(currentView) && (
                     <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="text-6xl mb-4">🚀</div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white uppercase tracking-tighter">Página não encontrada</h2>
                        <button onClick={() => setCurrentView('home')} className="mt-6 bg-emerald-600 text-white px-8 py-3 rounded-2xl font-bold uppercase tracking-widest text-xs">Voltar ao Início</button>
                     </div>
                  )}
               </div>

                <div className="hidden lg:block w-80 shrink-0">
                  <div className={cn(
                    "bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-slate-800 sticky h-fit flex flex-col transition-all duration-300",
                    isScrolled ? "top-24 max-h-[calc(100vh-120px)]" : "top-4 max-h-[calc(100vh-80px)]"
                  )}>
                     <div className="flex-1 overflow-hidden">
                        <CartDrawer 
                          isOpen={true} 
                          inlineMode={true} 
                          onClose={() => {}} 
                          cart={cart} 
                          onUpdateQuantity={handleUpdateQuantity} 
                          onToggleRedemption={handleToggleRedemption}
                          onClearCart={handleClearCart} 
                          user={user} 
                          onEditItem={handleEditItem}
                          onNavigateToOrders={() => setCurrentView('orders')} 
                        />
                     </div>
                  </div>
               </div>
            </div>
        </main>

        <footer className="mt-12 bg-gray-50 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 pt-16 pb-32 lg:pb-16 px-6">
           <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mb-12">
                 <div className="space-y-4">
                    <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase italic">{storeInfo.nome_loja}</h4>
                    <p className="text-xs text-gray-500 font-medium italic">O sabor que você ama, no conforto da sua casa.</p>
                 </div>
                 <div className="space-y-4">
                    <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase italic tracking-widest leading-none">Onde estamos</h4>
                    <div className="text-[11px] text-gray-600 dark:text-gray-400 font-bold leading-tight">
                       {storeInfo.rua_loja}, {storeInfo.numero_loja} - {storeInfo.bairro_loja}<br/>
                       {storeInfo.cidade_loja}
                    </div>
                 </div>
                 <div className="space-y-4">
                    <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase italic tracking-widest leading-none">Assinatura</h4>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Plataforma fornecida por</span>
                       <span className="bg-gray-950 text-white px-2 py-1 rounded text-[9px] font-black italic tracking-tighter">STITCH SOLUTIONS</span>
                    </div>
                 </div>
              </div>
              <div className="pt-8 border-t border-gray-200 dark:border-slate-800 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center lg:text-left">
                © 2026 {storeInfo.nome_loja} • Todos os direitos reservados.
              </div>
           </div>
        </footer>

        {cart.length > 0 && (
          <button onClick={() => setIsCartOpen(true)} className="lg:hidden fixed bottom-24 right-4 z-40 bg-emerald-600 text-white px-5 py-3 rounded-full shadow-lg flex items-center gap-2 font-bold animate-bounce">
            <ShoppingBag className="w-5 h-5" />
            <span>Sacola ({cart.length})</span>
          </button>
        )}

        <div className="lg:hidden">
          <CartDrawer 
            isOpen={isCartOpen} 
            inlineMode={false} 
            onClose={() => setIsCartOpen(false)} 
            cart={cart} 
            onUpdateQuantity={handleUpdateQuantity} 
            onToggleRedemption={handleToggleRedemption}
            onClearCart={handleClearCart} 
            user={user} 
            onEditItem={handleEditItem}
            onNavigateToOrders={() => { setIsCartOpen(false); setCurrentView('orders'); }} 
          />
        </div>

        <StoreInfoModal isOpen={isStoreInfoOpen} onClose={() => setIsStoreInfoOpen(false)} storeInfo={storeInfo} />

        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 h-20 flex justify-around items-center z-50 transition-colors">
          <button onClick={() => setCurrentView('home')} className={`flex flex-col items-center justify-center flex-1 h-full gap-1 ${currentView === 'home' ? 'text-amber-700' : 'text-gray-400'}`}>
            <HomeIcon className={cn("w-5 h-5", currentView === 'home' && "fill-current")} />
            <span className="text-[9px] font-black uppercase tracking-wider">Início</span>
          </button>
          <button onClick={() => setCurrentView('home')} className={`flex flex-col items-center justify-center flex-1 h-full gap-1 ${currentView === 'promocoes' ? 'text-amber-700' : 'text-gray-400'}`}>
            <Star className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Promoções</span>
          </button>
          <button onClick={() => setCurrentView('orders')} className={`flex flex-col items-center justify-center flex-1 h-full gap-1 ${currentView === 'orders' ? 'text-amber-700' : 'text-gray-400'}`}>
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Pedidos</span>
          </button>
          <button onClick={() => setCurrentView('profile')} className={`flex flex-col items-center justify-center flex-1 h-full gap-1 ${currentView === 'profile' || currentView === 'register' ? 'text-amber-700' : 'text-gray-400'}`}>
            <User className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">{user ? 'Perfil' : 'Perfil'}</span>
          </button>
        </nav>

        <ProductModal 
           product={editingItemInfo?.product}
           isOpen={!!editingItemInfo}
           onClose={() => setEditingItemInfo(null)}
           onAddToCart={handleUpdateItem}
           initialData={editingItemInfo?.item}
        />
      </div>
    </ToastProvider>
  );
}