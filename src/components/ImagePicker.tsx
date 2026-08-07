import React, { useState, useCallback } from 'react';
import { Upload, X, ImageIcon, Loader2, Scissors, Check, SlidersHorizontal } from 'lucide-react';
import Cropper from 'react-easy-crop'; // Ferramenta de corte profissional
import { supabase } from '../lib/supabase';
import { useOptionalTenantAdminApi } from './tenant-admin/TenantAdminContext';

interface ImagePickerProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  onUploadStatus?: (isUploading: boolean) => void;
  aspect?: number; // Ex: 1/1, 16/9
  width?: number;  // Largura final (ex: 800)
  height?: number; // Altura final (ex: 800)
  bucket?: string; // Bucket do Supabase (ex: 'produtos', 'loja')
  path?: string;   // Subpasta dentro do bucket (ex: 'identidade', 'produtos')
}

// Helper: Processa o corte via Canvas e redimensiona para os valores informados em WebP
const getCroppedImg = async (imageSrc: string, pixelCrop: any, finalWidth: number, finalHeight: number): Promise<Blob> => {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => (image.onload = resolve));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Canvas context not found');

  canvas.width = finalWidth;
  canvas.height = finalHeight;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    finalWidth,
    finalHeight
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Canvas is empty'));
        else resolve(blob);
      },
      'image/webp',
      0.8 // Qualidade WebP otimizada para web
    );
  });
};

export default function ImagePicker({ 
  value, 
  onChange, 
  label, 
  onUploadStatus,
  aspect = 1 / 1,
  width = 800,
  height = 800,
  bucket = 'produtos',
  path = ''
}: ImagePickerProps) {
  const tenantAdminApi = useOptionalTenantAdminApi();
  const [uploading, setUploading] = useState(false);
  
  // Estados do Corte
  const [showCropper, setShowCropper] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const setStatus = (val: boolean) => {
    setUploading(val);
    if (onUploadStatus) onUploadStatus(val);
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result as string);
        setShowCropper(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback((_croppedArea: any, pixelArea: any) => {
    setCroppedAreaPixels(pixelArea);
  }, []);

  const handleConfirmCrop = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    setShowCropper(false);
    setStatus(true);
    
    try {
      // 1. Processa o corte e redimensionamento localmente (Canvas -> WebP)
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels, width, height);
      if (!tenantAdminApi) throw new Error('Upload administrativo indisponivel fora do painel da loja.');
      if (!supabase) throw new Error('Storage nao configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
      const signed = await tenantAdminApi.signUpload({ target: bucket === 'loja' ? 'store' : 'product', mimeType: 'image/webp', size: croppedBlob.size });

      // O navegador recebe apenas um token curto para um caminho definido pelo servidor.
      const { error } = await supabase.storage
        .from(signed.upload.bucket)
        .uploadToSignedUrl(signed.upload.path, signed.upload.token, croppedBlob, {
          contentType: 'image/webp',
          cacheControl: '3600',
        });

      if (error) throw error;

      if (signed.upload.publicUrl) {
         onChange(signed.upload.publicUrl);
         setImageSrc(null);
      }

    } catch (err: any) {
      console.error('❌ Erro no Processamento/Upload:', err);
      alert(`Erro: ${err.message || 'Falha ao processar imagem.'}`);
    } finally {
      setStatus(false);
    }
  };

  return (
    <div className="space-y-4">
      {label && <label className="block text-sm font-bold text-gray-700 dark:text-slate-300">{label}</label>}
      <div className="flex flex-col gap-3">
        {/* Preview Container Dinâmico e Profissional */}
        <div className={`
          relative w-full ${aspect > 1.2 ? 'h-32' : 'h-32 max-w-[128px] mx-auto'} 
          bg-gray-50 dark:bg-slate-900 rounded-2xl border-2 border-dashed 
          ${value ? 'border-emerald-500/40 shadow-sm' : 'border-gray-200 dark:border-slate-800 shadow-inner'} 
          flex items-center justify-center overflow-hidden transition-all group
        `}>
          {value ? (
            <div className="relative w-full h-full group">
              <img src={value} alt="Preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                 <button 
                  onClick={() => onChange('')}
                  className="bg-red-500 text-white p-2 rounded-xl hover:bg-red-600 transition-colors shadow-lg"
                  title="Remover Imagem"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Badge de Sucesso Realista */}
              <div className="absolute top-3 right-3 bg-emerald-500 text-white p-1.5 rounded-full shadow-lg z-20">
                <Check className="w-3 h-3" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-slate-600">
               <ImageIcon className="w-10 h-10 opacity-30" />
               <span className="text-[10px] font-black tracking-widest uppercase">Sem Imagem</span>
            </div>
          )}
          
          {uploading && (
            <div className="absolute inset-0 bg-emerald-600/90 backdrop-blur-[2px] flex flex-col items-center justify-center text-white z-30">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <span className="text-[10px] font-black tracking-widest uppercase animate-pulse">ENVIANDO...</span>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <label className={`
            inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm
            ${uploading 
               ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' 
               : 'bg-white text-emerald-700 border border-emerald-100 hover:bg-emerald-50 hover:border-emerald-200 cursor-pointer'}
          `}>
            <Upload className={`w-4 h-4 ${uploading ? 'animate-pulse' : ''}`} />
            {uploading ? 'Processando...' : (value ? 'Alterar Imagem' : 'Subir Imagem')}
            {!uploading && <input type="file" className="hidden" accept="image/*" onChange={onFileChange} />}
          </label>
          <p className="text-[11px] text-gray-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Auto-ajuste para {width}x{height}px (WebP)
          </p>
        </div>
      </div>

      {/* MODAL DE CORTE PROFISSIONAL */}
      {showCropper && imageSrc && (
        <div className="fixed inset-0 z-[999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Scissors className="w-5 h-5 text-emerald-600" /> Ajustar Imagem
                </h3>
                <p className="text-sm text-gray-500 mt-1">Corte padronizado em {width} x {height}px.</p>
              </div>
              <button 
                onClick={() => { setShowCropper(false); setImageSrc(null); }}
                className="p-2 text-gray-400 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="relative h-[400px] w-full bg-gray-200">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <SlidersHorizontal className="w-5 h-5 text-gray-400" />
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowCropper(false); setImageSrc(null); }}
                  className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCrop}
                  className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Check className="w-5 h-5" /> Confirmar e Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
