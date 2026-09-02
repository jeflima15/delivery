import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn, getStoreStatus } from './lib/utils';
import { applyStoreTheme, DEFAULT_STORE_THEME } from './lib/theme';
import {
  Gift,
  Home as HomeIcon,
  MapPin,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  User,
} from 'lucide-react';
import { ToastProvider } from './components/Toast';
import { customerApi } from './features/customer/api';
import { useCustomerSession } from './features/customer/useCustomerSession';
import CategoryDropdown from './components/CategoryDropdown';
import Home from './components/Home';
import CartDrawer from './components/CartDrawer';
import { cartConfigurationKey, isComboProduct } from './lib/combo';
import { loadProductDetails, mergeProductDetails } from './lib/productDetails';
import { computeIsStoreOpen } from './lib/storeUtils';
import type { CartItem, Category, HomeBlock, Product } from './types/storefront';

function isStoredCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CartItem>;
  return typeof item.produtoId === 'string'
    && typeof item.nome === 'string'
    && typeof item.preco_unitario === 'number'
    && typeof item.quantidade === 'number'
    && typeof item.subtotal === 'number';
}

const CentralMerchantLogin = React.lazy(() => import('./components/CentralMerchantLogin'));
const PhoneAuthModal = React.lazy(() => import('./components/PhoneAuthModal'));
const Orders = React.lazy(() => import('./components/Orders'));
const StoreInfoModal = React.lazy(() => import('./components/StoreInfoModal'));
const OrderTracking = React.lazy(() => import('./components/OrderTracking'));
const loadProductModal = () => import('./components/ProductModal');
const loadComboModal = () => import('./components/ComboModal');
const ProductModal = React.lazy(loadProductModal);
const ComboModal = React.lazy(loadComboModal);
const ProfileEditModal = React.lazy(() => import('./components/ProfileEditModal'));
const ConfirmPasswordModal = React.lazy(() => import('./components/ConfirmPasswordModal'));
const ChangePasswordModal = React.lazy(() => import('./components/ChangePasswordModal'));
const LoyaltyModal = React.lazy(() => import('./components/LoyaltyModal'));
const AddressBookModal = React.lazy(() => import('./components/AddressBookModal'));
const CheckoutModal = React.lazy(() => import('./components/CheckoutModal'));
const SearchOverlayModal = React.lazy(() => import('./components/SearchOverlayModal'));
const PromotionsModal = React.lazy(() => import('./components/PromotionsModal'));
const AcceptInvitation = React.lazy(() => import('./components/AcceptInvitation'));
const ResetAdminPassword = React.lazy(() => import('./components/ResetAdminPassword'));
const CustomerResetPassword = React.lazy(() => import('./components/CustomerResetPassword'));
const TenantAdminDashboard = React.lazy(() => import('./components/TenantAdminDashboard'));
const MasterDashboard = React.lazy(() => import('./components/MasterDashboard'));
const PlatformLanding = React.lazy(() => import('./components/landing/PlatformLanding'));

function StorefrontSkeleton() {
  return (
    <div className="min-h-screen animate-pulse bg-[#f6f7f2]" aria-label="Carregando cardapio" role="status">
      <div className="hidden h-16 bg-gray-200 lg:block" />
      <div className="mx-auto max-w-[1280px] px-3 sm:px-5">
        <div className="h-44 rounded-b-2xl bg-gray-200 sm:h-64" />
        <div className="-mt-10 flex items-end gap-4 px-3">
          <div className="h-24 w-24 rounded-2xl border-4 border-white bg-gray-300 sm:h-32 sm:w-32" />
          <div className="mb-3 flex-1 space-y-3">
            <div className="h-7 w-52 max-w-full rounded bg-gray-300" />
            <div className="h-4 w-40 rounded bg-gray-200" />
          </div>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-7 flex justify-between gap-3">
              <div className="h-11 w-52 rounded-lg bg-gray-200" />
              <div className="h-11 w-12 rounded-lg bg-gray-200 sm:w-72" />
            </div>
            <div className="h-7 w-48 rounded bg-gray-300" />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {[0, 1, 2, 3].map((item) => <div key={item} className="h-36 rounded-xl border border-gray-200 bg-white" />)}
            </div>
          </div>
          <div className="hidden h-72 rounded-xl border border-gray-200 bg-white lg:block" />
        </div>
      </div>
    </div>
  );
}

