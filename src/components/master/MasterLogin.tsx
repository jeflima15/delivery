import { useState } from 'react';
import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { apiFetch, readJson } from '../../lib/api';
import { buttonPrimary, fieldClass } from './components/MasterUI';

interface Props { expired?: boolean; onSuccess: () => void }

export default function MasterLogin({ expired, onSuccess }: Props) {
  const [form, setForm] = useState({ email: '', password: '', code: '' });
  const [recoveryMode, setRecoveryMode] = useState(false); const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const credential = recoveryMode ? { recoveryCode: form.code.trim() } : { mfaCode: form.code.trim() };
      await readJson(await apiFetch('/api/platform/auth/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: form.email, password: form.password, ...credential }) }));
      onSuccess();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao entrar.'); }
    finally { setBusy(false); }
  };
  return <main className="relative grid min-h-[100dvh] overflow-hidden bg-[#050914] p-4 text-white lg:grid-cols-[1.1fr_.9fr]">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(16,185,129,.16),transparent_32%),radial-gradient(circle_at_85%_85%,rgba(14,165,233,.08),transparent_28%)]"/>
    <section className="relative hidden flex-col justify-between p-12 lg:flex"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400 text-slate-950 font-black text-lg">PV</span><div><strong className="text-lg">Pode Vir</strong><p className="text-xs text-slate-400">Centro de controle SaaS</p></div></div><div className="max-w-xl"><p className="text-sm font-semibold uppercase tracking-[.22em] text-emerald-400">Operadores e Tenants</p><h1 className="mt-5 text-5xl font-bold leading-[1.08] tracking-tight">Decisões claras para uma plataforma saudável.</h1><p className="mt-6 text-lg leading-8 text-slate-400">Lojas, assinaturas, faturamento e atividade administrativa reunidos em um ambiente seguro e auditado.</p></div><p className="text-xs text-slate-600">Acesso exclusivo do proprietário da plataforma Pode Vir.</p></section>
    <section className="relative grid place-items-center"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-9"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-400"><LockKeyhole className="h-6 w-6"/></div><h2 className="mt-6 text-2xl font-bold">Admin Master</h2><p className="mt-2 text-sm leading-6 text-slate-400">Entre com suas credenciais e o segundo fator para continuar.</p>{expired && <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">Sua sessão expirou. Entre novamente para voltar à página solicitada.</p>}
      <div className="mt-7 space-y-4"><label className="block text-sm font-medium text-slate-300">E-mail<input required type="email" autoComplete="username" className={`${fieldClass} mt-2 h-12`} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label><label className="block text-sm font-medium text-slate-300">Senha<div className="relative mt-2"><input required minLength={8} type={showPassword ? 'text' : 'password'} autoComplete="current-password" className={`${fieldClass} h-12 pr-12`} value={form.password} onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))} onChange={(event) => setForm({ ...form, password: event.target.value })}/><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-500 hover:text-slate-200" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}</button></div>{capsLock && <span className="mt-1 block text-xs text-amber-300">Caps Lock está ativado.</span>}</label><label className="block text-sm font-medium text-slate-300">{recoveryMode ? 'Código de recuperação' : 'Código do autenticador'}<div className="relative mt-2"><KeyRound className="absolute left-3 top-3.5 h-5 w-5 text-slate-600"/><input required pattern={recoveryMode ? '[a-fA-F0-9]{12}' : '\\d{6}'} inputMode={recoveryMode ? 'text' : 'numeric'} autoComplete="one-time-code" className={`${fieldClass} h-12 pl-11 font-mono tracking-[.2em]`} value={form.code} maxLength={recoveryMode ? 12 : 6} onChange={(event) => setForm({ ...form, code: event.target.value })}/></div></label></div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}<button disabled={busy} className={`${buttonPrimary} mt-6 h-12 w-full`}>{busy ? <><LoaderCircle className="h-4 w-4 animate-spin"/>Validando acesso...</> : 'Entrar com MFA'}</button><button type="button" onClick={() => { setRecoveryMode((value) => !value); setForm({ ...form, code: '' }); setError(''); }} className="mt-4 w-full text-center text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline">{recoveryMode ? 'Usar código do autenticador' : 'Usar código de recuperação'}</button>
    </form></section>
  </main>;
}
