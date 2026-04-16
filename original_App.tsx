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
  Phone,
  Receipt,
  Search,
  ShoppingBag,
  Star,
  Store,
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
  // dark mode removido
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
  const isLoyaltyActive = storeInfo?.fidelidade_ativa === true;

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

  // dark mode effect removido

  const [homeBlocks, setHomeBlocks] = useState([]);

  useEffect(() => {
    const fetchAppCore = async () => {
      try {
        const [storeRes, catRes, prodRes, blocksRes] = await Promise.allSettled([
          fetch('/api/configuracoes/publica').then(r => r.json()),
          fetch('/api/categorias').then(r => r.json()),
          fetch('/api/produtos').then(r => r.json()),
          fetch('/api/blocos_home').then(r => r.json())
        ]);

        // Processa Configs
        if (storeRes.status === 'fulfilled' && storeRes.value?.sucesso !== false) {
          const data = storeRes.value;
          setStoreInfo({
            ...data,
            is_open: data.is_open !== false,
            tempo_entrega: data.tempo_entrega || '45 min',
          });
          document.title = data.nome_loja || 'Stitch Delivery';
          if (data.banner_ativo) setBanner({ ativo: true, texto: data.banner_texto });
        } else {
          setStoreInfo(prev => ({ ...prev, nome_loja: 'Sistema indispon├¡vel' }));
        }

        // Processa Categorias
        if (catRes.status === 'fulfilled' && Array.isArray(catRes.value)) {
          setCategories(catRes.value);
        }

        // Processa Produtos
        if (prodRes.status === 'fulfilled' && Array.isArray(prodRes.value)) {
          setProducts(prodRes.value);
        }
        
        // Processa Blocos Home
        if (blocksRes.status === 'fulfilled' && blocksRes.value?.sucesso) {
          setHomeBlocks(blocksRes.value.blocos || []);
        }

      } catch (err) {
        console.error('Fatal erro orchestration App:', err);
      } finally {
        setIsConfigLoaded(true); // O loading da UX inteira some apenas aqui
      }
    };

    fetchAppCore();
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

  useEffect(() => {
    if (isConfigLoaded && !isLoyaltyActive) {
      setActiveModal((prev) => (prev === 'loyalty' ? null : prev));
      setAuthTarget((prev) => (prev === 'loyalty' ? null : prev));
      setCart((prev) => {
        let hasChanges = false;
        const sanitized = prev.map((item) => {
          if (item?.is_resgate) {
            hasChanges = true;
            return { ...item, is_resgate: false };
          }
          return item;
        });
        return hasChanges ? sanitized : prev;
      });
    }
  }, [isConfigLoaded, isLoyaltyActive]);

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
      <div className="relative min-h-screen overflow-x-hidden bg-[#f6f7f2] pb-24 font-sans lg:pb-0">

        {/* ===== DESKTOP HEADER ===== */}
        <nav className="relative z-40 hidden h-[62px] w-full items-center justify-center border-b border-emerald-700/40 bg-emerald-600 shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)] lg:flex">
          <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[1fr_auto_1fr] items-center px-5 xl:px-6">
            <div />

            {/* Left nav items */}
            <div className="flex items-center justify-center gap-2 justify-self-center">
              <button onClick={() => setCurrentView('home')} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-extrabold transition-all ${currentView === 'home' ? 'bg-white text-emerald-700 shadow-[0_10px_24px_rgba(15,23,42,0.12)]' : 'text-emerald-50 hover:bg-white/15'}`}>
                <HomeIcon className="w-4 h-4" />
                In├¡cio
              </button>
              <button onClick={() => setCurrentView('home')} className="flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-extrabold text-emerald-50 transition-all hover:bg-white/15">
                <Star className="w-4 h-4" />
                Promo├º├Áes
              </button>
              <button onClick={() => setCurrentView('orders')} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-extrabold transition-all ${currentView === 'orders' ? 'bg-white text-emerald-700 shadow-[0_10px_24px_rgba(15,23,42,0.12)]' : 'text-emerald-50 hover:bg-white/15'}`}>
                <ShoppingBag className="w-4 h-4" />
                Pedidos
              </button>
            </div>
            {/* Right: user */}
            <div className="relative justify-self-end">
              <button onClick={() => { if (user) setIsProfileMenuOpen(!isProfileMenuOpen); else setIsLoginModalOpen(true); }} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-extrabold transition-all ${isProfileMenuOpen ? 'bg-white text-emerald-700 shadow-[0_10px_24px_rgba(15,23,42,0.12)]' : 'text-emerald-50 hover:bg-white/15'}`}>
                <User className="w-4 h-4" />
                {user ? (user.nome === 'Visitante' ? 'Minha conta' : user.nome.split(' ')[0]) : 'Entrar/Cadastrar'}
              </button>
              {isProfileMenuOpen && user && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsProfileMenuOpen(false)}></div>
                  <div className="absolute top-[calc(100%+8px)] right-0 w-56 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                    <button onClick={() => { setIsProfileMenuOpen(false); if(sessionStorage.getItem('stitch_sensitive_auth_validated') === 'true') setActiveModal('editProfile'); else setAuthTarget('editProfile'); }} className="w-full text-left px-5 py-3 text-[14px] text-gray-700 font-medium hover:bg-gray-50 transition-colors">Editar perfil</button>
                    <button onClick={() => { setIsProfileMenuOpen(false); if(sessionStorage.getItem('stitch_sensitive_auth_validated') === 'true') setActiveModal('changePassword'); else setAuthTarget('changePassword'); }} className="w-full text-left px-5 py-3 text-[14px] text-gray-700 font-medium hover:bg-gray-50 transition-colors">Trocar senha</button>
                    {isLoyaltyActive && (
                      <button onClick={() => { setIsProfileMenuOpen(false); if(sessionStorage.getItem('stitch_sensitive_auth_validated') === 'true') setActiveModal('loyalty'); else setAuthTarget('loyalty'); }} className="w-full text-left px-5 py-3 text-[14px] text-gray-700 font-medium hover:bg-gray-50 transition-colors">Programa de fidelidade</button>
                    )}
                    <div className="h-px bg-gray-100 my-1 mx-3"></div>
                    <button onClick={() => { setIsProfileMenuOpen(false); localStorage.removeItem('stitch_token'); sessionStorage.removeItem('stitch_sensitive_auth_validated'); window.location.reload(); }} className="w-full text-left px-5 py-3 text-[14px] text-red-500 font-medium hover:bg-red-50 transition-colors">Sair</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </nav>

        <div
          className={`fixed left-0 right-0 top-0 z-50 h-16 transform border-b border-gray-100 bg-white shadow-md transition-all duration-300 lg:hidden ${
            isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex h-full w-full items-center gap-3 px-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-gray-100">
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
                className="h-11 w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 text-[13px] font-black uppercase tracking-tighter text-gray-700 shadow-sm outline-none"
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
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-100 bg-white text-gray-400 shadow-sm"
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ===== DESKTOP STICKY HEADER (on scroll) ===== */}
        <div
          className={`fixed left-0 right-0 top-0 z-50 hidden h-[58px] transform border-b border-gray-100 bg-white shadow-sm transition-all duration-300 lg:flex ${
            isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          <div className="mx-auto flex w-full max-w-[1100px] items-center gap-4 px-5 xl:px-6">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-gray-100">
              {storeInfo.logo_url ? (
                <img src={storeInfo.logo_url} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-emerald-600">
                  <Store className="h-5 w-5 text-white" />
                </div>
              )}
            </div>

            <div className="w-[212px] shrink-0">
              <select
                value={activeCategory}
                onChange={(e) => scrollToCategory(e.target.value)}
                className="h-9.5 w-full cursor-pointer appearance-none rounded-[11px] border border-gray-200 bg-white px-3.5 text-[12px] font-medium text-gray-700 outline-none focus:border-emerald-500 hover:border-gray-300 transition-colors"
                style={{
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
                  backgroundPosition: 'right 1rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1rem',
                }}
              >
                <option value="all">Lista de categorias</option>
                {visibleCategories.map((c) => (
                  <option key={c._id || c.id} value={c._id || c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Busque por um produto"
                className="h-9.5 w-full rounded-[11px] border border-gray-200 bg-white pl-10 pr-4 text-[12px] font-medium text-gray-700 outline-none placeholder:text-gray-400 focus:border-emerald-500 hover:border-gray-300 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1 border-l border-gray-200 pl-3">
              <button onClick={() => { setCurrentView('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={`p-2.5 rounded-xl transition-all ${currentView === 'home' ? 'bg-emerald-50 text-emerald-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                <HomeIcon className="h-[18px] w-[18px]" />
              </button>
              <button onClick={() => setCurrentView('orders')} className={`p-2.5 rounded-xl transition-all ${currentView === 'orders' ? 'bg-emerald-50 text-emerald-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                <Receipt className="h-[18px] w-[18px]" />
              </button>
              <button onClick={() => { if (user) setIsProfileMenuOpen(!isProfileMenuOpen); else setIsLoginModalOpen(true); }} className={`p-2.5 rounded-xl transition-all ${isProfileMenuOpen ? 'bg-emerald-50 text-emerald-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                <User className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </div>

        {/* ===== HERO SECTION ===== */}
        {currentView === 'home' && (
          <header className="relative z-30 pb-4 lg:pb-7">
            <div className="absolute inset-x-0 top-0 hidden h-[194px] bg-emerald-600 lg:block" />
            <div className="mx-auto max-w-[1100px] px-0 lg:px-5 lg:pt-4">

              <div className="relative lg:rounded-[24px] lg:bg-white/70 lg:p-1.5 lg:shadow-[0_16px_42px_rgba(15,23,42,0.11)]">
                {/* Cover image (More protagonist) */}
                <div className="relative h-52 w-full overflow-hidden bg-gray-200 ring-1 ring-black/5 md:h-60 lg:h-[256px] xl:h-[278px] lg:rounded-[19px] lg:border lg:border-white/70">
                  {storeInfo.capa_url ? (
                    <img src={storeInfo.capa_url} alt="Capa" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#059669,#10b981)]">
                      <Store className="h-14 w-14 text-white/80" />
                    </div>
                  )}
                  {/* Mobile buttons only */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent lg:hidden" />
                  <div className="absolute right-4 top-4 z-40 flex gap-2 lg:hidden">
                    <button onClick={() => setIsCartOpen(true)} className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-white backdrop-blur-sm">
                      <ShoppingBag className="h-4 w-4" />
                      <span className="text-sm font-bold">{cart.reduce((acc, item) => acc + item.quantidade, 0)}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Info row: logo + store info + loyalty card */}
              <div className="relative z-10 -mt-9 px-4 lg:-mt-12 lg:px-5">
                <div className={cn('grid gap-3.5 lg:items-start', isLoyaltyActive ? 'lg:grid-cols-[minmax(0,1fr)_280px]' : 'lg:grid-cols-1')}>

                  {/* Left: Logo + Info */}
                  <div className="min-w-0 rounded-[20px] border border-[#e3e8dd] bg-white px-4 pb-4 pt-4 shadow-[0_14px_28px_rgba(15,23,42,0.07)] sm:px-5 sm:pb-4 sm:pt-4 lg:px-5 lg:pb-5 lg:pt-4">
                    <div className="flex min-w-0 flex-col gap-3.5 md:flex-row md:items-end md:gap-4">
                    {/* Floating logo (Larger and evident overlap) */}
                    <div className="z-20 h-[86px] w-[86px] shrink-0 overflow-hidden rounded-[20px] border-[4px] border-white bg-white shadow-[0_12px_24px_rgba(15,23,42,0.11)] md:-mt-10 md:h-[104px] md:w-[104px] lg:-mt-12 lg:h-[116px] lg:w-[116px]">
                      {storeInfo.logo_url ? (
                        <img src={storeInfo.logo_url} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                          <Store className="w-10 h-10 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* Store name + tagline + status line */}
                    <div className="min-w-0 flex-1 pb-1 md:pb-1.5">
                      <h1 className="flex flex-wrap items-baseline gap-2 text-[23px] font-black leading-none tracking-tight text-gray-950 md:text-[30px]">
                        <span>{storeInfo.nome_loja}</span>
                        {storeInfo.tagline && (
                          <span className="relative top-[-1px] text-[12px] font-medium text-gray-400 md:text-[14px]">
                            <span className="opacity-40 font-light pr-1">|</span> {storeInfo.tagline}
                          </span>
                        )}
                      </h1>
                      
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] font-medium text-gray-500">
                        <span className={storeInfo.is_open ? 'font-bold text-emerald-600' : 'font-bold text-red-500'}>
                          {storeInfo.is_open ? 'Aberto agora' : 'Fechado'}
                        </span>
                        
                        {storeInfo.is_open && storeInfo.tempo_entrega && (
                          <>
                            <span className="text-gray-300">ÔÇó</span>
                            <span className="text-gray-600">{storeInfo.tempo_entrega}</span>
                          </>
                        )}
                        
                        {storeInfo.cidade_loja && (
                          <>
                            <span className="text-gray-300">ÔÇó</span>
                            <span className="flex items-center gap-1.5 text-gray-600">
                              <MapPin className="h-[13px] w-[13px] text-gray-400" />
                              {storeInfo.cidade_loja}{storeInfo.estado_loja ? ` - ${storeInfo.estado_loja}` : ''}
                            </span>
                          </>
                        )}
                        
                        <span className="text-gray-300">ÔÇó</span>
                        <button onClick={() => setIsStoreInfoOpen(true)} className="font-bold text-emerald-600 transition-colors hover:text-emerald-700">
                          Mais informa├º├Áes
                        </button>
                      </div>
                    </div>
                    </div>
                  </div>

                  {/* Right: Loyalty card (Better hierarchy and alignment) */}
                  {isLoyaltyActive && (
                    <div className="z-20 w-full shrink-0">
                      <div className="flex items-start gap-3 rounded-[20px] border border-[#e3e8dd] bg-white p-4 shadow-[0_14px_28px_rgba(15,23,42,0.07)] lg:p-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shadow-inner">
                          <Gift className="w-[18px] h-[18px]" />
                        </div>
                        <div className="pt-0.5">
                          <h4 className="text-[12px] font-bold text-gray-950">Programa de fidelidade</h4>
                          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                            A cada R$ 1,00 em compras voc├¬ ganha {storeInfo.pontos_por_real || 1} ponto{(storeInfo.pontos_por_real || 1) > 1 ? 's' : ''} para trocar por pr├¬mios.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>
        )}

        <main className="relative mx-auto mt-2.5 max-w-[1100px] px-4 pb-10 lg:px-5 lg:pb-14">
          <div className="flex flex-col items-start gap-5 lg:flex-row lg:gap-4">
            <div className="flex-1">
              {currentView === 'home' && (
                <Home
                  onAddToCart={handleAddToCart}
                  isScrolled={isScrolled}
                  storeInfo={storeInfo}
                  isLoyaltyActive={isLoyaltyActive}
                  currentView={currentView}
                  setCurrentView={setCurrentView}
                  activeCategory={activeCategory}
                  setActiveCategory={scrollToCategory}
                  categories={categories}
                  products={products}
                  homeBlocks={homeBlocks}
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
                    <div className="mb-6 flex items-center border-b border-gray-200 pb-4 sm:mb-8">
                      <h1 className="text-2xl font-bold tracking-tight text-[#4e4e4e] sm:text-[28px]">
                        Seus pedidos
                      </h1>
                    </div>

                    <div className="mb-12 mt-10 flex justify-center">
                      <div className="w-full max-w-[400px] rounded border border-gray-100 bg-white p-8 text-center shadow-[0_4px_20px_-5px_rgba(0,0,0,0.1)]">
                        <h2 className="mb-3 text-lg font-bold tracking-tight text-[#444]">
                          Identifique-se
                        </h2>
                        <p className="mb-6 px-1 text-[13px] font-medium leading-relaxed text-gray-500">
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
                  isLoyaltyActive={isLoyaltyActive}
                  onNavigateToLogin={() => setIsLoginModalOpen(true)}
                />
              )}

              {!['home', 'orders', 'register', 'tracking'].includes(currentView) && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-4 text-6xl">?</div>
                  <h2 className="text-2xl font-bold uppercase tracking-tighter text-gray-800">
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
              <div className="hidden w-[276px] shrink-0 xl:w-[282px] lg:block">
                <div
                  className={cn(
                    'sticky h-fit transition-all duration-300',
                    isScrolled ? 'top-[66px] max-h-[calc(100vh-78px)]' : 'top-2 max-h-[calc(100vh-18px)]'
                  )}
                >
                  <div className="flex-1 overflow-visible">
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
          <footer className="mt-14 bg-emerald-600 px-6 pb-16 pt-10 text-white lg:pb-12">
            <div className="mx-auto max-w-[1100px]">
              <div className="mb-7 grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr_auto] lg:gap-8">
                <div className="space-y-3">
                  <h4 className="text-sm font-black uppercase italic tracking-[0.22em] text-white">
                    {storeInfo.nome_loja}
                  </h4>
                  <p className="max-w-sm text-[13px] leading-6 text-emerald-50/85">
                    {storeInfo.sobre_texto || 'O sabor que voce ama, no conforto da sua casa.'}
                  </p>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-black uppercase italic tracking-[0.22em] text-white">
                    Onde estamos
                  </h4>
                  <div className="text-[13px] leading-6 text-emerald-50/85">
                    {storeInfo.rua_loja}, {storeInfo.numero_loja} - {storeInfo.bairro_loja}
                    <br />
                    {storeInfo.cidade_loja}
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-black uppercase italic tracking-[0.22em] text-white">
                    Contato
                  </h4>
                  <div className="space-y-1.5 text-[13px] leading-6 text-emerald-50/85">
                    <p>{storeInfo.whatsapp || 'WhatsApp nao configurado'}</p>
                    <p>
                      {storeInfo.tempo_entrega
                        ? `Entrega estimada: ${storeInfo.tempo_entrega}`
                        : 'Tempo de entrega configuravel no painel admin'}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-black uppercase italic tracking-[0.22em] text-white">
                    Assinatura
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/70">
                      Plataforma fornecida por
                    </span>
                    <span className="w-fit rounded-xl bg-white px-3 py-2 text-[11px] font-black tracking-[0.18em] text-emerald-700">
                      STITCH SOLUTIONS
                    </span>
                  </div>
                </div>
              </div>
              <div className="border-t border-white/15 pt-6 text-center text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-100/70 lg:text-left">
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

        <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-20 items-center justify-around border-t border-gray-100 bg-white transition-colors lg:hidden">
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
              {isLoyaltyActive && (
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
              )}
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
          isLoyaltyActive={isLoyaltyActive}
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
          isLoyaltyActive={isLoyaltyActive}
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
          isLoyaltyActive={isLoyaltyActive}
        />
      </div>
    </ToastProvider>
  );
}




