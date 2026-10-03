/** Derives public availability without disclosing internal stock quantities. */
export function catalogAvailability(product: Record<string, any>, products: Record<string, any>[]) {
  const usable = (item: Record<string, any> | undefined, quantity = 1) =>
    Boolean(item && item.ativo !== false && !item.esgotado && (!item.controlar_estoque || Number(item.estoque || 0) >= quantity));
  if (!usable(product)) return { purchasable: false, reason: 'unavailable' as const };
  if (product.tipo !== 'combo') return { purchasable: true, reason: null };
  const byId = new Map(products.map(item => [String(item._id), item]));
  const fixed = product.combo_mode === 'fixed' || (product.combo_itens_fixos?.length && !product.combo_etapas?.length);
  if (fixed) {
    const demand = new Map<string, number>();
    for (const item of product.combo_itens_fixos || []) {
      const id = String(item.produtoId?._id || item.produtoId);
      demand.set(id, (demand.get(id) || 0) + Number(item.quantidade || 1));
    }
    const purchasable = demand.size > 0 && [...demand].every(([id, amount]) => usable(byId.get(id), amount));
    return { purchasable, reason: purchasable ? null : 'components' as const };
  }
  const stages = product.combo_etapas || [];
  // All stages must have a feasible choice together: two stages cannot both
  // consume the only available unit of the same component.
  const slots = new Map<string, number[]>();
  let slotCount = 0;
  for (const [id, item] of byId) {
    if (!usable(item)) continue;
    const capacity = item.controlar_estoque ? Math.min(stages.length, Math.floor(Number(item.estoque))) : stages.length;
    slots.set(id, Array.from({ length: capacity }, () => slotCount++));
  }
  const choices: number[][] = stages.map((stage: any) => [...new Set<number>((stage.opcoes || []).flatMap((option: any) => slots.get(String(option.produtoId?._id || option.produtoId)) || []))]);
  const assigned = new Map<number, number>();
  const match = (stage: number, visited: Set<number>): boolean => {
    for (const slot of choices[stage]) {
      if (visited.has(slot)) continue;
      visited.add(slot);
      const previous = assigned.get(slot);
      if (previous === undefined || match(previous, visited)) { assigned.set(slot, stage); return true; }
    }
    return false;
  };
  const purchasable = stages.length > 0 && choices.every((_, index) => match(index, new Set()));
  return { purchasable, reason: purchasable ? null : 'components' as const };
}
