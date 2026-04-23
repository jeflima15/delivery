import React, { useState } from 'react';
import { Phone, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useToast } from './Toast';

interface LoginProps {
  onLoginSuccess: (user: any, token: string) => void;
  onNavigateToRegister?: () => void;
}

export default function Login({ onLoginSuccess, onNavigateToRegister }: LoginProps) {
  const [formData, setFormData] = useState({ telefone: '', senha: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetData, setResetData] = useState({ telefone: '', novaSenha: '' });
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      
      if (data.sucesso) {
        localStorage.setItem('stitch_token', data.token);
        onLoginSuccess(data.user, data.token);
        showToast('✅ Login realizado com sucesso!', 'success');
      } else {
        showToast(data.erro || 'E-mail ou senha inválidos', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão com o servidor.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/recuperar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resetData)
      });
      const data = await res.json();
      if (data.sucesso) {
        showToast('✅ Senha redefinida! Faça login agora.', 'success');
        setIsResetting(false);
        setFormData({ ...formData, telefone: resetData.telefone });
      } else {
        showToast(data.erro || 'Erro ao redefinir senha', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
            {isResetting ? 'Recuperar Senha' : 'Bem-vindo de volta'}
          </h2>
          <p className="text-gray-500 mt-2">
            {isResetting ? 'Informe seu telefone cadastrado' : 'Faça login para continuar'}
          </p>
        </div>

        {isResetting ? (
          <form onSubmit={handleReset} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Seu Telefone</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="tel"
                  required
                  value={resetData.telefone}
                  onChange={e => setResetData({...resetData, telefone: e.target.value})}
                  className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl store-focus transition-all"
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nova Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  required
                  value={resetData.novaSenha}
                  onChange={e => setResetData({...resetData, novaSenha: e.target.value})}
                  className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl store-focus transition-all"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 store-bg-primary store-bg-primary-hover store-text-on-primary font-semibold py-4 px-6 rounded-2xl transition-all shadow-lg"
            >
              {loading ? 'Redefinindo...' : 'Redefinir Senha'}
            </button>
            <button
              type="button"
              onClick={() => setIsResetting(false)}
              className="w-full text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              Voltar ao Login
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefone</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="tel"
                  required
                  value={formData.telefone}
                  onChange={e => setFormData({...formData, telefone: e.target.value})}
                  className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl store-focus transition-all"
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={formData.senha}
                  onChange={e => setFormData({...formData, senha: e.target.value})}
                  className="block w-full pl-11 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl store-focus transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <div className="mt-2 text-right">
                <button 
                  type="button" 
                  onClick={() => setIsResetting(true)}
                  className="text-sm store-text-primary hover:brightness-95 font-medium transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 store-bg-primary store-bg-primary-hover store-text-on-primary font-semibold py-4 px-6 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-70 mt-4 shadow-lg"
            >
              {loading ? 'Aguarde...' : 'Entrar'}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>
        )}

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={onNavigateToRegister}
            className="text-gray-500 hover:text-gray-900 font-medium transition-colors"
          >
            Não tem conta? Cadastre-se
          </button>
        </div>
      </div>
    </div>
  );
}
