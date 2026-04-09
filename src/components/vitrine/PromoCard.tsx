import React from 'react';
import { ArrowRight, Gift, Megaphone, Sparkles } from 'lucide-react';

const blockLabelMap = {
  banner_principal: 'Destaque',
  card_promocional: 'Promocao',
  card_institucional: 'Institucional',
  fidelidade: 'Fidelidade',
  texto: 'Comunicado',
};

const blockIconMap = {
  banner_principal: Sparkles,
  card_promocional: Megaphone,
  card_institucional: Sparkles,
  fidelidade: Gift,
  texto: Sparkles,
};

export default function PromoCard({ bloco, onClick }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (onClick) onClick(bloco);
  };

  const imageUrl = bloco.imagem_desktop || bloco.imagem_mobile;
  const label = blockLabelMap[bloco.tipo_bloco] || 'Vitrine';
  const Icon = blockIconMap[bloco.tipo_bloco] || Sparkles;
  const ctaText = bloco.texto_botao || (bloco.acao_clique === 'modal' ? 'Ver detalhes' : 'Saiba mais');
  const hasCustomPalette = !imageUrl && (bloco.cor_fundo || bloco.cor_texto);

  return (
    <article
      onClick={handleClick}
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[30px] border border-gray-200/70 bg-white shadow-[0_18px_50px_-38px_rgba(15,23,42,0.42)] transition-all hover:-translate-y-0.5 hover:shadow-[0_26px_70px_-40px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="relative aspect-[1.25/1] overflow-hidden border-b border-gray-100 bg-gray-100 dark:border-slate-800 dark:bg-slate-800">
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={bloco.titulo}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
          </>
        ) : (
          <div
            className="flex h-full w-full items-end p-6"
            style={{
              backgroundColor: bloco.cor_fundo || '#0f172a',
              color: bloco.cor_texto || '#ffffff',
            }}
          >
            <div className="space-y-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                <Icon className="h-6 w-6" />
              </span>
              <p className="max-w-[210px] text-2xl font-black leading-none tracking-tight">{bloco.titulo || label}</p>
            </div>
          </div>
        )}

        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-gray-700 shadow-sm backdrop-blur">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
      </div>

      <div
        className="flex flex-1 flex-col p-5"
        style={hasCustomPalette ? { backgroundColor: bloco.cor_fundo, color: bloco.cor_texto } : undefined}
      >
        {bloco.subtitulo && (
          <p className="text-[11px] font-black uppercase tracking-[0.24em] opacity-70">{bloco.subtitulo}</p>
        )}

        <h3 className="mt-2 text-xl font-black leading-tight tracking-tight">{bloco.titulo}</h3>

        {bloco.descricao && (
          <p className="mt-3 line-clamp-3 text-sm leading-6 opacity-80">{bloco.descricao}</p>
        )}

        <div className="mt-auto flex items-center justify-between pt-5">
          <span className="text-[11px] font-black uppercase tracking-[0.24em] opacity-80">{ctaText}</span>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/5 transition-transform duration-300 group-hover:translate-x-1 dark:bg-white/10">
            <ArrowRight className="h-5 w-5" />
          </span>
        </div>
      </div>
    </article>
  );
}
