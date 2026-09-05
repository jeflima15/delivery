import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Menu,
  MessageCircle,
  Palette,
  Printer,
  Smartphone,
  Sparkles,
  Truck,
  X,
} from 'lucide-react';
import PodeVirBrand from '../brand/PodeVirBrand';
import { platformBrand } from '../../config/brand';

const pilotSlug = import.meta.env.VITE_DEFAULT_TENANT_SLUG || 'loja-piloto';

// Paletas interativas para o Bento Card da vitrine
const showcasePalettes = [
  { name: 'Esmeralda', primary: '#08665c', accent: '#f8a838', bg: 'bg-[#08665c]' },
  { name: 'Burguer & Brasa', primary: '#b45309', accent: '#fbbf24', bg: 'bg-[#b45309]' },
  { name: 'Doçura & Bakery', primary: '#be185d', accent: '#f472b6', bg: 'bg-[#be185d]' },
  { name: 'Noite & Charcoal', primary: '#0f172a', accent: '#38bdf8', bg: 'bg-[#0f172a]' },
];

const faqs = [
  [
    'O cliente da minha loja precisa instalar algum aplicativo?',
    'Não. O cardápio abre instantaneamente pelo navegador através de um link próprio exclusivo (ex: podevir.com.br/sua-loja). Não exige download, login obrigatório ou espaço na memória do celular do cliente.',
  ],
  [
    'Como funciona a impressão de comandas para a cozinha?',
    'O painel do lojista se comunica diretamente com impressoras térmicas padrão de 58mm e 80mm. Assim que um pedido chega, a comanda pode ser impressa automaticamente ou com 1 clique, já formatada com os itens, adicionais e dados de entrega.',
  ],
  [
    'Como funcionam os pagamentos dos pedidos?',
    'Os pagamentos são definidos livremente pelo estabelecimento: Pix (com chave e QR Code configurados pela loja), cartão na maquininha (crédito/débito) e dinheiro com cálculo automático de troco na comanda.',
  ],
  [
    'Posso configurar taxas de entrega por bairro ou por distância?',
    'Sim. A plataforma suporta tanto taxas fixas por bairros quanto faixas de entrega desenhadas no mapa por raio em quilômetros ou polígonos, além da opção de retirada no balcão.',
  ],
  [
    'Como funciona a Fase Piloto e como posso participar?',
    'A Pode Vir está em fase de validação assistida com estabelecimentos reais de alimentação. Acompanhamos pessoalmente cada operação parceira para aprimorar o sistema. Para se candidatar a uma vaga futura do piloto, você pode entrar em contato direto com nossa equipe.',
  ],
];

