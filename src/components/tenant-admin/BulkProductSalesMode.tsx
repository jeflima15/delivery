import { useState } from 'react';
import { useTenantAdminApi } from './TenantAdminContext';

export const productSalesLabel = (product: any) => product.preorderDraft?.availability === 'scheduled_only' ? 'Somente encomenda' : product.preorderDraft?.availability === 'both' ? 'Agora e agendado (anterior)' : 'Pedido para agora';

export default function BulkProductSalesMode({ products, onClose, onSaved }: { products: any[]; onClose: () => void; onSaved: () => void }) {
  const api = useTenantAdminApi();
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState('immediate_only');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const save = async () => {
    if (busy || !selected.length) return;
    setBusy(true); setMessage('');
    const failures: string[] = [];
    for (const id of selected) {
      const product = products.find((entry) => entry._id === id);
      try {
        await api.updateProduct(id, { expectedUpdatedAt: product.updatedAt, preorderDraft: { ...product.preorderDraft, availability: mode } });
      } catch { failures.push(id); }
    }
    setBusy(false); setConfirm(false); setSelected(failures); onSaved();
    setMessage(failures.length ? `${selected.length - failures.length} atualizado(s). ${failures.length} não foram salvos; confira os dados atualizados e tente novamente.` : `${selected.length} produto(s) atualizados. Preços e prazos individuais foram preservados.`);
  };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3"><section role="dialog" aria-modal="true" aria-label="Alterar forma de venda" className="flex max-h-[90dvh] w-full max-w-xl flex-col rounded-2xl bg-white p-4">
    <h2 className="text-lg font-bold">Alterar forma de venda</h2>
    <p className="mt-1 text-sm text-slate-600">Produtos dos filtros atuais. Para alterar uma categoria, filtre o catálogo antes de abrir esta tela.</p>
    <fieldset disabled={busy} className="mt-3 min-h-0 overflow-y-auto space-y-3">
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={products.length > 0 && selected.length === products.length} onChange={(event) => { setConfirm(false); setSelected(event.target.checked ? products.map((p) => p._id) : []); }} />Selecionar todos ({products.length})</label>
      <div className="max-h-64 overflow-y-auto divide-y">{products.map((p) => <label key={p._id} className="flex min-h-12 items-center gap-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(p._id)} onChange={(e) => { setConfirm(false); setSelected((current) => e.target.checked ? [...current, p._id] : current.filter((id) => id !== p._id)); }} /><span>{p.nome}<span className="block text-xs text-slate-500">{productSalesLabel(p)}</span></span></label>)}</div>
      <label className="block text-sm font-semibold">Vender como<select value={mode} onChange={(e) => { setMode(e.target.value); setConfirm(false); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="immediate_only">Pedido para agora</option><option value="scheduled_only">Somente por encomenda</option></select></label>
      <p className="text-xs text-slate-500">Combos também dependem das regras dos produtos que os compõem. Para encomendas, a loja precisa ter a agenda ativada.</p>
    </fieldset>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {confirm && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">Alterar {selected.length} produto(s) para {mode === 'scheduled_only' ? 'somente por encomenda' : 'pedido para agora'}?</p>}
    <div className="mt-4 flex gap-2"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border px-4">Fechar</button><button type="button" disabled={busy || !selected.length} onClick={() => confirm ? void save() : setConfirm(true)} className="min-h-11 flex-1 rounded-lg bg-emerald-700 px-4 text-white disabled:opacity-50">{busy ? 'Salvando...' : confirm ? 'Confirmar alteração' : `Aplicar a ${selected.length} produto(s)`}</button></div>
  </section></div>;
}
