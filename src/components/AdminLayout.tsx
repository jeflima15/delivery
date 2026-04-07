// @ts-nocheck
import React from 'react';
import { LayoutDashboard, ShoppingBag, Package, Settings, LogOut, Tags, Users, LayoutTemplate, Ticket, History } from 'lucide-react';

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
}

export default function AdminLayout({ children, activeTab, setActiveTab, onLogout }: AdminLayoutProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pedidos', label: 'Pedidos', icon: ShoppingBag },
    { id: 'produtos', label: 'Cardápio', icon: Package },
    { id: 'categorias', label: 'Categorias', icon: Tags },
    { id: 'vitrine', label: 'Destaques Cardápio', icon: LayoutTemplate },
    { id: 'home_blocks', label: 'Layout da Home', icon: LayoutTemplate },
    { id: 'clientes', label: 'Clientes & CRM', icon: Users },
    { id: 'cupons', label: 'Cupons', icon: Ticket },
    { id: 'logs', label: 'Logs de Auditoria', icon: History },
    { id: 'config', label: 'Configurações', icon: Settings },
  ];


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col md:flex-row font-sans transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white dark:bg-gray-900 text-gray-900 dark:text-white flex flex-col shadow-xl z-10 md:fixed md:h-screen border-r border-gray-100 dark:border-gray-800">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center font-bold text-white">
            S
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Stitch Admin</h1>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Gestão Premium</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button 
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${
                  isActive 
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/20' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800">
          <button 
            onClick={onLogout} 
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-2xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sair do Sistema</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-64 p-6 md:p-8 overflow-y-auto min-h-screen">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
