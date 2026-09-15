import { useState } from 'react';

export function preorderLabel(preorder: any) {
  return preorder ? `${String(preorder.date).split('-').reverse().join('/')} · ${preorder.startTime} às ${preorder.endTime}` : '';
}

export default function PreorderSummary({ preorder, totalCents, paidCents = 0, cancelled = false }: { preorder: any; totalCents: number; paidCents?: number; cancelled?: boolean }) {
  const [copyMessage, setCopyMessage] = useState('');
  if (!preorder) return null;
  const currency = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const safePaidCents = Math.max(0, Number(paidCents || 0));
  const safeTotalCents = Math.max(0, Number(totalCents || 0));
  const depositCents = Math.max(0, Number(preorder.depositCents || 0));
  const depositMissing = Math.max(0, depositCents - safePaidCents);
  const balanceCents = Math.max(0, safeTotalCents - safePaidCents);
  const paymentStatus = cancelled
    ? 'Encomenda cancelada'
    : balanceCents === 0
      ? 'Pagamento completo'
      : depositCents === 0
        ? 'Sem sinal obrigatório'
        : depositMissing === 0
          ? 'Sinal confirmado'
          : `Aguardando sinal de ${currency(depositMissing)}`;
  return <section className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-slate-900" aria-label="Resumo da encomenda">
    <p className="text-sm font-bold">Encomenda: {preorderLabel(preorder)}</p>
    <p className="text-xs">Este é o horário local combinado para entrega ou retirada.</p>
    <p className="text-sm font-semibold">{paymentStatus}</p>
    <p className="text-xs">Já pago: {currency(safePaidCents)}. {cancelled ? `A devolver: ${currency(safePaidCents)}` : `Falta pagar: ${currency(balanceCents)}`}</p>
    {!cancelled && depositMissing > 0 && preorder.pixKey && <div className="text-xs">
      <p>Chave PIX: <span className="select-all break-all font-semibold">{preorder.pixKey}</span></p>
      <button type="button" className="my-2 rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white" onClick={async () => {
        try { await navigator.clipboard.writeText(String(preorder.pixKey)); setCopyMessage('Chave copiada.'); }
        catch { setCopyMessage('Selecione a chave acima para copiar.'); }
      }}>Copiar chave PIX</button>
      {copyMessage && <p role="status">{copyMessage}</p>}
      {preorder.pixInstructions && <p className="whitespace-pre-wrap">{preorder.pixInstructions}</p>}
      <p className="mt-1">Confira o destinatário no banco. O comprovante não confirma automaticamente o pagamento; aguarde a loja conferir.</p>
    </div>}
  </section>;
}
