import fs from 'fs';
import path from 'path';

const assetsDir = path.resolve('public/manual-assets-focused');

function getBase64Image(filename) {
  const filePath = path.join(assetsDir, filename);
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath);
    return `data:image/png;base64,${data.toString('base64')}`;
  }
  return '';
}

const imgDashboard = getBase64Image('1_dashboard_focused.png');
const imgPedidos = getBase64Image('2_pedidos_focused.png');
const imgProdutos = getBase64Image('3_catalogo_focused.png');
const imgAparencia = getBase64Image('4_aparencia_focused.png');
const imgOperacao = getBase64Image('5_operacao_focused.png');
const imgEntrega = getBase64Image('6_entrega_focused.png');
const imgMobile = getBase64Image('8_mobile_focused.png');

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
      --slate-950: #020617;
      --slate-900: #0f172a;
      --slate-800: #1e293b;
      --slate-700: #334155;
      --slate-600: #475569;
      --slate-500: #64748b;
      --slate-200: #e2e8f0;
      --slate-100: #f1f5f9;
      --slate-50: #f8fafc;
      --amber-600: #d97706;
      --amber-50: #fffbeb;
      --blue-600: #2563eb;
      --blue-50: #eff6ff;
      --purple-600: #7c3aed;
      --purple-50: #faf5ff;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: #cbd5e1;
      color: var(--slate-800);
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Container de Páginas A4 com Altura Rígida */
    .page-container {
      width: 210mm;
      height: 297mm;
      max-height: 297mm;
      margin: 15px auto;
      background: white;
      padding: 14mm 16mm 12mm 16mm;
      box-shadow: 0 6px 25px rgba(0,0,0,0.12);
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
    }

    /* Cabeçalho da Página */
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid var(--slate-100);
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-badge {
      background: var(--slate-900);
      color: white;
      font-weight: 900;
      font-size: 14px;
      padding: 3px 8px;
      border-radius: 7px;
      letter-spacing: -0.5px;
    }
    .brand-name {
      font-size: 18px;
      font-weight: 900;
      color: var(--slate-900);
      letter-spacing: -0.5px;
    }
    .brand-name span {
      color: var(--primary);
    }
    .page-tag {
      background: var(--primary-light);
      color: var(--primary-dark);
      border: 1px solid rgba(5, 150, 105, 0.25);
      font-size: 10.5px;
      font-weight: 800;
      padding: 3px 10px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Títulos de Seção */
    .section-headline {
      margin-bottom: 10px;
    }
    .section-headline h1, .section-headline h2 {
      font-size: 21px;
      font-weight: 900;
      color: var(--slate-900);
      letter-spacing: -0.5px;
      line-height: 1.2;
    }
    .section-headline p {
      font-size: 12px;
      color: var(--slate-500);
      margin-top: 2px;
    }

    /* Moldura de Captura Focada */
    .screenshot-box {
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      overflow: hidden;
      background: #0f172a;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      margin: 8px 0 10px 0;
    }
    .screenshot-bar {
      background: #1e293b;
      padding: 5px 10px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
    }
    .d-red { background: #ef4444; }
    .d-yellow { background: #f59e0b; }
    .d-green { background: #10b981; }
    .screenshot-bar span {
      font-size: 10px;
      color: #94a3b8;
      font-family: monospace;
      margin-left: 6px;
    }
    .screenshot-img {
      width: 100%;
      height: auto;
      display: block;
    }
    .screenshot-img.crop-delivery {
      max-height: 310px;
      object-fit: cover;
      object-position: top center;
    }
    .screenshot-img.crop-produtos {
      max-height: 300px;
      object-fit: cover;
      object-position: top center;
    }
    .screenshot-img.crop-half {
      max-height: 240px;
      object-fit: cover;
      object-position: top center;
    }

    /* Caixas de Instrução */
    .instruction-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 8px 0;
    }
    .instruction-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 8px 0;
    }

    .info-card {
      background: var(--slate-50);
      border: 1px solid var(--slate-200);
      border-radius: 9px;
      padding: 10px 12px;
    }
    .info-card.green { border-left: 3.5px solid var(--primary); }
    .info-card.blue { border-left: 3.5px solid var(--blue-600); }
    .info-card.purple { border-left: 3.5px solid var(--purple-600); }
    .info-card.amber { border-left: 3.5px solid var(--amber-600); }

    .info-card h3, .info-card h4 {
      font-size: 12px;
      font-weight: 800;
      color: var(--slate-900);
      margin-bottom: 3px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .info-card p {
      font-size: 11px;
      color: var(--slate-600);
      line-height: 1.35;
    }

    .num-pill {
      background: var(--primary);
      color: white;
      font-size: 10px;
      font-weight: 900;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    /* Destaques / Banners de Dica */
    .highlight-tip {
      background: var(--primary-light);
      border: 1px solid rgba(5, 150, 105, 0.25);
      border-radius: 9px;
      padding: 8px 12px;
      margin: 8px 0;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .highlight-tip .tip-icon {
      font-size: 15px;
      flex-shrink: 0;
    }
    .highlight-tip p {
      font-size: 11px;
      color: #065f46;
      font-weight: 600;
      line-height: 1.35;
    }

    /* Tabela do Kanban */
    .kanban-table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 11px;
    }
    .kanban-table th {
      background: var(--slate-100);
      color: var(--slate-700);
      text-align: left;
      padding: 7px 10px;
      font-weight: 800;
      border-bottom: 2px solid #cbd5e1;
    }
    .kanban-table td {
      padding: 7px 10px;
      border-bottom: 1px solid var(--slate-200);
      color: var(--slate-700);
    }
    .status-tag {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .tag-yellow { background: #fef3c7; color: #92400e; }
    .tag-blue { background: #dbeafe; color: #1e40af; }
    .tag-purple { background: #ede9fe; color: #5b21b6; }
    .tag-green { background: #dcfce7; color: #166534; }

    /* Mockup Mobile */
    .mobile-side-grid {
      display: grid;
      grid-template-columns: 175px 1fr;
      gap: 16px;
      align-items: center;
      background: var(--slate-50);
      border: 1px solid var(--slate-200);
      border-radius: 12px;
      padding: 12px 16px;
      margin: 8px 0;
    }
    .phone-frame {
      width: 100%;
      border-radius: 14px;
      border: 4px solid #1e293b;
      overflow: hidden;
      box-shadow: 0 4px 14px rgba(0,0,0,0.1);
      background: white;
    }
    .phone-frame img {
      width: 100%;
      display: block;
    }
    .mobile-steps h3 {
      font-size: 13.5px;
      font-weight: 800;
      color: var(--slate-900);
      margin-bottom: 6px;
    }
    .mobile-steps ol {
      padding-left: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 11px;
      color: var(--slate-700);
    }

    /* FAQ */
    .faq-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 8px 0;
    }
    .faq-item {
      background: var(--slate-50);
      border: 1px solid var(--slate-200);
      border-radius: 9px;
      padding: 9px 11px;
    }
    .faq-item h4 {
      font-size: 11px;
      font-weight: 800;
      color: var(--slate-900);
      margin-bottom: 2px;
    }
    .faq-item p {
      font-size: 10.5px;
      color: var(--slate-600);
      line-height: 1.35;
    }

    /* Checklist */
    .checklist-dark {
      background: var(--slate-900);
      color: white;
      border-radius: 10px;
      padding: 11px 15px;
      margin-top: 8px;
    }
    .checklist-dark h4 {
      font-size: 12.5px;
      font-weight: 800;
      color: #34d399;
      margin-bottom: 8px;
    }
    .check-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .check-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10.5px;
      color: #cbd5e1;
      font-weight: 600;
    }
    .check-icon {
      color: #34d399;
      font-weight: 900;
    }

    /* Rodapé da Página A4 */
    .footer-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid var(--slate-100);
      padding-top: 8px;
      margin-top: 8px;
      font-size: 10px;
      color: var(--slate-400);
      font-weight: 600;
    }

    /* Impressão Limpa */
    @media print {
      body {
        background: white !important;
      }
      .page-container {
        width: 100% !important;
        height: 297mm !important;
        max-height: 297mm !important;
        margin: 0 !important;
        padding: 12mm 14mm 10mm 14mm !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        page-break-after: always !important;
      }
      .page-container:last-child {
        page-break-after: auto !important;
      }
    }
  </style>
</head>
<body>

  <!-- ==================== PÁGINA 1 ==================== -->
  <div class="page-container">
    <div>
      <div class="header-bar">
        <div class="brand-wrap">
          <span class="brand-badge">PV</span>
          <div class="brand-name">Pode<span>Vir</span></div>
        </div>
        <span class="page-tag">Manual do Lojista</span>
      </div>

      <div class="section-headline">
        <h1>Guia de Operação & Acesso ao Painel</h1>
        <p>Aprenda a gerenciar seus produtos, configurar taxas de entrega e atender pedidos no dia a dia.</p>
      </div>

      <div class="info-card green" style="margin-bottom: 10px;">
        <h3>🔑 Como Acessar seu Painel de Gestão:</h3>
        <p style="font-size: 11.5px; color: var(--slate-700); margin-top: 3px;">
          Abra o navegador no computador ou celular e acesse o endereço exclusivo da sua loja:<br>
          <strong style="color: var(--primary-dark); font-family: monospace; font-size: 13px;">podevir-app.vercel.app/loja-piloto/admin</strong>
        </p>
      </div>

      <!-- Screenshot Focado do Dashboard -->
      <div class="screenshot-box">
        <div class="screenshot-bar">
          <span class="dot d-red"></span>
          <span class="dot d-yellow"></span>
          <span class="dot d-green"></span>
          <span>Visão Geral do Painel — Dashboard & Métricas</span>
        </div>
        <img class="screenshot-img" src="${imgDashboard}" alt="Dashboard Focado">
      </div>

      <div class="instruction-grid-3">
        <div class="info-card">
          <h4><span class="num-pill">1</span> Status da Loja</h4>
          <p>Alterne entre <strong>"Loja Aberta"</strong> e <strong>"Loja Fechada"</strong> com 1 clique no botão superior.</p>
        </div>
        <div class="info-card blue">
          <h4><span class="num-pill">2</span> Métricas do Dia</h4>
          <p>Acompanhe o faturamento de hoje, pedidos em andamento e ticket médio em tempo real.</p>
        </div>
        <div class="info-card purple">
          <h4><span class="num-pill">3</span> Menu de Acesso</h4>
          <p>Navegue rapidamente entre <strong>Pedidos</strong>, <strong>Catálogo</strong>, <strong>Loja</strong> e <strong>Relatórios</strong>.</p>
        </div>
      </div>

      <div class="highlight-tip">
        <span class="tip-icon">⭐</span>
        <p><strong>Dica de Ouro:</strong> Salve o link do painel nos <strong>favoritos do seu navegador</strong> ou adicione um atalho na tela inicial do seu celular para abrir a loja todos os dias com apenas 1 toque!</p>
      </div>
    </div>

    <div class="footer-bar">
      <span>Pode Vir Delivery — Manual Prático do Lojista</span>
      <span>Página 1 de 6</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 2 ==================== -->
  <div class="page-container">
    <div>
      <div class="header-bar">
        <div class="brand-wrap">
          <span class="brand-badge">PV</span>
          <div class="brand-name">Pode<span>Vir</span></div>
        </div>
        <span class="page-tag">Capítulo 1</span>
      </div>

      <div class="section-headline">
        <h2>Identidade Visual & Horários de Atendimento</h2>
        <p>Personalize a foto de capa, logo e programe a abertura automática do cardápio.</p>
      </div>

      <div class="instruction-grid-2">
        <div>
          <h4 style="font-size: 11.5px; font-weight: 800; margin-bottom: 3px; color: var(--slate-900);">Aparência da Loja (Logo & Capa)</h4>
          <div class="screenshot-box" style="margin: 0 0 6px 0;">
            <img class="screenshot-img crop-half" src="${imgAparencia}" alt="Aparência Focado">
          </div>
        </div>
        <div>
          <h4 style="font-size: 11.5px; font-weight: 800; margin-bottom: 3px; color: var(--slate-900);">Horários de Funcionamento</h4>
          <div class="screenshot-box" style="margin: 0 0 6px 0;">
            <img class="screenshot-img crop-half" src="${imgOperacao}" alt="Horários Focado">
          </div>
        </div>
      </div>

      <div class="instruction-grid-2" style="margin-top: 6px;">
        <div class="info-card green">
          <h4>🖼️ 1. Identidade e Fotos da Loja</h4>
          <p>
            • <strong>Foto de Capa:</strong> Banner horizontal largo no topo do cardápio.<br>
            • <strong>Foto do Logo:</strong> Imagem quadrada ou circular com a sua marca.<br>
            • <strong>WhatsApp:</strong> Número para contato direto dos clientes.
          </p>
        </div>
        <div class="info-card purple">
          <h4>🕒 2. Horários com Abertura Automática</h4>
          <p>
            Defina o horário de início e término para cada dia da semana. Ao marcar a opção <strong>"Abertura Automática"</strong>, o cardápio abre e fecha sozinho nos horários cadastrados!
          </p>
        </div>
      </div>

      <div class="highlight-tip" style="margin-top: 8px;">
        <span class="tip-icon">💾</span>
        <p><strong>Barra de Salvamento Unificada:</strong> Ao alterar qualquer configuração de capa, horários ou frete, a barra flutuante aparecerá no rodapé. Basta clicar em <strong>"Salvar Alterações"</strong> para gravar tudo de uma só vez!</p>
      </div>
    </div>

    <div class="footer-bar">
      <span>Pode Vir Delivery — Manual Prático do Lojista</span>
      <span>Página 2 de 6</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 3 ==================== -->
  <div class="page-container">
    <div>
      <div class="header-bar">
        <div class="brand-wrap">
          <span class="brand-badge">PV</span>
          <div class="brand-name">Pode<span>Vir</span></div>
        </div>
        <span class="page-tag">Capítulo 2</span>
      </div>

      <div class="section-headline">
        <h2>Gestão de Catálogo & Cadastro de Produtos</h2>
        <p>Cadastre itens com fotos, crie grupos de adicionais e pause produtos esgotados.</p>
      </div>

      <!-- Screenshot Focado do Catálogo -->
      <div class="screenshot-box">
        <div class="screenshot-bar">
          <span class="dot d-red"></span>
          <span class="dot d-yellow"></span>
          <span class="dot d-green"></span>
          <span>Aba Catálogo — Produtos, Preços e Categorias</span>
        </div>
        <img class="screenshot-img crop-produtos" src="${imgProdutos}" alt="Catálogo Focado">
      </div>

      <div class="instruction-grid-3">
        <div class="info-card green">
          <h4>🍔 1. Dados do Produto</h4>
          <p>Informe o <strong>Nome</strong>, <strong>Preço</strong>, uma <strong>Descrição</strong> chamativa e suba uma <strong>Foto</strong> bem iluminada do prato.</p>
        </div>
        <div class="info-card blue">
          <h4>🧀 2. Grupos de Adicionais</h4>
          <p>Crie opções como <em>Ponto da Carne, Escolha o Molho, Bacon Extra (+R$ 4,00)</em> com limites mínimos e máximos.</p>
        </div>
        <div class="info-card amber">
          <h4>⚡ 3. Pausar Item Esgotado</h4>
          <p>Acabou algum ingrediente no meio do expediente? Basta desativar a chavinha do item para ocultá-lo na hora sem precisar apagá-lo.</p>
        </div>
      </div>

      <div class="info-card" style="margin-top: 6px;">
        <h4>📁 Como Organizar Categorias:</h4>
        <p>Crie categorias claras (ex: <em>Hambúrgueres, Porções, Bebidas, Sobremesas</em>). Você pode reordenar as categorias arrastando para escolher qual aparece primeiro para os clientes no cardápio.</p>
      </div>
    </div>

    <div class="footer-bar">
      <span>Pode Vir Delivery — Manual Prático do Lojista</span>
      <span>Página 3 de 6</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 4 ==================== -->
  <div class="page-container">
    <div>
      <div class="header-bar">
        <div class="brand-wrap">
          <span class="brand-badge">PV</span>
          <div class="brand-name">Pode<span>Vir</span></div>
        </div>
        <span class="page-tag">Capítulo 3</span>
      </div>

      <div class="section-headline">
        <h2>Entrega (Delivery), Retirada & Pagamentos</h2>
        <p>Configure taxas por bairro, regiões no mapa ou taxa fixa e as formas de pagamento aceitas.</p>
      </div>

      <!-- Screenshot Focado de Entrega e Pagamentos com Crop Ajustado -->
      <div class="screenshot-box">
        <div class="screenshot-bar">
          <span class="dot d-red"></span>
          <span class="dot d-yellow"></span>
          <span class="dot d-green"></span>
          <span>Aba Loja > Entrega e Pagamento</span>
        </div>
        <img class="screenshot-img crop-delivery" src="${imgEntrega}" alt="Entrega e Pagamento Focado">
      </div>

      <div class="instruction-grid-2">
        <div class="info-card green">
          <h4>🛵 1. Modalidades de Atendimento</h4>
          <p>
            • <strong>Entrega (Delivery):</strong> Escolha taxas por bairro, regiões no mapa, taxa fixa ou bairros com complemento pelo mapa. Para definir áreas circulares, desenhe os círculos no mapa e ajuste o raio e o valor de cada região.<br>
            • <strong>Retirada no Balcão:</strong> Permite que o cliente busque no local com taxa grátis.
          </p>
        </div>
        <div class="info-card blue">
          <h4>💳 2. Formas de Pagamento</h4>
          <p>
            • <strong>Chave Pix:</strong> Digite sua chave Pix para o cliente copiar e colar no checkout.<br>
            • <strong>Cartões na Entrega:</strong> Marque se aceita Crédito e Débito na maquininha.<br>
            • <strong>Dinheiro:</strong> O cliente informa se precisa de troco.
          </p>
        </div>
      </div>

      <div class="highlight-tip" style="margin-top: 6px;">
        <span class="tip-icon">📍</span>
        <p><strong>Cálculo Automático de Frete:</strong> Quando o cliente digita o endereço dele no carrinho, o sistema calcula a distância até a sua loja e aplica a taxa de entrega correta automaticamente!</p>
      </div>
    </div>

    <div class="footer-bar">
      <span>Pode Vir Delivery — Manual Prático do Lojista</span>
      <span>Página 4 de 6</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 5 ==================== -->
  <div class="page-container">
    <div>
      <div class="header-bar">
        <div class="brand-wrap">
          <span class="brand-badge">PV</span>
          <div class="brand-name">Pode<span>Vir</span></div>
        </div>
        <span class="page-tag">Capítulo 4</span>
      </div>

      <div class="section-headline">
        <h2>Atendimento de Pedidos na Cozinha (Kanban)</h2>
        <p>Como funciona a esteira de pedidos e o alarme sonoro em tempo real.</p>
      </div>

      <!-- Screenshot Focado do Kanban -->
      <div class="screenshot-box">
        <div class="screenshot-bar">
          <span class="dot d-red"></span>
          <span class="dot d-yellow"></span>
          <span class="dot d-green"></span>
          <span>Aba Pedidos — Painel Kanban Operacional</span>
        </div>
        <img class="screenshot-img" src="${imgPedidos}" alt="Kanban Focado">
      </div>

      <table class="kanban-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>O que significa</th>
            <th>Ação do Lojista</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="status-tag tag-yellow">Aguardando</span></td>
            <td>Novo pedido acabou de chegar. O alarme sonoro toca continuamente.</td>
            <td>Clique no pedido, confira os itens e clique em <strong>"Aceitar Pedido"</strong>.</td>
          </tr>
          <tr>
            <td><span class="status-tag tag-blue">Em Preparo</span></td>
            <td>A cozinha está preparando o pedido.</td>
            <td>Assim que embalar, clique em <strong>"Despachar / Pronto"</strong>.</td>
          </tr>
          <tr>
            <td><span class="status-tag tag-purple">Saiu para Entrega</span></td>
            <td>Saiu com o motoboy ou pronto para retirada no balcão.</td>
            <td>Clique no botão de WhatsApp para avisar o cliente em 1 clique!</td>
          </tr>
          <tr>
            <td><span class="status-tag tag-green">Concluído</span></td>
            <td>O cliente recebeu o pedido.</td>
            <td>Pedido finalizado e registrado no faturamento do dia.</td>
          </tr>
        </tbody>
      </table>

      <div class="highlight-tip" style="margin-top: 6px;">
        <span class="tip-icon">🔊</span>
        <p><strong>Alerta Sonoro no Celular/Computador:</strong> Na aba Pedidos, verifique se o botão <strong>"Som Ativado"</strong> está verde. No celular, dê um toque na tela ao abrir a aba para autorizar o navegador a tocar o alarme.</p>
      </div>
    </div>

    <div class="footer-bar">
      <span>Pode Vir Delivery — Manual Prático do Lojista</span>
      <span>Página 5 de 6</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 6 ==================== -->
  <div class="page-container">
    <div>
      <div class="header-bar">
        <div class="brand-wrap">
          <span class="brand-badge">PV</span>
          <div class="brand-name">Pode<span>Vir</span></div>
        </div>
        <span class="page-tag">Capítulo 5</span>
      </div>

      <div class="section-headline">
        <h2>Divulgação com QR Code & Dúvidas Rápidas</h2>
        <p>Como atrair clientes e respostas para as principais dúvidas do dia a dia.</p>
      </div>

      <div class="mobile-side-grid">
        <div class="phone-frame">
          <img src="${imgMobile}" alt="Cardápio no Celular">
        </div>
        <div class="mobile-steps">
          <h3>📲 Como o seu cliente compra no celular:</h3>
          <ol>
            <li><strong>Acessa seu link ou QR Code:</strong> Direto no navegador, sem precisar baixar app na App Store ou Google Play!</li>
            <li><strong>Escolhe os pratos e adicionais:</strong> Seleciona sabores, adicionais e observações.</li>
            <li><strong>Finaliza em 30 segundos:</strong> Informa o endereço e forma de pagamento.</li>
            <li><strong>Notificação Instantânea:</strong> O pedido apita na sua cozinha na hora!</li>
          </ol>
        </div>
      </div>

      <div class="faq-grid">
        <div class="faq-item">
          <h4>❓ Como pausar um produto que esgotou?</h4>
          <p>Acesse <strong>Catálogo</strong> e desative a chave do produto. Ele ficará indisponível na vitrine na mesma hora.</p>
        </div>
        <div class="faq-item">
          <h4>❓ O som do pedido não tocou. O que fazer?</h4>
          <p>Na aba <strong>Pedidos</strong>, confirme se o botão "Som Ativado" está ligado e dê um toque na tela para destravar o áudio.</p>
        </div>
        <div class="faq-item">
          <h4>❓ Como criar cupons de desconto?</h4>
          <p>Vá em <strong>Loja > Promoções e Fidelidade</strong> para criar cupons com porcentagem ou valor fixo de desconto.</p>
        </div>
        <div class="faq-item">
          <h4>❓ Como imprimir o QR Code de balcão?</h4>
          <p>Clique no botão <strong>"Divulgar"</strong> no topo do painel para abrir a plaquinha com QR Code pronta para impressão.</p>
        </div>
      </div>

      <div class="checklist-dark">
        <h4>📋 Checklist Rápido de Abertura Diária (1 Minuto):</h4>
        <div class="check-grid">
          <div class="check-row">
            <span class="check-icon">✓</span>
            <span>1. Abra o painel no computador ou celular.</span>
          </div>
          <div class="check-row">
            <span class="check-icon">✓</span>
            <span>2. Verifique se o status está "Loja Aberta".</span>
          </div>
          <div class="check-row">
            <span class="check-icon">✓</span>
            <span>3. Na aba Pedidos, confirme o Som Ativado.</span>
          </div>
          <div class="check-row">
            <span class="check-icon">✓</span>
            <span>4. Confira se os itens do dia estão ativos.</span>
          </div>
        </div>
      </div>
    </div>

    <div class="footer-bar">
      <span>Pode Vir Delivery — Manual Prático do Lojista</span>
      <span>Página 6 de 6</span>
    </div>
  </div>

</body>
</html>
`;

fs.writeFileSync(path.resolve('public/manual-do-lojista.html'), htmlContent, 'utf-8');
console.log('Manual HTML gerado com sucesso em public/manual-do-lojista.html!');
