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
      <div className="flex items-start gap-4 rounded-[1.6rem] border border-[#e5e8e0] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)] transition-all duration-300 group-hover:-translate-y-[2px] group-hover:shadow-[0_20px_44px_rgba(15,23,42,0.08)] group-hover:border-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:group-hover:border-emerald-900/30">
         <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-inner ${isFidelity ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'}`}>
            <Icon className="w-6 h-6" />
         </div>
         <div className="flex-1 min-w-0 flex flex-col justify-center pt-1">
            <h4 className="mb-1.5 text-[15px] font-black leading-none tracking-tight text-gray-950 transition-colors group-hover:text-amber-600 dark:text-white">
               {bloco.titulo || 'Mural de Informações'}
            </h4>
            <p className="line-clamp-2 text-[13px] font-medium leading-6 text-gray-500 dark:text-gray-400">
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
