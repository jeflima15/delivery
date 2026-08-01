# Billing da plataforma

Billing da plataforma e separado do pagamento dos pedidos da loja.

## Modelo

- `Plan`: preco em centavos, intervalo, trial, limites e features;
- `Subscription`: tenant, plano, periodo, status e provider;
- `Invoice`: valor, vencimento, pagamento e referencias;
- `WebhookEvent`: evento externo sanitizado e idempotente.

## Provider manual

O Master pode criar fatura e confirmar pagamento manual com motivo e referencia de comprovante. Acoes sao auditadas. O navegador nunca determina que uma fatura esta paga.

## Provider real

`BillingProvider` define o contrato para um adapter futuro. A escolha entre Stripe, Mercado Pago ou outro depende de pais, split, nota fiscal e conciliacao. Antes de ativar: verificar assinatura do webhook, persistir `eventId` unico, aplicar allowlist, responder idempotentemente e nunca armazenar cartao.

## Estados

Assinatura: `trial`, `active`, `past_due`, `suspended`, `cancelled`. Fatura: `pending`, `paid`, `failed`, `overdue`, `cancelled`, `refunded`, `chargeback`. Jobs de vencimento e grace period devem ser idempotentes e observaveis.
