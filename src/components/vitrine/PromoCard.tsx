import React from 'react';

export default function PromoCard({ bloco, onClick }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (onClick) onClick(bloco);
  };

  return (
    <div
      onClick={handleClick}
      className="group block h-full w-full cursor-pointer overflow-hidden rounded-[1.8rem] border border-[#e5e8e0] bg-white shadow-[0_16px_34px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-[2px] hover:shadow-[0_20px_44px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="aspect-[1.12/1] w-full shrink-0 border-b border-[#edf0ea] bg-[#f7f8f4] dark:border-slate-700 dark:bg-slate-700/60">
        {bloco.imagem_desktop ? (
          <img
            src={bloco.imagem_desktop}
            alt={bloco.titulo}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#f7f8f4] dark:bg-slate-700">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-300">Sem imagem</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-[18px]">
        <h3 className="line-clamp-2 text-[16px] font-black leading-tight tracking-tight text-gray-950 dark:text-white">
          {bloco.titulo}
        </h3>
        {bloco.descricao && (
          <p className="mt-2 line-clamp-3 text-[13px] leading-6 text-gray-500 dark:text-gray-400">
            {bloco.descricao}
          </p>
        )}
      </div>
    </div>
  );
}
