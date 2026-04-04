import React from 'react';
import { CheckCircle, Package, ArrowRight } from 'lucide-react';

interface OrderSuccessProps {
  orderId?: string;
  onTrackOrder: () => void;
}

export default function OrderSuccess({ orderId = '12345', onTrackOrder }: OrderSuccessProps) {
  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
      
      {/* Ícone Animado */}
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-emerald-200 rounded-full animate-ping opacity-50"></div>
        <div className="relative bg-emerald-100 text-emerald-600 rounded-full p-6 shadow-lg shadow-emerald-600/20">
          <CheckCircle className="w-20 h-20" />
        </div>
      </div>

      <h1 className="text-4xl font-bold text-gray-900 mb-3 text-center tracking-tight">
        Pedido Recebido!
      </h1>
      
      <p className="text-lg text-gray-500 text-center mb-8 max-w-sm">
        Sua delícia já está sendo preparada com muito carinho pela nossa cozinha.
      </p>

      <div className="bg-white px-8 py-6 rounded-3xl shadow-sm border border-gray-100 mb-10 w-full max-w-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-gray-50 p-3 rounded-2xl">
            <Package className="w-6 h-6 text-gray-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Número do Pedido</p>
            <p className="text-xl font-bold text-gray-900">#{orderId}</p>
          </div>
        </div>
      </div>

      <button
        onClick={onTrackOrder}
        className="w-full max-w-sm bg-emerald-600 text-white font-bold py-4 px-6 rounded-2xl hover:bg-emerald-700 transition-all active:scale-[0.98] shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3"
      >
        Acompanhar meu Pedido
        <ArrowRight className="w-5 h-5" />
      </button>

    </div>
  );
}
