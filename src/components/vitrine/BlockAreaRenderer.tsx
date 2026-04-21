import React, { useEffect, useState } from 'react';
import CampaignBanner from './CampaignBanner';
import PromoCard from './PromoCard';
import InstitutionalCard from './InstitutionalCard';
import { ChevronRight, ChevronLeft } from 'lucide-react';

const GAP = 16;
const VISIBLE_COUNT = 3;
const CARD_WIDTH = 300;
const CARD_HEIGHT = 326;

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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(media.matches);

    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  if (totalBlocks === 0) return null;

  // ── below_hero: CARROSSEL HORIZONTAL (B3X) ──
  if (position === 'below_hero') {
    const cardWidth = isMobile ? 176 : CARD_WIDTH;
    const cardHeight = isMobile ? 262 : CARD_HEIGHT;
    const gap = isMobile ? 10 : GAP;
    const visibleCount = isMobile ? 2 : VISIBLE_COUNT;
    const step = cardWidth + gap;
    const maxIndex = Math.max(0, totalBlocks - visibleCount);
    const canGoRight = carouselIndex < maxIndex;
    const canGoLeft = carouselIndex > 0;
    const translateX = -(carouselIndex * step);
    const trackWidth = totalBlocks * cardWidth + (totalBlocks - 1) * gap;

    return (
      <div
        className="relative"
        style={{ height: cardHeight + 16, padding: '8px 0' }}
      >
        {/* Viewport Interno (Corta os cards mas não as setas) */}
        <div className="h-full w-full overflow-x-auto overflow-y-hidden sm:overflow-hidden" style={{ scrollbarWidth: 'none' }}>
          {/* Track */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              gap,
              width: trackWidth,
              transform: `translateX(${translateX}px)`,
              transition: 'transform 300ms ease-in-out',
            }}
          >
            {filteredBlocks.map((bloco) => (
              <div
                key={bloco._id}
                style={{
                  width: cardWidth,
                  minWidth: cardWidth,
                  maxWidth: cardWidth,
                  height: cardHeight,
                  flexShrink: 0,
                  flexGrow: 0,
                }}
              >
                {renderBlockContent(bloco, onBlockClick)}
              </div>
            ))}
          </div>
        </div>

        {/* Seta Esquerda */}
        {canGoLeft && (
          <button
            onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
            aria-label="Anterior"
            className="hidden sm:flex"
            style={{
              position: 'absolute',
              zIndex: 50,
              top: '50%',
              left: -16,
              transform: 'translateY(-50%)',
              width: 40,
              height: 40,
              borderRadius: 9999,
              border: '1px solid rgba(0,0,0,0.12)',
              background: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <ChevronLeft style={{ width: 24, height: 24, color: '#374151' }} />
          </button>
        )}

        {/* Seta Direita */}
        {canGoRight && (
          <button
            onClick={() => setCarouselIndex((i) => Math.min(maxIndex, i + 1))}
            aria-label="Próximo"
            className="hidden sm:flex"
            style={{
              position: 'absolute',
              zIndex: 50,
              top: '50%',
              right: -16,
              transform: 'translateY(-50%)',
              width: 40,
              height: 40,
              borderRadius: 9999,
              border: '1px solid rgba(0,0,0,0.12)',
              background: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              paddingLeft: 2,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <ChevronRight style={{ width: 24, height: 24, color: '#374151' }} />
          </button>
        )}
      </div>
    );
  }

  // ── Outras posições: Grid padrão (inalterado) ──
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
