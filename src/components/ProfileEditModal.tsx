import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, ChevronDown } from 'lucide-react';
import { useToast } from './Toast';
import { apiFetch } from '../lib/api';

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onUpdateUser: (u: any) => void;
  tenantSlug?: string | null;
}

function formatBirthDate(value: string): string {
  if (!value) return '';
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function birthDateToIso(value: string): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  const valid = date.getFullYear() === Number(year)
    && date.getMonth() + 1 === Number(month)
    && date.getDate() === Number(day)
    && Number(year) >= 1900
    && date <= new Date();
  return valid ? `${year}-${month}-${day}` : null;
}

function formatPhoneDisplay(value: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(-11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function ProfileEditModal({ isOpen, onClose, user, onUpdateUser, tenantSlug }: ProfileEditModalProps) {
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [genero, setGenero] = useState('');
  const [loading, setLoading] = useState(false);
  const [birthDateError, setBirthDateError] = useState('');
  const [formError, setFormError] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen && user) {
      document.body.style.overflow = 'hidden';
      setTelefone(formatPhoneDisplay(user.telefone || user.phone || ''));
      setNome(user.nome !== 'Visitante' ? user.nome || '' : '');
      setEmail(user.email || '');
      setNascimento(formatBirthDate(user.nascimento || ''));
      setGenero(user.genero || '');
      setBirthDateError('');
      setFormError('');
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBirthDateError('');
    setFormError('');

    let normalizedBirthDate: string | null = null;
    if (nascimento.trim().length > 0) {
      normalizedBirthDate = birthDateToIso(nascimento);
      if (!normalizedBirthDate) {
        const message = nascimento.length < 10
          ? 'Preencha a data completa no formato DD/MM/AAAA.'
          : 'Informe uma data de nascimento válida e que não esteja no futuro.';
        setBirthDateError(message);
        showToast(message, 'error');
        return;
      }
    }

    setLoading(true);
    try {
      if (!tenantSlug) throw new Error('Loja inválida.');
      const res = await apiFetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/auth/profile`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          email: email || undefined,
          genero: genero || undefined,
          nascimento: normalizedBirthDate || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Cadastro atualizado com sucesso!', 'success');
        onUpdateUser(data.user);
        onClose();
      } else {
        const message = data?.error?.fieldErrors?.nascimento?.[0]
          || data?.error?.message
          || 'Não foi possível atualizar o cadastro.';
        setFormError(message);
        showToast(message, 'error');
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Erro de conexão. Tente novamente.';
      setFormError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex w-full max-w-[400px] flex-col rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Title */}
        <div className="text-center pb-6">
          <h2 className="text-lg font-bold text-gray-800 tracking-tight">
            Editar informações
          </h2>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Telefone (read-only) */}
          <div className="relative">
            <label className="absolute -top-2.5 left-3.5 z-10 bg-white px-1.5 text-xs font-semibold text-gray-400 leading-none">
              Telefone
            </label>
            <input
              type="text"
              readOnly
              disabled
              value={telefone}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-800 outline-none"
            />
          </div>

          {/* Seu nome * */}
          <div className="relative">
            <label className="absolute -top-2.5 left-3.5 z-10 bg-white px-1.5 text-xs font-semibold text-gray-500 leading-none">
              Seu nome *
            </label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-800 outline-none focus:border-[#8B5A2B] focus:ring-1 focus:ring-[#8B5A2B] transition-all"
            />
          </div>

          {/* E-mail */}
          <div className="relative">
            <label className="absolute -top-2.5 left-3.5 z-10 bg-white px-1.5 text-xs font-semibold text-gray-500 leading-none">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-800 outline-none focus:border-[#8B5A2B] focus:ring-1 focus:ring-[#8B5A2B] transition-all"
            />
          </div>

          {/* Data de nascimento */}
          <div className="relative">
            <label className="absolute -top-2.5 left-3.5 z-10 bg-white px-1.5 text-xs font-semibold text-gray-500 leading-none">
              Data de nascimento *
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="DD/MM/AAAA"
              value={nascimento}
              onChange={(e) => {
                setNascimento(formatBirthDate(e.target.value));
                setBirthDateError('');
                setFormError('');
              }}
              className={`w-full rounded-xl border bg-white px-4 py-3.5 text-sm font-medium text-gray-800 outline-none transition-all focus:border-[#8B5A2B] ${
                birthDateError ? 'border-red-400 bg-red-50/30' : 'border-gray-300'
              }`}
            />
            {birthDateError && (
              <p className="mt-1 text-xs font-semibold text-red-600">
                {birthDateError}
              </p>
            )}
          </div>

          {/* Gênero */}
          <div className="relative">
            <label className="absolute -top-2.5 left-3.5 z-10 bg-white px-1.5 text-xs font-semibold text-gray-500 leading-none">
              Gênero
            </label>
            <select
              value={genero}
              onChange={(e) => setGenero(e.target.value)}
              className="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-800 outline-none focus:border-[#8B5A2B] transition-all"
            >
              <option value="">Selecione...</option>
              <option value="Masculino">Masculino</option>
              <option value="Feminino">Feminino</option>
              <option value="Outro">Outro</option>
              <option value="Prefiro não informar">Prefiro não informar</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-4 h-4 w-4 text-gray-400" />
          </div>

          {formError && (
            <p className="rounded-lg bg-red-50 p-2.5 text-center text-xs font-semibold text-red-600">
              {formError}
            </p>
          )}

          {/* Primary Action Button */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={loading || !nome}
              className="flex w-full items-center justify-center rounded-xl store-bg-primary store-text-on-primary py-3.5 text-sm font-black uppercase tracking-wider hover:brightness-95 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                'ATUALIZAR CADASTRO'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
