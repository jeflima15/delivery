import React from 'react';
import { CheckCircle2, Circle, ArrowRight, Sparkles } from 'lucide-react';

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
      description: 'Nome visível para seus clientes na vitrine.',
      completed: !!settings?.nome_loja && !['Stitch Delivery', 'Minha Loja'].includes(settings.nome_loja),
      target: 'aparencia',
      actionLabel: 'Editar nome',
    },
    {
      id: 'service_options',
      title: 'Forma de atendimento',
      description: 'Defina se atende por Entrega, Retirada ou ambos.',
      completed: allowDelivery || allowPickup,
      target: 'entrega_pagamento',
      actionLabel: 'Configurar logística',
    },
    {
      id: 'first_product',
      title: 'Primeiro produto',
      description: 'Cadastre pelo menos 1 item com preço no cardápio.',
      completed: (metrics?.products || 0) > 0,
      target: 'produtos',
      actionLabel: 'Cadastrar produto',
    },
    {
      id: 'payments',
      title: 'Meios de pagamento',
      description: 'Escolha como receber (Pix, Cartão ou Dinheiro).',
      completed: !!(settings?.pagamento_pix || settings?.pagamento_cartao || settings?.pagamento_dinheiro),
      target: 'entrega_pagamento',
      actionLabel: 'Configurar pagamentos',
    },
  ];

  // Conditional delivery items
  if (allowDelivery) {
    items.push({
      id: 'address',
      title: 'Endereço da loja',
      description: 'Necessário para calcular entregas e rotas.',
      completed: !!(settings?.rua_loja || settings?.cep_loja),
      target: 'operacao',
      actionLabel: 'Configurar endereço',
    });
    items.push({
      id: 'delivery_fees',
      title: 'Taxas de entrega',
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
      description: 'Configure os dias e horas que a loja opera.',
      completed: !!(settings?.horarios_funcionamento && Object.values(settings.horarios_funcionamento).some((d: any) => d?.aberto)),
      target: 'operacao',
      actionLabel: 'Configurar horários',
    },
    {
      id: 'appearance',
      title: 'Personalizar aparência',
      description: 'Adicione logo, capa ou mensagem sobre sua loja.',
      completed: !!(settings?.logo_url || settings?.capa_url || settings?.sobre_texto),
      target: 'aparencia',
      actionLabel: 'Personalizar loja',
    }
  );

  const completedCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  // If 100% completed, don't show or show condensed badge
  if (completedCount === totalCount) return null;

  return (
    <section className="rounded-[2.5rem] border border-emerald-100 bg-emerald-50/50 p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-black">
              ✓
            </span>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">
              Checklist do Piloto
            </p>
          </div>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-gray-900">
            Complete a configuração da sua loja ({completedCount} de {totalCount})
          </h3>
          <p className="mt-1 text-sm text-gray-600 font-medium">
            Siga os passos abaixo para deixar seu atendimento 100% pronto para clientes reais.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="flex flex-col items-end gap-1">
            <span className="text-sm font-black text-emerald-800">{progressPercent}% concluído</span>
            <div className="h-3 w-36 overflow-hidden rounded-full bg-emerald-200">
              <div
                className="h-full bg-emerald-600 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          {onOpenWizard && (
            <button
              onClick={onOpenWizard}
              className="flex items-center gap-1.5 rounded-2xl bg-white border border-emerald-200 px-4 py-3 text-xs font-black text-emerald-700 shadow-sm hover:bg-emerald-100 transition-colors"
            >
              <Sparkles className="h-4 w-4" /> Abrir assistente
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex flex-col justify-between rounded-3xl border p-5 transition-all ${
              item.completed
                ? 'border-emerald-200/70 bg-emerald-100/30'
                : 'border-gray-200 bg-white shadow-sm hover:border-emerald-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                {item.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300 shrink-0" />
                )}
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    item.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {item.completed ? 'Pronto' : 'Pendente'}
                </span>
              </div>
              <h4 className={`text-sm font-black ${item.completed ? 'text-emerald-950 line-through opacity-80' : 'text-gray-900'}`}>
                {item.title}
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{item.description}</p>
            </div>

            {!item.completed && (
              <button
                onClick={() => navigateTo(item.target)}
                className="mt-4 flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 shadow-sm"
              >
                {item.actionLabel} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
