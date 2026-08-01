import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { useToast } from './Toast';

interface PhoneAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any, token: string) => void;
  tenantSlug?: string | null;
}

export default function PhoneAuthModal({ isOpen, onClose, onLoginSuccess, tenantSlug }: PhoneAuthModalProps) {
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setTelefone('');
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const formatPhone = (val: string) => {
    let raw = val.replace(/\D/g, '');
    if (raw.length > 11) raw = raw.slice(0, 11);
    if (raw.length > 2) raw = `(${raw.slice(0, 2)}) ` + raw.slice(2);
    if (raw.length > 10) raw = raw.slice(0, 10) + '-' + raw.slice(10);
    return raw;
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (telefone.replace(/\D/g, '').length < 10) {
      showToast('Informe um telefone válido.', 'error');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(tenantSlug ? `/api/customer/stores/${encodeURIComponent(tenantSlug)}/auth/login` : '/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tenantSlug ? { phone: telefone, password: senha } : { telefone, senha })
      });
      const data = await res.json();
      
      if ((tenantSlug && data.success) || (!tenantSlug && data.sucesso)) {
        onLoginSuccess(data.user, 'cookie-session');
        // showToast('✅ Identificação realizada!', 'success');
        onClose();
      } else {
        showToast(data?.error?.message || data.erro || 'Erro ao identificar', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200 cursor-default"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[400px] bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative p-8 pt-12 text-center">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-400 rounded-full transition-all"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="animate-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-xl font-bold text-[#343a40] mb-3">Informe seu n&uacute;mero de telefone</h2>
            <p className="text-[13px] text-[#6c757d] mb-10 px-4 leading-relaxed">
              Ele &eacute; importante para falarmos com voc&ecirc; caso necess&aacute;rio
            </p>
            
            <form onSubmit={handlePhoneSubmit} className="space-y-6">
              <div className="relative group">
                {/* Label na Borda estilo B3X */}
                <label className="absolute -top-2.5 left-4 bg-white px-2 text-[12px] font-bold text-[#6c757d] group-focus-within:store-text-primary transition-colors">
                  Telefone
                </label>
                <input
                  type="tel"
                  required
                  autoFocus
                  placeholder="(00) 00000-0000"
                  value={telefone}
                  onChange={(e) => setTelefone(formatPhone(e.target.value))}
                  className="w-full h-[52px] px-4 border border-gray-300 rounded-[10px] store-focus text-[#343a40] text-[15px] font-medium placeholder:text-gray-200"
                />
              </div>
              <div className="relative group">
                <label className="absolute -top-2.5 left-4 bg-white px-2 text-[12px] font-bold text-[#6c757d] group-focus-within:store-text-primary transition-colors">Senha</label>
                <input type="password" required minLength={tenantSlug ? 10 : 6} value={senha} onChange={(e) => setSenha(e.target.value)} className="w-full h-[52px] px-4 border border-gray-300 rounded-[10px] store-focus text-[#343a40] text-[15px] font-medium" />
              </div>
              
              <button
                type="submit"
                disabled={!telefone || !senha || loading}
                className="w-full h-[50px] store-bg-primary store-bg-primary-hover store-bg-primary-active store-text-on-primary font-bold rounded-[10px] transition-all disabled:opacity-50 text-[14px] uppercase tracking-wide shadow-md active:scale-[0.98]"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"/> : 'CONFIRMAR'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
