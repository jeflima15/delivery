import { ArrowDown, ArrowRight, Check, ChefHat, ClipboardList, FileImage, LayoutDashboard, Plus, Sparkles, Store, Truck } from 'lucide-react';

/** Marketing illustrations only: no store data, consumer state or operational actions. */
export function HeroShowcase() {
  return (
    <figure className="pv-showcase" aria-label="Ilustração de um cardápio no celular ao lado do painel de pedidos da loja">
      <div className="pv-showcase-orbit" aria-hidden="true" />
      <div className="pv-showcase-dashboard" aria-hidden="true">
        <div className="pv-dashboard-bar"><span className="pv-mini-brand">pv<span>·</span></span><span>Painel da loja</span><span className="pv-dashboard-avatar">CV</span></div>
        <div className="pv-dashboard-body">
          <div className="pv-dashboard-title"><div><span>COZINHA DA VILA</span><strong>Bom dia, equipe.</strong></div><LayoutDashboard /></div>
          <div className="pv-dashboard-stats"><div><span>Pedidos ativos</span><strong>03</strong></div><div><span>Preparando</span><strong>01</strong></div></div>
          <div className="pv-dashboard-queue"><span>Fila de pedidos</span><span>Ver pedidos <ArrowRight /></span></div>
          <div className="pv-dashboard-order"><span className="pv-mini-order-icon"><Truck /></span><div><strong>#0111 · Entrega</strong><span>2 × Combo da casa</span></div><span className="pv-mini-status">Pendente</span></div>
          <div className="pv-dashboard-order"><span className="pv-mini-order-icon"><Store /></span><div><strong>#0110 · Retirada</strong><span>1 × Torta + bebida</span></div><span className="pv-mini-status is-preparing">Preparando</span></div>
          <div className="pv-dashboard-order"><span className="pv-mini-order-icon"><Truck /></span><div><strong>#0109 · Entrega</strong><span>1 × Combo da casa</span></div><span className="pv-mini-status">Pendente</span></div>
        </div>
      </div>
      <div className="pv-showcase-phone" aria-hidden="true">
        <div className="pv-phone-top"><span>9:41</span><span className="pv-phone-camera" /><span>● ▰</span></div>
        <div className="pv-phone-store"><span><ChefHat /></span><div><strong>Cozinha da Vila</strong><span>Feito aqui. Pra você.</span></div></div>
        <div className="pv-phone-photo"><img src="/brand/landing-burger.webp" alt="" width={640} height={640} fetchPriority="high" /><span>O favorito da casa</span></div>
        <div className="pv-phone-product"><span>FEITO COM CAPRICHO</span><strong>Combo da casa</strong><p>Lanche, acompanhamento e bebida.</p><div><b>R$ 34,90</b><span className="pv-phone-add"><Plus /></span></div></div>
        <div className="pv-phone-footer"><Store /> Entrega e retirada</div>
      </div>
      <div className="pv-showcase-note" aria-hidden="true"><span><Check /></span><div><strong>Da escolha ao preparo.</strong><span>Sua loja, de ponta a ponta.</span></div></div>
      <figcaption>Representação ilustrativa · Loja e dados fictícios</figcaption>
    </figure>
  );
}

export function ImportShowcase() {
  return (
    <div className="pv-import-visual" aria-label="Fluxo ilustrativo: arquivo, rascunho com IA e revisão pela loja">
      <div className="pv-import-source"><div className="pv-import-file"><FileImage /><span>Seu cardápio<span>Imagem ou PDF</span></span></div><div className="pv-paper-menu" aria-hidden="true"><span>MENU DA CASA</span><div>Combo da casa <b>34,90</b></div><div>Bolo personalizado <b>240,00</b></div><i /><i /></div></div>
      <div className="pv-import-connector" aria-hidden="true"><ArrowRight /><Sparkles /></div>
      <div className="pv-import-draft"><div className="pv-import-draft-title"><ClipboardList /><span>Rascunho com IA</span><span>Revisar</span></div><div className="pv-draft-row"><Check /><span>Combo da casa<small>Confira nome, descrição e valor</small></span></div><div className="pv-draft-row"><Check /><span>Bolo personalizado<small>Ajuste antes de confirmar</small></span></div><div className="pv-draft-confirm"><span>Você revisa. Você confirma.</span><ArrowDown /></div></div>
    </div>
  );
}
