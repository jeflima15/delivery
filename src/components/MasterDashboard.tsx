import { useEffect, useState } from 'react';
import { Building2, CircleDollarSign, LogOut, ShieldCheck, ShoppingBag } from 'lucide-react';
import { apiFetch, readJson } from '../lib/api';

export default function MasterDashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [form, setForm] = useState({ email: '', password: '', mfaCode: '' });
  const [metrics, setMetrics] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [dashboard, tenantList] = await Promise.all([
        readJson<any>(await apiFetch('/api/master/dashboard')),
        readJson<any>(await apiFetch('/api/master/tenants?limit=50')),
      ]);
      setMetrics(dashboard); setTenants(tenantList.items || []); setAuthenticated(true);
    } catch { setAuthenticated(false); }
  };
  useEffect(() => { load(); }, []);

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try { await readJson(await apiFetch('/api/platform/auth/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao entrar.'); }
  };

  if (authenticated === null) return <div className="grid min-h-screen place-items-center bg-slate-950 text-slate-300">Validando sessao Master...</div>;
  if (!authenticated) return <main className="grid min-h-screen place-items-center bg-slate-950 p-4"><form onSubmit={login} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 text-white shadow-2xl"><ShieldCheck className="mb-6 h-10 w-10 text-emerald-400" /><h1 className="text-2xl font-semibold">Admin Master</h1><p className="mb-6 mt-1 text-sm text-slate-400">Acesso global protegido por MFA.</p><div className="space-y-3"><input required type="email" placeholder="E-mail" className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/><input required minLength={8} type="password" placeholder="Senha" className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}/><input required pattern="\d{6}" inputMode="numeric" placeholder="Codigo MFA" className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4" value={form.mfaCode} onChange={(e) => setForm({ ...form, mfaCode: e.target.value })}/></div>{error && <p className="mt-4 text-sm text-red-400">{error}</p>}<button className="mt-6 h-12 w-full rounded-xl bg-emerald-500 font-semibold text-slate-950">Entrar com MFA</button></form></main>;

  const active = (metrics?.tenants?.active || 0) + (metrics?.tenants?.trial || 0);
  return <main className="min-h-screen bg-slate-950 text-white"><header className="border-b border-slate-800 px-6 py-4"><div className="mx-auto flex max-w-7xl items-center justify-between"><div><strong>Delivery Platform</strong><p className="text-xs text-slate-400">Controle global auditado</p></div><button onClick={async () => { await apiFetch('/api/platform/auth/logout', { method: 'POST' }); setAuthenticated(false); }} className="flex items-center gap-2 text-sm text-slate-400"><LogOut className="h-4 w-4" />Sair</button></div></header><section className="mx-auto max-w-7xl p-6"><h1 className="text-3xl font-semibold">Plataforma</h1><div className="mt-6 grid gap-4 md:grid-cols-4">{[["Lojas ativas", active, Building2], ["Pedidos", metrics?.orders || 0, ShoppingBag], ["GMV", `R$ ${((metrics?.gmvCents || 0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2})}`, CircleDollarSign], ["Receita SaaS", `R$ ${((metrics?.platformRevenueCents || 0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2})}`, CircleDollarSign]].map(([label,value,Icon]:any)=><article key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><Icon className="h-5 w-5 text-emerald-400"/><p className="mt-4 text-sm text-slate-400">{label}</p><strong className="text-2xl">{value}</strong></article>)}</div><div className="mt-8 overflow-hidden rounded-2xl border border-slate-800"><div className="bg-slate-900 px-5 py-4 font-semibold">Lojas</div>{tenants.map((tenant)=><div key={tenant._id} className="flex items-center justify-between border-t border-slate-800 px-5 py-4"><div><strong>{tenant.displayName}</strong><p className="text-sm text-slate-400">/{tenant.slug} · {tenant.owner?.email}</p></div><span className="rounded-full bg-slate-800 px-3 py-1 text-xs">{tenant.status}</span></div>)}</div></section></main>;
}
