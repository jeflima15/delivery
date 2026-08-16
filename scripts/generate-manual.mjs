import fs from 'fs';
import path from 'path';

const assetsDir = path.resolve('public/manual-assets');

function getBase64Image(filename) {
  const filePath = path.join(assetsDir, filename);
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath);
    return `data:image/png;base64,${data.toString('base64')}`;
  }
  return '';
}

const imgDashboard = getBase64Image('1_dashboard.png');
const imgPedidos = getBase64Image('2_pedidos_kanban.png');
const imgProdutos = getBase64Image('3_catalogo_produtos.png');
const imgLoja = getBase64Image('4_config_loja.png');
const imgOperacao = getBase64Image('5_config_operacao.png');
const imgEntrega = getBase64Image('6_config_entrega_pagamento.png');
const imgDivulgar = getBase64Image('7_divulgar_loja.png');
const imgMobile = getBase64Image('8_vitrine_mobile.png');

const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manual do Lojista — Pode Vir Delivery</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #059669;
      --primary-dark: #047857;
      --primary-light: #ecfdf5;
      --slate-900: #0f172a;
      --slate-800: #1e293b;
      --slate-700: #334155;
      --slate-600: #475569;
      --slate-500: #64748b;
      --slate-100: #f1f5f9;
      --slate-50: #f8fafc;
      --amber-500: #f59e0b;
      --amber-50: #fffbeb;
      --rose-600: #e11d48;
      --rose-50: #fff1f2;
      --blue-600: #2563eb;
      --blue-50: #eff6ff;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: #f8fafc;
      color: var(--slate-800);
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Floating Action Bar (Não sai na impressão) */
    .top-actions {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(10px);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: white;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
    .top-actions .title {
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .top-actions .btn-print {
      background: var(--primary);
      color: white;
      border: none;
      padding: 10px 20px;
      font-size: 13px;
      font-weight: 700;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(5, 150, 105, 0.3);
    }
    .top-actions .btn-print:hover {
      background: var(--primary-dark);
      transform: translateY(-1px);
    }

    /* Container Principal */
    .container {
      max-width: 960px;
      margin: 32px auto;
      padding: 0 20px;
    }

    .page-card {
      background: white;
      border-radius: 24px;
      border: 1px solid #e2e8f0;
      padding: 48px;
      margin-bottom: 32px;
      box-shadow: 0 4px 25px rgba(0,0,0,0.03);
    }

    /* Capa do Manual */
    .cover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid var(--slate-100);
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .logo-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-badge {
      background: var(--slate-900);
      color: white;
      font-weight: 900;
      font-size: 18px;
      padding: 6px 12px;
      border-radius: 12px;
      letter-spacing: -0.5px;
    }
    .logo-text {
      font-size: 22px;
      font-weight: 900;
      color: var(--slate-900);
      letter-spacing: -0.5px;
    }
    .logo-text span {
      color: var(--primary);
    }
    .badge-pill {
      background: var(--primary-light);
      color: var(--primary-dark);
      border: 1px solid rgba(5, 150, 105, 0.2);
      font-size: 12px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .cover-title {
      font-size: 32px;
      font-weight: 900;
      color: var(--slate-900);
      line-height: 1.2;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }
    .cover-subtitle {
      font-size: 16px;
      color: var(--slate-600);
      line-height: 1.6;
      margin-bottom: 28px;
    }

    /* Grid de Pilares Rápidos */
    .quick-pillars {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    .pillar-card {
      background: var(--slate-50);
      border: 1px solid #e2e8f0;
      padding: 18px;
      border-radius: 16px;
    }
    .pillar-card .icon {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .pillar-card h4 {
      font-size: 14px;
      font-weight: 800;
      color: var(--slate-900);
      margin-bottom: 4px;
    }
    .pillar-card p {
      font-size: 12px;
      color: var(--slate-500);
      line-height: 1.4;
    }

    /* Seções e Módulos */
    .section-title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 22px;
      font-weight: 900;
      color: var(--slate-900);
      margin-top: 16px;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }
    .section-title .num-badge {
      background: var(--primary);
      color: white;
      font-size: 13px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 8px;
    }
    .section-description {
      font-size: 14px;
      color: var(--slate-600);
      margin-bottom: 24px;
      line-height: 1.6;
    }

    /* Screenshots com Molduras Elegantes */
    .screenshot-frame {
      border-radius: 16px;
      border: 1px solid #cbd5e1;
      overflow: hidden;
      margin: 20px 0;
      background: #0f172a;
      box-shadow: 0 8px 30px rgba(0,0,0,0.08);
    }
    .screenshot-header {
      background: #1e293b;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .browser-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-red { background: #ef4444; }
    .dot-yellow { background: #f59e0b; }
    .dot-green { background: #10b981; }
    .screenshot-header span {
      font-size: 11px;
      color: #94a3b8;
      font-family: monospace;
      margin-left: 10px;
    }
    .screenshot-img {
      width: 100%;
      height: auto;
      display: block;
    }

    /* Mockup Mobile */
    .mobile-mockup-wrapper {
      display: flex;
      align-items: center;
      gap: 32px;
      margin: 24px 0;
      background: var(--slate-50);
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 24px;
    }
    .mobile-phone {
      width: 260px;
      flex-shrink: 0;
      border-radius: 24px;
      border: 6px solid #1e293b;
      overflow: hidden;
      box-shadow: 0 12px 35px rgba(0,0,0,0.15);
      background: white;
    }
    .mobile-phone img {
      width: 100%;
      display: block;
    }
    .mobile-tips {
      flex: 1;
    }
    .mobile-tips h4 {
      font-size: 16px;
      font-weight: 800;
      color: var(--slate-900);
      margin-bottom: 12px;
    }
    .mobile-tips ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .mobile-tips li {
      font-size: 13px;
      color: var(--slate-700);
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .mobile-tips li strong {
      color: var(--slate-900);
    }

    /* Cards de Instrução / Passos */
    .step-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 20px 0;
    }
    .step-box {
      background: var(--slate-50);
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 20px;
      border-left: 4px solid var(--primary);
    }
    .step-box.amber {
      border-left-color: var(--amber-500);
    }
    .step-box.blue {
      border-left-color: var(--blue-600);
    }
    .step-box.purple {
      border-left-color: #8b5cf6;
    }
    .step-box h4 {
      font-size: 14px;
      font-weight: 800;
      color: var(--slate-900);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .step-box p {
      font-size: 12px;
      color: var(--slate-600);
      line-height: 1.5;
    }

    /* Callouts e Dicas de Ouro */
    .tip-banner {
      background: var(--primary-light);
      border: 1px solid rgba(5, 150, 105, 0.3);
      border-radius: 16px;
      padding: 16px 20px;
      margin: 20px 0;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .tip-banner .icon {
      font-size: 20px;
      flex-shrink: 0;
    }
    .tip-banner p {
      font-size: 13px;
      color: #065f46;
      font-weight: 600;
      line-height: 1.5;
    }

    /* Tabela de Status do Kanban */
    .status-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 13px;
    }
    .status-table th {
      background: var(--slate-100);
      color: var(--slate-700);
      text-align: left;
      padding: 12px 16px;
      font-weight: 800;
      border-bottom: 2px solid #cbd5e1;
    }
    .status-table td {
      padding: 14px 16px;
      border-bottom: 1px solid #e2e8f0;
      color: var(--slate-700);
    }
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .badge-yellow { background: #fef3c7; color: #92400e; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-purple { background: #ede9fe; color: #5b21b6; }
    .badge-green { background: #dcfce7; color: #166534; }

    /* FAQ */
    .faq-item {
      background: var(--slate-50);
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 18px 20px;
      margin-bottom: 12px;
    }
    .faq-q {
      font-size: 14px;
      font-weight: 800;
      color: var(--slate-900);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .faq-a {
      font-size: 13px;
      color: var(--slate-600);
      line-height: 1.5;
    }

    /* Checklist de Abertura Diária */
    .daily-checklist {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: white;
      border-radius: 20px;
      padding: 28px;
      margin-top: 24px;
    }
    .daily-checklist h3 {
      font-size: 18px;
      font-weight: 900;
      color: #34d399;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .checklist-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }
    .check-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: #e2e8f0;
      font-weight: 600;
    }
    .check-box {
      width: 20px;
      height: 20px;
      border: 2px solid #34d399;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #34d399;
      font-weight: 900;
      font-size: 12px;
      flex-shrink: 0;
    }

    /* Footer */
    .manual-footer {
      text-align: center;
      padding: 24px 0 48px;
      color: var(--slate-500);
      font-size: 12px;
      font-weight: 600;
    }

    /* Regras de Impressão para Gerar PDF Limpo */
    @media print {
      .top-actions {
        display: none !important;
      }
      body {
        background: white !important;
      }
      .container {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .page-card {
        border: none !important;
        box-shadow: none !important;
        padding: 20px 0 !important;
        page-break-after: always;
      }
      .page-card:last-child {
        page-break-after: auto;
      }
      .screenshot-frame {
        box-shadow: none !important;
        border-color: #cbd5e1 !important;
      }
    }
  </style>
</head>
<body>

  <!-- Barra de Ação Superior -->
  <div class="top-actions">
    <div class="title">
      <span>📖</span>
      <span>Manual Prático do Lojista — Pode Vir Delivery</span>
    </div>
    <button class="btn-print" onclick="window.print()">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2m-4 0v4H8v-4m0-4h8"></path></svg>
      Salvar como PDF / Imprimir
    </button>
  </div>

  <div class="container">

    <!-- CAPA E INTRODUÇÃO -->
    <div class="page-card">
      <div class="cover-header">
        <div class="logo-brand">
          <span class="logo-badge">PV</span>
          <div class="logo-text">Pode<span>Vir</span></div>
        </div>
        <span class="badge-pill">Guia Oficial do Lojista</span>
      </div>

      <h1 class="cover-title">Manual de Operação e Gestão da sua Loja</h1>
      <p class="cover-subtitle">
        Tudo o que você precisa saber para configurar seu cardápio, atender pedidos no dia a dia, receber pagamentos e alavancar suas vendas no WhatsApp.
      </p>

      <div class="quick-pillars">
        <div class="pillar-card">
          <div class="icon">🚀</div>
          <h4>100% Sem Taxas por Pedido</h4>
          <p>O dinheiro das suas vendas cai direto na sua conta bancária via Pix ou na sua maquininha.</p>
        </div>
        <div class="pillar-card">
          <div class="icon">🔔</div>
          <h4>Alerta Sonoro de Pedidos</h4>
          <p>Seu computador ou celular toca um alarme automático assim que um cliente finaliza uma compra.</p>
        </div>
        <div class="pillar-card">
          <div class="icon">📲</div>
          <h4>WhatsApp Integrado</h4>
          <p>Comunicação instantânea com o cliente para envio de status e comprovantes.</p>
        </div>
      </div>

      <div class="tip-banner">
        <div class="icon">💡</div>
        <p>
          <strong>Dica rápida de navegação:</strong> Salve o link do seu painel administrativo (<code>podevir-app.vercel.app/sua-loja/admin</code>) nos <strong>favoritos do seu navegador</strong> ou na tela inicial do seu celular para acessar todos os dias!
        </p>
      </div>
    </div>

    <!-- MÓDULO 1: O DASHBOARD E AS MISSÕES INICIAIS -->
    <div class="page-card">
      <h2 class="section-title">
        <span class="num-badge">1</span>
        O Dashboard e as Missões Iniciais
      </h2>
      <p class="section-description">
        Ao acessar o painel pela primeira vez, você verá o checklist de <strong>Missões Iniciais</strong> no topo. Conclua os 4 passos para deixar seu cardápio 100% pronto para vender!
      </p>

      <div class="screenshot-frame">
        <div class="screenshot-header">
          <span class="browser-dot dot-red"></span>
          <span class="browser-dot dot-yellow"></span>
          <span class="browser-dot dot-green"></span>
          <span>podevir-app.vercel.app/loja-piloto/admin (Dashboard & Missões)</span>
        </div>
        <img class="screenshot-img" src="${imgDashboard}" alt="Dashboard e Missões Iniciais">
      </div>

      <div class="step-grid">
        <div class="step-box">
          <h4>🏪 1. Identidade & Visual</h4>
          <p>Defina o nome fantasia da sua loja, WhatsApp de atendimento e suba suas fotos de <strong>Logo (400x400)</strong> e <strong>Capa (1265x460)</strong>.</p>
        </div>
        <div class="step-box blue">
          <h4>🛵 2. Entrega e Logística</h4>
          <p>Escolha se você atende por <strong>Delivery</strong>, <strong>Retirada no Balcão</strong> ou ambos, e configure as faixas de frete por distância (KM).</p>
        </div>
        <div class="step-box purple">
          <h4>🍔 3. Cadastrar Produtos</h4>
          <p>Adicione seus pratos, bebidas ou sobremesas com fotos chamativas, preços, descrições e opcionais.</p>
        </div>
        <div class="step-box amber">
          <h4>💳 4. Meios de Pagamento</h4>
          <p>Cadastre sua <strong>Chave Pix</strong> (para pagamento direto) e ative opções de Cartão e Dinheiro na entrega.</p>
        </div>
      </div>
    </div>

    <!-- MÓDULO 2: OPERAÇÃO DIÁRIA DE PEDIDOS (KANBAN) -->
    <div class="page-card">
      <h2 class="section-title">
        <span class="num-badge">2</span>
        Operando os Pedidos no Dia a Dia
      </h2>
      <p class="section-description">
        Na aba <strong>Pedidos</strong>, você gerencia a esteira de produção da sua cozinha em tempo real através do quadro inteligente estilo Kanban.
      </p>

      <div class="screenshot-frame">
        <div class="screenshot-header">
          <span class="browser-dot dot-red"></span>
          <span class="browser-dot dot-yellow"></span>
          <span class="browser-dot dot-green"></span>
          <span>podevir-app.vercel.app/loja-piloto/admin/pedidos (Kanban de Pedidos)</span>
        </div>
        <img class="screenshot-img" src="${imgPedidos}" alt="Kanban de Pedidos">
      </div>

      <table class="status-table">
        <thead>
          <tr>
            <th>Coluna / Status</th>
            <th>O que acontece</th>
            <th>Ação do Lojista</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="status-badge badge-yellow">Aguardando</span></td>
            <td>Novo pedido acabou de chegar. O alarme sonoro toca continuamente.</td>
            <td>Clique no pedido, confira os itens e clique em <strong>"Aceitar Pedido"</strong>.</td>
          </tr>
          <tr>
            <td><span class="status-badge badge-blue">Em Preparo</span></td>
            <td>A cozinha está preparando o pedido.</td>
            <td>Quando o pedido estiver pronto e embalado, clique em <strong>"Despachar / Pronto"</strong>.</td>
          </tr>
          <tr>
            <td><span class="status-badge badge-purple">Saiu para Entrega</span></td>
            <td>O motoboy retirou o pedido ou está pronto para retirada.</td>
            <td>O sistema gera um link para avisar o cliente no WhatsApp com 1 clique!</td>
          </tr>
          <tr>
            <td><span class="status-badge badge-green">Concluído</span></td>
            <td>O cliente recebeu o pedido.</td>
            <td>O pedido é finalizado e contabilizado no seu faturamento diário.</td>
          </tr>
        </tbody>
      </table>

      <div class="tip-banner">
        <div class="icon">🔊</div>
        <p>
          <strong>Alerta Sonoro:</strong> Ao entrar na aba Pedidos, certifique-se de que o botão <strong>"Som Ativado"</strong> esteja verde. No celular, toque na tela uma vez para autorizar o navegador a tocar o alarme.
        </p>
      </div>
    </div>

    <!-- MÓDULO 3: CATÁLOGO E PRODUTOS -->
    <div class="page-card">
      <h2 class="section-title">
        <span class="num-badge">3</span>
        Gestão de Catálogo e Produtos
      </h2>
      <p class="section-description">
        Na aba <strong>Catálogo</strong>, você organiza categorias, cadastra itens novos, gerencia complementos e pausa produtos que acabaram no estoque.
      </p>

      <div class="screenshot-frame">
        <div class="screenshot-header">
          <span class="browser-dot dot-red"></span>
          <span class="browser-dot dot-yellow"></span>
          <span class="browser-dot dot-green"></span>
          <span>podevir-app.vercel.app/loja-piloto/admin/catalogo (Catálogo de Produtos)</span>
        </div>
        <img class="screenshot-img" src="${imgProdutos}" alt="Catálogo de Produtos">
      </div>

      <div class="step-grid">
        <div class="step-box">
          <h4>📁 Categorias Inteligentes</h4>
          <p>Crie categorias como <em>Hambúrgueres, Bebidas, Sobremesas</em>. Você pode reordenar arrastando para definir qual categoria aparece primeiro no cardápio.</p>
        </div>
        <div class="step-box blue">
          <h4>⚡ Pausar Item Esgotado</h4>
          <p>Acabou algum ingrediente no meio do expediente? Basta clicar na chavinha do produto para desativá-lo na hora, sem precisar apagá-lo!</p>
        </div>
      </div>
    </div>

    <!-- MÓDULO 4: CONFIGURAÇÕES DA LOJA E HORÁRIOS -->
    <div class="page-card">
      <h2 class="section-title">
        <span class="num-badge">4</span>
        Configurações da Loja, Horários e Frete
      </h2>
      <p class="section-description">
        Na aba <strong>Loja</strong>, você personaliza toda a identidade, horários de atendimento automático e regras de entrega.
      </p>

      <div class="step-grid">
        <div>
          <h3 style="font-size: 14px; font-weight: 800; margin-bottom: 8px; color: var(--slate-900);">Aparência & Identidade</h3>
          <div class="screenshot-frame" style="margin: 0;">
            <img class="screenshot-img" src="${imgLoja}" alt="Aparência da Loja">
          </div>
        </div>
        <div>
          <h3 style="font-size: 14px; font-weight: 800; margin-bottom: 8px; color: var(--slate-900);">Horários de Funcionamento</h3>
          <div class="screenshot-frame" style="margin: 0;">
            <img class="screenshot-img" src="${imgOperacao}" alt="Horários da Loja">
          </div>
        </div>
      </div>

      <div class="step-grid" style="margin-top: 16px;">
        <div class="step-box">
          <h4>🕒 Horários com Abertura Automática</h4>
          <p>Defina o horário de abertura e fechamento de cada dia da semana. Ative a <strong>"Abertura Automática"</strong> para que sua loja abra e feche no horário programado sem você se preocupar.</p>
        </div>
        <div class="step-box purple">
          <h4>🛵 Faixas de Frete por KM</h4>
          <p>Defina faixas como: <em>Até 3km = R$ 5,00 | De 3km a 7km = R$ 9,00</em>. O sistema calcula a taxa automaticamente quando o cliente digita o endereço!</p>
        </div>
      </div>
    </div>

    <!-- MÓDULO 5: DIVULGAÇÃO E COMO O CLIENTE COMPRA -->
    <div class="page-card">
      <h2 class="section-title">
        <span class="num-badge">5</span>
        Divulgando sua Loja e a Vitrine do Cliente
      </h2>
      <p class="section-description">
        Sua loja possui um link único e exclusivo (ex: <code>podevir-app.vercel.app/loja-piloto</code>) e um QR Code pronto para impressão.
      </p>

      <div class="mobile-mockup-wrapper">
        <div class="mobile-phone">
          <img src="${imgMobile}" alt="Vitrine do Cliente no Celular">
        </div>
        <div class="mobile-tips">
          <h4>📱 Como o seu cliente compra:</h4>
          <ul>
            <li>
              <span>👉</span>
              <div><strong>1. Acessa o link ou QR Code:</strong> Sem precisar baixar aplicativo nenhum na App Store ou Google Play!</div>
            </li>
            <li>
              <span>👉</span>
              <div><strong>2. Escolhe os produtos:</strong> Seleciona adicionais, ponto da carne, sabores e observações.</div>
            </li>
            <li>
              <span>👉</span>
              <div><strong>3. Checkout Rápido:</strong> Informa o endereço para entrega ou retirada, escolhe a forma de pagamento (Pix/Cartão) e envia o pedido!</div>
            </li>
            <li>
              <span>👉</span>
              <div><strong>4. Direto no seu Painel:</strong> O pedido apita no seu computador na hora e chega formatado no WhatsApp da loja!</div>
            </li>
          </ul>
        </div>
      </div>

      <h3 style="font-size: 15px; font-weight: 800; margin: 20px 0 8px; color: var(--slate-900);">Modal de Divulgação com QR Code:</h3>
      <div class="screenshot-frame">
        <div class="screenshot-header">
          <span class="browser-dot dot-red"></span>
          <span class="browser-dot dot-yellow"></span>
          <span class="browser-dot dot-green"></span>
          <span>podevir-app.vercel.app/loja-piloto/admin (Divulgar Loja)</span>
        </div>
        <img class="screenshot-img" src="${imgDivulgar}" alt="Modal de Divulgação da Loja">
      </div>
    </div>

    <!-- MÓDULO 6: DÚVIDAS FREQUENTES (FAQ) -->
    <div class="page-card">
      <h2 class="section-title">
        <span class="num-badge">6</span>
        Dúvidas Frequentes (FAQ do Lojista)
      </h2>
      <p class="section-description">
        Respostas rápidas para as principais dúvidas do dia a dia.
      </p>

      <div class="faq-item">
        <div class="faq-q">💰 Onde cai o dinheiro das vendas por Pix?</div>
        <div class="faq-a">O dinheiro cai <strong>100% direto na sua conta bancária</strong> cadastrada na sua chave Pix. A plataforma Pode Vir não retém seu dinheiro e não cobra comissões por pedido. O valor cai na hora na sua conta!</div>
      </div>

      <div class="faq-item">
        <div class="faq-q">⏸️ Como pausar um produto que acabou os ingredientes?</div>
        <div class="faq-a">Acesse <strong>Catálogo</strong> e desative a chave do produto. Ele ficará invisível ou marcado como "Esgotado" na vitrine imediatamente. Quando repor o estoque, basta reativar a chave.</div>
      </div>

      <div class="faq-item">
        <div class="faq-q">🔊 O som de novo pedido não está tocando. O que fazer?</div>
        <div class="faq-a">Os navegadores modernos exigem que você clique na tela pelo menos uma vez para autorizar a reprodução de áudio. Na aba <strong>Pedidos</strong>, certifique-se de que o botão "Som Ativado" está verde e dê um toque na tela para desbloquear o som.</div>
      </div>

      <div class="faq-item">
        <div class="faq-q">🛵 Como o cliente sabe o valor da taxa de entrega?</div>
        <div class="faq-a">Ao preencher o endereço no carrinho, o sistema calcula a distância da sua loja até o cliente e aplica automaticamente a faixa de frete correspondente cadastrada em <strong>Loja > Entrega e Pagamento</strong>.</div>
      </div>

      <div class="faq-item">
        <div class="faq-q">🎟️ Como criar cupons de desconto para os clientes?</div>
        <div class="faq-a">Acesse <strong>Loja > Promoções e Fidelidade</strong>. Lá você pode criar cupons de desconto em porcentagem (ex: 10% OFF) ou valor fixo (ex: R$ 5,00 OFF), com limite de usos e valor mínimo de pedido.</div>
      </div>

      <!-- Checklist Diário de Abertura -->
      <div class="daily-checklist">
        <h3>📋 Checklist Rápido de Abertura Diária (2 Minutos):</h3>
        <div class="checklist-grid">
          <div class="check-item">
            <span class="check-box">✓</span>
            <span>1. Abra o painel administrativo no computador ou celular.</span>
          </div>
          <div class="check-item">
            <span class="check-box">✓</span>
            <span>2. Verifique se o status no topo está como "Loja Aberta" (Verde).</span>
          </div>
          <div class="check-item">
            <span class="check-box">✓</span>
            <span>3. Vá na aba Pedidos e confirme que o "Som" está ativado.</span>
          </div>
          <div class="check-item">
            <span class="check-box">✓</span>
            <span>4. Confira no Catálogo se os itens do dia estão disponíveis.</span>
          </div>
        </div>
      </div>
    </div>

    <div class="manual-footer">
      <p>© 2026 Pode Vir Delivery — Sistema de Cardápio Digital & Gestão de Pedidos.</p>
      <p>Desenvolvido para máxima agilidade e vendas sem intermediários.</p>
    </div>

  </div>

</body>
</html>
`;

fs.writeFileSync(path.resolve('public/manual-do-lojista.html'), htmlContent, 'utf-8');
console.log('Manual do Lojista HTML/PDF gerado com sucesso em public/manual-do-lojista.html!');
