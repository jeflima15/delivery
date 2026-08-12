import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, LogOut, Menu, Store, User, X } from 'lucide-react';
import PodeVirBrand from './brand/PodeVirBrand';

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
  impersonatedBy?: string;
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
  impersonatedBy,
}: AdminLayoutProps) {
  const currentSection = sections.find((section) => section.id === activeSection);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const selectSection = (section: string) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50/70 font-sans text-slate-900 antialiased">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200/80 bg-white shadow-sm lg:flex xl:w-64">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4">
          <div className="flex items-center justify-between">
            <PodeVirBrand size="sm" />
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Admin
            </span>
          </div>
          {storeName && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50 px-2.5 py-1.5">
              <Store className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="truncate text-xs font-semibold text-slate-800">{storeName}</span>
            </div>
          )}
        </div>

        <nav className="hide-scrollbar flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;

            return (
              <div key={section.id} className="w-full">
                <button
                  onClick={() => selectSection(section.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
                    isActive
                      ? 'border-l-2 border-emerald-600 bg-emerald-50 font-semibold text-emerald-900'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-emerald-700' : 'text-slate-400'}`} />
                    <span className="truncate">{section.label}</span>
                  </span>
                  {section.subItems && section.subItems.length > 0 && (
                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                        isActive ? 'rotate-90 text-emerald-700' : 'text-slate-300'
                      }`}
                    />
                  )}
                </button>

                {isActive && section.subItems && section.subItems.length > 0 && (
                  <div className="my-1 ml-5 space-y-0.5 border-l border-slate-200/80 pl-2.5">
                    {section.subItems.map((subItem) => {
                      const isSubActive = activeSubItem === subItem.id;
                      return (
                        <button
                          key={subItem.id}
                          onClick={() => onSubItemClick?.(subItem.id)}
                          className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                            isSubActive
                              ? 'bg-emerald-100/70 font-semibold text-emerald-900'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                          }`}
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

        <div className="border-t border-slate-100 bg-slate-50/50 p-3">
          <button
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair da conta
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-60 xl:pl-64">
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
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium ${
                          isActive ? 'bg-emerald-50 font-semibold text-emerald-800' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className="truncate">{section.label}</span>
                      </button>
                      {isActive && section.subItems && (
                        <div className="my-1 ml-6 space-y-0.5 border-l border-slate-200 pl-2">
                          {section.subItems.map((subItem) => (
                            <button
                              key={subItem.id}
                              onClick={() => {
                                onSubItemClick?.(subItem.id);
                                setMobileMenuOpen(false);
                              }}
                              className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                                activeSubItem === subItem.id
                                  ? 'bg-emerald-100 font-semibold text-emerald-900'
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

        <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 p-4 sm:p-6">
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
      </div>
    </div>
  );
}
