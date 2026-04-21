import React from 'react';

export default function PromoCard({ bloco, onClick }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (onClick) onClick(bloco);
  };

  return (
    <div
      onClick={handleClick}
      className="relative flex flex-col w-full h-full cursor-pointer bg-white border border-[rgba(0,0,0,0.12)] rounded-[8px]"
    >
      <div className="p-1">
        <div className="h-[92px] w-full overflow-hidden rounded-lg sm:h-36 md:h-56">
          {bloco.imagem_desktop ? (
            <img
              src={bloco.imagem_desktop}
              alt={bloco.titulo}
              className="bg-gray-100 object-cover object-center w-full h-full block"
            />
          ) : (
            <div className="flex w-full h-full block items-center justify-center bg-gray-100">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Sem imagem</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between space-y-1 p-2 pt-1.5 sm:space-y-2 sm:p-2.5 sm:pt-2">
        <h3 className="line-clamp-2 text-[13px] font-medium leading-4 text-gray-700 sm:text-base sm:leading-6">
          {bloco.titulo}
        </h3>
        {bloco.descricao && (
          <p className="line-clamp-1 text-[11px] font-light leading-4 text-gray-500 sm:line-clamp-2 sm:text-sm">
            {bloco.descricao}
          </p>
        )}
      </div>
    </div>
  );
}
