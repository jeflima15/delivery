import { z } from 'zod';
import { preorderSettingsSchema } from './preorderScheduling';

export const salesModes = [
  { value: 'immediate_only', label: 'Pedidos para agora', description: 'Você prepara após receber o pedido, para entrega ou retirada.' },
  { value: 'scheduled_only', label: 'Somente por encomenda', description: 'O cliente escolhe uma data futura, respeitando seu prazo de preparo.' },
  { value: 'both', label: 'Os dois', description: 'Você vende para agora e também aceita encomendas.' },
] as const;
export const onboardingDraftSchema = z.object({
  mode: z.enum(['', 'immediate_only', 'scheduled_only', 'both']),
  name: z.string().max(100), phone: z.string().max(30),
  service: z.enum(['', 'pickup', 'delivery', 'both']),
  street: z.string().max(200), number: z.string().max(30), city: z.string().max(120),
  neighborhood: z.string().max(120), state: z.string().max(2), cep: z.string().max(12),
  shipping: z.string().max(20), estimate: z.string().max(80), leadDays: z.string().max(20),
  days: z.array(z.number().int().min(0).max(6)).max(7), start: z.string().max(5), end: z.string().max(5),
  scheduleDays: z.array(z.number().int().min(0).max(6)).max(7), scheduleStart: z.string().max(5), scheduleEnd: z.string().max(5),
  pix: z.boolean(), cash: z.boolean(), card: z.boolean(), pixKey: z.string().max(300),
  deposit: z.enum(['', '0', '25', '30', '50', '100']),
  productName: z.string().max(200).default(''), productPrice: z.string().max(20).default(''),
  productMode: z.enum(['inherit', 'immediate_only', 'scheduled_only', 'both']).default('inherit'),
}).strict();
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;
export const weekKeys = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
export const weekLabels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const setupSteps = ['Seu jeito de vender', 'Entrega ou retirada', 'Horários e prazos', 'Pagamentos', 'Primeiro produto', 'Conferência'];