export default function PlatformLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [selectedPalette, setSelectedPalette] = useState(0);

  const storeUrl = `/${pilotSlug}`;
  const adminUrl = '/login';
  const whatsappContactUrl = 'https://wa.me/5524992059199?text=Ol%C3%A1!%20Conheci%20a%20Pode%20Vir%20e%20gostaria%20de%20conversar%20sobre%20a%20fase%20piloto.';

  useEffect(() => {
    document.title = 'Pode Vir · Tecnologia de Cardápio e Pedidos em Fase Piloto';
    const description = 'Plataforma moderna de cardápio digital, gestão de pedidos e operação de delivery em fase piloto com estabelecimentos reais.';
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
      {/* 1. HEADER FLUTUANTE EM VIDRO (FLOATING GLASS NAVBAR) */}
      <div className="sticky top-3 z-50 mx-auto max-w-6xl px-4 sm:px-6">
        <header className="relative flex h-16 items-center justify-between rounded-2xl border border-white/60 bg-white/80 px-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-all sm:px-6">
          <a href="#inicio" className="flex items-center gap-2.5 transition hover:opacity-90">
            <PodeVirBrand size="md" />
          </a>

          {/* Links desktop centrais */}
          <nav className="hidden items-center gap-1 rounded-full bg-[var(--pv-surface-soft)]/70 p-1 md:flex">
            {[
              ['Recursos', '#recursos'],
              ['Operação', '#operacao'],
              ['O Piloto', '#piloto'],
              ['Dúvidas', '#duvidas'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-full px-4 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-white hover:text-[var(--pv-primary)] hover:shadow-xs"
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Ações topo desktop */}
          <div className="hidden items-center gap-3 md:flex">
            <a
              href={adminUrl}
              className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Acesso do lojista →
            </a>
            <a
              href={storeUrl}
              className="group relative inline-flex items-center gap-2 rounded-xl bg-[var(--pv-primary)] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[var(--pv-primary)]/20 transition-all hover:-translate-y-0.5 hover:bg-[var(--pv-primary-hover)] hover:shadow-lg hover:shadow-[var(--pv-primary)]/30"
            >
              <span>Ver demonstração</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          {/* Botão Mobile Hambúrguer */}
          <button
            type="button"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5 text-slate-800" /> : <Menu className="h-5 w-5 text-slate-800" />}
          </button>
        </header>

        {/* Menu Dropdown Mobile */}
        {menuOpen && (
          <nav className="mt-2 overflow-hidden rounded-2xl border border-black/5 bg-white/95 p-4 shadow-xl backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-1">
              {[
                ['Recursos', '#recursos'],
                ['Operação', '#operacao'],
                ['O Piloto', '#piloto'],
                ['Dúvidas', '#duvidas'],
              ].map(([label, href]) => (
                <a
                  key={href}
                  onClick={() => setMenuOpen(false)}
                  href={href}
                  className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-[var(--pv-surface-soft)] hover:text-[var(--pv-primary)]"
                >
                  {label}
                </a>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3">
                <a
                  href={storeUrl}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[var(--pv-primary)] px-4 py-2.5 text-sm font-bold text-white shadow-md"
                >
                  Ver demonstração <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href={adminUrl}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800"
                >
                  Acesso do lojista
                </a>
              </div>
            </div>
          </nav>
        )}
      </div>

      {/* 2. HERO SECTION: O PRODUTO COMO PROTAGONISTA */}
      <section id="inicio" className="relative isolate overflow-hidden px-5 pt-12 pb-20 sm:px-8 sm:pt-20 lg:px-10 lg:pb-28">
        {/* Iluminação de fundo sutil */}
        <div className="pointer-events-none absolute -right-32 top-8 -z-10 h-[32rem] w-[32rem] rounded-full bg-[var(--pv-border)]/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-40 bottom-10 -z-10 h-[28rem] w-[28rem] rounded-full bg-[var(--pv-accent)]/15 blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-14">
          {/* Coluna Texto & CTAs */}
          <div className="max-w-2xl">
            {/* Pill de Status da Fase Piloto */}
            <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-emerald-800 shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
              </span>
              Piloto em produção com lojas reais
            </div>

            <h1 className="mt-6 text-4xl font-extrabold tracking-[-0.04em] text-slate-900 sm:text-5xl lg:text-6xl sm:leading-[1.08]">
              A tecnologia de pedidos e cardápio próprio{' '}
              <span className="text-[var(--pv-primary)]">nos bastidores da sua loja.</span>
            </h1>

            <p className="mt-6 text-base leading-relaxed text-[var(--pv-text-muted)] sm:text-lg">
              Desenvolvido para conectar a vitrine do seu cliente diretamente à operação da sua cozinha, com velocidade extrema, identidade própria e controle total de cada etapa.
            </p>

            {/* CTAs da Hero */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={storeUrl}
                className="flex h-13 items-center justify-center gap-2.5 rounded-xl bg-[var(--pv-primary)] px-6 text-sm font-extrabold text-white shadow-lg shadow-[var(--pv-primary)]/20 transition-all hover:-translate-y-0.5 hover:bg-[var(--pv-primary-hover)] hover:shadow-xl hover:shadow-[var(--pv-primary)]/30"
              >
                <span>Ver demonstração ao vivo</span>
                <ArrowRight className="h-4 w-4" />
              </a>

              <a
                href={adminUrl}
                className="flex h-13 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-extrabold text-slate-800 shadow-xs transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
              >
                Acesso do lojista
              </a>
            </div>

            {/* Microcopy sincero da fase piloto */}
            <div className="mt-5 flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span>Acesso restrito por convite a estabelecimentos parceiros participantes da validação.</span>
            </div>
          </div>

          {/* Coluna Visual: Showcase Dual-Device (Smartphone + Painel KDS) */}
          <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
            {/* Halo de luz decorativo */}
            <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-[var(--pv-primary)]/20 via-[var(--pv-accent)]/10 to-transparent blur-2xl" />

            <div className="relative grid items-center gap-5 sm:grid-cols-[1.1fr_0.9fr]">
              {/* DISPOSITIVO 1: Mockup KDS da Cozinha (Ao fundo) */}
              <div className="order-2 sm:order-1 overflow-hidden rounded-2xl border border-slate-800 bg-[#0f201b] p-4 text-white shadow-2xl ring-1 ring-white/10">
                {/* Topo do painel operacional */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20" />
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                      KDS · Pedidos ao Vivo
                    </span>
                  </div>
                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                    4 na fila
                  </span>
                </div>

                {/* Cards de pedidos simulados */}
                <div className="mt-3 space-y-2.5">
                  {/* Pedido novo em destaque com borda dourada pulsante */}
                  <div className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-amber-400/20 px-2 py-0.5 font-mono text-[10px] font-black text-amber-300">
                        #104 · NOVO
                      </span>
                      <span className="font-mono text-xs font-black text-white">R$ 58,90</span>
                    </div>
                    <p className="mt-1.5 text-xs font-bold text-slate-100">2x X-Burguer + Batata M</p>
                    <p className="text-[10px] text-slate-400">Delivery · Jardim Esperança</p>
                    <div className="mt-2.5 flex items-center justify-between border-t border-amber-400/20 pt-2 text-[10px]">
                      <span className="flex items-center gap-1 text-amber-200">
                        <Printer className="h-3 w-3" /> Comanda pronta
                      </span>
                      <span className="font-bold text-emerald-400">Pix confirmado</span>
                    </div>
                  </div>

                  {/* Pedido em preparo */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                        #103 · EM PREPARO
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-300">R$ 34,90</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-300">1x Torta Confeitaria</p>
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                      <Clock className="h-3 w-3 text-emerald-400" /> 15 min decorridos
                    </div>
                  </div>
                </div>
              </div>

              {/* DISPOSITIVO 2: Smartphone Mockup (Cardápio Mobile em primeiro plano) */}
              <div className="order-1 sm:order-2 mx-auto w-[250px] overflow-hidden rounded-[2.5rem] border-[5px] border-slate-900 bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] ring-1 ring-black/10">
                {/* Dynamic Island */}
                <div className="relative h-6 bg-slate-900">
                  <div className="absolute left-1/2 top-1.5 h-3 w-16 -translate-x-1/2 rounded-full bg-black/60" />
                </div>

                {/* Tela do Cardápio da Loja */}
                <div className="bg-slate-50 p-2.5">
                  {/* Cabeçalho da loja */}
                  <div className="rounded-xl bg-white p-2.5 shadow-xs">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pv-primary)] font-black text-xs text-white">
                        PV
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-slate-900">Loja Modelo</p>
                        <p className="text-[10px] font-semibold text-emerald-700">★ 4.9 · Aberto agora</p>
                      </div>
                    </div>
                  </div>

                  {/* Produto em destaque */}
                  <div className="mt-2.5 rounded-xl border border-slate-100 bg-white p-2 shadow-xs">
                    <div className="h-20 w-full rounded-lg bg-gradient-to-tr from-amber-100 to-orange-100 flex items-center justify-center text-3xl">
                      🍔
                    </div>
                    <div className="mt-2">
                      <p className="text-xs font-bold text-slate-900">Smash Burger Duplo</p>
                      <p className="text-[10px] text-slate-500 line-clamp-1">Pão brioche selado, blend 160g e cheddar</p>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="font-mono text-xs font-black text-[var(--pv-primary)]">R$ 29,90</span>
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-50 text-[10px] font-bold text-emerald-700">
                          +
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Barra fixa de sacola */}
                  <div className="mt-2.5 rounded-lg bg-[var(--pv-primary)] py-2 text-center text-white shadow-xs">
                    <p className="text-[10px] font-black">Ver Sacola (R$ 58,90)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Pílula Flutuante 3D de Notificação */}
            <div className="absolute -bottom-4 left-4 z-20 flex items-center gap-2.5 rounded-xl border border-white/60 bg-white/95 px-3.5 py-2 shadow-lg backdrop-blur-md">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Zero atrito</p>
                <p className="text-xs font-black text-slate-900">Link direto sem instalar app</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. BENTO GRID DE RECURSOS (TECNOLOGIA & OPERAÇÃO) */}
      <section id="recursos" className="bg-[var(--pv-dark)] px-5 py-24 text-white sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <span className="rounded-full bg-white/10 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-[var(--pv-accent)]">
              Recursos do Sistema
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
              Tudo o que sua operação precisa no dia a dia.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-300 sm:text-lg">
              Construído com base nas necessidades reais de cozinhas e balcões que não podem perder tempo.
            </p>
          </div>

          {/* Grid Bento Assimétrico */}
          <div className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-4">
            {/* Bento Card 1: Sua Marca, Suas Cores (Interativo 2 cols, 2 rows) */}
            <div className="col-span-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-6 sm:p-8 md:col-span-2 lg:row-span-2 flex flex-col justify-between">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[var(--pv-accent)] ring-1 ring-white/20">
                  <Palette className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-xl font-extrabold text-white sm:text-2xl">Sua vitrine com a sua identidade</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  A sua loja tem cores, logotipo, banner de capa e apresentação exclusivos. O cliente compra no seu ambiente, sem poluição de concorrentes ao redor.
                </p>
              </div>

              {/* Seletor interativo de temas */}
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span>Experimente uma paleta:</span>
                  <span className="font-bold text-white">{showcasePalettes[selectedPalette].name}</span>
                </div>
                <div className="mt-3 flex gap-2.5">
                  {showcasePalettes.map((palette, idx) => (
                    <button
                      key={palette.name}
                      type="button"
                      onClick={() => setSelectedPalette(idx)}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${palette.bg} transition-all hover:scale-105 ${
                        selectedPalette === idx ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-105' : 'opacity-70 hover:opacity-100'
                      }`}
                      aria-label={palette.name}
                    >
                      {selectedPalette === idx && <Check className="h-4 w-4 text-white" />}
                    </button>
                  ))}
                </div>

                {/* Mini preview dinâmico com a cor selecionada */}
                <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: showcasePalettes[selectedPalette].primary }}
                    />
                    <span className="font-mono text-xs font-bold text-slate-200">Botões e Destaques</span>
                  </div>
                  <span
                    className="rounded-lg px-2.5 py-1 text-[10px] font-extrabold text-white"
                    style={{ backgroundColor: showcasePalettes[selectedPalette].primary }}
                  >
                    Exemplo ao Vivo
                  </span>
                </div>
              </div>
            </div>

            {/* Bento Card 2: KDS & Impressão Térmica (1 col, 2 rows) */}
            <div className="col-span-full rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-6 sm:p-8 md:col-span-1 lg:row-span-2 flex flex-col justify-between">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-400/30">
                  <Printer className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-xl font-extrabold text-white">Impressão & KDS</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  Impressão direta para impressoras térmicas (58mm e 80mm) e alerta sonoro imediato a cada novo pedido.
                </p>
              </div>

              {/* Comanda Térmica Simulada */}
              <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-900/90 p-3.5 font-mono text-[11px] text-slate-300 shadow-inner">
                <div className="border-b border-dashed border-slate-700 pb-1.5 text-center font-bold text-white">
                  --- PEDIDO #104 ---
                </div>
                <div className="py-2 space-y-1">
                  <div className="flex justify-between">
                    <span>1x Smash Salad</span>
                    <span>R$ 28,90</span>
                  </div>
                  <p className="text-[10px] text-slate-400">+ Molho da Casa</p>
                  <div className="flex justify-between">
                    <span>1x Coca-Cola Lata</span>
                    <span>R$ 6,00</span>
                  </div>
                </div>
                <div className="border-t border-dashed border-slate-700 pt-1.5 flex justify-between font-bold text-emerald-400">
                  <span>TOTAL:</span>
                  <span>R$ 34,90</span>
                </div>
              </div>
            </div>

            {/* Bento Card 3: PWA Sem Download (1 col, 1 row) */}
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-emerald-400">
                <Smartphone className="h-5 w-5" />
              </div>
              <h4 className="mt-4 text-base font-extrabold text-white">Acesso via Link (PWA)</h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Seu cliente pede diretamente pelo navegador. Sem baixar aplicativo, sem senhas obrigatórias e sem atrito.
              </p>
            </div>

            {/* Bento Card 4: Logística Flexível (1 col, 1 row) */}
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-emerald-400">
                <Truck className="h-5 w-5" />
              </div>
              <h4 className="mt-4 text-base font-extrabold text-white">Delivery e Retirada</h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Taxas configuradas por bairro ou mapa de raio em KM, com tempos de preparo e deslocamento integrados.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. COMO FUNCIONA A OPERAÇÃO NA PRÁTICA */}
      <section id="operacao" className="px-5 py-24 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
            <div>
              <span className="rounded-full bg-[var(--pv-surface-soft)] px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-[var(--pv-primary)]">
                Fluxo Simples
              </span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                Como a Pode Vir opera no dia a dia da sua loja.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--pv-text-muted)]">
                Sem burocracia ou complexidade técnica: uma rotina direta para colocar seus produtos no ar e receber pedidos com tranquilidade.
              </p>
            </div>

            <div className="space-y-4">
              {[
                {
                  step: '01',
                  title: 'Configure seu cardápio pelo painel',
                  desc: 'Cadastre categorias, produtos, fotos, adicionais, horários de funcionamento e taxas de entrega de forma intuitiva.',
                },
                {
                  step: '02',
                  title: 'Compartilhe seu link exclusivo',
                  desc: 'Divulgue sua vitrine própria no WhatsApp, no Instagram e onde seus clientes estiverem, com carregamento instantâneo.',
                },
                {
                  step: '03',
                  title: 'Receba, imprima e despache',
                  desc: 'Os pedidos caem na tela da cozinha com sinal sonoro, comanda formatada e status em tempo real até a entrega.',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex items-start gap-5 rounded-2xl border border-black/5 bg-white p-6 shadow-xs transition hover:shadow-md"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--pv-surface-soft)] font-mono text-lg font-black text-[var(--pv-primary)]">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. BASTIDORES DA FASE PILOTO (AUTORIDADE & CREDIBILIDADE REAL) */}
      <section id="piloto" className="px-5 pb-20 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl bg-[var(--pv-surface-soft)] p-8 sm:p-12 lg:p-14 border border-[var(--pv-border)]/50">
          <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[var(--pv-primary)] shadow-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Fase de Validação Assistida
              </span>

              <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                Construindo o futuro do delivery ao lado de quem vende de verdade.
              </h2>

              <p className="mt-4 text-base leading-relaxed text-[var(--pv-text-muted)]">
                A <strong>Pode Vir</strong> está sendo validada diretamente em operações reais de food service. Acompanhamos a rotina dos nossos estabelecimentos parceiros para entregar uma ferramenta veloz, estável e sob medida para o ritmo da cozinha antes de qualquer abertura pública.
              </p>

              {/* Lojas piloto representadas com elegância */}
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-bold text-slate-500">Operações participantes:</span>
                {['Bulls BBQ Burguer', 'Emanuele Confeitaria', 'Jeffs Burgueria'].map((storeName) => (
                  <span
                    key={storeName}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3 py-1 text-xs font-bold text-slate-800 shadow-2xs"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {storeName}
                  </span>
                ))}
              </div>
            </div>

            {/* Ação institucional para interessados */}
            <div className="flex flex-col items-start rounded-2xl border border-white/80 bg-white p-6 shadow-xs sm:p-7">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Interesse no Piloto</span>
              <h3 className="mt-2 text-lg font-extrabold text-slate-900">Tem um estabelecimento?</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Se você tem um restaurante, lanchonete ou confeitaria e gostaria de se candidatar para uma próxima turma de testes do piloto, converse com nossa equipe.
              </p>

              <a
                href={whatsappContactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--pv-primary)] px-5 py-3 text-xs font-bold text-white shadow-md transition hover:bg-[var(--pv-primary-hover)] hover:-translate-y-0.5"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Conversar sobre o piloto</span>
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 6. PERGUNTAS FREQUENTES (FAQ) */}
      <section id="duvidas" className="border-t border-black/5 bg-white px-5 py-24 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <span className="rounded-full bg-[var(--pv-surface-soft)] px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-[var(--pv-primary)]">
              Perguntas Frequentes
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Tire suas dúvidas sobre a plataforma.
            </h2>
          </div>

          <div className="mt-12 divide-y divide-slate-100">
            {faqs.map(([question, answer], index) => (
              <article key={question} className="py-5">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                  className="flex w-full items-center justify-between gap-4 text-left text-base font-extrabold text-slate-900 sm:text-lg"
                >
                  <span>{question}</span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${
                      openFaq === index ? 'rotate-180 text-[var(--pv-primary)]' : ''
                    }`}
                  />
                </button>
                {openFaq === index && (
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 font-medium">{answer}</p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 7. FOOTER INSTITUCIONAL */}
      <footer className="bg-[var(--pv-dark)] px-5 py-12 text-white sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <PodeVirBrand size="md" light />
            <p className="mt-3 max-w-sm text-xs text-white/60 leading-relaxed">
              Tecnologia de cardápio digital, impressão térmica e gestão de pedidos em operação assistida com estabelecimentos reais.
            </p>
            <p className="mt-3 text-xs font-medium text-white/40">
              {platformBrand.copyright}
            </p>
          </div>

          <nav className="flex flex-wrap gap-5 text-xs font-bold text-white/70">
            <a className="transition hover:text-white" href={storeUrl}>
              Ver demonstração
            </a>
            <a className="transition hover:text-white" href={adminUrl}>
              Acesso do lojista
            </a>
            <a className="transition hover:text-white" href="#recursos">
              Recursos
            </a>
            <a className="transition hover:text-white" href="#operacao">
              Como funciona
            </a>
            <a className="transition hover:text-white" href="#piloto">
              O Piloto
            </a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
