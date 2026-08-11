import React, { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { customerApi } from '../features/customer/api';
import { applyStoreTheme, DEFAULT_STORE_THEME } from '../lib/theme';

type Props = { tenantSlug: string; token: string };

export default function CustomerResetPassword({ tenantSlug, token }: Props) {
  const [request, setRequest] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [storeName, setStoreName] = useState('Loja');

  useEffect(() => {
    let active = true;
    applyStoreTheme(DEFAULT_STORE_THEME);
    fetch(`/api/public/stores/${encodeURIComponent(tenantSlug)}/store`)
      .then((response) => response.json())
      .then((result) => {
        if (!active || !result?.success) return;
        applyStoreTheme(result.settings?.theme);
        setStoreName(result.settings?.nome_loja || 'Loja');
      })
      .catch(() => undefined);
    customerApi(tenantSlug).validateManualPasswordRecovery(token)
      .then((result) => { if (active) setRequest(result.request); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Link invalido ou expirado.'); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [tenantSlug, token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword.length < 10 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError('Use ao menos 10 caracteres, com maiuscula, minuscula e numero.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas nao coincidem.');
      return;
    }
    setSaving(true);
    try {
      await customerApi(tenantSlug).confirmManualPasswordRecovery(token, { newPassword, confirmPassword });
      setCompleted(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nao foi possivel alterar a senha.');
    } finally {
      setSaving(false);
    }
  };

  return <main className="min-h-dvh bg-gray-50 px-4 py-10 sm:grid sm:place-items-center">
    <section className="mx-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl sm:p-8">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl store-bg-soft store-text-primary"><KeyRound className="h-7 w-7" /></div>
      {checking ? <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" /><p className="mt-3 text-sm text-gray-500">Validando seu link...</p></div> : completed ? <div className="pt-5 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 store-text-primary" />
        <h1 className="mt-4 text-2xl font-black text-gray-900">Senha alterada</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">Sua nova senha ja esta ativa. Entre novamente para acessar seus pedidos e dados privados.</p>
        <a href={`/${encodeURIComponent(tenantSlug)}`} className="mt-6 flex h-12 items-center justify-center rounded-xl store-bg-primary store-text-on-primary text-sm font-black">VOLTAR PARA {storeName.toUpperCase()}</a>
      </div> : request ? <>
        <div className="pt-5 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] store-text-primary">Recuperacao segura | {storeName}</p>
          <h1 className="mt-2 text-2xl font-black text-gray-900">Crie uma nova senha</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">Ola, {request.customerName}. Link referente a <strong>{request.reference}</strong> para o telefone {request.maskedPhone}.</p>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-gray-700">Nova senha<div className="relative mt-1"><input autoFocus required type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="h-12 w-full rounded-xl border border-gray-300 px-4 pr-12 outline-none store-focus" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-gray-400">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></label>
          <label className="block text-sm font-semibold text-gray-700">Confirmar nova senha<input required type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-gray-300 px-4 outline-none store-focus" /></label>
          <p className="text-xs leading-5 text-gray-500">Use ao menos 10 caracteres, incluindo letra maiuscula, minuscula e numero.</p>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
          <button disabled={saving} className="flex h-12 w-full items-center justify-center rounded-xl store-bg-primary store-text-on-primary text-sm font-black disabled:opacity-50">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'ALTERAR SENHA'}</button>
        </form>
      </> : <div className="pt-5 text-center">
        <h1 className="text-2xl font-black text-gray-900">Link indisponivel</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">{error || 'Este link ja foi usado ou expirou. Solicite uma nova recuperacao na loja.'}</p>
        <a href={`/${encodeURIComponent(tenantSlug)}`} className="mt-6 flex h-12 items-center justify-center rounded-xl border border-gray-300 text-sm font-black text-gray-700">VOLTAR PARA A LOJA</a>
      </div>}
    </section>
  </main>;
}
