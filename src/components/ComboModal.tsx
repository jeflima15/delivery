import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Minus, Package, PackageOpen, Plus, Store, X } from 'lucide-react';
import { cartConfigurationKey, comboStartingPriceCents, getComboMode, productIsPurchasable } from '../lib/combo';
import type {
  CartItem,
  ComboCartSelection,
  ComboDisplayOption,
  ComboDisplayStage,
  ComboMode,
  ComboStage,
  FixedComboItem,
  Product,
  SecureOptionSelection,
} from '../types/storefront';

const money = (cents: number) => `R$ ${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')}`;

type StageSelection = { selectedProductId: string; options: Record<string, Record<string, number>> };
export type ComboProduct = Product & {
  tipo: 'combo';
  combo_mode?: ComboMode;
  combo_preco_base_centavos?: number;
  combo_etapas?: ComboStage[];
  combo_itens_fixos?: FixedComboItem[];
};

export default function ComboModal({
  product,
  products,
  isOpen,
  onClose,
  onAddToCart,
  initialData,
}: {
  product: ComboProduct | null;
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
  initialData?: CartItem;
}) {
  const [selections, setSelections] = useState<Record<string, StageSelection>>({});
  const [quantity, setQuantity] = useState(1);
  const [observation, setObservation] = useState('');

  const comboMode = product ? getComboMode(product) : 'stages';
  const stages = useMemo(() => [...(product?.combo_etapas || [])].sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0)), [product]);
  const productById = useMemo(() => new Map(products.map((item) => [String(item._id || item.id), item])), [products]);

  // Componentes fixos do combo (se combo_mode === 'fixed')
  const fixedComponents = useMemo(() => {
    if (!product || comboMode !== 'fixed') return [];
    return (product.combo_itens_fixos || []).map((item) => {
      const prodId = String((item as any).produtoId?._id || item.produtoId);
      const compProduct = productById.get(prodId);
      const itemQty = Number(item.quantidade || 1);
      const available = productIsPurchasable(compProduct, itemQty * quantity);
      return {
        produtoId: prodId,
        quantidade: itemQty,
        product: compProduct,
        available,
      };
    });
  }, [product, comboMode, productById, quantity]);

  const isFixedPurchasable =
    fixedComponents.length > 0 &&
    fixedComponents.every((comp) => comp.available) &&
    product?.ativo !== false &&
    !product?.esgotado;

  useEffect(() => {
    if (!isOpen || !product) return;
    if (comboMode === 'stages') {
      const initialSelections: Record<string, StageSelection> = {};
      for (const stage of initialData?.comboSelections || []) {
        const configuredStage = stages.find((entry) => String(entry._id) === String(stage.stageId));
        const selectedProduct = productById.get(String(stage.selectedProductId));
        const allowed = configuredStage?.opcoes?.some((entry) => String(entry.produtoId) === String(stage.selectedProductId));
        if (!configuredStage || !allowed || !productIsPurchasable(selectedProduct)) continue;
        const groups: Record<string, Record<string, number>> = {};
        for (const option of stage.options || []) {
          const group = selectedProduct?.grupos_adicionais?.find((entry) => String(entry._id) === String(option.groupId));
          const item = group?.itens?.find((entry) => String(entry._id) === String(option.itemId) && entry.ativo !== false);
          const optionQuantity = Number(option.quantity || 0);
          if (!group || !item || !Number.isInteger(optionQuantity) || optionQuantity <= 0) continue;
          const groupId = String(group._id);
          groups[groupId] ||= {};
          groups[groupId][String(item._id)] = optionQuantity;
        }
        initialSelections[String(configuredStage._id)] = { selectedProductId: String(stage.selectedProductId), options: groups };
      }
      setSelections(initialSelections);
    }
    setQuantity(initialData?.quantidade || 1);
    setObservation(initialData?.observacao || '');
  }, [isOpen, product, initialData, productById, stages, comboMode]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isOpen]);

  if (!isOpen || !product) return null;

  const validateProductOptions = (selectedProduct: Product | undefined, selection?: StageSelection) => {
    if (!selectedProduct || !selection) return false;
    return (selectedProduct.grupos_adicionais || []).every((group) => {
      const groupOptions = selection.options[String(group._id)] || {};
      const count = Object.values(groupOptions).reduce((sum, value) => sum + Number(value || 0), 0);
      const minimum = Number(group.minimo || (group.obrigatorio ? 1 : 0));
      if (count < minimum || count > Number(group.maximo || 1)) return false;
      return (group.itens || []).every((item) => {
        const itemMax = item.maximo && item.maximo > 0 ? item.maximo : Number(group.maximo || 1);
        const itemQty = Number(groupOptions[String(item._id)] || 0);
        return itemQty <= itemMax;
      });
    });
  };

  const basePriceCents = typeof product.combo_preco_base_centavos === 'number'
    ? Math.max(0, Math.round(product.combo_preco_base_centavos))
    : 0;

  let totalUnitCents = basePriceCents;
  let completedStages = 0;
  const displayStages: ComboDisplayStage[] = [];
  const secureSelections: ComboCartSelection[] = [];
  for (const stage of stages) {
    const stageId = String(stage._id);
    const selection = selections[stageId];
    const selectedProduct = selection ? productById.get(selection.selectedProductId) : null;
    const configuredOption = (stage.opcoes || []).find((option) => String(option.produtoId) === selection?.selectedProductId);
    const valid = Boolean(configuredOption && productIsPurchasable(selectedProduct) && validateProductOptions(selectedProduct, selection));
    if (valid) completedStages += 1;
    let additionsCents = 0;
    const optionDisplay: ComboDisplayOption[] = [];
    const secureOptions: SecureOptionSelection[] = [];
    if (selectedProduct && selection) {
      for (const group of selectedProduct.grupos_adicionais || []) {
        for (const item of group.itens || []) {
          const selectedQuantity = Number(selection.options[String(group._id)]?.[String(item._id)] || 0);
          if (!selectedQuantity) continue;
          const configuredCents = Number.isSafeInteger(item.preco_centavos) && (item.preco_centavos > 0 || !item.preco)
            ? item.preco_centavos
            : Math.round(Number(item.preco || 0) * 100);
          const chargedCents = stage.cobrar_complementos === false ? 0 : configuredCents;
          additionsCents += chargedCents * selectedQuantity;
          secureOptions.push({ groupId: String(group._id), itemId: String(item._id), quantity: selectedQuantity });
          optionDisplay.push({ itemId: String(item._id), itemName: item.nome, quantity: selectedQuantity, unitPriceCents: chargedCents });
        }
      }
    }
    if (configuredOption) totalUnitCents += Number(stage.valor_etapa_centavos || 0) + Number(configuredOption.acrescimo_centavos || 0) + additionsCents;
    if (selection) secureSelections.push({ stageId, selectedProductId: selection.selectedProductId, options: secureOptions });
    displayStages.push({ stageId, name: stage.nome, selectedProductName: selectedProduct?.nome || '', options: optionDisplay });
  }
  const complete = stages.length > 0 && completedStages === stages.length;

  const startingPriceCents = comboStartingPriceCents(product);
  const currentDisplayCents = comboMode === 'fixed'
    ? startingPriceCents
    : totalUnitCents > basePriceCents
    ? totalUnitCents
    : startingPriceCents;

  const selectProduct = (stageId: string, selectedProductId: string) => setSelections((current) => ({
    ...current,
    [stageId]: { selectedProductId, options: {} },
  }));
  const changeOption = (stageId: string, groupId: string, itemId: string, delta: number, maximum: number, itemMaximum?: number) => setSelections((current) => {
    const stage = current[stageId];
    if (!stage) return current;
    const group = stage.options[groupId] || {};
    const groupTotal = Object.values(group).reduce((sum, value) => sum + Number(value || 0), 0);
    const currentQuantity = Number(group[itemId] || 0);
    const effectiveItemMax = itemMaximum && itemMaximum > 0 ? itemMaximum : maximum;
    if (delta > 0 && (groupTotal >= maximum || currentQuantity >= effectiveItemMax)) return current;
    const nextQuantity = Math.max(0, currentQuantity + delta);
    return { ...current, [stageId]: { ...stage, options: { ...stage.options, [groupId]: { ...group, [itemId]: nextQuantity } } } };
  });

  const addToCart = () => {
    if (comboMode === 'fixed') {
      if (!isFixedPurchasable) return;
      const displayItems = fixedComponents.map((c) => ({
        productId: c.produtoId,
        productName: c.product?.nome || 'Item do combo',
        quantity: c.quantidade,
        produtoId: c.produtoId,
        nome: c.product?.nome || 'Item do combo',
        quantidade: c.quantidade,
      }));
      const item: CartItem = {
        itemType: 'combo',
        comboMode: 'fixed',
        produtoId: product._id,
        nome: product.nome,
        imagem: product.imagem,
        permite_talheres: Boolean(product.permite_talheres),
        preco_unitario: startingPriceCents / 100,
        quantidade: quantity,
        subtotal: (startingPriceCents * quantity) / 100,
        comboFixedDisplay: displayItems,
        observacao: observation.trim() || undefined,
        is_resgate: false,
        pode_resgatar: false,
        pontos_resgate: 0,
      };
      item.configurationKey = cartConfigurationKey(item);
      onAddToCart(item);
      onClose();
      return;
    }

    if (!complete) return;
    const item: CartItem = {
      itemType: 'combo',
      comboMode: 'stages',
      produtoId: product._id,
      nome: product.nome,
      imagem: product.imagem,
      permite_talheres: Boolean(product.permite_talheres),
      preco_unitario: totalUnitCents / 100,
      quantidade: quantity,
      subtotal: (totalUnitCents * quantity) / 100,
      comboSelections: secureSelections,
      comboDisplay: displayStages,
      observacao: observation.trim() || undefined,
      is_resgate: false,
      pode_resgatar: false,
      pontos_resgate: 0,
    };
    item.configurationKey = cartConfigurationKey(item);
    onAddToCart(item);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-5" role="dialog" aria-modal="true">
      <div className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[calc(100vh-48px)] sm:rounded-xl sm:shadow-2xl">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <header className="relative border-b border-gray-200 bg-gray-50">
            <div className="h-44 w-full bg-white sm:h-52">
              {product.imagem ? (
                <img src={product.imagem} alt={product.nome} className="h-full w-full object-contain p-4" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-300">
                  <Store className="h-10 w-10" />
                  <span className="text-xs">Sem imagem</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gray-200 text-gray-500 shadow-sm cursor-pointer hover:bg-gray-300"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="px-4 pb-5 pt-4 sm:px-5">
            <span className="inline-flex rounded-md store-bg-soft px-2 py-1 text-[10px] font-bold uppercase tracking-wider store-text-primary">
              {comboMode === 'fixed' ? 'Combo Fixo' : 'Combo com Escolhas'}
            </span>
            <h2 className="mt-2 text-lg font-semibold leading-6 text-gray-800">{product.nome}</h2>
            {product.descricao && (
              <p className="mt-2 whitespace-pre-wrap text-sm font-light leading-5 text-gray-500">{product.descricao}</p>
            )}
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold text-gray-900">{money(currentDisplayCents * quantity)}</span>
              {comboMode === 'stages' && currentDisplayCents > startingPriceCents ? (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                  + {money((currentDisplayCents - startingPriceCents) * quantity)} em escolhas
                </span>
              ) : comboMode === 'stages' ? (
                <span className="text-xs text-gray-400 font-normal">A partir de {money(startingPriceCents)}</span>
              ) : null}
            </div>

            {comboMode === 'stages' ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full store-bg-primary store-text-on-primary">
                  <Check className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-medium text-gray-700">{completedStages} de {stages.length} etapas concluídas</p>
                  <p className="text-[11px] text-gray-500">Escolha uma opção em cada etapa.</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-emerald-900">
                    Combo pronto com {fixedComponents.length} {fixedComponents.length === 1 ? 'item incluso' : 'itens inclusos'}
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    Todos os itens abaixo serão preparados juntos nesta seleção.
                  </p>
                </div>
              </div>
            )}
          </div>

          {comboMode === 'fixed' ? (
            <div className="space-y-3 px-4 pb-4 sm:px-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Itens inclusos neste combo:
              </h3>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs">
                {fixedComponents.map((item, idx) => (
                  <div
                    key={item.produtoId || idx}
                    className={`flex items-center gap-3 p-3 transition-colors ${item.available ? 'bg-white' : 'bg-rose-50/40'}`}
                  >
                    <span className="inline-flex items-center justify-center rounded-lg bg-emerald-100/70 px-2.5 py-1 text-xs font-bold text-emerald-800 shrink-0">
                      {item.quantidade}x
                    </span>
                    {item.product?.imagem ? (
                      <img src={item.product.imagem} alt="" className="h-12 w-12 rounded-lg object-cover border border-gray-200 shrink-0" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-400 shrink-0">
                        <Package className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{item.product?.nome || 'Item do combo'}</p>
                      {item.product?.descricao && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{item.product.descricao}</p>
                      )}
                      {!item.available && (
                        <p className="mt-1 text-[11px] font-semibold text-rose-600">Item temporariamente indisponível no estoque</p>
                      )}
                    </div>
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                      Incluso
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {stages.map((stage, stageIndex) => {
                const stageId = String(stage._id);
                const selection = selections[stageId];
                return (
                  <section key={stageId} className="border-y border-gray-200 bg-white">
                    <div className="sticky top-0 z-10 bg-gray-100 px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200">
                          {stageIndex + 1}
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700">{stage.nome}</h3>
                          <p className="mt-0.5 text-xs font-light text-gray-500">Obrigatório • Escolha 1</p>
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {(stage.opcoes || []).map((configuredOption) => {
                        const optionProduct = productById.get(String(configuredOption.produtoId));
                        const available = productIsPurchasable(optionProduct);
                        const selected = selection?.selectedProductId === String(configuredOption.produtoId);
                        const extraCents = Number(configuredOption.acrescimo_centavos || 0);
                        return (
                          <div key={String(configuredOption.produtoId)} className={available ? '' : 'bg-gray-50 opacity-55'}>
                            <button
                              type="button"
                              disabled={!available}
                              onClick={() => selectProduct(stageId, String(configuredOption.produtoId))}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed cursor-pointer"
                            >
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                  selected ? 'store-border-primary store-bg-primary' : 'border-gray-300 bg-white'
                                }`}
                              >
                                {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                              </span>
                              {optionProduct?.imagem ? (
                                <img src={optionProduct.imagem} alt="" className="h-14 w-14 rounded-lg object-cover" />
                              ) : (
                                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-100">
                                  <PackageOpen className="h-5 w-5 text-gray-300" />
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-700">{optionProduct?.nome || 'Produto indisponível'}</p>
                                {optionProduct?.descricao && (
                                  <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{optionProduct.descricao}</p>
                                )}
                                {!available && <p className="mt-1 text-[11px] font-medium text-rose-600">Indisponível</p>}
                              </div>
                              {extraCents > 0 ? (
                                <span className="shrink-0 text-xs font-semibold store-text-primary">+ {money(extraCents)}</span>
                              ) : (
                                <span className="shrink-0 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  Incluso
                                </span>
                              )}
                            </button>
                            {selected &&
                              optionProduct &&
                              (optionProduct.grupos_adicionais || []).map((group) => {
                                const groupId = String(group._id);
                                const current = selection.options[groupId] || {};
                                const count = Object.values(current).reduce((sum, value) => sum + Number(value || 0), 0);
                                const minimum = Number(group.minimo || (group.obrigatorio ? 1 : 0));
                                return (
                                  <div key={groupId} className="border-t border-gray-100 bg-gray-50/70 px-4 py-3 pl-12">
                                    <div className="mb-2 flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-xs font-semibold text-gray-700">{group.nome}</p>
                                        <p className="text-[11px] text-gray-500">
                                          {minimum > 0 ? `Escolha de ${minimum} até ${group.maximo}` : `Escolha até ${group.maximo}`}
                                        </p>
                                      </div>
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                          count < minimum ? 'bg-amber-100 text-amber-700' : 'bg-white text-gray-500 ring-1 ring-gray-200'
                                        }`}
                                      >
                                        {count}/{group.maximo}
                                      </span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {(group.itens || []).filter((item) => item.ativo !== false).map((item) => {
                                        const itemId = String(item._id);
                                        const selectedQuantity = Number(current[itemId] || 0);
                                        const itemCents = Number.isSafeInteger(item.preco_centavos) && (item.preco_centavos > 0 || !item.preco)
                                          ? item.preco_centavos
                                          : Math.round(Number(item.preco || 0) * 100);
                                        const itemMax = item.maximo && item.maximo > 0 ? item.maximo : Number(group.maximo || 1);
                                        const isMaxReached = count >= Number(group.maximo || 1) || selectedQuantity >= itemMax;
                                        return (
                                          <div key={itemId} className="flex min-h-10 items-center justify-between gap-3 rounded-md bg-white px-2.5 py-1.5">
                                            <div>
                                              <p className="text-xs font-medium text-gray-700">{item.nome}</p>
                                              {item.descricao ? <p className="text-[10px] text-gray-500 line-clamp-1">{item.descricao}</p> : null}
                                              <div className="flex items-center gap-1.5">
                                                <p className="text-[10px] store-text-primary">
                                                  {stage.cobrar_complementos === false ? 'Grátis no combo' : itemCents > 0 ? `+ ${money(itemCents)}` : 'Incluso'}
                                                </p>
                                                {item.maximo && item.maximo > 0 && item.maximo < Number(group.maximo || 1) ? (
                                                  <span className="text-[9px] text-gray-400 bg-gray-100 rounded px-1">máx. {item.maximo}</span>
                                                ) : null}
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <button
                                                type="button"
                                                disabled={selectedQuantity === 0}
                                                onClick={() => changeOption(stageId, groupId, itemId, -1, Number(group.maximo || 1), item.maximo)}
                                                className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-500 disabled:opacity-35 cursor-pointer"
                                              >
                                                <Minus className="h-3.5 w-3.5" />
                                              </button>
                                              <span className="w-4 text-center text-xs">{selectedQuantity}</span>
                                              <button
                                                type="button"
                                                disabled={isMaxReached}
                                                onClick={() => changeOption(stageId, groupId, itemId, 1, Number(group.maximo || 1), item.maximo)}
                                                className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-600 disabled:opacity-35 cursor-pointer"
                                              >
                                                <Plus className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          <div className="px-4 pb-5 pt-2 sm:px-5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Alguma observação?</label>
              <span className="text-xs text-gray-400">{observation.length} / 140</span>
            </div>
            <textarea
              maxLength={140}
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              className="mt-2 h-20 w-full resize-none rounded-lg border border-gray-300 p-3 text-sm outline-none focus:store-border-primary transition-colors"
              placeholder="Ex.: retirar cebola, maionese à parte..."
            />
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-gray-200 bg-white p-3 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
          <div className="flex h-11 w-28 items-center justify-between rounded-lg bg-gray-100 px-3">
            <button
              type="button"
              disabled={quantity === 1}
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              className="text-gray-500 disabled:opacity-30 cursor-pointer"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold text-gray-700">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((value) => value + 1)}
              className="text-gray-600 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            disabled={comboMode === 'fixed' ? !isFixedPurchasable : !complete}
            onClick={addToCart}
            className="flex h-11 min-w-0 flex-1 items-center justify-between rounded-lg store-bg-primary px-4 text-sm font-semibold store-text-on-primary disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer shadow-sm transition-all"
          >
            <span>
              {comboMode === 'fixed'
                ? isFixedPurchasable
                  ? 'Adicionar combo à sacola'
                  : 'Item indisponível no momento'
                : complete
                ? 'Adicionar combo à sacola'
                : 'Complete as etapas'}
            </span>
            <span>{money(currentDisplayCents * quantity)}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
