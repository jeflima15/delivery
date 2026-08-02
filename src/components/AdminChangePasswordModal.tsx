import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Eye, EyeOff, KeyRound, Mail, ShieldCheck, X } from 'lucide-react';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

interface AdminChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  currentAdminEmail?: string;
  onUnauthorized: () => void;
}

type VisibilityState = {
  senhaAtual: boolean;
  novaSenha: boolean;
  confirmarNovaSenha: boolean;
};

const INITIAL_VISIBILITY: VisibilityState = {
  senhaAtual: false,
  novaSenha: false,
  confirmarNovaSenha: false,
};

export default function AdminChangePasswordModal({
  isOpen,
  onClose,
  token,
  currentAdminEmail,
  onUnauthorized,
}: AdminChangePasswordModalProps) {
  const api = useTenantAdminApi();
  const [form, setForm] = useState({
    email: currentAdminEmail || '',
    senhaAtual: '',
    novaSenha: '',
    confirmarNovaSenha: '',
  });
  const [loading, setLoading] = useState(false);
  const [visibility, setVisibility] = useState<VisibilityState>(INITIAL_VISIBILITY);
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';
    setForm({
      email: currentAdminEmail || '',
      senhaAtual: '',
      novaSenha: '',
      confirmarNovaSenha: '',
    });
    setVisibility(INITIAL_VISIBILITY);

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, currentAdminEmail]);

  if (!isOpen) return null;

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleVisibility = (field: keyof VisibilityState) => {
    setVisibility((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (!form.email || !form.senhaAtual || !form.novaSenha || !form.confirmarNovaSenha) {
      showToast('Preencha todos os campos obrigatorios.', 'error');
      return;
    }

    if (form.novaSenha.length < 6) {
      showToast('A nova senha deve ter pelo menos 6 caracteres.', 'error');
      return;
    }

    if (form.novaSenha !== form.confirmarNovaSenha) {
      showToast('A confirmacao da nova senha nao confere.', 'error');
      return;
    }

    if (form.novaSenha === form.senhaAtual) {
      showToast('A nova senha precisa ser diferente da senha atual.', 'error');
      return;
    }

    setLoading(true);

    try {
      await api.changePassword(form);
      showToast('Senha alterada com sucesso! Entre novamente.', 'success');
      setForm({
        email: currentAdminEmail || '',
        senhaAtual: '',
        novaSenha: '',
        confirmarNovaSenha: '',
      });
      onClose();
      onUnauthorized();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao comunicar com o servidor.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderPasswordField = (
    id: keyof typeof form,
    label: string,
    visibleKey: keyof VisibilityState,
  ) => (
    <div className="space-y-2">
      <label htmlFor={id} className="text-[12px] font-black uppercase tracking-[0.18em] text-gray-500">
        {label}
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
          <KeyRound className="h-4 w-4" />
        </div>
        <input
          id={id}
          type={visibility[visibleKey] ? 'text' : 'password'}
          value={form[id]}
          onChange={(e) => updateField(id, e.target.value)}
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-4 pl-11 pr-12 text-[14px] font-medium text-gray-800 outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          autoComplete={
            id === 'senhaAtual'
              ? 'current-password'
              : id === 'novaSenha'
                ? 'new-password'
                : 'new-password'
          }
          required
        />
        <button
          type="button"
          onClick={() => toggleVisibility(visibleKey)}
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label={visibility[visibleKey] ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {visibility[visibleKey] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-center bg-black/55 backdrop-blur-sm animate-in fade-in duration-200 cursor-default">
      <div
        className="w-full bg-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300 sm:my-8 sm:h-auto sm:max-h-[calc(100vh-64px)] sm:max-w-[540px] sm:rounded-[2rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-full flex-col overflow-hidden sm:max-h-[calc(100vh-64px)]">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-600">
                Seguranca do admin
              </p>
              <h2 className="mt-2 text-xl font-black tracking-tight text-gray-900">
                Alterar senha
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
              aria-label="Fechar modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 sm:p-7">
            <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/70 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-emerald-700">
                    Confirmacao de identidade
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-700/80">
                    Informe o e-mail do admin logado, sua senha atual e defina a nova senha com pelo menos 6 caracteres.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="space-y-2">
                <label htmlFor="admin-email" className="text-[12px] font-black uppercase tracking-[0.18em] text-gray-500">
                  E-mail atual
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="admin-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-4 pl-11 pr-4 text-[14px] font-medium text-gray-800 outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              {renderPasswordField('senhaAtual', 'Senha atual', 'senhaAtual')}
              {renderPasswordField('novaSenha', 'Nova senha', 'novaSenha')}
              {renderPasswordField('confirmarNovaSenha', 'Confirmar nova senha', 'confirmarNovaSenha')}

              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium leading-6 text-gray-500">
                  Regras: minimo de 6 caracteres, confirmacao identica e nova senha diferente da atual.
                </p>
              </div>
            </form>
          </div>

          <div className="border-t border-gray-100 bg-white px-6 py-5">
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={
                loading ||
                !form.email ||
                !form.senhaAtual ||
                !form.novaSenha ||
                !form.confirmarNovaSenha
              }
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black uppercase tracking-[0.22em] text-white shadow-xl shadow-emerald-900/10 transition-all hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Salvar nova senha
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
