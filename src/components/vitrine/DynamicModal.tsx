import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function DynamicModal({ isOpen, onClose, bloco }) {
  useEffect(() => {
    if (isOpen && bloco) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, bloco]);

  if (!isOpen || !bloco) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 animate-in fade-in duration-200 sm:p-6"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-slate-800"
        onClick={e => e.stopPropagation()}
      >
        {/* Cover Image */}
        {(bloco.modal_imagem || bloco.imagem_desktop) && (
           <div className="w-full h-48 sm:h-64 relative bg-gray-100 dark:bg-slate-800 shrink-0">
             <img src={bloco.modal_imagem || bloco.imagem_desktop} alt="Promo" className="w-full h-full object-cover" />
             <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
             
             <button 
                onClick={onClose} 
                className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white shadow-lg transition-all hover:bg-black/60 active:scale-90 cursor-pointer z-50"
                aria-label="Fechar modal"
             >
               <X className="w-5 h-5 pointer-events-none" />
             </button>
           </div>
        )}

        {/* Content */}
        <div className="px-6 py-8 sm:px-8 overflow-y-auto">
            {!bloco.modal_imagem && !bloco.imagem_desktop && (
              <div className="flex justify-end -mt-4 mb-2">
                  <button 
                    onClick={onClose} 
                    className="p-3 bg-gray-100 dark:bg-slate-800 text-gray-500 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-90 transition-all cursor-pointer shadow-sm"
                  >
                    <X className="w-5 h-5 pointer-events-none" />
                  </button>
              </div>
            )}

           <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase leading-tight mb-4">
              {bloco.modal_titulo || bloco.titulo}
           </h2>
           
           <div className="prose prose-sm dark:prose-invert">
              <p className="text-[15px] leading-relaxed font-medium text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                 {bloco.modal_texto_completo || bloco.descricao}
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}
