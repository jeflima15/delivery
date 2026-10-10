export const landingTitle = 'Pode Vir | Cardápio online, pedidos e encomendas';
export const landingDescription = 'Seu cardápio online e sua operação no controle. Conheça a Pode Vir para receber pedidos, organizar encomendas e acompanhar delivery e retirada.';
export const landingContactUrl = 'https://wa.me/5524999097604?text=Ol%C3%A1!%20Conheci%20a%20Pode%20Vir%20e%20gostaria%20de%20conhecer%20a%20plataforma.';
export const exampleStoreUrl = `/${import.meta.env.VITE_DEFAULT_TENANT_SLUG || 'loja-piloto'}`;

// Pilot availability was confirmed; a public flag can pause this communication.
export const showCatalogImport = import.meta.env.VITE_LANDING_CATALOG_IMPORT !== 'false';

export function getPlatformOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch {
    return null;
  }
}

export const platformOrigin = getPlatformOrigin(import.meta.env.VITE_PLATFORM_ORIGIN);

export const landingFaqs = [
  { question: 'O cliente precisa instalar algum aplicativo?', answer: 'Não. O cardápio abre pelo navegador no link da loja. O cliente escolhe os produtos e faz uma identificação rápida por telefone para continuar o pedido.' },
  { question: 'Posso receber pedidos para agora e encomendas?', answer: 'Sim. A loja pode trabalhar com pedidos imediatos, encomendas ou os dois. Para encomendas, configura dias, horários, antecedência e limites da agenda. O cliente agenda produtos habilitados no cardápio; a equipe também pode registrar uma encomenda personalizada combinada pelo WhatsApp.' },
  { question: 'A Pode Vir recebe o Pix automaticamente?', answer: 'Não. A loja informa sua chave Pix e confere o pagamento na própria conta bancária. Sinal, saldo e eventuais devoluções são registrados manualmente no pedido para manter o acompanhamento organizado.' },
  { question: 'Como funciona a impressão de comandas?', answer: 'A Pode Vir prepara comandas para impressoras térmicas de 58 mm e 80 mm. A impressão é iniciada pelo painel e concluída pela janela de impressão do navegador ou do sistema operacional.' },
  { question: 'Posso trabalhar com entrega e retirada?', answer: 'Sim. A loja pode habilitar retirada e configurar entrega com taxas por bairro ou por regiões desenhadas no mapa. O cliente consulta as condições de entrega antes de concluir o pedido; os prazos são estimativas conforme a configuração da loja.' },
  { question: 'Como começar? Existem planos públicos?', answer: 'A plataforma está em fase piloto, com entrada por convite e acompanhamento da equipe. Cadastro público e planos comerciais ainda não estão disponíveis. Conte sobre sua operação pelo WhatsApp para conhecer a Pode Vir e conversar sobre a participação.' },
];
