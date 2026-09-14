import { CalendarDays } from 'lucide-react';
import { preorderLeadLabel, type ProductPreorderInfo } from '../lib/productPreorder';

export default function ProductPreorderNotice({ value, detailed = false }: { value?: ProductPreorderInfo | null; detailed?: boolean }) {
  if (!value) return null;
  const exclusive = !value.immediateAllowed && value.scheduledAllowed;
  const incompatible = !value.immediateAllowed && !value.scheduledAllowed;
  if (!exclusive && !incompatible && !detailed) return null;
  const title = incompatible ? 'Combinação indisponível para pedido' : exclusive ? 'Somente por encomenda' : value.scheduledAllowed ? 'Também disponível por encomenda' : 'Somente pronta entrega';
  return <div className={detailed ? 'my-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900' : 'mt-2 text-amber-800'}>
    <p className="flex items-start gap-1.5 text-xs font-semibold leading-4"><CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0" /><span>{title}</span></p>
    {detailed && value.scheduledAllowed && <>
      {value.minLeadMinutes > 0 && <p className="mt-1 text-xs leading-5">Encomende com pelo menos {preorderLeadLabel(value.minLeadMinutes)} de antecedência.</p>}
      <p className="mt-1 text-xs leading-5">{value.acceptingPreorders ? 'Escolha a data e o horário disponíveis ao continuar o pedido. Adicionar à sacola ainda não reserva a vaga.' : 'Novas encomendas estão pausadas. Consulte a loja antes de pedir.'}</p>
    </>}
    {detailed && incompatible && <p className="mt-1 text-xs">Há itens de pronta entrega e de encomenda incompatíveis. Altere as escolhas ou separe os pedidos.</p>}
  </div>;
}
