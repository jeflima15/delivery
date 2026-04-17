import React from 'react';

export default function PromoCard({ bloco, onClick }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (onClick) onClick(bloco);
  };

  return (
    <div
      onClick={handleClick}
      className="group relative flex flex-col w-full h-full cursor-pointer bg-white border border-black/[0.12] rounded-lg overflow-hidden shadow-none"
    >
      <div className="p-1">
        <div className="w-full overflow-hidden rounded-lg h-36 md:h-56 bg-gray-50 flex-shrink-0">
          {bloco.imagem_desktop ? (
            <img
              src={bloco.imagem_desktop}
              alt={bloco.titulo}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-50">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-300">Sem imagem</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-between space-y-1 sm:space-y-2 flex-1 p-2 pt-2 sm:p-2.5">
        <h3 className="text-base font-medium leading-6 text-gray-700 line-clamp-2">
          {bloco.titulo}
        </h3>
        {bloco.descricao && (
          <p className="text-sm font-light text-gray-500 line-clamp-2">
            {bloco.descricao}
          </p>
        )}
      </div>
    </div>
  );
}
