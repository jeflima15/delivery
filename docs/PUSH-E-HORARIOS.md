# Avisos de pedidos e horarios

## Para o lojista

- Onboarding: escolher modo de venda sugere segunda a sabado, 18h-23h para pedidos imediatos e 9h-18h para encomendas. Horarios existentes e rascunhos antigos sao preservados.
- Na etapa Horarios e prazos, use Preencher varios dias de uma vez. A substituicao exige confirmacao. Dias nao selecionados nao mudam. Personalizar por dia permite fechar um dia ou criar outro turno.
- O mesmo preenchimento esta em Loja > Horarios & Operacao, na grade imediata e na agenda. Use Salvar alteracoes para publicar.
- Agenda representa entrega/retirada, nao o horario em que o cliente pode encomendar. O prazo de preparo ainda exige revisao do dono.
- No cabecalho do admin, abra Notificacoes. Tambem ha um convite opcional na conferencia final do onboarding.
- Ative no aparelho, permita notificacoes e envie o teste. No iPhone/iPad, adicione o painel a Tela de Inicio e abra por esse icone antes de ativar (iOS 16.4+).
- Cada conta pode cadastrar ate 10 aparelhos por loja. A lista e pessoal, nao expoe aparelhos de outros funcionarios. Desativar remove o vinculo daquela loja, sem afetar outras lojas.
- O push e um aviso, nao confirma leitura, aceite ou pagamento. O teste so confirma chegada quando a pessoa realmente o ve. Internet, permissoes e economia de bateria podem interferir.
- No checkout, o pedido e salvo primeiro. Enviar resumo pelo WhatsApp e opcional, exige o envio pelo cliente e nao cria outro pedido. Acompanhar pedido fecha o resumo e mostra o acompanhamento.

## Configuracao unica da plataforma (necessaria antes do uso real)

1. Execute `npm run push:keys` em um ambiente seguro. Guarde a chave privada e o segredo em variaveis protegidas, nunca no Git ou com prefixo VITE_. Nao gere novas chaves em cada deploy.
2. Configure `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` e `PUSH_VAPID_SUBJECT` (ex.: mailto com um contato real da plataforma). Chaves ausentes ou incompatíveis deixam o recurso indisponivel sem impedir o restante da loja.
3. Publique por HTTPS. O service worker precisa ser servido como JavaScript em `/push-sw.js`, sem redirecionamento para index.html. O manifesto de cada loja esta em `/api/public/stores/:slug/admin.webmanifest`.
4. Garanta o processamento da fila: em servidor persistente, mantenha `npm run push:worker` sob um supervisor, com as mesmas variaveis e banco da aplicacao. Ele consulta a fila a cada 15 segundos.
5. Em hospedagem serverless, nao inicie loop dentro da funcao HTTP. Configure um agendador externo para fazer POST em `/api/internal/push/run` com `Authorization: Bearer <PUSH_WORKER_SECRET>` (segredo aleatorio de pelo menos 32 caracteres), idealmente a cada minuto. Cada chamada processa um lote limitado; monitore o volume.

O primeiro envio e tentado apos o commit do pedido, ainda na requisicao de checkout, com timeout e tentativas limitadas. Pode acrescentar alguns segundos a resposta. O worker recupera falhas, reinicios e lotes maiores mesmo sem painel aberto. Sem worker/agendador ativo, tentativas futuras NAO sao garantidas. Nao usar cron diario para prometer recuperacao rapida.

Nao ha tarifa por mensagem do web-push nem dependencia de servico comercial de notificacoes. Hospedagem, banco e disponibilidade de agendador continuam sujeitos aos limites e custos da infraestrutura escolhida. Nenhum agendador externo, conta paga, deploy ou chave de producao foi criado automaticamente.

## Seguranca e manutencao

- Subscricoes protegidas por login, permissao orders:read, CSRF, rate limit, validacao de chaves e lista fechada de dominios push (Google, Mozilla, Apple e Windows).
- Endpoint e chaves do aparelho nao sao retornados na listagem. O worker revalida conta ativa, associacao a loja, permissao e status da loja antes de enviar.
- A fila e criada na mesma transacao do pedido. Indice unico pedido/aparelho e lease evitam disparos concorrentes. Repeticao apos falha ambigua ainda e possivel; a tag do pedido substitui avisos repetidos no aparelho. Nao ha garantia de entrega exatamente uma vez.
- Sem nome, telefone, endereco ou dados financeiros do cliente no aviso. Abrir exige acesso autenticado ao pedido na loja correta.
- Falhas 404/410 desativam subscricoes expiradas. Erros temporarios recebem ate cinco tentativas com backoff. Pedido fora de Pendente, expiracao de 24h ou acesso revogado cancela o aviso pendente.
- A fila expira automaticamente apos o periodo de retencao. Acompanhe `PushJob` (pending/failed) e a saude do worker. Nunca registre endpoints ou chaves em logs.
- Trocar as chaves VAPID exige reinscricao dos aparelhos. O botao Ativar/Atualizar refaz a subscricao quando a chave publica muda.
- O service worker nao faz cache de paginas, pedidos ou respostas autenticadas.

## Validacao antes do piloto

No dominio publicado, validar Android e iPhone reais: instalar, autorizar, ver o teste, fechar o painel, criar pedido imediato e encomenda, tocar o aviso, fazer login expirado, abrir o pedido correto, negar permissao e remover aparelho. Confirmar tambem worker desligado/religado, falha temporaria de rede e ausencia de envio a equipe removida.

Testes automatizados usam envio mockado e nao substituem a verificacao de entrega real pelos servicos de push.
