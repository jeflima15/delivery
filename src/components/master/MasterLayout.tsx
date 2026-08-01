import { useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionResponse } from './types';
import MasterSidebar from './MasterSidebar';
import MasterTopbar from './MasterTopbar';
interface Props { children: ReactNode; path: string; account: SessionResponse['account']; platformName: string; attention: number; navigate: (path: string) => void; logout: () => void }
export default function MasterLayout({ children, path, account, platformName, attention, navigate, logout }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false); const [collapsed, setCollapsed] = useState(() => localStorage.getItem('master_sidebar_collapsed') === 'true');
  const toggle = () => setCollapsed((value) => { localStorage.setItem('master_sidebar_collapsed', String(!value)); return !value; });
  return <div className="min-h-[100dvh] bg-slate-950 text-slate-100"><MasterSidebar path={path} collapsed={collapsed} mobileOpen={mobileOpen} platformName={platformName} navigate={navigate} onCollapse={toggle} onClose={() => setMobileOpen(false)}/><div className={`min-h-[100dvh] transition-[padding] duration-200 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-64'}`}><MasterTopbar path={path} account={account} attention={attention} navigate={navigate} openMenu={() => setMobileOpen(true)} logout={logout}/><main className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:p-8">{children}</main></div></div>;
}
