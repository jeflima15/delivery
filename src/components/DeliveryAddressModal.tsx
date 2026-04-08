// @ts-nocheck
import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X, Truck, Store, MapPin, AlertCircle, User, Lock, ChevronRight, Search } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Função utilitária para Tailwind
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


interface DeliveryAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeInfo: any;
  onConfirmDelivery: (addressData: any) => void;
  onConfirmPickup: () => void;
  user: any;
}

const ESTADOS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export default function DeliveryAddressModal({ isOpen, onClose, storeInfo, onConfirmDelivery, onConfirmPickup, user }: DeliveryAddressModalProps) {
  const [step, setStep] = useState<'cep' | 'form' | 'login'>('cep');
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [complemento, setComplemento] = useState('');
  const [referencia, setReferencia] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [cepError, setCepError] = useState('');
  const [showNumeroAlert, setShowNumeroAlert] = useState(false);
  const [senha, setSenha] = useState('');
  const [loginTelefone, setLoginTelefone] = useState('');
  const [isLogando, setIsLogando] = useState(false);
  const numeroRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const formatCep = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 8);
    if (clean.length > 5) return clean.slice(0, 5) + '-' + clean.slice(5);
    return clean;
  };

  const handleBuscarCep = async () => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setCepError('CEP inválido. Digite 8 números.');
      return;
    }
    setCepError('');
    setIsLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepError('CEP não encontrado. Verifique e tente novamente.');
      } else {
        setRua(data.logradouro || '');
        setBairro(data.bairro || '');
        setCidade(data.localidade || '');
        setEstado(data.uf || '');
        setStep('form');
      }
    } catch (e) {
      setCepError('Erro ao buscar CEP. Tente novamente.');
    } finally {
      setIsLoadingCep(false);
    }
  };

  React.useEffect(() => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8 && step === 'cep') {
      handleBuscarCep();
    }
  }, [cep]);

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setStep('cep');
    setCep('');
    setRua('');
    setNumero('');
    setBairro('');
    setComplemento('');
    setReferencia('');
    setCidade('');
    setEstado('');
    setCepError('');
    setShowNumeroAlert(false);
  };

   const handleChooseDelivery = () => {
    setStep('cep');
  };

  const handleChoosePickup = () => {
    onConfirmPickup();
    handleClose();
  };

  const handleConfirm = () => {
    if (!numero.trim()) {
      setShowNumeroAlert(true);
      return;
    }
    submitAddress();
  };

  const handleLoginConfirm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!senha) return;
    setIsLogando(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: user?.telefone || loginTelefone, senha: senha })
      });
      const data = await res.json();
      if (data.sucesso) {
        setStep('cep');
        setSenha('');
      } else {
        setCepError('Senha incorreta. Tente novamente.');
      }
    } catch (e) {
      setCepError('Erro de conexão. Tente novamente.');
    } finally {
      setIsLogando(false);
    }
  };

  const handleSelectSavedAddress = (addr: any) => {
    onConfirmDelivery({
      ...addr,
      enderecoCompleto: `${addr.logradouro}${addr.numero ? ', ' + addr.numero : ', S/N'} - ${addr.bairro}, ${addr.cidade} - ${addr.estado}`
    });
    handleClose();
  };

  const submitAddress = () => {
    onConfirmDelivery({
      cep: cep.replace(/\D/g, ''),
      logradouro: rua,
      numero: numero || 'S/N',
      bairro,
      complemento,
      referencia,
      cidade,
      estado,
      enderecoCompleto: `${rua}${numero ? ', ' + numero : ', S/N'} - ${bairro}, ${cidade} - ${estado}`
    });
    handleClose();
  };


  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div
        className={cn(
          "w-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300",
          step === 'cep' ? "max-w-md" : "max-w-lg"
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 tracking-tight">Endereço de entrega</h2>
          <button 
            onClick={handleClose} 
            className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-400 rounded-full transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">

          {/* == STEP 1: Digitar CEP == */}
          {step === 'cep' && (
            <div className="space-y-6">
              <div className="text-center space-y-6">
                <p className="text-[13px] text-gray-400 font-medium">Informe seu CEP para verificarmos se entregamos em sua região</p>

                <div className="relative group max-w-[240px] mx-auto">
                  <input
                    type="text"
                    value={cep}
                    onChange={e => setCep(formatCep(e.target.value))}
                    placeholder="00000-000"
                    maxLength={9}
                    className="w-full text-center text-4xl font-bold text-gray-800 tracking-tight outline-none py-6 placeholder-gray-200 bg-transparent"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleBuscarCep()}
                  />
                </div>

                {cepError && (
                  <p className="text-xs text-red-500 font-semibold h-4">{cepError}</p>
                )}

                <button
                  onClick={handleBuscarCep}
                  disabled={isLoadingCep}
                  className="w-full max-w-[260px] mx-auto bg-emerald-600 text-white font-black py-4 rounded-lg hover:bg-emerald-700 transition-all disabled:opacity-50 text-[13px] uppercase tracking-widest h-[52px] flex items-center justify-center shadow-lg shadow-emerald-600/10"
                >
                  {isLoadingCep ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : "BUSCAR CEP"}
                </button>

                <button className="text-[11px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors block mx-auto">
                  Não sei meu CEP
                </button>
              </div>

              <div className="pt-8 text-center bg-gray-50/50 -mx-6 -mb-6 p-6 border-t border-gray-100">
                {!user ? (
                   <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Já possui cadastro?</p>
                      <button 
                        onClick={() => setStep('login')}
                        className="text-[11px] font-black text-emerald-600 hover:text-emerald-700 transition-colors uppercase tracking-widest hover:underline underline-offset-4"
                      >
                         Acessar meus endereços
                      </button>
                   </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Endereços salvos</h3>
                    <div className="space-y-2">
                       {user.enderecos?.length > 0 ? user.enderecos.map((addr: any, idx: number) => (
                         <button 
                           key={idx}
                           onClick={() => handleSelectSavedAddress(addr)}
                           className="w-full flex items-center gap-4 p-4 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all text-left group"
                         >
                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                               <MapPin className="w-5 h-5 text-gray-400 group-hover:text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                               <p className="font-bold text-gray-800 text-sm truncate">{addr.logradouro}, {addr.numero}</p>
                               <p className="text-xs text-gray-500 truncate">{addr.bairro}, {addr.cidade}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-400" />
                         </button>
                       )) : (
                         <p className="text-xs text-gray-400 italic text-center py-2">Nenhum endereço salvo ainda.</p>
                       )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* == STEP 2: Login / Confirmação de Senha == */}
          {step === 'login' && (
            <div className="space-y-6 py-4 animate-in fade-in zoom-in-95 duration-300">
               <div className="text-center">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     {user ? <Lock className="w-8 h-8 text-emerald-600" /> : <User className="w-8 h-8 text-emerald-600" />}
                  </div>
                  <h3 className="text-xl font-extrabold text-gray-900 leading-tight">
                    {user ? `Olá, ${user.nome.split(' ')[0].toUpperCase()}` : 'Acesse seus endereços'}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {user ? 'Informe a sua senha para continuar' : 'Faça login para ver seus endereços salvos'}
                  </p>
               </div>

               <form onSubmit={handleLoginConfirm} className="space-y-4">
                   {!user && (
                    <input 
                      type="tel" 
                      placeholder="Número de telefone" 
                      value={loginTelefone}
                      onChange={e => setLoginTelefone(e.target.value)}
                      className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold" 
                    />
                  )}
                  <div className="relative">
                    <input 
                      type="password" 
                      value={senha}
                      onChange={e => setSenha(e.target.value)}
                      placeholder="Senha" 
                      className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" 
                      autoFocus
                    />
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                  </div>

                  <button className="text-xs font-bold text-gray-500 hover:text-emerald-600 transition-colors block mx-auto py-2">Esqueci minha senha</button>

                  <div className="flex gap-3 pt-4">
                    <button 
                      type="button"
                      onClick={() => setStep('cep')}
                      className="flex-1 font-bold text-gray-400 py-3 rounded-xl hover:bg-gray-50 transition-colors text-sm uppercase tracking-wider"
                    >
                      SAIR DESTA CONTA
                    </button>
                    <button 
                      type="submit"
                      disabled={isLogando || !senha}
                      className="flex-1 bg-emerald-700 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-800 transition-colors disabled:opacity-50 text-sm uppercase tracking-wider shadow-lg shadow-emerald-700/20"
                    >
                      {isLogando ? 'Verificando...' : 'CONFIRMAR'}
                    </button>
                  </div>
               </form>
            </div>
          )}


          {/* == STEP 3: Formulário de Endereço == */}
          {step === 'form' && (
            <div className="space-y-4 relative">
              {/* Alerta de número */}
              {showNumeroAlert && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40" onClick={() => setShowNumeroAlert(false)}>
                  <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm text-center space-y-4" onClick={e => e.stopPropagation()}>
                    <p className="font-bold text-gray-900 text-lg">O número não foi informado</p>
                    <button
                      onClick={() => {
                        setShowNumeroAlert(false);
                        setTimeout(() => numeroRef.current?.focus(), 100);
                      }}
                      className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-colors uppercase tracking-wider text-sm"
                    >
                      INFORMAR NÚMERO
                    </button>
                    <button
                      onClick={() => {
                        setShowNumeroAlert(false);
                        submitAddress();
                      }}
                      className="w-full border-2 border-emerald-600 text-emerald-600 font-bold py-3 rounded-xl hover:bg-emerald-50 transition-colors uppercase tracking-wider text-sm"
                    >
                      CONTINUAR SEM NÚMERO
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Rua *</label>
                  <input
                    type="text"
                    value={rua}
                    onChange={e => setRua(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-gray-800 font-medium"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nº</label>
                  <input
                    ref={numeroRef}
                    type="text"
                    value={numero}
                    onChange={e => setNumero(e.target.value)}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-gray-800 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Bairro *</label>
                <input
                  type="text"
                  value={bairro}
                  onChange={e => setBairro(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-gray-800 font-medium"
                />
              </div>

              <div>
                <input
                  type="text"
                  value={complemento}
                  onChange={e => setComplemento(e.target.value)}
                  placeholder="Complemento"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-gray-800 font-medium placeholder-gray-400"
                />
                <span className="text-xs text-gray-400 mt-1 block">Apto/Bloco/Casa</span>
              </div>

              <div>
                <input
                  type="text"
                  value={referencia}
                  onChange={e => setReferencia(e.target.value)}
                  placeholder="Ponto de referência"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-gray-800 font-medium placeholder-gray-400"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cidade *</label>
                  <input
                    type="text"
                    value={cidade}
                    onChange={e => setCidade(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-gray-800 font-medium"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Estado *</label>
                  <select
                    value={estado}
                    onChange={e => setEstado(e.target.value)}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-gray-800 font-medium bg-white"
                  >
                    <option value="">UF</option>
                    {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setStep('cep')}
                  className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-50 transition-colors uppercase tracking-wider text-sm"
                >
                  VOLTAR
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-colors uppercase tracking-wider text-sm"
                >
                  CONFIRMAR
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
}
