import React from 'react';
import { Printer } from 'lucide-react';

interface PrintOrderProps {
  order: any;
  storeName?: string;
}

export default function PrintOrder({ order, storeName }: PrintOrderProps) {
  const handlePrint = () => {
    window.print();
  };

  if (!order) return null;

  return (
    <div className="flex flex-col gap-2">
      <button 
        onClick={handlePrint}
        className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
      >
        <Printer className="w-5 h-5" />
        Imprimir Cupom
      </button>

      {/* ÁREA DE IMPRESSÃO (ESCONDIDA NA TELA, APARECE NA IMPRESSORA) */}
      <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-[9999] p-4 text-black font-mono text-sm leading-tight w-[80mm] mx-auto">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          }
        ` }} />
        
        <div className="print-area space-y-2">
          <div className="text-center border-b border-black pb-2 mb-2">
            {storeName && <h1 className="text-lg font-bold uppercase">{storeName}</h1>}
            <p className="text-[10px]">{new Date(order.createdAt).toLocaleString()}</p>
            <p className="font-bold border-t border-dashed border-black mt-1 pt-1">PEDIDO: #{order.orderNumber || order._id.slice(-6).toUpperCase()}</p>
          </div>

          <div className="border-b border-dashed border-black pb-2 mb-2">
            <p className="font-bold uppercase">CLIENTE: {order.cliente.nome}</p>
            <p>TEL: {order.cliente.telefone}</p>
            <p className="text-xs uppercase mt-1">TIPO: {order.tipo_entrega === 'pickup' ? 'RETIRADA' : 'ENTREGA'}</p>
            {order.tipo_entrega !== 'pickup' && (
              <p className="text-xs uppercase">END: {order.cliente.endereco}</p>
            )}
          </div>

          <div className="border-b border-dashed border-black pb-2 mb-2">
            <p className="font-bold border-b border-black mb-1">ITENS</p>
            {order.itens.map((item: any, i: number) => (
              <div key={i} className="mb-2">
                <div className="flex justify-between font-bold">
                  <span>{item.quantidade}x {item.nome}</span>
                  <span>R$ {item.subtotal.toFixed(2)}</span>
                </div>
                {item.opcoes_escolhidas?.map((op: any, j: number) => (
                  <p key={j} className="text-[11px] ml-2">• {op.quantidade}x {op.opcao}</p>
                ))}
              </div>
            ))}
          </div>

          <div className="space-y-1 text-right">
            <div className="flex justify-between"><span>Subtotal:</span><span>R$ {(order.total - (order.frete || 0) + (order.desconto_cupom || 0) + (order.valor_desconto_pontos || 0)).toFixed(2)}</span></div>
            {order.desconto_cupom > 0 && <div className="flex justify-between"><span>Cupom:</span><span>-R$ {order.desconto_cupom.toFixed(2)}</span></div>}
            {order.valor_desconto_pontos > 0 && <div className="flex justify-between"><span>Fidelidade:</span><span>-R$ {order.valor_desconto_pontos.toFixed(2)}</span></div>}
            <div className="flex justify-between"><span>Taxa Entrega:</span><span>R$ {(order.frete || 0).toFixed(2)}</span></div>
            <div className="flex justify-between text-lg font-bold border-t border-black pt-1"><span>TOTAL:</span><span>R$ {order.total.toFixed(2)}</span></div>
          </div>

          <div className="mt-4 pt-2 border-t border-dashed border-black">
            <p className="font-bold uppercase">Pagamento: {order.metodo_pagamento}</p>
            {order.metodo_pagamento === 'dinheiro' && order.troco_para > 0 && (
              <p>Troco para: R$ {order.troco_para.toFixed(2)}</p>
            )}
          </div>

          {order.observacoes && (
            <div className="mt-2 p-2 border border-black text-xs italic">
              <span className="font-bold">OBS:</span> {order.observacoes}
            </div>
          )}

          <div className="text-center mt-6 pt-2 border-t border-double border-black">
            <p className="text-xs italic">Obrigado pela preferência!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
