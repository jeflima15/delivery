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
} from 'lucide-react';
import { useToast } from '../../Toast';
import type { TenantAdminApi } from '../api';

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
    if (isOpen) {
      // Fetch initial status from server
      api.getOnboardingStatus().then((res) => {
        if (res.success) {
          if (res.storeName) setStoreName(res.storeName);
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
      await api.updateOnboardingStoreName(storeName.trim());
      if (onStoreNameUpdated) onStoreNameUpdated(storeName.trim());
      showToast('Nome da loja salvo!', 'success');
      await saveProgress('service');
    } catch (error: any) {
      showToast(error.message || 'Erro ao salvar nome da loja.', 'error');
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

  // Step indicators
  const stepMap: Record<StepKey, number> = {
    welcome: 0,
    store: 1,
    service: 2,
    product: 3,
    preview: 4,
    complete: 4,
  };
  const currentStepNum = stepMap[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative my-8 w-full max-w-lg rounded-[2.5rem] border border-gray-100 bg-white p-6 shadow-2xl sm:p-8 md:p-10">
        
        {/* Header / Progress bar */}
        {step !== 'welcome' && step !== 'complete' && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              <span>Configuração guiada</span>
              <span>Passo {currentStepNum} de 4</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${(currentStepNum / 4) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Skip button for non-complete steps */}
        <button
          onClick={onClose}
          className="absolute right-6 top-6 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Fechar e ir para o painel"
        >
          <X className="h-5 w-5" />
        </button>

        {/* STEP 1: WELCOME */}
        {step === 'welcome' && (
          <div className="text-center py-2">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 shadow-inner">
              <Sparkles className="h-10 w-10 animate-bounce" />
            </div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">
              Bem-vindo à sua loja! 👋
            </h2>
            <p className="mt-3 text-sm text-gray-500 font-medium leading-relaxed">
              Vamos configurar o básico para você começar a testar seu cardápio em poucos minutos. Você poderá alterar tudo depois pelo painel.
            </p>

            <div className="mt-8 space-y-3">
              <button
                onClick={() => saveProgress('store')}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 px-6 font-bold text-white shadow-xl shadow-emerald-900/10 hover:bg-emerald-700 transition-colors"
              >
                Começar configuração <ArrowRight className="h-5 w-5" />
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-2xl border border-gray-200 py-3.5 px-6 font-bold text-gray-600 hover:bg-gray-50 transition-colors text-sm"
              >
                Ir direto para o painel
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: STORE NAME */}
        {step === 'store' && (
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Store className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900">Nome da loja</h3>
                <p className="text-xs text-gray-500">Como sua loja deve aparecer para os clientes?</p>
              </div>
            </div>

            <form onSubmit={handleStoreNameSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Nome de exibição
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Ex: Confeitaria da Ana"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 font-semibold text-gray-900 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                  required
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('welcome')}
                  className="flex items-center justify-center gap-1 rounded-2xl border border-gray-200 py-4 px-5 font-bold text-gray-600 hover:bg-gray-50 text-sm"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 px-6 font-bold text-white shadow-lg shadow-emerald-900/10 hover:bg-emerald-700 disabled:opacity-60 transition-colors text-sm"
                >
                  {loading ? 'Salvando...' : 'Continuar'} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: SERVICE OPTIONS */}
        {step === 'service' && (
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900">Formas de atendimento</h3>
                <p className="text-xs text-gray-500">Como seus clientes poderão receber os pedidos?</p>
              </div>
            </div>

            <form onSubmit={handleServiceSubmit} className="space-y-6">
              <div className="space-y-3">
                <label
                  onClick={() => setAllowDelivery(!allowDelivery)}
                  className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    allowDelivery ? 'border-emerald-500 bg-emerald-50/40' : 'border-gray-100 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={allowDelivery}
                      onChange={(e) => setAllowDelivery(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="font-black text-gray-900 text-sm">Entrega (Delivery)</p>
                      <p className="text-xs text-gray-500">Entregamos os pedidos no endereço do cliente.</p>
                    </div>
                  </div>
                </label>

                <label
                  onClick={() => setAllowPickup(!allowPickup)}
                  className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    allowPickup ? 'border-emerald-500 bg-emerald-50/40' : 'border-gray-100 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={allowPickup}
                      onChange={(e) => setAllowPickup(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="font-black text-gray-900 text-sm">Retirada no local</p>
                      <p className="text-xs text-gray-500">O cliente retira o pedido no seu estabelecimento.</p>
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('store')}
                  className="flex items-center justify-center gap-1 rounded-2xl border border-gray-200 py-4 px-5 font-bold text-gray-600 hover:bg-gray-50 text-sm"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 px-6 font-bold text-white shadow-lg shadow-emerald-900/10 hover:bg-emerald-700 disabled:opacity-60 transition-colors text-sm"
                >
                  {loading ? 'Salvando...' : 'Continuar'} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 4: FIRST PRODUCT */}
        {step === 'product' && (
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900">Primeiro produto</h3>
                <p className="text-xs text-gray-500">Cadastre um item para ver sua loja funcionando.</p>
              </div>
            </div>

            {existingProductsCount > 0 ? (
              <div className="space-y-6">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
                  <h4 className="font-black text-emerald-900 text-base">Seu cardápio já começou!</h4>
                  <p className="text-xs text-emerald-700 mt-1">
                    Encontramos {existingProductsCount} produto(s) cadastrado(s) na sua loja. Você pode avançar diretamente para o preview.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('service')}
                    className="flex items-center justify-center gap-1 rounded-2xl border border-gray-200 py-4 px-5 font-bold text-gray-600 hover:bg-gray-50 text-sm"
                  >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => saveProgress('preview')}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 px-6 font-bold text-white shadow-lg shadow-emerald-900/10 hover:bg-emerald-700 transition-colors text-sm"
                  >
                    Visualizar minha loja <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleProductSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Nome do produto *
                  </label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Ex: Bolo de Cenoura com Cobertura"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-semibold text-gray-900 outline-none focus:border-emerald-500 focus:bg-white text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Preço (R$) *
                  </label>
                  <input
                    type="text"
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
                    placeholder="25,00"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-semibold text-gray-900 outline-none focus:border-emerald-500 focus:bg-white text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Descrição (Opcional)
                  </label>
                  <textarea
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                    placeholder="Descreva os ingredientes ou detalhes do produto..."
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-medium text-gray-900 outline-none focus:border-emerald-500 focus:bg-white text-sm h-20 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    URL da imagem (Opcional)
                  </label>
                  <input
                    type="url"
                    value={productImage}
                    onChange={(e) => setProductImage(e.target.value)}
                    placeholder="https://exemplo.com/foto.jpg"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-medium text-gray-900 outline-none focus:border-emerald-500 focus:bg-white text-sm"
                  />
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setStep('service')}
                    className="flex items-center justify-center gap-1 rounded-2xl border border-gray-200 py-3.5 px-5 font-bold text-gray-600 hover:bg-gray-50 text-sm"
                  >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 px-6 font-bold text-white shadow-lg shadow-emerald-900/10 hover:bg-emerald-700 disabled:opacity-60 transition-colors text-sm"
                  >
                    {loading ? 'Cadastrando...' : 'Adicionar produto'} <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* STEP 5: PREVIEW */}
        {step === 'preview' && (
          <div className="text-center py-2">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-50 text-amber-600 shadow-inner">
              <Eye className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
              Sua loja já está tomando forma! 🎉
            </h2>
            <p className="mt-3 text-sm text-gray-500 font-medium leading-relaxed">
              Agora veja como seus clientes enxergarão seu cardápio online.
            </p>

            <div className="mt-8 space-y-3">
              <button
                onClick={openStorefront}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 px-6 font-bold text-white shadow-xl shadow-emerald-900/10 hover:bg-emerald-700 transition-colors"
              >
                <Eye className="h-5 w-5" /> Visualizar minha loja real
              </button>

              <button
                onClick={() => saveProgress('complete')}
                className="w-full rounded-2xl border border-gray-200 py-3.5 px-6 font-bold text-gray-700 hover:bg-gray-50 transition-colors text-sm"
              >
                Avançar para finalização
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: COMPLETE */}
        {step === 'complete' && (
          <div className="text-center py-2">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 shadow-inner">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">
              Tudo pronto para começar! ✨
            </h2>
            <p className="mt-3 text-sm text-gray-500 font-medium leading-relaxed">
              Sua loja já está configurada com o básico. No dashboard você encontrará um checklist para continuar personalizando seus horários, endereço e pagamentos.
            </p>

            <div className="mt-8">
              <button
                onClick={handleComplete}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 px-6 font-bold text-white shadow-xl shadow-emerald-900/10 hover:bg-emerald-700 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Finalizando...' : 'Ir para o painel principal'} <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
