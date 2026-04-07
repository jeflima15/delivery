// @ts-nocheck
import React, { useState } from 'react';
import { X, Instagram, MapPin, Phone, CreditCard, Wallet, Banknote, Clock, Store } from 'lucide-react';

interface StoreInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeInfo: any;
}

export default function StoreInfoModal({ isOpen, onClose, storeInfo }: StoreInfoModalProps) {
  const [activeTab, setActiveTab] = useState<'sobre' | 'horario' | 'pagamento'>('sobre');

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const diasOrdenados = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
  const nomesDias: Record<string, string> = {
    segunda: 'Segunda',
    terca: 'Terça',
    quarta: 'Quarta',
    quinta: 'Quinta',
    sexta: 'Sexta',
    sabado: 'Sábado',
    domingo: 'Domingo'
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between p-6 pb-2">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            {storeInfo.nome_loja} <span className="text-gray-300 font-light hidden sm:inline">|</span> <span className="hidden sm:inline text-sm font-semibold text-gray-600">Mais informações</span>
          </h2>
          <button 
            onClick={onClose} 
            className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            <X className="w-5 h-5 pointer-events-none" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-100 flex items-center gap-8 text-[13px] font-bold tracking-wider uppercase">
          <button 
            onClick={() => setActiveTab('sobre')}
            className={`py-4 border-b-2 transition-colors ${activeTab === 'sobre' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
          >
            Sobre
          </button>
          <button 
            onClick={() => setActiveTab('horario')}
            className={`py-4 border-b-2 transition-colors ${activeTab === 'horario' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
          >
            Horário
          </button>
          <button 
            onClick={() => setActiveTab('pagamento')}
            className={`py-4 border-b-2 transition-colors ${activeTab === 'pagamento' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
          >
            Pagamento
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 flex-1 overflow-y-auto">
          
          {/* Aba: Sobre */}
          {activeTab === 'sobre' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                {storeInfo.logo_url ? (
                  <img src={storeInfo.logo_url} className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-[1.25rem] border border-gray-100 shadow-sm shrink-0" alt="Logo" />
                ) : (
                  <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gray-100 rounded-[1.25rem] flex items-center justify-center shrink-0">
                    <Store className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                
                <div className="flex-1">
                  <p className="text-[15px] leading-relaxed text-gray-600 mb-4 whitespace-pre-wrap">
                    {storeInfo.sobre_texto || 'A loja ainda não adicionou informações sobre sua história.'}
                  </p>
                  
                  {storeInfo.instagram_url && (
                    <a 
                      href={storeInfo.instagram_url.startsWith('http') ? storeInfo.instagram_url : `https://instagram.com/${storeInfo.instagram_url.replace('@', '')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-[#E1306C] hover:underline font-bold transition-all"
                    >
                      <Instagram className="w-5 h-5" />
                      {storeInfo.instagram_url.startsWith('@') ? storeInfo.instagram_url : `@${storeInfo.instagram_url.split('/').pop()}`}
                    </a>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Contato</h3>
                <div className="flex flex-wrap gap-4">
                  {storeInfo.whatsapp ? (
                    <a 
                      href={`https://wa.me/55${storeInfo.whatsapp.replace(/\D/g, '')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-6 py-3 bg-white border-2 border-emerald-600/20 text-emerald-600 rounded-xl font-bold hover:bg-emerald-600/5 transition-colors"
                    >
                      <Phone className="w-5 h-5" />
                      {storeInfo.whatsapp}
                    </a>
                  ) : (
                    <p className="text-sm text-gray-500">Nenhum número de WhatsApp configurado.</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Endereço</h3>
                {storeInfo.rua_loja ? (
                  <div className="text-[15px] text-gray-600 space-y-1">
                    <p>{storeInfo.rua_loja}{storeInfo.numero_loja ? `, ${storeInfo.numero_loja}` : ''}</p>
                    <p>{storeInfo.bairro_loja}, {storeInfo.cidade_loja} - {storeInfo.estado_loja}</p>
                    <p>Loja Fundo</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Endereço não configurado.</p>
                )}
              </div>
            </div>
          )}

          {/* Aba: Horário */}
          {activeTab === 'horario' && (
            <div className="animate-in fade-in slide-in-from-bottom-2">
              <div className="w-full max-w-md">
                {diasOrdenados.map((dia, idx) => {
                  const hr = storeInfo.horarios_funcionamento?.[dia];
                  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long' }).toLowerCase().replace('ç', 'c') === dia;
                  
                  return (
                    <div key={dia} className={`flex items-center justify-between py-4 border-b border-gray-100 last:border-0 ${hoje ? 'bg-gray-50 -mx-4 px-4 rounded-xl font-bold' : ''}`}>
                      <span className={`text-[15px] ${hoje ? 'text-gray-900' : 'text-gray-600'}`}>
                        {nomesDias[dia]}
                        {hoje && <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">Hoje</span>}
                      </span>
                      <span className={`text-[15px] font-semibold ${hr && hr.aberto ? 'text-gray-900' : 'text-gray-400'}`}>
                        {hr && hr.aberto ? `${hr.inicio} às ${hr.fim}` : 'Fechado'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Aba: Pagamento */}
          {activeTab === 'pagamento' && (
            <div className="animate-in fade-in slide-in-from-bottom-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {storeInfo.pagamento_dinheiro && (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl">
                    <Banknote className="w-6 h-6 text-emerald-600" />
                    <span className="font-bold text-gray-900 text-[15px]">Dinheiro</span>
                  </div>
                )}
                
                {storeInfo.pagamento_pix && (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl">
                    <span className="text-[#32BCAD] w-6 h-6 flex items-center justify-center font-bold text-lg">◈</span>
                    <span className="font-bold text-gray-900 text-[15px]">Pix automático</span>
                  </div>
                )}

                {storeInfo.pagamento_cartao && (
                  <>
                    <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl">
                      <CreditCard className="w-6 h-6 text-blue-600" />
                      <span className="font-bold text-gray-900 text-[15px]">Cartão de crédito</span>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl">
                      <CreditCard className="w-6 h-6 text-indigo-600" />
                      <span className="font-bold text-gray-900 text-[15px]">Cartão de débito</span>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl">
                      <Wallet className="w-6 h-6 text-purple-600" />
                      <span className="font-bold text-gray-900 text-[15px]">Vale refeição</span>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl">
                      <Wallet className="w-6 h-6 text-orange-600" />
                      <span className="font-bold text-gray-900 text-[15px]">Vale alimentação</span>
                    </div>
                  </>
                )}
                
                {!storeInfo.pagamento_dinheiro && !storeInfo.pagamento_pix && !storeInfo.pagamento_cartao && (
                   <p className="col-span-full text-gray-500">Nenhum método de pagamento configurado.</p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
