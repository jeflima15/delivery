import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AdminSurfaceProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}

export function AdminSurface({ children, className, as: Component = 'section' }: AdminSurfaceProps) {
  return (
    <Component className={cn('rounded-xl border border-slate-200/80 bg-white shadow-2xs', className)}>
      {children}
    </Component>
  );
}

interface AdminSectionIntroProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function AdminSectionIntro({ title, description, icon: Icon }: AdminSectionIntroProps) {
  return (
    <header>
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
        <Icon className="h-5 w-5 text-[var(--pv-primary)]" aria-hidden="true" />
        {title}
      </h2>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{description}</p>
    </header>
  );
}

interface AdminStatCardProps {
  label: string;
  value: ReactNode;
  description: string;
}

export function AdminStatCard({ label, value, description }: AdminStatCardProps) {
  return (
    <AdminSurface as="article" className="p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{description}</p>
    </AdminSurface>
  );
}

interface AdminEmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

export function AdminEmptyState({ title, description, icon: Icon, action, className }: AdminEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      {Icon && <Icon className="mb-2 h-5 w-5 text-slate-300" aria-hidden="true" />}
      <p className="text-xs font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
