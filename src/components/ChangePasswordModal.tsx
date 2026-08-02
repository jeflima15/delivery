import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { useToast } from './Toast';
import { apiFetch } from '../lib/api';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug?: string | null;
  onReauthenticationRequired?: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose, tenantSlug, onReauthenticationRequired }: ChangePasswordModalProps) {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarSenha('');
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha !== confirmarSenha) {
       showToast('A nova senha não confere com a confirmação.', 'error');
       return;
    }
    setLoading(true);
    // call update endpoint
    try {
      if (!tenantSlug) throw new Error('Loja invalida.');
      const res = await apiFetch(`/api/customer/stores/${encodeURIComponent(tenantSlug)}/auth/password`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ currentPassword: senhaAtual, newPassword: novaSenha })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Senha alterada com sucesso!', 'success');
        onClose();
        if (data.reauthenticationRequired) onReauthenticationRequired?.();
      } else {
        showToast(data?.error?.message || data.erro || 'Erro ao alterar a senha', 'error');
      }
    } catch {
      showToast('Erro de conexão.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-center bg-black/60 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200 cursor-default">
      <div className="w-full sm:max-w-[420px] bg-white flex flex-col h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-xl animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-300 overflow-hidden">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0 relative">
          <h2 className="text-[15px] font-bold text-[#444] tracking-tight w-full text-center">Trocar senha</h2>
          <button 
            onClick={onClose}
            className="absolute right-6 w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 scrollbar-thin">
           <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="relative">
                 <label className="absolute -top-2 left-3 bg-white px-1 text-[11px] font-medium text-emerald-600">Senha atual *</label>
                 <input type="password" required value={senhaAtual} onChange={e=>setSenhaAtual(e.target.value)} className="w-full border border-emerald-600 rounded px-4 py-3.5 text-[14px] text-gray-800 outline-none focus:ring-1 focus:ring-emerald-600" />
              </div>

              <div className="relative mt-5">
                 <label className="absolute -top-2 left-3 bg-white px-1 text-[11px] font-medium text-gray-400">Nova senha *</label>
                 <input type="password" required minLength={tenantSlug ? 10 : 6} pattern={tenantSlug ? '(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{10,}' : undefined} value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} className="w-full border border-gray-200 rounded px-4 py-3.5 text-[14px] text-gray-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-shadow" />
              </div>

              <div className="relative">
                 <label className="absolute -top-2 left-3 bg-white px-1 text-[11px] font-medium text-gray-400">Confirmar nova senha *</label>
                 <input type="password" required value={confirmarSenha} onChange={e=>setConfirmarSenha(e.target.value)} className="w-full border border-gray-200 rounded px-4 py-3.5 text-[14px] text-gray-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-shadow" />
              </div>
           </form>
        </div>

        <div className="p-6 bg-white border-t border-gray-50 flex-shrink-0">
           <button 
             onClick={handleSubmit}
             disabled={loading || !senhaAtual || !novaSenha || !confirmarSenha}
             className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold py-3.5 rounded transition-all text-[12px] tracking-wider uppercase flex items-center justify-center disabled:opacity-50"
           >
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : 'CONFIRMAR'}
           </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
