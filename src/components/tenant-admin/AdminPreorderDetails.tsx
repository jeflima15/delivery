import type { ReactNode } from 'react';
import { preorderLabel } from '../PreorderSummary';

export function preorderPayment(order: any) {
  const total = Number(order.total_centavos ?? Math.round(Number(order.total || 0) * 100));
  const paid = Math.max(0, Number(order.paid_amount_cents || 0) - Number(order.refunded_amount_cents || 0));
  return { total, paid, balance: Math.max(0, total - paid), depositMissing: Math.max(0, Number(order.preorder?.depositCents || 0) - paid) };
}
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function paymentIsNext(order: any) {
  const { balance, depositMissing } = preorderPayment(order);
  const pickup = ['pickup', 'retirada', 'dine_in', 'local'].includes(order.tipo_entrega);
  return !['Cancelado', 'Entregue'].includes(order.status) && ((order.status === 'Pendente' && depositMissing > 0) || (balance > 0 && (order.status === 'Saiu para Entrega' || (order.status === 'Pronto' && pickup))));
}

export function AdminPreorderSummary({ order, canPay, onPayment }: { order: any; canPay: boolean; onPayment: () => void }) {
  const { total, paid, balance, depositMissing } = preorderPayment(order);
  const cancelled = order.status === 'Cancelado';
  const title = cancelled ? 'Encomenda cancelada' : !balance ? 'Pagamento completo' : depositMissing ? `Aguardando sinal: ${money(depositMissing)}` : order.preorder.depositCents > 0 ? 'Sinal recebido' : 'Sem sinal obrigatório';
  return <section aria-label="Resumo administrativo da encomenda" className={`rounded-xl border p-4 space-y-2 ${cancelled ? 'border-slate-200 bg-slate-50' : depositMissing ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
    <p className="text-sm font-bold text-slate-900">{order.tipo_entrega === 'delivery' ? 'Entrega' : 'Retirada'} · {preorderLabel(order.preorder)}</p>
    <p className="text-sm text-slate-700">{order.cliente?.nome}</p>
    <p className="text-sm font-semibold">{title}</p>
    <p className="text-sm">Total: {money(total)} · Recebido: {money(paid)}</p>
    <p className="text-sm">{cancelled ? `Valor ainda recebido: ${money(paid)}` : `Saldo restante: ${money(balance)}`}</p>
    {!cancelled && balance > 0 && canPay && !paymentIsNext(order) && <button type="button" onClick={onPayment} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold">{depositMissing ? 'Registrar sinal recebido' : 'Registrar recebimento do saldo'}</button>}
  </section>;
}

export function AdminPreorderActions({ order, permissions, onPayment, onStatus, onPrint, onCancel, onShare, children }: {
  order: any; permissions: string[]; onPayment: () => void; onStatus: (status: string) => void;
  onPrint: () => void; onCancel: () => void; onShare: () => void; children?: ReactNode;
}) {
  const { balance, depositMissing, paid } = preorderPayment(order);
  const closed = ['Cancelado', 'Entregue'].includes(order.status);
  const pickup = ['pickup', 'retirada', 'dine_in', 'local'].includes(order.tipo_entrega);
  const needsPayment = paymentIsNext(order);
  const next = order.status === 'Pendente' ? ['Preparando', 'Iniciar produção'] : order.status === 'Preparando' ? ['Pronto', 'Marcar como pronto'] : order.status === 'Pronto' ? (pickup ? ['Entregue', 'Registrar retirada'] : ['Saiu para Entrega', 'Saiu para entrega']) : ['Entregue', 'Concluir entrega'];
  return <div className="shrink-0 border-t border-slate-200 bg-white p-3 space-y-2">
    {!closed && <button type="button" disabled={!permissions.includes(needsPayment ? 'payments:write' : 'orders:write')} onClick={() => needsPayment ? onPayment() : onStatus(next[0])} className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">{needsPayment ? (depositMissing ? 'Registrar sinal recebido' : 'Registrar recebimento do saldo') : next[1]}</button>}
    {needsPayment && !permissions.includes('payments:write') && <p className="text-xs text-amber-800">Peça a um responsável para conferir e registrar o pagamento.</p>}
    <details className="relative"><summary className="cursor-pointer py-2 text-center text-sm font-semibold text-slate-600">Mais ações</summary>
      <div className="absolute bottom-full mb-2 max-h-[55dvh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl space-y-2">
        <button type="button" onClick={onPrint} className="min-h-11 w-full rounded-lg border text-sm">Imprimir comanda</button>
        <button type="button" onClick={onShare} className="min-h-11 w-full rounded-lg border text-sm">Enviar resumo e dados do Pix</button>
        {permissions.includes('payments:write') && (balance > 0 || paid > 0) && <button type="button" onClick={onPayment} className="min-h-11 w-full rounded-lg border text-sm">Registrar recebimento ou devolução</button>}
        {children}
        {!closed && permissions.includes('orders:cancel') && <button type="button" onClick={onCancel} className="min-h-11 w-full rounded-lg border border-rose-200 text-sm text-rose-700">Cancelar encomenda</button>}
      </div>
    </details>
  </div>;
}
