import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Store,
  Sparkles,
  Loader2,
  Lock,
  User,
  Users,
  ShieldCheck,
  Phone,
  AlertCircle,
  Check,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { apiFetch, readJson } from '../lib/api';
import PodeVirBrand from './brand/PodeVirBrand';

interface StoreMeta {
  name: string;
  slug: string;
}

interface InvitationData {
  email: string;
  role: string;
  isOwnerInvite?: boolean;
  store?: StoreMeta | null;
}

function sanitizeSlugInput(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 63);
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length > 0 ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function checkPasswordStrength(password: string) {
  return {
    minLength: password.length >= 10,
    hasLowerUpper: /[a-z]/.test(password) && /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
  };
}

export default function AcceptInvitation({ token }: { token: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [isOwnerInvite, setIsOwnerInvite] = useState(true);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [slugReason, setSlugReason] = useState('');
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [activatedStore, setActivatedStore] = useState<StoreMeta | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadInvitation() {
      try {
        setFetching(true);
        setFetchError('');
        const res = await apiFetch(`/api/platform/auth/invitations/${encodeURIComponent(token)}`);
        const data = await readJson<{ success: boolean; invitation?: InvitationData }>(res);
        if (!isMounted) return;

        if (data.invitation) {
          setEmail(data.invitation.email || '');
          const isOwner = data.invitation.role === 'tenant_owner' || data.invitation.isOwnerInvite === true;
          setIsOwnerInvite(isOwner);
          if (data.invitation.store?.name) {
            setStoreName(data.invitation.store.name);
            const initialSlug = data.invitation.store.slug || sanitizeSlugInput(data.invitation.store.name);
            setSlug(initialSlug);
          }
        } else {
          throw new Error('Convite inválido ou expirado.');
        }
      } catch (err) {
        if (!isMounted) return;
        setFetchError(err instanceof Error ? err.message : 'Convite inválido ou expirado.');
      } finally {
        if (isMounted) setFetching(false);
      }
    }
    loadInvitation();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleStoreNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setStoreName(val);
    if (!slugManuallyEdited) {
      const autoSlug = sanitizeSlugInput(val);
      setSlug(autoSlug);
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugManuallyEdited(true);
    const sanitized = sanitizeSlugInput(e.target.value);
    setSlug(sanitized);
  };

  const handleApplySuggestion = (suggestion: string) => {
    setSlugManuallyEdited(true);
    setSlug(suggestion);
  };

  // Debounced live check for slug availability (only when activating a new store)
  useEffect(() => {
    if (!isOwnerInvite) {
      setSlugStatus('idle');
      return;
    }

    const cleanSlug = sanitizeSlugInput(slug).replace(/^-+|-+$/g, '');
    if (!cleanSlug || cleanSlug.length < 3) {
      setSlugStatus('idle');
      setSlugReason(cleanSlug.length > 0 ? 'Mínimo de 3 caracteres.' : '');
      setSlugSuggestions([]);
      return;
    }

    setSlugStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/platform/auth/check-slug?slug=${encodeURIComponent(cleanSlug)}`);
        const data = await readJson<{
          success: boolean;
          available: boolean;
          slug: string;
          reason?: string;
          suggestions?: string[];
        }>(res);

        if (data.available) {
          setSlugStatus('available');
          setSlugReason('');
          setSlugSuggestions([]);
        } else {
          setSlugStatus('unavailable');
          setSlugReason(data.reason || 'Este link já está em uso.');
          setSlugSuggestions(
            data.suggestions || [
              `${cleanSlug}-delivery`,
              `${cleanSlug}-oficial`,
              `${cleanSlug}-loja`,
            ],
          );
        }
      } catch {
        setSlugStatus('unavailable');
        setSlugReason('Não foi possível verificar a disponibilidade no momento.');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [slug, isOwnerInvite]);

  const passwordRequirements = checkPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (name.trim().length < 2) {
      setSubmitError('Por favor, informe seu nome completo (mínimo de 2 caracteres).');
      return;
    }

    const { minLength, hasLowerUpper, hasNumber } = checkPasswordStrength(password);
    if (!minLength || !hasLowerUpper || !hasNumber) {
      setSubmitError('A senha deve conter pelo menos 10 caracteres, com letras maiúsculas, minúsculas e números.');
      return;
    }

    let payload: Record<string, any> = {
      name: name.trim(),
      password,
    };

    let cleanSlug = '';
    if (isOwnerInvite) {
      if (storeName.trim().length < 2) {
        setSubmitError('Por favor, informe o nome da sua loja (mínimo de 2 caracteres).');
        return;
      }

      cleanSlug = sanitizeSlugInput(slug).replace(/^-+|-+$/g, '');
      if (cleanSlug.length < 3) {
        setSubmitError('O link da loja (slug) deve conter pelo menos 3 caracteres.');
        return;
      }

      if (slugStatus === 'unavailable') {
        setSubmitError('O link escolhido para a loja não está disponível. Por favor, escolha outro link ou utilize uma das sugestões.');
        return;
      }

      payload = {
        ...payload,
        storeName: storeName.trim(),
        slug: cleanSlug,
        phone: phone.trim() ? phone.trim() : undefined,
      };
    }

    setSubmitting(true);
    try {
      const response = await apiFetch(`/api/platform/auth/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await readJson<{ success: boolean; store?: StoreMeta }>(response);
      const targetStore = data.store || { name: storeName.trim() || 'Sua Loja', slug: cleanSlug || slug };
      setActivatedStore(targetStore);
      setSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.');
    } finally {
      setSubmitting(false);
    }
  };

  if (fetching) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-4 text-center">
        <div className="w-full max-w-md rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-8 sm:p-10 shadow-xl shadow-slate-900/5 space-y-4">
          <div className="mx-auto flex justify-center">
            <PodeVirBrand size="md" />
          </div>
          <div className="flex justify-center py-4">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
          <div className="text-sm font-bold text-slate-900">
            Carregando informações do convite...
          </div>
          <p className="text-xs text-slate-500">
            Validando seu link de ativação com a plataforma.
          </p>
        </div>
      </main>
    );
  }

  if (fetchError) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-16">
        <div className="mx-auto w-full max-w-md space-y-5 rounded-2xl sm:rounded-3xl border border-rose-200 bg-white p-8 sm:p-10 shadow-xl shadow-rose-900/5 text-center">
          <div className="mx-auto flex justify-center">
            <PodeVirBrand size="md" />
          </div>
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-rose-100 text-rose-600">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Convite Inválido ou Expirado</h1>
          <p className="text-sm text-slate-600 font-medium leading-relaxed">{fetchError}</p>
          <p className="text-xs text-slate-400">
            Este link pode ter expirado ou já ter sido utilizado. Solicite um novo convite ao administrador da plataforma.
          </p>
          <a
            href="/"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 hover:bg-slate-800 px-6 py-3.5 text-xs font-bold text-white transition-colors"
          >
            Voltar para o início
          </a>
        </div>
      </main>
    );
  }

  if (success) {
    const finalStore = activatedStore || { name: storeName.trim() || 'Sua Loja', slug: sanitizeSlugInput(slug) };
    const adminPath = `/${encodeURIComponent(finalStore.slug)}/admin`;
    const publicPath = `/${encodeURIComponent(finalStore.slug)}`;

    return (
      <main className="min-h-screen bg-slate-50 px-4 py-12 flex items-center justify-center">
        <div className="w-full max-w-lg space-y-6 rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-8 sm:p-10 shadow-xl shadow-slate-900/5 text-center animate-in zoom-in-95 duration-300">
          <div className="mx-auto flex justify-center">
            <PodeVirBrand size="lg" />
          </div>

          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-emerald-100 text-emerald-700 shadow-inner">
            <CheckCircle2 className="h-10 w-10" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" /> {isOwnerInvite ? 'Loja ativada com sucesso' : 'Acesso da equipe ativado'}
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {isOwnerInvite ? 'Parabéns! Sua loja está pronta' : 'Bem-vindo(a) à equipe!'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed max-w-sm mx-auto">
              {isOwnerInvite
                ? 'Sua conta administrativa foi criada e sua loja já está pronta para receber pedidos e cadastrar seus produtos.'
                : `Sua conta de acesso à equipe de ${finalStore.name} foi configurada com sucesso.`}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left space-y-3">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-emerald-600 border border-slate-200 shadow-2xs">
                {isOwnerInvite ? <Store className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
              </div>
              <div className="overflow-hidden">
                <strong className="block text-base font-bold text-slate-900 truncate">
                  {finalStore.name}
                </strong>
                <span className="text-xs font-mono text-slate-500 block truncate">
                  {window.location.host}/{finalStore.slug}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200/80 grid grid-cols-1 gap-2 text-xs">
              {isOwnerInvite && (
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-semibold">Endereço do Cardápio:</span>
                  <a
                    href={publicPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 hover:underline font-mono inline-flex items-center gap-1 font-bold"
                  >
                    Abrir cardápio <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-semibold">Painel de Gestão:</span>
                <span className="font-mono text-slate-700 font-bold">/{finalStore.slug}/admin</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <a
              href={adminPath}
              className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 py-4 font-bold text-white shadow-xs shadow-emerald-900/10 transition-all flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer"
            >
              <span>Ir para o Painel da Loja</span>
              <ArrowRight className="h-5 w-5" />
            </a>

            {isOwnerInvite && (
              <a
                href={publicPath}
                className="w-full rounded-2xl bg-slate-100 hover:bg-slate-200 py-3 font-semibold text-slate-700 transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
              >
                Visualizar Cardápio da Loja
              </a>
            )}
          </div>
        </div>
      </main>
    );
  }

  const hostPrefix = typeof window !== 'undefined' ? `${window.location.host}/` : 'loja/';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:py-16 flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl space-y-8 rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-xl shadow-slate-900/5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <PodeVirBrand size="md" />
          <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-1 text-xs font-bold text-emerald-800">
            {isOwnerInvite ? (
              <>
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                Ativação de Loja
              </>
            ) : (
              <>
                <Users className="h-3.5 w-3.5 text-emerald-600" />
                Acesso da Equipe
              </>
            )}
          </span>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {isOwnerInvite ? 'Ative sua Loja' : 'Acesso da Equipe'}
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
            {isOwnerInvite
              ? 'Preencha seus dados de acesso e configure a identidade do seu cardápio digital para começar a vender.'
              : `Você foi convidado para a equipe de ${storeName || 'sua loja'}. Crie sua senha para acessar o painel de gestão.`}
          </p>
        </div>

        {/* Section 1: Seus Dados de Acesso */}
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
            <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
              <User className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {isOwnerInvite ? '1. Seus Dados de Acesso' : 'Seus Dados de Acesso'}
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                Informações para login no painel
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nome Completo <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Carlos Silva"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>E-mail</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Lock className="h-3 w-3" /> Convite
                </span>
              </label>
              <input
                type="email"
                readOnly
                value={email}
                className="w-full rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-3 text-sm font-semibold text-slate-500 cursor-not-allowed select-none outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Crie uma Senha Forte <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 10 caracteres"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 pr-11 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Password strength checklist */}
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div
                className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                  passwordRequirements.minLength ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                <div
                  className={`h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0 ${
                    passwordRequirements.minLength
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Check className="h-2.5 w-2.5" />
                </div>
                <span>Mínimo 10 caracteres</span>
              </div>
              <div
                className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                  passwordRequirements.hasLowerUpper ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                <div
                  className={`h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0 ${
                    passwordRequirements.hasLowerUpper
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Check className="h-2.5 w-2.5" />
                </div>
                <span>Maiúscula e minúscula</span>
              </div>
              <div
                className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                  passwordRequirements.hasNumber ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                <div
                  className={`h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0 ${
                    passwordRequirements.hasNumber
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Check className="h-2.5 w-2.5" />
                </div>
                <span>Pelo menos 1 número</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Identidade e Link da Loja (APENAS PARA ATIVAÇÃO DE NOVA LOJA / OWNER) */}
        {isOwnerInvite && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                <Store className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  2. Identidade e Link da Loja
                </h2>
                <p className="text-[11px] text-slate-400 font-medium">
                  Nome do seu estabelecimento e endereço exclusivo do cardápio
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nome da Loja <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={storeName}
                  onChange={handleStoreNameChange}
                  placeholder="Ex: João Burger"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  WhatsApp da Loja <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all"
                  />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Phone className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Link da Loja (Slug) <span className="text-rose-500">*</span>
              </label>
              <div
                className={`flex items-center rounded-xl border transition-all overflow-hidden bg-white ${
                  slugStatus === 'available'
                    ? 'border-emerald-500 ring-2 ring-emerald-500/10'
                    : slugStatus === 'unavailable'
                    ? 'border-rose-400 ring-2 ring-rose-400/10'
                    : 'border-slate-200 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10'
                }`}
              >
                <span className="px-3.5 py-3 text-xs sm:text-sm font-mono font-medium text-slate-500 bg-slate-100/80 border-r border-slate-200 select-none shrink-0">
                  {hostPrefix}
                </span>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={slug}
                  onChange={handleSlugChange}
                  placeholder="joao-burger"
                  className="w-full px-3 py-3 text-sm font-mono font-bold text-slate-900 placeholder:text-slate-400 outline-none bg-transparent"
                />
                <div className="px-3 shrink-0">
                  {slugStatus === 'checking' && (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  )}
                  {slugStatus === 'available' && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                  {slugStatus === 'unavailable' && (
                    <AlertCircle className="h-4 w-4 text-rose-500" />
                  )}
                </div>
              </div>

              {/* Live availability feedback */}
              {slugStatus === 'available' && (
                <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200/80 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 animate-in fade-in duration-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Link disponível! Seus clientes acessarão por este endereço.</span>
                </div>
              )}

              {slugStatus === 'unavailable' && (
                <div className="mt-2.5 rounded-xl bg-rose-50 border border-rose-200/80 p-3.5 text-xs text-rose-900 space-y-2.5 animate-in fade-in duration-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <span className="font-semibold">
                      {slugReason || 'Este link já está em uso ou é reservado pela plataforma.'}
                    </span>
                  </div>

                  {slugSuggestions.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-rose-200/60">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 block">
                        Sugestões rápidas de 1 clique:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {slugSuggestions.map((sug) => (
                          <button
                            key={sug}
                            type="button"
                            onClick={() => handleApplySuggestion(sug)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-white hover:bg-emerald-50 text-slate-800 hover:text-emerald-700 border border-slate-300 hover:border-emerald-400 shadow-2xs transition-all cursor-pointer"
                          >
                            <Plus className="h-3 w-3 text-emerald-600" />
                            <span className="font-mono">{sug}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {submitError && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800 flex items-center gap-2.5 animate-in fade-in duration-200"
          >
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <button
          disabled={
            submitting ||
            (isOwnerInvite && slugStatus === 'checking') ||
            (isOwnerInvite && slug.trim().length >= 3 && slugStatus === 'unavailable')
          }
          type="submit"
          className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed py-4 px-6 font-bold text-white shadow-xs shadow-emerald-900/10 transition-all flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{isOwnerInvite ? 'Ativando loja e criando acesso...' : 'Criando seu acesso...'}</span>
            </>
          ) : (
            <>
              <span>{isOwnerInvite ? 'Ativar Loja e Acessar Painel' : 'Criar Senha e Entrar no Painel'}</span>
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
      </form>
    </main>
  );
}
