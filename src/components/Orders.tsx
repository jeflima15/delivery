import React, { useState, useEffect } from 'react';
import { Lock, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import PasswordAuthModal from './PasswordAuthModal';
import OrderDetailsModal from './OrderDetailsModal';

export default function Orders({ user }: { user?: any }) {
  const [isUnlocked, setIsUnlocked] = useState(() => sessionStorage.getItem('stitch_sensitive_auth_validated') === 'true');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  useEffect(() => {
    if (!isUnlocked) return;
    setLoading(true);
    const fetchOrders = async () => {
      try {
        const res = await fetch('/api/pedidos/meus', { credentials: 'include' });
        const data = await res.json();
        if (data.sucesso) {
          setOrders(data.pedidos);
        }
      } catch (error) {
        console.error("Erro ao buscar pedidos", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [isUnlocked]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
  };

  const formatDateTime = (dateStr: string) => {
     if (!dateStr) return '';
     const date = new Date(dateStr);
     const months = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
     const time = date.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });
     return `${date.getDate()} de ${months[date.getMonth()]} ${time}`;
  };

  if (!isUnlocked) {
    return (
      <div className="pt-2 sm:pt-6 animate-in fade-in duration-300 max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="text-2xl sm:text-[28px] font-bold text-[#444] dark:text-gray-200 tracking-tight mb-8">Seus pedidos</h1>
        
        <div className="max-w-[420px]">
           <div 
             onClick={() => setIsPasswordModalOpen(true)}
             className="bg-white rounded-xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-gray-100 p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
           >
             <div className="flex items-center gap-5">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 flex-shrink-0">
                   <Lock className="w-[18px] h-[18px]" strokeWidth={2.5} />
                </div>
                <div>
                   <h3 className="text-[15px] font-bold text-[#444] tracking-tight">Pedidos finalizados</h3>
                   <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">Os pedidos finalizados são mostrados apenas após<br/>informar sua senha.</p>
                </div>
             </div>
             <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
           </div>
           
           <div 
              onClick={() => setIsPasswordModalOpen(true)}
              className="mt-5 mb-16 flex items-center gap-2 cursor-pointer hover:opacity-80 px-1"
           >
              <div className="w-2 h-2 rounded-full bg-gray-300"></div>
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Informe sua senha</span>
           </div>
        </div>

        <PasswordAuthModal 
           isOpen={isPasswordModalOpen}
           onClose={() => setIsPasswordModalOpen(false)}
           onSuccess={() => setIsUnlocked(true)}
           userName={user?.nome}
        />
      </div>
    );
  }

  // UNLOCKED VIEW
  return (
    <div className="pt-2 sm:pt-6 animate-in fade-in duration-300 max-w-5xl mx-auto px-4 sm:px-6 mb-24">
      <h1 className="text-2xl sm:text-[28px] font-bold text-[#444] dark:text-gray-200 tracking-tight mb-8">Seus pedidos</h1>
      
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-white border border-gray-100 rounded-xl animate-pulse"></div>)}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm font-medium">Nenhum pedido finalizado encontrado.</div>
      ) : (
        <div className="space-y-12">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
             {orders.map((order) => {
                const orderId = order._id || order.id || '000000';
                const orderNumber = orderId.toString().slice(-6).toUpperCase();
                const isDelivery = order.tipo_entrega !== 'pickup';
                const total = order.total || 0;

                return (
                  <div 
                    key={orderId} 
                    onClick={() => setSelectedOrder(order)}
                    className="bg-white rounded-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-gray-100 cursor-pointer hover:shadow-md transition-all flex flex-col"
                  >
                     <div className="p-5 flex items-center justify-between border-b border-gray-50 flex-1">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                               "w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                               order.status === 'Entregue' ? 'bg-emerald-50 text-emerald-600 shadow-[0_4px_12px_-4px_rgba(16,185,129,0.3)]' : 'bg-gray-100 text-gray-400'
                            )}>
                               <CheckCircle className="w-[22px] h-[22px] stroke-[2]" />
                            </div>
                           <div>
                              <h3 className="text-[15px] font-bold text-[#444] tracking-tight">Pedido N° {orderNumber}</h3>
                              <p className="text-[11px] text-gray-400 mt-1 mb-0.5">Feito em {formatDate(order.createdAt || order.data)}</p>
                              <div className="flex items-center gap-[5px] text-[11px] font-medium text-[#555]">
                                 <span>Tipo: <span className="font-bold text-gray-600">{isDelivery ? 'Delivery' : 'Retirada'}</span></span>
                                 <span className="text-gray-300">Total: <span className="font-bold text-gray-600">R$ {total.toFixed(2).replace('.', ',')}</span></span>
                              </div>
                           </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                     </div>
                     <div className="px-5 py-3.5 bg-gray-50/50 flex items-center justify-between rounded-b-xl border-t border-gray-50 text-[11px] font-bold">
                        <div className="flex items-center gap-2">
                           <div className={cn(
                             "w-2.5 h-2.5 rounded-full",
                             order.status === 'Entregue' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 
                             order.status === 'Cancelado' ? 'bg-rose-500' : 
                             'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                           )}></div>
                           <span className={cn(
                             "mt-[1px] uppercase tracking-wider",
                             order.status === 'Entregue' ? 'text-emerald-600' : 
                             order.status === 'Cancelado' ? 'text-rose-600' : 
                             'text-amber-600'
                           )}>
                             Pedido {order.status === 'Entregue' ? 'concluído' : (order.status || 'recebido')}
                           </span>
                        </div>
                        <span className="mt-[1px] text-gray-400 font-medium">{formatDateTime(order.createdAt || order.data)}</span>
                     </div>
                  </div>
                );
             })}
           </div>
           
           <div className="text-center pt-2">
              <button className="text-[12px] font-bold text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">
                VER MAIS PEDIDOS
              </button>
           </div>
        </div>
      )}

      <OrderDetailsModal 
         isOpen={!!selectedOrder}
         onClose={() => setSelectedOrder(null)}
         order={selectedOrder}
      />
    </div>
  );
}
