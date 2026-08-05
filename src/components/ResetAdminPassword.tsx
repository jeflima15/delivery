import { useEffect, useState } from 'react';
import { apiFetch, readJson } from '../lib/api';

interface ResetInfo {
  accountName: string;
  accountEmail: string;
  tenantName: string;
  tenantSlug: string;
}

export default function ResetAdminPassword({ token }: { token: string }) {
  const [info, setInfo] = useState<ResetInfo | null>(null);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadInfo() {
      try {
        const response = await apiFetch(`/api/platform/auth/admin/reset-password/${encodeURIComponent(token)}`);
        const data = await readJson<{ success: true; info: ResetInfo }>(response);
        setInfo(data.info);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Link inválido ou expirado.');
      } finally {
        setFetching(false);
      }
    }
    loadInfo();
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setMessage('As senhas não conferem.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const response = await apiFetch(`/api/platform/auth/admin/reset-password/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      await readJson(response);
      setSuccess(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-16">
        <div className="text-center text-slate-500 font-medium animate-pulse">
          Carregando informações de acesso...
        </div>
      </main>
    );
  }

  if (fetchError) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-16">
        <div className="mx-auto max-w-md space-y-5 rounded-3xl border border-red-200 bg-white p-8 shadow-xl text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-600 text-xl font-bold">!</div>
          <h1 className="text-2xl font-bold text-slate-900">Link Inválido ou Expirado</h1>
          <p className="text-sm text-slate-500">{fetchError}</p>
          <p className="text-xs text-slate-400">Solicite um novo link de redefinição ao administrador master da plataforma.</p>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-16">
        <div className="mx-auto max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600 text-xl font-bold">✓</div>
          <h1 className="text-2xl font-bold text-slate-900">Senha Redefinida!</h1>
          <p className="text-sm text-slate-500">Sua senha foi alterada com sucesso. Agora você já pode acessar o painel administrativo.</p>
          <button
            onClick={() => (window.location.href = info?.tenantSlug ? `/${info.tenantSlug}/admin` : '/admin')}
            className="mt-4 h-11 w-full rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            Ir para o Painel da Loja ({info?.tenantName || 'Login'})
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16">
      <form onSubmit={submit} className="mx-auto max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Painel Administrativo</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Redefinir senha</h1>
          <p className="mt-1 text-sm text-slate-500">Crie uma nova senha de acesso para esta conta.</p>
        </div>

        {info && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/60 p-4 space-y-1">
            <p className="text-xs text-slate-500 font-medium">Loja / Estabelecimento:</p>
            <p className="text-sm font-bold text-slate-800">
              {info.tenantName} <span className="text-xs font-normal text-slate-500">({info.tenantSlug})</span>
            </p>
            <div className="pt-2 border-t border-emerald-500/10 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">{info.accountName}</span> ({info.accountEmail})
            </div>
          </div>
        )}

        <label className="block text-sm font-medium text-slate-700">
          Nova Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={10}
            className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            placeholder="Digite a nova senha"
          />
          <span className="mt-1 block text-xs text-slate-500">Mínimo de 10 caracteres, com letra maiúscula, minúscula e número.</span>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Confirmar Nova Senha
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={10}
            className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            placeholder="Repita a nova senha"
          />
        </label>

        {message && <p role="status" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">{message}</p>}

        <button
          disabled={loading}
          className="h-11 w-full rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          {loading ? 'Salvando...' : 'Salvar Nova Senha'}
        </button>
      </form>
    </main>
  );
}
