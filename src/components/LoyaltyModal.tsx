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

  // Mocks for visual structure parity with B3X print
  const history = [
    { type: 'gain', points: 63, order: '119', date: '28/11/2025 às 21:29' },
    { type: 'gain', points: 73, order: '107', date: '02/06/2025 às 20:48' },
    { type: 'gain', points: 50, order: '122', date: '03/03/2025 às 22:01' },
    { type: 'loss', points: 780, order: '122', date: '03/03/2025 às 22:01' },
    { type: 'gain', points: 37, order: '63', date: '18/11/2024 às 21:03' },
    { type: 'gain', points: 86, order: '61', date: '28/05/2024 às 21:26' },
  ];

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-center bg-black/60 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full sm:max-w-[440px] bg-white flex flex-col h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-xl animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-300 overflow-hidden">
        
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
           
           <div className="space-y-4">
             {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                   <div className="flex gap-4">
                      {h.type === 'gain' ? (
                         <div className="mt-1 w-5 h-5 rounded-full bg-white border border-emerald-500 flex items-center justify-center text-emerald-500 flex-shrink-0">
                           <Plus className="w-3 h-3" strokeWidth={3} />
                         </div>
                      ) : (
                         <div className="mt-1 w-5 h-5 rounded-full bg-white border border-blue-500 flex items-center justify-center text-blue-500 flex-shrink-0">
                           <Minus className="w-3 h-3" strokeWidth={3} />
                         </div>
                      )}
                      <div>
                         <span className={`block text-[13px] font-bold ${h.type === 'gain' ? 'text-emerald-500' : 'text-blue-500'}`}>
                           {h.type === 'gain' ? 'Ganhou' : 'Resgatou'} {h.points} pontos
                         </span>
                         <span className="block text-[12px] text-gray-400">Pedido N° {h.order}</span>
                      </div>
                   </div>
                   <span className="text-[11px] text-gray-400">{h.date}</span>
                </div>
             ))}
           </div>
           
           <div className="pt-6 pb-2 text-center">
             <button className="text-[11px] font-bold text-[#444] uppercase tracking-widest hover:text-emerald-600 transition-colors">
               Carregar mais
             </button>
           </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
