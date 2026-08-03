import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, History, MapPin, Search, ShoppingBag, Star, UserRound, X } from 'lucide-react';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';

const money = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AdminClientes({ token }: { token: string; onUnauthorized: () => void }) {
  const api = useTenantAdminApi();
  const { showToast } = useToast();
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);
  const [pointsModal, setPointsModal] = useState<any>(null);
  const [pointsForm, setPointsForm] = useState({ value: '', reason: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setClientes((await api.listCustomers()).items || []); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao carregar clientes.', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token]);

  const filtered = useMemo(() => clientes.filter((client) => `${client.nome} ${client.telefone} ${client.email || ''}`.toLowerCase().includes(search.toLowerCase())), [clientes, search]);

  const openDetails = async (client: any) => {
    setSelected(client);
    setDetails(null);
    try { setDetails(await api.getCustomer(client._id)); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao carregar historico.', 'error'); }
  };

  const savePoints = async (event: React.FormEvent) => {
    event.preventDefault();
    const delta = Number(pointsForm.value);
    if (!Number.isInteger(delta) || delta === 0) return showToast('Informe uma quantidade inteira diferente de zero.', 'error');
    setSaving(true);
    try {
      await api.updateCustomerPoints(pointsModal._id, Math.max(0, Number(pointsModal.pontos || 0) + delta), pointsForm.reason);
      showToast('Saldo de pontos atualizado.', 'success');
      setPointsModal(null);
      setPointsForm({ value: '', reason: '' });
      await load();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao atualizar pontos.', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><UserRound className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h2 className="text-xl font-black text-gray-900">Relacionamento com clientes</h2><p className="text-sm text-gray-500">Historico, fidelidade e valor gerado para a loja.</p></div></div>
        <label className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3"><Search className="h-4 w-4 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      </section>

      <div className="grid gap-3 md:hidden">{loading ? <div className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">Carregando clientes...</div> : filtered.map((client) => <article key={client._id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><button onClick={() => openDetails(client)} className="flex w-full items-center gap-3 text-left"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gray-100 font-bold text-gray-600">{String(client.nome || '?').slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><h3 className="truncate font-bold text-gray-900">{client.nome}</h3><p className="text-sm text-gray-500">{client.telefone}</p></div><ChevronRight className="h-5 w-5 text-gray-300" /></button><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-gray-50 p-2"><strong className="block text-sm">{client.total_pedidos || 0}</strong><span className="text-[10px] text-gray-500">Pedidos</span></div><div className="rounded-xl bg-gray-50 p-2"><strong className="block truncate text-sm">{money(client.total_gasto)}</strong><span className="text-[10px] text-gray-500">LTV</span></div><div className="rounded-xl bg-amber-50 p-2"><strong className="block text-sm text-amber-700">{client.pontos || 0}</strong><span className="text-[10px] text-amber-700">Pontos</span></div></div><button onClick={() => setPointsModal(client)} className="mt-3 h-10 w-full rounded-xl border border-emerald-200 text-xs font-bold text-emerald-700">Ajustar pontos</button></article>)}</div>

      <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block"><table className="w-full text-left"><thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500"><tr><th className="p-4">Cliente</th><th className="p-4">Relacionamento</th><th className="p-4">Fidelidade</th><th className="p-4 text-right">Acoes</th></tr></thead><tbody className="divide-y divide-gray-100">{filtered.map((client) => <tr key={client._id} className="hover:bg-gray-50"><td className="p-4"><p className="font-bold text-gray-900">{client.nome}</p><p className="text-sm text-gray-500">{client.telefone}{client.email ? ` · ${client.email}` : ''}</p></td><td className="p-4"><p className="font-semibold text-gray-800">{client.total_pedidos || 0} pedidos</p><p className="text-sm text-emerald-600">LTV {money(client.total_gasto)}</p></td><td className="p-4"><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"><Star className="h-3 w-3 fill-current" />{client.pontos || 0} pts</span></td><td className="p-4"><div className="flex justify-end gap-2"><button onClick={() => openDetails(client)} className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-600">Historico</button><button onClick={() => setPointsModal(client)} className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white">Ajustar pontos</button></div></td></tr>)}</tbody></table>{!loading && !filtered.length && <p className="p-12 text-center text-sm text-gray-500">Nenhum cliente encontrado.</p>}</div>

      {pointsModal && <div className="fixed inset-0 z-50 grid place-items-center bg-gray-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="points-title"><form onSubmit={savePoints} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 id="points-title" className="text-xl font-black text-gray-900">Ajustar pontos</h2><p className="mt-1 text-sm text-gray-500">Saldo atual: <strong>{pointsModal.pontos || 0} pontos</strong></p></div><button type="button" aria-label="Fechar" onClick={() => setPointsModal(null)} className="grid h-9 w-9 place-items-center rounded-full bg-gray-100"><X className="h-4 w-4" /></button></div><div className="mt-5 space-y-4"><label className="block text-sm font-semibold text-gray-700">Quantidade a adicionar ou remover<input required type="number" step="1" value={pointsForm.value} onChange={(e) => setPointsForm((current) => ({ ...current, value: e.target.value }))} placeholder="Ex.: 10 ou -10" className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3" /></label><label className="block text-sm font-semibold text-gray-700">Motivo<textarea required minLength={3} value={pointsForm.reason} onChange={(e) => setPointsForm((current) => ({ ...current, reason: e.target.value }))} placeholder="Explique o motivo do ajuste" className="mt-1 min-h-24 w-full rounded-xl border border-gray-200 p-3" /></label></div><div className="mt-5 flex gap-2"><button type="button" onClick={() => setPointsModal(null)} className="h-11 flex-1 rounded-xl border border-gray-200 font-bold text-gray-600">Cancelar</button><button disabled={saving} className="h-11 flex-1 rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Confirmar ajuste'}</button></div></form></div>}

      {selected && <div className="fixed inset-0 z-50 flex justify-end bg-gray-950/40" role="dialog" aria-modal="true" aria-labelledby="customer-title"><button aria-label="Fechar historico" onClick={() => setSelected(null)} className="absolute inset-0" /><aside className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-gray-100 p-5"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Cliente</p><h2 id="customer-title" className="mt-1 text-xl font-black text-gray-900">{selected.nome}</h2><p className="text-sm text-gray-500">{selected.telefone}</p></div><button aria-label="Fechar" onClick={() => setSelected(null)} className="grid h-10 w-10 place-items-center rounded-full bg-gray-100"><X className="h-5 w-5" /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-5">{!details ? <p className="py-12 text-center text-sm text-gray-500">Carregando historico...</p> : <div className="space-y-5"><section className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-gray-50 p-3 text-center"><ShoppingBag className="mx-auto h-4 w-4 text-gray-400" /><strong className="mt-2 block">{details.orders.length}</strong><span className="text-[10px] text-gray-500">Pedidos</span></div><div className="rounded-xl bg-gray-50 p-3 text-center"><Star className="mx-auto h-4 w-4 text-amber-500" /><strong className="mt-2 block">{details.customer.pontos || 0}</strong><span className="text-[10px] text-gray-500">Pontos</span></div><div className="rounded-xl bg-gray-50 p-3 text-center"><CalendarDays className="mx-auto h-4 w-4 text-gray-400" /><strong className="mt-2 block text-xs">{new Date(details.customer.createdAt).toLocaleDateString('pt-BR')}</strong><span className="text-[10px] text-gray-500">Cadastro</span></div></section>{details.customer.enderecos?.length > 0 && <section><h3 className="flex items-center gap-2 font-bold text-gray-900"><MapPin className="h-4 w-4 text-emerald-600" />Enderecos</h3><div className="mt-2 space-y-2">{details.customer.enderecos.map((address: any, index: number) => <p key={address._id || index} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">{address.rua}, {address.numero} · {address.bairro}</p>)}</div></section>}<section><h3 className="flex items-center gap-2 font-bold text-gray-900"><History className="h-4 w-4 text-emerald-600" />Ultimos pedidos</h3><div className="mt-2 space-y-2">{details.orders.length ? details.orders.map((order: any) => <article key={order._id} className="flex items-center justify-between rounded-xl border border-gray-200 p-3"><div><p className="font-semibold text-gray-900">Pedido #{order.orderNumber || String(order._id).slice(-6)}</p><p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleString('pt-BR')} · {order.status}</p></div><strong className="text-sm">{money(order.total)}</strong></article>) : <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">Nenhum pedido vinculado.</p>}</div></section></div>}</div></aside></div>}
    </div>
  );
}
