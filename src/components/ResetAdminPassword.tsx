import { useState } from 'react';
import { apiFetch, readJson } from '../lib/api';

export default function ResetAdminPassword({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }),
      });
      await readJson(response);
      setSuccess(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível redefinir a senha.');
    } finally { setLoading(false); }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-16">
        <div className="mx-auto max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl text-center">
          <h1 className="text-2xl font-bold text-slate-900">Senha Redefinida</h1>
          <p className="text-sm text-slate-500">Sua senha foi redefinida com sucesso.</p>
          <button onClick={() => window.location.href = '/master/login'} className="mt-4 h-11 w-full rounded-lg bg-emerald-600 font-semibold text-white">Ir para o Login Master</button>
          <button onClick={() => window.location.href = '/admin'} className="h-11 w-full rounded-lg bg-slate-200 font-semibold text-slate-700">Ir para o Painel da Loja</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16">
      <form onSubmit={submit} className="mx-auto max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div>
          <p className="text-sm font-semibold text-emerald-600">Delivery</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Redefinir senha</h1>
          <p className="mt-2 text-sm text-slate-500">Crie uma nova senha forte para acessar sua conta administrativa.</p>
        </div>
        <label className="block text-sm font-medium text-slate-700">Nova Senha
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-500" />
          <span className="mt-1 block text-xs text-slate-500">Minimo de 10 caracteres, com maiuscula, minuscula e numero.</span>
        </label>
        <label className="block text-sm font-medium text-slate-700">Confirmar Nova Senha
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={10} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-500" />
        </label>
        {message && <p role="status" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <button disabled={loading} className="h-11 w-full rounded-lg bg-emerald-600 font-semibold text-white disabled:opacity-60">{loading ? 'Salvando...' : 'Redefinir senha'}</button>
      </form>
    </main>
  );
}
