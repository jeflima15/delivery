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
  ShoppingBag,
  SlidersHorizontal,
  Store,
  X,
} from 'lucide-react';

const pilotSlug = import.meta.env.VITE_DEFAULT_TENANT_SLUG || 'loja-piloto';

const benefits = [
  { icon: Store, title: 'Cardapio por link', text: 'Cada operacao ganha uma vitrine propria, pronta para compartilhar com seus clientes.' },
  { icon: ClipboardList, title: 'Gestao de pedidos', text: 'Acompanhe a fila, atualize status e mantenha a operacao organizada em um unico painel.' },
  { icon: SlidersHorizontal, title: 'Catalogo completo', text: 'Organize categorias, produtos, adicionais, estoque e disponibilidade com clareza.' },
  { icon: Palette, title: 'Identidade da loja', text: 'Personalize cores, imagens, informativos e os principais pontos da experiencia.' },
  { icon: Gift, title: 'Relacionamento', text: 'Cupons e fidelidade ajudam a construir uma experiencia de recompra consistente.' },
  { icon: BarChart3, title: 'Visao centralizada', text: 'Pedidos, clientes e desempenho ficam reunidos para apoiar decisoes do dia a dia.' },
];

const faqs = [
  ['Preciso comprar outro dominio?', 'Nao. Cada loja usa um caminho proprio dentro do dominio da plataforma e recebe um link exclusivo para divulgar.'],
  ['A loja tera painel administrativo?', 'Sim. Cada operacao possui seu proprio painel, com dados e permissoes isolados das demais lojas.'],
  ['Ja posso criar uma conta e contratar?', 'O cadastro publico e os planos comerciais ainda estao em preparacao. Nesta fase, voce pode explorar a demonstracao do produto.'],
];

