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
}

interface ProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (item: any) => void;
}

export default function ProductModal({ product, isOpen, onClose, onAddToCart }: ProductModalProps) {
  // Estado para personalização antiga
  const [selections, setSelections] = useState<Record<string, number>>({});
  
  // Estado para painéis de upsell: groupSelections[groupName][itemName] = quantity
  const [groupSelections, setGroupSelections] = useState<Record<string, Record<string, number>>>({});
  
  // Quantidade de produtos
  const [quantity, setQuantity] = useState(1);

  // Reseta estados
  useEffect(() => {
    if (product && isOpen) {
      const initialSelections: Record<string, number> = {};
      (product.opcoes_disponiveis || []).forEach(opcao => { initialSelections[opcao] = 0; });
      setSelections(initialSelections);

      const initialGroups: Record<string, Record<string, number>> = {};
      (product.grupos_adicionais || []).forEach(g => {
         initialGroups[g.nome] = {};
         g.itens.forEach(i => initialGroups[g.nome][i.nome] = 0);
      });
      setGroupSelections(initialGroups);

      setQuantity(1);
    }
  }, [product, isOpen]);

  if (!isOpen || !product) return null;

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
      produtoId: product._id,
      nome: product.nome,
      preco_unitario: precoFinalProduto,
      quantidade: quantity,
      opcoes_escolhidas,
      subtotal: precoFinalProduto * quantity,
      pode_resgatar: product.pode_resgatar,
      pontos_resgate: product.pontos_resgate
    };

    onAddToCart(cartItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Container Principal do Modal (Design Stitch) */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Botão Fechar */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-white/80 backdrop-blur-md rounded-full text-gray-600 hover:bg-gray-100 transition-colors shadow-sm"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Imagem do Produto */}
        <div className="w-full h-64 sm:h-80 bg-gray-100 relative">
          <img 
            src={product.imagem || "https://picsum.photos/seed/salgados/800/600"} 
            alt={product.nome}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </div>

        {/* Conteúdo Rolável */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">{product.nome}</h2>
            <p className="text-gray-600 mt-3 text-base leading-relaxed">{product.descricao}</p>
            <div className="mt-4 text-2xl font-bold text-emerald-600">
              R$ {(product.preco || 0).toFixed(2).replace('.', ',')}
            </div>

            {/* BOX DE RESGATE (Fidelidade) - Print Referência */}
            {product.pode_resgatar && (
              <div className="mt-6 bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 rounded-2xl p-4 flex gap-4 animate-in fade-in zoom-in duration-500">
                <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-purple-600/20">
                  <Gift className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-purple-900 dark:text-white uppercase italic tracking-tight">Fidelidade Clube Stitch</h4>
                  <p className="text-[11px] text-purple-700/70 dark:text-slate-400 mt-1 leading-relaxed font-bold italic">
                    Este item pode ser seu por apenas <span className="text-purple-600 underline">{product.pontos_resgate} pontos</span>! Adicione à sacola para resgatar.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Seção de Personalização (Lógica Antiga) */}
          {product.personalizavel && product.opcoes_disponiveis && product.opcoes_disponiveis.length > 0 && (
            <div className="mt-8 border-t border-gray-100 pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900">Escolha suas opções</h3>
                <span className={cn(
                  "text-xs font-bold px-3 py-1 rounded-full transition-colors",
                  remaining === 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                )}>
                  {remaining === 0 ? "Tudo certo!" : `Faltam ${remaining}`}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-6">
                Selecione exatamente {product.quantidade_total_opcoes} itens.
              </p>

              <div className="space-y-4">
                {product.opcoes_disponiveis.map((opcao) => (
                  <div key={opcao} className="flex items-center justify-between p-3 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                    <span className="font-medium text-gray-700">{opcao}</span>
                    <div className="flex items-center space-x-3">
                      <button onClick={() => handleDecrementOption(opcao)} disabled={selections[opcao] === 0} className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-all"><Minus className="w-4 h-4" /></button>
                      <span className="w-6 text-center font-semibold text-gray-900">{selections[opcao]}</span>
                      <button onClick={() => handleIncrementOption(opcao)} disabled={isLimitReached} className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-all"><Plus className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seção de Upsell e Complementos Novos */}
          {product.grupos_adicionais && product.grupos_adicionais.length > 0 && (
             <div className="mt-8 space-y-6">
                {product.grupos_adicionais.map(g => {
                   const currSelected = Object.values(groupSelections[g.nome] || {}).reduce((a: number, b: any) => a + (b as number), 0);
                   const isGrpLimit = currSelected >= g.maximo;
                   const isMetMin = currSelected >= g.minimo;

                   return (
                     <div key={g.nome} className="border-t border-gray-100 pt-6">
                        <div className="flex items-center justify-between mb-2">
                           <h3 className="text-base font-bold text-gray-900">{g.nome}</h3>
                           {g.obrigatorio && !isMetMin && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 uppercase tracking-wider">Obrigatório</span>}
                        </div>
                        <p className="text-xs font-semibold text-gray-400 mb-4">Escolha de {g.minimo} até {g.maximo} opções.</p>
                        
                        <div className="space-y-3">
                           {g.itens.map(item => (
                              <div key={item.nome} className="flex flex-row items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                                 <div>
                                    <p className="font-semibold text-gray-800 text-sm">{item.nome}</p>
                                    <p className="text-xs text-gray-500">{item.preco > 0 ? `+ R$ ${item.preco.toFixed(2).replace('.', ',')}` : 'Grátis'}</p>
                                 </div>
                                 <div className="flex items-center space-x-3">
                                   <button onClick={() => handleGroupDecrement(g.nome, item.nome)} disabled={(groupSelections[g.nome]?.[item.nome] || 0) === 0} className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-all"><Minus className="w-3 h-3" /></button>
                                   <span className="w-4 text-center font-bold text-gray-900 text-sm">{groupSelections[g.nome]?.[item.nome] || 0}</span>
                                   <button onClick={() => handleGroupIncrement(g.nome, item.nome, g.maximo)} disabled={isGrpLimit} className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-all"><Plus className="w-3 h-3" /></button>
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

        {/* Footer Fixo: Adicionar à Sacola */}
        <div className="p-4 sm:p-6 border-t border-gray-100 bg-white">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Quantidade do Produto em si */}
            <div className="flex items-center justify-between w-full sm:w-auto space-x-3 bg-gray-50 p-2 rounded-2xl border border-gray-100">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:bg-white hover:shadow-sm transition-all"
              >
                <Minus className="w-5 h-5" />
              </button>
              <span className="w-6 text-center font-semibold text-gray-900">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:bg-white hover:shadow-sm transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Botão Principal */}
            <button
              onClick={handleAddToCart}
              disabled={isAddDisabled}
              className={cn(
                "w-full sm:flex-1 flex items-center justify-between px-6 py-4 rounded-2xl font-semibold text-white transition-all duration-300",
                isAddDisabled 
                  ? "bg-gray-300 cursor-not-allowed" 
                  : "bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/20 active:scale-[0.98]"
              )}
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <ShoppingBag className="w-5 h-5 flex-shrink-0" />
                Adicionar
              </span>
              <span className="truncate ml-2">R$ {(precoFinalProduto * quantity).toFixed(2).replace('.', ',')}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
