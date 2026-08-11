import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface CategoryItem {
  id: string;
  _id?: string;
  nome: string;
}

interface CategoryDropdownProps {
  categories: CategoryItem[];
  activeCategory: string;
  onSelectCategory: (id: string) => void;
  className?: string;
  defaultLabel?: string;
}

export default function CategoryDropdown({
  categories,
  activeCategory,
  onSelectCategory,
  className,
  defaultLabel = 'Lista de categorias',
}: CategoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeItem = categories.find((c) => (c._id || c.id) === activeCategory);
  const displayLabel = activeItem ? activeItem.nome.toUpperCase() : defaultLabel.toUpperCase();

  return (
    <div ref={containerRef} className={cn('relative inline-block text-left', className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className="inline-flex h-10 sm:h-11 w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-none transition-all cursor-pointer truncate"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span className="truncate font-semibold tracking-tight text-gray-700 uppercase">
          {displayLabel}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-[100] min-w-[220px] max-w-[320px] w-full max-h-[320px] overflow-y-auto rounded-xl border border-gray-200/80 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150 py-1 divide-y divide-gray-100">
          <button
            type="button"
            onClick={() => {
              onSelectCategory('all');
              setIsOpen(false);
            }}
            className={cn(
              'w-full px-4 py-3 text-left text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer',
              activeCategory === 'all'
                ? 'store-bg-primary store-text-on-primary font-black'
                : 'text-gray-600 hover:bg-gray-50'
            )}
          >
            Todas as categorias
          </button>
          {categories.map((cat) => {
            const catId = cat._id || cat.id;
            const isSelected = activeCategory === catId;
            return (
              <button
                key={catId}
                type="button"
                onClick={() => {
                  onSelectCategory(catId);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-3 text-left text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer truncate',
                  isSelected
                    ? 'store-bg-primary store-text-on-primary font-black'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                {cat.nome}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
