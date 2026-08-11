import React from 'react';

export default function CampaignBanner({ bloco, onClick }) {
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
      className="group relative block h-full w-full cursor-pointer overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:store-border-soft"
    >
      {bloco.imagem_desktop ? (
        <div className="relative h-full min-h-[140px] w-full overflow-hidden bg-gray-100">
           <img 
             src={bloco.imagem_desktop} 
             alt={bloco.titulo} 
             className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
           />
           {/* Gradient overlay for text legibility if text exists */}
           {(bloco.titulo || bloco.descricao) && (
              <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-black/75 via-black/35 to-transparent p-4 text-left md:p-6">
                 <h2 className="mb-2 w-3/4 max-w-lg text-lg font-black leading-none tracking-tighter text-white drop-shadow-xl md:text-[1.6rem]">
                    {bloco.titulo}
                 </h2>
                 {bloco.descricao && (
                   <p className="max-w-sm text-[12px] font-semibold text-white/90 drop-shadow-md md:text-[13px]">
                      {bloco.descricao}
                   </p>
                 )}
                 {bloco.texto_botao && (
                   <div className="mt-5 flex">
                     <span className="store-bg-primary store-text-on-primary px-4 py-1.5 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-md store-bg-primary-hover transition-colors">
                       {bloco.texto_botao}
                     </span>
                   </div>
                 )}
              </div>
           )}
        </div>
      ) : (
        <div 
          className="w-full h-48 md:h-64 flex flex-col items-center justify-center text-center p-8 relative overflow-hidden"
          style={{ backgroundColor: bloco.cor_fundo || '#10b981' }}
        >
          <div className="absolute inset-0 bg-black/10 mix-blend-overlay"></div>
          <h2 className="relative z-10 text-3xl md:text-4xl font-black text-white uppercase tracking-tighter drop-shadow-lg leading-tight w-full max-w-2xl">
             {bloco.titulo}
          </h2>
          {bloco.descricao && (
            <p className="relative z-10 text-white/90 font-medium text-sm md:text-base mt-2 max-w-lg drop-shadow-sm">
               {bloco.descricao}
            </p>
          )}
          {bloco.texto_botao && (
            <span className="relative z-10 mt-6 bg-white shrink-0 text-gray-900 px-8 py-3 rounded-xl font-black uppercase tracking-widest text-sm shadow-xl group-hover:-translate-y-1 transition-transform">
               {bloco.texto_botao}
            </span>
          )}
        </div>
      )}
    </a>
  );
}
