import React from 'react';
import { Gift, Info, Star } from 'lucide-react';

export default function InstitutionalCard({ bloco, onClick }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (onClick) onClick(bloco);
  };

  const isFidelity = bloco.tipo_bloco === 'fidelidade';
  const Icon = isFidelity ? Gift : (bloco.titulo?.toLowerCase().includes('avalia') ? Star : Info);

  return (
    <a
      href={bloco.acao_clique === 'link' ? (bloco.link_destino || '#') : '#'}
      onClick={bloco.acao_clique !== 'link' ? handleClick : undefined}
      target={bloco.acao_clique === 'link' && bloco.abrir_nova_aba ? '_blank' : '_self'}
      rel="noreferrer"
      className="block w-full cursor-pointer group"
    >
      <div className="flex items-start gap-3 rounded-lg border border-black/[0.12] bg-white p-3.5 shadow-none transition-all duration-300 group-hover:bg-gray-50">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-inner ${
            isFidelity
              ? 'bg-amber-50 text-amber-600'
              : 'bg-emerald-50 text-emerald-600'
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center pt-0.5">
          <h4 className="mb-0.5 text-sm font-semibold tracking-tight text-gray-700">
            {bloco.titulo || 'Mural de Informacoes'}
          </h4>
          <p className="line-clamp-2 text-xs font-light text-gray-500">
            {bloco.descricao || 'Clique para ver mais informacoes.'}
          </p>
        </div>

        {bloco.texto_botao && (
          <div className="mt-1 shrink-0">
            <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              {bloco.texto_botao}
            </span>
          </div>
        )}
      </div>
    </a>
  );
}
