import { useState } from 'react';
import { apiFetch, readJson } from '../lib/api';

export default function AcceptInvitation({ token }: { token: string }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await apiFetch(`/api/platform/auth/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password }),
      });
      await readJson(response);
      setMessage('Conta ativada. Agora voce pode entrar no painel da sua loja.');
      setPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nao foi possivel aceitar o convite.');
    } finally { setLoading(false); }
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-16">
    <form onSubmit={submit} className="mx-auto max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
      <div><p className="text-sm font-semibold text-emerald-600">Delivery</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Ative seu acesso</h1><p className="mt-2 text-sm text-slate-500">Defina seu nome e uma senha forte para administrar a loja.</p></div>
      <label className="block text-sm font-medium text-slate-700">Nome<input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-500" /></label>
      <label className="block text-sm font-medium text-slate-700">Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-500" /><span className="mt-1 block text-xs text-slate-500">Minimo de 10 caracteres, com maiuscula, minuscula e numero.</span></label>
      {message && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{message}</p>}
      <button disabled={loading} className="h-11 w-full rounded-lg bg-emerald-600 font-semibold text-white disabled:opacity-60">{loading ? 'Ativando...' : 'Ativar conta'}</button>
    </form>
  </main>;
}
