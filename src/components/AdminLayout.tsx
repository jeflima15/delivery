// @ts-nocheck
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { LogOut } from 'lucide-react';

export interface AdminSectionItem {
  id: string;
  label: string;
  icon: LucideIcon;
  description?: string;
}

interface AdminLayoutProps {
  children: React.ReactNode;
  sections: AdminSectionItem[];
  activeSection: string;
  setActiveSection: (section: string) => void;
  onLogout: () => void;
  headerTitle: string;
  headerDescription: string;
  secondaryNav?: React.ReactNode;
  headerActions?: React.ReactNode;
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
}: AdminLayoutProps) {
  const currentSection = sections.find((section) => section.id === activeSection);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 xl:w-80 bg-white border-r border-gray-100 shadow-sm flex-col">
        <div className="px-6 py-7 border-b border-gray-100">
          <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-emerald-900/10">
            S
          </div>
          <div className="mt-4">
            <h1 className="text-2xl font-black tracking-tight">Painel da Loja</h1>
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
              <button
                key={section.id}
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
        <div className="sticky top-0 z-20 lg:hidden bg-white/95 backdrop-blur border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">
                Painel da Loja
              </p>
              <h1 className="text-lg font-black text-gray-900">Administracao operacional</h1>
            </div>
            <button
              onClick={onLogout}
              className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-600"
            >
              Sair
            </button>
          </div>

          <div className="overflow-x-auto px-4 pb-4">
            <div className="flex gap-2 min-w-max">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeSection;

                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black whitespace-nowrap transition-all ${
                      isActive
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-white text-gray-500'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {section.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <section className="rounded-[2rem] border border-gray-100 bg-white px-6 py-6 shadow-sm sm:px-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-3">
                    {currentSection && (
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
                        <currentSection.icon className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <h2 className="text-3xl font-black tracking-tight text-gray-900">
                        {headerTitle}
                      </h2>
                      <p className="mt-1 text-sm leading-relaxed text-gray-500">
                        {headerDescription}
                      </p>
                    </div>
                  </div>
                </div>

                {headerActions && <div className="shrink-0">{headerActions}</div>}
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
