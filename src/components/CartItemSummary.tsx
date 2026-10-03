import ComboComposition from './ComboComposition';
import type { CartItem } from '../types/storefront';
export default function CartItemSummary({ item }: { item: CartItem }) {
  return <div className="mt-1 space-y-1 text-xs leading-5 text-gray-600">
    <ComboComposition stages={item.comboDisplay} fixedItems={item.comboFixedDisplay} />
    {(item.opcoes_escolhidas || []).map((option, index) => <p key={index}>{option.quantidade || 1}× {option.opcao}</p>)}
    {item.observacao && <p className="break-words"><span className="font-medium">Observação:</span> {item.observacao}</p>}
  </div>;
}