export function initialOnboardingDraft(settings: Record<string, any> = {}): OnboardingDraft {
  const agenda = settings.preorderDraft;
  return { mode: settings.preorderEnabled ? agenda?.salesMode || '' : '', name: settings.nome_loja === 'Minha Loja' ? '' : settings.nome_loja || '', phone: settings.whatsapp || settings.telefone || '',
    service: '', street: settings.rua_loja || '', number: settings.numero_loja || '', city: settings.cidade_loja || '', neighborhood: settings.bairro_loja || '', state: settings.estado_loja || '', cep: settings.cep_loja || '',
    shipping: settings.tipo_taxa_entrega === 'fixa' ? String(settings.taxa_entrega_fixa ?? '') : '', estimate: '', leadDays: agenda ? String(agenda.minLeadMinutes / 1440) : '',
    days: [], start: '', end: '', scheduleDays: [], scheduleStart: '', scheduleEnd: '', pix: false, cash: false, card: false, pixKey: settings.chave_pix || '', deposit: '', productName: '', productPrice: '', productMode: 'inherit',
  };
}
export function onboardingStepError(d: OnboardingDraft, step: number): string | null {
  if (step === 0 && (!d.mode || d.name.trim().length < 2 || d.phone.replace(/\D/g, '').length < 10)) return 'Escolha seu jeito de vender e informe o nome e WhatsApp da loja.';
  if (step === 1 && (!d.service || !d.street.trim() || !d.number.trim() || !d.city.trim())) return 'Escolha entrega ou retirada e informe rua, número e cidade da loja.';
  if (step === 1 && d.service !== 'pickup' && (!d.shipping.trim() || !Number.isFinite(Number(d.shipping.replace(',', '.'))) || Number(d.shipping.replace(',', '.')) < 0)) return 'Informe a taxa de entrega. Use zero se a entrega for gratuita.';
  if (step === 2) {
    if (d.mode !== 'scheduled_only' && (!d.days.length || !/^\d{2}:\d{2}$/.test(d.start) || !/^\d{2}:\d{2}$/.test(d.end) || d.start === d.end || !d.estimate.trim())) return 'Informe os dias, horários e a previsão para pedidos imediatos.';
    if (d.mode !== 'immediate_only') {
      const lead = Number(d.leadDays) * 1440;
      if (!d.leadDays.trim() || !Number.isInteger(lead) || lead < 0 || lead > 43200 || !d.scheduleDays.length || !/^\d{2}:\d{2}$/.test(d.scheduleStart) || !/^\d{2}:\d{2}$/.test(d.scheduleEnd) || d.scheduleStart >= d.scheduleEnd) return 'Informe antecedência de zero a 30 dias e uma faixa de entrega/retirada que termine após o início.';
      if (!preorderSettingsSchema.safeParse({ minLeadMinutes: lead, weeklySchedule: d.scheduleDays.map((weekday) => ({ weekday, intervals: [{ start: d.scheduleStart, end: d.scheduleEnd }] })) }).success) return 'Confira os horários da agenda.';
      const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
      if (minutes(d.scheduleEnd) - minutes(d.scheduleStart) < 60) return 'Escolha uma faixa de pelo menos uma hora para oferecer um horário de encomenda.';
    }
  }
  if (step === 3 && (!d.pix && !d.cash && !d.card)) return 'Escolha pelo menos uma forma de pagamento.';
  if (step === 3 && d.pix && !d.pixKey.trim()) return 'Informe sua chave PIX.';
  if (step === 3 && d.mode !== 'immediate_only' && !d.deposit) return 'Escolha se você exige sinal.';
  if (step === 3 && d.mode !== 'immediate_only' && Number(d.deposit) > 0 && (!d.pix || !d.pixKey.trim())) return 'Habilite PIX e informe a chave para receber o sinal.';
  return null;
}
export function onboardingSettings(d: OnboardingDraft, current: Record<string, any>) {
  const scheduling = d.mode !== 'immediate_only';
  return {
    expectedSettingsUpdatedAt: current.updatedAt || null,
    nome_loja: d.name.trim(), whatsapp: d.phone.trim(),
    logisticsOptions: { allowPickup: d.service !== 'delivery', allowDelivery: d.service !== 'pickup', allowDineIn: false },
    rua_loja: d.street.trim(), numero_loja: d.number.trim(), cidade_loja: d.city.trim(), bairro_loja: d.neighborhood, estado_loja: d.state.toUpperCase(), cep_loja: d.cep,
    ...(d.service !== 'pickup' ? { tipo_taxa_entrega: 'fixa', taxa_entrega_fixa: Number(d.shipping.replace(',', '.')) } : {}),
    abertura_automatica: d.mode !== 'scheduled_only',
    ...(d.mode !== 'scheduled_only' ? { tempo_entrega: d.estimate, horarios_funcionamento: Object.fromEntries(weekKeys.map((key, index) => [key, { aberto: d.days.includes(index), inicio: d.start, fim: d.end }])) } : {}),
    pagamento_pix: d.pix, chave_pix: d.pixKey.trim(), pagamento_dinheiro: d.cash, pagamento_cartao: d.card, pagamento_cartao_credito: d.card, pagamento_cartao_debito: d.card,
    pagamento_vale_alimentacao: false, pagamento_vale_refeicao: false,
    preorderEnabled: scheduling,
    ...(scheduling ? { preorderDraft: preorderSettingsSchema.parse({ ...current.preorderDraft, salesMode: d.mode, acceptingPreorders: true, minLeadMinutes: Number(d.leadDays) * 1440, maxAdvanceDays: Math.max(30, current.preorderDraft?.maxAdvanceDays || 30), depositPercent: Number(d.deposit), weeklySchedule: d.scheduleDays.map((weekday) => ({ weekday, intervals: [{ start: d.scheduleStart, end: d.scheduleEnd }] })) }) } : {}),
  };
}
