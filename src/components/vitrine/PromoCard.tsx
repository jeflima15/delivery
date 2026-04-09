import React from 'react';

export default function PromoCard({ bloco, onClick }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (onClick) onClick(bloco);
  };

  return (
    <div
      onClick={handleClick}
      className="block h-full w-full cursor-pointer overflow-hidden rounded-[1.35rem] border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="aspect-[1.25/1] w-full shrink-0 border-b border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-700/60">
        {bloco.imagem_desktop ? (
          <img
            src={bloco.imagem_desktop}
            alt={bloco.titulo}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-50 dark:bg-slate-700">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Sem imagem</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-4 pb-5 pt-4">
        <h3 className="line-clamp-2 text-[15px] font-black leading-tight tracking-tight text-gray-900 dark:text-white">
          {bloco.titulo}
        </h3>
        {bloco.descricao && (
          <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">
            {bloco.descricao}
          </p>
        )}
      </div>
    </div>
  );
}
