import React, { useState } from 'react';
import CampaignBanner from './CampaignBanner';
import PromoCard from './PromoCard';
import InstitutionalCard from './InstitutionalCard';
import { ChevronRight, ChevronLeft } from 'lucide-react';

const CARD_WIDTH = 300;
const GAP = 16;
const STEP = CARD_WIDTH + GAP; // 316px
const VISIBLE_COUNT = 3;

function renderBlockContent(bloco, onBlockClick) {
  if (bloco.tipo_bloco === 'banner_principal') return <CampaignBanner bloco={bloco} onClick={onBlockClick} />;
  if (bloco.tipo_bloco === 'card_promocional') return <PromoCard bloco={bloco} onClick={onBlockClick} />;
  if (bloco.tipo_bloco === 'card_institucional' || bloco.tipo_bloco === 'fidelidade') {
    return <InstitutionalCard bloco={bloco} onClick={onBlockClick} />;
  }
  if (bloco.tipo_bloco === 'texto') {
    return (
      <div className="flex h-full items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white p-3.5 text-center">
        <p className="text-[12px] font-bold italic leading-5 text-gray-700">
          {bloco.descricao}
        </p>
      </div>
    );
  }
  return null;
}

export default function BlockAreaRenderer({ blocos, position, onBlockClick, isLoyaltyActive = true }) {
  const filteredBlocks = blocos.filter(
    (b) => b.posicao_exibicao === position && (isLoyaltyActive || b.tipo_bloco !== 'fidelidade')
  );
  const totalBlocks = filteredBlocks.length;
  const [carouselIndex, setCarouselIndex] = useState(0);

  if (totalBlocks === 0) return null;

  // ── below_hero: CARROSSEL HORIZONTAL (B3X) ──
  if (position === 'below_hero') {
    const maxIndex = Math.max(0, totalBlocks - VISIBLE_COUNT);
    const canGoRight = carouselIndex < maxIndex;
    const canGoLeft = carouselIndex > 0;
    const translateX = -(carouselIndex * STEP);

    return (
      <div className="relative h-full py-2 overflow-hidden mt-0">
        {/* Track */}
        <div
          className="grid gap-4 transition-all duration-300 ease-in-out"
          style={{
            gridTemplateColumns: `repeat(${totalBlocks}, ${CARD_WIDTH}px)`,
            transform: `translateX(${translateX}px)`,
          }}
        >
          {filteredBlocks.map((bloco) => (
            <div
              key={bloco._id}
              className="flex-shrink-0"
              style={{ width: CARD_WIDTH, height: 326 }}
            >
              {renderBlockContent(bloco, onBlockClick)}
            </div>
          ))}
        </div>

        {/* Seta Esquerda */}
        {canGoLeft && (
          <button
            onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
            className="hidden sm:flex absolute z-10 items-center justify-center w-8 h-8 transform -translate-y-1/2 bg-white border border-[rgba(0,0,0,0.12)] rounded-full top-1/2 md:w-10 md:h-10 hover:bg-gray-100 -left-2.5 md:-left-4"
            aria-label="Anterior"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-gray-600" />
          </button>
        )}

        {/* Seta Direita */}
        {canGoRight && (
          <button
            onClick={() => setCarouselIndex((i) => Math.min(maxIndex, i + 1))}
            className="hidden sm:flex absolute z-10 items-center justify-center w-8 h-8 pl-0.5 transform -translate-y-1/2 bg-white border border-[rgba(0,0,0,0.12)] rounded-full top-1/2 md:w-10 md:h-10 hover:bg-gray-100 -right-2.5 md:-right-4"
            aria-label="Próximo"
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-gray-600" />
          </button>
        )}
      </div>
    );
  }

  // ── Outras posições: Grid padrão ──
  return (
    <div className="relative h-full py-2 overflow-hidden mt-1">
      <div className="grid gap-3 transition-all duration-200 sm:gap-4 lg:grid-cols-12">
        {filteredBlocks.map((bloco) => {
          let colSpanClass = 'lg:col-span-4';

          if (bloco.tipo_bloco === 'banner_principal') {
            colSpanClass = 'lg:col-span-12';
          } else if (totalBlocks === 1) {
            colSpanClass = bloco.tipo_bloco === 'card_promocional' ? 'lg:col-span-5' : 'lg:col-span-6';
          } else if (totalBlocks === 2) {
            colSpanClass = 'lg:col-span-6';
          } else if (bloco.tipo_bloco === 'card_institucional' || bloco.tipo_bloco === 'fidelidade') {
            colSpanClass = 'lg:col-span-6';
          }

          return (
            <div key={bloco._id} className={colSpanClass}>
              {renderBlockContent(bloco, onBlockClick)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
