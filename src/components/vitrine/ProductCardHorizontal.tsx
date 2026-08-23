import React, { memo } from 'react';
import { Store, Gift } from 'lucide-react';
import { cn } from '../../lib/utils';
import { comboIsPurchasable, isComboProduct } from '../../lib/combo';

interface ProductCardHorizontalProps {
  product: any;
  products: any[];
  isLoyaltyActive: boolean;
  onClick: (product: any) => void;
}

const getBadgeConfig = (label: string) => {
  if (!label) return null;
  const t = label.trim().toLowerCase();
  
  if (t.includes('novo') || t.includes('novidade') || t.includes('lançamento')) {
    return { type: 'ribbon', style: 'store-bg-primary' };
  }
  if (t.includes('mais pedido') || t.includes('popular') || t.includes('vendido')) {
    return { type: 'pill', style: 'border border-[#fed7aa] bg-[#fff7ed] text-[#c2410c] shadow-[0_6px_18px_rgba(234,88,12,0.08)]' };
  }
  if (t.includes('recomendado') || t.includes('sugestão') || t.includes('chef')) {
    return { type: 'pill', style: 'border border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8] shadow-[0_6px_18px_rgba(59,130,246,0.08)]' };
  }
  if (t.includes('limitada') || t.includes('esgotando')) {
    return { type: 'pill', style: 'border border-[#fbcfe8] bg-[#fdf2f8] text-[#be185d] shadow-[0_6px_18px_rgba(190,24,93,0.08)]' };
  }
  if (t.includes('promoção') || t.includes('oferta') || t.includes('imperdível')) {
    return { type: 'pill', style: 'border store-border-soft store-bg-soft store-text-primary' };
  }
  return { type: 'pill', style: 'border border-stone-200 bg-stone-50 text-stone-700' };
};

const ProductCardHorizontal = memo(function ProductCardHorizontal({
  product,
  products,
  isLoyaltyActive,
  onClick
}: ProductCardHorizontalProps) {
  const unavailable = isComboProduct(product) ? !comboIsPurchasable(product, products) : product.esgotado;
  const temDesconto = product.preco_antigo > product.preco;
  const badgeConfig = getBadgeConfig(product.selo_destaque);
  const percentualDesconto = temDesconto
    ? Math.max(1, Math.round(((product.preco_antigo - product.preco) / product.preco_antigo) * 100))
    : 0;

  return (
    <div
      onClick={() => !unavailable && onClick(product)}
      className={cn(
        "relative flex h-[146px] min-h-[112px] w-full overflow-hidden rounded-lg border border-[rgba(0,0,0,0.12)] bg-white p-2 transition-colors group sm:h-[154px]",
        product.destaque && !unavailable ? "store-bg-soft" : "hover:bg-gray-50/50",
        unavailable
          ? "cursor-not-allowed opacity-75 grayscale-[0.6]"
          : "cursor-pointer"
      )}
    >
      <div className={cn('flex h-full min-w-0 flex-1 flex-col justify-between p-2', badgeConfig && 'pt-7')}>
        {badgeConfig && !unavailable ? (
          <span className={cn('absolute left-4 top-3 max-w-[55%] truncate rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wide', badgeConfig.style)}>
            {product.selo_destaque}
          </span>
        ) : null}
        <div>
          <h3 className="line-clamp-1 text-[15px] font-medium leading-5 text-[#374151] sm:text-base sm:leading-6">
            {product.nome}
          </h3>
          {isComboProduct(product) && <span className="mt-1 inline-flex rounded store-bg-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider store-text-primary">Combo</span>}
          
          {product.descricao && (
            <p className="mt-1.5 line-clamp-2 text-[13px] font-light leading-[18px] text-[#6b7280] sm:mt-2 sm:text-sm sm:leading-5">
              {product.descricao}
            </p>
          )}
        </div>

        <div className="mt-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-normal leading-6 text-[#374151]">
              {isComboProduct(product) ? 'A partir de ' : ''}R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
            </span>
            {temDesconto && (
              <span className="text-[11px] font-normal text-gray-400 line-through">
                R$ {product.preco_antigo.toFixed(2).replace('.', ',')}
              </span>
            )}
            {temDesconto && !unavailable ? (
              <span className="rounded-md store-bg-soft px-1.5 py-0.5 text-[9px] font-bold store-text-primary">
                -{percentualDesconto}%
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative ml-2 flex h-[128px] w-[128px] shrink-0 items-center justify-center p-1 sm:ml-4 sm:h-[136px] sm:w-[136px]">
        <div className="w-full h-full relative rounded-lg overflow-hidden bg-gray-50 border border-gray-100/50">
           {product.imagem ? (
            <img 
              src={product.imagem} 
              alt={product.nome} 
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" 
            />
           ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-300"><Store className="h-6 w-6" /></div>
           )}
           
           {unavailable ? <div className="absolute inset-0 z-20 bg-white/35 backdrop-blur-[1px]" /> : null}
           {unavailable ? (
             <div className="absolute -right-8 top-4 z-30 w-28 rotate-45 bg-gray-700 py-1 text-center text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">
               Esgotado
             </div>
           ) : null}

        {isLoyaltyActive && product.pode_resgatar && !unavailable && (
          <div className="absolute right-2.5 top-2.5 z-30 flex h-9 w-9 items-center justify-center rounded-full store-bg-primary store-text-on-primary shadow-sm">
            <Gift className="h-4 w-4" />
          </div>
        )}
        </div>
      </div>
    </div>
  );
});

export default ProductCardHorizontal;
