import React, { useState } from 'react';
import {
  Rocket,
  Store,
  Truck,
  Package,
  CreditCard,
  Clock,
  MapPin,
  Eye,
  CheckCircle2,
  Circle,
  ArrowRight,
  ExternalLink,
  Sparkles,
  PartyPopper,
  X,
} from 'lucide-react';

export interface ActivationChecklistProps {
  payload: any;
  navigateTo: (target: string) => void;
  slug?: string;
  onDismiss?: () => void;
  onOpenWizard?: () => void;
}

export default function ActivationChecklist({
  payload,
  navigateTo,
  slug,
  onDismiss,
  onOpenWizard,
}: ActivationChecklistProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!payload || dismissed) return null;

  const { metrics = {}, settings = {} } = payload;
  const allowDelivery = settings?.logisticsOptions?.allowDelivery !== false;
  const allowPickup = settings?.logisticsOptions?.allowPickup !== false;

  const storeUrl = slug ? `/${encodeURIComponent(slug)}` : '/';

  // 1. As 4 Missões Essenciais (Core)
  const coreMissions = [
    {
      id: 'store_identity',
      title: '1. Identidade e Visual',
      icon: Store,
      description: 'Nome da loja, WhatsApp de pedidos e fotos de capa e logo.',
      completed: Boolean(
        settings?.nome_loja &&
        !['Stitch Delivery', 'Minha Loja'].includes(settings.nome_loja) &&
        (settings?.logo_url || settings?.capa_url || settings?.sobre_texto)
      ),
      target: 'aparencia',
      actionLabel: 'Configurar visual',
    },
    {
      id: 'logistics',
      title: '2. Entrega e Logística',
      icon: Truck,
      description: 'Defina se faz Delivery ou Retirada e configure as taxas de frete.',
      completed: Boolean(
        (allowDelivery || allowPickup) &&
        (allowDelivery ? (!!(settings?.faixas_entrega?.length) || !!settings?.frete_gratis_acima_de) : true)
      ),
      target: 'entrega_pagamento',
      actionLabel: 'Configurar entrega',
    },
    {
      id: 'first_product',
      title: '3. Primeiro Produto',
      icon: Package,
      description: 'Cadastre pelo menos 1 item com preço e foto no cardápio.',
      completed: (metrics?.products || 0) > 0,
      target: 'produtos',
      actionLabel: 'Cadastrar produto',
    },
    {
      id: 'payments',
      title: '4. Meios de Pagamento',
      icon: CreditCard,
      description: 'Informe sua Chave Pix e as formas de pagamento aceitas.',
      completed: Boolean(
        (settings?.pagamento_pix && settings?.chave_pix) ||
        settings?.pagamento_cartao ||
        settings?.pagamento_dinheiro
      ),
      target: 'entrega_pagamento',
      actionLabel: 'Configurar pagamentos',
    },
  ];

  // 2. Linha Secundária de Ajustes Rápidos
  const secondaryItems = [
    {
      id: 'hours',
      title: 'Horário de Funcionamento',
      icon: Clock,
      description: 'Configure os dias e horários de atendimento da loja.',
      completed: Boolean(
        settings?.horarios_funcionamento &&
        Object.values(settings.horarios_funcionamento).some((d: any) => d?.aberto)
      ),
      target: 'operacao',
      actionLabel: 'Configurar horários',
      type: 'navigate' as const,
    },
    {
      id: 'address',
      title: 'Endereço da Loja',
      icon: MapPin,
      description: 'Endereço base para cálculo de entregas e retirada física.',
      completed: Boolean(settings?.rua_loja || settings?.cep_loja),
      target: 'operacao',
      actionLabel: 'Configurar endereço',
      type: 'navigate' as const,
    },
    {
      id: 'preview_store',
      title: 'Visualizar Loja Real',
      icon: Eye,
      description: 'Veja como os clientes visualizam seu cardápio e vitrine.',
      completed: false,
      target: storeUrl,
      actionLabel: 'Abrir vitrine',
      type: 'external' as const,
    },
  ];

  const completedCoreCount = coreMissions.filter((m) => m.completed).length;
  const totalCoreCount = coreMissions.length;
  const progressPercent = Math.round((completedCoreCount / totalCoreCount) * 100);
  const isAllCoreCompleted = completedCoreCount === totalCoreCount;

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) {
      onDismiss();
    }
  };

  // Card comemorativo quando 100% concluído
  if (isAllCoreCompleted) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50/40 to-white p-5 shadow-xs transition-all">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm ring-4 ring-emerald-100">
              <PartyPopper className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                🎉 Parabéns! Sua loja está 100% configurada e pronta para vender!
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Todas as configurações essenciais foram preenchidas com sucesso. Sua vitrine já está pronta para receber pedidos reais.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-end md:self-center">
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 active:scale-95"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir Minha Loja
            </a>
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
            >
              <X className="h-3.5 w-3.5 text-slate-400" />
              Ocultar
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all">
      {/* 1. Header */}
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Missões Iniciais da Loja
              </h2>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/60">
                {completedCoreCount} de {totalCoreCount} concluídas
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Complete as configurações essenciais nas telas reais do sistema para colocar sua loja no ar e receber pedidos reais.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-bold text-slate-700">{progressPercent}% concluído</span>
            <div className="h-2 w-32 md:w-40 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/50">
              <div
                className="h-full bg-emerald-600 transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          {onOpenWizard && (
            <button
              type="button"
              onClick={onOpenWizard}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 cursor-pointer"
              title="Abrir assistente passo a passo"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span className="hidden sm:inline">Assistente</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Grid de 4 Missões Essenciais */}
      <div className="mt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {coreMissions.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                  item.completed
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 shadow-xs'
                }`}
              >
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        item.completed
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-white border border-slate-200/80 text-slate-600'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    {item.completed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Concluído
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        <Circle className="h-3 w-3 text-slate-400" />
                        Pendente
                      </span>
                    )}
                  </div>

                  <h3
                    className={`text-xs font-bold ${
                      item.completed ? 'text-slate-700' : 'text-slate-900'
                    }`}
                  >
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    {item.description}
                  </p>
                </div>

                <div className="mt-4 pt-2">
                  {item.completed ? (
                    <button
                      type="button"
                      onClick={() => navigateTo(item.target)}
                      className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-emerald-200/80 bg-white/80 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100/60 cursor-pointer"
                    >
                      Revisar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigateTo(item.target)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 cursor-pointer active:scale-98"
                    >
                      {item.actionLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Linha Secundária de Ajustes Rápidos */}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
            Ajustes Complementares
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {secondaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                  item.completed
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 shadow-xs'
                }`}
              >
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        item.completed
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-white border border-slate-200/80 text-slate-600'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    {item.type === 'external' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200/60">
                        Ao vivo
                      </span>
                    ) : item.completed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        Concluído
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        <Circle className="h-2.5 w-2.5 text-slate-400" />
                        Pendente
                      </span>
                    )}
                  </div>
                  <h4 className={`text-xs font-bold ${item.completed ? 'text-slate-700' : 'text-slate-900'}`}>
                    {item.title}
                  </h4>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    {item.description}
                  </p>
                </div>

                <div className="mt-3 pt-1">
                  {item.type === 'external' ? (
                    <a
                      href={item.target}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                    >
                      {item.actionLabel}
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                    </a>
                  ) : item.completed ? (
                    <button
                      type="button"
                      onClick={() => navigateTo(item.target)}
                      className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-emerald-200/80 bg-white/80 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100/60 cursor-pointer"
                    >
                      Revisar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigateTo(item.target)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 cursor-pointer active:scale-98"
                    >
                      {item.actionLabel}
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
