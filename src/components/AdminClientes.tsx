import React, { useEffect, useState } from 'react';
import {
  UserRound,
  UsersRound,
  Search,
  Download,
  Star,
  MapPin,
  History,
  KeyRound,
  MessageCircle,
  Check,
  Copy,
  ChevronLeft,
  ChevronRight,
  X,
  FilterX,
  TrendingUp,
  Sparkles,
  Phone,
  Mail,
} from 'lucide-react';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { downloadBlob } from '../lib/download';

const money = (value: unknown) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const date = (value: unknown) =>
  value ? new Date(String(value)).toLocaleDateString('pt-BR') : 'Sem compra';

const localDate = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate()
  ).padStart(2, '0')}`;

const whatsappPhone = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
};

const segments = [
  ['all', 'Todos'],
  ['valuable', 'Mais valiosos'],
  ['frequent', 'Mais frequentes'],
  ['new', 'Novos'],
  ['inactive30', 'Inativos 30d'],
  ['inactive60', 'Inativos 60d'],
  ['inactive90', 'Inativos 90d'],
];

export default function AdminClientes({ token }: { token: string; onUnauthorized: () => void }) {
  const api = useTenantAdminApi();
  const { showToast } = useToast();
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 29);

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
      setClientes(result.items || []);
      setSummary(result.summary || {});
      setPagination(result.pagination || { page: 1, pages: 1, total: 0 });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao carregar clientes.', 'error');
      setClientes([]);
      setSummary({});
      setPagination({ page: 1, pages: 1, total: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [token, page, segment, search]);

  const loadRecoveries = async () => {
    setLoadingRecoveries(true);
    try {
      const result = await api.listPasswordRecoveries();
      setRecoveries(result.items || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao carregar recuperações.', 'error');
      setRecoveries([]);
    } finally {
      setLoadingRecoveries(false);
    }
  };

  useEffect(() => {
    void loadRecoveries();
  }, [token]);

  const approveRecovery = async (recovery: any) => {
    setApprovingRecovery(recovery.id);
    try {
      const result = await api.approvePasswordRecovery(recovery.id);
      setApprovedRecovery(result.recovery);
      setRecoveries((items) => items.filter((item) => item.id !== recovery.id));
      showToast('Link seguro gerado. Envie somente ao telefone cadastrado.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao gerar link.', 'error');
    } finally {
      setApprovingRecovery(null);
    }
  };

  const recoveryMessage = approvedRecovery
    ? `Olá, ${approvedRecovery.customer?.nome || 'cliente'}! Recebemos sua solicitação ${approvedRecovery.reference}. Use este link para criar uma nova senha. Ele expira em 30 minutos e só pode ser usado uma vez: ${approvedRecovery.resetUrl}`
    : '';

  const copyRecovery = async () => {
    await navigator.clipboard.writeText(recoveryMessage);
    setCopiedRecovery(true);
    window.setTimeout(() => setCopiedRecovery(false), 1800);
  };

  const openDetails = async (client: any) => {
    setSelected(client);
    setDetails(null);
    try {
      const apiResult = await api.getCustomer(client._id);
      setDetails(apiResult);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao carregar histórico.', 'error');
    }
  };

  const savePoints = async (event: React.FormEvent) => {
    event.preventDefault();
    const delta = Number(pointsForm.value);
    if (!Number.isInteger(delta) || delta === 0) {
      return showToast('Informe uma quantidade inteira diferente de zero.', 'error');
    }
    setSaving(true);
    try {
      await api.updateCustomerPoints(
        pointsModal._id,
        Math.max(0, Number(pointsModal.pontos || 0) + delta),
        pointsForm.reason
      );
      showToast('Saldo de pontos atualizado com sucesso.', 'success');
      setPointsModal(null);
      setPointsForm({ value: '', reason: '' });
      await load();
      if (selected && selected._id === pointsModal._id) {
        openDetails(selected);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao atualizar pontos.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      downloadBlob(
        await api.exportCustomers({ search, segment, ...period }),
        `clientes-${period.from}-a-${period.to}.csv`
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao exportar clientes.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const getClientBadge = (client: any) => {
    const daysSince = client.dias_desde_ultima_compra;
    const totalSpent = Number(client.total_gasto || 0);
    const orderCount = Number(client.total_pedidos || 0);

    if (daysSince != null && daysSince >= 90) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 border border-rose-200/60">
          Inativo 90d+
        </span>
      );
    }
    if (daysSince != null && daysSince >= 30) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200/60">
          Inativo ({daysSince}d)
        </span>
      );
    }
    if (totalSpent >= 300 || client.eh_vip) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 border border-purple-200/60">
          <Sparkles className="h-3 w-3 text-purple-500" />
          Alto Valor
        </span>
      );
    }
    if (orderCount > 1) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200/60">
          Recorrente
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200/60">
        Novo Cliente
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Visão Geral / KPIs em Cards Compactos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500">Total de Clientes</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">
              {summary.totalCustomers ?? pagination.total ?? clientes.length}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 border border-slate-200/80">
            <UsersRound className="h-4.5 w-4.5" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500">Novos no Período</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-700">
              {summary.newCustomers || 0}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
            <UserRound className="h-4.5 w-4.5" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500">Recorrentes</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">
              {summary.recurring || 0}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60">
            <TrendingUp className="h-4.5 w-4.5" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500">Taxa de Recompra</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">
              {summary.repeatRate == null
                ? '—'
                : `${Number(summary.repeatRate).toFixed(1)}%`}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600 border border-purple-200/60">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
        </div>
      </div>

      {/* 2. Barra de Ações, Busca e Filtros */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-bold text-slate-900">Gestão e Inteligência de Clientes</h2>
            <p className="text-[11px] text-slate-500">
              Histórico de relacionamento, frequência de pedidos, LTV e programa de fidelidade.
            </p>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            {exporting ? 'Exportando...' : 'Exportar Clientes'}
          </button>
        </div>

        {/* Toolbar de Busca e Segmentos */}
        <div className="flex flex-col gap-2 pt-1 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nome, telefone ou e-mail..."
              className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none transition-colors focus:border-emerald-500 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {segments.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSegment(id);
                  setPage(1);
                }}
                className={`inline-flex shrink-0 items-center rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                  segment === id
                    ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}

            {(search || segment !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSegment('all');
                  setPage(1);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                title="Limpar filtros"
              >
                <FilterX className="h-3.5 w-3.5 text-slate-500" />
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Alerta de Recuperação de Senha (se houver pendentes) */}
      {(loadingRecoveries || recoveries.length > 0) && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 shadow-2xs space-y-2.5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-700" />
            <h3 className="text-xs font-bold text-amber-950">Solicitações de Recuperação de Senha</h3>
          </div>

          {loadingRecoveries ? (
            <p className="text-xs text-amber-800">Verificando solicitações em aberto...</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {recoveries.map((recovery) => (
                <div
                  key={recovery.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-amber-200/80 bg-white p-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {recovery.customer?.nome || 'Cliente'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {recovery.customer?.telefone || 'Telefone não informado'} · Ref: {recovery.reference}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={approvingRecovery === recovery.id}
                    onClick={() => approveRecovery(recovery)}
                    className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-amber-700 transition-colors disabled:opacity-50"
                  >
                    {approvingRecovery === recovery.id ? 'Gerando...' : 'Gerar Link'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de Link de Recuperação Gerado */}
      {approvedRecovery && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md my-auto rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  Link Seguro Criado
                </span>
                <h3 className="text-xs font-bold text-slate-900">
                  Enviar para {approvedRecovery.customer?.nome}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setApprovedRecovery(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 space-y-2">
                <p className="text-xs text-slate-600">
                  Envie somente ao telefone cadastrado (<strong>{approvedRecovery.customer?.telefone}</strong>). Expira em 30 min.
                </p>
                <p className="break-all text-xs font-mono text-slate-800 bg-white p-2 rounded-lg border border-slate-200/80">
                  {approvedRecovery.resetUrl}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://wa.me/${whatsappPhone(
                    approvedRecovery.customer?.telefone
                  )}?text=${encodeURIComponent(recoveryMessage)}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition-colors"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
                <button
                  type="button"
                  onClick={copyRecovery}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {copiedRecovery ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
                  {copiedRecovery ? 'Copiado!' : 'Copiar Texto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Tabela de Clientes SaaS de Alta Densidade (Desktop) e Cards (Mobile) */}
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Carregando lista de clientes...</div>
        </div>
      ) : !clientes.length ? (
        <div className="rounded-xl border border-dashed border-slate-200/80 bg-white p-8 text-center shadow-2xs">
          <UsersRound className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-900">Nenhum cliente encontrado</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Tente ajustar a busca ou o segmento selecionado.</p>
          {(search || segment !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSegment('all');
                setPage(1);
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <FilterX className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="grid gap-2.5 md:hidden">
            {clientes.map((client) => {
              return (
                <div
                  key={client._id}
                  className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {client.nome}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3 text-slate-400" />
                        {client.telefone}
                        {client.email && ` · ${client.email}`}
                      </p>
                    </div>
                    <div>{getClientBadge(client)}</div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-center text-[11px]">
                    <div>
                      <p className="text-slate-400 text-[10px]">Pedidos</p>
                      <p className="font-bold text-slate-900">{client.total_pedidos || 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-[10px]">LTV (Gasto)</p>
                      <p className="font-bold text-emerald-700">{money(client.total_gasto)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-[10px]">Última Compra</p>
                      <p className="font-medium text-slate-700">{date(client.ultima_compra)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200/60">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                      {client.pontos || 0} pts
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPointsModal(client)}
                        className="inline-flex h-7 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Pontos
                      </button>
                      <button
                        type="button"
                        onClick={() => openDetails(client)}
                        className="inline-flex h-7 items-center justify-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700"
                      >
                        Ver Ficha
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop High-Density Table */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3.5">Cliente</th>
                    <th className="py-2.5 px-3.5">Classificação</th>
                    <th className="py-2.5 px-3.5">Pedidos / LTV</th>
                    <th className="py-2.5 px-3.5">Ticket Médio</th>
                    <th className="py-2.5 px-3.5">Última Compra</th>
                    <th className="py-2.5 px-3.5">Frequência</th>
                    <th className="py-2.5 px-3.5">Fidelidade</th>
                    <th className="py-2.5 px-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {clientes.map((client) => {
                    const orderCount = Number(client.total_pedidos || 0);
                    const totalSpent = Number(client.total_gasto || 0);
                    const ticketMedio = orderCount > 0 ? totalSpent / orderCount : 0;

                    return (
                      <tr key={client._id} className="transition-colors hover:bg-slate-50/60">
                        <td className="py-2.5 px-3.5">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate max-w-[14rem]">
                              {client.nome}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate max-w-[16rem]">
                              {client.telefone}
                              {client.email ? ` · ${client.email}` : ''}
                            </p>
                          </div>
                        </td>

                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          {getClientBadge(client)}
                        </td>

                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div>
                            <span className="font-bold text-emerald-700">
                              {money(totalSpent)}
                            </span>
                            <span className="block text-[11px] font-medium text-slate-500">
                              {orderCount} pedido{orderCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span className="font-semibold text-slate-800">
                            {money(ticketMedio)}
                          </span>
                        </td>

                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div>
                            <span className="font-medium text-slate-800">
                              {date(client.ultima_compra)}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {client.dias_desde_ultima_compra == null
                                ? 'Sem histórico'
                                : `há ${client.dias_desde_ultima_compra} dia(s)`}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600">
                          {client.frequencia_media_dias == null
                            ? '—'
                            : `A cada ${Number(client.frequencia_media_dias).toFixed(1)}d`}
                        </td>

                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 border border-amber-200/60">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                            {client.pontos || 0} pts
                          </span>
                        </td>

                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openDetails(client)}
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              Ficha
                            </button>
                            <button
                              type="button"
                              onClick={() => setPointsModal(client)}
                              className="inline-flex h-8 items-center justify-center rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition-colors"
                            >
                              Pontos
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginação */}
          <Pagination
            page={pagination.page || page}
            pages={pagination.pages || 1}
            total={pagination.total || 0}
            onPage={setPage}
          />
        </>
      )}

      {/* 5. Modal de Ajuste de Pontos */}
      {pointsModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={savePoints}
            className="w-full max-w-md my-auto rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5">
              <div>
                <h3 className="text-xs font-bold text-slate-900">Ajustar Pontos de Fidelidade</h3>
                <p className="text-[11px] text-slate-500">
                  Cliente: <strong>{pointsModal.nome}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPointsModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-50/60 p-3">
                <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                  Saldo Atual
                </span>
                <span className="text-sm font-bold text-amber-900">
                  {pointsModal.pontos || 0} pontos
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Ajuste de Pontos * <span className="text-[10px] text-slate-400">(Positivo para somar, negativo para subtrair)</span>
                </label>
                <input
                  required
                  type="number"
                  step="1"
                  value={pointsForm.value}
                  onChange={(e) => setPointsForm({ ...pointsForm, value: e.target.value })}
                  placeholder="Ex: 50 ou -20"
                  className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Motivo do Ajuste *
                </label>
                <textarea
                  required
                  minLength={3}
                  value={pointsForm.reason}
                  onChange={(e) => setPointsForm({ ...pointsForm, reason: e.target.value })}
                  placeholder="Ex: Bonificação por indicação de cliente, correção manual..."
                  className="w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setPointsModal(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Confirmar Ajuste'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 6. Customer Ficha (Drawer Lateral) */}
      {selected && (
        <CustomerDrawer
          selected={selected}
          details={details}
          onClose={() => setSelected(null)}
          onOpenPoints={() => setPointsModal(selected)}
        />
      )}
    </div>
  );
}

function Pagination({ page, pages, total, onPage }: any) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-3 text-xs shadow-2xs">
      <span className="text-slate-500 font-medium">{total} cliente(s) encontrado(s)</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-semibold text-slate-800">
          Página {page} de {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CustomerDrawer({ selected, details, onClose, onOpenPoints }: any) {
  const metrics = details?.metrics || {};

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Fechar ficha"
        onClick={onClose}
        className="absolute inset-0 border-0 bg-transparent cursor-default"
      />

      <aside className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 p-4 sm:p-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              Ficha do Cliente
            </span>
            <h2 className="text-sm font-bold text-slate-900">{selected.nome}</h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3 text-slate-400" />
                {selected.telefone}
              </span>
              {selected.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3 text-slate-400" />
                  {selected.email}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {!details ? (
            <div className="flex h-32 items-center justify-center text-xs text-slate-500 font-medium">
              Carregando dados detalhados do cliente...
            </div>
          ) : (
            <>
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-medium text-slate-500">LTV / Total Gasto</p>
                  <p className="mt-0.5 text-sm font-bold text-emerald-700">
                    {money(metrics.totalSpent)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-medium text-slate-500">Qtd. de Pedidos</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    {metrics.orders || 0}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-medium text-slate-500">Ticket Médio</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    {money(metrics.averageTicket)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-medium text-slate-500">Primeira Compra</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-800">
                    {date(metrics.firstPurchase)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-medium text-slate-500">Última Compra</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-800">
                    {date(metrics.lastPurchase)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-medium text-slate-500">Frequência</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-800">
                    {metrics.averageFrequencyDays == null
                      ? '—'
                      : `${Number(metrics.averageFrequencyDays).toFixed(1)} dias`}
                  </p>
                </div>
              </div>

              {/* Fidelidade Banner */}
              <div className="flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-50/60 p-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                  <div>
                    <p className="text-xs font-bold text-amber-900">Programa de Fidelidade</p>
                    <p className="text-[11px] text-amber-800">
                      Saldo atual: <strong>{details.customer?.pontos || 0} pontos</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenPoints}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition-colors"
                >
                  Ajustar Pontos
                </button>
              </div>

              {/* Endereços Cadastrados */}
              {details.customer?.enderecos?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                    Endereços Cadastrados ({details.customer.enderecos.length})
                  </p>
                  <div className="space-y-1.5">
                    {details.customer.enderecos.map((address: any, index: number) => (
                      <div
                        key={address._id || index}
                        className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-2.5 text-xs text-slate-700"
                      >
                        <p className="font-medium text-slate-900">
                          {address.logradouro || address.rua}, {address.numero}
                          {address.complemento ? ` (${address.complemento})` : ''}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {address.bairro}
                          {address.cidade ? ` · ${address.cidade}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico de Pedidos */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-emerald-600" />
                  Histórico de Pedidos ({details.orders?.length || 0})
                </p>

                <div className="space-y-2">
                  {details.orders?.length ? (
                    details.orders.map((order: any) => (
                      <div
                        key={order._id}
                        className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white p-3 shadow-2xs text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              Pedido #{order.orderNumber || String(order._id).slice(-6)}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border ${
                                order.status === 'Entregue' || order.status === 'Finalizado'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                                  : order.status === 'Cancelado'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                                  : 'bg-amber-50 text-amber-800 border-amber-200/60'
                              }`}
                            >
                              {order.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {new Date(order.createdAt).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <span className="font-bold text-slate-900">
                          {money(order.total)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-4 text-center text-xs text-slate-500">
                      Nenhum pedido vinculado a este cliente.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
