import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronRight,
  LogOut,
  Menu,
  Store,
  User,
  X,
  ShoppingBag,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import PodeVirBrand from './brand/PodeVirBrand';
import { cn } from '../lib/utils';

export interface AdminSectionItem {
  id: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  subItems?: { id: string; label: string }[];
}

interface AdminLayoutProps {
  children: React.ReactNode;
  sections: AdminSectionItem[];
  activeSection: string;
  setActiveSection: (section: string) => void;
  onLogout: () => void;
  headerTitle: string;
  headerDescription: string;
  headerActions?: React.ReactNode;
  storeName?: string;
  storeOpen?: boolean;
  onToggleStoreOpen?: () => void;
  secondaryNav?: React.ReactNode;
  activeSubItem?: string;
  onSubItemClick?: (id: string) => void;
  onSectionIntent?: (sectionId: string, subItemId?: string) => void;
  impersonatedBy?: string;
  pendingOrdersCount?: number;
}

export default function AdminLayout({
  children,
  sections,
  activeSection,
  setActiveSection,
  onLogout,
  headerTitle,
  headerDescription,
  secondaryNav,
  headerActions,
  storeName,
  storeOpen,
  onToggleStoreOpen,
  activeSubItem,
  onSubItemClick,
  onSectionIntent,
  impersonatedBy,
  pendingOrdersCount = 0,
}: AdminLayoutProps) {
  const currentSection = sections.find((section) => section.id === activeSection);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('podevir_admin_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('podevir_admin_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const selectSection = (section: string) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50/70 font-sans text-slate-900 antialiased">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200/80 bg-white shadow-sm lg:flex transition-[width] duration-200",
          sidebarCollapsed ? "w-16" : "w-60 xl:w-64"
        )}
      >
        <div className={cn("flex flex-col gap-3 border-b border-slate-100", sidebarCollapsed ? "p-3 items-center" : "px-4 py-4")}>
          <div className={cn("flex items-center w-full", sidebarCollapsed ? "justify-center" : "justify-between")}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2">
                <PodeVirBrand size="sm" />
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Admin
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200/80 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
              title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
            </button>
          </div>

          {!sidebarCollapsed && storeName && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50 px-2.5 py-1.5">
              <Store className="h-3.5 w-3.5 shrink-0 text-[var(--pv-primary)]" />
              <span className="truncate text-xs font-semibold text-slate-800">{storeName}</span>
            </div>
          )}

          {sidebarCollapsed && storeName && (
            <div
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200/60 bg-slate-50 text-[var(--pv-primary)]"
              title={storeName}
            >
              <Store className="h-4 w-4" />
            </div>
          )}
        </div>

        <nav className="hide-scrollbar flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;

            return (
              <div key={section.id} className="w-full">
                <button
                  onClick={() => selectSection(section.id)}
                  onPointerEnter={() => onSectionIntent?.(section.id)}
                  onPointerDown={() => onSectionIntent?.(section.id)}
                  onFocus={() => onSectionIntent?.(section.id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={sidebarCollapsed ? section.label : undefined}
                  className={cn(
                    "flex w-full items-center rounded-lg text-xs font-medium transition-all cursor-pointer",
                    sidebarCollapsed
                      ? cn(
                          "h-10 justify-center",
                          isActive
                            ? "bg-[var(--pv-surface-soft)] font-bold text-[var(--pv-dark)] ring-1 ring-[var(--pv-primary)]/40"
                            : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                        )
                      : cn(
                          "justify-between px-2.5 py-2",
                          isActive
                            ? "border-l-2 border-[var(--pv-primary)] bg-[var(--pv-surface-soft)] font-semibold text-[var(--pv-dark)]"
                            : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                        )
                  )}
                >
                  <span className={cn("flex min-w-0 items-center", sidebarCollapsed ? "justify-center" : "gap-2.5")}>
                    <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-[var(--pv-primary)]" : "text-slate-400")} />
                    {!sidebarCollapsed && <span className="truncate">{section.label}</span>}
                  </span>
                  {!sidebarCollapsed && section.subItems && section.subItems.length > 0 && (
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform",
                        isActive ? "rotate-90 text-[var(--pv-primary)]" : "text-slate-300"
                      )}
                    />
                  )}
                </button>

                {!sidebarCollapsed && isActive && section.subItems && section.subItems.length > 0 && (
                  <div className="my-1 ml-5 space-y-0.5 border-l border-slate-200/80 pl-2.5">
                    {section.subItems.map((subItem) => {
                      const isSubActive = activeSubItem === subItem.id;
                      return (
                        <button
                          key={subItem.id}
                          onClick={() => onSubItemClick?.(subItem.id)}
                          onPointerEnter={() => onSectionIntent?.(section.id, subItem.id)}
                          onPointerDown={() => onSectionIntent?.(section.id, subItem.id)}
                          onFocus={() => onSectionIntent?.(section.id, subItem.id)}
                          aria-current={isSubActive ? 'page' : undefined}
                          className={cn(
                            "w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
                            isSubActive
                              ? "bg-[var(--pv-surface-soft)] font-semibold text-[var(--pv-dark)]"
                              : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          )}
                        >
                          {subItem.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={cn("border-t border-slate-100 bg-slate-50/50", sidebarCollapsed ? "p-2 flex justify-center" : "p-3")}>
          <button
            onClick={onLogout}
            title="Sair da conta"
            className={cn(
              "flex items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 cursor-pointer",
              sidebarCollapsed ? "h-9 w-9 p-0" : "w-full gap-2 px-3 py-1.5"
            )}
          >
            <LogOut className="h-3.5 w-3.5" />
            {!sidebarCollapsed && <span>Sair da conta</span>}
          </button>
        </div>
      </aside>

      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200", sidebarCollapsed ? "lg:pl-16" : "lg:pl-60 xl:pl-64")}>
        {impersonatedBy && (
          <div className="z-50 border-b border-amber-200/80 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
            Modo Suporte Master ativo.{' '}
            <a href="/master/lojas" className="ml-1 font-semibold underline hover:text-amber-950">
              [Voltar ao Admin Master]
            </a>
          </div>
        )}

        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Abrir navegacao"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
              <span className="max-w-[140px] truncate font-semibold text-slate-900 sm:max-w-[200px]">
                {storeName || 'Painel da Loja'}
              </span>
              <span className="text-slate-300">/</span>
              <span className="truncate font-medium text-slate-500">{currentSection?.label || 'Visao geral'}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {storeOpen !== undefined && onToggleStoreOpen && (
              <button
                onClick={onToggleStoreOpen}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                  storeOpen
                    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/70'
                    : 'border-rose-200/80 bg-rose-50 text-rose-700 hover:bg-rose-100/70'
                }`}
                title="Alternar status da loja"
              >
                <span className={`h-2 w-2 rounded-full ${storeOpen ? 'animate-pulse bg-emerald-500' : 'bg-rose-500'}`} />
                <span>{storeOpen ? 'Aberta' : 'Fechada'}</span>
              </button>
            )}

            <div className="hidden items-center gap-2 border-l border-slate-200 pl-2.5 sm:flex">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                <User className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navegacao do painel">
            <button
              type="button"
              aria-label="Fechar navegacao"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(85vw,280px)] flex-col bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 p-4">
                <div className="min-w-0">
                  <PodeVirBrand size="sm" />
                  {storeName && <p className="mt-2 truncate text-xs font-semibold text-slate-700">{storeName}</p>}
                </div>
                <button
                  type="button"
                  aria-label="Fechar navegacao"
                  onClick={() => setMobileMenuOpen(false)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
                {sections.map((section) => {
                  const Icon = section.icon;
                  const isActive = section.id === activeSection;
                  return (
                    <div key={section.id} className="w-full">
                      <button
                        onClick={() => selectSection(section.id)}
                        onPointerDown={() => onSectionIntent?.(section.id)}
                        onFocus={() => onSectionIntent?.(section.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium ${
                          isActive ? 'bg-[var(--pv-surface-soft)] font-semibold text-[var(--pv-dark)]' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[var(--pv-primary)]' : 'text-slate-400'}`} />
                        <span className="truncate">{section.label}</span>
                      </button>
                      {isActive && section.subItems && (
                        <div className="my-1 ml-6 space-y-0.5 border-l border-slate-200 pl-2">
                          {section.subItems.map((subItem) => (
                            <button
                              key={subItem.id}
                              onPointerDown={() => onSectionIntent?.(section.id, subItem.id)}
                              onFocus={() => onSectionIntent?.(section.id, subItem.id)}
                              onClick={() => {
                                onSubItemClick?.(subItem.id);
                                setMobileMenuOpen(false);
                              }}
                              className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                                activeSubItem === subItem.id
                                  ? 'bg-[var(--pv-surface-soft)] font-semibold text-[var(--pv-dark)]'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {subItem.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>

              <div className="border-t border-slate-100 p-3">
                <button
                  onClick={onLogout}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-rose-100 bg-rose-50 text-xs font-medium text-rose-700"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair da conta
                </button>
              </div>
            </aside>
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 p-4 sm:p-6 pb-24 lg:pb-6">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{headerTitle}</h1>
              {headerDescription && <p className="mt-0.5 text-xs font-normal text-slate-500">{headerDescription}</p>}
            </div>

            {headerActions && <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div>}
          </div>

          {secondaryNav}
          <div>{children}</div>
        </main>

        <nav className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-slate-200/90 bg-white/95 backdrop-blur-md pb-safe">
          <div className="grid grid-cols-4 h-14 items-center px-1">
            <button
              type="button"
              onClick={() => selectSection('pedidos')}
              onPointerDown={() => onSectionIntent?.('pedidos')}
              onFocus={() => onSectionIntent?.('pedidos')}
              aria-current={activeSection === 'pedidos' ? 'page' : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-1 text-[10px] font-medium transition-colors cursor-pointer",
                activeSection === 'pedidos'
                  ? "text-[var(--pv-primary)] font-bold"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <span className="relative">
                <ShoppingBag className="h-4 w-4" />
                {pendingOrdersCount > 0 && (
                  <span className="absolute -right-2.5 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-white" aria-label={`${pendingOrdersCount} pedidos novos`}>
                    {pendingOrdersCount > 99 ? '99+' : pendingOrdersCount}
                  </span>
                )}
              </span>
              <span>Pedidos</span>
            </button>

            <button
              type="button"
              onClick={() => selectSection('dashboard')}
              onPointerDown={() => onSectionIntent?.('dashboard')}
              onFocus={() => onSectionIntent?.('dashboard')}
              aria-current={activeSection === 'dashboard' ? 'page' : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-1 text-[10px] font-medium transition-colors cursor-pointer",
                activeSection === 'dashboard'
                  ? "text-[var(--pv-primary)] font-bold"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => selectSection('catalogo')}
              onPointerDown={() => onSectionIntent?.('catalogo')}
              onFocus={() => onSectionIntent?.('catalogo')}
              aria-current={activeSection === 'catalogo' ? 'page' : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-1 text-[10px] font-medium transition-colors cursor-pointer",
                activeSection === 'catalogo'
                  ? "text-[var(--pv-primary)] font-bold"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Package className="h-4 w-4" />
              <span>Catálogo</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir mais opções do painel"
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-1 text-[10px] font-medium transition-colors cursor-pointer",
                !['pedidos', 'dashboard', 'catalogo'].includes(activeSection)
                  ? "font-bold text-[var(--pv-primary)]"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Menu className="h-4 w-4" />
              <span>Mais</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
