import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ArrowLeft, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { customerApi } from '../features/customer/api';

interface Props { isOpen: boolean; onClose: () => void; onLoginSuccess: (user: any, token: string) => void; tenantSlug?: string | null; storeWhatsapp?: string; onStageChange?: (stage: Step) => void; }
type Step = 'phone' | 'login' | 'register' | 'recovery' | 'reset';

export default function PhoneAuthModal({ isOpen, onClose, onLoginSuccess, tenantSlug, storeWhatsapp, onStageChange }: Props) {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [flowId, setFlowId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const api = tenantSlug ? customerApi(tenantSlug) : null;

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setStep('phone'); setFlowId(''); setPassword(''); setConfirmPassword(''); setCode(''); setError('');
    setTimeout(() => titleRef.current?.focus(), 0);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', key); returnFocusRef.current?.focus(); };
  }, [isOpen]);

  useEffect(() => { if (isOpen) onStageChange?.(step); }, [isOpen, onStageChange, step]);

  if (!isOpen) return null;
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };
  const back = () => { setError(''); setStep(step === 'reset' ? 'recovery' : 'phone'); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      if (!api) throw new Error('Loja invalida.');
      if (step === 'phone') {
        const result = await api.identify(phone);
        setFlowId(result.flowId); setStep(result.nextStep);
      } else if (step === 'login') {
        const result = await api.login({ phone, password, flowId });
        onLoginSuccess(result.user, 'cookie-session'); onClose();
      } else if (step === 'register') {
        if (password !== confirmPassword) throw new Error('As senhas nao coincidem.');
        const result = await api.register({ phone, name, password, confirmPassword, flowId });
        onLoginSuccess(result.user, 'cookie-session'); onClose();
      } else if (step === 'recovery') {
        await api.requestPassword(phone); setStep('reset');
      } else {
        if (password !== confirmPassword) throw new Error('As senhas nao coincidem.');
        await api.confirmPassword({ phone, code, newPassword: password });
        setPassword(''); setConfirmPassword(''); setStep('phone'); setError('Senha redefinida. Identifique-se para entrar.');
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Nao foi possivel continuar.'); }
    finally { setLoading(false); }
  };
  const input = 'h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none store-focus';
  const title = step === 'phone' ? 'Entrar ou criar conta' : step === 'login' ? 'Que bom ter voce de volta' : step === 'register' ? 'Crie sua conta' : step === 'recovery' ? 'Recuperar senha' : 'Defina uma nova senha';
  const passwordChecks = { length: password.length >= 10, lower: /[a-z]/.test(password), upper: /[A-Z]/.test(password), number: /\d/.test(password) };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="customer-access-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="w-full rounded-t-2xl bg-white shadow-2xl sm:max-w-[420px] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <button type="button" aria-label="Voltar" onClick={back} className={`h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 ${step === 'phone' ? 'invisible flex' : 'flex'}`}><ArrowLeft className="h-4 w-4" /></button>
          <h2 id="customer-access-title" ref={titleRef} tabIndex={-1} className="text-base font-semibold text-gray-800 outline-none">{title}</h2>
          <button type="button" aria-label="Fechar" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          {step === 'phone' && <p className="text-sm leading-5 text-gray-500">Use seu telefone para acessar pedidos, enderecos e fidelidade desta loja.</p>}
          {(step === 'phone' || step === 'recovery') && <label htmlFor="customer-phone" className="block text-sm font-medium text-gray-700">Telefone<input id="customer-phone" autoFocus type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(00) 00000-0000" className={`${input} mt-1.5`} required /></label>}
          {(step === 'login' || step === 'register') && <div className="rounded-lg bg-gray-50 px-3 py-2"><p className="text-xs font-medium text-gray-500">Telefone</p><p className="mt-0.5 text-sm font-semibold text-gray-800">+55 {phone}</p></div>}
          {step === 'register' && <label htmlFor="customer-name" className="block text-sm font-medium text-gray-700">Nome completo<input id="customer-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1.5`} required minLength={2} /></label>}
          {(step === 'login' || step === 'register' || step === 'reset') && <>
            {step === 'reset' && <label className="block text-sm font-medium text-gray-700">Codigo recebido<input autoFocus inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${input} mt-1.5`} required pattern="\d{6}" /></label>}
            <label className="block text-sm font-medium text-gray-700">{step === 'reset' ? 'Nova senha' : 'Senha'}<span className="relative mt-1.5 block"><input autoFocus={step !== 'reset'} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} pr-11`} required minLength={10} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
            {(step === 'register' || step === 'reset') && <label className="block text-sm font-medium text-gray-700">Confirmar senha<input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={`${input} mt-1.5`} required minLength={10} /></label>}
            {(step === 'register' || step === 'reset') && <ul className="grid grid-cols-2 gap-1 text-xs" aria-label="Requisitos da senha"><li className={passwordChecks.length ? 'text-green-700' : 'text-gray-500'}>10 caracteres</li><li className={passwordChecks.lower ? 'text-green-700' : 'text-gray-500'}>Uma minuscula</li><li className={passwordChecks.upper ? 'text-green-700' : 'text-gray-500'}>Uma maiuscula</li><li className={passwordChecks.number ? 'text-green-700' : 'text-gray-500'}>Um numero</li></ul>}
          </>}
          {error && <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${error.startsWith('Senha redefinida') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{error}</p>}
          {step === 'login' && <button type="button" onClick={() => { setError(''); setStep('recovery'); }} className="text-sm font-medium store-text-primary">Esqueci minha senha</button>}
          <button disabled={loading} className="flex h-12 w-full items-center justify-center rounded-lg store-bg-primary store-text-on-primary text-sm font-semibold disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : step === 'phone' ? 'Continuar' : step === 'login' ? 'Entrar' : step === 'register' ? 'Criar conta' : step === 'recovery' ? 'Enviar codigo' : 'Redefinir senha'}</button>
          {step === 'recovery' && storeWhatsapp && <a className="block text-center text-xs text-gray-500 underline" href={`https://wa.me/${storeWhatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">Precisa de ajuda? Fale com a loja</a>}
        </form>
      </div>
    </div>, document.body,
  );
}
