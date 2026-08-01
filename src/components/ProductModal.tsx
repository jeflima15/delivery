// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { X, Minus, Plus, Store, Gift } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Product {
  _id: string;
  nome: string;
  descricao: string;
  preco: number;
  imagem?: string;
  personalizavel: boolean;
  quantidade_total_opcoes: number;
  opcoes_disponiveis: string[];
  grupos_adicionais?: {
    nome: string;
    obrigatorio: boolean;
    minimo: number;
    maximo: number;
    itens: { nome: string; preco: number }[];
  }[];
  pode_resgatar?: boolean;
  pontos_resgate?: number;
  preco_antigo?: number;
  destaque?: boolean;
  selo_destaque?: string;
}

interface ProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (item: any) => void;
  initialData?: any;
  isLoyaltyActive?: boolean;
}

function formatCurrency(value: number) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function SectionShell({
  title,
  subtitle,
  badge,
  counter,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-b border-gray-200">
      <div className="sticky top-[59px] z-10 flex min-h-12 items-center justify-between gap-3 border-b border-gray-200 bg-gray-100 px-4 py-2.5 text-gray-700 sm:top-0 md:block md:py-4">
        <div className="min-w-0 space-y-1">
          <div className="truncate text-sm font-medium leading-5">{title}</div>
          {subtitle ? <div className="truncate text-xs font-light leading-4 text-gray-500">{subtitle}</div> : null}
        </div>
        {(counter || badge) && (
          <div className="flex shrink-0 items-center gap-1.5 md:hidden">
            {counter ? (
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium leading-4 text-gray-500 ring-1 ring-gray-200">
                {counter}
              </span>
            ) : null}
            {badge ? (
              <span className="rounded-full store-bg-soft px-2 py-0.5 text-[9px] font-bold uppercase leading-4 tracking-[0.12em] store-text-primary ring-1 store-ring-soft">
                {badge}
              </span>
            ) : null}
          </div>
        )}
      </div>
      <div className="divide-y divide-gray-200">{children}</div>
    </section>
  );
}

