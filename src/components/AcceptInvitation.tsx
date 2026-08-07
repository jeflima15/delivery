import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Store, Sparkles } from 'lucide-react';
import { apiFetch, readJson } from '../lib/api';
import PodeVirBrand from './brand/PodeVirBrand';

interface StoreMeta {
  name: string;
  slug: string;
}

export default function AcceptInvitation({ token }: { token: string }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [store, setStore] = useState<StoreMeta | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [activatedStore, setActivatedStore] = useState<StoreMeta | null>(null);

  useEffect(() => {
    async function loadMeta() {
      try {
        const res = await apiFetch(`/api/platform/auth/invitations/${encodeURIComponent(token)}`);
        const data = await readJson<{ success: boolean; invitation?: { store?: StoreMeta } }>(res);
        if (data.invitation?.store) {
          setStore(data.invitation.store);
        }
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Convite inválido ou expirado.');
      } finally {
        setFetching(false);
      }
    }
    loadMeta();
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`/api/platform/auth/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      const data = await readJson<{ success: boolean; store?: StoreMeta }>(response);
      const targetStore = data.store || store;
      setActivatedStore(targetStore || null);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7f2] p-4 text-center">
        <div className="text-sm font-semibold text-[#526159] animate-pulse">
          Carregando informações do convite...
        </div>
      </main>
    );
  }

  if (fetchError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7f2] px-4 py-16">
        <div className="mx-auto w-full max-w-md space-y-5 rounded-[2.5rem] border border-red-200 bg-white p-8 sm:p-10 shadow-xl text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-100 text-red-600 text-2xl font-bold">!</div>
          <h1 className="text-2xl font-black text-slate-900">Convite Inválido ou Expirado</h1>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">{fetchError}</p>
          <p className="text-xs text-slate-400">Solicite um novo convite ao proprietário ou ao administrador master da plataforma.</p>
          <a href="/" className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#14231d] px-6 py-3.5 text-xs font-bold text-white">
            Voltar para o início
          </a>
        </div>
      </main>
    );
  }

  if (success) {
    const adminPath = activatedStore?.slug ? `/${encodeURIComponent(activatedStore.slug)}/admin` : '/login';

    return (
      <main className="min-h-screen bg-[#f6f7f2] px-4 py-16 flex items-center justify-center">
        <div className="w-full max-w-md space-y-6 rounded-[2.5rem] border border-black/5 bg-white p-8 sm:p-10 shadow-2xl shadow-black/5 text-center">
          <div className="mx-auto flex justify-center">
            <PodeVirBrand size="lg" />
          </div>

          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-[#e5f7ec] text-[#0b7a53]">
            <CheckCircle2 className="h-9 w-9" />
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf7f1] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#0b7a53]">
              <Sparkles className="h-3.5 w-3.5" /> Acesso ativado
            </span>
            <h1 className="mt-4 text-2xl font-black text-slate-900 tracking-tight">Conta criada com sucesso!</h1>
            <p className="mt-2 text-xs text-[#526159] font-medium leading-relaxed">
              Sua conta administrativa foi ativada. Você já pode gerenciar a operação da sua loja.
            </p>
          </div>

          {activatedStore && (
            <div className="rounded-2xl border border-black/10 bg-[#f6f7f2] p-4 text-left flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#0b7a53] shadow-sm">
                <Store className="h-5 w-5" />
              </div>
              <div className="overflow-hidden">
                <strong className="block text-sm font-bold text-slate-900 truncate">
                  {activatedStore.name}
                </strong>
                <span className="text-xs font-mono text-slate-500">/{activatedStore.slug}/admin</span>
              </div>
            </div>
          )}

          <a
            href={adminPath}
            className="w-full rounded-2xl bg-[#0b7a53] py-4 font-black text-white shadow-lg shadow-emerald-900/15 hover:bg-[#096744] transition-all flex items-center justify-center gap-2 text-sm"
          >
            Ir para o Painel da Loja <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f2] px-4 py-16 flex items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-md space-y-6 rounded-[2.5rem] border border-black/5 bg-white p-8 sm:p-10 shadow-2xl shadow-black/5">
        <div className="flex justify-center sm:justify-start">
          <PodeVirBrand size="md" />
        </div>

        <div>
          <h1 className="mt-2 text-2xl font-black text-slate-900 tracking-tight">Ative seu acesso</h1>
          <p className="mt-1.5 text-xs text-[#526159] font-medium leading-relaxed">
            {store ? (
              <>Você foi convidado para administrar a loja <strong className="text-slate-900 font-bold">{store.name}</strong> na Pode Vir.</>
            ) : (
              'Você foi convidado para administrar um estabelecimento na Pode Vir.'
            )}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#526159] mb-1.5">
              Seu Nome Completo
            </label>
            <input
              required
              minLength={2}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Carlos Silva"
              className="w-full rounded-2xl border border-black/10 bg-[#f6f7f2] px-4 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-[#0b7a53] focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#526159] mb-1.5">
              Crie uma Senha Forte
            </label>
            <div className="relative">
              <input
                required
                minLength={10}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 10 caracteres"
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
            <span className="mt-1 block text-[11px] text-slate-400 font-medium">
              Mínimo de 10 caracteres, com maiúscula, minúscula e número.
            </span>
          </div>
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
          {loading ? 'Ativando conta...' : <>Ativar conta e acessar painel <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>
    </main>
  );
}
