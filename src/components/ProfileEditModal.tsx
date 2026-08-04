import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
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
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function birthDateToIso(value: string): string | null {
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

export default function ProfileEditModal({ isOpen, onClose, user, onUpdateUser, tenantSlug }: ProfileEditModalProps) {
  const [telefone, setTelefone] = useState(user?.telefone || '');
  const [nome, setNome] = useState(user?.nome !== 'Visitante' ? user?.nome || '' : '');
  const [email, setEmail] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [genero, setGenero] = useState('');
  const [loading, setLoading] = useState(false);
  const [birthDateError, setBirthDateError] = useState('');
  const [formError, setFormError] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Hydrate state from real user object
      setTelefone(user?.telefone || '');
      setNome(user?.nome !== 'Visitante' ? user?.nome || '' : '');
      setEmail(user?.email || '');
      setNascimento(formatBirthDate(user?.nascimento || ''));
      setGenero(user?.genero || '');
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
    const normalizedBirthDate = birthDateToIso(nascimento);
    if (!normalizedBirthDate) {
      const message = nascimento.length < 10
        ? 'Preencha a data completa no formato DD/MM/AAAA.'
        : 'Informe uma data de nascimento válida e que não esteja no futuro.';
      setBirthDateError(message);
      showToast(message, 'error');
      return;
    }
    setLoading(true);
    // call update endpoint
    try {
      if (!tenantSlug) throw new Error('Loja invalida.');
      const res = await apiFetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/auth/profile`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ nome, email, genero, nascimento: normalizedBirthDate })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Cadastro atualizado com sucesso!', 'success');
        onUpdateUser(data.user);
        onClose();
      } else {
        const message = data?.error?.fieldErrors?.nascimento?.[0]
          || data?.error?.message
          || data.erro
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
    <div className="fixed inset-0 z-[9999] flex justify-center bg-black/60 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200 cursor-default">
      <div className="w-full sm:max-w-[420px] bg-white flex flex-col h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-xl animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-300 overflow-hidden">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0 relative">
          <h2 className="text-[15px] font-bold text-[#444] tracking-tight w-full text-center">Editar informações</h2>
          <button 
            onClick={onClose}
            className="absolute right-6 w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 scrollbar-thin">
           <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                 <label className="absolute -top-2 left-3 bg-white px-1 text-[11px] font-medium text-gray-400">Telefone</label>
                 <input type="text" readOnly disabled value={telefone} className="w-full border border-gray-200 rounded px-4 py-3.5 text-[14px] text-gray-500 bg-gray-50 outline-none" />
              </div>

              <div className="relative">
                 <label className="absolute -top-2 left-3 bg-white px-1 text-[11px] font-medium text-gray-400">Seu nome *</label>
                 <input type="text" required value={nome} onChange={e=>setNome(e.target.value)} className="w-full border border-gray-200 rounded px-4 py-3.5 text-[14px] text-gray-800 store-focus transition-shadow" />
              </div>

              <div className="relative">
                 <label className="absolute -top-2 left-3 bg-white px-1 text-[11px] font-medium text-gray-400">E-mail</label>
                 <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full border border-gray-200 rounded px-4 py-3.5 text-[14px] text-gray-800 store-focus transition-shadow" />
              </div>

              <div className="relative">
                 <label className="absolute -top-2 left-3 bg-white px-1 text-[11px] font-medium text-gray-400">Data de nascimento *</label>
                 <input type="text" inputMode="numeric" autoComplete="bday" required maxLength={10} aria-invalid={Boolean(birthDateError)} aria-describedby={birthDateError ? 'birth-date-error' : undefined} placeholder="DD/MM/AAAA" value={nascimento} onChange={e => { setNascimento(formatBirthDate(e.target.value)); setBirthDateError(''); setFormError(''); }} className={`w-full rounded border px-4 py-3.5 text-[14px] text-gray-800 transition-shadow store-focus ${birthDateError ? 'border-red-400 bg-red-50/40' : 'border-gray-200'}`} />
                 {birthDateError && <p id="birth-date-error" className="mt-1.5 text-xs font-medium text-red-600">{birthDateError}</p>}
              </div>

              <div className="relative">
                 <label className="absolute -top-2 left-3 bg-white px-1 text-[11px] font-medium text-gray-400">Gênero</label>
                 <select value={genero} onChange={e=>setGenero(e.target.value)} className="w-full border border-gray-200 rounded px-4 py-3.5 text-[14px] text-gray-800 store-focus transition-shadow appearance-none cursor-pointer bg-white">
                    <option value="">Selecione...</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Outro">Outro</option>
                    <option value="Prefiro não informar">Prefiro não informar</option>
                 </select>
                 <ChevronDownIcon className="w-4 h-4 text-gray-400 absolute right-4 top-4 pointer-events-none" />
              </div>
              {formError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{formError}</div>}
           </form>
           <div className="h-4"></div>
        </div>

        <div className="p-6 bg-white border-t border-gray-50 flex-shrink-0">
           <button 
             onClick={handleSubmit}
             disabled={loading || !nome}
             className="w-full store-bg-primary store-bg-primary-hover store-bg-primary-active store-text-on-primary font-bold py-3.5 rounded transition-all text-[12px] tracking-wider uppercase flex items-center justify-center disabled:opacity-50"
           >
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : 'ATUALIZAR CADASTRO'}
           </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const ChevronDownIcon = (props:any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="6 9 12 15 18 9"/></svg>
