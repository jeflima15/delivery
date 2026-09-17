import { useEffect, useState } from 'react';
import {
  ArrowRight, BellRing, CalendarCheck, CalendarDays, Check, ChevronDown,
  ExternalLink, ImagePlus, Menu, MessageCircle, PackageCheck, Palette,
  Printer, Smartphone, Store, Truck, WalletCards, X,
} from 'lucide-react';
import PodeVirBrand from '../brand/PodeVirBrand';
import { platformBrand } from '../../config/brand';

const pilotSlug = import.meta.env.VITE_DEFAULT_TENANT_SLUG || 'loja-piloto';

const palettes = [
  { name: 'Esmeralda', primary: '#08665c', bg: 'bg-[#08665c]' },
  { name: 'Burguer & Brasa', primary: '#b45309', bg: 'bg-[#b45309]' },
  { name: 'Doçura & Bakery', primary: '#be185d', bg: 'bg-[#be185d]' },
  { name: 'Noite & Charcoal', primary: '#0f172a', bg: 'bg-[#0f172a]' },
];

const navigation = [
  ['Produto', '#produto'],
  ['Encomendas', '#encomendas'],
  ['Como funciona', '#como-funciona'],
  ['O piloto', '#piloto'],
  ['Dúvidas', '#duvidas'],
];

const faqs = [
  {
    question: 'O cliente precisa instalar algum aplicativo?',
    answer: 'Não. A vitrine abre pelo navegador em um link próprio da loja. O cliente escolhe os produtos e faz uma identificação rápida por telefone para continuar o pedido.',
  },
  {
    question: 'Como funcionam as encomendas?',
    answer: 'A loja configura dias, horários, antecedência e limites da agenda. O cliente pode agendar produtos habilitados na vitrine, e a equipe também pode registrar no painel uma encomenda personalizada combinada pelo WhatsApp.',
  },
  {
    question: 'A Pode Vir recebe o Pix automaticamente?',
    answer: 'Não. A loja informa sua chave Pix e confere o pagamento na própria conta bancária. Sinal, saldo e eventuais devoluções são registrados manualmente no pedido para manter o acompanhamento organizado.',
  },
  {
    question: 'Como funciona a impressão de comandas?',
    answer: 'A Pode Vir prepara comandas para impressoras térmicas de 58 mm e 80 mm. A impressão é iniciada pelo painel e concluída pela janela de impressão do navegador ou do sistema operacional.',
  },
  {
    question: 'Posso trabalhar com entrega e retirada?',
    answer: 'Sim. A loja pode habilitar retirada e configurar entrega com taxas por bairro ou por regiões desenhadas no mapa, conforme sua própria operação.',
  },
  {
    question: 'Como participar da fase piloto?',
    answer: 'A entrada acontece por convite e com acompanhamento próximo da equipe Pode Vir. Se você tem um estabelecimento e quer conhecer a plataforma, fale conosco pelo WhatsApp.',
  },
];

const iconClass = 'h-5 w-5';

