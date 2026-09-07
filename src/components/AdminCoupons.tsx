import React, { useEffect, useState } from 'react';
import {
  Download,
  Gift,
  Loader2,
  Plus,
  Tag,
  Ticket,
  Trash2,
  X,
  UsersRound,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useToast } from './Toast';
import { useTenantAdminApi } from './tenant-admin/TenantAdminContext';
import { downloadBlob } from '../lib/download';

const money = (value: unknown) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const localDate = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate()
  ).padStart(2, '0')}`;

export default function AdminCoupons({ token }: { token: string; onUnauthorized: () => void }) {
  const api = useTenantAdminApi();
  const { showToast } = useToast();
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 29);

  const [period] = useState({ from: localDate(monthAgo), to: localDate(today) });
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({
    codigo: '',
    tipo: 'fixo',
    valor: '',
    minimo_pedido: 0,
    validade: '',
    usos_restantes: -1,
  });

  const load = async () => {
    setLoading(true);
    try {
      setReport(await api.getMarketingReport(period.from, period.to));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao carregar desempenho.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createCoupon(form);
      showToast('Cupom criado com sucesso.', 'success');
      setForm({ codigo: '', tipo: 'fixo', valor: '', minimo_pedido: 0, validade: '', usos_restantes: -1 });
      setIsAdding(false);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao criar cupom.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Excluir este cupom?')) return;
    try {
      await api.deleteCoupon(id);
      showToast('Cupom removido.', 'success');
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao remover cupom.', 'error');
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      downloadBlob(
        await api.exportReport('marketing', period.from, period.to),
        `cupons-${period.from}-a-${period.to}.csv`
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao exportar cupons.', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-xs text-slate-500 shadow-2xs">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-600" />
        Calculando desempenho de cupons e fidelidade...
      </div>
    );
  }

  const coupons = report?.coupons || [];
  const loyalty = report?.loyalty || {};

  return (
    <div className="space-y-4">
      {/* 1. Barra de Ações da Seção */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
            <Ticket className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-900">Gestão de Cupons e Programa de Fidelidade</h2>
            <p className="text-[11px] text-slate-500">
              Desempenho comercial e uso de benefícios nos últimos 30 dias.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>{exporting ? 'Exportando...' : 'Exportar CSV'}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-emerald-700 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Novo cupom</span>
          </button>
        </div>
      </div>

      {/* 2. Uso do Programa de Fidelidade */}
      <section className="rounded-xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-900">Uso do Programa de Fidelidade</h3>
          </div>
          <span className="text-[11px] text-slate-400">Últimos 30 dias</span>
        </div>

        {/* 4 KPIs de Fidelidade */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Pontos gerados" value={loyalty.pointsGenerated || 0} icon={TrendingUp} />
          <MetricCard label="Pontos resgatados" value={loyalty.pointsRedeemed || 0} icon={Sparkles} />
          <MetricCard label="Resgates feitos" value={loyalty.redemptions || 0} icon={Gift} />
          <MetricCard label="Clientes com saldo" value={loyalty.customersWithBalance || 0} icon={UsersRound} />
        </div>

        {/* Resumo Consolidado de Resgates */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-3">
            <p className="text-[11px] font-medium text-slate-500">Clientes que já resgataram</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">{loyalty.customersWhoRedeemed || 0}</p>
            {loyalty.minimumReward && (
              <p className="mt-1 text-[11px] text-slate-400">
                Menor recompensa configurada: <span className="font-semibold text-slate-600">{loyalty.minimumReward} pontos</span>
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-3">
            <p className="text-[11px] font-medium text-slate-500">Valor equivalente dos resgates</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-700">
              {loyalty.equivalentValue == null ? '—' : money(loyalty.equivalentValue)}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Baseado no snapshot de recompensa dos pedidos finalizados.
            </p>
          </div>
        </div>

        {/* Produtos mais resgatados */}
        {loyalty.topRedeemedProducts?.length > 0 ? (
          <div>
            <p className="text-xs font-bold text-slate-900 mb-2">Produtos Mais Resgatados</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {loyalty.topRedeemedProducts.map((item: any) => (
                <div
                  key={`${item.productId}-${item.name}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-xs"
                >
                  <span className="font-medium text-slate-800 truncate pr-2">{item.name}</span>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700 text-[11px]">
                    {item.units} un.
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200/80 p-3 text-center text-xs text-slate-400">
            O ranking de produtos resgatados será formado conforme novos resgates ocorrerem.
          </p>
        )}

        {/* Clientes próximos da recompensa */}
        {loyalty.nearRewardCustomers?.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-900 mb-1.5">Clientes mais próximos da recompensa</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {loyalty.nearRewardCustomers.map((customer: any) => (
                <span
                  key={customer._id}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900"
                >
                  <Sparkles className="h-3 w-3 text-amber-600" />
                  <span>{customer.nome}</span>
                  <span className="text-[11px] font-bold text-amber-700">({customer.pontos} pts)</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 3. Desempenho dos Cupons de Desconto */}
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="flex flex-col gap-1 border-b border-slate-100 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-900">Desempenho dos Cupons</h3>
            <span className="rounded-full border border-slate-200/80 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {coupons.length} {coupons.length === 1 ? 'cupom' : 'cupons'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Vendas calculadas sobre pedidos que utilizaram o cupom (faturamento bruto).
          </p>
        </div>

        {coupons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-200/70 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3.5 py-2.5">Código / Regra</th>
                  <th className="px-3.5 py-2.5">Usos</th>
                  <th className="px-3.5 py-2.5">Clientes</th>
                  <th className="px-3.5 py-2.5">Vendas Geradas</th>
                  <th className="px-3.5 py-2.5">Descontos</th>
                  <th className="px-3.5 py-2.5">Ticket Médio</th>
                  <th className="px-3.5 py-2.5">Último Uso</th>
                  <th className="px-3.5 py-2.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {coupons.map((coupon: any) => (
                  <tr key={coupon._id} className="transition-colors hover:bg-slate-50/60">
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <div>
                          <span className="inline-flex items-center rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold text-emerald-900">
                            {coupon.codigo}
                          </span>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {coupon.tipo === 'porcentagem' ? `${coupon.valor}% OFF` : `${money(coupon.valor)} OFF`}
                            {coupon.minimo_pedido > 0 && ` • Mín. ${money(coupon.minimo_pedido)}`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 font-bold text-slate-900">{coupon.analytics?.uses || 0}</td>
                    <td className="px-3.5 py-2.5 text-slate-600">{coupon.analytics?.customers || 0}</td>
                    <td className="px-3.5 py-2.5 font-bold text-slate-900">
                      {money(coupon.analytics?.revenue)}
                    </td>
                    <td className="px-3.5 py-2.5 text-rose-700 font-medium">
                      {money(coupon.analytics?.discounts)}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600">
                      {money(coupon.analytics?.averageTicket)}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500 text-[11px]">
                      {coupon.analytics?.lastUsedAt
                        ? new Date(coupon.analytics.lastUsedAt).toLocaleDateString('pt-BR')
                        : 'Nunca usado'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <button
                        type="button"
                        aria-label={`Excluir cupom ${coupon.codigo}`}
                        onClick={() => remove(coupon._id)}
                        className="inline-grid h-7 w-7 place-items-center rounded-lg border border-slate-200/70 text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                        title="Excluir cupom"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">
            <Ticket className="mx-auto mb-2 h-6 w-6 text-slate-300" />
            Nenhum cupom cadastrado até o momento.
          </div>
        )}
      </section>

      {/* 4. Modal de Criação de Cupom */}
      {isAdding && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={save}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Novo Cupom de Desconto</h3>
                <p className="text-[11px] text-slate-500">Defina o código e a regra promocional.</p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setIsAdding(false)}
                className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Código do Cupom *
                  </label>
                  <input
                    required
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                    placeholder="EX: PROMO10"
                    className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 font-mono text-xs font-bold text-slate-900 uppercase outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Tipo de Desconto
                  </label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-colors cursor-pointer"
                  >
                    <option value="fixo">Valor fixo (R$)</option>
                    <option value="porcentagem">Porcentagem (%)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Valor do Desconto *
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })}
                    placeholder={form.tipo === 'porcentagem' ? 'Ex: 10' : 'Ex: 15.00'}
                    className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Pedido Mínimo (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.minimo_pedido}
                    onChange={(e) => setForm({ ...form, minimo_pedido: Number(e.target.value) })}
                    placeholder="0 = sem mínimo"
                    className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Data de Validade (Opcional)
                  </label>
                  <input
                    type="date"
                    value={form.validade}
                    onChange={(e) => setForm({ ...form, validade: e.target.value })}
                    className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-colors cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Limite de Usos (-1 = Ilimitado)
                  </label>
                  <input
                    type="number"
                    min="-1"
                    value={form.usos_restantes}
                    onChange={(e) => setForm({ ...form, usos_restantes: Number(e.target.value) })}
                    className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{saving ? 'Criando...' : 'Criar cupom'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/50 p-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-0.5 text-lg font-bold text-slate-900">{value}</p>
      </div>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200/70 text-slate-500 shadow-2xs">
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
}