function StorefrontApp({ tenantSlug }: { tenantSlug: string }) {
  const cartStorageKey = `cart:${tenantSlug}`;
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(cartStorageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed.filter(isStoredCartItem) : [];
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
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [storeNotFound, setStoreNotFound] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [cartDrawerDataForCheckout, setCartDrawerDataForCheckout] = useState<any>(null);

  const [currentView, setCurrentView] = useState('home');
  const customerSession = useCustomerSession(tenantSlug, isConfigLoaded);
  const { user, setUser, passwordVerified: isPasswordVerified, setPasswordVerified: setIsPasswordVerified } = customerSession;
  const [isConfirmPasswordModalOpen, setIsConfirmPasswordModalOpen] = useState(false);
  const [pendingProtectedAction, setPendingProtectedAction] = useState<'editProfile' | 'changePassword' | 'orders' | 'addresses' | 'loyalty' | null>(null);

  useEffect(() => {
    if (!user) {
      setIsPasswordVerified(false);
    }
  }, [user]);

  const handleOpenEditProfile = () => {
    setIsProfileMenuOpen(false);
    if (isPasswordVerified) {
      setActiveModal('editProfile');
    } else {
      setPendingProtectedAction('editProfile');
      setIsConfirmPasswordModalOpen(true);
    }
  };

  const handleOpenChangePassword = () => {
    setIsProfileMenuOpen(false);
    if (isPasswordVerified) {
      setActiveModal('changePassword');
    } else {
      setPendingProtectedAction('changePassword');
      setIsConfirmPasswordModalOpen(true);
    }
  };

  const openProtectedArea = (action: 'addresses' | 'loyalty') => {
    setIsProfileMenuOpen(false);
    if (isPasswordVerified) setActiveModal(action);
    else {
      setPendingProtectedAction(action);
      setIsConfirmPasswordModalOpen(true);
    }
  };

  const handlePasswordVerifiedSuccess = () => {
    setIsPasswordVerified(true);
    setIsConfirmPasswordModalOpen(false);
    const action = pendingProtectedAction;
    setPendingProtectedAction(null);
    if (action === 'editProfile') setActiveModal('editProfile');
    if (action === 'changePassword') setActiveModal('changePassword');
    if (action === 'orders') setCurrentView('orders');
    if (action === 'addresses') setActiveModal('addresses');
    if (action === 'loyalty') setActiveModal('loyalty');
  };

  const [trackingOrder, setTrackingOrder] = useState<{ orderId: string; trackingToken: string } | null>(null);
  // dark mode removido
  const [storeInfo, setStoreInfo] = useState<any>({
    nome_loja: '',
    logo_url: '',
    capa_url: '',
    is_open: true,
    tempo_entrega: '',
    whatsapp: '',
    theme: DEFAULT_STORE_THEME,
  });
  const isStoreOpen = computeIsStoreOpen(storeInfo);
  const storeInfoLive = React.useMemo(() => ({ ...storeInfo, is_open: isStoreOpen }), [storeInfo, isStoreOpen]);
  const [banner, setBanner] = useState({ ativo: false, texto: '' });
  const [isScrolled, setIsScrolled] = useState(false);
  const isLoyaltyActive = storeInfo?.fidelidade_ativa === true;

  const [activeCategory, setActiveCategory] = useState('all');
  const activeCategoryRef = useRef('all');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingItemInfo, setEditingItemInfo] = useState<{ product: Product; item: CartItem; index: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchSelectedProduct, setSearchSelectedProduct] = useState<Product | null>(null);
  const [isPromotionsModalOpen, setIsPromotionsModalOpen] = useState(false);
  const [promoSelectedProduct, setPromoSelectedProduct] = useState<Product | null>(null);
  const [modalProducts, setModalProducts] = useState<Product[]>([]);
  const [isProductDetailsLoading, setIsProductDetailsLoading] = useState(false);
  const [productDetailsError, setProductDetailsError] = useState('');
  const sidebarColumnRef = useRef<HTMLDivElement | null>(null);
  const cartAnchorRef = useRef<HTMLDivElement | null>(null);
  const cartStickyRef = useRef<HTMLElement | null>(null);
  const mobileCartScrollLockRef = useRef<{
    scrollY: number;
    bodyPosition: string;
    bodyTop: string;
    bodyLeft: string;
    bodyRight: string;
    bodyWidth: string;
    bodyOverflow: string;
    htmlOverflow: string;
  } | null>(null);
  const [desktopCartStyle, setDesktopCartStyle] = useState<Record<string, string | number>>({});
  const [desktopCartHeight, setDesktopCartHeight] = useState(0);
  const [isDesktopCartFloating, setIsDesktopCartFloating] = useState(false);

  // Manipulação de Hash para Promoções
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#promocoes') {
        setIsPromotionsModalOpen(true);
      } else {
        setIsPromotionsModalOpen(false);
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useLayoutEffect(() => {
    const isMobileViewport = window.matchMedia('(max-width: 1023px)').matches;

    if (!isCartOpen || !isMobileViewport) {
      return;
    }

    const scrollY = window.scrollY || window.pageYOffset || 0;
    const { body, documentElement } = document;

    mobileCartScrollLockRef.current = {
      scrollY,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      htmlOverflow: documentElement.style.overflow,
    };

    documentElement.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      const lock = mobileCartScrollLockRef.current;
      if (!lock) return;

      body.style.position = lock.bodyPosition;
      body.style.top = lock.bodyTop;
      body.style.left = lock.bodyLeft;
      body.style.right = lock.bodyRight;
      body.style.width = lock.bodyWidth;
      body.style.overflow = lock.bodyOverflow;
      documentElement.style.overflow = lock.htmlOverflow;
      mobileCartScrollLockRef.current = null;

      window.scrollTo(0, lock.scrollY);
    };
  }, [isCartOpen]);

  useEffect(() => {
    const handleScroll = () => {
      const originalMenu = document.getElementById('main-search-menu-original');
      if (originalMenu) {
        const rect = originalMenu.getBoundingClientRect();
        // O sticky so aparece quando o menu original some completamente da vista (topo da tela)
        setIsScrolled(rect.bottom <= 0);
      } else {
        setIsScrolled(window.scrollY > 400);
      }

      const categorySections = document.querySelectorAll('[id^="categoria-"]');
      let current = 'all';

      categorySections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= 170 && rect.bottom > 80) {
          current = section.id.replace('categoria-', '');
        }
      });

      if (activeCategoryRef.current !== current) {
        activeCategoryRef.current = current;
        setActiveCategory(current);
      }
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // dark mode effect removido

  const [homeBlocks, setHomeBlocks] = useState<HomeBlock[]>([]);

  useEffect(() => {
    applyStoreTheme(DEFAULT_STORE_THEME);
  }, []);

  useEffect(() => {
    const fetchAppCore = async () => {
      try {
        if (!tenantSlug) throw new Error('Loja nao informada');
        const response = await fetch(`/api/public/stores/${encodeURIComponent(tenantSlug)}/store`);
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload?.error?.message || 'Loja indisponivel');
        const resolvedTheme = applyStoreTheme(payload.settings?.theme);
        const settings = payload.settings || {};
        setStoreInfo({ ...settings, theme: resolvedTheme, is_open: settings.is_open !== false, tempo_entrega: settings.tempo_entrega || '45 min' });
        setBanner({ ativo: settings.banner_ativo === true, texto: settings.banner_texto || '' });
        setCategories(payload.categories || []);
        setProducts(payload.products || []);
        setHomeBlocks(payload.blocks || []);
        document.title = settings.nome_loja ? `${settings.nome_loja} | Pode Vir` : 'Pode Vir';

      } catch (err) {
        console.error('Fatal erro orchestration App:', err);
        setStoreNotFound(true);
        applyStoreTheme(DEFAULT_STORE_THEME);
      } finally {
        setIsConfigLoaded(true); // O loading da UX inteira some apenas aqui
      }
    };

    fetchAppCore();
  }, [tenantSlug]);

  useEffect(() => {
    localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  }, [cart, cartStorageKey]);

  useLayoutEffect(() => {
    let rafId = 0;

    const resetDesktopCart = () => {
      setDesktopCartStyle({});
      setDesktopCartHeight(0);
      setIsDesktopCartFloating(false);
    };

    const updateDesktopCartPosition = () => {
      if (window.innerWidth < 1024 || currentView !== 'home') {
        resetDesktopCart();
        return;
      }

      const sidebarColumn = sidebarColumnRef.current;
      const cartAnchor = cartAnchorRef.current;
      const cartSticky = cartStickyRef.current;

      if (!sidebarColumn || !cartAnchor || !cartSticky) {
        resetDesktopCart();
        return;
      }

      const topOffset = 86;
      const scrollTop = window.scrollY || window.pageYOffset;
      const anchorTop = cartAnchor.getBoundingClientRect().top + scrollTop;
      const columnRect = sidebarColumn.getBoundingClientRect();
      const cartHeight = cartSticky.offsetHeight;
      const shouldFloat = scrollTop + topOffset >= anchorTop;
      const fixedLeft = Math.round(columnRect.left + window.scrollX);
      const fixedWidth = Math.round(sidebarColumn.offsetWidth || columnRect.width);

      if (!shouldFloat) {
        resetDesktopCart();
        return;
      }

      setDesktopCartHeight(cartHeight);
      setIsDesktopCartFloating(true);
      setDesktopCartStyle({
        position: 'fixed',
        top: `${topOffset}px`,
        left: `${fixedLeft}px`,
        width: `${fixedWidth}px`,
        zIndex: 20,
        transform: 'translateZ(0)',
      });
    };

    const scheduleDesktopCartUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateDesktopCartPosition);
    };

    scheduleDesktopCartUpdate();
    window.addEventListener('scroll', scheduleDesktopCartUpdate, { passive: true });
    window.addEventListener('resize', scheduleDesktopCartUpdate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', scheduleDesktopCartUpdate);
      window.removeEventListener('resize', scheduleDesktopCartUpdate);
    };
  }, [currentView, isLoyaltyActive, cart, user, storeInfo?.is_open]);

  useEffect(() => {
    if (isConfigLoaded && !isLoyaltyActive) {
      setActiveModal((prev) => (prev === 'loyalty' ? null : prev));
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

  const handleAddToCart = useCallback((item: CartItem) => {
    setCart((prev) => {
      const nextItem = { ...item, configurationKey: item.configurationKey || cartConfigurationKey(item) };
      const exists = prev.findIndex((candidate) => (candidate.configurationKey || cartConfigurationKey(candidate)) === nextItem.configurationKey);

      if (exists >= 0) {
        const newCart = [...prev];
        newCart[exists] = { ...newCart[exists], quantidade: newCart[exists].quantidade + nextItem.quantidade };
        newCart[exists].subtotal = newCart[exists].preco_unitario * newCart[exists].quantidade;
        return newCart;
      }

      return [...prev, nextItem];
    });
  }, []);

  const handleUpdateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const newCart = [...prev];
      newCart[index].quantidade += delta;
      if (newCart[index].quantidade <= 0) newCart.splice(index, 1);
      else newCart[index].subtotal = newCart[index].preco_unitario * newCart[index].quantidade;
      return newCart;
    });
  };

  const handleClearCart = () => {
    setCart([]);
    localStorage.removeItem(cartStorageKey);
  };

  const handleReorder = (items: CartItem[]) => {
    setCart(items.map((item) => ({ ...item, configurationKey: item.configurationKey || cartConfigurationKey(item) })));
    setCurrentView('home');
    setIsCartOpen(true);
  };

  const resolveProductDetails = useCallback(async (product: Product) => {
    void (isComboProduct(product) ? loadComboModal() : loadProductModal());
    setIsProductDetailsLoading(true);
    setProductDetailsError('');
    try {
      const details = await loadProductDetails(tenantSlug, product);
      const merged = mergeProductDetails(products, details);
      setProducts((current) => mergeProductDetails(current, details));
      setModalProducts(merged);
      return details.product;
    } catch (error) {
      setProductDetailsError(error instanceof Error ? error.message : 'Nao foi possivel carregar o produto');
      return null;
    } finally {
      setIsProductDetailsLoading(false);
    }
  }, [products, tenantSlug]);

  const handleEditItem = async (index: number) => {
    const item = cart[index];
    const product = products.find((p) => (p._id || p.id) === item.produtoId);
    if (!product) return;
    const detailedProduct = await resolveProductDetails(product);
    if (detailedProduct) setEditingItemInfo({ product: detailedProduct, item, index });
  };

  const handleUpdateItem = (newItem: CartItem) => {
    setCart((prev) => {
      const newCart = [...prev];
      if (editingItemInfo) {
        newCart[editingItemInfo.index] = {
          ...newItem,
          produtoId: String(editingItemInfo.product._id || editingItemInfo.product.id),
          configurationKey: cartConfigurationKey(newItem),
        };
      }
      return newCart;
    });
    setEditingItemInfo(null);
  };

  const scrollToCategory = (val: string) => {
    activeCategoryRef.current = val;
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

  const openCustomerAccess = (intent = null) => {
    customerSession.begin(intent);
    setIsLoginModalOpen(true);
  };

  const navigateToOrders = () => {
    if (!user) return openCustomerAccess('orders');
    if (isPasswordVerified) setCurrentView('orders');
    else {
      setPendingProtectedAction('orders');
      setIsConfirmPasswordModalOpen(true);
    }
  };

  const handleStartCheckout = (data) => {
    setCartDrawerDataForCheckout(data);
    if (!user) {
      openCustomerAccess('checkout');
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
  const mobileCartItemCount = cart.reduce((total, item) => total + Number(item?.quantidade || 0), 0);
  const mobileCartTotal = cart.reduce((total, item) => total + Number(item?.subtotal || 0), 0);
  const shouldShowMobileCartBar = mobileCartItemCount > 0 && !isCartOpen;
  const mobileCartTotalText = mobileCartTotal.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  useEffect(() => {
    if (
      activeCategory !== 'all' &&
      !visibleCategories.some((category) => (category._id || category.id) === activeCategory)
    ) {
      activeCategoryRef.current = 'all';
      setActiveCategory('all');
    }
  }, [activeCategory, visibleCategories]);

  if (storeNotFound) {
    return <NotFound />;
  }

  if (!isConfigLoaded) {
    return <StorefrontSkeleton />;
  }

  return (
    <ToastProvider>
      <React.Suspense fallback={<div className="grid min-h-screen place-items-center">Carregando...</div>}>
      <div className={cn("relative min-h-screen overflow-x-hidden bg-[#f6f7f2] font-sans lg:pb-0", shouldShowMobileCartBar ? "pb-40" : "pb-24")}>
        {/* ===== TOP ANNOUNCEMENT BAR (OPÇÃO 2: Faixa de Destaque no Topo Absoluto) ===== */}
        {currentView === 'home' && banner.ativo && banner.texto.trim() !== '' && (
          <aside className="relative z-40 w-full bg-zinc-950 text-zinc-100 border-b border-zinc-800/80 px-4 py-2 text-center text-xs font-semibold sm:py-2.5 sm:text-sm tracking-tight shadow-xs">
            <div className="mx-auto flex max-w-[1280px] items-center justify-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-300">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <span className="text-zinc-100 font-bold">
                {banner.texto.trim()}
              </span>
            </div>
          </aside>
        )}

        {/* ===== DESKTOP HEADER ===== */}
        <nav className="relative z-40 hidden store-bg-primary store-text-on-primary lg:block">
          <div className="mx-auto max-w-7xl px-4 py-1.5 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-center">
              <div className="flex space-x-24">
                <div className="flex min-w-[10rem] justify-center">
                  <button onClick={() => setCurrentView('home')} className={cn("inline-flex items-center rounded-md border px-4 py-2 font-bold transition-colors", currentView === 'home' ? 'bg-white store-text-primary border-transparent' : 'bg-transparent store-text-on-primary border-transparent hover:border-white')}>
                    <HomeIcon className="mr-4 h-5 w-5" />
                    Início
                  </button>
                </div>
                <div className="flex min-w-[10rem] justify-center">
                  <button onClick={() => setIsPromotionsModalOpen(true)} className={cn("inline-flex items-center rounded-md border border-transparent bg-transparent px-4 py-2 font-bold store-text-on-primary transition-colors hover:border-white", isPromotionsModalOpen && "border-white")}>
                    <Star className="mr-4 h-5 w-5" />
                    Promoções
                  </button>
                </div>
                <div className="flex min-w-[10rem] justify-center">
                  <button onClick={navigateToOrders} className={cn("inline-flex items-center rounded-md border px-4 py-2 font-bold transition-colors", currentView === 'orders' ? 'bg-white store-text-primary border-transparent' : 'bg-transparent store-text-on-primary border-transparent hover:border-white')}>
                    <ShoppingBag className="mr-4 h-5 w-5" />
                    Pedidos
                  </button>
                </div>
                <div className="relative flex justify-center">
                  <button onClick={() => { if (user) setIsProfileMenuOpen(!isProfileMenuOpen); else openCustomerAccess('profile'); }} className={cn("inline-flex items-center rounded-md border px-4 py-2 font-bold transition-colors", isProfileMenuOpen ? 'bg-white store-text-primary border-transparent' : 'bg-transparent store-text-on-primary border-transparent hover:border-white')}>
                    <User className="mr-4 h-5 w-5" />
                    {user ? 'Minha conta' : 'Entrar/Cadastrar'}
                  </button>
                  {isProfileMenuOpen && user && (
                    <>
                      <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsProfileMenuOpen(false)}></div>
                      <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 rounded-md border border-gray-100 bg-white py-2 shadow-lg animate-in fade-in zoom-in-95 duration-200">
                        <button onClick={handleOpenEditProfile} className="w-full px-5 py-3 text-left text-[14px] font-medium text-gray-700 transition-colors hover:bg-gray-50">Editar perfil</button>
                        <button onClick={() => openProtectedArea('addresses')} className="w-full px-5 py-3 text-left text-[14px] font-medium text-gray-700 transition-colors hover:bg-gray-50">Meus enderecos</button>
                        <button onClick={handleOpenChangePassword} className="w-full px-5 py-3 text-left text-[14px] font-medium text-gray-700 transition-colors hover:bg-gray-50">Trocar senha</button>

                        {isLoyaltyActive && (
                          <button onClick={() => openProtectedArea('loyalty')} className="w-full px-5 py-3 text-left text-[14px] font-medium text-gray-700 transition-colors hover:bg-gray-50">Fidelidade</button>
                        )}
                        <div className="mx-3 my-1 h-px bg-gray-100"></div>
                        <button onClick={async () => { setIsProfileMenuOpen(false); await customerApi(tenantSlug).logout().catch(() => undefined); customerSession.anonymous(); setCurrentView('home'); }} className="w-full px-5 py-3 text-left text-[14px] font-medium text-red-500 transition-colors hover:bg-red-50">Sair</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* ===== STICKY HEADER (Mobile & Desktop) ===== */}
        {/* ===== STICKY HEADER (Mobile & Desktop) ===== */}
        {/* ===== STICKY HEADER (Mobile & Desktop) ===== */}
        <div
          className={`fixed left-0 right-0 top-0 z-50 w-full bg-white shadow-md sm:shadow transition-all duration-300 ease-in-out ${isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
            }`}
        >
          <div className="mx-auto flex h-[60px] w-full max-w-[1280px] items-center gap-2 px-2 py-2 sm:h-[64px] sm:gap-5 sm:px-4 sm:py-2.5 lg:gap-8 lg:px-6">
            
            {/* Esquerda: Logo + Categoria + Busca */}
            <div className="flex flex-1 items-center">
              <div className="mr-2 flex-shrink-0 cursor-pointer sm:mr-4" onClick={() => { setCurrentView('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                <div className={cn("h-9 w-9 shrink-0 overflow-hidden bg-gray-100 md:h-12 md:w-12", storeInfo?.logoShape === 'circle' ? 'rounded-full' : 'rounded-md')}>
                  {storeInfo.logo_url ? (
                    <img src={storeInfo.logo_url} alt="Logo" className="h-full w-full object-cover object-center" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center store-bg-primary store-text-on-primary text-[10px] font-bold">LOGO</div>
                  )}
                </div>
              </div>

              {/* Controles Desktop */}
              <div className="hidden sm:flex flex-1 items-center justify-between space-x-2 pr-2 lg:pr-0">
                {/* Seletor Categoria (Customizado estilo B3X) */}
                <div className="relative inline-block w-[274px] shrink-0 text-left">
                  <CategoryDropdown
                    categories={visibleCategories}
                    activeCategory={activeCategory}
                    onSelectCategory={scrollToCategory}
                    defaultLabel="Todas as categorias"
                    className="w-full"
                  />
                </div>

                {/* Busca (Configurado p/ Reference) */}
                <div 
                  onClick={() => setIsSearchModalOpen(true)}
                  className="flex items-center px-2 space-x-2 bg-white border border-gray-200/80 rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-gray-50 h-10 sm:h-11 w-[306px] shrink-0 cursor-pointer text-gray-500"
                >
                  <div className="flex items-center">
                    <Search className="w-6 h-6 text-gray-500 shrink-0 pointer-events-none" strokeWidth={1} />
                  </div>
                  <div className="items-center hidden w-full max-w-xs sm:flex min-w-64 text-[14px] font-normal pointer-events-none truncate">
                    Busque por um produto
                  </div>
                </div>
              </div>

              {/* Controles Sticky Mobile */}
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:hidden">
                <CategoryDropdown
                  categories={visibleCategories}
                  activeCategory={activeCategory}
                  onSelectCategory={scrollToCategory}
                  defaultLabel="Todas as categorias"
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => setIsSearchModalOpen(true)}
                  aria-label="Buscar produto"
                  className="flex h-10 w-[42px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
                >
                  <Search className="h-5 w-5 pointer-events-none" strokeWidth={1.5} />
                </button>
              </div>

            </div>

            {/* Direita: Atalhos Nav */}
            <div className="items-center justify-around hidden w-[288px] xl:w-[320px] lg:flex shrink-0">
              <button 
                onClick={() => { setCurrentView('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
                className={cn("flex flex-col items-center justify-center p-1 w-20 rounded-md transition-colors gap-0.5 border", currentView === 'home' ? 'store-border-primary store-text-primary' : 'border-transparent hover:store-border-soft text-gray-500 hover:store-text-primary')}
              >
                <HomeIcon className="h-5 w-5" strokeWidth={1.5} />
                <span className="text-[10px] font-medium leading-tight text-center">Início</span>
              </button>
              <button 
                onClick={() => setIsPromotionsModalOpen(true)} 
                className={cn("flex flex-col items-center justify-center p-1 w-20 rounded-md transition-colors gap-0.5 border", isPromotionsModalOpen ? 'store-border-primary store-text-primary' : 'border-transparent hover:store-border-soft text-gray-500 hover:store-text-primary')}
              >
                <Star className="h-5 w-5" strokeWidth={1.5} />
                <span className="text-[10px] font-medium leading-tight text-center">Promoções</span>
              </button>
              <button 
                onClick={navigateToOrders}
                className={cn("flex flex-col items-center justify-center p-1 w-20 rounded-md transition-colors gap-0.5 border", currentView === 'orders' ? 'store-border-primary store-text-primary' : 'border-transparent hover:store-border-soft text-gray-500 hover:store-text-primary')}
              >
                <ShoppingBag className="h-5 w-5" strokeWidth={1.5} />
                <span className="text-[10px] font-medium leading-tight text-center">Pedidos</span>
              </button>
            </div>
          </div>
        </div>

        {/* ===== HERO SECTION ===== */}
        {currentView === 'home' && (
          <header className="relative z-30 flex flex-col items-center pb-2 lg:pb-3">
            {/* Background block to give overlap space on mobile and continuity on desktop */}
            <div className="absolute inset-x-0 top-0 h-[8rem] store-bg-primary sm:h-[10rem] lg:h-[8rem]" />

            {/* HEROBANNER block */}
            <div className="relative z-10 w-full px-0 pt-0 sm:px-4 sm:pt-4 md:px-5 xl:px-0" style={{ maxWidth: '1280px' }}>
              <div className="w-full aspect-[1265/460] min-h-[195px] sm:h-[18rem] md:h-[22.5rem] bg-white shadow-none sm:rounded-xl sm:p-1 sm:shadow">
                <div className="relative h-full w-full overflow-hidden rounded-none store-bg-primary sm:rounded-xl">
                  {storeInfo.capa_url ? (
                    <img src={storeInfo.capa_url} alt="Capa da loja" fetchPriority="high" loading="eager" className="block h-full w-full bg-gray-100 object-cover object-center" />
                  ) : (
                    <div className="flex w-full h-full items-center justify-center store-bg-primary">
                      <Store className="h-12 w-12 store-text-on-primary opacity-50" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent lg:hidden" />
                </div>
              </div>
            </div>

            <div className="mx-auto mt-0 w-full max-w-[1280px] px-0 sm:mt-[-1.25rem] sm:px-4 md:mt-[-1.5rem] md:px-5 lg:mt-[-1.5rem] xl:px-0">
              {/* STORE DESKTOP */}
              <div className="hidden w-full sm:flex relative z-20 items-start px-2 md:px-4 lg:px-10 pb-2">
                <div className={cn("z-20 flex-shrink-0 bg-white p-[2px] shadow-sm border border-gray-100 sm:h-28 sm:w-28 lg:h-[142px] lg:w-[142px] overflow-hidden", storeInfo?.logoShape === 'circle' ? 'rounded-full' : 'rounded-[15px]')}>
                  <div className={cn("h-full w-full overflow-hidden bg-gray-50", storeInfo?.logoShape === 'circle' ? 'rounded-full' : 'rounded-2xl')}>
                    {storeInfo.logo_url ? (
                      <img src={storeInfo.logo_url} alt="Logo" className="block h-full w-full object-cover object-center" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center store-bg-soft"><Store className="h-10 w-10 store-text-primary opacity-70" /></div>
                    )}
                  </div>
                </div>

                <div className="flex flex-1 items-start justify-between pl-4 lg:pl-7 border-b border-gray-200/50 pt-7 lg:pt-11 pb-4">
                  <button
                    type="button"
                    onClick={() => setIsStoreInfoOpen(true)}
                    className="w-fit max-w-full text-left cursor-pointer rounded-xl px-2 py-2 -mx-2 -my-2 hover:opacity-95 transition-opacity bg-transparent"
                  >
                    <h1 className="text-[28px] font-black text-gray-900 lg:text-[34px] tracking-tight leading-none drop-shadow-sm">{storeInfo.nome_loja}</h1>
                    <div className="mt-2.5 flex flex-wrap items-center space-x-3 text-gray-500 text-[14px] font-medium">
                      <div className="flex items-center space-x-1.5">
                        <span className={cn("font-bold", getStoreStatus(storeInfoLive).tone === "success" ? "text-emerald-500" : "text-red-500")}>
                          {getStoreStatus(storeInfoLive).text}
                        </span>
                      </div>
                      {storeInfo.tempo_entrega && (
                        <>
                          <div className="h-1 w-1 flex-shrink-0 rounded-full bg-gray-300"></div>
                          <div className="flex items-center space-x-1.5 text-gray-500">
                             <span className="font-bold">{storeInfo.tempo_entrega}</span>
                          </div>
                        </>
                      )}
                      {storeInfo.cidade_loja && (
                        <>
                          <div className="h-1 w-1 flex-shrink-0 rounded-full bg-gray-300"></div>
                          <div className="flex items-center space-x-1.5">
                            <MapPin className="h-[15px] w-[15px]" />
                            <span>{storeInfo.cidade_loja} {storeInfo.estado_loja ? `- ${storeInfo.estado_loja}` : ''}</span>
                          </div>
                        </>
                      )}
                      <div className="h-1 w-1 flex-shrink-0 rounded-full bg-gray-300"></div>
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-gray-700 hover:store-text-primary transition-colors">Mais informações</span>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* STORE MOBILE */}
              <div
                role="button"
                tabIndex={0}
                aria-label={`Ver informações de ${storeInfo.nome_loja}`}
                onClick={() => setIsStoreInfoOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setIsStoreInfoOpen(true);
                  }
                }}
                className="relative z-20 -mt-4 flex w-full cursor-pointer flex-col items-center rounded-2xl bg-white px-3 pb-3 pt-[42px] shadow-sm transition-colors active:bg-gray-50 sm:hidden"
              >
                <div className={cn("absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-1/2 bg-white p-[4px]", storeInfo?.logoShape === 'circle' ? 'rounded-full' : 'rounded-[16px]')}>
                  <div data-mobile-store-logo="true" className={cn("h-20 w-20 flex-shrink-0 overflow-hidden border border-gray-100 store-bg-soft shadow-sm", storeInfo?.logoShape === 'circle' ? 'rounded-full' : 'rounded-2xl')}>
                    {storeInfo.logo_url ? (
                      <img src={storeInfo.logo_url} alt="Logo" className="block h-full w-full object-cover object-center bg-gray-100" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"><Store className="h-8 w-8 text-gray-300" /></div>
                    )}
                  </div>
                </div>
                <h1 className="text-[20px] font-semibold leading-7 tracking-tight text-gray-800">{storeInfo.nome_loja}</h1>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-y-1 text-gray-600">
                  {storeInfo.cidade_loja && (
                    <>
                      <div className="flex items-center space-x-1">
                        <MapPin className="h-[13px] w-[13px]" />
                        <span className="text-[13px] font-medium leading-4">{storeInfo.cidade_loja}</span>
                      </div>
                      <div className="mx-2 h-1 w-1 flex-shrink-0 rounded-full bg-gray-500"></div>
                    </>
                  )}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[13px] font-semibold leading-4 text-gray-800">Mais informações</span>
                  </div>
                </div>
                <span className={cn("mt-1 text-[13px] font-semibold leading-4 tracking-tight", getStoreStatus(storeInfoLive).tone === "success" ? "text-emerald-500" : "text-red-500")}>
                  {getStoreStatus(storeInfoLive).text}
                </span>
                {storeInfo.tempo_entrega && (
                  <span className="mt-0.5 text-[12px] font-medium leading-4 text-gray-400">
                    Entrega em {storeInfo.tempo_entrega}
                  </span>
                )}
              </div>

              {isLoyaltyActive && (
                <div className="mx-2 mt-3 rounded-md border border-gray-200 bg-white p-3 shadow-sm sm:hidden">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full store-bg-soft store-text-primary">
                      <Gift className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[14px] font-bold leading-5 text-gray-700">Programa de fidelidade</h2>
                      <p className="mt-2 text-[13px] font-light leading-5 text-gray-600">
                        A cada <span className="font-bold text-gray-700">R$ 1,00</span> em compras você ganha{' '}
                        <span className="font-bold text-gray-700">
                          {storeInfo.pontos_por_real || 1} ponto
                          {(storeInfo.pontos_por_real || 1) > 1 ? 's' : ''}
                        </span>{' '}
                        que pode ser trocado por prêmios.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </header>
        )}

        <main className="relative mx-auto mt-0 max-w-[1332px] px-2 pb-20 sm:px-4 sm:pb-28 lg:px-6 lg:pb-14">
          <div className="flex flex-col items-start gap-5 lg:flex-row lg:gap-8">
            <div className="flex-1 w-full min-w-0 lg:max-w-[932px]">
              {currentView === 'home' && (
                <Home
                  tenantSlug={tenantSlug}
                  onAddToCart={handleAddToCart}
                  isLoyaltyActive={isLoyaltyActive}
                  activeCategory={activeCategory}
                  setActiveCategory={scrollToCategory}
                  categories={categories}
                  products={products}
                  homeBlocks={homeBlocks}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  onOpenSearch={() => setIsSearchModalOpen(true)}
                />
              )}

              {currentView === 'tracking' && trackingOrder && (
                <OrderTracking
                  orderId={trackingOrder.orderId}
                  trackingToken={trackingOrder.trackingToken}
                  hasPasswordAssurance={isPasswordVerified}
                  storePhone={storeInfo.whatsapp}
                  tenantSlug={tenantSlug}
                  onBack={() => {
                    setTrackingOrder(null);
                    setCurrentView('home');
                  }}
                />
              )}

              {currentView === 'orders' &&
                (user ? (
                  <Orders
                    user={user}
                    tenantSlug={tenantSlug}
                    products={products}
                    isPasswordVerified={isPasswordVerified}
                    onRequestPasswordVerification={() => {
                      setPendingProtectedAction('orders');
                      setIsConfirmPasswordModalOpen(true);
                    }}
                    onReorder={handleReorder}
                    onTrackingRequest={(tracking) => {
                      setTrackingOrder(tracking);
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
                          onClick={() => openCustomerAccess('orders')}
                          className="w-full rounded store-bg-primary store-bg-primary-hover store-bg-primary-active store-text-on-primary py-3.5 text-[13px] font-bold uppercase tracking-widest transition-all"
                        >
                          Entrar / Cadastrar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

              {!['home', 'orders', 'tracking'].includes(currentView) && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-4 text-6xl">?</div>
                  <h2 className="text-2xl font-bold uppercase tracking-tighter text-gray-800">
                    Pagina nao encontrada
                  </h2>
                  <button
                    onClick={() => setCurrentView('home')}
                    className="mt-6 rounded-2xl store-bg-primary store-bg-primary-hover store-text-on-primary px-8 py-3 text-xs font-bold uppercase tracking-widest"
                  >
                    Voltar ao inicio
                  </button>
                </div>
              )}
            </div>

            {currentView === 'home' && (
              <div ref={sidebarColumnRef} className="hidden w-[320px] shrink-0 self-start lg:block">
                <div className="flex h-full flex-col self-stretch">
                  {isLoyaltyActive && (
                    <div className="mt-5 w-full rounded-[14px] border border-gray-100 bg-white p-4 shadow-sm pb-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600 border border-amber-100/50 shadow-sm">
                          <Gift className="h-5 w-5" />
                        </div>
                        <span className="text-[14px] font-black tracking-tight uppercase text-gray-900 leading-tight">
                          Programa de <br/>fidelidade
                        </span>
                      </div>

                      <div className="mt-4 flex flex-col gap-2.5 text-[12px] text-gray-600 leading-snug font-medium">
                        <span>
                          A cada <span className="font-bold text-amber-600">R$ 1,00</span> em compras você ganha{' '}
                          <span className="font-bold text-amber-600">
                            {storeInfo.pontos_por_real || 1} ponto
                            {(storeInfo.pontos_por_real || 1) > 1 ? 's' : ''}
                          </span>{' '}
                          que pode ser trocado por prêmios na loja.
                        </span>

                      </div>
                    </div>
                  )}

                  <div
                    ref={cartAnchorRef}
                    className="mt-4 w-full"
                    style={isDesktopCartFloating && desktopCartHeight ? { height: `${desktopCartHeight}px` } : undefined}
                  >
                    <aside
                      ref={cartStickyRef}
                      style={desktopCartStyle}
                      className="w-full self-start"
                    >
                      <div className="h-fit overflow-visible">
                        <CartDrawer
                          isOpen={true}
                          inlineMode={true}
                          onClose={() => { }}
                          cart={cart}
                          onUpdateQuantity={handleUpdateQuantity}
                          onClearCart={handleClearCart}
                          user={user}
                          onEditItem={handleEditItem}
                          onStartCheckout={handleStartCheckout}
                          tenantSlug={tenantSlug}
                          canSaveAddress={isPasswordVerified}
                          storeConfig={storeInfoLive}
                        />
                      </div>
                    </aside>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {!(currentView === 'orders' && !user) && (
          <footer className="mt-14 store-bg-primary store-text-on-primary px-6 pb-16 pt-10 lg:pb-12">
            <div className="mx-auto max-w-[1100px]">
              <div className="mb-7 grid grid-cols-1 gap-7 md:grid-cols-3 lg:gap-10">
                <div className="space-y-3">
                  <h4 className="text-sm font-black uppercase italic tracking-[0.22em] store-text-on-primary">
                    {storeInfo.nome_loja}
                  </h4>
                  <p className="max-w-sm text-[13px] leading-6 store-footer-muted">
                    {storeInfo.sobre_texto || 'O sabor que voce ama, no conforto da sua casa.'}
                  </p>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-black uppercase italic tracking-[0.22em] store-text-on-primary">
                    Onde estamos
                  </h4>
                  <div className="text-[13px] leading-6 store-footer-muted">
                    {storeInfo.rua_loja}, {storeInfo.numero_loja} - {storeInfo.bairro_loja}
                    <br />
                    {storeInfo.cidade_loja}
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-black uppercase italic tracking-[0.22em] store-text-on-primary">
                    Contato
                  </h4>
                  <div className="space-y-1.5 text-[13px] leading-6 store-footer-muted">
                    <p>{storeInfo.whatsapp || 'WhatsApp nao configurado'}</p>
                    <p>
                      {storeInfo.tempo_entrega
                        ? `Entrega estimada: ${storeInfo.tempo_entrega}`
                        : 'Tempo de entrega configuravel no painel admin'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center justify-between gap-3 border-t border-white/15 pt-6 text-center text-[10px] font-bold uppercase tracking-[0.18em] store-footer-subtle sm:flex-row sm:text-left">
                <span>2026 {storeInfo.nome_loja} - Todos os direitos reservados.</span>
                <a href="/" target="_blank" rel="noreferrer" className="transition-opacity hover:opacity-80">
                  Plataforma fornecida por <strong className="store-text-on-primary">Pode Vir</strong>
                </a>
              </div>
            </div>
          </footer>
        )}

        {/* ===== MOBILE BOTTOM NAVIGATION ===== */}
        <div className="lg:hidden">
          <CartDrawer
            isOpen={isCartOpen}
            inlineMode={false}
            onClose={() => setIsCartOpen(false)}
            cart={cart}
            onUpdateQuantity={handleUpdateQuantity}
            onClearCart={handleClearCart}
            user={user}
            onEditItem={handleEditItem}
            onStartCheckout={handleStartCheckout}
            tenantSlug={tenantSlug}
            storeConfig={storeInfoLive}
            canSaveAddress={isPasswordVerified}
          />
        </div>

        {isStoreInfoOpen && <StoreInfoModal
          isOpen={isStoreInfoOpen}
          onClose={() => setIsStoreInfoOpen(false)}
          storeInfo={storeInfoLive}
        />}

        {shouldShowMobileCartBar && (
          <div className="fixed bottom-12 left-0 right-0 z-30 lg:hidden animate-in slide-in-from-bottom-2 duration-300">
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="flex h-14 w-full items-center store-bg-primary px-4 shadow-[0_-3px_12px_rgba(0,0,0,0.12)] store-bg-primary-hover transition-colors active:opacity-95 store-text-on-primary"
              aria-label="Ver sacola"
            >
              <div className="flex flex-1 items-center justify-start">
                <div className="relative flex h-8 w-8 items-center justify-center">
                  <ShoppingBag className="h-5 w-5 store-text-on-primary" />
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold leading-none store-text-primary">
                    {mobileCartItemCount}
                  </span>
                </div>
              </div>

              <span className="flex-1 text-center text-sm font-bold store-text-on-primary">Ver sacola</span>
              <div className="flex flex-1 items-center justify-end">
                <span className="text-right text-sm font-bold store-text-on-primary">{mobileCartTotalText}</span>
              </div>
            </button>
          </div>
        )}


        <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-12 w-full flex-shrink-0 items-center justify-around bg-white shadow-[0_-4px_14px_rgba(0,0,0,0.08)] lg:hidden">
          <button onClick={() => setCurrentView('home')} className={cn("flex w-20 select-none flex-col items-center justify-center space-y-1 rounded-md p-1 transition-colors", currentView === 'home' ? 'store-text-primary' : 'bg-white text-gray-400 hover:store-text-primary')}>
            <HomeIcon className={cn("h-5 w-5", currentView === 'home' && "fill-current")} />
            <span className="text-[10px] font-medium">Início</span>
          </button>

          <button onClick={() => setIsPromotionsModalOpen(true)} className={cn("flex w-20 select-none flex-col items-center justify-center space-y-1 rounded-md p-1 transition-colors", isPromotionsModalOpen ? 'store-text-primary' : 'bg-white text-gray-400 hover:store-text-primary')}>
            <Star className="h-5 w-5" />
            <span className="text-[10px] font-medium">Promoções</span>
          </button>

          <button onClick={navigateToOrders} className={cn("flex w-20 select-none flex-col items-center justify-center space-y-1 rounded-md p-1 transition-colors", currentView === 'orders' ? 'store-text-primary' : 'bg-white text-gray-400 hover:store-text-primary')}>
            <ShoppingBag className="h-5 w-5" />
            <span className="text-[10px] font-medium">Pedidos</span>
          </button>

          <button onClick={() => { if (user) setIsProfileMenuOpen(!isProfileMenuOpen); else openCustomerAccess('profile'); }} className={cn("flex w-20 select-none flex-col items-center justify-center space-y-1 rounded-md p-1 transition-colors", isProfileMenuOpen ? 'store-text-primary' : 'bg-white text-gray-400 hover:store-text-primary')}>
            <User className="h-5 w-5" />
            <span className="text-[10px] font-medium">Perfil</span>
          </button>
        </nav>

        {isProfileMenuOpen && user && (
          <div className="fixed inset-0 z-[60] lg:hidden bg-black/50 backdrop-blur-sm" onClick={() => setIsProfileMenuOpen(false)}>
            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto pb-6 pt-3 z-[70] animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4"></div>
              <h3 className="px-5 mb-3 text-lg font-bold text-gray-900">Olá, {user.nome.split(' ')[0]}</h3>
              <div className="flex flex-col">
                <button onClick={handleOpenEditProfile} className="px-5 py-4 flex items-center gap-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 border-t border-gray-100/60">Editar perfil</button>
                <button onClick={() => openProtectedArea('addresses')} className="px-5 py-4 flex items-center gap-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 border-t border-gray-100/60">Meus enderecos</button>
                <button onClick={handleOpenChangePassword} className="px-5 py-4 flex items-center gap-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 border-t border-gray-100/60">Trocar senha</button>
                {isLoyaltyActive && (
                  <button onClick={() => openProtectedArea('loyalty')} className="px-5 py-4 flex items-center gap-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 border-t border-gray-100/60">Programa de fidelidade</button>
                )}
                <button onClick={async () => { setIsProfileMenuOpen(false); await customerApi(tenantSlug).logout().catch(() => undefined); customerSession.anonymous(); setCurrentView('home'); }} className="px-5 py-4 flex items-center gap-3 text-sm text-red-500 font-bold hover:bg-red-50 border-t border-gray-100/60">Sair</button>
              </div>
            </div>
          </div>
        )}

        {isProductDetailsLoading ? (
          <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/45 px-4" role="status" aria-live="polite">
            <div className="rounded-2xl bg-white px-6 py-5 text-sm font-bold text-gray-700 shadow-2xl">Carregando produto...</div>
          </div>
        ) : null}
        {productDetailsError ? (
          <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/45 px-4" role="alert">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
              <p className="font-bold text-gray-900">Nao foi possivel abrir o produto</p>
              <p className="mt-2 text-sm text-gray-500">{productDetailsError}</p>
              <button className="mt-5 rounded-xl store-bg-primary px-5 py-3 text-sm font-bold store-text-on-primary" onClick={() => setProductDetailsError('')}>Fechar</button>
            </div>
          </div>
        ) : null}

        {editingItemInfo && (isComboProduct(editingItemInfo.product) ? <ComboModal product={editingItemInfo.product} products={modalProducts} isOpen onClose={() => setEditingItemInfo(null)} onAddToCart={handleUpdateItem} initialData={editingItemInfo.item} /> : <ProductModal product={editingItemInfo.product} isOpen onClose={() => setEditingItemInfo(null)} onAddToCart={handleUpdateItem} initialData={editingItemInfo.item} isLoyaltyActive={isLoyaltyActive} />)}

        {isLoginModalOpen && <PhoneAuthModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onLoginSuccess={(u) => {
            customerSession.authenticated(u, false);
            setIsLoginModalOpen(false);
            const intent = customerSession.consumeIntent();
            if (intent === 'checkout') setIsCheckoutOpen(true);
            if (intent === 'orders') {
              setPendingProtectedAction('orders');
              setIsConfirmPasswordModalOpen(true);
            }
            if (intent === 'loyalty' && isLoyaltyActive) {
              setPendingProtectedAction('loyalty');
              setIsConfirmPasswordModalOpen(true);
            }
          }}
          onStageChange={(stage) => {
            setIsPasswordVerified(stage === 'login');
            customerSession.setState(stage === 'phone' ? 'phoneEntry' : stage === 'login' ? 'existingLogin' : stage === 'register' ? 'newRegistration' : 'recoveringPassword');
          }}
          tenantSlug={tenantSlug}
          storeWhatsapp={storeInfo.whatsapp}
        />}

        {isCheckoutOpen && <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          user={user}
          cart={cart}
          storeConfig={cartDrawerDataForCheckout?.storeConfig}
          isLoyaltyActive={isLoyaltyActive}
          finalShippingFee={cartDrawerDataForCheckout?.finalShippingFee}
          deliveryMethod={cartDrawerDataForCheckout?.deliveryMethod}
          address={cartDrawerDataForCheckout?.address}
          addressData={cartDrawerDataForCheckout?.addressData}
          subtotal={cartDrawerDataForCheckout?.subtotal}
          appliedCoupon={cartDrawerDataForCheckout?.appliedCoupon}
          tenantSlug={tenantSlug}
          shippingQuoteId={cartDrawerDataForCheckout?.shippingQuoteId}
          initialCutlery={cartDrawerDataForCheckout?.cutlery}
          onOrderSuccess={(tracking) => {
            setCart([]);
            setTrackingOrder(tracking);
            setCurrentView('tracking');
            setIsCartOpen(false);
          }}
        />}

        {activeModal === 'editProfile' && <ProfileEditModal
          isOpen={activeModal === 'editProfile'}
          onClose={() => setActiveModal(null)}
          user={user}
          onUpdateUser={setUser}
          tenantSlug={tenantSlug}
        />}
        {isConfirmPasswordModalOpen && <ConfirmPasswordModal
          isOpen={isConfirmPasswordModalOpen}
          onClose={() => {
            setIsConfirmPasswordModalOpen(false);
            setPendingProtectedAction(null);
          }}
          user={user}
          tenantSlug={tenantSlug}
          onSuccess={handlePasswordVerifiedSuccess}
          onLogout={async () => {
            setIsConfirmPasswordModalOpen(false);
            setPendingProtectedAction(null);
            setIsProfileMenuOpen(false);
            await customerApi(tenantSlug).logout().catch(() => undefined);
            customerSession.anonymous();
            setCurrentView('home');
          }}
          storeWhatsapp={storeInfo.whatsapp}
        />}
        {activeModal === 'changePassword' && <ChangePasswordModal
          isOpen={activeModal === 'changePassword'}
          onClose={() => setActiveModal(null)}
          tenantSlug={tenantSlug}
          onReauthenticationRequired={() => { customerSession.anonymous(); openCustomerAccess('profile'); }}
        />}

        {activeModal === 'addresses' && <AddressBookModal
          isOpen={activeModal === 'addresses'}
          onClose={() => setActiveModal(null)}
          tenantSlug={tenantSlug}
          user={user}
          onUpdateUser={setUser}
        />}
        {activeModal === 'loyalty' && <LoyaltyModal
          isOpen={activeModal === 'loyalty'}
          onClose={() => setActiveModal(null)}
          user={user}
          isLoyaltyActive={isLoyaltyActive}
          tenantSlug={tenantSlug}
        />}

        {isSearchModalOpen && <SearchOverlayModal
          isOpen={isSearchModalOpen}
          onClose={() => setIsSearchModalOpen(false)}
          products={products}
          categories={categories}
          onProductClick={async (product) => {
            const detailedProduct = await resolveProductDetails(product);
            if (detailedProduct) setSearchSelectedProduct(detailedProduct);
          }}
        />}

        {isPromotionsModalOpen && <PromotionsModal
          isOpen={isPromotionsModalOpen}
          onClose={() => setIsPromotionsModalOpen(false)}
          products={products}
          onProductClick={async (product) => {
            setIsPromotionsModalOpen(false);
            const detailedProduct = await resolveProductDetails(product);
            if (detailedProduct) setPromoSelectedProduct(detailedProduct);
          }}
        />}

        {promoSelectedProduct && (isComboProduct(promoSelectedProduct) ? <ComboModal product={promoSelectedProduct} products={modalProducts} isOpen onClose={() => { setPromoSelectedProduct(null); setIsPromotionsModalOpen(true); }} onAddToCart={(item) => { handleAddToCart(item); setPromoSelectedProduct(null); }} /> : (
          <ProductModal
            product={promoSelectedProduct}
            isOpen={!!promoSelectedProduct}
            onClose={() => {
              setPromoSelectedProduct(null);
              setIsPromotionsModalOpen(true);
            }}
            onAddToCart={(item) => {
              handleAddToCart(item);
              setPromoSelectedProduct(null);
            }}
            isLoyaltyActive={isLoyaltyActive}
          />
        ))}

        {searchSelectedProduct && (isComboProduct(searchSelectedProduct) ? <ComboModal product={searchSelectedProduct} products={modalProducts} isOpen onClose={() => setSearchSelectedProduct(null)} onAddToCart={(item) => { handleAddToCart(item); setSearchSelectedProduct(null); setIsSearchModalOpen(false); }} /> : (
          <ProductModal
            product={searchSelectedProduct}
            isOpen={!!searchSelectedProduct}
            onClose={() => setSearchSelectedProduct(null)}
            onAddToCart={(item) => {
              handleAddToCart(item);
              setSearchSelectedProduct(null);
              setIsSearchModalOpen(false);
            }}
            isLoyaltyActive={isLoyaltyActive}
          />
        ))}


      </div>
      </React.Suspense>
    </ToastProvider>
  );
}

const reservedRoutes = new Set(['master', 'admin', 'invite', 'convite', 'api', 'login', 'docs', 'assets']);
const routeFallback = <div className="grid min-h-screen place-items-center bg-[#f6f7f2] text-sm font-semibold text-gray-500">Carregando...</div>;

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f2] p-6 text-center">
      <div><p className="text-xs font-black uppercase tracking-[.24em] text-emerald-600">404</p><h1 className="mt-3 text-3xl font-black text-gray-900">Pagina nao encontrada</h1><p className="mt-3 text-sm text-gray-500">Confira o endereco informado ou volte para a plataforma.</p><a className="mt-7 inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white" href="/">Voltar ao inicio</a></div>
    </main>
  );
}

export default function App() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const first = segments[0] || '';

  if (!first) return <React.Suspense fallback={routeFallback}><PlatformLanding /></React.Suspense>;
  if (first === 'login' || (first === 'admin' && !segments[1])) return <React.Suspense fallback={routeFallback}><CentralMerchantLogin /></React.Suspense>;
  if ((first === 'invite' || first === 'convite') && segments[1]) return <React.Suspense fallback={routeFallback}><AcceptInvitation token={segments[1]} /></React.Suspense>;
  if (first === 'admin' && segments[1] === 'reset-password' && segments[2]) return <React.Suspense fallback={routeFallback}><ResetAdminPassword token={segments[2]} /></React.Suspense>;
  if (segments.length === 3 && segments[1] === 'recuperar-senha') return <React.Suspense fallback={routeFallback}><CustomerResetPassword tenantSlug={first} token={segments[2]} /></React.Suspense>;
  if (first === 'master') return <ToastProvider><React.Suspense fallback={routeFallback}><MasterDashboard /></React.Suspense></ToastProvider>;
  if (reservedRoutes.has(first)) return <NotFound />;
  if (segments.length >= 2 && segments[1] === 'admin') return <ToastProvider><React.Suspense fallback={routeFallback}><TenantAdminDashboard slug={first} /></React.Suspense></ToastProvider>;
  if (segments.length > 1) return <NotFound />;
  return <StorefrontApp tenantSlug={first} />;
}
