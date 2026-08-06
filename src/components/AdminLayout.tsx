// @ts-nocheck
import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LogOut, Menu, X } from 'lucide-react';

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
  activeSubItem?: string;
  onSubItemClick?: (id: string) => void;
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
}: AdminLayoutProps) {
  const currentSection = sections.find((section) => section.id === activeSection);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const selectSection = (section: string) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 xl:w-80 bg-white border-r border-gray-100 shadow-sm flex-col">
        <div className="px-6 py-7 border-b border-gray-100">
          <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-emerald-900/10">
            S
          </div>
          <div className="mt-4">
            <h1 className="text-2xl font-black tracking-tight">Painel da Loja</h1>
            {storeName && <p className="mt-1 truncate text-xs font-black uppercase tracking-[0.18em] text-emerald-600">{storeName}</p>}
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Operacao, catalogo e configuracoes em um fluxo mais claro.
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-2">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;

            return (
              <div key={section.id} className="w-full">
                <button
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left rounded-3xl border px-4 py-4 transition-all ${
                    isActive
                      ? 'border-emerald-200 bg-emerald-50 shadow-sm'
                      : 'border-transparent bg-transparent hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl ${
                        isActive ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black uppercase tracking-wide text-gray-900">
                        {section.label}
                      </p>
                      {section.description && (
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">
                          {section.description}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
                {isActive && section.subItems && (
                  <div className="mt-2 ml-14 space-y-1">
                    {section.subItems.map(subItem => (
                      <button
                        key={subItem.id}
                        onClick={() => onSubItemClick?.(subItem.id)}
                        className={`w-full text-left rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                          activeSubItem === subItem.id ? 'bg-emerald-100 text-emerald-800' : 'text-gray-600 hover:bg-gray-100'
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

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-black text-red-600 transition-colors hover:bg-red-100"
          >
            <LogOut className="w-4 h-4" />
            Sair do painel
          </button>
        </div>
      </aside>

      <div className="lg:pl-72 xl:pl-80">
        <div className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex h-16 items-center gap-3 px-4">
            <button type="button" aria-label="Abrir navegacao" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gray-200 bg-white text-gray-700">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">
                {storeName || 'Painel da Loja'}
              </p>
              <h1 className="truncate text-base font-black text-gray-900">{currentSection?.label || 'Administracao'}</h1>
            </div>
            <button
              onClick={onLogout}
              aria-label="Sair do painel"
              className="grid h-10 w-10 place-items-center rounded-xl border border-red-100 bg-red-50 text-red-600"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {mobileMenuOpen && <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navegacao do painel">
          <button type="button" aria-label="Fechar navegacao" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-gray-950/40 backdrop-blur-sm" />
          <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,340px)] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-5"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">{storeName}</p><h2 className="mt-1 text-xl font-black text-gray-900">Painel da loja</h2></div><button type="button" aria-label="Fechar navegacao" onClick={() => setMobileMenuOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-gray-100 text-gray-600"><X className="h-5 w-5" /></button></div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">{sections.map((section) => {
              const Icon = section.icon;
              const isActive = section.id === activeSection;
              return (
                <div key={section.id} className="w-full">
                  <button onClick={() => selectSection(section.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isActive ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'}`}><Icon className="h-5 w-5" /></span>
                    <span><strong className="block text-sm">{section.label}</strong><small className="mt-0.5 block text-xs font-normal text-gray-500">{section.description}</small></span>
                  </button>
                  {isActive && section.subItems && (
                    <div className="mt-1 ml-14 mb-2 space-y-1">
                      {section.subItems.map(subItem => (
                        <button
                          key={subItem.id}
                          onClick={() => {
                            onSubItemClick?.(subItem.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full text-left rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                            activeSubItem === subItem.id ? 'bg-emerald-100 text-emerald-800' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {subItem.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}</nav>
            <div className="border-t border-gray-100 p-4"><button onClick={onLogout} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-50 text-sm font-bold text-red-600"><LogOut className="h-4 w-4" />Sair do painel</button></div>
          </aside>
        </div>}

        <main className="p-3 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <section className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm sm:rounded-[2rem] sm:px-8 sm:py-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-3">
                    {currentSection && (
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
                        <currentSection.icon className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <h2 className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">
                        {headerTitle}
                      </h2>
                      <p className="mt-1 text-sm leading-relaxed text-gray-500">
                        {headerDescription}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex flex-wrap items-center gap-3">
                  {storeOpen !== undefined && onToggleStoreOpen && (
                    <button
                      onClick={onToggleStoreOpen}
                      className={`flex items-center gap-2 rounded-full px-4 py-2 border transition-colors ${
                        storeOpen
                          ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-red-50 border-red-200 hover:bg-red-100'
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-full animate-pulse ${storeOpen ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className={`text-xs font-bold ${storeOpen ? 'text-emerald-800' : 'text-red-800'}`}>
                        {storeOpen ? 'LOJA ABERTA' : 'LOJA FECHADA'}
                      </span>
                    </button>
                  )}
                  {headerActions && <div>{headerActions}</div>}
                </div>
              </div>
            </section>

            {secondaryNav}

            <div>{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
