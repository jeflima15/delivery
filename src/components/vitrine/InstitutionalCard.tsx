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
      className="group block h-full w-full cursor-pointer"
    >
      <div className="flex h-full items-start gap-3 rounded-lg border border-gray-200 bg-white p-3.5 transition-colors hover:store-border-soft dark:border-slate-700 dark:bg-slate-800">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-inner ${
            isFidelity
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20'
              : 'store-bg-soft store-text-primary'
          }`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center pt-0.5">
          <h4 className="mb-1 text-[13px] font-black leading-none tracking-tight text-gray-950 transition-colors group-hover:store-text-primary dark:text-white">
            {bloco.titulo || 'Mural de Informacoes'}
          </h4>
          <p className="line-clamp-2 text-[11px] font-medium leading-5 text-gray-500 dark:text-gray-400">
            {bloco.descricao || 'Clique para ver mais informacoes.'}
          </p>
        </div>

        {bloco.texto_botao && (
          <div className="mt-1 shrink-0">
            <span className="rounded-lg store-bg-soft px-2 py-1 text-[8px] font-black uppercase tracking-widest store-text-primary">
              {bloco.texto_botao}
            </span>
          </div>
        )}
      </div>
    </a>
  );
}
