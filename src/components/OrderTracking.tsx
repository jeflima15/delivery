// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Package, ChefHat, Bike, CheckCircle, ArrowLeft, Clock, MapPin, Phone, Store } from 'lucide-react';

interface OrderTrackingProps {
  orderId: string;
  storePhone?: string;
  onBack: () => void;
}

export default function OrderTracking({ orderId, storePhone, onBack }: OrderTrackingProps) {
  const [pedido, setPedido] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/pedidos/tracking/${orderId}`);
      const data = await res.json();
      if (data.sucesso && data.pedido) {
        setPedido(data.pedido);
      } else {
        setPedido(null);
      }
    } catch (e) { 
      console.error('Erro ao rastrear', e);
      setPedido(null);
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Poll a cada 10s
    return () => clearInterval(interval);
  }, [orderId]);

  if (loading) return <div className="p-10 text-center">Carregando rastreio...</div>;
  if (!pedido) return (
    <div className="p-10 text-center">
      <p>Pedido não encontrado.</p>
      <button onClick={onBack} className="mt-4 store-text-primary font-bold">Voltar</button>
    </div>
  );

  const getStatusLabel = (status: string, tipo: string) => {
    if (tipo === 'pickup') {
      if (status === 'Saiu para Entrega') return 'Pronto para Retirada';
      if (status === 'Entregue') return 'Finalizado';
    }
    if (status === 'Saiu para Entrega') return 'Saiu para Entrega';
    return status;
  };

  const getStatusStep = () => {
    switch (pedido.status) {
      case 'Pendente': return 1;
      case 'Preparando': return 2;
      case 'Saiu para Entrega': return 3;
      case 'Entregue': return 4;
      default: return 1;
    }
  };

  const step = getStatusStep();

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-500">
      <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:store-text-primary transition-colors font-semibold">
        <ArrowLeft className="w-5 h-5" /> Voltar ao Início
      </button>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
        {/* Header do Rastreio */}
        <div className="store-bg-primary p-8 store-text-on-primary">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white/75 text-sm font-bold uppercase tracking-widest mb-1">Status do Pedido</p>
              <h2 className="text-3xl font-black">#{pedido._id.slice(-6).toUpperCase()}</h2>
            </div>
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3 bg-white/10 p-4 rounded-2xl backdrop-blur-sm border border-white/10 text-sm font-medium">
             <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" />
             Seu pedido está em: <span className="font-bold underline">{getStatusLabel(pedido.status, pedido.tipo_entrega)}</span>
          </div>
        </div>

        {/* Barra de Progresso Visual */}
        <div className="p-8">
          <div className="relative flex justify-between">
            {/* Linha de fundo */}
            <div className="absolute top-6 left-0 w-full h-1 bg-gray-100 rounded-full -z-0" />
            {/* Linha de progresso */}
            <div 
              className="absolute top-6 left-0 h-1 store-bg-primary rounded-full -z-0 transition-all duration-1000 ease-out" 
              style={{ width: `${((step - 1) / 3) * 100}%` }} 
            />

            {[
              { id: 1, label: 'Pendente', icon: Package },
              { id: 2, label: 'Preparo', icon: ChefHat },
              { id: 3, label: pedido.tipo_entrega === 'pickup' ? 'Pronto' : 'Em Rota', icon: pedido.tipo_entrega === 'pickup' ? Store : Bike },
              { id: 4, label: pedido.tipo_entrega === 'pickup' ? 'Coletado' : 'Entregue', icon: CheckCircle },
            ].map((s) => (
              <div key={s.id} className="relative z-10 flex flex-col items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm ${
                  step >= s.id ? 'store-bg-primary store-text-on-primary scale-110' : 'bg-gray-100 text-gray-400'
                }`}>
                  <s.icon className="w-6 h-6" />
                </div>
                <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-tight ${
                  step >= s.id ? 'store-text-primary' : 'text-gray-400'
                }`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          <hr className="my-10 border-gray-100" />

          {/* Detalhes Adicionais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-xl">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Endereço de Entrega</p>
                  <p className="text-sm font-bold text-gray-800 leading-tight mt-0.5">
                    {pedido.tipo_entrega === 'pickup' ? 'Retirada no Balcão' : pedido.cliente?.endereco}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-50 rounded-xl">
                  <Phone className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Contato do Suporte</p>
                  <a 
                    href={`https://wa.me/55${storePhone?.replace(/\D/g, '')}`} 
                    target="_blank" 
                    className="text-sm font-bold store-text-primary hover:underline leading-tight mt-0.5 block"
                  >
                    {storePhone || '(Não configurado)'}
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
               <h4 className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-widest">Resumo Financeiro</h4>
               <div className="space-y-2">
                 <div className="flex justify-between text-sm text-gray-600">
                   <span>Subtotal</span>
                   <span className="font-bold">R$ {(pedido.total - (pedido.frete || 0)).toFixed(2).replace('.', ',')}</span>
                 </div>
                 <div className="flex justify-between text-sm text-gray-600">
                   <span>Taxa de Entrega</span>
                   <span className="font-bold">R$ {(pedido.frete || 0).toFixed(2).replace('.', ',')}</span>
                 </div>
                 <div className="flex justify-between text-lg store-text-primary font-black pt-3 border-t border-gray-200 mt-2">
                   <span>Total</span>
                   <span>R$ {pedido.total.toFixed(2).replace('.', ',')}</span>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* Footer do Rastreio */}
        <div className="bg-gray-50/80 p-6 border-t border-gray-100 mt-4 text-center">
          <p className="text-xs text-gray-500 font-medium italic">
            {step === 1 && "Estamos aguardando a confirmação da cozinha..."}
            {step === 2 && "Eba! Seu pedido está sendo preparado com muito carinho."}
            {step === 3 && (pedido.tipo_entrega === 'pickup' ? "Seu pedido já está no balcão te esperando! ✨" : "O entregador já está roncando o motor a caminho de você!")}
            {step === 4 && (pedido.tipo_entrega === 'pickup' ? "Pedido coletado com sucesso! Volte sempre. 😋" : "Pedido finalizado! Bom apetite! 😋")}
          </p>
        </div>
      </div>
    </div>
  );
}