export default function PlatformLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [selectedPalette, setSelectedPalette] = useState(0);
  const [showcaseMode, setShowcaseMode] = useState<'orders' | 'preorders'>('preorders');

  const storeUrl = `/${pilotSlug}`;
  const adminUrl = '/login';
  const whatsappContactUrl = 'https://wa.me/5524999097604?text=Ol%C3%A1!%20Conheci%20a%20Pode%20Vir%20e%20gostaria%20de%20conhecer%20a%20plataforma.';

  useEffect(() => {
    document.title = 'Pode Vir | Cardápio, pedidos e encomendas para sua loja';
    const description = 'Apresente sua loja com a sua marca, receba pedidos pelo link e organize encomendas, entregas e retiradas em um só painel.';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--pv-surface)] text-[var(--pv-text)] selection:bg-[var(--pv-primary)] selection:text-white">
      <a href="#conteudo" className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-white px-4 py-3 font-bold text-[var(--pv-primary)] shadow-xl focus:not-sr-only">
        Ir para o conteúdo
      </a>

      <div className="sticky top-3 z-50 mx-auto max-w-7xl px-4 sm:px-6">
        <header className="relative flex h-16 items-center justify-between rounded-2xl border border-white/70 bg-white/90 px-4 shadow-[0_10px_35px_rgba(20,53,45,0.09)] backdrop-blur-xl sm:px-6">
          <a href="#inicio" aria-label="Pode Vir — início" className="transition hover:opacity-90">
            <PodeVirBrand size="md" priority />
          </a>
          <nav aria-label="Navegação principal" className="hidden items-center gap-1 rounded-full bg-[var(--pv-surface-soft)]/80 p-1 lg:flex">
            {navigation.map(([label, href]) => (
              <a key={href} href={href} className="rounded-full px-3.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-white hover:text-[var(--pv-primary)] hover:shadow-xs">{label}</a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <a href={adminUrl} className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">Acesso do lojista</a>
            <a href={whatsappContactUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[var(--pv-primary)] px-4 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[var(--pv-primary-hover)]">
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Conhecer a Pode Vir
            </a>
          </div>
          <button
            type="button"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            aria-controls="menu-mobile"
            onClick={() => setMenuOpen((value) => !value)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white md:hidden"
          >
            {menuOpen ? <X className={iconClass} aria-hidden="true" /> : <Menu className={iconClass} aria-hidden="true" />}
          </button>
        </header>

        {menuOpen && (
          <nav id="menu-mobile" aria-label="Navegação móvel" className="mt-2 overflow-hidden rounded-2xl border border-black/5 bg-white/95 p-4 shadow-xl backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-1">
              {navigation.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-[var(--pv-surface-soft)] hover:text-[var(--pv-primary)]">{label}</a>)}
              <div className="mt-2 grid gap-2 border-t border-slate-100 pt-3">
                <a href={whatsappContactUrl} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--pv-primary)] px-4 py-3 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Conhecer a Pode Vir</a>
                <a href={adminUrl} onClick={() => setMenuOpen(false)} className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800">Acesso do lojista</a>
              </div>
            </div>
          </nav>
        )}
      </div>

      <div id="conteudo">
        <section id="inicio" className="relative isolate scroll-mt-24 overflow-hidden px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:px-10 lg:pb-28">
          <div className="pointer-events-none absolute -right-32 top-6 -z-10 h-[34rem] w-[34rem] rounded-full bg-[var(--pv-border)]/45 blur-3xl" />
          <div className="pointer-events-none absolute -left-40 bottom-0 -z-10 h-[28rem] w-[28rem] rounded-full bg-[var(--pv-accent)]/15 blur-3xl" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[.95fr_1.05fr]">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[.12em] text-emerald-800 shadow-xs sm:text-xs"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Plataforma em fase piloto</div>
              <h1 className="mt-6 text-4xl font-extrabold leading-[1.07] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-[3.55rem]">
                Seu cardápio, seus pedidos e suas <span className="text-[var(--pv-primary)]">encomendas em um só lugar.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[var(--pv-text-muted)] sm:text-lg">Apresente sua loja com a sua marca, receba pedidos pelo link e organize encomendas com data, detalhes combinados e controle de sinal e saldo.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href={whatsappContactUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-13 items-center justify-center gap-2.5 rounded-xl bg-[var(--pv-primary)] px-6 text-sm font-extrabold text-white shadow-lg shadow-emerald-950/15 transition hover:-translate-y-0.5 hover:bg-[var(--pv-primary-hover)]"><MessageCircle className="h-5 w-5" aria-hidden="true" /> Quero conhecer a Pode Vir <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" /></a>
                <a href={storeUrl} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-extrabold text-slate-800 shadow-xs transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50">Ver exemplo de vitrine <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
              </div>
              <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-500"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />Entrada por convite, com acompanhamento próximo durante a fase piloto.</p>
            </div>

            <div className="relative mx-auto w-full max-w-2xl">
              <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-tr from-[var(--pv-primary)]/20 via-[var(--pv-accent)]/10 to-transparent blur-2xl" />
              <div className="overflow-hidden rounded-[1.75rem] border border-slate-800/80 bg-[#102a23] p-3 shadow-[0_28px_70px_-25px_rgba(15,42,35,.55)] sm:p-5">
                <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">Visão da operação</p><p className="mt-1 text-sm font-extrabold text-white">O que precisa de atenção, no momento certo</p></div>
                  <div role="group" aria-label="Alternar exemplo da operação" className="flex rounded-xl bg-black/20 p-1">
                    <button type="button" aria-pressed={showcaseMode === 'orders'} onClick={() => setShowcaseMode('orders')} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold transition ${showcaseMode === 'orders' ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white'}`}>Pedidos do dia</button>
                    <button type="button" aria-pressed={showcaseMode === 'preorders'} onClick={() => setShowcaseMode('preorders')} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold transition ${showcaseMode === 'preorders' ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white'}`}>Encomendas</button>
                  </div>
                </div>
                {showcaseMode === 'preorders' ? <PreorderShowcase /> : <OrderShowcase />}
              </div>
              <div className="absolute -bottom-5 left-4 flex items-center gap-2.5 rounded-xl border border-white/70 bg-white/95 px-3.5 py-2.5 shadow-xl backdrop-blur sm:left-auto sm:right-5"><CalendarCheck className="h-5 w-5 text-[var(--pv-primary)]" aria-hidden="true" /><div><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Na mesma operação</p><p className="text-xs font-black text-slate-900">Pronta entrega + encomendas</p></div></div>
            </div>
          </div>
        </section>

        <section aria-label="Principais benefícios" className="border-y border-black/5 bg-white px-5 py-7 sm:px-8">
          <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-3">
            <Benefit Icon={Smartphone} title="Venda pelo seu link" text="Uma vitrine própria, sem exigir aplicativo." />
            <Benefit Icon={CalendarDays} title="Organize o que é para depois" text="Agenda separada da pronta entrega." />
            <Benefit Icon={Store} title="Sua marca na frente" text="Cores, logo e apresentação da sua loja." />
          </div>
        </section>

        <section id="encomendas" className="scroll-mt-24 px-5 py-24 sm:px-8 lg:px-10">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3.5 py-1 text-xs font-black uppercase tracking-widest text-amber-900"><CalendarDays className="h-4 w-4" aria-hidden="true" /> Encomendas</span>
              <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">O combinado no WhatsApp vira uma encomenda organizada.</h2>
              <p className="mt-5 text-base leading-7 text-[var(--pv-text-muted)]">Registre pedidos personalizados, reserve um horário na agenda e acompanhe o que foi recebido. Os pedidos agendados da vitrine entram na mesma visão operacional.</p>
              <ul className="mt-7 space-y-4">
                {[
                  'Data e janela para entrega ou retirada.',
                  'Descrição, preço fechado e até três fotos de referência.',
                  'Sinal recebido e saldo pendente visíveis no pedido.',
                  'Resumo pronto para a loja compartilhar com o cliente.',
                ].map((item) => <li key={item} className="flex gap-3 text-sm font-semibold leading-6 text-slate-700"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span>{item}</li>)}
              </ul>
              <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950"><strong>Transparência:</strong> a loja confere os pagamentos em sua conta e registra sinal, saldo ou devolução manualmente na Pode Vir.</p>
            </div>
            <AgendaPreview />
          </div>
        </section>

        <section id="produto" className="scroll-mt-24 bg-[var(--pv-dark)] px-5 py-24 text-white sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl"><span className="rounded-full bg-white/10 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-[var(--pv-accent)]">Da vitrine à operação</span><h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">Ferramentas para vender e acompanhar cada pedido.</h2><p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">A Pode Vir reúne a apresentação da loja e a rotina do atendimento, respeitando o jeito de trabalhar de cada estabelecimento.</p></div>
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.06] p-6 md:col-span-2 lg:row-span-2 sm:p-8">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-[var(--pv-accent)]"><Palette className={iconClass} aria-hidden="true" /></span>
                <h3 className="mt-5 text-2xl font-extrabold">Uma vitrine com a identidade da sua loja</h3>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Use logo, capa e cores próprias para apresentar produtos e adicionais em um ambiente dedicado à sua marca.</p>
                <div className="mt-8 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400"><span>Experimente uma paleta</span><strong className="text-white">{palettes[selectedPalette].name}</strong></div>
                  <div className="mt-4 flex gap-3">{palettes.map((palette, index) => <button key={palette.name} type="button" aria-label={`Usar paleta ${palette.name}`} aria-pressed={selectedPalette === index} onClick={() => setSelectedPalette(index)} className={`grid h-10 w-10 place-items-center rounded-xl ${palette.bg} transition hover:scale-105 ${selectedPalette === index ? 'ring-2 ring-white ring-offset-2 ring-offset-[#17352d]' : 'opacity-70 hover:opacity-100'}`}>{selectedPalette === index && <Check className="h-4 w-4" aria-hidden="true" />}</button>)}</div>
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-white p-3 text-slate-900"><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: palettes[selectedPalette].primary }} /><span className="text-xs font-bold">Sua loja, suas cores</span></div><span className="rounded-lg px-3 py-1.5 text-[10px] font-black text-white" style={{ backgroundColor: palettes[selectedPalette].primary }}>Adicionar</span></div>
                </div>
              </article>
              <ProductCard Icon={Smartphone} title="Pedido pelo link" text="O cliente acessa pelo navegador e faz uma identificação rápida por telefone." />
              <ProductCard Icon={BellRing} title="Pedidos no painel" text="A equipe acompanha novos pedidos, preparo e andamento em uma visão operacional." />
              <ProductCard Icon={Printer} title="Comandas preparadas" text="Imprima pelo navegador em formatos adequados a impressoras térmicas de 58 e 80 mm." />
              <ProductCard Icon={Truck} title="Entrega e retirada" text="Configure retirada, taxas por bairro ou regiões de entrega desenhadas no mapa." />
            </div>
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-24 px-5 py-24 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center"><span className="rounded-full bg-[var(--pv-surface-soft)] px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-[var(--pv-primary)]">Como funciona</span><h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Uma rotina clara para a loja e para o cliente.</h2></div>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StepCard step="01" Icon={Store} title="Prepare sua loja" text="Configure identidade, cardápio, horários, retirada e regiões de entrega." />
              <StepCard step="02" Icon={MessageCircle} title="Compartilhe seu link" text="Divulgue a vitrine no WhatsApp, no Instagram e nos seus canais." />
              <StepCard step="03" Icon={PackageCheck} title="Receba pedidos" text="Acompanhe o que entrou, atualize o andamento e imprima quando precisar." />
              <StepCard step="04" Icon={CalendarCheck} title="Cuide da agenda" text="Separe encomendas por data, confira sinal e organize o que será preparado." />
            </div>
          </div>
        </section>

        <section id="piloto" className="scroll-mt-24 px-5 pb-24 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-[var(--pv-border)]/60 bg-[var(--pv-surface-soft)] p-7 sm:p-10 lg:p-14">
            <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr]">
              <div><span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[var(--pv-primary)] shadow-xs"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Validação assistida</span><h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Construída perto de quem atende, prepara e vende.</h2><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--pv-text-muted)]">A Pode Vir está sendo validada em operações reais de alimentação. O acesso acontece por convite, com acompanhamento próximo para observar a rotina e evoluir a plataforma com responsabilidade.</p><div className="mt-6 flex flex-wrap items-center gap-2.5"><span className="text-xs font-bold text-slate-500">Operações participantes:</span>{['Bulls BBQ Burguer', 'Emanuele Confeitaria', 'Jeffs Burgueria'].map((name) => <span key={name} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{name}</span>)}</div></div>
              <aside className="rounded-2xl border border-white bg-white p-6 shadow-sm sm:p-7"><span className="text-xs font-bold uppercase tracking-wider text-slate-400">Conheça a plataforma</span><h3 className="mt-2 text-xl font-extrabold text-slate-950">Tem um estabelecimento?</h3><p className="mt-3 text-sm leading-6 text-slate-600">Conte um pouco sobre sua operação e converse com a equipe sobre a fase piloto.</p><a href={whatsappContactUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--pv-primary)] px-5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[var(--pv-primary-hover)]"><MessageCircle className="h-5 w-5" aria-hidden="true" /> Conversar pelo WhatsApp <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" /></a><p className="mt-3 text-center text-[11px] leading-4 text-slate-400">Cadastro público e planos comerciais ainda não estão disponíveis.</p></aside>
            </div>
          </div>
        </section>

        <section id="duvidas" className="scroll-mt-24 border-t border-black/5 bg-white px-5 py-24 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-4xl">
            <div className="text-center"><span className="rounded-full bg-[var(--pv-surface-soft)] px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-[var(--pv-primary)]">Perguntas frequentes</span><h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">O que você precisa saber antes de começar.</h2></div>
            <div className="mt-12 divide-y divide-slate-100">
              {faqs.map(({ question, answer }, index) => {
                const expanded = openFaq === index;
                const answerId = `faq-answer-${index}`;
                return <article key={question} className="py-5"><h3><button type="button" aria-expanded={expanded} aria-controls={answerId} onClick={() => setOpenFaq(expanded ? -1 : index)} className="flex w-full items-center justify-between gap-4 text-left text-base font-extrabold text-slate-950 sm:text-lg"><span>{question}</span><ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${expanded ? 'rotate-180 text-[var(--pv-primary)]' : 'text-slate-400'}`} aria-hidden="true" /></button></h3>{expanded && <p id={answerId} className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-600">{answer}</p>}</article>;
              })}
            </div>
          </div>
        </section>

        <section aria-labelledby="final-cta-title" className="bg-[var(--pv-primary)] px-5 py-16 text-white sm:px-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center text-center"><WalletCards className="h-9 w-9 text-[var(--pv-accent)]" aria-hidden="true" /><h2 id="final-cta-title" className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">Sua loja na frente. A Pode Vir nos bastidores.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">Converse com a equipe para conhecer a vitrine, o painel de pedidos e a agenda de encomendas.</p><a href={whatsappContactUrl} target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-extrabold text-[var(--pv-primary)] shadow-lg transition hover:-translate-y-0.5"><MessageCircle className="h-5 w-5" aria-hidden="true" /> Quero conhecer a Pode Vir</a></div>
        </section>
      </div>

      <footer className="bg-[var(--pv-dark)] px-5 py-12 text-white sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between"><div><PodeVirBrand size="md" light /><p className="mt-3 max-w-md text-xs leading-5 text-white/60">Vitrine própria, pedidos e encomendas organizados para delivery e retirada.</p><p className="mt-3 text-xs font-medium text-white/40">{platformBrand.copyright}</p></div><nav aria-label="Navegação do rodapé" className="flex flex-wrap gap-x-5 gap-y-3 text-xs font-bold text-white/70"><a className="transition hover:text-white" href={storeUrl}>Exemplo de vitrine</a><a className="transition hover:text-white" href={adminUrl}>Acesso do lojista</a><a className="transition hover:text-white" href="#encomendas">Encomendas</a><a className="transition hover:text-white" href="#produto">Produto</a><a className="transition hover:text-white" href="#piloto">O piloto</a></nav></div>
      </footer>
    </main>
  );
}

function PreorderShowcase() {
  return <div className="mt-4 grid gap-3 sm:grid-cols-[.72fr_1.28fr]">
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-1">{[['Hoje', '2'], ['Amanhã', '4'], ['Próx. 7 dias', '11']].map(([period, total], index) => <div key={period} className={`rounded-xl border p-2.5 sm:p-3 ${index === 1 ? 'border-amber-300/50 bg-amber-400/10' : 'border-white/10 bg-white/[.05]'}`}><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 sm:text-[10px]">{period}</p><strong className="mt-1 block text-lg text-white sm:text-xl">{total}</strong></div>)}</div>
    <div className="rounded-2xl bg-white p-4 text-slate-900 shadow-xl sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Amanhã · 15h às 16h</p><h2 className="mt-1 text-base font-black">Bolo de aniversário personalizado</h2><p className="mt-1 text-xs text-slate-500">Retirada na loja · Pedido #108</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-800">Sinal registrado</span></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Total combinado</p><strong className="mt-1 block text-sm">R$ 240,00</strong></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-[10px] text-amber-800">Saldo pendente</p><strong className="mt-1 block text-sm text-amber-950">R$ 120,00</strong></div></div><div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-100 p-3 text-[11px] text-slate-600"><ImagePlus className="h-4 w-4 text-[var(--pv-primary)]" aria-hidden="true" /> Detalhes e referências reunidos no pedido</div></div>
  </div>;
}

function OrderShowcase() {
  const orders = [
    { reference: '#111', status: 'NOVO', item: '2x Combo da casa', fulfillment: 'Entrega · Centro', total: 'R$ 68,90', accent: 'border-amber-300/50 bg-amber-400/10' },
    { reference: '#110', status: 'EM PREPARO', item: '1x Torta + bebida', fulfillment: 'Retirada · 20 min', total: 'R$ 42,00', accent: 'border-emerald-300/30 bg-emerald-400/10' },
  ];
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">{orders.map((order) => <div key={order.reference} className={`rounded-2xl border p-4 ${order.accent}`}><div className="flex items-center justify-between"><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black text-white">{order.reference} · {order.status}</span><strong className="text-sm text-white">{order.total}</strong></div><p className="mt-4 text-sm font-bold text-slate-100">{order.item}</p><p className="mt-1 text-xs text-slate-400">{order.fulfillment}</p><div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-[10px] text-slate-300"><BellRing className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" /> Pedido visível no painel da loja</div></div>)}</div>;
}

function AgendaPreview() {
  const events = [
    { time: '10:00', title: 'Kit festa · Maria', meta: 'Retirada · Sinal registrado', color: 'bg-emerald-500' },
    { time: '15:00', title: 'Bolo personalizado · Ana', meta: 'Entrega · Referências anexadas', color: 'bg-amber-500' },
    { time: '17:30', title: '30 doces finos · Carlos', meta: 'Retirada · Saldo pendente', color: 'bg-pink-500' },
  ];
  return <div className="relative rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_-35px_rgba(15,42,35,.35)] sm:p-6"><div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[var(--pv-primary)]">Agenda da loja</p><h3 className="mt-1 text-lg font-black text-slate-950">Próximas encomendas</h3></div><span className="rounded-xl bg-[var(--pv-surface-soft)] px-3 py-2 text-xs font-bold text-[var(--pv-primary)]">Abril · Exemplo</span></div><div className="mt-4 grid grid-cols-7 gap-1.5 text-center">{['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, index) => <span key={`${day}-${index}`} className="py-1 text-[10px] font-bold text-slate-400">{day}</span>)}{[13, 14, 15, 16, 17, 18, 19].map((day) => <span key={day} className={`grid aspect-square place-items-center rounded-lg text-xs font-bold ${day === 16 ? 'bg-[var(--pv-primary)] text-white shadow-md' : day === 18 ? 'bg-amber-100 text-amber-950' : 'bg-slate-50 text-slate-600'}`}>{day}</span>)}</div><div className="mt-5 space-y-2.5">{events.map((event) => <div key={event.time} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"><span className={`h-9 w-1 rounded-full ${event.color}`} /><span className="w-11 text-xs font-black text-slate-900">{event.time}</span><div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{event.title}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{event.meta}</p></div></div>)}</div><div className="mt-4 flex items-center gap-2 rounded-xl bg-[#eafbf0] p-3 text-xs font-bold text-[#177c3c]"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Resumo preparado para compartilhar pelo WhatsApp</div></div>;
}

type IconType = typeof Smartphone;

function Benefit({ Icon, title, text }: { Icon: IconType; title: string; text: string }) {
  return <div className="flex items-center gap-3 sm:justify-center"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--pv-surface-soft)] text-[var(--pv-primary)]"><Icon className={iconClass} aria-hidden="true" /></span><div><strong className="block text-sm text-slate-900">{title}</strong><span className="text-xs text-slate-500">{text}</span></div></div>;
}

function ProductCard({ Icon, title, text }: { Icon: IconType; title: string; text: string }) {
  return <article className="rounded-3xl border border-white/10 bg-white/[.06] p-6"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-emerald-300"><Icon className={iconClass} aria-hidden="true" /></span><h3 className="mt-5 text-lg font-extrabold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></article>;
}

function StepCard({ step, Icon, title, text }: { step: string; Icon: IconType; title: string; text: string }) {
  return <article className="relative rounded-2xl border border-black/5 bg-white p-6 shadow-xs"><span className="absolute right-5 top-4 font-mono text-2xl font-black text-slate-100">{step}</span><span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--pv-surface-soft)] text-[var(--pv-primary)]"><Icon className={iconClass} aria-hidden="true" /></span><h3 className="mt-5 text-base font-extrabold text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>;
}
