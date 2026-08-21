import type { ImgHTMLAttributes } from 'react';
import { platformBrand } from '../../config/brand';

type BrandVariant = 'full' | 'icon';
type BrandSize = 'sm' | 'md' | 'lg' | 'xl';

interface Props {
  variant?: BrandVariant;
  size?: BrandSize;
  light?: boolean;
  className?: string;
  priority?: boolean;
}

const fullSizes: Record<BrandSize, string> = {
  sm: 'w-[58px]',
  md: 'w-[76px]',
  lg: 'w-[112px]',
  xl: 'w-[168px]',
};

const iconSizes: Record<BrandSize, string> = {
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-2xl',
  xl: 'h-16 w-16 rounded-2xl',
};

/** Exibicao oficial e centralizada da identidade Pode Vir. */
export default function PodeVirBrand({
  variant = 'full',
  size = 'md',
  light = false,
  className = '',
  priority = false,
}: Props) {
  const commonImageProps: ImgHTMLAttributes<HTMLImageElement> = {
    alt: platformBrand.name,
    draggable: false,
    decoding: 'async',
    loading: priority ? 'eager' : 'lazy',
  };

  const isIcon = variant === 'icon';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-sm ring-1 ring-black/[0.06] ${
        isIcon ? iconSizes[size] : `rounded-xl ${fullSizes[size]}`
      } ${light ? 'ring-white/15' : ''} ${className}`}
    >
      <img
        {...commonImageProps}
        src={isIcon ? platformBrand.assets.mark : platformBrand.assets.logo}
        className={`block select-none object-contain ${isIcon ? 'h-full w-full' : 'h-auto w-full'}`}
      />
    </span>
  );
}
