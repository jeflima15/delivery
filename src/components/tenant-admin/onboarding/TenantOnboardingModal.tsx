import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Store,
  Truck,
  Eye,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Package,
  ExternalLink,
  MessageCircle,
  MapPin,
  Loader2,
} from 'lucide-react';
import { useToast } from '../../Toast';
import type { TenantAdminApi } from '../api';
import ImagePicker from '../../ImagePicker';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  api: TenantAdminApi;
  slug: string;
  initialStoreName?: string;
  initialStep?: string;
  onOnboardingComplete: () => void;
  onStoreNameUpdated?: (newName: string) => void;
};

type StepKey = 'welcome' | 'store' | 'service' | 'product' | 'preview' | 'complete';

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function TenantOnboardingModal({
  isOpen,
  onClose,
  api,
  slug,
  initialStoreName = '',
  initialStep = 'welcome',
  onOnboardingComplete,
  onStoreNameUpdated,
}: Props) {
  const { showToast } = useToast();

  const [step, setStep] = useState<StepKey>((initialStep as StepKey) || 'welcome');
  const [storeName, setStoreName] = useState(initialStoreName);
  const [phone, setPhone] = useState('');
  const [allowDelivery, setAllowDelivery] = useState(true);
  const [allowPickup, setAllowPickup] = useState(true);

  // Product form
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productImage, setProductImage] = useState('');
  const [existingProductsCount, setExistingProductsCount] = useState(0);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialStoreName && !storeName) {
      setStoreName(initialStoreName);
    }
  }, [initialStoreName]);

  useEffect(() => {
    if (isOpen) {
      api.getOnboardingStatus().then((res) => {
        if (res.success) {
          if (res.storeName) setStoreName(res.storeName);
          if (res.settings?.whatsapp || res.settings?.telefone) {
            setPhone(formatPhone(String(res.settings.whatsapp || res.settings.telefone)));
          }
          if (res.settings?.logisticsOptions) {
            setAllowDelivery(res.settings.logisticsOptions.allowDelivery !== false);
            setAllowPickup(res.settings.logisticsOptions.allowPickup !== false);
          }
          setExistingProductsCount(res.productsCount || 0);

          if (res.onboarding?.step && res.onboarding.step !== 'complete') {
            setStep(res.onboarding.step as StepKey);
          }
        }
      }).catch(() => undefined);
    }
  }, [isOpen, api]);

  if (!isOpen) return null;

  const saveProgress = async (nextStep: StepKey) => {
    setStep(nextStep);
    try {
      await api.updateOnboardingProgress({ step: nextStep });
    } catch (e) {
      // Non-blocking error
    }
  };

  const handleStoreNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      showToast('Por favor, informe o nome da loja.', 'error');
      return;
    }
    setLoading(true);
    try {
      await api.updateOnboardingStoreName(storeName.trim(), phone.trim());
      if (onStoreNameUpdated) onStoreNameUpdated(storeName.trim());
      showToast('Informações da loja salvas com sucesso!', 'success');
      await saveProgress('service');
    } catch (error: any) {
      showToast(error.message || 'Erro ao salvar informações da loja.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allowDelivery && !allowPickup) {
      showToast('Selecione pelo menos uma forma de atendimento.', 'error');
      return;
    }
    setLoading(true);
    try {
      await api.updateOnboardingServiceOptions({ allowDelivery, allowPickup });
      showToast('Opções de atendimento salvas!', 'success');
      await saveProgress('product');
    } catch (error: any) {
      showToast(error.message || 'Erro ao salvar formas de atendimento.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      showToast('Informe o nome do produto.', 'error');
      return;
    }
    const priceNum = parseFloat(productPrice.replace(',', '.'));
    if (isNaN(priceNum) || priceNum < 0) {
      showToast('Informe um preço válido.', 'error');
      return;
    }

    setLoading(true);
    try {
      await api.createProduct({
        nome: productName.trim(),
        preco: priceNum,
        descricao: productDescription.trim(),
        imagem: productImage.trim(),
        ativo: true,
      });
      showToast('Primeiro produto criado com sucesso!', 'success');
      setExistingProductsCount(prev => prev + 1);
      await saveProgress('preview');
    } catch (error: any) {
      showToast(error.message || 'Erro ao cadastrar produto.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await api.completeOnboarding();
      onOnboardingComplete();
      onClose();
    } catch (error) {
      onOnboardingComplete();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const openStorefront = () => {
    window.open(`/${encodeURIComponent(slug)}`, '_blank');
  };

  // Step indicators (4 main configuration steps)
  const stepMap: Record<StepKey, number> = {
    welcome: 0,
    store: 1,
    service: 2,
    product: 3,
    preview: 4,
    complete: 4,
  };
  const currentStepNum = stepMap[step];

  const mainSteps: { key: StepKey; title: string; num: number }[] = [
    { key: 'store', title: 'Loja', num: 1 },
    { key: 'service', title: 'Atendimento', num: 2 },
    { key: 'product', title: 'Cardápio', num: 3 },
    { key: 'preview', title: 'Visualizar', num: 4 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="relative my-8 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl animate-in zoom-in-95 duration-200">
        
        {/* Skip / Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          title="Fechar e ir para o painel"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress bar with 4 segmented steps */}
        {step !== 'welcome' && step !== 'complete' && (
          <div className="mb-6">
            <div className="grid grid-cols-4 gap-2 mb-2">
              {mainSteps.map((s) => {
                const isPast = currentStepNum > s.num;
                const isCurrent = currentStepNum === s.num;
                return (
                  <div key={s.key} className="flex flex-col gap-1">
                    <div
                      className={`h-1.5 w-full rounded-full transition-all duration-300 ${
                        isPast || isCurrent ? 'bg-emerald-600' : 'bg-slate-100'
                      }`}
                    />
                    <span
                      className={`text-[11px] font-medium tracking-tight truncate ${
                        isCurrent
                          ? 'font-bold text-emerald-700'
                          : isPast
                          ? 'text-slate-600'
                          : 'text-slate-400'
                      }`}
                    >
                      {s.num}. {s.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 1: WELCOME */}
        {step === 'welcome' && (
          <div className="text-center py-2">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-xs">
              <Sparkles className="h-8 w-8" />
            </div>
            
            <h2 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
              Boas-vindas à sua loja! 👋
            </h2>
            <p className="mt-2 text-sm text-slate-500 font-medium leading-relaxed">
              Vamos configurar o básico em poucos passos para você começar a receber pedidos. Você poderá alterar tudo depois pelo painel.
            </p>

            <div className="mt-6 space-y-2.5 text-left rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Defina o nome e WhatsApp da sua loja</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Escolha entre Entrega e Retirada no local</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Adicione seu primeiro produto ao cardápio</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => saveProgress('store')}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 px-5 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
              >
                Configurar loja <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Ir direto para o painel
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: STORE INFO (NAME + WHATSAPP/PHONE) */}
        {step === 'store' && (
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Informações da loja</h3>
                <p className="text-xs text-slate-500">Defina o nome de exibição e o WhatsApp de contato.</p>
              </div>
            </div>

            <form onSubmit={handleStoreNameSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nome da loja <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Ex: Confeitaria Doce Sabor"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  WhatsApp para pedidos
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <MessageCircle className="h-4 w-4" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Número que receberá as mensagens e notificações de pedidos.
                </p>
              </div>

              <div className="flex items-center gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setStep('welcome')}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 px-5 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                    </>
                  ) : (
                    <>
                      Continuar <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: SERVICE OPTIONS */}
        {step === 'service' && (
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Formas de atendimento</h3>
                <p className="text-xs text-slate-500">Como seus clientes poderão receber os pedidos?</p>
              </div>
            </div>

            <form onSubmit={handleServiceSubmit} className="space-y-4">
              <div className="space-y-2.5">
                <label
                  onClick={() => setAllowDelivery(!allowDelivery)}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    allowDelivery
                      ? 'border-emerald-500 bg-emerald-50/40 text-emerald-950 shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`grid h-9 w-9 place-items-center rounded-lg ${allowDelivery ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      <Truck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-900">Entrega (Delivery)</p>
                      <p className="text-xs text-slate-500">Entregue os pedidos diretamente no endereço do cliente.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowDelivery}
                    onChange={(e) => setAllowDelivery(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </label>

                <label
                  onClick={() => setAllowPickup(!allowPickup)}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    allowPickup
                      ? 'border-emerald-500 bg-emerald-50/40 text-emerald-950 shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`grid h-9 w-9 place-items-center rounded-lg ${allowPickup ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-900">Retirada no local</p>
                      <p className="text-xs text-slate-500">O cliente retira o pedido pronto no seu estabelecimento.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowPickup}
                    onChange={(e) => setAllowPickup(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </label>
              </div>

              <div className="flex items-center gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setStep('store')}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 px-5 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                    </>
                  ) : (
                    <>
                      Continuar <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 4: FIRST PRODUCT */}
        {step === 'product' && (
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Primeiro produto</h3>
                <p className="text-xs text-slate-500">Cadastre um item para ver seu cardápio em funcionamento.</p>
              </div>
            </div>

            {existingProductsCount > 0 ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 text-center">
                  <CheckCircle2 className="h-9 w-9 text-emerald-600 mx-auto mb-2" />
                  <h4 className="font-bold text-emerald-950 text-sm">Seu cardápio já tem produtos!</h4>
                  <p className="text-xs text-emerald-800 mt-1">
                    Encontramos {existingProductsCount} produto(s) cadastrado(s) na sua loja. Você pode avançar diretamente para a visualização.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('service')}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => saveProgress('preview')}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 px-5 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                  >
                    Visualizar minha loja <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleProductSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome do produto <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Ex: Bolo de Chocolate com Morango"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Preço (R$) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
                    placeholder="25,00"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Descrição <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <textarea
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                    placeholder="Descreva os ingredientes ou detalhes do produto..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 h-18 resize-none"
                  />
                </div>

                <div>
                  <ImagePicker
                    label="Foto do produto (opcional)"
                    value={productImage}
                    onChange={(url) => setProductImage(url)}
                    width={800}
                    height={800}
                    bucket="produtos"
                    path="produtos"
                  />
                </div>

                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('service')}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 px-5 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Cadastrando...
                      </>
                    ) : (
                      <>
                        Cadastrar produto <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* STEP 5: PREVIEW */}
        {step === 'preview' && (
          <div className="text-center py-2">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shadow-xs">
              <Eye className="h-8 w-8" />
            </div>
            
            <h2 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
              Sua loja está tomando forma! 🎉
            </h2>
            <p className="mt-2 text-sm text-slate-500 font-medium leading-relaxed">
              Veja em tempo real como seus clientes visualizarão seu cardápio online.
            </p>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Link da sua vitrine</p>
              <div className="flex items-center justify-between gap-2 overflow-hidden">
                <span className="truncate text-xs font-semibold text-slate-700 font-mono">
                  {typeof window !== 'undefined' ? `${window.location.origin}/${slug}` : `/${slug}`}
                </span>
                <button
                  type="button"
                  onClick={openStorefront}
                  className="shrink-0 flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={openStorefront}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 px-5 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
              >
                <Eye className="h-4 w-4" /> Visualizar cardápio em nova aba
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep('product')}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
                <button
                  type="button"
                  onClick={() => saveProgress('complete')}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Avançar para finalização
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: COMPLETE */}
        {step === 'complete' && (
          <div className="text-center py-2">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-xs">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            
            <h2 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
              Tudo pronto para começar! ✨
            </h2>
            <p className="mt-2 text-sm text-slate-500 font-medium leading-relaxed">
              Sua loja já está configurada com os dados essenciais. No painel você poderá acompanhar pedidos em tempo real, cadastrar mais produtos e personalizar suas configurações.
            </p>

            <div className="mt-6">
              <button
                type="button"
                onClick={handleComplete}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 px-5 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Finalizando...
                  </>
                ) : (
                  <>
                    Acessar painel de controle <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
