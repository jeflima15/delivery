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

## Verificacoes recomendadas

- Testar adulteracao de preco/opcao/frete, idempotencia, concorrencia de estoque e tentativa de acessar pedido de outra loja/conta.
- Validar que tracking e push nao vazam nome, telefone, endereco ou dados financeiros privados.
- Testes centrais: `tests/unit/security.test.ts`, `tests/integration/multiTenant.test.ts`, `shippingEstimates.test.ts` e E2E de checkout/encomendas.
