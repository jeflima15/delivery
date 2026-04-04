import React, { useState } from 'react';
import { Phone, Lock, User, ArrowRight, Eye, EyeOff, Gift } from 'lucide-react';
import { useToast } from './Toast';

interface RegisterProps {
  onRegisterSuccess: (user: any, token: string) => void;
  onNavigateToLogin: () => void;
}

export default function Register({ onRegisterSuccess, onNavigateToLogin }: RegisterProps) {
  const [formData, setFormData] = useState({ nome: '', telefone: '', senha: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      
      if (data.sucesso) {
        localStorage.setItem('stitch_token', data.token);
        onRegisterSuccess(data.user, data.token);
        showToast('✅ Cadastro realizado com sucesso!', 'success');
      } else {
        showToast(data.erro || 'Erro ao realizar cadastro', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão com o servidor.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter italic">Criar Conta</h2>
          <p className="text-gray-500 mt-2 font-medium italic">Sua jornada de sabor começa aqui!</p>
        </div>

        {/* Teaser Fidelidade Clube Stitch */}
        <div className="bg-purple-50 dark:bg-purple-900/10 p-5 rounded-[2rem] mb-8 border border-purple-100 dark:border-purple-800/30 flex items-center gap-4 shadow-sm">
           <div className="bg-purple-600 text-white p-3 rounded-2xl shadow-lg transform rotate-3">
              <Gift className="w-6 h-6 fill-current" />
           </div>
           <div className="text-left">
              <p className="text-[10px] font-black text-purple-900 dark:text-purple-400 uppercase tracking-[0.15em] italic leading-tight">Cadastre-se e ganhe</p>
              <p className="text-xs font-black text-purple-600 uppercase tracking-widest italic">Acesso ao Clube Stitch!</p>
           </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome Completo</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                required
                value={formData.nome}
                onChange={e => setFormData({...formData, nome: e.target.value})}
                className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="Seu nome"
              />
            </div>
          </div>

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
                className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
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
                className="block w-full pl-11 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
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
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-4 px-6 rounded-2xl hover:bg-emerald-700 transition-all active:scale-[0.98] disabled:opacity-70 mt-4 shadow-lg shadow-emerald-600/20"
          >
            {loading ? 'Aguarde...' : 'Cadastrar'}
            {!loading && <ArrowRight className="w-5 h-5" />}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={onNavigateToLogin}
            className="text-gray-500 hover:text-gray-900 font-medium transition-colors"
          >
            Já tem uma conta? Faça login
          </button>
        </div>
      </div>
    </div>
  );
}
