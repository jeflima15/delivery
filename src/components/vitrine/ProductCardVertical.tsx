import React, { memo } from 'react';
import { Store, Gift } from 'lucide-react';
import { cn } from '../../lib/utils';
import { comboIsPurchasable, isComboProduct } from '../../lib/combo';

interface ProductCardVerticalProps {
  product: any;
  products: any[];
  isLoyaltyActive: boolean;
  onClick: (product: any) => void;
}

const ProductCardVertical = memo(function ProductCardVertical({
  product,
  products,
  isLoyaltyActive,
  onClick
}: ProductCardVerticalProps) {
  const unavailable = isComboProduct(product) ? !comboIsPurchasable(product, products) : product.esgotado;
  const temDesconto = product.preco_antigo > product.preco;
  const percentualDesconto = temDesconto
    ? Math.max(1, Math.round(((product.preco_antigo - product.preco) / product.preco_antigo) * 100))
    : 0;

  return (
    <div
      onClick={() => !unavailable && onClick(product)}
      className={cn(
        'group relative flex h-[262px] w-44 shrink-0 cursor-pointer flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:store-border-soft sm:h-auto sm:w-full',
        unavailable && 'cursor-not-allowed opacity-70 grayscale-[0.8]'
      )}
    >
      <div className="relative h-[148px] w-full shrink-0 bg-white p-1 sm:h-[180px] md:h-[200px]">
        <div className="relative h-full w-full overflow-hidden rounded-lg bg-gray-50">
          {product.imagem ? (
            <img
              src={product.imagem}
              alt={product.nome}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Store className="h-8 w-8 text-gray-300" />
            </div>
          )}

          {unavailable ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/35 backdrop-blur-[1px]">
              <span className="rounded-md bg-gray-900/80 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                Esgotado
              </span>
            </div>
          ) : null}

          {temDesconto && !unavailable ? (
            <span className="absolute left-2 top-2 z-10 rounded-md bg-red-500 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white">
              -{percentualDesconto}%
            </span>
          ) : null}

          {isLoyaltyActive && product.pode_resgatar && !unavailable ? (
            <span className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full store-bg-primary store-text-on-primary shadow-sm">
              <Gift className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-2.5 sm:p-3">
        <h3 className="line-clamp-2 text-[14px] font-medium leading-5 text-gray-700 sm:text-[15px]">
          {product.nome}
        </h3>
        {isComboProduct(product) && <span className="mt-1 w-fit rounded store-bg-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider store-text-primary">Combo</span>}
        {product.descricao ? (
          <p className="mt-1 line-clamp-2 text-[12px] font-light leading-4 text-gray-500 sm:text-[13px]">
            {product.descricao}
          </p>
        ) : null}
        <div className="mt-auto flex items-center gap-1.5 pt-2">
          <span className="text-[15px] font-normal leading-5 text-gray-700">
            {isComboProduct(product) ? 'A partir de ' : ''}R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
          </span>
          {temDesconto ? (
            <span className="text-[10px] font-normal text-gray-400 line-through">
              R$ {product.preco_antigo.toFixed(2).replace('.', ',')}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export default ProductCardVertical;
