import React, { useState } from 'react';
import { Eye, EyeOff, Store, ArrowRight, ShieldCheck, LockKeyhole } from 'lucide-react';
import PodeVirBrand from './brand/PodeVirBrand';
import { apiFetch, readJson } from '../lib/api';

interface StoreOption {
  id: string;
  displayName: string;
  slug: string;
  status: string;
}

export default function CentralMerchantLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stores, setStores] = useState<StoreOption[] | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setStores(null);

    try {
      const res = await apiFetch('/api/platform/auth/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await readJson<{
        success: boolean;
        slug?: string;
        requireTenantSelection?: boolean;
        tenants?: StoreOption[];
        account?: { platformRole?: string };
      }>(res);

      if (data.requireTenantSelection && data.tenants && data.tenants.length > 0) {
        setStores(data.tenants);
      } else if (data.slug) {
        window.location.href = `/${encodeURIComponent(data.slug)}/admin`;
      } else if (data.account?.platformRole === 'platform_super_admin') {
        window.location.href = '/master/dashboard';
      } else {
        setError('Não foi possível identificar a loja associada a este e-mail.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'E-mail ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStore = async (slug: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/platform/auth/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, slug }),
      });
      const data = await readJson<{ success: boolean }>(res);
      if (data.success) {
        window.location.href = `/${encodeURIComponent(slug)}/admin`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao acessar a loja.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f7f2] flex flex-col justify-between px-4 py-8 text-[#14231d]">
      <header className="mx-auto w-full max-w-md pt-4">
        <a href="/" className="inline-flex items-center gap-2 text-xs font-bold text-[#526159] hover:text-[#0b7a53] transition-colors">
          ← Voltar para a página inicial
        </a>
      </header>

      <div className="mx-auto w-full max-w-md my-auto">
        <div className="rounded-[2.5rem] border border-black/5 bg-white p-8 sm:p-10 shadow-xl shadow-black/5 text-center">
          <div className="mx-auto mb-6 flex justify-center">
            <PodeVirBrand size="lg" />
          </div>

          {!stores ? (
            <>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Acesso do Lojista</h1>
              <p className="mt-2 text-xs text-[#526159] font-medium leading-relaxed">
                Entre com seu e-mail e senha para gerenciar seu estabelecimento.
              </p>

              <form onSubmit={handleLogin} className="mt-8 space-y-4 text-left">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#526159] mb-1.5">
                    E-mail administrativo
                  </label>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    placeholder="seuemail@loja.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-black/10 bg-[#f6f7f2] px-4 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-[#0b7a53] focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#526159] mb-1.5">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Sua senha"
                      value={password}
                      onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-2xl border border-black/10 bg-[#f6f7f2] px-4 py-3.5 pr-12 text-sm font-bold text-slate-900 outline-none focus:border-[#0b7a53] focus:bg-white transition-all"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      onClick={() => setShowPassword((val) => !val)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {capsLock && (
                    <span className="mt-1 block text-xs text-amber-600 font-medium">Caps Lock está ativado.</span>
                  )}
                </div>

                {error && (
                  <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">
                    {error}
                  </div>
                )}

                <button
                  disabled={loading}
                  type="submit"
                  className="w-full rounded-2xl bg-[#0b7a53] py-4 font-black text-white shadow-lg shadow-emerald-900/15 hover:bg-[#096744] disabled:opacity-60 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {loading ? 'Verificando acesso...' : <>Entrar na minha loja <ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>

              <div className="mt-8 border-t border-black/5 pt-6 text-center">
                <a
                  href="/master/login"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7c8982] hover:text-[#0b7a53] transition-colors"
                >
                  <ShieldCheck className="h-4 w-4" /> É Administrador Master? Acesse aqui
                </a>
              </div>
            </>
          ) : (
            <div className="text-left">
              <span className="rounded-full bg-[#edf7f1] px-3 py-1 text-xs font-black uppercase tracking-wider text-[#0b7a53]">
                Múltiplos estabelecimentos
              </span>
              <h2 className="mt-3 text-2xl font-black text-slate-900">Selecione sua loja</h2>
              <p className="mt-1 text-xs text-[#526159] font-medium">
                Sua conta possui acesso a mais de um estabelecimento. Escolha qual deseja gerenciar agora:
              </p>

              <div className="mt-6 space-y-3">
                {stores.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => handleSelectStore(st.slug)}
                    disabled={loading}
                    className="w-full flex items-center justify-between rounded-2xl border border-black/10 bg-[#f6f7f2] p-4 text-left hover:border-[#0b7a53] hover:bg-white transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#0b7a53] shadow-sm">
                        <Store className="h-5 w-5" />
                      </div>
                      <div>
                        <strong className="block text-sm font-bold text-slate-900 group-hover:text-[#0b7a53]">
                          {st.displayName}
                        </strong>
                        <span className="text-xs text-slate-500 font-mono">/{st.slug}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-[#0b7a53] group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>

              <button
                onClick={() => setStores(null)}
                className="mt-6 w-full text-center text-xs font-bold text-[#526159] hover:underline"
              >
                Voltar e usar outro e-mail
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="mx-auto w-full max-w-md pb-4 text-center text-xs text-[#839088]">
        © 2026 Pode Vir · Plataforma em fase piloto
      </footer>
    </main>
  );
}
