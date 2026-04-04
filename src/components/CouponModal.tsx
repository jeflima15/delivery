import React, { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

interface CouponModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (code: string) => Promise<boolean>;
}

export function CouponModal({ isOpen, onClose, onApply }: CouponModalProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  if (!isOpen) return null;

  const handleApply = async () => {
    if (!code.trim()) return;
    setIsApplying(true);
    setError(false);
    
    // Simulação de check de cupom via Props ou lógica interna
    const success = await onApply(code);
    
    if (!success) {
      setError(true);
    } else {
      onClose();
    }
    setIsApplying(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">Cupons</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8">
          {error && (
            <p className="text-red-500 text-center font-bold mb-4 animate-in slide-in-from-top-2">
              Cupom não encontrado.
            </p>
          )}

          <div className="flex items-center gap-2 mb-6">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Código do cupom"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-12 px-4 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#A37852] dark:bg-slate-900 dark:text-white"
              />
            </div>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="px-4 font-bold text-[#A37852] hover:opacity-80 transition-opacity disabled:opacity-50 uppercase text-sm"
            >
              {isApplying ? '...' : 'ADICIONAR'}
            </button>
          </div>

          <div className="border-t border-gray-100 dark:border-slate-700 pt-6">
            <p className="text-gray-700 dark:text-slate-300 font-bold text-center">
              Insira o seu código de desconto no campo acima.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
