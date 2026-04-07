import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Lock, Phone } from 'lucide-react';
import { useToast } from './Toast';

interface PhoneAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any, token: string) => void;
  onNavigateToRegister: () => void;
}

export default function PhoneAuthModal({ isOpen, onClose, onLoginSuccess, onNavigateToRegister }: PhoneAuthModalProps) {
  const [step, setStep] = useState<'phone' | 'password'>('phone');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Reinicia o estado ao abrir
      setStep('phone');
      setTelefone('');
      setSenha('');
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

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (telefone.replace(/\D/g, '').length < 10) {
      showToast('Informe um telefone válido.', 'error');
      return;
    }
    setStep('password');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senha) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone, senha })
      });
      const data = await res.json();
      
      if (data.sucesso) {
        localStorage.setItem('stitch_token', data.token);
        onLoginSuccess(data.user, data.token);
        showToast('✅ Login realizado com sucesso!', 'success');
        onClose();
      } else {
        showToast(data.erro || 'Telefone ou senha inválidos', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="relative p-6 pt-10 text-center">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            <X className="w-5 h-5" />
          </button>

          {step === 'phone' ? (
            <div className="animate-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Informe seu número de telefone</h2>
              <p className="text-sm text-gray-500 mb-6 px-4">
                Ele é importante para falarmos com você caso necessário
              </p>
              
              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                <div>
                  <input
                    type="tel"
                    required
                    autoFocus
                    placeholder="Telefone"
                    value={telefone}
                    onChange={(e) => setTelefone(formatPhone(e.target.value))}
                    className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#A37852] focus:border-transparent outline-none text-gray-800 text-sm"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={!telefone}
                  className="w-full bg-[#A37852] text-white font-bold py-3.5 rounded-xl hover:bg-[#8B6442] transition-colors disabled:opacity-50 text-sm uppercase tracking-wider shadow-lg shadow-[#A37852]/20"
                >
                  CONFIRMAR
                </button>
              </form>
            </div>
          ) : (
            <div className="animate-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Bem-vindo(a) de volta!</h2>
              <p className="text-sm text-gray-500 mb-6 px-4">
                Digite sua senha para acessar sua conta.
              </p>
              
              <form onSubmit={handleLoginSubmit} className="space-y-4 text-left">
                <div>
                  <input
                    type="password"
                    required
                    autoFocus
                    placeholder="Senha secreta"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#A37852] focus:border-transparent outline-none text-gray-800 text-sm"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={loading || !senha}
                  className="w-full bg-[#A37852] text-white font-bold py-3.5 rounded-xl hover:bg-[#8B6442] transition-colors disabled:opacity-50 text-sm uppercase tracking-wider shadow-lg shadow-[#A37852]/20 shrink-0 flex items-center justify-center gap-2"
                >
                   {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : 'ENTRAR'}
                </button>

                <div className="text-center pt-2">
                   <button 
                     type="button"
                     onClick={() => {
                        onClose();
                        onNavigateToRegister();
                     }}
                     className="text-xs font-bold text-[#A37852] hover:underline"
                   >
                     Não tenho cadastro
                   </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
