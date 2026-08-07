import React, { useEffect, useRef } from 'react';
import { X, Copy, MessageCircle, Download, ExternalLink } from 'lucide-react';
import { useToast } from '../Toast';

interface ShareStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeUrl: string;
}

export default function ShareStoreModal({ isOpen, onClose, storeUrl }: ShareStoreModalProps) {
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(storeUrl);
    showToast('Link copiado para a área de transferência', 'success');
  };

  const handleWhatsApp = () => {
    const text = `Confira nosso cardápio e faça seu pedido online! 🍔🚀\n\nAcesse: ${storeUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleDownloadQR = async () => {
    try {
      const response = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(storeUrl)}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qr-code-loja.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao baixar QR Code', err);
      showToast('Erro ao baixar o QR Code', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-gray-100 p-5 md:p-6 bg-gray-50">
          <div>
            <h3 className="text-xl font-black text-gray-900">Divulgar Minha Loja</h3>
            <p className="mt-1 text-sm text-gray-500 font-medium">Compartilhe o link ou QR Code com seus clientes.</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 md:p-8 flex flex-col items-center">
          {/* QR Code */}
          <div className="mb-6 flex flex-col items-center">
            <div className="p-4 bg-white border-2 border-emerald-100 rounded-3xl shadow-sm mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(storeUrl)}`}
                alt="QR Code da Loja"
                className="w-48 h-48"
              />
            </div>
            <button
              onClick={handleDownloadQR}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 rounded-full hover:bg-emerald-100 transition-colors border border-emerald-200"
            >
              <Download className="w-4 h-4" /> Baixar QR Code (PNG)
            </button>
          </div>

          {/* Link da loja */}
          <div className="w-full">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Link da sua loja</p>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-2xl border border-gray-200">
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-gray-700">
                {storeUrl}
              </span>
              <a
                href={storeUrl}
                target="_blank"
                rel="noreferrer"
                className="p-2 text-gray-500 hover:text-emerald-600 transition-colors bg-white rounded-xl shadow-sm border border-gray-100"
                title="Abrir link"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="mt-6 flex flex-col gap-3 w-full">
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-colors"
            >
              <Copy className="w-5 h-5" /> Copiar Link
            </button>
            <button
              onClick={handleWhatsApp}
              className="flex items-center justify-center gap-2 w-full py-4 bg-[#25D366] text-white rounded-2xl font-bold hover:bg-[#1DA851] transition-colors"
            >
              <MessageCircle className="w-5 h-5" /> Compartilhar no WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
