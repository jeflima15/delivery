import React, { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Download, History, KeyRound, MapPin, MessageCircle, Search, Star, UserRound, UsersRound, X } from 'lucide-react';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { downloadBlob } from '../lib/download';

const money = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString('pt-BR') : 'Sem compra';
const localDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const whatsappPhone = (value: unknown) => { const digits = String(value || '').replace(/\D/g, ''); return digits.startsWith('55') ? digits : `55${digits}`; };

const segments = [
  ['all', 'Todos'], ['valuable', 'Mais valiosos'], ['frequent', 'Mais frequentes'], ['new', 'Novos'],
  ['inactive30', 'Inativos 30d'], ['inactive60', 'Inativos 60d'], ['inactive90', 'Inativos 90d'],
];

export default function AdminClientes({ token }: { token: string; onUnauthorized: () => void }) {
  const api = useTenantAdminApi();
  const { showToast } = useToast();
  const today = new Date(); const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 29);
  const [clientes, setClientes] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [pagination, setPagination] = useState<any>({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('all');
  const [page, setPage] = useState(1);
  const [period] = useState({ from: localDate(monthAgo), to: localDate(today) });
  const [selected, setSelected] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);
  const [pointsModal, setPointsModal] = useState<any>(null);
  const [pointsForm, setPointsForm] = useState({ value: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [recoveries, setRecoveries] = useState<any[]>([]);
  const [loadingRecoveries, setLoadingRecoveries] = useState(true);
  const [approvingRecovery, setApprovingRecovery] = useState<string | null>(null);
  const [approvedRecovery, setApprovedRecovery] = useState<any>(null);
  const [copiedRecovery, setCopiedRecovery] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.listCustomers({ page, limit: 25, search, segment, ...period });
      setClientes(result.items || []); setSummary(result.summary || {}); setPagination(result.pagination || { page: 1, pages: 1, total: 0 });
    } catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao carregar clientes.', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), search ? 350 : 0); return () => window.clearTimeout(timer); }, [token, page, segment, search]);

  const loadRecoveries = async () => {
    setLoadingRecoveries(true);
    try { const result = await api.listPasswordRecoveries(); setRecoveries(result.items || []); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao carregar recuperacoes.', 'error'); }
    finally { setLoadingRecoveries(false); }
  };
  useEffect(() => { void loadRecoveries(); }, [token]);

  const approveRecovery = async (recovery: any) => {
    setApprovingRecovery(recovery.id);
    try {
      const result = await api.approvePasswordRecovery(recovery.id);
      setApprovedRecovery(result.recovery);
      setRecoveries((items) => items.filter((item) => item.id !== recovery.id));
      showToast('Link seguro gerado. Envie somente ao telefone cadastrado.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao gerar link.', 'error'); }
    finally { setApprovingRecovery(null); }
  };

  const recoveryMessage = approvedRecovery
    ? `Ola, ${approvedRecovery.customer?.nome || 'cliente'}! Recebemos sua solicitacao ${approvedRecovery.reference}. Use este link para criar uma nova senha. Ele expira em 30 minutos e so pode ser usado uma vez: ${approvedRecovery.resetUrl}`
    : '';
  const copyRecovery = async () => {
    await navigator.clipboard.writeText(recoveryMessage);
    setCopiedRecovery(true);
    window.setTimeout(() => setCopiedRecovery(false), 1800);
  };

  const openDetails = async (client: any) => {
    setSelected(client); setDetails(null);
    try { setDetails(await api.getCustomer(client._id)); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao carregar historico.', 'error'); }
  };

  const savePoints = async (event: React.FormEvent) => {
    event.preventDefault(); const delta = Number(pointsForm.value);
    if (!Number.isInteger(delta) || delta === 0) return showToast('Informe uma quantidade inteira diferente de zero.', 'error');
    setSaving(true);
    try {
      await api.updateCustomerPoints(pointsModal._id, Math.max(0, Number(pointsModal.pontos || 0) + delta), pointsForm.reason);
      showToast('Saldo de pontos atualizado.', 'success'); setPointsModal(null); setPointsForm({ value: '', reason: '' }); await load();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao atualizar pontos.', 'error'); }
    finally { setSaving(false); }
  };

  const exportCsv = async () => {
    setExporting(true);
    try { downloadBlob(await api.exportCustomers({ search, segment, ...period }), `clientes-${period.from}-a-${period.to}.csv`); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao exportar clientes.', 'error'); }
    finally { setExporting(false); }
  };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><UserRound className="h-5 w-5" /></div><div><h2 className="text-xl font-black text-gray-900">Inteligencia de clientes</h2><p className="text-sm text-gray-500">Valor, frequencia e recencia com base em pedidos validos.</p></div></div><button onClick={exportCsv} disabled={exporting} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-bold text-gray-700 disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? 'Exportando...' : 'Exportar clientes'}</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Novos no periodo" value={summary.newCustomers || 0} />
        <Summary label="Clientes recorrentes" value={summary.recurring || 0} />
        <Summary label="Inativos ha 30 dias" value={summary.inactive30 || 0} />
        <Summary label="Taxa de recompra" value={summary.repeatRate == null ? 'Dados insuficientes' : `${Number(summary.repeatRate).toFixed(1)}%`} />
      </div>
      <div className="mt-4 flex flex-col gap-3 lg:flex-row"><label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3"><Search className="h-4 w-4 text-gray-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por nome, telefone ou e-mail" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><div className="flex gap-2 overflow-x-auto pb-1">{segments.map(([id, label]) => <button key={id} onClick={() => { setSegment(id); setPage(1); }} className={`h-11 shrink-0 rounded-xl px-3 text-xs font-bold ${segment === id ? 'bg-emerald-600 text-white' : 'border border-gray-200 bg-white text-gray-600'}`}>{label}</button>)}</div></div>
    </section>

    {(loadingRecoveries || recoveries.length > 0) && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-amber-700 shadow-sm"><KeyRound className="h-5 w-5" /></div><div><h3 className="font-black text-amber-950">Recuperacoes de senha</h3><p className="mt-1 text-sm leading-5 text-amber-800">Confirme a referencia e o telefone recebido no WhatsApp antes de gerar o link.</p></div></div>
      {loadingRecoveries ? <p className="mt-4 text-sm text-amber-800">Verificando solicitacoes...</p> : <div className="mt-4 grid gap-2">{recoveries.map((recovery) => <article key={recovery.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-gray-900">{recovery.customer?.nome || 'Cliente'}</strong><span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black tracking-wide text-amber-800">{recovery.reference}</span></div><p className="mt-1 text-xs text-gray-500">{recovery.customer?.telefone || 'Telefone indisponivel'} · solicitado em {new Date(recovery.requestedAt).toLocaleString('pt-BR')}</p></div><button type="button" disabled={approvingRecovery === recovery.id} onClick={() => approveRecovery(recovery)} className="h-10 rounded-xl bg-gray-900 px-4 text-xs font-black text-white disabled:opacity-50">{approvingRecovery === recovery.id ? 'Gerando...' : 'Confirmar e gerar link'}</button></article>)}</div>}
    </section>}

    {loading ? <div className="rounded-2xl border bg-white p-12 text-center text-sm text-gray-500">Calculando relacionamento...</div> : !clientes.length ? <div className="rounded-2xl border bg-white p-12 text-center"><UsersRound className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-3 font-bold text-gray-700">Nenhum cliente neste segmento</p><p className="mt-1 text-sm text-gray-500">Ajuste a busca ou selecione outro filtro.</p></div> : <>
      <div className="grid gap-3 md:hidden">{clientes.map((client) => <CustomerCard key={client._id} client={client} onDetails={() => openDetails(client)} onPoints={() => setPointsModal(client)} />)}</div>
      <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500"><tr><th className="p-4">Cliente</th><th className="p-4">Pedidos / LTV</th><th className="p-4">Ultima compra</th><th className="p-4">Frequencia</th><th className="p-4">Fidelidade</th><th className="p-4 text-right">Acoes</th></tr></thead><tbody className="divide-y divide-gray-100">{clientes.map((client) => <tr key={client._id} className="hover:bg-gray-50"><td className="p-4"><p className="font-bold text-gray-900">{client.nome}</p><p className="text-sm text-gray-500">{client.telefone}{client.email ? ` · ${client.email}` : ''}</p></td><td className="p-4"><p className="font-semibold">{client.total_pedidos || 0} pedidos</p><p className="text-sm text-emerald-600">{money(client.total_gasto)}</p></td><td className="p-4"><p className="font-semibold">{date(client.ultima_compra)}</p><p className="text-xs text-gray-500">{client.dias_desde_ultima_compra == null ? 'Ainda nao comprou' : `ha ${client.dias_desde_ultima_compra} dia(s)`}</p></td><td className="p-4 text-sm text-gray-600">{client.frequencia_media_dias == null ? 'Dados insuficientes' : `A cada ${Number(client.frequencia_media_dias).toFixed(1)} dias`}</td><td className="p-4"><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"><Star className="h-3 w-3 fill-current" />{client.pontos || 0} pts</span></td><td className="p-4"><div className="flex justify-end gap-2"><button onClick={() => openDetails(client)} className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-600">Ficha</button><button onClick={() => setPointsModal(client)} className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white">Ajustar pontos</button></div></td></tr>)}</tbody></table></div></div>
      <Pagination page={pagination.page || page} pages={pagination.pages || 1} total={pagination.total || 0} onPage={setPage} />
    </>}

    {pointsModal && <div className="fixed inset-0 z-50 grid place-items-center bg-gray-950/50 p-4" role="dialog" aria-modal="true"><form onSubmit={savePoints} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-xl font-black">Ajustar pontos</h2><p className="text-sm text-gray-500">Saldo atual: <strong>{pointsModal.pontos || 0}</strong></p></div><button type="button" aria-label="Fechar" onClick={() => setPointsModal(null)} className="grid h-9 w-9 place-items-center rounded-full bg-gray-100"><X className="h-4 w-4" /></button></div><label className="mt-5 block text-sm font-semibold">Quantidade<input required type="number" step="1" value={pointsForm.value} onChange={(event) => setPointsForm({ ...pointsForm, value: event.target.value })} placeholder="Ex.: 10 ou -10" className="mt-1 h-11 w-full rounded-xl border px-3" /></label><label className="mt-4 block text-sm font-semibold">Motivo<textarea required minLength={3} value={pointsForm.reason} onChange={(event) => setPointsForm({ ...pointsForm, reason: event.target.value })} className="mt-1 min-h-24 w-full rounded-xl border p-3" /></label><div className="mt-5 flex gap-2"><button type="button" onClick={() => setPointsModal(null)} className="h-11 flex-1 rounded-xl border font-bold">Cancelar</button><button disabled={saving} className="h-11 flex-1 rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Confirmar'}</button></div></form></div>}

    {approvedRecovery && <div className="fixed inset-0 z-[70] grid place-items-center bg-gray-950/55 p-4" role="dialog" aria-modal="true"><section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-emerald-600">Link seguro gerado</p><h2 className="mt-1 text-xl font-black text-gray-900">Enviar para {approvedRecovery.customer?.nome}</h2></div><button type="button" onClick={() => setApprovedRecovery(null)} aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-gray-100"><X className="h-4 w-4" /></button></div><div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs leading-5 text-gray-600">Envie apenas para <strong>{approvedRecovery.customer?.telefone}</strong>. O link expira em 30 minutos e deixa de funcionar apos o primeiro uso.</p><p className="mt-3 break-all text-xs font-semibold text-gray-800">{approvedRecovery.resetUrl}</p></div><div className="mt-5 grid gap-2"><a target="_blank" rel="noreferrer" href={`https://wa.me/${whatsappPhone(approvedRecovery.customer?.telefone)}?text=${encodeURIComponent(recoveryMessage)}`} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white"><MessageCircle className="h-5 w-5" />ABRIR WHATSAPP</a><button type="button" onClick={copyRecovery} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700">{copiedRecovery ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copiedRecovery ? 'COPIADO' : 'COPIAR MENSAGEM'}</button></div></section></div>}
    {selected && <CustomerDrawer selected={selected} details={details} onClose={() => setSelected(null)} />}
  </div>;
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) { return <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-xl font-black text-gray-900">{value}</p></div>; }

function CustomerCard({ client, onDetails, onPoints }: any) { return <article className="rounded-2xl border bg-white p-4 shadow-sm"><button onClick={onDetails} className="flex w-full items-center gap-3 text-left"><div className="grid h-11 w-11 place-items-center rounded-full bg-gray-100 font-bold">{String(client.nome || '?')[0].toUpperCase()}</div><div className="min-w-0 flex-1"><h3 className="truncate font-bold">{client.nome}</h3><p className="text-sm text-gray-500">{client.telefone}</p></div><ChevronRight className="h-5 w-5 text-gray-300" /></button><div className="mt-4 grid grid-cols-3 gap-2 text-center"><Summary label="Pedidos" value={client.total_pedidos || 0} /><Summary label="LTV" value={money(client.total_gasto)} /><Summary label="Sem comprar" value={client.dias_desde_ultima_compra == null ? '—' : `${client.dias_desde_ultima_compra}d`} /></div><button onClick={onPoints} className="mt-3 h-10 w-full rounded-xl border border-emerald-200 text-xs font-bold text-emerald-700">Ajustar {client.pontos || 0} pontos</button></article>; }

function Pagination({ page, pages, total, onPage }: any) { return <div className="flex items-center justify-between rounded-xl border bg-white p-3 text-sm"><span className="text-gray-500">{total} cliente(s)</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid h-9 w-9 place-items-center rounded-lg border disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><span className="font-bold">{page} / {pages}</span><button disabled={page >= pages} onClick={() => onPage(page + 1)} className="grid h-9 w-9 place-items-center rounded-lg border disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div></div>; }

function CustomerDrawer({ selected, details, onClose }: any) {
  const metrics = details?.metrics || {};
  return <div className="fixed inset-0 z-50 flex justify-end bg-gray-950/40" role="dialog" aria-modal="true"><button aria-label="Fechar ficha" onClick={onClose} className="absolute inset-0" /><aside className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"><header className="flex justify-between border-b p-5"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Ficha do cliente</p><h2 className="mt-1 text-xl font-black">{selected.nome}</h2><p className="text-sm text-gray-500">{selected.telefone}</p></div><button aria-label="Fechar" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-gray-100"><X className="h-5 w-5" /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-5">{!details ? <p className="py-12 text-center text-sm text-gray-500">Carregando ficha...</p> : <div className="space-y-5"><section className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Summary label="Total gasto" value={money(metrics.totalSpent)} /><Summary label="Pedidos" value={metrics.orders || 0} /><Summary label="Ticket medio" value={money(metrics.averageTicket)} /><Summary label="Primeira compra" value={date(metrics.firstPurchase)} /><Summary label="Ultima compra" value={date(metrics.lastPurchase)} /><Summary label="Frequencia" value={metrics.averageFrequencyDays == null ? 'Dados insuficientes' : `${Number(metrics.averageFrequencyDays).toFixed(1)} dias`} /></section><div className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800"><Star className="mr-2 inline h-4 w-4" />{details.customer.pontos || 0} pontos de fidelidade</div>{details.customer.enderecos?.length > 0 && <section><h3 className="flex items-center gap-2 font-bold"><MapPin className="h-4 w-4 text-emerald-600" />Enderecos</h3><div className="mt-2 space-y-2">{details.customer.enderecos.map((address: any, index: number) => <p key={address._id || index} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">{address.logradouro || address.rua}, {address.numero} · {address.bairro}</p>)}</div></section>}<section><h3 className="flex items-center gap-2 font-bold"><History className="h-4 w-4 text-emerald-600" />Historico de pedidos</h3><div className="mt-2 space-y-2">{details.orders.length ? details.orders.map((order: any) => <article key={order._id} className="flex justify-between rounded-xl border p-3"><div><p className="font-semibold">Pedido #{order.orderNumber || String(order._id).slice(-6)}</p><p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleString('pt-BR')} · {order.status}</p></div><strong className="text-sm">{money(order.total)}</strong></article>) : <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">Nenhum pedido vinculado.</p>}</div></section></div>}</div></aside></div>;
}
