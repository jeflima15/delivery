import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, CalendarDays, Check, ChevronDown, FileImage, Layers3, Menu, MessageCircle, Printer, Sparkles, Store, Ticket, Truck, UsersRound, WalletCards, X } from 'lucide-react';
import PodeVirBrand from '../brand/PodeVirBrand';
import { platformBrand } from '../../config/brand';
import ProductPreview from './ProductPreview';
import { HeroShowcase, ImportShowcase } from './LandingVisuals';
import { exampleStoreUrl, landingContactUrl, landingDescription, landingFaqs, landingTitle, platformOrigin, showCatalogImport } from './landingContent';
import { trackLandingAction, type LandingPosition } from './landingAnalytics';
import './landing.css';

const navigation = [
  ['Produto', '#produto'],
  ['Encomendas', '#encomendas'],
  ['Como funciona', '#como-funciona'],
  ['O piloto', '#piloto'],
  ['Dúvidas', '#duvidas'],
];

const capabilities = [
  { Icon: Layers3, title: 'Um cardápio com suas escolhas', text: 'Produtos, adicionais e combos com a identidade da sua loja.', label: 'PARA VENDER' },
  { Icon: Ticket, title: 'Motivos para voltar', text: 'Configure cupons e um programa de pontos com as regras da sua operação.', label: 'PARA INCENTIVAR' },
  { Icon: UsersRound, title: 'Clientes e equipe por perto', text: 'Histórico de compras e equipe com funções de acesso.', label: 'PARA ACOMPANHAR' },
  { Icon: WalletCards, title: 'Recebimentos à vista', text: 'Entradas, retiradas e recebimentos para conferir o fechamento.', label: 'PARA CONFERIR' },
];

function ContactLink({ position, children = 'Conhecer a Pode Vir', light = false }: { position: LandingPosition; children?: ReactNode; light?: boolean }) {
  return <a className={`pv-button ${light ? 'pv-button-light' : 'pv-button-primary'}`} href={landingContactUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackLandingAction('contact', position)}><MessageCircle aria-hidden="true" />{children}<ArrowRight aria-hidden="true" /></a>;
}

