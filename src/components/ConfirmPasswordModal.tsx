import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';
import { customerApi } from '../features/customer/api';

interface ConfirmPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  tenantSlug?: string | null;
  onSuccess: () => void;
  onLogout: () => void;
  onForgotPassword?: () => void;
}

export default function ConfirmPasswordModal({
  isOpen,
  onClose,
  user,
  tenantSlug,
  onSuccess,
  onLogout,
  onForgotPassword,
}: ConfirmPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState(user?.nome || '');
  const [nascimento, setNascimento] = useState(user?.nascimento || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (isOpen && user) {
      setName(user.nome || user.name || '');
      setNascimento(user.nascimento || '');
      setPassword('');
      setConfirmPassword('');
      setError('');
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const hasPassword = Boolean(user?.hasPassword);
  const phone = user?.telefone || user?.phone || '';
  const firstName = (user?.nome || user?.name || 'Cliente')
    .split(' ')[0]
    .toUpperCase();

  const formatBirthDate = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!hasPassword) {
      if (!name.trim()) {
        setError('Informe seu nome.');
        return;
      }
      if (nascimento.length < 10) {
        setError('Informe uma data de nascimento válida (DD/MM/AAAA).');
        return;
      }
      if (!password || password.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setError('As senhas não coincidem.');
        return;
      }
    } else {
      if (!password) return;
    }

    setLoading(true);

    try {
      if (!tenantSlug) throw new Error('Loja inválida.');
      const api = customerApi(tenantSlug);

      if (!hasPassword && (name !== user?.nome || nascimento !== user?.nascimento)) {
        await api.profile({ nome: name.trim(), nascimento });
      }

      // Verify or Set password using login endpoint
      await api.login({ phone, password });
      setPassword('');
      setConfirmPassword('');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-[400px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors z-20"
        >
          <X className="h-4 w-4" />
        </button>

        {hasPassword ? (
          <>
            {/* Existing password user flow */}
            <div className="text-center pt-2 pb-6">
              <h2 className="text-xl font-black text-gray-800 tracking-tight">
                Olá, {firstName}
              </h2>
              <p className="mt-1.5 text-sm text-gray-500 font-medium">
                Informe a sua senha para continuar
              </p>
            </div>

            <form onSubmit={handleConfirm} className="space-y-5">
              <div className="relative">
                <label className="absolute -top-2.5 left-3.5 z-10 bg-white px-1.5 text-xs font-semibold store-text-primary leading-none">
                  Senha *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoFocus
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border-2 store-border-primary bg-blue-50/20 px-4 py-3.5 text-base text-gray-800 outline-none pr-11 transition-all"
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 p-2.5 text-center text-xs font-semibold text-red-600">
                  {error}
                </p>
              )}

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onForgotPassword?.();
                  }}
                  className="text-sm font-bold text-gray-700 hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="w-full rounded-xl border-2 border-[#8B5A2B] bg-white py-3.5 text-sm font-black text-[#8B5A2B] hover:bg-amber-50/50 transition-colors uppercase tracking-wide"
                >
                  SAIR DESTA CONTA
                </button>
                <button
                  type="submit"
                  disabled={loading || !password}
                  className="flex w-full items-center justify-center rounded-xl store-bg-primary store-text-on-primary py-3.5 text-sm font-black hover:brightness-95 active:scale-[0.99] transition-all uppercase tracking-wide disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'CONFIRMAR'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            {/* New user completing password creation flow (B3X Print 2) */}
            <div className="text-center pt-2 pb-6">
              <h2 className="text-xl font-bold text-gray-800 tracking-tight">
                Faltam algumas informações
              </h2>
              <p className="mt-1.5 text-sm text-gray-500 font-medium">
                Você só precisa preencher estes dados uma vez
              </p>
            </div>

            <form onSubmit={handleConfirm} className="space-y-5">
              {/* Telefone */}
              <div className="relative">
                <label className="absolute -top-2.5 left-3.5 z-10 bg-white px-1.5 text-xs font-semibold text-gray-400 leading-none">
                  Telefone *
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={phone}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3.5 text-sm font-medium text-gray-600 outline-none"
                />
              </div>

              {/* Seu nome */}
              <div className="relative">
                <label className="absolute -top-2.5 left-3.5 z-10 bg-white px-1.5 text-xs font-semibold text-gray-500 leading-none">
                  Seu nome *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-800 outline-none focus:border-[#8B5A2B] transition-all"
                />
              </div>

              {/* Data de nascimento */}
              <div className="relative">
                <label className="absolute -top-2.5 left-3.5 z-10 bg-white px-1.5 text-xs font-semibold text-gray-500 leading-none">
                  Data de nascimento *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  placeholder="DD/MM/AAAA"
                  value={nascimento}
                  onChange={(e) => setNascimento(formatBirthDate(e.target.value))}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-800 outline-none focus:border-[#8B5A2B] transition-all"
                />
              </div>

              {/* Notice text */}
              <p className="text-xs text-gray-500 text-center font-medium leading-relaxed px-1">
                Escolha uma senha. Ela será usada para garantir que só você terá acesso a suas informações e benefícios
              </p>

              {/* Senha */}
              <div className="relative">
                <label className="absolute -top-2.5 left-3.5 z-10 bg-white px-1.5 text-xs font-semibold text-gray-500 leading-none">
                  Senha *
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-800 outline-none focus:border-[#8B5A2B] transition-all"
                />
              </div>

              {/* Confirmar Senha */}
              <div className="relative">
                <label className="absolute -top-2.5 left-3.5 z-10 bg-white px-1.5 text-xs font-semibold text-gray-500 leading-none">
                  Confirmar Senha *
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-800 outline-none focus:border-[#8B5A2B] transition-all"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 p-2.5 text-center text-xs font-semibold text-red-600">
                  {error}
                </p>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !password || !confirmPassword || password !== confirmPassword}
                  className="flex w-full items-center justify-center rounded-xl store-bg-primary store-text-on-primary py-3.5 text-sm font-black hover:brightness-95 active:scale-[0.99] transition-all uppercase tracking-wide disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'CONFIRMAR'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
