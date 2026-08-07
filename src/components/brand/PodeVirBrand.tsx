import React from 'react';

interface Props {
  variant?: 'full' | 'icon' | 'wordmark';
  size?: 'sm' | 'md' | 'lg';
  light?: boolean;
  className?: string;
}

export default function PodeVirBrand({ variant = 'full', size = 'md', light = false, className = '' }: Props) {
  const sizeClasses = {
    sm: { box: 'h-7 w-7 rounded-lg text-xs', text: 'text-sm' },
    md: { box: 'h-9 w-9 rounded-xl text-sm', text: 'text-base' },
    lg: { box: 'h-12 w-12 rounded-2xl text-lg', text: 'text-xl' },
  }[size];

  const iconBox = (
    <span
      className={`inline-flex items-center justify-center font-black tracking-tight shadow-sm transition-transform ${sizeClasses.box} ${
        light
          ? 'bg-white text-[#0b7a53]'
          : 'bg-gradient-to-br from-[#0b7a53] to-[#14231d] text-white border border-emerald-500/20'
      }`}
    >
      <span className="flex items-center">
        <span>P</span>
        <span className={light ? 'text-[#059669]' : 'text-emerald-400'}>V</span>
      </span>
    </span>
  );

  if (variant === 'icon') return <div className={`inline-flex items-center ${className}`}>{iconBox}</div>;

  const wordmark = (
    <span className={`font-black tracking-tight ${sizeClasses.text} ${light ? 'text-white' : 'text-slate-900'}`}>
      Pode<span className={light ? 'text-emerald-400' : 'text-[#0b7a53]'}>Vir</span>
    </span>
  );

  if (variant === 'wordmark') return <div className={`inline-flex items-center ${className}`}>{wordmark}</div>;

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {iconBox}
      {wordmark}
    </div>
  );
}
