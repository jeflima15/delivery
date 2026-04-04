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
        
        <nav className="hidden lg:flex w-full bg-emerald-600 text-white h-20 items-center justify-center relative z-40 shadow-md">
          <div className="flex items-center gap-12">
             <button onClick={() => setCurrentView('home')} className={`group flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentView === 'home' ? 'bg-white text-emerald-600 font-bold' : 'hover:bg-white/10'}`}>
                <HomeIcon className="w-5 h-5" />
                <span className="text-xs uppercase tracking-widest">Início</span>
             </button>
             <button onClick={() => setCurrentView('home')} className="group flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:bg-white/10">
                <Store className="w-5 h-5" />
                <span className="text-xs uppercase tracking-widest">Promoções</span>
             </button>
             <button onClick={() => setCurrentView('orders')} className={`group flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentView === 'orders' ? 'bg-white text-emerald-600 font-bold' : 'hover:bg-white/10'}`}>
                <Receipt className="w-5 h-5" />
                <span className="text-xs uppercase tracking-widest">Pedidos</span>
             </button>
             <button onClick={() => setCurrentView('profile')} className={`group flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentView === 'profile' || currentView === 'register' ? 'bg-white text-emerald-600 font-bold' : 'hover:bg-white/10'}`}>
                <User className="w-5 h-5" />
                <span className="text-xs uppercase tracking-widest">{user ? user.nome.split(' ')[0] : 'Entrar'}</span>
             </button>
             <button onClick={() => setDarkMode(!darkMode)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all">
                {darkMode ? <Sun className="w-5 h-5 text-amber-300" /> : <Moon className="w-5 h-5 text-white" />}
             </button>
          </div>
        </nav>

        <div className={`hidden lg:flex fixed top-0 left-0 right-0 h-20 bg-white dark:bg-slate-900 z-50 shadow-lg border-b border-gray-100 dark:border-slate-800 transition-all duration-500 transform ${isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
           <div className="max-w-7xl mx-auto w-full px-6 flex items-center gap-6">
              <div className="w-12 h-12 rounded-xl overflow-hidden shadow-sm shrink-0">
                 {storeInfo.logo_url ? <img src={storeInfo.logo_url} alt="Logo" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-emerald-600 flex items-center justify-center"><Store className="w-6 h-6 text-white" /></div>}
              </div>

              <div className="w-64 shrink-0">
                <select 
                   value={activeCategory} 
                   onChange={(e) => scrollToCategory(e.target.value)}
                   className="w-full h-11 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl px-4 text-xs font-black text-gray-700 dark:text-gray-200 shadow-sm focus:border-emerald-500 outline-none appearance-none cursor-pointer"
                   style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
                >
                   <option value="all">Lista de categorias</option>
                   {categories.map(c => (
                     <option key={c._id || c.id} value={c._id || c.id}>{c.nome}</option>
                   ))}
                </select>
              </div>

              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Busque por um produto"
                  className="w-full h-11 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-gray-900 dark:text-white pl-10 pr-4 rounded-xl shadow-sm focus:outline-none focus:border-emerald-500 text-xs font-bold placeholder-gray-400"
                />
              </div>

              <div className="flex items-center gap-4 border-l border-gray-100 dark:border-slate-800 pl-6 h-10">
                 <button onClick={() => { setCurrentView('home'); window.scrollTo({top: 0, behavior: 'smooth'}); }} className={`p-2.5 rounded-xl transition-all ${currentView === 'home' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}>
                    <HomeIcon className="w-5 h-5" />
                 </button>
                 <button onClick={() => setCurrentView('orders')} className={`p-2.5 rounded-xl transition-all ${currentView === 'orders' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}>
                    <Receipt className="w-5 h-5" />
                 </button>
                 <button onClick={() => setCurrentView('profile')} className={`p-2.5 rounded-xl transition-all ${currentView === 'profile' || currentView === 'register' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}>
                    <User className="w-5 h-5" />
                 </button>
              </div>
           </div>
        </div>

        <header className="relative z-30 pt-6">
          <div className="max-w-7xl mx-auto px-4 relative mb-6">
             <div className="w-full h-44 md:h-60 lg:h-72 bg-cover bg-center rounded-3xl relative shadow-md" style={{ backgroundImage: `url(${storeInfo.capa_url || ''})` }}>
                {!storeInfo.capa_url && <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800 rounded-3xl"></div>}
                <div className="absolute top-4 right-4 z-40 lg:hidden flex gap-2">
                  <button onClick={() => setDarkMode(!darkMode)} className="w-10 h-10 flex items-center justify-center bg-white/90 dark:bg-gray-800 backdrop-blur-sm rounded-full shadow-sm">
                     {darkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-gray-700" />}
                  </button>
                  <button onClick={() => setIsCartOpen(true)} className="flex items-center gap-2 bg-white/90 dark:bg-gray-800 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm">
                    <ShoppingBag className="w-5 h-5 text-gray-800" />
                    <span className="font-bold text-gray-900">{cart.length}</span>
                  </button>
                </div>
             </div>
             
             <div className="px-5 lg:px-6 flex flex-col lg:flex-row relative items-center lg:items-start lg:justify-between pt-1">
                <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6">
                   <div className="relative -mt-16 lg:-mt-20 z-20 w-32 h-32 lg:w-40 lg:h-40 rounded-3xl border-4 border-white dark:border-slate-900 shadow-lg bg-white dark:bg-slate-800 overflow-hidden">
                      {storeInfo.logo_url ? <img src={storeInfo.logo_url} alt="Logo" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Store className="w-10 h-10 text-gray-300" /></div>}
                   </div>
                   
                   <div className="text-center lg:text-left lg:mt-4">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                        <h1 className="text-2xl lg:text-3xl font-black text-gray-950 dark:text-white uppercase tracking-tight">{storeInfo.nome_loja}</h1>
                        <span className="hidden lg:inline-block w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
                        <span className="text-sm font-bold text-gray-600 dark:text-gray-400">Para pedidos com sabor!</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs font-bold mt-2">
                         <span className={storeInfo.is_open ? 'text-emerald-600' : 'text-red-500'}>{storeInfo.is_open ? 'Aberto no momento' : 'Fechado no momento'}</span>
                         <span className="text-gray-300">•</span>
                         <span className="text-gray-600 dark:text-gray-400">{storeInfo.tempo_entrega}</span>
                         <span className="text-gray-300">•</span>
                         <button onClick={() => setIsStoreInfoOpen(true)} className="text-gray-900 dark:text-white hover:underline">Mais informações</button>
                      </div>
                   </div>
                </div>

                {storeInfo?.fidelidade_ativa && (
                   <div className="mt-6 lg:mt-4 bg-white dark:bg-slate-800 rounded-xl p-4 border border-emerald-50 dark:border-slate-700 shadow-sm flex items-center gap-4 min-w-[280px]">
                      <div className="shrink-0">
                         <Star className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                      </div>
                      <div className="flex-1">
                         <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] font-black text-gray-800 dark:text-gray-200 uppercase tracking-widest">Fidelidade</span>
                            {user && <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black">{user.pontos || 0} PTS</span>}
                         </div>
                         <p className="text-[10px] text-gray-600 dark:text-gray-400 font-bold leading-tight">
                            {user ? (
                               <>Você possui <span className="text-emerald-600">{user.pontos || 0} pontos</span>. Cada 100 pts valem <span className="text-emerald-600">R$ 5,00</span> de desconto!</>
                            ) : (
                               "Cadastre-se e ganhe pontos em cada pedido!"
                            )}
                         </p>
                      </div>
                   </div>
                )}
             </div>
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

        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 h-20 flex justify-around items-center z-50 transition-colors">
          <button onClick={() => setCurrentView('home')} className={`flex flex-col items-center justify-center flex-1 h-full gap-1 ${currentView === 'home' ? 'text-emerald-600' : 'text-gray-400'}`}>
            <HomeIcon className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Início</span>
          </button>
          <button onClick={() => setCurrentView('orders')} className={`flex flex-col items-center justify-center flex-1 h-full gap-1 ${currentView === 'orders' ? 'text-emerald-600' : 'text-gray-400'}`}>
            <Receipt className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Pedidos</span>
          </button>
          <button onClick={() => setCurrentView('profile')} className={`flex flex-col items-center justify-center flex-1 h-full gap-1 ${currentView === 'profile' || currentView === 'register' ? 'text-emerald-600' : 'text-gray-400'}`}>
            <User className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">{user ? 'Perfil' : 'Entrar'}</span>
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