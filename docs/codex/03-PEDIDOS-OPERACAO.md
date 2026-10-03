# Pedidos e operacao

## Responsabilidade

Cuidar da autenticacao do cliente, checkout, criacao autoritativa, acompanhamento, fila operacional, pagamentos manuais, caixa e historico. Detalhes de encomendas ficam em `docs/ENCOMENDAS.md`.

## Arquivos principais

- Cliente: `src/features/customer/`, `src/components/CheckoutModal.tsx`, `Orders.tsx`, `OrderTracking.tsx`.
- Admin: `src/components/AdminOrders.tsx`, `AdminDashboard.tsx`, `OrderDetailsModal.tsx`, `src/components/tenant-admin/OrderHistory.tsx`.
- API: `server/routes/customerAuth.ts`, `customer.ts`, `tenantOperations.ts`.
- Dominio: `server/services/orderService.ts`, `manualOrderService.ts`, `preorderService.ts`, `src/models/Order.ts`.
- Suporte: `server/models/IdempotencyRecord.ts`, `OrderSequence.ts`, `DailyOrderSequence.ts`, `StockMovement.ts`.

## Dependencias e contratos

- Sessao de cliente carrega `accountType`, `tenantId`, `accountId` e nivel de garantia; recursos sensiveis podem exigir senha confirmada.
- `createAuthoritativeOrder` valida produtos, opcoes, estoque, fidelidade, configuracao, frete e pagamento em transacao; valores persistidos usam centavos e snapshots.
- `Idempotency-Key` impede duplicidade. Historico privado filtra tenant e usuario; rastreio publico usa token opaco e DTO sem PII.
- Push e enfileirado apos o pedido; configuracao operacional esta em `docs/PUSH-E-HORARIOS.md`.

## Decisoes importantes

- Nunca aceitar totais, identidade do cliente, `tenantId`, estado de pagamento ou frete como autoridade do navegador.
- Mudancas de status, pagamento, caixa e reagendamento exigem permissao, CSRF, tenant e auditoria quando aplicavel.
- O pedido e salvo antes de integracoes auxiliares, como abertura opcional de WhatsApp.
- Enderecos salvos somente no navegador seguem como `deliveryAddress`; `addressId` so e enviado quando pertence aos enderecos da conta atual. O snapshot digitado acompanha a solicitacao como fallback caso o ID deixe de resolver, enquanto o servidor prefere o endereco valido da conta. A cotacao e o pedido continuam validando o endereco final no servidor.
- Sugestoes de endereco servem apenas para preencher o formulario. Elas nao confirmam localizacao, cobertura ou frete; a cotacao de entrega segue sendo a unica fonte para isso.
- Quando metodo, endereco e cotacao ja foram confirmados na sacola, o checkout inicia no pagamento e oferece alteracao da logistica na revisao. Encomendas e qualquer cotacao ausente, expirada ou invalidada continuam retornando obrigatoriamente para a etapa de entrega/data.
- A busca assistida preserva o numero digitado quando o provedor retorna somente o logradouro; todos os campos continuam editaveis e a cotacao autoritativa valida o endereco final.

## Verificacoes recomendadas

- Testar adulteracao de preco/opcao/frete, idempotencia, concorrencia de estoque e tentativa de acessar pedido de outra loja/conta.
- Validar que tracking e push nao vazam nome, telefone, endereco ou dados financeiros privados.
- Testes centrais: `tests/unit/security.test.ts`, `tests/integration/multiTenant.test.ts`, `shippingEstimates.test.ts` e E2E de checkout/encomendas.

## UX de compra e operacao (2026-10-03)

- Sacola orienta a proxima acao para endereco, cobertura, minimo ou incompatibilidade agora/encomenda; nao descarta itens para resolver conflitos. Desfazer remocao vale ate a proxima mudanca da sacola.
- Checkout mantem sua sessao durante edicao do item, mostra composicao/complementos/observacoes e revalida cupom, frete gratis e agenda. Pedido criado vai ao acompanhamento; WhatsApp e auxiliar.
- Em resposta incerta do pedido, corpo e Idempotency-Key ficam congelados para repetir a mesma tentativa. Edicao, fechamento e navegacao de etapas ficam bloqueados. O servidor permanece responsavel pela idempotencia.
- Aniversario e opcional no cadastro rapido; data fornecida continua validada, e isso nao eleva a sessao identificada para passwordVerified.
- Caixa usa formulario de contado separado do esperado. Campos nao sao preenchidos com o valor esperado; divergencia exige motivo. Usa APIs/permissoes existentes, sem nova contabilidade.
