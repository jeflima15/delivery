import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { useToast } from './Toast';

interface PasswordAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userName?: string;
  userPhone?: string;
}

export default function PasswordAuthModal({ isOpen, onClose, onSuccess, userName, userPhone }: PasswordAuthModalProps) {
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  
  const [resolvedName, setResolvedName] = useState(userName || '');
  const [resolvedPhone, setResolvedPhone] = useState(userPhone || '');

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setSenha('');
      
      // Attempt to resolve name/phone from token if not provided
      if (!resolvedPhone) {
        const token = localStorage.getItem('stitch_token');
        if (token) {
           try {
              const payload = JSON.parse(atob(token.split('.')[1]));
              if (payload.telefone) setResolvedPhone(payload.telefone);
           } catch(e) {}
        }
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senha) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: resolvedPhone, senha })
      });
      const data = await res.json();
      
      if (data.sucesso) {
        localStorage.setItem('stitch_token', data.token);
        sessionStorage.setItem('stitch_sensitive_auth_validated', 'true');
        showToast('Acesso liberado!', 'success');
        onSuccess();
        onClose();
      } else {
        showToast(data.erro || 'Senha incorreta', 'error');
      }
    } catch (err) {
      showToast('Erro ao validar senha.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
     localStorage.removeItem('stitch_token');
     window.location.reload();
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200 cursor-default" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="relative p-6 text-center">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="mt-4 mb-6">
            <h2 className="text-[17px] font-bold text-[#444] uppercase tracking-tight mb-2">
              Olá, {resolvedName && resolvedName !== 'Visitante' ? resolvedName.toUpperCase() : 'VISITANTE'}
            </h2>
            <p className="text-[13px] text-gray-500 font-medium">
              Informe a sua senha para continuar
            </p>
          </div>
            
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                required
                autoFocus
                placeholder="Senha *"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded store-focus text-gray-800 text-[13px]"
              />
            </div>
            
            <div className="text-center mt-2 mb-4">
              <button type="button" className="text-[11px] font-semibold text-gray-500 hover:store-text-primary uppercase tracking-wide">
                Esqueci minha senha
              </button>
            </div>
            
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full bg-white border store-border-primary store-text-primary font-bold py-3.5 rounded hover:store-bg-soft transition-colors text-[11px] uppercase tracking-wider"
              >
                SAIR DESTA CONTA
              </button>
              
              <button
                type="submit"
                disabled={!senha || loading}
                className="w-full store-bg-primary store-bg-primary-hover store-text-on-primary font-bold py-3.5 rounded transition-colors disabled:opacity-50 text-[11px] uppercase tracking-wider flex items-center justify-center h-[46px]"
              >
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : 'CONFIRMAR'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
