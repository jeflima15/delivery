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
      <div className="flex items-start gap-3 rounded-[1.25rem] border border-[#e5e8e0] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)] transition-all duration-300 group-hover:-translate-y-[2px] group-hover:border-emerald-100 group-hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-800 dark:group-hover:border-emerald-900/30">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-inner ${
            isFidelity
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20'
              : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20'
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center pt-0.5">
          <h4 className="mb-1 text-[14px] font-black leading-none tracking-tight text-gray-950 transition-colors group-hover:text-amber-600 dark:text-white">
            {bloco.titulo || 'Mural de Informacoes'}
          </h4>
          <p className="line-clamp-2 text-[12px] font-medium leading-5 text-gray-500 dark:text-gray-400">
            {bloco.descricao || 'Clique para ver mais informacoes.'}
          </p>
        </div>

        {bloco.texto_botao && (
          <div className="mt-1 shrink-0">
            <span className="rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-amber-600">
              {bloco.texto_botao}
            </span>
          </div>
        )}
      </div>
    </a>
  );
}
