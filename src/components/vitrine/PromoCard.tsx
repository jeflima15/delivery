import React from 'react';

export default function PromoCard({ bloco, onClick }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (onClick) onClick(bloco);
  };

  return (
    <div 
      onClick={handleClick}
      className="block w-full overflow-hidden rounded-[1.5rem] bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-100 dark:border-slate-700 flex flex-col h-full"
    >
      <div className="w-full aspect-video bg-gray-100 dark:bg-slate-800 shrink-0 border-b border-gray-50 dark:border-slate-700/50">
        {bloco.imagem_desktop ? (
          <img 
            src={bloco.imagem_desktop} 
            alt={bloco.titulo} 
            className="w-full h-full object-cover" 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-slate-700">
             <span className="text-gray-300 font-bold uppercase tracking-widest text-xs">Sem Imagem</span>
          </div>
        )}
      </div>
      
      <div className="p-4 flex flex-col pt-3 pb-5 flex-1">
          <h3 className="text-[15px] font-black text-gray-900 dark:text-white uppercase tracking-tight leading-tight line-clamp-2">
             {bloco.titulo}
          </h3>
          {bloco.descricao && (
            <p className="text-[#88888b] dark:text-gray-400 font-medium text-[11px] leading-snug mt-1.5 line-clamp-2">
              {bloco.descricao}
            </p>
          )}
      </div>
    </div>
  );
}
