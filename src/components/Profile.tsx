import React, { useState, useRef } from 'react';
import { User, MapPin, Plus, LogOut, ChevronRight, X, Loader2, Trash2, Gift } from 'lucide-react';
import { useToast } from './Toast';

interface ProfileProps {
  user: any;
  onLogout: () => void;
  onUpdateUser: (user: any) => void;
  isLoyaltyActive?: boolean;
}

export default function Profile({ user, onLogout, onUpdateUser, isLoyaltyActive = false }: ProfileProps) {
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const numeroRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    titulo: '🏠 Casa',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: ''
  });

  if (!user) return null;

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const cep = e.target.value.replace(/\D/g, '');
    setFormData(prev => ({ ...prev, cep }));

    if (cep.length === 8) {
      setIsSearchingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            logradouro: data.logradouro || prev.logradouro,
            bairro: data.bairro || prev.bairro,
            cidade: data.localidade || prev.cidade,
            estado: data.uf || prev.estado,
          }));
          // Focus no campo número após preencher
          setTimeout(() => {
            numeroRef.current?.focus();
          }, 100);
        }
      } catch (error) {
        console.error("Erro ao buscar CEP", error);
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  const closeForm = () => {
    setIsAddingAddress(false);
    setEditingIndex(null);
    setFormData({ titulo: '🏠 Casa', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '' });
  };

  const openEditForm = (index: number, endereco: any) => {
    setEditingIndex(index);
    setFormData({
      titulo: endereco.titulo || '🏠 Casa',
      logradouro: endereco.logradouro || '',
      numero: endereco.numero || '',
      complemento: endereco.complemento || '',
      bairro: endereco.bairro || '',
      cidade: endereco.cidade || '',
      estado: endereco.estado || '',
      cep: endereco.cep || ''
    });
    setIsAddingAddress(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const url = editingIndex !== null 
        ? `/api/auth/enderecos/${editingIndex}` 
        : '/api/auth/enderecos';
      const method = editingIndex !== null ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.sucesso) {
        onUpdateUser({ ...user, enderecos: data.enderecos });
        closeForm();
        showToast(editingIndex !== null ? '✅ Endereço atualizado!' : '✅ Endereço adicionado!', 'success');
      } else {
        showToast(data.erro || 'Erro ao salvar endereço', 'error');
      }
    } catch (error) {
      console.error('Erro ao salvar endereço:', error);
      showToast('Erro de conexão ao salvar endereço', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAddress = async () => {
    if (editingIndex === null) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/auth/enderecos/${editingIndex}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.sucesso) {
        onUpdateUser({ ...user, enderecos: data.enderecos });
        closeForm();
        showToast('🗑️ Endereço excluído com sucesso!', 'success');
      } else {
        showToast(data.erro || 'Erro ao excluir endereço', 'error');
      }
    } catch (error) {
      console.error('Erro ao excluir endereço:', error);
      showToast('Erro de conexão ao excluir endereço', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-in fade-in duration-300">
      <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-6">Meu Perfil</h2>

      {/* Dados do Cliente */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center gap-6">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
          <User className="w-10 h-10 text-gray-400" />
        </div>
        <div>
          <h3 className="text-2xl font-bold text-gray-900">{user.nome}</h3>
          <p className="text-gray-500 mt-1">{user.telefone}</p>
        </div>
      </div>

      {isLoyaltyActive && (
        <div className="store-bg-primary rounded-3xl p-6 store-text-on-primary shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -z-0 group-hover:scale-110 transition-transform duration-700"></div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
               <p className="text-white/80 font-black text-[10px] flex items-center gap-2 uppercase tracking-[0.15em] italic">
                 <Gift className="w-3.5 h-3.5 fill-current" /> Fidelidade Clube Stitch
               </p>
               <h3 className="text-4xl font-black mt-2 italic">{user.pontos || 0} <span className="text-lg font-bold text-white/70 lowercase italic">pontos</span></h3>
               <p className="text-[11px] text-white/70 mt-4 leading-relaxed max-w-[220px] font-bold italic">
                 Troque seus pontos por produtos exclusivos diretamente na sua sacola!
               </p>
            </div>
            <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm border border-white/20 shadow-lg transform rotate-3">
               <div className="text-[10px] font-black uppercase text-white/75 mb-1 tracking-widest italic text-center">Status</div>
               <div className="text-xl font-black italic tracking-tighter">CLIENTE VIP</div>
            </div>
          </div>
        </div>
      )}


      {/* Meus Endereços */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Meus Endereços</h3>
        </div>
        
        <div className="space-y-4">
          {/* Endereços Reais */}
          {user.enderecos && user.enderecos.length > 0 ? (
            user.enderecos.map((endereco: any, index: number) => (
              <div 
                key={index} 
                onClick={() => openEditForm(index, endereco)}
                className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-start gap-4 hover:store-border-soft transition-colors cursor-pointer group"
              >
                <div className="p-2 store-bg-soft rounded-xl store-text-primary mt-1">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900">{endereco.titulo || 'Endereço'}</h4>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                    {endereco.logradouro}, {endereco.numero} {endereco.complemento && `- ${endereco.complemento}`}<br />
                    Bairro {endereco.bairro}<br />
                    {endereco.cidade}, {endereco.estado}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:store-text-primary transition-colors" />
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm italic">Nenhum endereço cadastrado.</p>
          )}

          <button onClick={() => { closeForm(); setIsAddingAddress(true); }} className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-600 font-bold hover:store-border-soft hover:store-text-primary hover:store-bg-soft transition-all">
            <Plus className="w-5 h-5" />
            Adicionar Novo Endereço
          </button>
        </div>
      </div>

      {/* Ações da Conta */}
      <div className="pt-8 border-t border-gray-100">
        <button 
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-4 text-red-600 font-bold bg-red-50 rounded-2xl hover:bg-red-100 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sair da Conta
        </button>
      </div>

      {/* Modal de Formulário de Endereço */}
      {isAddingAddress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-white">
              <h3 className="text-xl font-bold text-gray-900">
                {editingIndex !== null ? 'Editar Endereço' : 'Novo Endereço'}
              </h3>
              <button onClick={closeForm} className="p-2 bg-gray-50 rounded-full text-gray-500 hover:bg-gray-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
              <form id="address-form" onSubmit={handleSaveAddress} className="space-y-6">
                
                {/* Smart Inputs: Chips para Título */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Identificação do Local</label>
                  <div className="flex flex-wrap gap-2">
                    {['🏠 Casa', '💼 Trabalho', '📍 Outro'].map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setFormData({...formData, titulo: chip})}
                        className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                          formData.titulo === chip 
                            ? 'bg-gray-900 text-white shadow-md scale-105' 
                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'
                        }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">CEP</label>
                    <input required type="text" placeholder="00000-000" maxLength={9} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl store-focus transition-all font-medium" value={formData.cep} onChange={handleCepChange} />
                    {isSearchingCep && (
                      <div className="absolute right-4 top-9 flex items-center gap-2 store-text-primary">
                        <span className="text-xs font-bold">Buscando...</span>
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    )}
                  </div>
                  
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Logradouro</label>
                    <input required type="text" placeholder="Rua, Avenida, etc." className="w-full p-3.5 bg-white border border-gray-200 rounded-xl store-focus transition-all" value={formData.logradouro} onChange={e => setFormData({...formData, logradouro: e.target.value})} />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Número</label>
                    <input ref={numeroRef} required type="text" placeholder="123" className="w-full p-3.5 bg-white border border-gray-200 rounded-xl store-focus transition-all" value={formData.numero} onChange={e => setFormData({...formData, numero: e.target.value})} />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Complemento</label>
                    <input type="text" placeholder="Apto, Bloco (Opcional)" className="w-full p-3.5 bg-white border border-gray-200 rounded-xl store-focus transition-all" value={formData.complemento} onChange={e => setFormData({...formData, complemento: e.target.value})} />
                  </div>
                  
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Bairro</label>
                    <input required type="text" placeholder="Seu Bairro" className="w-full p-3.5 bg-white border border-gray-200 rounded-xl store-focus transition-all" value={formData.bairro} onChange={e => setFormData({...formData, bairro: e.target.value})} />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Cidade</label>
                    <input required type="text" placeholder="Sua Cidade" className="w-full p-3.5 bg-white border border-gray-200 rounded-xl store-focus transition-all" value={formData.cidade} onChange={e => setFormData({...formData, cidade: e.target.value})} />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Estado (UF)</label>
                    <input required type="text" placeholder="SP" maxLength={2} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl store-focus transition-all uppercase" value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value.toUpperCase()})} />
                  </div>
                </div>
              </form>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-gray-100 bg-white flex gap-3">
              {editingIndex !== null && (
                <button 
                  type="button" 
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSaving} 
                  className="px-5 py-3.5 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center disabled:opacity-50"
                  title="Excluir Endereço"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button 
                type="submit" 
                form="address-form"
                disabled={isSaving || !formData.titulo} 
                className="flex-1 py-3.5 store-bg-primary store-bg-primary-hover store-text-on-primary font-bold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed store-shadow"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Endereço'
                )}
              </button>
            </div>

          </div>
        </div>
        
      )}
      {/* Modal de Confirmação de Exclusão (Ignora o bloqueio do AI Studio) */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4 opacity-80" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Excluir Endereço?</h3>
            <p className="text-gray-500 mb-6">Essa ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(false)} 
                className="flex-1 py-3.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => { setShowDeleteConfirm(false); handleDeleteAddress(); }} 
                className="flex-1 py-3.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20"
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
