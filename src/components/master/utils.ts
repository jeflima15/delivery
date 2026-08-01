import type { InvoiceStatus, PeriodKey, SubscriptionStatus, TenantStatus } from './types';

export const statusLabels: Record<TenantStatus | SubscriptionStatus | InvoiceStatus, string> = {
  onboarding: 'Onboarding', trial: 'Trial', active: 'Ativa', past_due: 'Inadimplente', suspended: 'Suspensa',
  cancelled: 'Cancelada', archived: 'Arquivada', pending: 'Pendente', paid: 'Paga', failed: 'Falhou',
  overdue: 'Vencida', refunded: 'Estornada', chargeback: 'Chargeback',
};
export const statusTones: Record<string, string> = {
  active: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300', paid: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  trial: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300', onboarding: 'border-blue-400/20 bg-blue-400/10 text-blue-300',
  pending: 'border-amber-400/20 bg-amber-400/10 text-amber-300', past_due: 'border-orange-400/20 bg-orange-400/10 text-orange-300',
  overdue: 'border-red-400/20 bg-red-400/10 text-red-300', failed: 'border-red-400/20 bg-red-400/10 text-red-300',
  suspended: 'border-violet-400/20 bg-violet-400/10 text-violet-300', cancelled: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  archived: 'border-slate-500/30 bg-slate-500/10 text-slate-400', refunded: 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-300',
  chargeback: 'border-red-400/20 bg-red-400/10 text-red-300',
};
export const periodLabels: Record<PeriodKey, string> = { today: 'Hoje', '7d': '7 dias', '30d': '30 dias', current_month: 'Mês atual', previous_month: 'Mês anterior', current_year: 'Ano atual' };

export const money = (cents = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const integer = (value = 0) => new Intl.NumberFormat('pt-BR').format(value);
export const date = (value?: string | Date, withTime = false) => value ? new Intl.DateTimeFormat('pt-BR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(new Date(value)) : '—';
export const compactDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`));
export const asRecord = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};

export function rangeForPeriod(period: PeriodKey): { from: string; to: string } {
  const now = new Date(); const to = new Date(now); const from = new Date(now);
  if (period === 'today') from.setHours(0, 0, 0, 0);
  if (period === '7d') from.setDate(from.getDate() - 6);
  if (period === '30d') from.setDate(from.getDate() - 29);
  if (period === 'current_month') from.setDate(1);
  if (period === 'previous_month') { from.setMonth(from.getMonth() - 1, 1); to.setDate(0); }
  if (period === 'current_year') from.setMonth(0, 1);
  const iso = (item: Date) => item.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}
export function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(';'), ...rows.map((row) => headers.map((key) => escape(row[key] ?? '')).join(';'))].join('\n');
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
  anchor.download = filename; anchor.click(); URL.revokeObjectURL(anchor.href);
}