export default function PlatformLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const storeUrl = `/${pilotSlug}`;
  const adminUrl = `/${pilotSlug}/admin`;

  useEffect(() => {
    document.title = 'Delivery Platform | Cardapio e pedidos em um so lugar';
    const description = 'Plataforma para criar cardapio online, organizar pedidos e administrar a operacao do seu delivery.';
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
      <header className="sticky top-0 z-50 border-b border-black/5 bg-[#f6f7f2]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <a href="#inicio" className="flex items-center gap-3 font-black tracking-[-0.03em]">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0b7a53] text-white shadow-lg shadow-emerald-900/15"><ShoppingBag className="h-5 w-5" /></span>
            <span>Delivery Platform</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-bold text-[#526159] md:flex">
            <a className="transition hover:text-[#0b7a53]" href="#recursos">Recursos</a>
            <a className="transition hover:text-[#0b7a53]" href="#como-funciona">Como funciona</a>
            <a className="transition hover:text-[#0b7a53]" href="#planos">Planos</a>
          </nav>
          <a href={storeUrl} className="hidden items-center gap-2 rounded-xl bg-[#14231d] px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#0b7a53] md:flex">Ver loja piloto <ArrowRight className="h-4 w-4" /></a>
          <button aria-label="Abrir menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-xl border border-black/10 bg-white md:hidden">{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
        {menuOpen && <nav className="border-t border-black/5 bg-white px-5 py-5 md:hidden"><div className="mx-auto flex max-w-7xl flex-col gap-1">{[['Recursos', '#recursos'], ['Como funciona', '#como-funciona'], ['Planos', '#planos']].map(([label, href]) => <a key={href} onClick={() => setMenuOpen(false)} href={href} className="rounded-xl px-4 py-3 text-sm font-bold hover:bg-[#edf7f1]">{label}</a>)}<a href={storeUrl} className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#0b7a53] px-4 py-3 text-sm font-bold text-white">Ver loja piloto <ArrowRight className="h-4 w-4" /></a></div></nav>}
      </header>

      <section id="inicio" className="relative isolate overflow-hidden px-5 pb-24 pt-16 sm:px-8 sm:pt-24 lg:px-10 lg:pb-32">
        <div className="absolute -right-44 top-12 -z-10 h-[34rem] w-[34rem] rounded-full bg-[#cdebd9] blur-3xl" />
        <div className="absolute -left-56 bottom-0 -z-10 h-80 w-80 rounded-full bg-[#f4c77c]/35 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.02fr_.98fr]">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#0b7a53]/20 bg-white/75 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#0b7a53]"><span className="h-2 w-2 rounded-full bg-[#0b7a53]" /> Operacao digital para delivery</span>
            <h1 className="mt-7 text-5xl font-black leading-[.95] tracking-[-0.055em] sm:text-6xl lg:text-7xl">Seu cardapio online.<br /><span className="text-[#0b7a53]">Sua operacao no controle.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#5f6d65] sm:text-xl">Crie uma experiencia propria para seu restaurante, hamburgueria ou lanchonete e organize catalogo, pedidos e clientes em um painel completo.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href={storeUrl} className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-[#0b7a53] px-7 font-black text-white shadow-xl shadow-emerald-900/15 transition hover:-translate-y-1 hover:bg-[#096744]">Ver demonstracao <ArrowRight className="h-5 w-5" /></a>
              <a href={adminUrl} className="flex h-14 items-center justify-center gap-3 rounded-2xl border border-black/10 bg-white px-7 font-black transition hover:-translate-y-1 hover:border-[#0b7a53]/30">Conhecer o painel</a>
            </div>
            <p className="mt-5 text-xs font-semibold text-[#7c8982]">Piloto em validacao. Cadastro publico e contratacao serao disponibilizados em uma proxima etapa.</p>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:mx-0">
            <div className="absolute -inset-5 -z-10 rotate-2 rounded-[2.5rem] bg-[#0b7a53] opacity-10" />
            <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_35px_90px_-35px_rgba(20,35,29,.35)]">
              <div className="flex items-center justify-between border-b border-black/5 px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#14231d] text-white"><Store className="h-5 w-5" /></span><span><strong className="block text-sm">Minha loja</strong><small className="text-[#839088]">Painel operacional</small></span></div><span className="rounded-full bg-[#e5f7ec] px-3 py-1 text-xs font-bold text-[#0b7a53]">Aberta</span></div>
              <div className="grid gap-4 p-5 sm:grid-cols-3">{[['Pedidos', 'Acompanhe'], ['Operacao', 'Organize'], ['Desempenho', 'Entenda']].map(([label, value]) => <div key={label} className="rounded-2xl bg-[#f6f7f2] p-4"><small className="text-[#7b8981]">{label}</small><strong className="mt-2 block text-lg">{value}</strong></div>)}</div>
              <div className="grid gap-4 px-5 pb-5 sm:grid-cols-[1fr_.78fr]">
                <div className="rounded-2xl border border-black/5 p-4"><div className="flex items-center justify-between"><strong className="text-sm">Fluxo de pedidos</strong><span className="text-xs font-bold text-[#0b7a53]">Visao geral</span></div><div className="mt-4 space-y-3">{['Novo pedido', 'Em preparo', 'Pedido concluido'].map((order, index) => <div key={order} className="flex items-center justify-between rounded-xl bg-[#f6f7f2] px-3 py-3"><span className="text-xs font-bold">{order}</span><span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-amber-400' : 'bg-[#0b7a53]'}`} /></div>)}</div></div>
                <div className="rounded-2xl bg-[#14231d] p-4 text-white"><small className="text-white/55">Resumo semanal</small><div className="mt-6 flex h-28 items-end gap-2">{[38, 61, 46, 78, 57, 88, 70].map((height, index) => <span key={index} className="flex-1 rounded-t bg-[#59d497]" style={{ height: `${height}%`, opacity: .55 + index * .06 }} />)}</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="recursos" className="bg-[#14231d] px-5 py-24 text-white sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl"><div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[.22em] text-[#59d497]">Recursos</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">O essencial para vender e operar melhor.</h2><p className="mt-5 text-lg leading-8 text-white/60">Uma estrutura unica para a experiencia do cliente e a rotina de quem administra a loja.</p></div><div className="mt-14 grid gap-px overflow-hidden rounded-[2rem] bg-white/10 sm:grid-cols-2 lg:grid-cols-3">{benefits.map(({ icon: Icon, title, text }) => <article key={title} className="bg-[#14231d] p-7 transition hover:bg-white/[.04] sm:p-8"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#59d497]/10 text-[#59d497]"><Icon className="h-5 w-5" /></span><h3 className="mt-6 text-lg font-black">{title}</h3><p className="mt-3 text-sm leading-6 text-white/55">{text}</p></article>)}</div></div>
      </section>

      <section id="como-funciona" className="px-5 py-24 sm:px-8 lg:px-10"><div className="mx-auto max-w-7xl"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><p className="text-xs font-black uppercase tracking-[.22em] text-[#0b7a53]">Como funciona</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">Da configuracao ao primeiro pedido.</h2><p className="mt-5 text-lg leading-8 text-[#647169]">Um fluxo direto, pensado para colocar a loja no ar sem transformar a operacao em um projeto tecnico.</p></div><ol className="space-y-4">{[['01', 'A loja cria sua conta', 'O cadastro publico fara parte da proxima fase comercial da plataforma.'], ['02', 'Configura cardapio e identidade', 'Produtos, categorias, imagens, horarios, entrega e a cor da marca em um unico painel.'], ['03', 'Recebe e acompanha pedidos', 'O cliente compra pela vitrine e a equipe conduz cada pedido pelo fluxo operacional.']].map(([number, title, text], index) => <li key={number} className="grid gap-4 rounded-3xl border border-black/5 bg-white p-6 shadow-sm sm:grid-cols-[70px_1fr_auto] sm:items-center"><span className="text-3xl font-black text-[#0b7a53]/35">{number}</span><span><strong className="block text-lg">{title}</strong><small className="mt-2 block text-sm leading-6 text-[#69766e]">{text}</small></span><span className="hidden h-9 w-9 place-items-center rounded-full bg-[#e8f6ed] text-[#0b7a53] sm:grid">{index === 0 ? <span className="text-[10px] font-black">EM BREVE</span> : <Check className="h-4 w-4" />}</span></li>)}</ol></div></div></section>

      <section id="planos" className="px-5 pb-24 sm:px-8 lg:px-10"><div className="mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] bg-[#dff2e6] p-7 sm:p-12 lg:p-16"><div className="grid items-center gap-10 lg:grid-cols-[1fr_auto]"><div><span className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[.2em] text-[#0b7a53]">Planos em breve</span><h2 className="mt-7 text-4xl font-black tracking-[-.04em] sm:text-5xl">Conheca o produto antes da fase comercial.</h2><p className="mt-5 max-w-2xl text-lg leading-8 text-[#526159]">Os planos e o cadastro publico ainda estao em preparacao. Nenhum preco ou promessa ficticia: por enquanto, a loja piloto mostra a experiencia real.</p></div><a href={storeUrl} className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-[#14231d] px-7 font-black text-white transition hover:-translate-y-1 hover:bg-[#0b7a53]">Explorar demonstracao <ArrowRight className="h-5 w-5" /></a></div></div></section>

      <section className="border-y border-black/5 bg-white px-5 py-24 sm:px-8 lg:px-10"><div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.72fr_1.28fr]"><div><p className="text-xs font-black uppercase tracking-[.22em] text-[#0b7a53]">Perguntas frequentes</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em]">O que voce precisa saber.</h2></div><div className="divide-y divide-black/10">{faqs.map(([question, answer], index) => <article key={question}><button onClick={() => setOpenFaq(openFaq === index ? -1 : index)} className="flex w-full items-center justify-between gap-4 py-6 text-left text-lg font-black"><span>{question}</span><ChevronDown className={`h-5 w-5 shrink-0 transition ${openFaq === index ? 'rotate-180 text-[#0b7a53]' : 'text-[#7f8b84]'}`} /></button>{openFaq === index && <p className="max-w-2xl pb-6 text-sm leading-7 text-[#647169]">{answer}</p>}</article>)}</div></div></section>

      <footer className="bg-[#0d1813] px-5 py-10 text-white sm:px-8 lg:px-10"><div className="mx-auto flex max-w-7xl flex-col gap-7 sm:flex-row sm:items-center sm:justify-between"><div><strong className="flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-[#59d497]" /> Delivery Platform</strong><p className="mt-2 text-xs text-white/45">{new Date().getFullYear()} · Plataforma em fase piloto.</p></div><nav className="flex flex-wrap gap-5 text-sm font-bold text-white/60"><a className="hover:text-white" href={storeUrl}>Ver demonstracao</a><a className="hover:text-white" href={adminUrl}>Acesso do piloto</a><a className="hover:text-white" href="#recursos">Recursos</a></nav></div></footer>
    </main>
  );
}