export default function PlatformLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const mobileMenu = useRef<HTMLElement>(null);

  useEffect(() => {
    const entries = [
      ['name', 'description', landingDescription],
      ['property', 'og:title', landingTitle],
      ['property', 'og:description', landingDescription],
      ['property', 'og:image', `${platformOrigin || ''}/brand/pode-vir-social.png`],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', landingTitle],
      ['name', 'twitter:description', landingDescription],
      ['name', 'twitter:image', `${platformOrigin || ''}/brand/pode-vir-social.png`],
    ];
    for (const [attribute, key, content] of entries) {
      let meta = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attribute, key);
        document.head.appendChild(meta);
      }
      meta.content = content;
    }
    if (platformOrigin) {
      let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = `${platformOrigin}/`;
      let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
      if (!ogUrl) {
        ogUrl = document.createElement('meta');
        ogUrl.setAttribute('property', 'og:url');
        document.head.appendChild(ogUrl);
      }
      ogUrl.content = canonical.href;
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    mobileMenu.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const desktop = window.matchMedia('(min-width: 1100px)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside);
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside);
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, [menuOpen]);

  return (
    <div className="pv-landing">
      <a href="#conteudo" className="pv-skip-link">Ir para o conteúdo</a>
      <header className="pv-header" ref={header}>
        <div className="pv-container pv-header-inner">
          <a href="#inicio" aria-label="Pode Vir — início" className="pv-brand-link"><PodeVirBrand variant="wordmark" priority /></a>
          <nav aria-label="Navegação principal" className="pv-desktop-nav">
            {navigation.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className="pv-header-actions">
            <a className="pv-login-link" href="/login" onClick={() => trackLandingAction('merchant_login', 'header')}>Acesso do lojista</a>
            <ContactLink position="header" />
          </div>
          <button className="pv-menu-button" ref={menuButton} type="button" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} aria-controls="menu-mobile" onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
          <nav id="menu-mobile" aria-label="Navegação móvel" ref={mobileMenu} className="pv-mobile-nav" hidden={!menuOpen} onBlur={(event) => {
            if (event.relatedTarget && !header.current?.contains(event.relatedTarget as Node)) setMenuOpen(false);
          }}>
            {navigation.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}<ArrowRight aria-hidden="true" /></a>)}
            <a href="/login" onClick={() => { trackLandingAction('merchant_login', 'mobile_menu'); setMenuOpen(false); }}>Acesso do lojista<ArrowRight aria-hidden="true" /></a>
            <a href={landingContactUrl} target="_blank" rel="noopener noreferrer" onClick={() => { trackLandingAction('contact', 'mobile_menu'); setMenuOpen(false); }}>Conhecer a Pode Vir<MessageCircle aria-hidden="true" /></a>
          </nav>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1}>
        <section id="inicio" className="pv-hero">
          <div className="pv-container pv-hero-grid">
            <div className="pv-hero-copy">
              <p className="pv-eyebrow"><span /> DA VITRINE À OPERAÇÃO</p>
              <h1>Seu cardápio online.<br /><span>Sua operação<br className="pv-desktop-break" /> <em>no controle.</em></span></h1>
              <p className="pv-lead">O sabor é seu. A organização vem com a Pode Vir. Cardápio, pedidos e encomendas no mesmo lugar.</p>
              <div className="pv-hero-actions">
                <ContactLink position="hero" />
                <a href="#produto" className="pv-button pv-button-outline" onClick={() => trackLandingAction('demo', 'hero')}>Ver como funciona<ArrowDown aria-hidden="true" /></a>
              </div>
              <p className="pv-hero-note">Fase piloto · Entrada por convite e acompanhamento.</p>
              {showCatalogImport && <a href="#importacao" className="pv-hero-ai"><span><Sparkles aria-hidden="true" /> COM IA</span> Seu cardápio atual é o ponto de partida <ArrowRight aria-hidden="true" /></a>}
            </div>
            <HeroShowcase />
          </div>
          <div className="pv-container pv-operation-strip">
            <span><Store aria-hidden="true" /> A identidade da sua loja</span>
            <span><Truck aria-hidden="true" /> Delivery e retirada</span>
            <span><CalendarDays aria-hidden="true" /> Pedidos e encomendas</span>
          </div>
        </section>

        {showCatalogImport && <section id="importacao" tabIndex={-1} className="pv-import-section">
          <div className="pv-container pv-import-block">
            <div className="pv-import-copy">
              <p className="pv-eyebrow"><Sparkles aria-hidden="true" /> UM COMEÇO COM INTELIGÊNCIA ARTIFICIAL</p>
              <h2>Seu cardápio já existe.<br /><span>Comece por ele.</span></h2>
              <p>Envie uma imagem ou PDF. A IA prepara um rascunho para você revisar e confirmar antes de adicionar os itens à loja.</p>
              <span className="pv-import-reassurance"><Check aria-hidden="true" /> A última palavra é sempre sua.</span>
            </div>
            <ImportShowcase />
          </div>
        </section>}

        <section id="produto" tabIndex={-1} className="pv-section pv-product-section">
          <div className="pv-container">
            <div className="pv-section-heading pv-heading-row"><div><p className="pv-eyebrow">UM PRODUTO. DOIS LADOS.</p><h2>Bonito para quem compra.<br /><span>Prático para quem vende.</span></h2></div><p>Explore a vitrine e os bastidores da sua operação.</p></div>
            <ProductPreview />
            <div className="pv-example-link"><span>Da demonstração para uma loja:</span><a href={exampleStoreUrl} onClick={() => trackLandingAction('example', 'product')}>Ver exemplo de vitrine<ArrowRight aria-hidden="true" /></a></div>
          </div>
        </section>

        <section id="encomendas" tabIndex={-1} className="pv-section pv-preorders-section">
          <div className="pv-container pv-preorders-grid">
            <div>
              <p className="pv-eyebrow"><CalendarDays aria-hidden="true" /> PARA O QUE TEM DIA E HORA</p>
              <h2>Cada combinado.<br /><span>Cada detalhe.</span></h2>
              <p className="pv-section-lead">Do bolo personalizado ao kit de festa: reúna data, referências e valores junto à encomenda.</p>
              <ul className="pv-preorder-benefits">
                <li><Check aria-hidden="true" /> Descrição e até três fotos de referência</li>
                <li><Check aria-hidden="true" /> Agenda com horários, antecedência e limites</li>
                <li><Check aria-hidden="true" /> Sinal, saldo e resumo pelo WhatsApp</li>
              </ul>
              <p className="pv-payment-note">A loja confere e registra os recebimentos. O Pix não é confirmado automaticamente.</p>
            </div>
            <div className="pv-reservation">
              <div className="pv-reservation-date"><CalendarDays aria-hidden="true" /><span>AMANHÃ<strong>15h–16h</strong><small>Retirada na loja</small></span><span className="pv-reservation-badge">Encomenda</span></div>
              <div className="pv-reservation-body"><div className="pv-reservation-title"><span>#0108 · EXEMPLO</span><h3>Bolo de aniversário</h3></div><p>20 pessoas · Chocolate · Decoração em verde</p><div className="pv-reservation-reference"><FileImage aria-hidden="true" /><span>Descrição e fotos de referência<br /><strong>O combinado fica junto do pedido.</strong></span></div><dl className="pv-payment-grid"><div><dt>Total</dt><dd>R$ 240,00</dd></div><div><dt>Recebido</dt><dd>R$ 120,00</dd></div><div className="pv-balance"><dt>Saldo restante</dt><dd>R$ 120,00</dd></div></dl><p className="pv-paper-note"><Check aria-hidden="true" /> Recebimento registrado pela equipe</p></div>
              <p className="pv-demo-caption">Representação ilustrativa · Dados fictícios</p>
            </div>
          </div>
        </section>

        <section className="pv-section pv-capabilities-section" aria-labelledby="capabilities-title">
          <div className="pv-container">
            <div className="pv-section-heading pv-heading-row"><div><p className="pv-eyebrow">AS PEÇAS SE ENCONTRAM</p><h2 id="capabilities-title">Uma rotina.<br /><span>Muitas possibilidades.</span></h2></div><p>Os recursos do dia a dia, perto de quem faz tudo acontecer.</p></div>
            <div className="pv-capabilities">{capabilities.map(({ Icon, title, text, label }) => <article key={title}><Icon aria-hidden="true" /><span>{label}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
            <div className="pv-operation-extras"><span><Printer aria-hidden="true" /> Comandas de 58 mm e 80 mm pelo navegador</span><span><Truck aria-hidden="true" /> Entrega por bairros ou regiões no mapa</span></div>
          </div>
        </section>

        <section id="como-funciona" tabIndex={-1} className="pv-section pv-start-section">
          <div className="pv-container">
            <div className="pv-section-heading"><p className="pv-eyebrow">SEU PRÓXIMO PASSO</p><h2>Vamos começar pela sua loja.</h2></div>
            <ol className="pv-start-steps">
              <li><span className="pv-step-number">01</span><div><h3>A gente conversa</h3><p>Conte sobre sua operação e conheça a fase piloto.</p></div></li>
              <li><span className="pv-step-number">02</span><div><h3>A loja ganha forma</h3><p>Prepare cardápio, identidade e formas de atendimento.</p></div></li>
              <li><span className="pv-step-number">03</span><div><h3>Seu link vai para o mundo</h3><p>Compartilhe a loja e acompanhe os pedidos no painel.</p></div></li>
            </ol>
            <div id="piloto" tabIndex={-1} className="pv-pilot-inline">
              <div><p className="pv-eyebrow">CONSTRUÍDA PERTO DE QUEM FAZ</p><h3>Gente de verdade. Rotinas diferentes.</h3><p>Acompanhamento próximo das operações participantes do piloto.</p><ul className="pv-participants">{['Bulls BBQ Burguer', 'Emanuele Confeitaria', 'Jeffs Burgueria'].map((name) => <li key={name}>{name}</li>)}</ul></div>
              <div className="pv-pilot-action"><ContactLink position="pilot">Conversar pelo WhatsApp</ContactLink><p className="pv-pilot-disclaimer">Cadastro público e planos comerciais ainda não estão disponíveis.</p></div>
            </div>
          </div>
        </section>

        <section id="duvidas" tabIndex={-1} className="pv-section pv-faq-section">
          <div className="pv-container pv-faq-grid">
            <div><p className="pv-eyebrow">ANTES DE COMEÇAR</p><h2>Respostas diretas.</h2><p>O que saber antes de começar.</p></div>
            <div className="pv-faq-list">{landingFaqs.map(({ question, answer }, index) => <article key={question}><h3><button type="button" id={`faq-question-${index}`} aria-expanded={openFaq === index} aria-controls={`faq-answer-${index}`} onClick={() => setOpenFaq(openFaq === index ? null : index)}>{question}<ChevronDown aria-hidden="true" /></button></h3><div id={`faq-answer-${index}`} role="region" aria-labelledby={`faq-question-${index}`} hidden={openFaq !== index}><p>{answer}</p></div></article>)}</div>
          </div>
        </section>

        <section className="pv-final-section" aria-labelledby="final-cta-title">
          <div className="pv-container pv-final-inner"><div><p className="pv-eyebrow">PODE VIR. A LOJA É SUA.</p><h2 id="final-cta-title">Você cuida do sabor.<br /><span>Vamos organizar o resto?</span></h2><p>Conheça a plataforma e converse com a equipe sobre sua operação.</p></div><ContactLink position="final" light /></div>
        </section>
      </main>

      <footer className="pv-footer">
        <div className="pv-container pv-footer-top"><div><a href="#inicio" aria-label="Pode Vir — início"><PodeVirBrand variant="wordmark" /></a><p>Cardápio, pedidos e encomendas.<br />Com a sua loja na frente.</p></div><nav aria-label="Navegação do rodapé"><a href={exampleStoreUrl} onClick={() => trackLandingAction('example', 'footer')}>Exemplo de vitrine</a><a href="/login" onClick={() => trackLandingAction('merchant_login', 'footer')}>Acesso do lojista</a><a href="#encomendas">Encomendas</a><a href="#produto">Produto</a><a href="#piloto">O piloto</a></nav></div>
        <div className="pv-container pv-footer-bottom"><p suppressHydrationWarning>{platformBrand.copyright}</p><a href={`mailto:${platformBrand.supportEmail}`}>{platformBrand.supportEmail}</a></div>
      </footer>
    </div>
  );
}
