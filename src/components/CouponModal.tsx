import React, { useState, useEffect } from 'react';
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
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, mounted]);

  if (!isOpen || !mounted) return null;

  const handleApply = async () => {
    if (!code.trim()) return;
    setIsApplying(true);
    setErrorMessage('');
    
    // SimulaÃ§Ã£o de check de cupom via Props ou lÃ³gica interna
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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">Cupons</h3>
          <button 
            onClick={onClose} 
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-400 active:scale-95 transition-all cursor-pointer"
          >
            <X className="w-5 h-5 pointer-events-none" />
          </button>
        </div>

        <div className="p-8">
          {errorMessage && (
            <p className="text-red-500 text-center font-bold mb-4 animate-in slide-in-from-top-2">
              {errorMessage}
            </p>
          )}

          <div className="flex items-center gap-2 mb-6">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="CÃ³digo do cupom"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                className="w-full h-12 px-4 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="px-4 font-bold text-emerald-600 hover:opacity-80 transition-opacity disabled:opacity-50 uppercase text-sm"
            >
              {isApplying ? '...' : 'ADICIONAR'}
            </button>
          </div>

          <div className="border-t border-gray-100 dark:border-slate-700 pt-6">
            <p className="text-gray-700 dark:text-slate-300 font-bold text-center">
              Insira o seu cÃ³digo de desconto no campo acima.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
