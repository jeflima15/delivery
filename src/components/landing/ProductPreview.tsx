import { CakeSlice, CalendarDays, Check, ChefHat, ClipboardList, Clock3, Image, Layers3, ShoppingBag, Store } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';

const previews = [
  { id: 'catalog', label: 'Cardápio', Icon: Store, title: 'Sua loja, do seu jeito.', description: 'Produtos, adicionais e combos em um link com a identidade da sua loja. O cliente consulta, escolhe e faz o pedido pelo navegador.' },
  { id: 'orders', label: 'Pedidos', Icon: ClipboardList, title: 'Cada pedido no seu lugar.', description: 'Acompanhe a fila, atualize o andamento e prepare a comanda. Entrega e retirada seguem a configuração da sua operação.' },
  { id: 'preorders', label: 'Encomendas', Icon: CalendarDays, title: 'O combinado fica organizado.', description: 'Consulte encomendas por data, acompanhe referências e confira o que já foi recebido e o que ainda falta registrar.' },
] as const;

export function PreorderPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`pv-preorder-preview ${compact ? 'pv-preview-compact' : ''}`}>
      <div className="pv-preview-heading"><div><span className="pv-preview-overline">Painel da loja</span><h3>Encomendas</h3></div><CalendarDays aria-hidden="true" /></div>
      {!compact && <div className="pv-preview-filters"><span>Todas</span><span className="is-active">Amanhã</span><span>Próximos 7 dias</span></div>}
      <article className="pv-order-paper">
        <div className="pv-order-paper-top"><span>#0108 · Retirada</span><span className="pv-status">Sinal recebido</span></div>
        <div className="pv-order-item"><span className="pv-food-symbol"><CakeSlice aria-hidden="true" /></span><div><h4>Bolo de aniversário</h4><p>Personalizado · 20 pessoas</p></div></div>
        <p className="pv-date-line"><Clock3 aria-hidden="true" /> Amanhã, das 15h às 16h</p>
        {!compact && <div className="pv-reference-line"><Image aria-hidden="true" /><span>Descrição e fotos de referência no pedido</span></div>}
        <dl className="pv-payment-grid"><div><dt>Total</dt><dd>R$ 240,00</dd></div><div><dt>Recebido</dt><dd>R$ 120,00</dd></div><div className="pv-balance"><dt>Saldo restante</dt><dd>R$ 120,00</dd></div></dl>
        <p className="pv-paper-note"><Check aria-hidden="true" /> Recebimento registrado pela equipe</p>
      </article>
      {!compact && <div className="pv-next-order"><span className="pv-next-dot" /><div><strong>Kit festa</strong><span>Retirada · Amanhã, 17h</span></div><span className="pv-status pv-status-neutral">Aguardando sinal</span></div>}
    </div>
  );
}

function CatalogPreview() {
  return (
    <div className="pv-catalog-preview">
      <div className="pv-store-cover"><span>FEITO AQUI. ESCOLHIDO POR VOCÊ.</span><ChefHat aria-hidden="true" /></div>
      <div className="pv-store-title"><span className="pv-shop-symbol"><Store aria-hidden="true" /></span><div><h3>Cozinha da Vila</h3><p>Entrega e retirada</p></div><span className="pv-status">Aberto</span></div>
      <div className="pv-preview-filters"><span className="is-active">Destaques</span><span>Combos</span><span>Doces</span></div>
      <div className="pv-catalog-products">
        <article><span className="pv-product-art"><Layers3 aria-hidden="true" /></span><div><h4>Combo da casa</h4><p>Lanche, acompanhamento e bebida.</p><strong>R$ 34,90</strong></div></article>
        <article><span className="pv-product-art pv-product-art-cake"><CakeSlice aria-hidden="true" /></span><div><h4>Bolo personalizado</h4><p>Escolha a data para sua encomenda.</p><strong>R$ 240,00</strong></div></article>
      </div>
    </div>
  );
}

function OrdersPreview() {
  return (
    <div className="pv-orders-preview">
      <div className="pv-preview-heading"><div><span className="pv-preview-overline">Painel da loja</span><h3>Fila de pedidos</h3></div><ShoppingBag aria-hidden="true" /></div>
      <p className="pv-preview-subtitle">Pedidos imediatos · Entrega e retirada</p>
      <div className="pv-order-columns">
        <div><h4><span className="pv-column-dot" />Pendente <span>1</span></h4><article><span className="pv-order-id">#0111 · Entrega</span><h5>2 × Combo da casa</h5><p>Centro · Cartão</p><strong>R$ 69,80</strong><span className="pv-order-tag">Pedido recebido</span></article></div>
        <div><h4><span className="pv-column-dot pv-column-dot-green" />Preparando <span>1</span></h4><article><span className="pv-order-id">#0110 · Retirada</span><h5>1 × Torta + bebida</h5><p>Retirada na loja · Pix</p><strong>R$ 42,00</strong><span className="pv-order-tag pv-order-tag-green">Em produção</span></article></div>
      </div>
      <p className="pv-paper-note"><ClipboardList aria-hidden="true" /> Andamento e comanda no painel da loja</p>
    </div>
  );
}

export default function ProductPreview() {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = previews[activeIndex];

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % previews.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + previews.length) % previews.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = previews.length - 1;
    else return;
    event.preventDefault();
    setActiveIndex(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="pv-product-tour">
      <div className="pv-tour-copy">
        <div role="tablist" aria-label="Conheça as áreas da Pode Vir" className="pv-tour-tabs">
          {previews.map(({ id, label, Icon }, index) => <button key={id} type="button" role="tab" id={`preview-tab-${id}`} aria-selected={activeIndex === index} aria-controls={`preview-panel-${id}`} tabIndex={activeIndex === index ? 0 : -1} ref={(node) => { tabRefs.current[index] = node; }} onClick={() => setActiveIndex(index)} onKeyDown={(event) => navigateTabs(event, index)}><Icon aria-hidden="true" />{label}</button>)}
        </div>
        <div className="pv-tour-description"><h3>{active.title}</h3><p>{active.description}</p></div>
        <p className="pv-demo-caption">Representações ilustrativas com dados fictícios. Os campos e estados seguem os recursos da plataforma.</p>
      </div>
      <div className="pv-tour-screen">
        <div className="pv-window-bar" aria-hidden="true"><span /><span /><span /><p>Pode Vir · {active.label}</p></div>
        {previews.map(({ id }, index) => <div key={id} role="tabpanel" id={`preview-panel-${id}`} aria-labelledby={`preview-tab-${id}`} hidden={activeIndex !== index} tabIndex={0} className="pv-tour-panel">{id === 'catalog' ? <CatalogPreview /> : id === 'orders' ? <OrdersPreview /> : <PreorderPreview />}</div>)}
      </div>
    </div>
  );
}
