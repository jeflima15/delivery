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
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-b border-gray-200">
      <div className="bg-gray-100 px-4 py-4 text-gray-700">
        <div className="space-y-1.5">
          <div className="text-sm font-medium">{title}</div>
          {subtitle ? <div className="text-xs font-light text-gray-500">{subtitle}</div> : null}
        </div>
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
      subtotal: precoFinalProduto * quantity,
      observacao: observation.trim() || undefined,
      is_resgate: isLoyaltyActive ? initialData?.is_resgate || false : false,
      pode_resgatar: isLoyaltyActive ? product.pode_resgatar : false,
      pontos_resgate: isLoyaltyActive ? product.pontos_resgate : 0,
    };

    onAddToCart(cartItem);
    onClose();
  };

  const productImage = product.imagem?.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-6 cursor-default"
      onClick={onClose}
    >
      <div
        className="relative flex h-[92vh] w-full max-w-[808px] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl animate-in fade-in slide-in-from-bottom duration-300 md:h-[640px] md:max-h-[640px] md:flex-row md:rounded-xl md:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhes do produto"
          className="absolute right-4 top-4 z-40 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gray-200 text-gray-500 transition-colors hover:bg-white hover:text-gray-700 md:right-5"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex w-full shrink-0 items-center justify-center bg-white p-4 md:w-[424px] md:p-5">
          <div className="relative flex h-[220px] w-full items-center justify-center overflow-hidden rounded-2xl bg-gray-50 md:h-[384px] md:w-[384px] md:rounded-xl">
            {productImage ? (
              <img
                src={productImage}
                alt={product.nome}
                className="block h-full w-full object-contain object-center"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gray-50 text-gray-300">
                <Store className="h-10 w-10" />
                <span className="text-xs font-semibold uppercase tracking-[0.24em]">Sem imagem</span>
              </div>
            )}
          </div>
        </div>

        <div className="relative flex min-h-0 w-full flex-1 flex-col border-l-0 md:w-[384px] md:border-l md:border-gray-100">
          <div className="hidden flex-shrink-0 overflow-hidden md:flex">
            <div className="flex h-20 w-full items-center bg-gray-100 pb-4 pl-4 font-medium text-gray-700">
              Detalhes do produto
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto thin-scrollbar">
            <div className="px-5 pb-5 pt-4 md:px-4 md:pb-4 md:pt-0">
              <div className="rounded-t-[22px] bg-white md:rounded-t-2xl">
                <div className="space-y-4 px-0 pt-4 md:px-0 md:pt-0">
                  <div className="w-full space-y-3">
                    <h3 className="text-base font-medium leading-6 text-gray-700 md:text-[28px] md:font-black md:leading-[1.05] md:tracking-tight">
                      {product.nome}
                    </h3>
                    {product.descricao ? (
                      <p className="whitespace-pre-wrap text-sm font-light leading-6 text-gray-500 md:text-[13px] md:leading-6">
                        {product.descricao}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-base font-normal', temDesconto ? 'text-emerald-500' : 'text-gray-700')}>
                        {formatCurrency(product.preco)}
                      </span>
                      {temDesconto ? (
                        <>
                          <span className="text-sm text-gray-500 line-through">
                            {formatCurrency(product.preco_antigo || 0)}
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
                            -{percentualDesconto}% off
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {isLoyaltyActive && product.pode_resgatar ? (
                    <div className="flex items-center space-x-3 rounded-md border border-gray-200 border-opacity-80 p-3">
                      <div className="flex-shrink-0">
                        <div className="rounded-full bg-emerald-600 p-2 text-white shadow-sm">
                          <Gift className="h-5 w-5" />
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col space-y-1">
                        <span className="font-medium leading-snug text-gray-700 text-[13px]">
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

            <div className="flex flex-col gap-0">
              {product.personalizavel && legacyOptions.length > 0 ? (
                <SectionShell
                  title="Escolha seus complementos"
                  subtitle={`Escolha ate ${product.quantidade_total_opcoes} opcoes${remaining > 0 ? ` - faltam ${remaining}` : ''}`}
                >
                  {legacyOptions.map((opcao) => (
                    <div key={opcao} className="flex items-center justify-between px-4 transition-colors hover:bg-gray-50">
                      <div className="flex-1 py-4 pr-4">
                        <div className="flex items-center text-sm font-normal text-gray-700">{opcao}</div>
                      </div>
                      <div className="ml-5 flex items-center">
                        <button
                          type="button"
                          onClick={() => handleDecrementOption(opcao)}
                          disabled={(selections[opcao] || 0) === 0}
                          className="text-xl text-emerald-600 disabled:text-gray-300"
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
                          className="text-xl text-emerald-600 disabled:text-gray-300"
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
                  subtitleParts.push(`Escolha de ${group.minimo} ate ${group.maximo} opcoes`);
                } else if (group.maximo > 0) {
                  subtitleParts.push(`Escolha ate ${group.maximo} opcoes`);
                }
                if (group.obrigatorio) subtitleParts.push('Obrigatorio');

                return (
                  <SectionShell
                    key={group.nome}
                    title={group.nome}
                    subtitle={subtitleParts.join(' - ')}
                  >
                    {(group.itens || []).map((item) => {
                      const itemQuantity = groupSelections[group.nome]?.[item.nome] || 0;

                      return (
                        <div key={item.nome} className="flex items-center justify-between px-4 transition-colors hover:bg-gray-50">
                          <div className="flex-1 py-4 pr-4">
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
                              className="text-xl text-emerald-600 disabled:text-gray-300"
                            >
                              <Minus className="h-5 w-5" />
                            </button>
                            <div className="min-w-6 text-center text-sm font-normal text-gray-700">{itemQuantity}</div>
                            <button
                              type="button"
                              onClick={() => handleGroupIncrement(group.nome, item.nome, group.maximo)}
                              disabled={isMaxReached}
                              className="text-xl text-emerald-600 disabled:text-gray-300"
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

              <div className="w-full">
                <div className="flex items-center justify-between p-4 pb-2">
                  <span className="text-sm font-light text-gray-500">Alguma observacao?</span>
                  <span className="text-xs font-light text-gray-500">{observationCount} / 140</span>
                </div>
                <div className="p-4 pt-0">
                  <textarea
                    rows={3}
                    maxLength={140}
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    placeholder="Ex.: retirar cebola, molho a parte..."
                    className="w-full resize-none rounded-md border border-gray-300 px-3 py-3 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="z-30 border-t border-gray-200 bg-white p-3 shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between space-x-3">
              <div className="flex h-11 items-center space-x-4 rounded-md bg-gray-100 p-3 text-sm">
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
                  'flex h-11 flex-1 items-center justify-between rounded-md px-3 text-sm font-medium text-white transition-colors',
                  isAddDisabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                )}
              >
                <div>{initialData ? 'Atualizar' : 'Adicionar'}</div>
                <div>{totalText}</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
