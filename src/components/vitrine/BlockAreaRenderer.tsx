import React from 'react';
import CampaignBanner from './CampaignBanner';
import PromoCard from './PromoCard';
import InstitutionalCard from './InstitutionalCard';

export default function BlockAreaRenderer({ blocos, position, onBlockClick }) {
  const filteredBlocks = blocos.filter(b => b.posicao_exibicao === position);

  if (filteredBlocks.length === 0) return null;

  return (
    <div className={`mb-8 ${position === 'below_hero' ? 'mt-4' : 'mt-8'}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {filteredBlocks.map(bloco => {
          let colSpanClass = 'col-span-1';
          
          if (bloco.tipo_bloco === 'banner_principal') {
             // Banner wants full width most of the time
             colSpanClass = 'col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4';
          } else if (bloco.tipo_bloco === 'card_institucional' || bloco.tipo_bloco === 'fidelidade') {
             // These can take more space to look clean
             colSpanClass = 'col-span-1 sm:col-span-2';
          }

          return (
             <div key={bloco._id} className={colSpanClass}>
                {bloco.tipo_bloco === 'banner_principal' && <CampaignBanner bloco={bloco} onClick={onBlockClick} />}
                {bloco.tipo_bloco === 'card_promocional' && <PromoCard bloco={bloco} onClick={onBlockClick} />}
                {(bloco.tipo_bloco === 'card_institucional' || bloco.tipo_bloco === 'fidelidade') && <InstitutionalCard bloco={bloco} onClick={onBlockClick} />}
                {bloco.tipo_bloco === 'texto' && (
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-emerald-100 dark:border-slate-700 h-full flex items-center justify-center text-center shadow-sm">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300 italic">{bloco.descricao}</p>
                  </div>
                )}
             </div>
          );
        })}
      </div>
    </div>
  );
}
