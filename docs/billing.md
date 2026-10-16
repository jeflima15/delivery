# Billing da plataforma

Billing da plataforma e separado do pagamento dos pedidos da loja.

## Modelo

- `Plan`: preco em centavos, intervalo, trial, limites e features;
- `Subscription`: tenant, plano, periodo, status e provider;
- `Invoice`: valor, vencimento, pagamento e referencias;
- `WebhookEvent`: evento externo sanitizado e idempotente.

## Provider manual

O Master pode criar fatura e confirmar pagamento manual com data, motivo e referencia de comprovante. A data informada nao pode estar no futuro. Acoes sao auditadas e o navegador nunca determina sozinho que uma fatura esta paga.

### Integridade e transicoes

- Criacao valida no servidor a existencia da assinatura, sua loja e eventual referencia reversa conflitante. Uma fatura antiga inconsistente tambem e recusada durante pagamento, cancelamento ou estorno; nao ha reparacao silenciosa.
- Mutacoes HTTP de fatura e assinatura incluem persistencia e auditoria na mesma transacao MongoDB. O runtime precisa de replica set, como ja exigido pelos pedidos; nao existe fallback parcial em banco sem transacoes.
- Pagamento de fatura elegivel atualiza a assinatura comercial para `active` somente se nao restarem outras faturas abertas vencidas. Havendo outra vencida, fica `past_due`. Assinaturas `suspended` e `cancelled` nao sao reabertas pelo pagamento.
- Loja `suspended`, `cancelled` ou `archived` permanece bloqueada, inclusive ao atribuir/reativar assinatura ou prorrogar trial. A reabertura depende da acao administrativa explicita de status da loja. Demais lojas acompanham a transicao comercial.
- Registrar estorno manual so e permitido em fatura paga. Mantem a regra existente de passar assinatura `active` para `past_due`, agora refletida tambem na loja desbloqueada. Nao executa devolucao financeira nem calcula proporcionalidade. Cancelar fatura nao reativa a assinatura automaticamente.
- Prorrogacao de sete dias e exclusiva de assinatura `trial`; uma assinatura ativa, suspensa ou cancelada exige outra acao comercial explicita. Repetir uma prorrogacao de trial ainda representa uma nova prorrogacao manual.
- Atribuir assinatura a loja que ja possui uma retorna `409 SUBSCRIPTION_ALREADY_ASSIGNED`; a atribuicao nao redefine silenciosamente o ciclo existente.
- `billingRevision` serializa transicoes concorrentes de diferentes faturas da mesma assinatura. E aditivo e aceita registros legados sem backfill.

### Reenvio de criacao e referencias locais

`POST /api/master/invoices` aceita `idempotencyKey` UUID opcional para compatibilidade. O Master reutiliza a chave enquanto reenvia o mesmo formulario. A mesma chave/dados retorna a fatura existente, sem nova auditoria; dados diferentes retornam `409 BILLING_IDEMPOTENCY_CONFLICT`. Clientes antigos sem chave mantem a semantica de nova criacao em cada chamada.

O provider manual atribui uma referencia local `manual:<identificador>` a `externalId`, usando o indice unico de provider/referencia ja existente. Novas assinaturas manuais recebem referencia por tenant. Isto nao representa integracao de pagamento, nao altera indices existentes e nao reescreve dados legados. Transicoes repetidas de pagamento/cancelamento/estorno sao recusadas por estado com `409`, sem duplicar efeitos.

### Indicadores financeiros

- Calendario do Master: `America/Sao_Paulo`. Datas `YYYY-MM-DD` cobrem o dia inteiro nesse fuso; timestamps explicitos preservam o instante. Esse calendario nao altera o dia operacional das lojas. A preferencia global de timezone ainda nao governa os relatorios; sua conexao faz parte da etapa de preferencias.
- Recebido: faturas atualmente `paid`, filtradas e agrupadas por `paidAt`. Pagas sem data de pagamento nao sao estimadas. Faturas com estorno registrado nao compoem o recebido; nao e um extrato historico de caixa ou de devolucoes.
- Em aberto: `pending`, `overdue` ou `failed` com vencimento no periodo. Vencido e o subconjunto cujo `dueAt` ja passou, independentemente de um job ter persistido `overdue`. Falha futura nao e classificada como vencimento antecipado.
- Dashboard, serie diaria e relatorio mensal usam a mesma agregacao. `pendingRevenueCents` inclui todo o aberto do periodo, inclusive o vencido; `overdueRevenueCents` e seu subconjunto vencido.
- Lista de faturas expoe `effectiveStatus` para apresentacao financeira e preserva `status` original para elegibilidade/historico. Filtro `failed` consulta o estado original; demais filtros usam a classificacao financeira. Resumos usam todos os resultados filtrados, antes da paginacao.
- Filtro de datas da lista aceita `dateField=createdAt|paidAt|dueAt`; ausencia mantem `createdAt` por compatibilidade. CSV da tela e explicitamente da pagina exibida.
- MRR ainda usa o preco atual do plano. Condicoes contratadas/versionamento de preco e qualificacao do legado permanecem pendentes; nenhum valor historico foi inferido nesta entrega.

## Provider real

`BillingProvider` define o contrato para um adapter futuro. A escolha entre Stripe, Mercado Pago ou outro depende de pais, split, nota fiscal e conciliacao. Antes de ativar: verificar assinatura do webhook, persistir `eventId` unico, aplicar allowlist, responder idempotentemente e nunca armazenar cartao.

## Estados

Assinatura: `trial`, `active`, `past_due`, `suspended`, `cancelled`. Fatura: `pending`, `paid`, `failed`, `overdue`, `cancelled`, `refunded`, `chargeback`. Jobs de vencimento e grace period devem ser idempotentes e observaveis.
