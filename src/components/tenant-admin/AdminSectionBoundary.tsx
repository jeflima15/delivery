import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AdminSectionSkeleton } from './AdminUi';

interface ErrorBoundaryProps {
  children: ReactNode;
  variant: 'section' | 'modal';
}

interface ErrorBoundaryState {
  error: Error | null;
}

class AdminChunkErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Falha ao carregar módulo administrativo.', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const content = (
      <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-5 text-center shadow-lg">
        <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" aria-hidden="true" />
        <h2 className="mt-2 text-sm font-bold text-slate-900">Não foi possível carregar esta área</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">A versão do painel pode ter sido atualizada. Atualize a página para continuar.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--pv-primary)] px-4 text-xs font-bold text-white">
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar painel
        </button>
      </div>
    );

    if (this.props.variant === 'modal') {
      return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">{content}</div>;
    }
    return <div className="grid min-h-64 place-items-center">{content}</div>;
  }
}

interface Props {
  children: ReactNode;
  variant?: 'section' | 'modal';
}

export default function AdminSectionBoundary({ children, variant = 'section' }: Props) {
  return (
    <AdminChunkErrorBoundary variant={variant}>
      <Suspense fallback={variant === 'modal' ? null : <AdminSectionSkeleton />}>
        {children}
      </Suspense>
    </AdminChunkErrorBoundary>
  );
}
