import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  ClipboardList,
  Gift,
  Menu,
  Palette,
  SlidersHorizontal,
  Store,
  Truck,
  Sparkles,
  X,
} from 'lucide-react';
import PodeVirBrand from '../brand/PodeVirBrand';
import { platformBrand } from '../../config/brand';

const pilotSlug = import.meta.env.VITE_DEFAULT_TENANT_SLUG || 'loja-piloto';

const benefits = [
  {
    icon: Store,
    title: 'Loja própria por link',
    text: 'Seu cliente acessa uma vitrine com a identidade do seu estabelecimento, sem precisar instalar aplicativo.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Cardápio completo',
    text: 'Organize produtos, categorias, adicionais, disponibilidade e preços pelo painel.',
  },
  {
    icon: ClipboardList,
    title: 'Pedidos organizados',
    text: 'Receba pedidos e acompanhe cada etapa da operação em um único lugar.',
  },
  {
    icon: Truck,
    title: 'Delivery e retirada',
    text: 'Configure como sua loja atende e defina as regras da operação.',
  },
  {
    icon: Palette,
    title: 'Sua marca na frente',
    text: 'Personalize cores, imagens e informações para deixar a experiência com a cara do seu negócio.',
  },
  {
    icon: Gift,
    title: 'Clientes e relacionamento',
    text: 'Histórico, cupons, promoções e fidelidade ajudam a manter o relacionamento depois do primeiro pedido.',
  },
];

const faqs = [
  [
    'Meu cliente precisa instalar aplicativo?',
    'Não. A loja funciona diretamente pelo navegador através de um link próprio, sem barreiras de instalação para o cliente.',
  ],
  [
    'Preciso comprar outro domínio?',
    'Não. Cada estabelecimento recebe seu próprio endereço dentro da Pode Vir e pode compartilhar esse link diretamente nas redes sociais ou WhatsApp.',
  ],
  [
    'Posso trabalhar com entrega e retirada?',
    'Sim. A loja pode configurar quais modalidades de atendimento estão disponíveis (delivery, retirada no balcão ou ambos).',
  ],
  [
    'Como o cliente realiza o pagamento?',
    'Os pagamentos são combinados diretamente com a sua loja: dinheiro (com cálculo de troco), cartão na entrega/retirada ou chave PIX configurada pelo estabelecimento.',
  ],
  [
    'Já posso contratar a Pode Vir?',
    'A plataforma está em fase piloto com estabelecimentos reais e ainda não possui cadastro público ou contratação comercial aberta.',
  ],
];

