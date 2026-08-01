import { useEffect, useState } from 'react';
import { Boxes, LogOut, Package, ShieldCheck, ShoppingBag, Store } from 'lucide-react';
import { apiFetch, readJson } from '../lib/api';

type Props = { slug: string };
type Dashboard = { metrics: { products: number; orders: number; pendingOrders: number }; settings?: { nome_loja?: string; is_open?: boolean } };

export default function TenantAdminDashboard({ slug }: Props) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [form, setForm] = useState({ email: '', password: '' });
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [catalog, setCatalog] = useState<{ categories: any[]; products: any[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const payload = await readJson<{ success: true; metrics: Dashboard['metrics']; settings: Dashboard['settings'] }>(await apiFetch(`/api/tenant/stores/${encodeURIComponent(slug)}/dashboard`));
      setDashboard(payload);
      setAuthenticated(true);
    } catch { setAuthenticated(false); }
  };

  useEffect(() => { load(); }, [slug]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      await readJson(await apiFetch('/api/platform/auth/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, slug }) }));
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao entrar.'); }
    finally { setLoading(false); }
  };

  const loadCatalog = async () => {
    try { setCatalog(await readJson(await apiFetch(`/api/tenant/stores/${encodeURIComponent(slug)}/catalog`))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao carregar catalogo.'); }
  };

  const logout = async () => {
    await apiFetch('/api/platform/auth/logout', { method: 'POST' });
    setAuthenticated(false); setDashboard(null); setCatalog(null);
  };

  if (authenticated === null) return <div className="grid min-h-screen place-items-center bg-gray-50 text-sm text-gray-500">Validando sessao...</div>;
  if (!authenticated) return (
    <main className="grid min-h-screen place-items-center bg-gray-50 p-4">
      <form onSubmit={login} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <ShieldCheck className="mb-5 h-10 w-10 text-[var(--store-primary)]" />
        <h1 className="text-2xl font-semibold text-gray-900">Painel da loja</h1>
        <p className="mb-6 mt-1 text-sm text-gray-500">Acesso seguro para <strong>{slug}</strong>.</p>
        <div className="space-y-4">
          <input type="email" required placeholder="E-mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="h-12 w-full rounded-xl border border-gray-200 px-4 outline-none focus:border-[var(--store-primary)]" />
          <input type="password" required minLength={8} placeholder="Senha" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="h-12 w-full rounded-xl border border-gray-200 px-4 outline-none focus:border-[var(--store-primary)]" />
        </div>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={loading} className="mt-6 h-12 w-full rounded-xl bg-[var(--store-primary)] font-semibold text-[var(--store-on-primary)] disabled:opacity-60">{loading ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </main>
  );

  const cards = [
    ['Produtos', dashboard?.metrics.products || 0, Package],
    ['Pedidos', dashboard?.metrics.orders || 0, ShoppingBag],
    ['Pendentes', dashboard?.metrics.pendingOrders || 0, Boxes],
  ] as const;
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-5 py-4"><div className="mx-auto flex max-w-6xl items-center justify-between"><div className="flex items-center gap-3"><Store className="text-[var(--store-primary)]" /><div><strong>{dashboard?.settings?.nome_loja || slug}</strong><p className="text-xs text-gray-500">Admin isolado da loja</p></div></div><button onClick={logout} className="flex items-center gap-2 text-sm text-gray-500"><LogOut className="h-4 w-4" /> Sair</button></div></header>
      <section className="mx-auto max-w-6xl p-5">
        <h1 className="text-2xl font-semibold">Visao geral</h1>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">{cards.map(([label, value, Icon]) => <article key={label} className="rounded-2xl border bg-white p-5"><Icon className="h-5 w-5 text-[var(--store-primary)]" /><p className="mt-4 text-sm text-gray-500">{label}</p><strong className="text-3xl">{value}</strong></article>)}</div>
        <button onClick={loadCatalog} className="mt-6 rounded-xl border bg-white px-5 py-3 text-sm font-semibold">Carregar estrutura do catalogo</button>
        {catalog && <div className="mt-4 space-y-3">{catalog.categories.map((category) => <article key={category._id} className="rounded-2xl border bg-white p-4"><strong>{category.nome}</strong><p className="text-sm text-gray-500">{catalog.products.filter((product) => String(product.categoriaId) === String(category._id)).length} produtos</p></article>)}</div>}
      </section>
    </main>
  );
}
