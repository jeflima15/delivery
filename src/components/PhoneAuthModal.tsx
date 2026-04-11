import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { useToast } from './Toast';

interface PhoneAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any, token: string) => void;
}

export default function PhoneAuthModal({ isOpen, onClose, onLoginSuccess }: PhoneAuthModalProps) {
  const [telefone, setTelefone] = useState('');
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
      const res = await fetch('/api/auth/identificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone })
      });
      const data = await res.json();
      
      if (data.sucesso) {
        localStorage.setItem('stitch_token', data.token);
        onLoginSuccess(data.user, data.token);
        // showToast('✅ Identificação realizada!', 'success');
        onClose();
      } else {
        showToast(data.erro || 'Erro ao identificar', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[340px] bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative p-6 px-8 pt-12 text-center">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="animate-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-[19px] font-bold text-[#1a1a1b] leading-tight mb-2">Informe seu número de telefone</h2>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">
              Ele é importante para falarmos com você caso necessário
            </p>
            
            <form onSubmit={handlePhoneSubmit} className="space-y-5">
              <div className="relative">
                <input
                  type="tel"
                  required
                  autoFocus
                  placeholder="Telefone"
                  value={telefone}
                  onChange={(e) => setTelefone(formatPhone(e.target.value))}
                  className="w-full h-[58px] px-5 border border-gray-200 rounded-xl focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 outline-none text-gray-800 text-base placeholder:text-gray-300 transition-all shadow-sm"
                />
              </div>
              
              <button
                type="submit"
                disabled={!telefone || loading}
                className="w-full h-[54px] bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 text-[13px] uppercase tracking-[1px] shadow-lg shadow-emerald-600/20 active:scale-[0.98]"
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
