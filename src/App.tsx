// @ts-nocheck
import React, { useEffect, useState } from 'react';
import Home from './components/Home';
import PhoneAuthModal from './components/PhoneAuthModal';
import Register from './components/Register';
import CartDrawer from './components/CartDrawer';
import Orders from './components/Orders';
import AdminDashboard from './components/AdminDashboard';
import StoreInfoModal from './components/StoreInfoModal';
import OrderTracking from './components/OrderTracking';
import ProductModal from './components/ProductModal';
import ProfileEditModal from './components/ProfileEditModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import LoyaltyModal from './components/LoyaltyModal';
import PasswordAuthModal from './components/PasswordAuthModal';
import CheckoutModal from './components/CheckoutModal';
import { cn } from './lib/utils';
import {
  ChevronDown,
  Gift,
  Home as HomeIcon,
  MapPin,
  Moon,
  Phone,
  Receipt,
  Search,
  ShoppingBag,
  Star,
  Store,
  Sun,
  Truck,
  User,
} from 'lucide-react';
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
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isStoreInfoOpen, setIsStoreInfoOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [authTarget, setAuthTarget] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [cartDrawerDataForCheckout, setCartDrawerDataForCheckout] = useState<any>(null);

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

      const categorySections = document.querySelectorAll('[id^="categoria-"]');
      let current = 'all';

      categorySections.forEach((section) => {
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
        console.error('Erro ao buscar config publica', error);
      } finally {
        setIsConfigLoaded(true);
      }
    };

    fetchPublicConfig();
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('stitch_token');
      if (!token) return;

      try {
        const res = await fetch('/api/auth/perfil', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.sucesso) setUser(data.user);
      } catch (error) {
        localStorage.removeItem('stitch_token');
      }
    };

    fetchUser();
  }, []);

  useEffect(() => {
    localStorage.setItem('stitch_cart', JSON.stringify(cart));
  }, [cart]);

  const handleAddToCart = (item) => {
    setCart((prev) => {
      const exists = prev.findIndex(
        (i) =>
          i.produtoId === item.produtoId &&
          JSON.stringify(i.opcoes_escolhidas) === JSON.stringify(item.opcoes_escolhidas)
      );

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
    setCart((prev) => {
      const newCart = [...prev];
      newCart[index].quantidade += delta;
      if (newCart[index].quantidade <= 0) newCart.splice(index, 1);
      else newCart[index].subtotal = newCart[index].preco_unitario * newCart[index].quantidade;
      return newCart;
    });
  };

  const handleToggleRedemption = (index) => {
    setCart((prev) => {
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
    setCart(
      items.map((item) => ({
        produtoId: item.produtoId,
        nome: item.nome,
        preco_unitario: item.preco_unitario,
        quantidade: item.quantidade,
        subtotal: item.subtotal,
        opcoes_escolhidas: item.opcoes_escolhidas || [],
      }))
    );
    setCurrentView('home');
    setIsCartOpen(true);
  };

  const handleEditItem = (index) => {
    const item = cart[index];
    const product = products.find((p) => (p._id || p.id) === item.produtoId);
    if (product) setEditingItemInfo({ product, item, index });
  };

  const handleUpdateItem = (newItem) => {
    setCart((prev) => {
      const newCart = [...prev];
      if (editingItemInfo) {
        newCart[editingItemInfo.index] = {
          ...newItem,
          produtoId: editingItemInfo.product._id || editingItemInfo.product.id,
        };
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

  const handleStartCheckout = (data) => {
    setCartDrawerDataForCheckout(data);
    if (!user) {
      setActiveModal('pendingCheckout');
      setIsLoginModalOpen(true);
    } else {
      setIsCheckoutOpen(true);
    }
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleCategoryGroups = categories
    .map((category) => {
      let categoryProducts = products.filter((product) => product.categoriaId === (category._id || category.id));

      if (normalizedSearchQuery) {
        categoryProducts = categoryProducts.filter((product) => {
          const name = (product.nome || '').toLowerCase();
          const description = (product.descricao || '').toLowerCase();
          return name.includes(normalizedSearchQuery) || description.includes(normalizedSearchQuery);
        });
      }

      return { category, products: categoryProducts };
    })
    .filter((group) => group.products.length > 0);

  const visibleCategories = visibleCategoryGroups.map((group) => group.category);

  useEffect(() => {
    if (
      activeCategory !== 'all' &&
      !visibleCategories.some((category) => (category._id || category.id) === activeCategory)
    ) {
      setActiveCategory('all');
    }
  }, [activeCategory, visibleCategories]);

  if (isAdminRoute) return <ToastProvider><AdminDashboard /></ToastProvider>;

  if (!isConfigLoaded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f8f9fa', gap: '20px' }}>
        <div style={{ width: '52px', height: '52px', border: '5px solid #e5e7eb', borderTopColor: '#059669', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: '#9ca3af', fontSize: '14px', fontWeight: '600', letterSpacing: '0.05em', margin: 0 }}>Carregando cardapio...</p>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="relative min-h-screen overflow-x-hidden bg-[#f5f5f2] pb-24 font-sans transition-colors duration-300 dark:bg-slate-950 lg:pb-0">
        {currentView === 'home' && (
          <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-[205px] bg-emerald-600 lg:block" />
        )}

        <nav className="relative z-40 hidden h-20 w-full items-center justify-center bg-emerald-600 text-white shadow-md lg:flex">
          <div className="flex items-center gap-12">
            <button onClick={() => setCurrentView('home')} className={`group flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentView === 'home' ? 'bg-white text-emerald-600 font-bold' : 'hover:bg-white/10'}`}>
              <HomeIcon className="w-5 h-5" />
              <span className="text-xs uppercase tracking-widest">Inicio</span>
            </button>
            <button onClick={() => setCurrentView('home')} className="group flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:bg-white/10">
              <Star className="w-5 h-5" />
              <span className="text-xs uppercase tracking-widest">Promocoes</span>
            </button>
            <button onClick={() => setCurrentView('orders')} className={`group flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentView === 'orders' ? 'bg-white text-emerald-600 font-bold' : 'hover:bg-white/10'}`}>
              <Receipt className="w-5 h-5" />
              <span className="text-xs uppercase tracking-widest">Pedidos</span>
            </button>
            <div className="relative">
              <button onClick={() => { if (user) setIsProfileMenuOpen(!isProfileMenuOpen); else setIsLoginModalOpen(true); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${isProfileMenuOpen ? 'bg-white text-emerald-600 font-bold' : 'hover:bg-white/10'}`}>
                <User className="w-5 h-5" />
                <span className="text-xs uppercase tracking-widest">{user ? (user.nome === 'Visitante' ? 'Minha conta' : user.nome.split(' ')[0]) : 'Entrar/Cadastrar'}</span>
                {user && <ChevronDown className={`w-4 h-4 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />}
              </button>
              {isProfileMenuOpen && user && (
                <>
                  <div className="fixed inset-0 z-40 hidden lg:block" onClick={() => setIsProfileMenuOpen(false)}></div>
                  <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded shadow-[0_5px_40px_-5px_rgba(0,0,0,0.1)] border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                    <button onClick={() => { setIsProfileMenuOpen(false); if(sessionStorage.getItem('stitch_sensitive_auth_validated') === 'true') setActiveModal('editProfile'); else setAuthTarget('editProfile'); }} className="w-full text-left px-5 py-3 text-[13px] text-gray-600 font-bold hover:bg-gray-50 transition-colors">Editar perfil</button>
                    <button onClick={() => { setIsProfileMenuOpen(false); if(sessionStorage.getItem('stitch_sensitive_auth_validated') === 'true') setActiveModal('changePassword'); else setAuthTarget('changePassword'); }} className="w-full text-left px-5 py-3 text-[13px] text-gray-600 font-bold hover:bg-gray-50 transition-colors">Trocar senha</button>
                    <button onClick={() => { setIsProfileMenuOpen(false); if(sessionStorage.getItem('stitch_sensitive_auth_validated') === 'true') setActiveModal('loyalty'); else setAuthTarget('loyalty'); }} className="w-full text-left px-5 py-3 text-[13px] text-gray-600 font-bold hover:bg-gray-50 transition-colors">Programa de fidelidade</button>
                    <button onClick={() => { setIsProfileMenuOpen(false); localStorage.removeItem('stitch_token'); sessionStorage.removeItem('stitch_sensitive_auth_validated'); window.location.reload(); }} className="w-full text-left px-5 py-3 text-[13px] text-gray-600 font-bold hover:bg-gray-50 transition-colors">Sair</button>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setDarkMode(!darkMode)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all">
              {darkMode ? <Sun className="w-5 h-5 text-emerald-300" /> : <Moon className="w-5 h-5 text-white" />}
            </button>
          </div>
        </nav>

        <div
          className={`fixed left-0 right-0 top-0 z-50 h-16 transform border-b border-gray-100 bg-white shadow-md transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 lg:hidden ${
            isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex h-full w-full items-center gap-3 px-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-gray-100 dark:border-slate-700">
              {storeInfo.logo_url ? (
                <img src={storeInfo.logo_url} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-emerald-600 text-[10px] font-bold text-white">
                  LOGO
                </div>
              )}
            </div>

            <div className="relative flex-1">
              <select
                value={activeCategory}
                onChange={(e) => scrollToCategory(e.target.value)}
                className="h-11 w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 text-[13px] font-black uppercase tracking-tighter text-gray-700 shadow-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
                  backgroundPosition: 'right 0.75rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1rem',
                }}
              >
                <option value="all">Categorias</option>
                {visibleCategories.map((c) => (
                  <option key={c._id || c.id} value={c._id || c.id}>
                    {c.nome.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                setIsScrolled(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-100 bg-white text-gray-400 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className={`fixed left-0 right-0 top-0 z-50 hidden h-20 transform border-b border-gray-100 bg-white shadow-lg transition-all duration-500 dark:border-slate-800 dark:bg-slate-900 lg:flex ${
            isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-6">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl shadow-sm">
              {storeInfo.logo_url ? (
                <img src={storeInfo.logo_url} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-emerald-600">
                  <Store className="h-6 w-6 text-white" />
                </div>
              )}
            </div>

            <div className="w-64 shrink-0">
              <select
                value={activeCategory}
                onChange={(e) => scrollToCategory(e.target.value)}
                className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-gray-100 bg-gray-50 px-4 text-xs font-black text-gray-700 shadow-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
                  backgroundPosition: 'right 1rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1rem',
                }}
              >
                <option value="all">Lista de categorias</option>
                {visibleCategories.map((c) => (
                  <option key={c._id || c.id} value={c._id || c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Busque por um produto"
                className="h-11 w-full rounded-xl border border-gray-100 bg-gray-50 pl-10 pr-4 text-xs font-bold text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex h-10 items-center gap-4 border-l border-gray-100 pl-6 dark:border-slate-800">
              <button
                onClick={() => {
                  setCurrentView('home');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`rounded-xl p-2.5 transition-all ${
                  currentView === 'home'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                    : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                <HomeIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setCurrentView('orders')}
                className={`rounded-xl p-2.5 transition-all ${
                  currentView === 'orders'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                    : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                <Receipt className="h-5 w-5" />
              </button>
              <button
                onClick={() => {
                  if (user) setIsProfileMenuOpen(!isProfileMenuOpen);
                  else setIsLoginModalOpen(true);
                }}
                className={`rounded-xl p-2.5 transition-all ${
                  isProfileMenuOpen || currentView === 'register'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                    : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                <User className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {currentView === 'home' && (
          <header className="relative z-30 pt-0 lg:pt-6">
            <div className="mx-auto max-w-7xl px-0 lg:px-4">
              <div className="relative h-52 overflow-hidden border border-gray-200 bg-cover bg-center shadow-lg md:h-72 lg:h-[304px] lg:rounded-[1.4rem] dark:border-slate-800" style={{ backgroundImage: `url(${storeInfo.capa_url || ''})` }}>
                <div
                  className="absolute inset-0"
                >
                  {!storeInfo.capa_url && (
                    <div className="absolute inset-0 bg-gray-200 dark:bg-slate-800 lg:rounded-[1.4rem]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-black/5 to-transparent" />

                  <div className="absolute right-4 top-4 z-40 flex gap-2 lg:hidden">
                    <button
                      onClick={() => setDarkMode(!darkMode)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition-colors hover:bg-black/50"
                    >
                      {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => setIsCartOpen(true)}
                      className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 text-white backdrop-blur-md transition-colors hover:bg-black/50"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      <span className="text-sm font-bold tracking-tight">
                        {cart.reduce((acc, item) => acc + item.quantidade, 0)}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="relative z-10 mt-4 px-4 lg:px-0">
                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div>
                    <div className="relative md:hidden">
                      <div className="flex items-end gap-4">
                        <div className="-mt-16 flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[1.4rem] border-4 border-white bg-white shadow-md dark:border-slate-800 dark:bg-slate-900">
                          {storeInfo.logo_url ? (
                            <img src={storeInfo.logo_url} alt="Logo" className="h-full w-full object-cover" />
                          ) : (
                            <Store className="h-8 w-8 text-gray-300" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 pb-2">
                          <h1 className="truncate text-[30px] font-black tracking-tight text-gray-950 dark:text-white">
                            {storeInfo.nome_loja}
                          </h1>
                          <p className="truncate text-lg font-semibold text-gray-500 dark:text-slate-400">
                            {storeInfo.tagline || 'Sabor & Qualidade'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                        <span className={storeInfo.is_open ? 'font-semibold text-emerald-600' : 'font-semibold text-red-500'}>
                          {storeInfo.is_open ? `Aberto - ${storeInfo.tempo_entrega}` : 'Fechado no momento'}
                        </span>
                        <span className="text-gray-300">-</span>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" />
                          {storeInfo.cidade_loja || 'Sua cidade'}
                        </span>
                        <span className="text-gray-300">-</span>
                        <button onClick={() => setIsStoreInfoOpen(true)} className="font-semibold transition-colors hover:text-emerald-600">
                          Mais informacoes
                        </button>
                      </div>
                    </div>

                    <div className="relative hidden min-h-[122px] md:block md:pl-[184px]">
                      <div className="absolute left-0 top-[-70px] flex h-[162px] w-[162px] items-center justify-center overflow-hidden rounded-[1.5rem] border-4 border-white bg-white shadow-md dark:border-slate-800 dark:bg-slate-900">
                        {storeInfo.logo_url ? (
                          <img src={storeInfo.logo_url} alt="Logo" className="h-full w-full object-cover" />
                        ) : (
                          <Store className="h-10 w-10 text-gray-300" />
                        )}
                      </div>

                      <div className="pt-7">
                        <h1 className="text-[34px] font-black tracking-tight text-gray-950 dark:text-white lg:text-[46px]">
                          {storeInfo.nome_loja}
                          <span className="mx-3 font-medium text-gray-300 dark:text-slate-700">|</span>
                          <span className="text-[26px] font-bold text-gray-500 dark:text-slate-400">
                            {storeInfo.tagline || 'Sabor & Qualidade'}
                          </span>
                        </h1>
                      </div>
                    </div>

                    <div className="mt-3 hidden flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-gray-600 dark:text-gray-400 md:flex md:pl-[184px]">
                      <span className={storeInfo.is_open ? 'font-semibold text-emerald-600' : 'font-semibold text-red-500'}>
                        {storeInfo.is_open ? `Aberto - ${storeInfo.tempo_entrega}` : 'Fechado no momento'}
                      </span>
                      <span className="text-gray-300">-</span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        {storeInfo.cidade_loja || 'Sua cidade'}
                      </span>
                      <span className="text-gray-300">-</span>
                      <button onClick={() => setIsStoreInfoOpen(true)} className="font-semibold transition-colors hover:text-emerald-600">
                        Mais informacoes
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="min-h-[112px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#a66a2b] text-white">
                          <Gift className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-lg font-black tracking-tight text-gray-950 dark:text-white">Programa de fidelidade</p>
                          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-slate-400">
                            A cada R$ 1,00 em compras voce ganha {storeInfo.pontos_por_real || 1} ponto{(storeInfo.pontos_por_real || 1) > 1 ? 's' : ''} que pode trocar por beneficios.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </header>
        )}

        <main className="relative mx-auto mt-6 max-w-7xl px-4 pb-12">
          <div className="flex flex-col gap-8 lg:flex-row">
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

              {currentView === 'tracking' && trackingOrderId && (
                <OrderTracking
                  orderId={trackingOrderId}
                  storePhone={storeInfo.whatsapp}
                  onBack={() => setCurrentView('home')}
                />
              )}

              {currentView === 'orders' &&
                (user ? (
                  <Orders
                    user={user}
                    onReorder={handleReorder}
                    onTrackingRequest={(id) => {
                      setTrackingOrderId(id);
                      setCurrentView('tracking');
                    }}
                  />
                ) : (
                  <div className="animate-in fade-in pt-2 duration-300 sm:pt-6">
                    <div className="mb-6 flex items-center border-b border-gray-200 pb-4 dark:border-slate-800 sm:mb-8">
                      <h1 className="text-2xl font-bold tracking-tight text-[#4e4e4e] dark:text-gray-200 sm:text-[28px]">
                        Seus pedidos
                      </h1>
                    </div>

                    <div className="mb-12 mt-10 flex justify-center">
                      <div className="w-full max-w-[400px] rounded border border-gray-100 bg-white p-8 text-center shadow-[0_4px_20px_-5px_rgba(0,0,0,0.1)] dark:border-slate-700 dark:bg-slate-800">
                        <h2 className="mb-3 text-lg font-bold tracking-tight text-[#444] dark:text-gray-100">
                          Identifique-se
                        </h2>
                        <p className="mb-6 px-1 text-[13px] font-medium leading-relaxed text-gray-500 dark:text-gray-400">
                          Entre na sua conta para ter acesso aos seus pedidos.
                        </p>
                        <button
                          onClick={() => setIsLoginModalOpen(true)}
                          className="w-full rounded bg-emerald-600 py-3.5 text-[13px] font-bold uppercase tracking-widest text-white transition-all hover:bg-emerald-700 active:scale-[0.98]"
                        >
                          Entrar / Cadastrar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

              {currentView === 'register' && (
                <Register
                  onRegisterSuccess={(u) => {
                    setUser(u);
                    setCurrentView('home');
                  }}
                  onNavigateToLogin={() => setIsLoginModalOpen(true)}
                />
              )}

              {!['home', 'orders', 'register', 'tracking'].includes(currentView) && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-4 text-6xl">?</div>
                  <h2 className="text-2xl font-bold uppercase tracking-tighter text-gray-800 dark:text-white">
                    Pagina nao encontrada
                  </h2>
                  <button
                    onClick={() => setCurrentView('home')}
                    className="mt-6 rounded-2xl bg-emerald-600 px-8 py-3 text-xs font-bold uppercase tracking-widest text-white"
                  >
                    Voltar ao inicio
                  </button>
                </div>
              )}
            </div>

            {currentView === 'home' && (
              <div className="hidden w-80 shrink-0 lg:block">
                <div
                  className={cn(
                    'sticky h-fit overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-all duration-300 dark:border-slate-800 dark:bg-slate-800',
                    isScrolled ? 'top-24 max-h-[calc(100vh-120px)]' : 'top-4 max-h-[calc(100vh-80px)]'
                  )}
                >
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
                      onStartCheckout={handleStartCheckout}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {!(currentView === 'orders' && !user) && (
          <footer className="mt-12 border-t border-gray-200 bg-white px-6 pt-16 pb-32 dark:border-slate-800 dark:bg-slate-950 lg:pb-16">
            <div className="mx-auto max-w-7xl">
              <div className="mb-12 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-4">
                  <h4 className="text-sm font-black uppercase italic tracking-[0.22em] text-gray-900 dark:text-white">
                    {storeInfo.nome_loja}
                  </h4>
                  <p className="text-sm leading-7 text-gray-500 dark:text-slate-400">
                    {storeInfo.sobre_texto || 'O sabor que voce ama, no conforto da sua casa.'}
                  </p>
                </div>
                <div className="space-y-4">
                  <h4 className="text-sm font-black uppercase italic tracking-[0.22em] text-gray-800 dark:text-white">
                    Onde estamos
                  </h4>
                  <div className="text-sm leading-7 text-gray-600 dark:text-slate-400">
                    {storeInfo.rua_loja}, {storeInfo.numero_loja} - {storeInfo.bairro_loja}
                    <br />
                    {storeInfo.cidade_loja}
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-sm font-black uppercase italic tracking-[0.22em] text-gray-800 dark:text-white">
                    Contato
                  </h4>
                  <div className="space-y-2 text-sm leading-7 text-gray-600 dark:text-slate-400">
                    <p>{storeInfo.whatsapp || 'WhatsApp nao configurado'}</p>
                    <p>
                      {storeInfo.tempo_entrega
                        ? `Entrega estimada: ${storeInfo.tempo_entrega}`
                        : 'Tempo de entrega configuravel no painel admin'}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-sm font-black uppercase italic tracking-[0.22em] text-gray-800 dark:text-white">
                    Assinatura
                  </h4>
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-400">
                      Plataforma fornecida por
                    </span>
                    <span className="w-fit rounded-xl bg-gray-950 px-3 py-2 text-[11px] font-black tracking-[0.18em] text-white">
                      STITCH SOLUTIONS
                    </span>
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-8 text-center text-[10px] font-bold uppercase tracking-[0.28em] text-gray-400 dark:border-slate-800 lg:text-left">
                2026 {storeInfo.nome_loja} - Todos os direitos reservados.
              </div>
            </div>
          </footer>
        )}

        {cart.length > 0 && (
          <button
            onClick={() => setIsCartOpen(true)}
            className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 font-bold text-white shadow-lg animate-bounce lg:hidden"
          >
            <ShoppingBag className="h-5 w-5" />
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
            onNavigateToOrders={() => {
              setIsCartOpen(false);
              setCurrentView('orders');
            }}
            onStartCheckout={handleStartCheckout}
          />
        </div>

        <StoreInfoModal
          isOpen={isStoreInfoOpen}
          onClose={() => setIsStoreInfoOpen(false)}
          storeInfo={storeInfo}
        />

        <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-20 items-center justify-around border-t border-gray-100 bg-white transition-colors dark:border-slate-800 dark:bg-slate-900 lg:hidden">
          <button
            onClick={() => setCurrentView('home')}
            className={`flex h-full flex-1 flex-col items-center justify-center gap-1 ${
              currentView === 'home' ? 'text-emerald-600' : 'text-gray-400'
            }`}
          >
            <HomeIcon className={cn('h-5 w-5', currentView === 'home' && 'fill-current')} />
            <span className="text-[9px] font-black uppercase tracking-wider">Inicio</span>
          </button>
          <button
            onClick={() => setCurrentView('home')}
            className={`flex h-full flex-1 flex-col items-center justify-center gap-1 ${
              currentView === 'promocoes' ? 'text-emerald-600' : 'text-gray-400'
            }`}
          >
            <Star className="h-5 w-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Promocoes</span>
          </button>
          <button
            onClick={() => setCurrentView('orders')}
            className={`flex h-full flex-1 flex-col items-center justify-center gap-1 ${
              currentView === 'orders' ? 'text-emerald-600' : 'text-gray-400'
            }`}
          >
            <ShoppingBag className="h-5 w-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Pedidos</span>
          </button>
          <button
            onClick={() => {
              if (user) setIsProfileMenuOpen(!isProfileMenuOpen);
              else setIsLoginModalOpen(true);
            }}
            className={`flex h-full flex-1 flex-col items-center justify-center gap-1 ${
              isProfileMenuOpen ? 'text-emerald-600' : 'text-gray-400'
            }`}
          >
            <User className="h-5 w-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">
              {user ? 'Minha conta' : 'Entrar'}
            </span>
          </button>
        </nav>

        {isProfileMenuOpen && user && (
          <>
            <div
              className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-sm lg:hidden"
              onClick={() => setIsProfileMenuOpen(false)}
            />
            <div className="fixed bottom-[72px] right-2 z-[9999] w-[calc(100vw-16px)] max-w-[320px] animate-in slide-in-from-bottom-2 rounded-xl border border-gray-100 bg-white py-2 shadow-[0_5px_40px_-10px_rgba(0,0,0,0.2)] duration-300 sm:w-64 lg:hidden">
              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  if (sessionStorage.getItem('stitch_sensitive_auth_validated') === 'true') {
                    setActiveModal('editProfile');
                  } else {
                    setAuthTarget('editProfile');
                  }
                }}
                className="w-full border-b border-gray-50 px-5 py-4 text-left text-[14px] font-bold text-gray-600 transition-colors hover:bg-gray-50"
              >
                Editar perfil
              </button>
              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  if (sessionStorage.getItem('stitch_sensitive_auth_validated') === 'true') {
                    setActiveModal('changePassword');
                  } else {
                    setAuthTarget('changePassword');
                  }
                }}
                className="w-full border-b border-gray-50 px-5 py-4 text-left text-[14px] font-bold text-gray-600 transition-colors hover:bg-gray-50"
              >
                Trocar senha
              </button>
              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  if (sessionStorage.getItem('stitch_sensitive_auth_validated') === 'true') {
                    setActiveModal('loyalty');
                  } else {
                    setAuthTarget('loyalty');
                  }
                }}
                className="w-full border-b border-gray-50 px-5 py-4 text-left text-[14px] font-bold text-gray-600 transition-colors hover:bg-gray-50"
              >
                Programa de fidelidade
              </button>
              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  localStorage.removeItem('stitch_token');
                  sessionStorage.removeItem('stitch_sensitive_auth_validated');
                  window.location.reload();
                }}
                className="w-full px-5 py-4 text-left text-[14px] font-bold text-gray-600 transition-colors hover:bg-gray-50"
              >
                Sair
              </button>
            </div>
          </>
        )}

        <ProductModal
          product={editingItemInfo?.product}
          isOpen={!!editingItemInfo}
          onClose={() => setEditingItemInfo(null)}
          onAddToCart={handleUpdateItem}
          initialData={editingItemInfo?.item}
        />

        <PhoneAuthModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onLoginSuccess={(u) => {
            setUser(u);
            setIsLoginModalOpen(false);
            if (activeModal === 'pendingCheckout') {
              setIsCheckoutOpen(true);
              setActiveModal(null);
            }
          }}
        />

        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          user={user}
          cart={cart}
          storeConfig={cartDrawerDataForCheckout?.storeConfig}
          finalShippingFee={cartDrawerDataForCheckout?.finalShippingFee}
          deliveryMethod={cartDrawerDataForCheckout?.deliveryMethod}
          address={cartDrawerDataForCheckout?.address}
          subtotal={cartDrawerDataForCheckout?.subtotal}
          appliedCoupon={cartDrawerDataForCheckout?.appliedCoupon}
          onOrderSuccess={(id) => {
            setTrackingOrderId(id);
            setCurrentView('tracking');
            setIsCartOpen(false);
          }}
        />

        <PasswordAuthModal
          isOpen={!!authTarget}
          onClose={() => setAuthTarget(null)}
          onSuccess={() => {
            setActiveModal(authTarget);
            setAuthTarget(null);
          }}
          userName={user?.nome}
        />

        <ProfileEditModal
          isOpen={activeModal === 'editProfile'}
          onClose={() => setActiveModal(null)}
          user={user}
          onUpdateUser={setUser}
        />
        <ChangePasswordModal
          isOpen={activeModal === 'changePassword'}
          onClose={() => setActiveModal(null)}
        />
        <LoyaltyModal
          isOpen={activeModal === 'loyalty'}
          onClose={() => setActiveModal(null)}
          user={user}
        />
      </div>
    </ToastProvider>
  );
}