export default function ProductModal({
  product,
  isOpen,
  onClose,
  onAddToCart,
  initialData,
  isLoyaltyActive = false,
}: ProductModalProps) {
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [groupSelections, setGroupSelections] = useState<Record<string, Record<string, number>>>({});
  const [quantity, setQuantity] = useState(1);
  const [observation, setObservation] = useState('');
  const [showMobileHeader, setShowMobileHeader] = useState(false);
  const legacyOptions = product?.opcoes_disponiveis || [];
  const additionalGroups = product?.grupos_adicionais || [];

  useEffect(() => {
    if (product && isOpen) {
      if (initialData) {
        setSelections(initialData.selections || {});
        setGroupSelections(initialData.groupSelections || {});
        setQuantity(initialData.quantidade || 1);
        setObservation(initialData.observacao || '');
      } else {
        const initialSelections: Record<string, number> = {};
        legacyOptions.forEach((opcao) => {
          initialSelections[opcao] = 0;
        });
        setSelections(initialSelections);

        const initialGroups: Record<string, Record<string, number>> = {};
        additionalGroups.forEach((group) => {
          initialGroups[group.nome] = {};
          (group.itens || []).forEach((item) => {
            initialGroups[group.nome][item.nome] = 0;
          });
        });
        setGroupSelections(initialGroups);
        setQuantity(1);
        setObservation('');
      }
      setShowMobileHeader(false);
    }
  }, [product, isOpen, initialData]);

  useEffect(() => {
    if (isOpen && product) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const totalSelected = Object.values(selections).reduce((acc: number, value: any) => acc + (value as number), 0) as number;
  const remaining = (product.quantidade_total_opcoes || 0) - totalSelected;
  const isLimitReached = totalSelected >= (product.quantidade_total_opcoes || 0);
  const oldPersonalizationInvalid = product.personalizavel && totalSelected !== product.quantidade_total_opcoes;

  let newGroupsInvalid = false;
  let totalAdicionais = 0;

  if (additionalGroups.length > 0) {
    additionalGroups.forEach((group) => {
      const currentCount = Object.values(groupSelections[group.nome] || {}).reduce((a: number, b: any) => a + (b as number), 0);
      if (group.obrigatorio && currentCount < group.minimo) newGroupsInvalid = true;

      (group.itens || []).forEach((item) => {
        const qtd = (groupSelections[group.nome] || {})[item.nome] || 0;
        totalAdicionais += qtd * item.preco;
      });
    });
  }

  const isAddDisabled = oldPersonalizationInvalid || newGroupsInvalid;
  const precoFinalProduto = product.preco + totalAdicionais;
  const temDesconto = (product.preco_antigo ?? 0) > product.preco;
  const percentualDesconto = temDesconto
    ? Math.max(1, Math.round((((product.preco_antigo ?? 0) - product.preco) / (product.preco_antigo ?? 0)) * 100))
    : 0;
  const observationCount = observation.length;
  const totalText = formatCurrency(precoFinalProduto * quantity);
  const productImage = product.imagem?.trim();

  const handleIncrementOption = (opcao: string) => {
    if (!isLimitReached) {
      setSelections((prev) => ({ ...prev, [opcao]: (prev[opcao] || 0) + 1 }));
    }
  };

  const handleDecrementOption = (opcao: string) => {
    if ((selections[opcao] || 0) > 0) {
      setSelections((prev) => ({ ...prev, [opcao]: prev[opcao] - 1 }));
    }
  };

  const handleGroupIncrement = (groupName: string, itemName: string, maximo: number) => {
    const currentCount = Object.values(groupSelections[groupName] || {}).reduce((a: number, b: any) => a + (b as number), 0);
    if (currentCount < maximo) {
      setGroupSelections((prev) => ({
        ...prev,
        [groupName]: {
          ...prev[groupName],
          [itemName]: (prev[groupName]?.[itemName] || 0) + 1,
        },
      }));
    }
  };

  const handleGroupDecrement = (groupName: string, itemName: string) => {
    if ((groupSelections[groupName]?.[itemName] || 0) > 0) {
      setGroupSelections((prev) => ({
        ...prev,
        [groupName]: {
          ...prev[groupName],
          [itemName]: prev[groupName][itemName] - 1,
        },
      }));
    }
  };

  const handleAddToCart = () => {
    if (isAddDisabled) return;

    const opcoes_escolhidas: any[] = [];
    const secureOptions: Array<{ groupId: string; itemId: string; quantity: number }> = [];

    Object.entries(selections).forEach(([opcao, qtd]) => {
      if (qtd > 0) opcoes_escolhidas.push({ opcao, quantidade: qtd });
    });

    if (additionalGroups.length > 0) {
      additionalGroups.forEach((group) => {
        (group.itens || []).forEach((item) => {
          const qtd = groupSelections[group.nome]?.[item.nome] || 0;
          if (qtd > 0) {
            const tagPreco = item.preco > 0 ? ` (+ ${formatCurrency(item.preco)})` : '';
            opcoes_escolhidas.push({
              opcao: `${group.nome}: ${item.nome}${tagPreco}`,
              quantidade: qtd,
            });
            if (group._id && item._id) secureOptions.push({ groupId: group._id, itemId: item._id, quantity: qtd });
          }
        });
      });
    }

    const cartItem = {
      produtoId: product._id || product.id,
      nome: product.nome,
      imagem: product.imagem,
      preco_unitario: precoFinalProduto,
      quantidade: quantity,
      opcoes_escolhidas,
      selections,
      groupSelections,
      secureOptions,
      subtotal: precoFinalProduto * quantity,
      observacao: observation.trim() || undefined,
      is_resgate: isLoyaltyActive ? initialData?.is_resgate || false : false,
      pode_resgatar: isLoyaltyActive ? product.pode_resgatar : false,
      pontos_resgate: isLoyaltyActive ? product.pontos_resgate : 0,
    };

    onAddToCart(cartItem);
    onClose();
  };

  const renderProductImage = (imageClassName: string, fallbackClassName: string) =>
    productImage ? (
      <img
        src={productImage}
        alt={product.nome}
        className={imageClassName}
        referrerPolicy="no-referrer"
      />
    ) : (
      <div className={fallbackClassName}>
        <Store className="h-10 w-10" />
        <span className="text-xs font-semibold uppercase tracking-[0.24em]">Sem imagem</span>
      </div>
    );

  const renderMobileStickyHeader = () => (
    <div
      className={cn(
        'sticky top-0 z-40 -mb-[59px] flex h-[59px] items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 pb-3 pt-4 shadow-sm transition-all duration-150 sm:hidden',
        showMobileHeader ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0 pointer-events-none'
      )}
    >
      <h3 className="min-w-0 truncate text-base font-medium leading-6 text-gray-700">{product.nome}</h3>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar detalhes do produto"
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const renderProductDetails = () => (
    <div className="px-4 pb-4 pt-4 md:px-4 md:pb-4 md:pt-0">
      <div className="rounded-t-[22px] bg-white md:rounded-t-2xl">
        <div className="space-y-4 px-0 pt-0 md:px-0 md:pt-0">
          <div className="w-full space-y-3">
            <h3 className="text-base font-medium leading-6 text-gray-700">
              {product.nome}
            </h3>
            {product.descricao ? (
              <p className="whitespace-pre-wrap text-[14px] font-light leading-5 text-gray-500">
                {product.descricao}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('text-base font-normal leading-6 text-gray-700', temDesconto && 'store-text-primary')}>
                {formatCurrency(product.preco)}
              </span>
              {temDesconto ? (
                <>
                  <span className="text-sm font-normal text-gray-500 line-through">
                    {formatCurrency(product.preco_antigo || 0)}
                  </span>
                  <span className="rounded-full store-bg-soft px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] store-text-primary">
                    -{percentualDesconto}% off
                  </span>
                </>
              ) : null}
            </div>
          </div>

          {isLoyaltyActive && product.pode_resgatar ? (
            <div className="mt-4 flex items-center space-x-3 rounded-md border border-gray-200/80 p-3">
              <div className="flex-shrink-0">
                <div className="rounded-full store-bg-soft p-2 store-text-primary md:shadow-sm">
                  <Gift className="h-5 w-5" />
                </div>
              </div>
              <div className="flex flex-1 flex-col space-y-1">
                <span className="text-[13px] font-medium leading-snug text-gray-700">
                  Resgate a partir de {product.pontos_resgate} pontos
                </span>
                <span className="text-xs font-light text-gray-500">
                  Se desejar resgatar este produto, adicione-o a sacola e solicite o resgate ao finalizar o pedido.
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const renderOptionsAndObservation = () => (
    <div className="flex flex-col gap-0">
      {product.personalizavel && legacyOptions.length > 0 ? (
        <SectionShell
          title="Escolha seus complementos"
          subtitle={`Escolha até ${product.quantidade_total_opcoes} opções${remaining > 0 ? ` - faltam ${remaining}` : ''}`}
          counter={`${totalSelected}/${product.quantidade_total_opcoes || 0}`}
          badge={oldPersonalizationInvalid ? 'Obrigatório' : undefined}
        >
          {legacyOptions.map((opcao) => (
            <div key={opcao} className="flex min-h-[52px] items-center justify-between px-4 transition-colors hover:bg-gray-50">
              <div className="flex-1 py-3 pr-4 md:py-4">
                <div className="flex items-center text-sm font-normal text-gray-700">{opcao}</div>
              </div>
              <div className="ml-5 flex items-center">
                <button
                  type="button"
                  onClick={() => handleDecrementOption(opcao)}
                  disabled={(selections[opcao] || 0) === 0}
                  className="text-xl store-text-primary disabled:text-gray-300"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <div className="min-w-6 text-center text-sm font-normal text-gray-700">
                  {selections[opcao] || 0}
                </div>
                <button
                  type="button"
                  onClick={() => handleIncrementOption(opcao)}
                  disabled={isLimitReached}
                  className="text-xl store-text-primary disabled:text-gray-300"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </SectionShell>
      ) : null}

      {additionalGroups.map((group) => {
        const selectedCount = Object.values(groupSelections[group.nome] || {}).reduce((a: number, b: any) => a + (b as number), 0);
        const isMaxReached = selectedCount >= group.maximo;
        const subtitleParts = [];
        if (group.minimo > 0 && group.maximo > 0) {
          subtitleParts.push(`Escolha de ${group.minimo} até ${group.maximo} opções`);
        } else if (group.maximo > 0) {
          subtitleParts.push(`Escolha até ${group.maximo} opções`);
        }
        if (group.obrigatorio) subtitleParts.push('Obrigatório');

        return (
          <SectionShell
            key={group.nome}
            title={group.nome}
            subtitle={subtitleParts.join(' - ')}
            counter={group.maximo > 0 ? `${selectedCount}/${group.maximo}` : undefined}
            badge={group.obrigatorio ? 'Obrigatório' : undefined}
          >
            {(group.itens || []).map((item) => {
              const itemQuantity = groupSelections[group.nome]?.[item.nome] || 0;

              return (
                <div key={item.nome} className="flex min-h-[52px] items-center justify-between px-4 transition-colors hover:bg-gray-50">
                  <div className="flex-1 py-3 pr-4 md:py-4">
                    <div className="flex items-center text-sm font-normal text-gray-700">{item.nome}</div>
                    {item.preco > 0 ? (
                      <div className="mt-1 text-xs font-medium text-gray-700">+ {formatCurrency(item.preco)}</div>
                    ) : null}
                  </div>
                  <div className="ml-5 flex items-center">
                    <button
                      type="button"
                      onClick={() => handleGroupDecrement(group.nome, item.nome)}
                      disabled={itemQuantity === 0}
                      className="text-xl store-text-primary disabled:text-gray-300"
                    >
                      <Minus className="h-5 w-5" />
                    </button>
                    <div className="min-w-6 text-center text-sm font-normal text-gray-700">{itemQuantity}</div>
                    <button
                      type="button"
                      onClick={() => handleGroupIncrement(group.nome, item.nome, group.maximo)}
                      disabled={isMaxReached}
                      className="text-xl store-text-primary disabled:text-gray-300"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </SectionShell>
        );
      })}

      <div className="w-full border-t border-gray-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between pb-2">
          <span className="text-sm font-light text-gray-500 md:hidden">Observações</span>
          <span className="hidden text-sm font-light text-gray-500 md:inline">Alguma observação?</span>
          <span className="text-xs font-light text-gray-500">{observationCount} / 140</span>
        </div>
        <div>
          <textarea
            rows={3}
            maxLength={140}
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Ex.: retirar cebola, molho à parte..."
            className="h-[86px] w-full resize-none rounded-md border border-gray-300 px-3 py-3 text-sm leading-5 text-gray-700 outline-none transition-colors placeholder:text-gray-400 store-focus md:h-auto"
          />
        </div>
      </div>
    </div>
  );

  const renderFooterBar = () => (
    <div className="z-30 shrink-0 border-t border-gray-200 bg-white p-3 shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between space-x-3">
        <div className="flex h-11 w-[112px] shrink-0 items-center space-x-4 rounded-md bg-gray-100 p-3 text-sm">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            className="p-0 text-xl text-gray-700 disabled:text-gray-300"
          >
            <Minus className="h-5 w-5" />
          </button>
          <span className="min-w-4 text-center text-sm font-normal text-gray-700">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity(quantity + 1)}
            className="p-0 text-xl text-gray-700"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleAddToCart}
          disabled={isAddDisabled}
          className={cn(
            'flex h-11 flex-1 items-center justify-between rounded-md px-3 text-sm font-medium store-text-on-primary transition-colors',
            isAddDisabled ? 'cursor-not-allowed opacity-55 store-bg-primary' : 'store-bg-primary store-bg-primary-hover'
          )}
        >
          <div>{initialData ? 'Atualizar' : 'Adicionar'}</div>
          <div>{totalText}</div>
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-6 cursor-default"
      onClick={onClose}
    >
      <div
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-white shadow-2xl animate-in fade-in slide-in-from-bottom duration-300 sm:h-[92vh] sm:rounded-t-[28px] md:h-auto md:min-h-[360px] md:w-[clamp(760px,72vw,808px)] md:max-h-[calc(100vh-80px)] md:flex-row md:items-stretch md:rounded-xl md:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhes do produto"
          className="absolute right-5 top-4 z-40 hidden h-[30px] w-[30px] items-center justify-center rounded-full bg-gray-200 text-gray-500 transition-colors hover:bg-white hover:text-gray-700 sm:flex"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex min-h-0 flex-1 flex-col sm:hidden">
          <div
            className="relative min-h-0 flex-1 overflow-y-auto thin-scrollbar"
            onScroll={(event) => setShowMobileHeader(event.currentTarget.scrollTop > 300)}
          >
            {renderMobileStickyHeader()}

            <div className="relative flex h-[100vw] max-h-[420px] min-h-[320px] w-full shrink-0 items-center justify-center bg-white p-0">
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar detalhes do produto"
                className="absolute right-5 top-4 z-30 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gray-200 text-gray-500 transition-colors active:bg-gray-100 active:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-none bg-white">
                {renderProductImage(
                  'block h-full max-h-full w-full max-w-full object-contain object-center',
                  'flex h-full w-full flex-col items-center justify-center gap-3 bg-gray-50 text-gray-300'
                )}
              </div>
            </div>

            {renderProductDetails()}
            {renderOptionsAndObservation()}
          </div>

          {renderFooterBar()}
        </div>

        <div className="hidden h-[100vw] max-h-[420px] min-h-[320px] w-full shrink-0 items-center justify-center bg-white p-0 sm:flex sm:h-auto sm:min-h-0 sm:px-4 sm:pb-4 sm:pt-12 md:basis-[52%] md:px-5 md:py-5">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-none bg-white sm:h-[220px] sm:rounded-2xl md:h-full md:min-h-[300px] md:rounded-xl">
            {renderProductImage(
              'block h-full max-h-full w-full max-w-full object-contain object-center sm:h-auto sm:max-h-[82%] sm:w-auto sm:max-w-[88%]',
              'flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl bg-gray-50 text-gray-300 md:rounded-xl'
            )}
          </div>
        </div>

        <div className="relative hidden min-h-0 w-full flex-1 flex-col overflow-hidden border-l-0 sm:flex md:basis-[48%] md:border-l md:border-gray-100">
          <div className="hidden flex-shrink-0 overflow-hidden border-b border-gray-100 md:flex">
            <div className="flex h-16 w-full items-center bg-gray-100 pl-4 pr-16 font-medium text-gray-700">
              Detalhes do produto
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
              {renderProductDetails()}
              {renderOptionsAndObservation()}
            </div>

            {renderFooterBar()}
          </div>
        </div>
      </div>
    </div>
  );
}