export default function PlatformLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const storeUrl = `/${pilotSlug}`;
  const adminUrl = '/login';

  useEffect(() => {
    document.title = 'Pode Vir | Cardápio, pedidos e gestão para sua loja';
    const description = platformBrand.description;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f7f2] text-[#14231d]">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-black/5 bg-[#f6f7f2]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <a href="#inicio" className="flex items-center gap-3">
            <PodeVirBrand size="md" />
          </a>

          <nav className="hidden items-center gap-8 text-sm font-bold text-[#526159] md:flex">
            <a className="transition hover:text-[#0b7a53]" href="#recursos">
              Recursos
            </a>
            <a className="transition hover:text-[#0b7a53]" href="#posicionamento">
              Sua Marca
            </a>
            <a className="transition hover:text-[#0b7a53]" href="#como-funciona">
              Como funciona
            </a>
            <a className="transition hover:text-[#0b7a53]" href="#piloto">
              Piloto
            </a>
            <a className="transition hover:text-[#0b7a53]" href="#duvidas">
              Dúvidas
            </a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href={adminUrl}
              className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-xs font-bold text-[#14231d] transition hover:border-[#0b7a53]/40"
            >
              Acesso do lojista
            </a>
            <a
              href={storeUrl}
              className="flex items-center gap-2 rounded-xl bg-[#0b7a53] px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:bg-[#096744]"
            >
              Ver demonstração <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <button
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className="grid h-11 w-11 place-items-center rounded-xl border border-black/10 bg-white md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <nav className="border-t border-black/5 bg-white px-5 py-5 md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-1">
              {[
                ['Recursos', '#recursos'],
                ['Sua Marca', '#posicionamento'],
                ['Como funciona', '#como-funciona'],
                ['Piloto', '#piloto'],
                ['Dúvidas', '#duvidas'],
              ].map(([label, href]) => (
                <a
                  key={href}
                  onClick={() => setMenuOpen(false)}
                  href={href}
                  className="rounded-xl px-4 py-3 text-sm font-bold hover:bg-[#edf7f1]"
                >
                  {label}
                </a>
              ))}
              <div className="mt-3 flex flex-col gap-2">
                <a
                  href={storeUrl}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#0b7a53] px-4 py-3 text-sm font-bold text-white"
                >
                  Ver demonstração <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href={adminUrl}
                  className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-bold text-[#14231d]"
                >
                  Acesso do lojista
                </a>
              </div>
            </div>
          </nav>
        )}
      </header>

      {/* HERO SECTION */}
      <section id="inicio" className="relative isolate overflow-hidden px-5 pb-24 pt-16 sm:px-8 sm:pt-24 lg:px-10 lg:pb-32">
        <div className="absolute -right-44 top-12 -z-10 h-[34rem] w-[34rem] rounded-full bg-[#cdebd9] blur-3xl" />
        <div className="absolute -left-56 bottom-0 -z-10 h-80 w-80 rounded-full bg-[#f4c77c]/35 blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#0b7a53]/20 bg-white/80 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#0b7a53]">
              <span className="h-2 w-2 rounded-full bg-[#0b7a53] animate-pulse" />
              {platformBrand.badgeText}
            </span>

            <h1 className="mt-7 text-5xl font-black leading-[.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Sua loja online.<br />
              <span className="text-[#0b7a53]">Seus pedidos no controle.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#5f6d65] sm:text-xl">
              {platformBrand.description}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href={storeUrl}
                className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-[#0b7a53] px-8 font-black text-white shadow-xl shadow-emerald-900/15 transition hover:-translate-y-1 hover:bg-[#096744]"
              >
                Ver demonstração <ArrowRight className="h-5 w-5" />
              </a>
              <a
                href={adminUrl}
                className="flex h-14 items-center justify-center gap-3 rounded-2xl border border-black/10 bg-white px-8 font-black transition hover:-translate-y-1 hover:border-[#0b7a53]/30"
              >
                Acesso do lojista
              </a>
            </div>

            <p className="mt-5 text-xs font-semibold text-[#7c8982]">
              A Pode Vir está em fase piloto com estabelecimentos reais. Cadastro público e planos comerciais serão disponibilizados futuramente.
            </p>
          </div>

          {/* SIMULADOR DO PAINEL OPERACIONAL */}
          <div className="relative mx-auto w-full max-w-xl lg:mx-0">
            <div className="absolute -inset-5 -z-10 rotate-2 rounded-[2.5rem] bg-[#0b7a53] opacity-10" />
            <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_35px_90px_-35px_rgba(20,35,29,.35)]">
              <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
                <div className="flex items-center gap-3">
                  <PodeVirBrand variant="icon" size="sm" />
                  <div>
                    <strong className="block text-sm text-slate-900 font-bold">Pode Vir — Operação</strong>
                    <small className="text-[#839088]">Jeffs Burgueria · Painel ao vivo</small>
                  </div>
                </div>
                <span className="rounded-full bg-[#e5f7ec] px-3 py-1 text-xs font-bold text-[#0b7a53]">
                  Loja aberta
                </span>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-3">
                {[
                  ['Fila de Pedidos', 'Ao vivo'],
                  ['Cardápio', '100% ativo'],
                  ['Operação', 'Organizada'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-[#f6f7f2] p-4">
                    <small className="text-[#7b8981] font-medium">{label}</small>
                    <strong className="mt-1 block text-base font-bold text-slate-900">{value}</strong>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 px-5 pb-5 sm:grid-cols-[1fr_.8fr]">
                <div className="rounded-2xl border border-black/5 p-4">
                  <div className="flex items-center justify-between">
                    <strong className="text-sm font-bold text-slate-900">Acompanhamento</strong>
                    <span className="text-xs font-bold text-[#0b7a53]">Status real</span>
                  </div>
                  <div className="mt-4 space-y-2.5">
                    {[
                      { name: 'Novo pedido #104', status: 'Aguardando', color: 'bg-amber-400' },
                      { name: 'Pedido #103', status: 'Em preparo', color: 'bg-emerald-500' },
                      { name: 'Pedido #102', status: 'Concluído', color: 'bg-[#0b7a53]' },
                    ].map((order) => (
                      <div
                        key={order.name}
                        className="flex items-center justify-between rounded-xl bg-[#f6f7f2] px-3 py-2.5"
                      >
                        <div>
                          <span className="block text-xs font-bold text-slate-900">{order.name}</span>
                          <span className="text-[10px] text-slate-500">{order.status}</span>
                        </div>
                        <span className={`h-2.5 w-2.5 rounded-full ${order.color}`} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#14231d] p-4 text-white flex flex-col justify-between">
                  <div>
                    <small className="text-white/60 font-medium">Conexão total</small>
                    <strong className="mt-1 block text-sm font-bold text-emerald-400">Vitrine + Operação</strong>
                    <p className="mt-2 text-xs text-white/50 leading-relaxed">
                      Seu cliente pede pela vitrine com a sua marca e sua equipe gerencia tudo em um só lugar.
                    </p>
                  </div>
                  <div className="mt-4 flex h-14 items-end gap-1.5">
                    {[40, 65, 50, 85, 60, 95, 75].map((h, i) => (
                      <span
                        key={i}
                        className="flex-1 rounded-t bg-emerald-400"
                        style={{ height: `${h}%`, opacity: 0.5 + i * 0.07 }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RECURSOS PRINCIPAIS */}
      <section id="recursos" className="bg-[#14231d] px-5 py-24 text-white sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[.22em] text-emerald-400">Recursos</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">
              Tudo que sua loja precisa para vender e operar melhor.
            </h2>
            <p className="mt-5 text-lg leading-8 text-white/60">
              Uma estrutura simples e completa para conectar a experiência do seu cliente à rotina do seu estabelecimento.
            </p>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden rounded-[2rem] bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map(({ icon: Icon, title, text }) => (
              <article key={title} className="bg-[#14231d] p-7 transition hover:bg-white/[.04] sm:p-8">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-6 text-lg font-black">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/55">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* BLOCO DE POSICIONAMENTO DA MARCA */}
      <section id="posicionamento" className="px-5 py-24 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="overflow-hidden rounded-[2.5rem] border border-black/5 bg-white p-8 shadow-sm sm:p-12 lg:p-16">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#0b7a53]/20 bg-[#edf7f1] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#0b7a53]">
                  <Sparkles className="h-4 w-4" />
                  Filosofia Pode Vir
                </span>
                <h2 className="mt-6 text-4xl font-black tracking-[-0.04em] text-slate-900 sm:text-5xl">
                  Sua marca na frente.<br />
                  <span className="text-[#0b7a53]">A Pode Vir nos bastidores.</span>
                </h2>
                <p className="mt-6 text-base leading-8 text-[#5f6d65] sm:text-lg">
                  Ao contrário de marketplaces genéricos onde sua loja compete com dezenas de estabelecimentos, na <strong>Pode Vir</strong> a sua identidade é o centro de tudo.
                </p>
                <ul className="mt-8 space-y-4">
                  {[
                    'Vitrine 100% personalizada com as cores e imagens da sua loja',
                    'Link próprio exclusivo para compartilhar com seus clientes',
                    'Seu cliente compra sem distrações e sem instalar aplicativo',
                    'Controle total da sua operação, pedidos e base de clientes',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm font-bold text-slate-800">
                      <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-[#edf7f1] text-[#0b7a53]">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl bg-[#14231d] p-8 text-white">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Experiência do Cliente</span>
                  <span className="text-xs text-white/50">Link da Loja</span>
                </div>
                <div className="mt-6 rounded-2xl bg-white/5 p-5 border border-white/10">
                  <p className="text-xs text-white/60 uppercase font-semibold">O que o cliente vê:</p>
                  <p className="mt-2 text-lg font-black text-white">
                    podevir.com.br/<span className="text-emerald-400 font-mono">sua-loja</span>
                  </p>
                  <p className="mt-3 text-xs text-white/70 leading-relaxed">
                    Sua marca, seu logotipo, seu cardápio e seu atendimento. A Pode Vir entra como a tecnologia discreta que garante velocidade e organização nos bastidores.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="bg-[#f6f7f2] px-5 py-24 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[.22em] text-[#0b7a53]">Como funciona</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">
                Simplicidade da configuração ao pedido.
              </h2>
              <p className="mt-5 text-lg leading-8 text-[#647169]">
                Um fluxo direto, pensado para colocar seu estabelecimento no ar sem transformar a operação em um projeto técnico complexo.
              </p>
            </div>

            <ol className="space-y-4">
              {[
                ['01', 'Configure sua loja', 'Adicione sua identidade visual, produtos, categorias e formas de atendimento pelo painel.'],
                ['02', 'Compartilhe seu link', 'Seus clientes acessam a vitrine diretamente pelo navegador no seu endereço exclusivo.'],
                ['03', 'Receba e acompanhe pedidos', 'Os pedidos entram no painel para sua equipe acompanhar e operar cada etapa com tranquilidade.'],
              ].map(([number, title, text]) => (
                <li
                  key={number}
                  className="grid gap-4 rounded-3xl border border-black/5 bg-white p-6 shadow-sm sm:grid-cols-[70px_1fr_auto] sm:items-center"
                >
                  <span className="text-3xl font-black text-[#0b7a53]/35">{number}</span>
                  <span>
                    <strong className="block text-lg text-slate-900 font-bold">{title}</strong>
                    <small className="mt-1 block text-sm leading-6 text-[#69766e]">{text}</small>
                  </span>
                  <span className="hidden h-9 w-9 place-items-center rounded-full bg-[#e8f6ed] text-[#0b7a53] sm:grid">
                    <Check className="h-4 w-4" />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* BLOCO DA FASE PILOTO */}
      <section id="piloto" className="px-5 pb-24 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] bg-[#dff2e6] p-7 sm:p-12 lg:p-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto]">
            <div>
              <span className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[.18em] text-[#0b7a53]">
                Fase piloto em produção
              </span>
              <h2 className="mt-7 text-4xl font-black tracking-[-.04em] text-slate-900 sm:text-5xl">
                Estamos construindo com quem vende de verdade.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#526159]">
                A <strong>Pode Vir</strong> está sendo validada em produção com estabelecimentos reais. O objetivo desta fase é acompanhar o uso prático, ouvir os lojistas e aprimorar a experiência antes da abertura comercial.
              </p>
              <p className="mt-3 text-sm font-bold text-[#0b7a53]">
                Cadastro público e planos comerciais serão disponibilizados em uma próxima etapa.
              </p>
            </div>
            <a
              href={storeUrl}
              className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-[#14231d] px-8 font-black text-white transition hover:-translate-y-1 hover:bg-[#0b7a53]"
            >
              Ver demonstração <ArrowRight className="h-5 w-5" />
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="duvidas" className="border-y border-black/5 bg-white px-5 py-24 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.72fr_1.28fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[.22em] text-[#0b7a53]">Perguntas frequentes</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-.04em] text-slate-900">Dúvidas comuns.</h2>
          </div>
          <div className="divide-y divide-black/10">
            {faqs.map(([question, answer], index) => (
              <article key={question}>
                <button
                  onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                  className="flex w-full items-center justify-between gap-4 py-6 text-left text-lg font-black text-slate-900"
                >
                  <span>{question}</span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 transition ${
                      openFaq === index ? 'rotate-180 text-[#0b7a53]' : 'text-[#7f8b84]'
                    }`}
                  />
                </button>
                {openFaq === index && (
                  <p className="max-w-2xl pb-6 text-sm leading-7 text-[#647169] font-medium">{answer}</p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0d1813] px-5 py-12 text-white sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <PodeVirBrand size="md" light />
            <p className="mt-3 text-xs text-white/50 max-w-sm leading-relaxed">
              {platformBrand.description}
            </p>
            <p className="mt-3 text-xs text-white/40 font-medium">
              {platformBrand.copyright}
            </p>
          </div>

          <nav className="flex flex-wrap gap-6 text-sm font-bold text-white/60">
            <a className="hover:text-white transition-colors" href={storeUrl}>
              Ver demonstração
            </a>
            <a className="hover:text-white transition-colors" href={adminUrl}>
              Acesso do lojista
            </a>
            <a className="hover:text-white transition-colors" href="#recursos">
              Recursos
            </a>
            <a className="hover:text-white transition-colors" href="#posicionamento">
              Sua Marca
            </a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
