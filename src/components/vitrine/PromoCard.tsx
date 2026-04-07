import React from 'react';

export default function PromoCard({ bloco, onClick }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (onClick) onClick(bloco);
  };

  return (
    <a 
      href={bloco.acao_clique === 'link' ? (bloco.link_destino || '#') : '#'}
      onClick={bloco.acao_clique !== 'link' ? handleClick : undefined}
      target={bloco.acao_clique === 'link' && bloco.abrir_nova_aba ? '_blank' : '_self'}
      rel="noreferrer"
      className="block w-full overflow-hidden rounded-[1.5rem] shadow-sm hover:shadow-md transition-all relative group cursor-pointer border border-gray-100 dark:border-slate-800"
    >
      <div className="aspect-[4/3] w-full relative bg-gray-50 dark:bg-slate-800 overflow-hidden">
        {bloco.imagem_desktop ? (
          <img 
            src={bloco.imagem_desktop} 
            alt={bloco.titulo} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
          />
        ) : (
          <div 
            className="w-full h-full p-6 flex flex-col justify-end relative overflow-hidden" 
            style={{ backgroundColor: bloco.cor_fundo || '#10b981' }}
          >
             <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent z-10"></div>
             <div className="relative z-20">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter leading-tight drop-shadow-md">
                   {bloco.titulo}
                </h3>
                {bloco.descricao && (
                  <p className="text-white/90 mt-1 font-medium text-sm line-clamp-2 drop-shadow">
                    {bloco.descricao}
                  </p>
                )}
             </div>
          </div>
        )}
        
        {/* Subtle Overlay to make text pop if the image has text */}
        {bloco.imagem_desktop && (bloco.titulo || bloco.descricao) && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-5">
              <h3 className="text-lg font-black text-white uppercase tracking-tight drop-shadow-lg leading-tight">{bloco.titulo}</h3>
              {bloco.descricao && <p className="text-white/80 text-xs font-semibold mt-1 drop-shadow-md line-clamp-2">{bloco.descricao}</p>}
          </div>
        )}
      </div>
    </a>
  );
}
