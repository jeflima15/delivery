import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Gift, Clock, Plus, Minus, ShoppingBag } from 'lucide-react';

interface LoyaltyModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

export default function LoyaltyModal({ isOpen, onClose, user }: LoyaltyModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Mocks removed: No fake data. Just displaying empty state since full points ledger is not available backward/persistently

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex justify-center bg-black/60 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full sm:max-w-[440px] bg-white flex flex-col h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-xl animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-300 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0 relative">
          <h2 className="text-[15px] font-bold text-[#444] tracking-tight w-full text-center">Programa de fidelidade</h2>
          <button 
            onClick={onClose}
            className="absolute right-6 w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 scrollbar-thin space-y-3">
           
           <div className="border border-emerald-600 rounded-xl p-4 flex items-center gap-4">
              <Gift className="w-6 h-6 text-emerald-600" />
              <div>
                 <span className="block text-[15px] font-bold text-[#444]">{user?.pontos || 0}</span>
                 <span className="block text-[12px] text-gray-400 font-medium">pontos disponíveis</span>
              </div>
           </div>

           <div className="border border-gray-200 rounded-xl p-4 flex items-center gap-4">
              <Clock className="w-6 h-6 text-gray-400" />
              <div>
                 <span className="block text-[15px] font-bold text-[#444]">0</span>
                 <span className="block text-[12px] text-gray-400 font-medium">pontos pendentes</span>
              </div>
           </div>

           <div className="border border-gray-200 rounded-xl p-4 flex items-center gap-4">
              <div className="w-6 h-6 rounded-full border border-gray-400 flex items-center justify-center text-gray-400">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                 <span className="block text-[15px] font-bold text-[#444]">0</span>
                 <span className="block text-[12px] text-gray-400 font-medium">pontos resgatados</span>
              </div>
           </div>

           <div className="border border-gray-200 rounded-xl p-4 flex items-center gap-4 mb-8">
              <ShoppingBag className="w-6 h-6 text-gray-400" />
              <div>
                 <span className="block text-[15px] font-bold text-[#444]">0</span>
                 <span className="block text-[12px] text-gray-400 font-medium">resgates feitos</span>
              </div>
           </div>

           <h3 className="font-bold text-[13px] text-[#444] mt-8 mb-4">Histórico de atividades</h3>
           
           <div className="py-8 text-center bg-gray-50 rounded-xl border border-gray-100 mb-4">
              <Gift className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-[13px] text-gray-500 font-medium px-4">Você ainda não tem um histórico detalhado de pontos.</p>
           </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
