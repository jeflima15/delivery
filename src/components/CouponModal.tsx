import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface CouponModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (code: string) => Promise<{ success: boolean; message?: string }>;
}

export function CouponModal({ isOpen, onClose, onApply }: CouponModalProps) {
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen && mounted) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, mounted]);

  if (!isOpen || !mounted) return null;

  const handleApply = async () => {
    if (!code.trim()) return;

    setIsApplying(true);
    setErrorMessage('');

    const result = await onApply(code);

    if (!result.success) {
      setErrorMessage(result.message || 'Nao foi possivel validar este cupom.');
    } else {
      onClose();
    }

    setIsApplying(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-300 cursor-default"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">Cupons</h3>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-all hover:bg-gray-100 active:scale-95 dark:hover:bg-slate-700"
          >
            <X className="pointer-events-none h-5 w-5" />
          </button>
        </div>

        <div className="p-8">
          {errorMessage && (
            <p className="mb-4 text-center font-bold text-red-500 animate-in slide-in-from-top-2">
              {errorMessage}
            </p>
          )}

          <div className="mb-6 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Codigo do cupom"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                className="h-12 w-full rounded-lg border border-gray-200 px-4 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="px-4 text-sm font-bold uppercase text-emerald-600 transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {isApplying ? '...' : 'ADICIONAR'}
            </button>
          </div>

          <div className="border-t border-gray-100 pt-6 dark:border-slate-700">
            <p className="text-center font-bold text-gray-700 dark:text-slate-300">
              Insira o seu codigo de desconto no campo acima.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
