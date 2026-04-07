import React from 'react';
import { Gift, Info, Star } from 'lucide-react';

export default function InstitutionalCard({ bloco, onClick }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (onClick) onClick(bloco);
  };

  const isFidelity = bloco.tipo_bloco === 'fidelidade';
  
  const Icon = isFidelity ? Gift : (bloco.titulo?.toLowerCase().includes('avaliação') ? Star : Info);
  
  return (
    <a 
      href={bloco.acao_clique === 'link' ? (bloco.link_destino || '#') : '#'}
      onClick={bloco.acao_clique !== 'link' ? handleClick : undefined}
      target={bloco.acao_clique === 'link' && bloco.abrir_nova_aba ? '_blank' : '_self'}
      rel="noreferrer"
      className="block w-full cursor-pointer group"
    >
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm flex items-start gap-4 transition-all group-hover:shadow-md group-hover:border-emerald-100 dark:group-hover:border-emerald-900/30">
         <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${isFidelity ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'}`}>
            <Icon className="w-6 h-6" />
         </div>
         <div className="flex-1 min-w-0 flex flex-col justify-center pt-1">
            <h4 className="text-[15px] font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none mb-1.5 group-hover:text-amber-600 transition-colors">
               {bloco.titulo || 'Mural de Informações'}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed line-clamp-2">
               {bloco.descricao || 'Clique para ver mais informações.'}
            </p>
         </div>
         {bloco.texto_botao && (
           <div className="mt-2 shrink-0">
             <span className="text-[10px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-1 rounded-lg tracking-widest">{bloco.texto_botao}</span>
           </div>
         )}
      </div>
    </a>
  );
}
