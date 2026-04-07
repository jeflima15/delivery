import React from 'react';
import { X, ArrowRight } from 'lucide-react';

export default function DynamicModal({ isOpen, onClose, bloco }) {
  if (!isOpen || !bloco) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
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
                className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-black/50 transition-colors"
                aria-label="Agendar"
             >
               <X className="w-5 h-5" />
             </button>
           </div>
        )}

        {/* Content */}
        <div className="px-6 py-8 sm:px-8 overflow-y-auto">
           {!bloco.modal_imagem && !bloco.imagem_desktop && (
             <div className="flex justify-end -mt-4 mb-2">
                 <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-slate-800 text-gray-500 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                   <X className="w-5 h-5" />
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

        {/* CTA */}
        {bloco.modal_cta_texto && (
          <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 shrink-0">
             <a 
                href={bloco.modal_cta_link || '#'} 
                target={bloco.abrir_nova_aba ? '_blank' : '_self'}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 hover:-translate-y-0.5 transition-all"
             >
                {bloco.modal_cta_texto} <ArrowRight className="w-4 h-4" />
             </a>
          </div>
        )}
      </div>
    </div>
  );
}
