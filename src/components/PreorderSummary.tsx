import { useState } from 'react';

export function preorderLabel(preorder: any) {
  return preorder ? `${String(preorder.date).split('-').reverse().join('/')} · ${preorder.startTime} às ${preorder.endTime}` : '';
}

export default function PreorderSummary({ preorder, totalCents, paidCents = 0, cancelled = false }: { preorder: any; totalCents: number; paidCents?: number; cancelled?: boolean }) {
  const [copyMessage, setCopyMessage] = useState('');
  if (!preorder) return null;
  const currency = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const depositMissing = Math.max(0, Number(preorder.depositCents || 0) - paidCents);
  return <section className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-slate-900" aria-label="Resumo da encomenda">
    <p className="text-sm font-bold">Encomenda: {preorderLabel(preorder)}</p>
    <p className="text-xs">Horário da loja: {preorder.timezone}. Esta é a janela combinada para entrega ou retirada.</p>
    <p className="text-sm font-semibold">{cancelled ? 'Encomenda cancelada' : depositMissing > 0 ? `Aguardando conferência do sinal: ${currency(depositMissing)}` : 'Sinal conferido ou não exigido'}</p>
    <p className="text-xs">Recebido líquido: {currency(paidCents)}. {cancelled ? `A devolver: ${currency(Math.max(0, paidCents))}` : `Saldo restante: ${currency(Math.max(0, totalCents - paidCents))}`}</p>
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
