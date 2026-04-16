import React from 'react';
import CampaignBanner from './CampaignBanner';
import PromoCard from './PromoCard';
import InstitutionalCard from './InstitutionalCard';

export default function BlockAreaRenderer({ blocos, position, onBlockClick, isLoyaltyActive = true }) {
  const filteredBlocks = blocos.filter(
    (b) => b.posicao_exibicao === position && (isLoyaltyActive || b.tipo_bloco !== 'fidelidade')
  );
  const totalBlocks = filteredBlocks.length;

  if (filteredBlocks.length === 0) return null;

  return (
    <div className={position === 'below_hero' ? 'mt-0' : 'mt-1'}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-3.5">
        {filteredBlocks.map((bloco) => {
          let colSpanClass = 'lg:col-span-4';

          if (bloco.tipo_bloco === 'banner_principal') {
            colSpanClass = 'lg:col-span-12';
          } else if (position === 'below_hero' && totalBlocks === 1) {
            colSpanClass = bloco.tipo_bloco === 'card_promocional' ? 'lg:col-span-4 xl:col-span-3' : 'lg:col-span-4';
          } else if (totalBlocks === 1) {
            colSpanClass = bloco.tipo_bloco === 'card_promocional' ? 'lg:col-span-5' : 'lg:col-span-6';
          } else if (totalBlocks === 2) {
            colSpanClass = 'lg:col-span-6';
          } else if (bloco.tipo_bloco === 'card_institucional' || bloco.tipo_bloco === 'fidelidade') {
            colSpanClass = 'lg:col-span-6';
          } else if (position === 'below_hero') {
            colSpanClass = 'lg:col-span-4';
          }

          return (
            <div
              key={bloco._id}
              className={position === 'below_hero' && totalBlocks === 1 ? `${colSpanClass} lg:max-w-[240px] xl:max-w-[232px]` : colSpanClass}
            >
              {bloco.tipo_bloco === 'banner_principal' && <CampaignBanner bloco={bloco} onClick={onBlockClick} />}
              {bloco.tipo_bloco === 'card_promocional' && <PromoCard bloco={bloco} onClick={onBlockClick} />}
              {(bloco.tipo_bloco === 'card_institucional' || bloco.tipo_bloco === 'fidelidade') && (
                <InstitutionalCard bloco={bloco} onClick={onBlockClick} />
              )}
              {bloco.tipo_bloco === 'texto' && (
                <div className="flex h-full items-center justify-center rounded-[1rem] border border-[#e5e8e0] bg-white p-3.5 text-center shadow-[0_10px_22px_rgba(15,23,42,0.045)] dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-[12px] font-bold italic leading-5 text-gray-700 dark:text-gray-300">
                    {bloco.descricao}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
