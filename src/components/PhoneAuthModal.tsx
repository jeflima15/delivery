import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { customerApi } from '../features/customer/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any, token: string) => void;
  tenantSlug?: string | null;
  storeWhatsapp?: string;
  onStageChange?: (stage: string) => void;
}

export default function PhoneAuthModal({
  isOpen,
  onClose,
  onLoginSuccess,
  tenantSlug,
  onStageChange,
}: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    setPhone('');
    setError('');
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) onStageChange?.('phone');
  }, [isOpen, onStageChange]);

  if (!isOpen) return null;

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      setError('Informe um número de telefone válido com DDD.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      if (!tenantSlug) throw new Error('Loja inválida.');
      const api = customerApi(tenantSlug);
      const result = await api.identify(phone);
      onLoginSuccess(result.user, 'phone');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível continuar.');
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Title & Subtitle matching B3X Print 1 */}
        <div className="text-center pt-2 pb-6">
          <h2 className="text-xl font-black text-gray-800 tracking-tight">
            Informe seu número de telefone
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-500 max-w-[280px] mx-auto leading-snug">
            Ele é importante para falarmos com você caso necessário
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Floating Label Phone Input */}
          <div className="relative">
            <label className="absolute -top-2.5 left-3.5 bg-white px-1.5 text-xs font-semibold text-gray-500">
              Telefone
            </label>
            <input
              ref={inputRef}
              type="tel"
              required
              value={phone}
              onChange={(e) => {
                setPhone(formatPhone(e.target.value));
                setError('');
              }}
              placeholder="(00) 00000-0000"
              className="w-full rounded-xl border-2 store-border-primary bg-blue-50/20 px-4 py-3.5 text-base font-semibold text-gray-800 outline-none transition-all"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 p-2.5 text-center text-xs font-semibold text-red-600">
              {error}
            </p>
          )}

          {/* Confirm Button */}
          <div>
            <button
              type="submit"
              disabled={loading || phone.replace(/\D/g, '').length < 10}
              className="flex w-full items-center justify-center rounded-xl store-bg-primary store-text-on-primary py-3.5 text-sm font-black uppercase tracking-wider hover:brightness-95 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'CONFIRMAR'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
