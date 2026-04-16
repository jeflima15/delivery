// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { X, Minus, Plus, ShoppingBag, Gift } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Função utilitária para Tailwind (padrão shadcn/ui)
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

export default function ProductModal({ product, isOpen, onClose, onAddToCart, initialData, isLoyaltyActive = false }: ProductModalProps) {
  // Estado para personalização antiga
  const [selections, setSelections] = useState<Record<string, number>>({});

  // Estado para painéis de upsell: groupSelections[groupName][itemName] = quantity
  const [groupSelections, setGroupSelections] = useState<Record<string, Record<string, number>>>({});

  // Quantidade de produtos
  const [quantity, setQuantity] = useState(1);

  // Reseta estados
  useEffect(() => {
    if (product && isOpen) {
      if (initialData) {
        setSelections(initialData.selections || {});
        setGroupSelections(initialData.groupSelections || {});
        setQuantity(initialData.quantidade || 1);
      } else {
        const initialSelections: Record<string, number> = {};
        (product.opcoes_disponiveis || []).forEach(opcao => { initialSelections[opcao] = 0; });
        setSelections(initialSelections);

        const initialGroups: Record<string, Record<string, number>> = {};
        (product.grupos_adicionais || []).forEach(g => {
          initialGroups[g.nome] = {};
          g.itens.forEach(i => initialGroups[g.nome][i.nome] = 0);
        });
        setGroupSelections(initialGroups);

      }
    }
  }, [product, isOpen, initialData]);

  useEffect(() => {
    if (isOpen && product) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const getBadgeConfig = (label?: string) => {
    if (!label) return null;
    const t = label.trim().toLowerCase();

    if (t.includes('novo') || t.includes('novidade') || t.includes('lancamento')) {
      return { type: 'ribbon', style: 'bg-[#0f766e] text-white' };
    }
    if (t.includes('mais pedido') || t.includes('popular') || t.includes('vendido')) {
      return { type: 'pill', style: 'border border-[#fed7aa] bg-[#fff7ed] text-[#c2410c] shadow-[0_6px_18px_rgba(234,88,12,0.08)]' };
    }
    if (t.includes('recomendado') || t.includes('sugestao') || t.includes('chef')) {
      return { type: 'pill', style: 'border border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8] shadow-[0_6px_18px_rgba(59,130,246,0.08)]' };
    }
    if (t.includes('limitada') || t.includes('esgotando')) {
      return { type: 'pill', style: 'border border-[#fbcfe8] bg-[#fdf2f8] text-[#be185d] shadow-[0_6px_18px_rgba(190,24,93,0.08)]' };
    }
    if (t.includes('promocao') || t.includes('oferta') || t.includes('imperdivel')) {
      return { type: 'pill', style: 'border border-[#bbf7d0] bg-[#ecfdf5] text-[#047857] shadow-[0_6px_18px_rgba(5,150,105,0.08)]' };
    }
    return { type: 'pill', style: 'border border-stone-200 bg-stone-50 text-stone-700' };
  };

  // Lógica Personalização Antiga
  const totalSelected = Object.values(selections).reduce((acc: number, val: any) => acc + (val as number), 0) as number;
  const remaining = (product.quantidade_total_opcoes || 0) - totalSelected;
  const isLimitReached = totalSelected >= (product.quantidade_total_opcoes || 0);
  const oldPersonalizationInvalid = product.personalizavel && totalSelected !== product.quantidade_total_opcoes;

  // Lógica Grupos Novos
  let newGroupsInvalid = false;
  let totalAdicionais = 0;

  if (product.grupos_adicionais && product.grupos_adicionais.length > 0) {
    product.grupos_adicionais.forEach(g => {
      const groupSelectedCount = Object.values(groupSelections[g.nome] || {}).reduce((a: number, b: any) => a + (b as number), 0);
      if (g.obrigatorio && groupSelectedCount < g.minimo) newGroupsInvalid = true;
      // calculo financeiro
      g.itens.forEach(item => {
        const qtd = (groupSelections[g.nome] || {})[item.nome] || 0;
        totalAdicionais += (qtd * item.preco);
      });
    });
  }

  const isAddDisabled = oldPersonalizationInvalid || newGroupsInvalid;
  const precoFinalProduto = product.preco + totalAdicionais;
  const temDesconto = (product.preco_antigo ?? 0) > product.preco;
  const badgeConfig = getBadgeConfig(product.selo_destaque);
  const percentualDesconto = temDesconto
    ? Math.max(1, Math.round((((product.preco_antigo ?? 0) - product.preco) / (product.preco_antigo ?? 0)) * 100))
    : 0;

  // Handlers Legados
  const handleIncrementOption = (opcao: string) => {
    if (!isLimitReached) setSelections(prev => ({ ...prev, [opcao]: prev[opcao] + 1 }));
  };
  const handleDecrementOption = (opcao: string) => {
    if (selections[opcao] > 0) setSelections(prev => ({ ...prev, [opcao]: prev[opcao] - 1 }));
  };

  // Handlers Novos
  const handleGroupIncrement = (gName: string, iName: string, maximo: number) => {
    const currentCount = Object.values(groupSelections[gName] || {}).reduce((a: number, b: any) => a + (b as number), 0);
    if (currentCount < maximo) {
      setGroupSelections(prev => ({
        ...prev,
        [gName]: { ...prev[gName], [iName]: prev[gName][iName] + 1 }
      }));
    }
  };
  const handleGroupDecrement = (gName: string, iName: string) => {
    if (groupSelections[gName][iName] > 0) {
      setGroupSelections(prev => ({
        ...prev,
        [gName]: { ...prev[gName], [iName]: prev[gName][iName] - 1 }
      }));
    }
  };

  // Montagem do Carrinho
  const handleAddToCart = () => {
    if (isAddDisabled) return;

    let opcoes_escolhidas: any[] = [];

    // Antigo
    Object.entries(selections).forEach(([opcao, qtd]) => {
      if (qtd > 0) opcoes_escolhidas.push({ opcao, quantidade: qtd });
    });

    // Novo
    if (product.grupos_adicionais) {
      product.grupos_adicionais.forEach(g => {
        g.itens.forEach(i => {
          const qtd = groupSelections[g.nome][i.nome];
          if (qtd > 0) {
            const tagPreco = i.preco > 0 ? ` (+ R$ ${i.preco.toFixed(2).replace('.', ',')})` : '';
            opcoes_escolhidas.push({ opcao: `${g.nome}: ${i.nome}${tagPreco}`, quantidade: qtd });
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
      is_resgate: isLoyaltyActive ? initialData?.is_resgate || false : false,
      pode_resgatar: isLoyaltyActive ? product.pode_resgatar : false,
      pontos_resgate: isLoyaltyActive ? product.pontos_resgate : 0
    };

    onAddToCart(cartItem);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Container Principal do Modal*/}
      <div
        className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] min-h-[50vh] animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 mt-auto sm:mt-0"
        onClick={e => e.stopPropagation()}
      >

        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 w-8 h-8 flex items-center justify-center bg-black/40 backdrop-blur-sm shadow-sm rounded-full text-white hover:bg-black/60 active:scale-90 transition-all cursor-pointer"
          aria-label="Sair"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Imagem do Produto */}
        <div className="w-full shrink-0 h-56 sm:h-72 bg-gray-50 relative overflow-hidden">
          <img
            src={product.imagem || "https://picsum.photos/seed/salgados/800/600"}
            alt={product.nome}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />

          {/* Ribbon Diagonal do Modal (Ex: Novidade) */}
          {product.destaque && product.selo_destaque && (() => {
            const tempBadgeList = ['novo', 'novidade', 'lançamento'];
            if (tempBadgeList.some(w => product.selo_destaque.toLowerCase().includes(w))) {
              return (
                <div className="absolute top-0 right-0 overflow-hidden w-full h-full z-10 pointer-events-none">
                  <div
                    className="absolute transform rotate-45 text-[11px] sm:text-[12px] font-black uppercase tracking-[0.18em] py-1.5 text-center shadow-lg bg-[#0f766e] text-white"
                    style={{ width: '40%', right: '-10%', top: '5%' }}
                  >
                    {product.selo_destaque}
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Conteúdo Rolável */}
        <div className="flex-1 overflow-y-auto w-full max-w-full">
          <div className="p-5 sm:p-6 pb-2">
            {product.destaque && product.selo_destaque && (() => {
              const t = product.selo_destaque.trim().toLowerCase();
              if (t.includes('novo') || t.includes('novidade') || t.includes('lançamento')) return null;

              let style = 'bg-gray-100 text-gray-600 border-gray-200';
              if (t.includes('mais pedido') || t.includes('popular') || t.includes('vendido')) style = 'bg-[#fff7ed] text-[#ea580c] border-orange-200';
              else if (t.includes('recomendado') || t.includes('sugestão') || t.includes('chef')) style = 'bg-[#eff6ff] text-[#3b82f6] border-blue-200';
              else if (t.includes('limitada') || t.includes('esgotando')) style = 'bg-[#fdf2f8] text-[#db2777] border-pink-200';
              else if (t.includes('promoção') || t.includes('oferta') || t.includes('imperdível')) style = 'bg-[#ecfdf5] text-[#059669] border-emerald-200';

              return (
                <div className="mb-2">
                  <span className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest leading-none border shadow-sm",
                    badgeConfig?.style || style
                  )}>
                    {product.selo_destaque}
                  </span>
                </div>
              );
            })()}
            <h2 className="text-[22px] sm:text-[26px] font-black text-gray-900 tracking-tight leading-tight">{product.nome}</h2>
            {product.descricao && (
              <p className="text-gray-500 mt-2 text-[13px] leading-relaxed font-normal">{product.descricao}</p>
            )}

            <div className="mt-4 flex flex-col">
              {temDesconto && (
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13px] font-semibold text-gray-400 line-through">
                    R$ {product.preco_antigo!.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-600">
                    -{percentualDesconto}% OFF
                  </span>
                </div>
              )}
              <div className="flex items-end self-start">
                <span className={`text-[24px] sm:text-[28px] font-black tracking-tight leading-none ${temDesconto ? 'text-emerald-600' : 'text-gray-900'}`}>
                  R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>

            {/* BOX DE RESGATE (Fidelidade) - Print Referência */}
            {isLoyaltyActive && product.pode_resgatar && (
              <div className="mt-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-4 flex gap-3.5 items-center">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                  <Gift className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="text-[13px] font-black text-amber-900 uppercase tracking-tight">Clube de Fidelidade</h4>
                  <p className="text-[11px] text-amber-800 leading-snug mt-0.5">
                    Resgate este item por <span className="font-black text-amber-700">{product.pontos_resgate} pontos</span>!
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="w-full h-2 bg-gray-50 border-t border-b border-gray-100"></div>

          <div className="px-5 sm:px-6 pb-6">
            {/* Seção de Personalização (Lógica Antiga) */}
            {product.personalizavel && product.opcoes_disponiveis && product.opcoes_disponiveis.length > 0 && (
              <div className="pt-6">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[15px] font-black text-gray-900">Escolha suas opções</h3>
                  <span className={cn(
                    "text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-md",
                    remaining === 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
                  )}>
                    {remaining === 0 ? "Pronto" : `Faltam ${remaining}`}
                  </span>
                </div>
                <p className="text-[12px] font-medium text-gray-500 mb-4">
                  Selecione até {product.quantidade_total_opcoes} opções.
                </p>

                <div className="space-y-3">
                  {product.opcoes_disponiveis.map((opcao) => (
                    <div key={opcao} className="flex flex-row items-center justify-between pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                      <span className="font-semibold text-[13px] text-gray-700 leading-tight pr-4">{opcao}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <button onClick={() => handleDecrementOption(opcao)} disabled={selections[opcao] === 0} className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:border-gray-100 transition-all"><Minus className="w-3.5 h-3.5" /></button>
                        <span className="w-4 text-center text-[14px] font-bold text-gray-900">{selections[opcao]}</span>
                        <button onClick={() => handleIncrementOption(opcao)} disabled={isLimitReached} className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:border-gray-100 transition-all"><Plus className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seção de Upsell e Complementos Novos */}
            {product.grupos_adicionais && product.grupos_adicionais.length > 0 && (
              <div className="space-y-6 pt-6">
                {product.grupos_adicionais.map(g => {
                  const currSelected = Object.values(groupSelections[g.nome] || {}).reduce((a: number, b: any) => a + (b as number), 0);
                  const isGrpLimit = currSelected >= g.maximo;
                  const isMetMin = currSelected >= g.minimo;

                  return (
                    <div key={g.nome} className="first:pt-0 pt-6">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-[15px] font-black text-gray-900 leading-none">{g.nome}</h3>
                        {g.obrigatorio && !isMetMin && <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 uppercase tracking-widest">Obrigatório</span>}
                      </div>
                      <p className="text-[12px] font-medium text-gray-500 mb-4">Escolha de {g.minimo} até {g.maximo} opções.</p>

                      <div className="space-y-4">
                        {g.itens.map(item => (
                          <div key={item.nome} className="flex flex-row items-center justify-between border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                            <div className="pr-4">
                              <p className="font-semibold text-gray-800 text-[13px] leading-snug">{item.nome}</p>
                              <p className="text-[12px] font-medium text-emerald-600 mt-0.5">{item.preco > 0 ? `+ R$ ${item.preco.toFixed(2).replace('.', ',')}` : 'Grátis'}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <button onClick={() => handleGroupDecrement(g.nome, item.nome)} disabled={(groupSelections[g.nome]?.[item.nome] || 0) === 0} className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:border-gray-100 transition-all"><Minus className="w-3.5 h-3.5" /></button>
                              <span className="w-4 text-center font-bold text-gray-900 text-[14px]">{groupSelections[g.nome]?.[item.nome] || 0}</span>
                              <button onClick={() => handleGroupIncrement(g.nome, item.nome, g.maximo)} disabled={isGrpLimit} className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:border-gray-100 transition-all"><Plus className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Fixo: Adicionar à Sacola */}
        <div className="p-4 sm:p-5 border-t border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            {/* Quantidade */}
            <div className="flex items-center justify-between gap-3 bg-gray-50/80 p-1.5 rounded-xl border border-gray-100 shrink-0">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-9 h-9 flex items-center justify-center text-emerald-600 hover:bg-white hover:shadow-sm rounded-lg transition-all"
              >
                <Minus className="w-[18px] h-[18px]" strokeWidth={2.5} />
              </button>
              <span className="w-4 text-center font-bold text-gray-900 text-[15px]">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-9 h-9 flex items-center justify-center text-emerald-600 hover:bg-white hover:shadow-sm rounded-lg transition-all"
              >
                <Plus className="w-[18px] h-[18px]" strokeWidth={2.5} />
              </button>
            </div>

            {/* Botão Principal */}
            <button
              onClick={handleAddToCart}
              disabled={isAddDisabled}
              className={cn(
                "flex-1 flex items-center justify-between px-5 h-12 rounded-xl font-bold text-white transition-all duration-300",
                isAddDisabled
                  ? "bg-gray-300 text-white cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] shadow-sm"
              )}
            >
              <span className="flex items-center gap-2 text-[14px]">
                {initialData ? 'Atualizar' : 'Adicionar'}
              </span>
              <span className="text-[14px]">R$ {(precoFinalProduto * quantity).toFixed(2).replace('.', ',')}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
