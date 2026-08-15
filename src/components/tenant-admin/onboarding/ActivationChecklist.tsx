import React from 'react';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
  Store,
  Truck,
  Package,
  CreditCard,
  MapPin,
  Clock3,
  Palette,
  DollarSign,
} from 'lucide-react';

type Props = {
  payload: any;
  navigateTo: (target: string) => void;
  onOpenWizard?: () => void;
};

export default function ActivationChecklist({ payload, navigateTo, onOpenWizard }: Props) {
  if (!payload) return null;

  const { metrics = {}, settings = {} } = payload;
  const allowDelivery = settings?.logisticsOptions?.allowDelivery !== false;
  const allowPickup = settings?.logisticsOptions?.allowPickup !== false;

  const items = [
    {
      id: 'store_name',
      title: 'Nome da loja',
      icon: Store,
      description: 'Nome visível para seus clientes na vitrine.',
      completed: !!settings?.nome_loja && !['Stitch Delivery', 'Minha Loja'].includes(settings.nome_loja),
      target: 'aparencia',
      actionLabel: 'Editar nome',
    },
    {
      id: 'service_options',
      title: 'Forma de atendimento',
      icon: Truck,
      description: 'Defina se atende por Entrega, Retirada ou ambos.',
      completed: allowDelivery || allowPickup,
      target: 'entrega_pagamento',
      actionLabel: 'Configurar logística',
    },
    {
      id: 'first_product',
      title: 'Primeiro produto',
      icon: Package,
      description: 'Cadastre pelo menos 1 item com preço no cardápio.',
      completed: (metrics?.products || 0) > 0,
      target: 'produtos',
      actionLabel: 'Cadastrar produto',
    },
    {
      id: 'payments',
      title: 'Meios de pagamento',
      icon: CreditCard,
      description: 'Escolha como receber (Pix, Cartão, Dinheiro ou Vale).',
      completed: !!(settings?.pagamento_pix || settings?.pagamento_cartao || settings?.pagamento_dinheiro || settings?.pagamento_vale_alimentacao || settings?.pagamento_vale_refeicao),
      target: 'entrega_pagamento',
      actionLabel: 'Configurar pagamentos',
    },
  ];

  // Conditional delivery items
  if (allowDelivery) {
    items.push({
      id: 'address',
      title: 'Endereço da loja',
      icon: MapPin,
      description: 'Necessário para calcular entregas e rotas.',
      completed: !!(settings?.rua_loja || settings?.cep_loja),
      target: 'operacao',
      actionLabel: 'Configurar endereço',
    });
    items.push({
      id: 'delivery_fees',
      title: 'Taxas de entrega',
      icon: DollarSign,
      description: 'Defina as faixas por KM ou taxa fixa de frete.',
      completed: !!(settings?.faixas_entrega && settings.faixas_entrega.length > 0) || !!settings?.frete_gratis_acima_de,
      target: 'entrega_pagamento',
      actionLabel: 'Configurar frete',
    });
  }

  items.push(
    {
      id: 'hours',
      title: 'Horário de funcionamento',
      icon: Clock3,
      description: 'Configure os dias e horas que a loja opera.',
      completed: !!(settings?.horarios_funcionamento && Object.values(settings.horarios_funcionamento).some((d: any) => d?.aberto)),
      target: 'operacao',
      actionLabel: 'Configurar horários',
    },
    {
      id: 'appearance',
      title: 'Personalizar aparência',
      icon: Palette,
      description: 'Adicione logo, capa ou mensagem sobre sua loja.',
      completed: !!(settings?.logo_url || settings?.capa_url || settings?.sobre_texto),
      target: 'aparencia',
      actionLabel: 'Personalizar loja',
    }
  );

  const completedCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  // If 100% completed, don't show
  if (completedCount === totalCount) return null;

  return (
    <section className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-amber-200/60 pb-3.5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white shadow-xs">
              !
            </span>
            <p className="text-xs font-bold text-amber-950">
              Checklist de ativação da loja ({completedCount} de {totalCount})
            </p>
          </div>
          <p className="mt-0.5 text-xs text-amber-800/90 font-medium">
            Conclua as configurações iniciais para deixar a loja pronta para receber pedidos reais.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-bold text-amber-950">{progressPercent}% concluído</span>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-amber-200/70">
              <div
                className="h-full bg-amber-600 transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          {onOpenWizard && (
            <button
              onClick={onOpenWizard}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/90 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-xs transition-colors hover:bg-amber-100/60 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-600" /> Assistente
            </button>
          )}
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                item.completed
                  ? 'border-emerald-200/70 bg-emerald-50/40'
                  : 'border-slate-200/90 bg-white shadow-xs hover:border-slate-300'
              }`}
            >
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                        item.completed
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.completed ? 'bg-emerald-100/90 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.completed ? 'Pronto' : 'Pendente'}
                    </span>
                  </div>
                  {item.completed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                  )}
                </div>

                <h4 className={`text-xs font-semibold ${item.completed ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                  {item.title}
                </h4>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{item.description}</p>
              </div>

              {!item.completed && (
                <button
                  type="button"
                  onClick={() => navigateTo(item.target)}
                  className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 cursor-pointer"
                >
                  {item.actionLabel} <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

