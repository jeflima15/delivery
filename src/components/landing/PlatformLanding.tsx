import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, CalendarDays, Check, ChevronDown, ClipboardList, FileCheck2, FileImage, Layers3, Menu, MessageCircle, Printer, Sparkles, Store, Ticket, Truck, UsersRound, WalletCards, X } from 'lucide-react';
import PodeVirBrand from '../brand/PodeVirBrand';
import { platformBrand } from '../../config/brand';
import ProductPreview, { PreorderPreview } from './ProductPreview';
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
  { Icon: Layers3, title: 'Um cardápio com suas escolhas', text: 'Organize produtos, adicionais e combos. Apresente tudo com as cores e a identidade da sua loja.', label: 'PARA VENDER' },
  { Icon: Ticket, title: 'Motivos para voltar', text: 'Configure cupons e um programa de pontos com as regras da sua operação.', label: 'PARA INCENTIVAR' },
  { Icon: UsersRound, title: 'Clientes e equipe por perto', text: 'Consulte o histórico de compras dos clientes e convide a equipe com funções de acesso.', label: 'PARA ACOMPANHAR' },
  { Icon: WalletCards, title: 'Recebimentos à vista', text: 'Registre entradas e retiradas, acompanhe recebimentos e confira o fechamento do caixa.', label: 'PARA CONFERIR' },
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
    document.title = landingTitle;
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
              <p className="pv-eyebrow"><span /> PARA QUEM ATENDE, PREPARA E VENDE</p>
              <h1>Seu cardápio online.<br /><span>Sua operação<br className="pv-desktop-break" /> no controle.</span></h1>
              <p className="pv-lead">Receba pedidos pelo link e organize encomendas com data, referências e controle de sinal e saldo. Tudo no painel da sua loja.</p>
              <div className="pv-hero-actions">
                <ContactLink position="hero" />
                <a href="#produto" className="pv-button pv-button-outline" onClick={() => trackLandingAction('demo', 'hero')}>Ver como funciona<ArrowDown aria-hidden="true" /></a>
              </div>
              <p className="pv-hero-note">Fase piloto · Entrada por convite e acompanhamento da equipe.</p>
            </div>
            <div className="pv-hero-product">
              <div className="pv-hero-product-label"><span>DO PEDIDO AO COMBINADO</span><span className="pv-label-dot" /> Na mesma operação</div>
              <PreorderPreview compact />
              <div className="pv-hero-product-foot"><span><ClipboardList aria-hidden="true" /> Pedidos para agora</span><span><CalendarDays aria-hidden="true" /> Encomendas para depois</span></div>
              <p className="pv-demo-caption">Exemplo ilustrativo · Dados fictícios</p>
            </div>
          </div>
          <div className="pv-container pv-operation-strip">
            <span><Store aria-hidden="true" /> Um link com a sua marca</span>
            <span><Truck aria-hidden="true" /> Delivery e retirada</span>
            <span><CalendarDays aria-hidden="true" /> Pedidos e encomendas</span>
          </div>
        </section>

        <section id="produto" tabIndex={-1} className="pv-section pv-product-section">
          <div className="pv-container">
            <div className="pv-section-heading"><p className="pv-eyebrow">CONHEÇA POR DENTRO</p><h2>Na frente, a sua loja.<br />Nos bastidores, a Pode Vir.</h2><p>Uma experiência para quem compra. Uma rotina organizada para quem vende.</p></div>
            <ProductPreview />
            <div className="pv-example-link"><span>Quer conhecer a experiência do cliente?</span><a href={exampleStoreUrl} onClick={() => trackLandingAction('example', 'product')}>Ver exemplo de vitrine<ArrowRight aria-hidden="true" /></a></div>
          </div>
        </section>

        <section id="encomendas" tabIndex={-1} className="pv-section pv-preorders-section">
          <div className="pv-container pv-preorders-grid">
            <div>
              <p className="pv-eyebrow">PARA O QUE TEM DIA E HORA</p>
              <h2>O combinado no WhatsApp<br />ganha lugar na sua rotina.</h2>
              <p className="pv-section-lead">Bolos, kits, doces ou pedidos para outra data. Registre a encomenda e encontre os detalhes quando precisar.</p>
              <ol className="pv-preorder-steps">
                <li><span>01</span><div><h3>Combine e registre</h3><p>Descrição, valor e até três fotos de referência para uma encomenda personalizada.</p></div></li>
                <li><span>02</span><div><h3>Reserve a data</h3><p>Organize dias, horários, antecedência e limites para os pedidos agendados.</p></div></li>
                <li><span>03</span><div><h3>Acompanhe até a entrega</h3><p>Confira sinal e saldo, atualize o andamento e compartilhe o resumo pelo WhatsApp.</p></div></li>
              </ol>
              <p className="pv-payment-note"><WalletCards aria-hidden="true" /><span>A loja confere o pagamento no banco e registra o recebimento no painel. O Pix não é confirmado automaticamente.</span></p>
            </div>
            <div className="pv-preorders-visual">
              <div className="pv-preorder-detail">
                <p className="pv-preview-overline">ENCOMENDA PERSONALIZADA · EXEMPLO</p>
                <div className="pv-detail-title"><CalendarDays aria-hidden="true" /><div><h3>Bolo de aniversário</h3><p>Retirada · Amanhã, 15h às 16h</p></div></div>
                <div className="pv-detail-description"><span>O que foi combinado</span><p>Bolo para 20 pessoas, massa de chocolate e decoração em tons de verde.</p></div>
                <div className="pv-detail-reference"><FileImage aria-hidden="true" /><div><strong>Referências reunidas</strong><span>Descrição e fotos junto à encomenda</span></div></div>
                <dl className="pv-payment-grid"><div><dt>Total</dt><dd>R$ 240,00</dd></div><div><dt>Recebido</dt><dd>R$ 120,00</dd></div><div className="pv-balance"><dt>Saldo restante</dt><dd>R$ 120,00</dd></div></dl>
                <div className="pv-detail-status"><Check aria-hidden="true" /><span>Sinal recebido<span>Registro feito pela equipe</span></span></div>
              </div>
              <p className="pv-demo-caption">Representação ilustrativa com dados fictícios.</p>
              <p className="pv-preorders-bottom">Pedido para agora, encomenda ou os dois.<br /><strong>A operação segue o jeito da sua loja.</strong></p>
            </div>
          </div>
        </section>

        <section id="como-funciona" tabIndex={-1} className="pv-section pv-start-section">
          <div className="pv-container">
            <div className="pv-section-heading"><p className="pv-eyebrow">DO PRIMEIRO CONTATO À ROTINA</p><h2>Um começo com acompanhamento.</h2><p>Conheça a ferramenta e prepare a loja para o seu jeito de vender.</p></div>
            <ol className="pv-start-steps">
              <li><span className="pv-step-number">01</span><MessageCircle aria-hidden="true" /><h3>Conte sobre sua loja</h3><p>Converse com a equipe sobre sua operação e a participação na fase piloto.</p></li>
              <li><span className="pv-step-number">02</span><Store aria-hidden="true" /><h3>Prepare seu cardápio</h3><p>Configure produtos, identidade, horários, entrega, retirada e encomendas.</p></li>
              <li><span className="pv-step-number">03</span><ClipboardList aria-hidden="true" /><h3>Compartilhe e acompanhe</h3><p>Divulgue o link da loja e cuide dos pedidos e das encomendas pelo painel.</p></li>
            </ol>
            {showCatalogImport && <div className="pv-import-block">
              <div><p className="pv-eyebrow"><Sparkles aria-hidden="true" /> IMPORTAÇÃO ASSISTIDA</p><h3>Seu cardápio atual pode ser o ponto de partida.</h3><p>Envie uma imagem ou PDF. A IA prepara um rascunho para você revisar e confirmar antes de adicionar os itens à loja.</p></div>
              <ol><li><FileImage aria-hidden="true" /><strong>Seu arquivo</strong><span>Imagem ou PDF</span></li><li><Sparkles aria-hidden="true" /><strong>Rascunho com IA</strong><span>Confira e ajuste</span></li><li><FileCheck2 aria-hidden="true" /><strong>Sua confirmação</strong><span>Revise a prévia</span></li></ol>
            </div>}
          </div>
        </section>

        <section className="pv-section pv-capabilities-section" aria-labelledby="capabilities-title">
          <div className="pv-container">
            <div className="pv-section-heading"><p className="pv-eyebrow">ALÉM DO PRIMEIRO PEDIDO</p><h2 id="capabilities-title">As peças da sua operação,<br />mais próximas.</h2><p>Recursos para cuidar do cardápio, do atendimento e dos registros do dia a dia.</p></div>
            <div className="pv-capabilities">{capabilities.map(({ Icon, title, text, label }) => <article key={title}><Icon aria-hidden="true" /><span>{label}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
            <div className="pv-operation-extras"><span><Printer aria-hidden="true" /> Comandas de 58 mm e 80 mm pelo navegador</span><span><Truck aria-hidden="true" /> Entrega por bairros ou regiões no mapa</span></div>
          </div>
        </section>

        <section id="piloto" tabIndex={-1} className="pv-section pv-pilot-section">
          <div className="pv-container pv-pilot-grid">
            <div><p className="pv-eyebrow">CONSTRUÍDA PERTO DA OPERAÇÃO</p><h2>Quem atende e prepara<br />faz parte dessa conversa.</h2><p className="pv-section-lead">A Pode Vir está em fase piloto, com acompanhamento próximo para observar a rotina das lojas e evoluir a plataforma.</p><p className="pv-participants-label">Operações participantes do piloto</p><ul className="pv-participants">{['Bulls BBQ Burguer', 'Emanuele Confeitaria', 'Jeffs Burgueria'].map((name) => <li key={name}>{name}</li>)}</ul></div>
            <aside className="pv-pilot-contact"><MessageCircle aria-hidden="true" /><h3>Vamos conhecer sua loja?</h3><p>Conte o que você vende e como recebe os pedidos. A equipe apresenta a ferramenta e conversa sobre os próximos passos.</p><ContactLink position="pilot">Conversar pelo WhatsApp</ContactLink><p className="pv-pilot-disclaimer">Cadastro público e planos comerciais ainda não estão disponíveis.</p></aside>
          </div>
        </section>

        <section id="duvidas" tabIndex={-1} className="pv-section pv-faq-section">
          <div className="pv-container pv-faq-grid">
            <div><p className="pv-eyebrow">ANTES DE COMEÇAR</p><h2>Uma boa conversa<br />começa sem dúvidas.</h2><p>Os detalhes que ajudam você a entender a ferramenta e o acesso.</p></div>
            <div className="pv-faq-list">{landingFaqs.map(({ question, answer }, index) => <article key={question}><h3><button type="button" id={`faq-question-${index}`} aria-expanded={openFaq === index} aria-controls={`faq-answer-${index}`} onClick={() => setOpenFaq(openFaq === index ? null : index)}>{question}<ChevronDown aria-hidden="true" /></button></h3><div id={`faq-answer-${index}`} role="region" aria-labelledby={`faq-question-${index}`} hidden={openFaq !== index}><p>{answer}</p></div></article>)}</div>
          </div>
        </section>

        <section className="pv-final-section" aria-labelledby="final-cta-title">
          <div className="pv-container pv-final-inner"><div><p className="pv-eyebrow">PODE VIR. A LOJA É SUA.</p><h2 id="final-cta-title">Vamos colocar sua rotina<br />nessa conversa?</h2><p>Conheça o cardápio online, o painel de pedidos e as encomendas da Pode Vir.</p></div><ContactLink position="final" light /></div>
        </section>
      </main>

      <footer className="pv-footer">
        <div className="pv-container pv-footer-top"><div><a href="#inicio" aria-label="Pode Vir — início"><PodeVirBrand variant="wordmark" /></a><p>Cardápio, pedidos e encomendas.<br />Com a sua loja na frente.</p></div><nav aria-label="Navegação do rodapé"><a href={exampleStoreUrl} onClick={() => trackLandingAction('example', 'footer')}>Exemplo de vitrine</a><a href="/login" onClick={() => trackLandingAction('merchant_login', 'footer')}>Acesso do lojista</a><a href="#encomendas">Encomendas</a><a href="#produto">Produto</a><a href="#piloto">O piloto</a></nav></div>
        <div className="pv-container pv-footer-bottom"><p suppressHydrationWarning>{platformBrand.copyright}</p><a href={`mailto:${platformBrand.supportEmail}`}>{platformBrand.supportEmail}</a></div>
      </footer>
    </div>
  );
}
